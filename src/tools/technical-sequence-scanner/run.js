import { exportDelimitedTable } from "../../core/table.js";
import { normalizeTechnicalSequenceOptions } from "../../core/technical-sequence-options.js";
import { parseSequenceInput } from "../../core/fasta.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { iterateFastaFixedWindowSegments } from "../../core/fasta-fixed-window-segments.js";
import { motifMatchTableColumns, scanMotifRecordsWithContext } from "../../core/motif-scanner.js";
import { dnaRnaSymbolsOverlap as basesOverlap } from "../../core/pattern.js";
import { cleanSequence, complementDnaRnaSequence, makeSequenceContext } from "../../core/sequence.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";

export const technicalSequenceTableColumns = [
  ...motifMatchTableColumns,
  { id: "match_type", label: "Match type", type: "string" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "mismatch_positions", label: "Mismatch positions", type: "string" },
  { id: "identity_percent", label: "Identity percent", type: "number" }
];

export const TECHNICAL_SEQUENCE_SVG_MAX_RECORDS = 12;
export const TECHNICAL_SEQUENCE_SVG_MAX_TOTAL_HITS = 240;
export const TECHNICAL_SEQUENCE_SVG_MAX_HITS_PER_RECORD = 80;
const MAX_STREAMED_TECHNICAL_BASES = 50_000_000;
const MAX_STREAMED_TECHNICAL_FULL_WORK = 500_000_000;
const MAX_STREAMED_TECHNICAL_MISMATCH_WORK = 200_000_000;
const MAX_STREAMED_TECHNICAL_PARTIAL_WORK = 20_000_000;
const MAX_STREAMED_TECHNICAL_HITS = 50_000;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = 25 * 1024 * 1024;

let technicalSequenceDataPromise;

async function loadTechnicalSequenceData() {
  technicalSequenceDataPromise ??= Promise.all([
    import("../../reference-data/technical-sequences/sequences.json", { with: { type: "json" } }),
    import("../../reference-data/technical-sequences/provenance.json", { with: { type: "json" } })
  ]).then(([records, provenance]) => ({
    records: records.default,
    provenance: provenance.default
  }));
  return technicalSequenceDataPromise;
}

function getSelectedRecords(records, options = {}) {
  return records.filter((record) => {
    if (options.sequenceId && options.sequenceId !== "all" && record.id !== options.sequenceId) {
      return false;
    }
    if (options.sequenceClass && options.sequenceClass !== "all" && record.class !== options.sequenceClass) {
      return false;
    }
    return true;
  });
}

function parseCustomSequences(value = "") {
  const text = String(value ?? "").trim();
  if (!text) {
    return [];
  }
  const parsed = text.includes(">")
    ? parseSequenceInput(text, "dna-rna", { strictHeaders: true }).map((record, index) => ({
        name: record.title || `Custom technical sequence ${index + 1}`,
        sequence: record.sequence
      }))
    : text
      .split(/[,\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((sequence, index) => ({
        name: `Custom technical sequence ${index + 1}`,
        sequence
      }));

  if (parsed.length > 1000) throw new Error("Technical-sequence selection exceeds the fixed 1,000-pattern limit.");
  return parsed
    .filter(Boolean)
    .map((entry, index) => {
      const cleaned = cleanSequence(entry.sequence, {
        alphabet: "dna-rna",
        preserveCase: false,
        keepGaps: false
      });
      const warnings = [];
      const gapCount = (entry.sequence.match(/[-.]/g) ?? []).length;
      const notes = gapCount ? [`Custom technical sequence ${index + 1}: removed ${gapCount} alignment gap character(s).`] : [];
      if (cleaned.removedCount > gapCount) {
        warnings.push(`Custom technical sequence ${index + 1}: removed ${cleaned.removedCount - gapCount} non-DNA/RNA character(s).`);
      }
      if (cleaned.sequence.length === 0) {
        warnings.push(`Custom technical sequence ${index + 1}: no DNA/RNA sequence characters were found.`);
      }
      return {
        record: {
          id: `custom-technical-sequence-${index + 1}`,
          name: entry.name,
          alphabet: "dna-rna",
          class: "custom",
          syntax: "iupac",
          pattern: cleaned.sequence,
          source: {
            name: "User supplied",
            version: "current run",
            accessDate: "",
            url: "",
            citation: "",
            license: "User supplied sequence."
          },
          description: "User-supplied custom technical sequence.",
          scope: "Current run only.",
          match: {
            strand: "both",
            coordinateSystem: "1-based inclusive",
            overlappingDefault: true,
            score: "not-applicable",
            assumptions: "IUPAC full-sequence match against cleaned DNA/RNA sequence."
          }
        },
        warnings, notes
      };
    })
    .filter((item) => item.record.pattern.length > 0 || item.warnings.length > 0);
}

function formatScore(value) {
  return value === null || value === undefined ? "" : String(value);
}

function formatPercent(value) {
  return value === null || value === undefined ? "" : Number(value).toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}

function countBy(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field] || "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

function formatCounts(counts) {
  return counts.length === 0 ? "none" : counts.map(([label, count]) => `${label}: ${count}`).join("; ");
}

function summarizeLongestHits(rows) {
  const byRecord = new Map();
  for (const row of rows) {
    const current = byRecord.get(row.record_index);
    if (
      !current ||
      row.length > current.length ||
      (row.length === current.length && row.match_type.localeCompare(current.match_type) < 0)
    ) {
      byRecord.set(row.record_index, row);
    }
  }
  return [...byRecord.values()].sort((left, right) => left.record_index - right.record_index);
}

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function patternMatches(sequence, pattern, syntax) {
  for (let index = 0; index < pattern.length; index += 1) {
    if (syntax === "iupac") {
      if (!basesOverlap(sequence[index], pattern[index])) return false;
    } else if (sequence[index].replace("U", "T") !== pattern[index].replace("U", "T")) {
      return false;
    }
  }
  return true;
}

function makePartialRow(recordTitle, motif, details) {
  return {
    record: recordTitle,
    motif_id: motif.id,
    motif_name: motif.name,
    motif_class: motif.class,
    source: motif.source?.name ?? "",
    syntax: motif.syntax,
    strand: details.strand,
    start: details.start,
    end: details.end,
    length: details.length,
    matched_text: details.matchedText,
    score: null,
    description: motif.description,
    match_type: details.matchType,
    mismatches: 0,
    mismatch_positions: "",
    identity_percent: 100
  };
}

function countPatternMismatches(windowSequence, pattern, exactThreePrimeBases = 0) {
  const mismatchPositions = [];
  let exactTailMismatch = false;
  const exactTailStart = pattern.length - exactThreePrimeBases + 1;
  for (let index = 0; index < pattern.length; index += 1) {
    if (!basesOverlap(windowSequence[index], pattern[index])) {
      const position = index + 1;
      mismatchPositions.push(position);
      if (exactThreePrimeBases > 0 && position >= exactTailStart) {
        exactTailMismatch = true;
      }
    }
  }
  return { mismatchPositions, exactTailMismatch };
}

function makeMismatchRow(recordTitle, motif, details) {
  const mismatches = details.mismatchPositions.length;
  return {
    record: recordTitle,
    motif_id: motif.id,
    motif_name: motif.name,
    motif_class: motif.class,
    source: motif.source?.name ?? "",
    syntax: motif.syntax,
    strand: details.strand,
    start: details.start,
    end: details.end,
    length: details.length,
    matched_text: details.matchedText,
    score: ((details.length - mismatches) / details.length) * 100,
    description: motif.description,
    match_type: "mismatch_tolerant_full",
    mismatches,
    mismatch_positions: details.mismatchPositions.join(","),
    identity_percent: ((details.length - mismatches) / details.length) * 100
  };
}

async function scanMismatchTolerantForward(recordTitle, sequence, motif, options = {}, context = {}) {
  const pattern = String(motif.pattern ?? "").toUpperCase().replaceAll("U", "T");
  const maxMismatches = options.maxMismatches;
  const exactThreePrimeBases = options.requireExactThreePrime
    ? Math.max(1, Math.min(pattern.length, options.exactThreePrimeBases))
    : 0;
  const allowOverlaps = options.allowOverlaps !== false;
  const rows = [];
  let matchedCharacters = 0;
  if (pattern.length === 0 || sequence.length < pattern.length) {
    return rows;
  }
  for (let offset = 0; offset <= sequence.length - pattern.length; offset += 1) {
    if (offset % Math.max(1, Math.floor(32768 / pattern.length)) === 0) {
      await context.yieldIfNeeded?.();
    }
    const matchedText = sequence.slice(offset, offset + pattern.length);
    const mismatch = countPatternMismatches(matchedText, pattern, exactThreePrimeBases);
    if (!mismatch.exactTailMismatch && mismatch.mismatchPositions.length <= maxMismatches) {
      rows.push(makeMismatchRow(recordTitle, motif, {
        strand: "+",
        start: offset + 1,
        end: offset + pattern.length,
        length: pattern.length,
        matchedText,
        mismatchPositions: mismatch.mismatchPositions
      }));
      matchedCharacters += matchedText.length;
      if (Number.isFinite(options.maxMatchedCharacters) && matchedCharacters > options.maxMatchedCharacters) throw new Error("Technical-sequence matched text exceeds the character retention limit.");
      if (Number.isFinite(options.maxMatches) && rows.length > options.maxMatches) {
        throw new Error(`Technical-sequence matches exceed the ${options.maxMatches.toLocaleString()}-hit scan limit.`);
      }
      if (!allowOverlaps) {
        offset += pattern.length - 1;
      }
    }
  }
  return rows;
}

async function scanMismatchTolerantForSequence(recordTitle, sequence, motif, options = {}, context = {}) {
  const rows = await scanMismatchTolerantForward(recordTitle, sequence, motif, options, context);
  if ((options.strand ?? "both") !== "both") {
    return rows;
  }
  const reverseSequence = reverseComplement(sequence);
  const reverseRows = await scanMismatchTolerantForward(recordTitle, reverseSequence, motif, {
    ...options,
    strand: "forward"
  }, context);
  for (const row of reverseRows) {
    rows.push({
      ...row,
      strand: "-",
      start: sequence.length - row.end + 1,
      end: sequence.length - row.start + 1,
      matched_text: reverseComplement(row.matched_text)
    });
  }
  return rows;
}

async function scanPartialEndsForSequence(recordTitle, sequence, motif, options, context = {}) {
  const minLength = Math.max(1, options.minimumPartialLength);
  const rows = [];
  if (motif.pattern.length < minLength || sequence.length < minLength) {
    return rows;
  }

  const maxLength = Math.min(motif.pattern.length - 1, sequence.length);
  let partialComparisons = 0;
  let foundFivePrime = false;
  let foundThreePrime = false;
  for (let length = maxLength; length >= minLength; length -= 1) {
    partialComparisons += length * 2;
    if (partialComparisons >= 32768) { await context.yieldIfNeeded?.(); partialComparisons = 0; }
    const motifPrefix = motif.pattern.slice(0, length);
    const motifSuffix = motif.pattern.slice(motif.pattern.length - length);
    const sequencePrefix = sequence.slice(0, length);
    const sequenceSuffix = sequence.slice(sequence.length - length);

    if (!foundFivePrime && patternMatches(sequencePrefix, motifSuffix, motif.syntax)) {
      rows.push(
        makePartialRow(recordTitle, motif, {
          strand: "+",
          start: 1,
          end: length,
          length,
          matchedText: sequencePrefix,
          matchType: "5_prime_partial"
        })
      );
      foundFivePrime = true;
    }

    if (!foundThreePrime && patternMatches(sequenceSuffix, motifPrefix, motif.syntax)) {
      rows.push(
        makePartialRow(recordTitle, motif, {
          strand: "+",
          start: sequence.length - length + 1,
          end: sequence.length,
          length,
          matchedText: sequenceSuffix,
          matchType: "3_prime_partial"
        })
      );
      foundThreePrime = true;
    }
    if (foundFivePrime && foundThreePrime) break;
  }

  if ((options.strand ?? "both") === "both") {
    const reverseSequence = reverseComplement(sequence);
    const reverseRows = await scanPartialEndsForSequence(recordTitle, reverseSequence, motif, {
      ...options,
      strand: "forward"
    }, context);
    for (const row of reverseRows) {
      rows.push({
        ...row,
        strand: "-",
        start: sequence.length - row.end + 1,
        end: sequence.length - row.start + 1
      });
    }
  }

  return rows;
}

async function scanTechnicalRecord(record, selectedRecords, options = {}, context = {}) {
  const cleaned = cleanSequence(record.sequence ?? "", {
    alphabet: "dna-rna",
    preserveCase: false,
    keepGaps: false
  });
  const title = record.title ?? "sequence";
  const warnings = [];
  if (cleaned.removedCount > 0) {
    warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
  }
  if (cleaned.sequence.length === 0) {
    warnings.push(`${title}: no DNA/RNA sequence characters were found.`);
    return {
      rows: [],
      warnings,
      charactersRemoved: cleaned.removedCount,
      sequenceLength: 0,
      title,
      sequence: ""
    };
  }

  const matchMode = options.matchMode ?? "full";
  const fullRows =
    matchMode === "partial-ends" || matchMode === "mismatch-tolerant"
      ? []
      : (await scanMotifRecordsWithContext(record, selectedRecords, {
          alphabet: "dna-rna",
          strand: options.strand ?? "both",
          allowOverlaps: options.allowOverlaps !== false,
          maxMatches: options.maxMatches,
          maxMatchedCharacters: options.maxMatchedCharacters,
          failOnLimit: options.failOnLimit
        }, context)).rows.map((row) => ({
          ...row,
          match_type: "full",
          mismatches: 0,
          mismatch_positions: "",
          identity_percent: 100
        }));
  const mismatchRows = [];
  const partialRows = [];
  let retainedMatchCharacters = 0;
  for (const motif of selectedRecords) {
    if (matchMode === "mismatch-tolerant") for (const row of await scanMismatchTolerantForSequence(title, cleaned.sequence, motif, options, context)) { mismatchRows.push(row); retainedMatchCharacters += row.matched_text.length; }
    if (["partial-ends", "full-or-partial"].includes(matchMode)) partialRows.push(...await scanPartialEndsForSequence(title, cleaned.sequence, motif, options, context));
    if (Number.isFinite(options.maxMatchedCharacters) && retainedMatchCharacters > options.maxMatchedCharacters) throw new Error("Technical-sequence matched text exceeds the character retention limit.");
    if (Number.isFinite(options.maxMatches) && fullRows.length + mismatchRows.length + partialRows.length > options.maxMatches) throw new Error("Technical-sequence scan exceeds the candidate-hit limit.");
  }

  const seen = new Set();
  const rows = [...fullRows, ...mismatchRows, ...partialRows].filter((row) => {
    const key = [
      row.record,
      row.motif_id,
      row.strand,
      row.start,
      row.end,
      row.matched_text,
      row.match_type
    ].join("\t");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).map((row) => ({
    ...row,
    ...makeSequenceContext(cleaned.sequence, row.start, row.end)
  }));
  rows.sort((left, right) =>
    left.start - right.start ||
    left.end - right.end ||
    left.strand.localeCompare(right.strand) ||
    left.match_type.localeCompare(right.match_type) ||
    left.motif_id.localeCompare(right.motif_id)
  );

  return {
    rows,
    warnings,
    charactersRemoved: cleaned.removedCount,
    sequenceLength: cleaned.sequence.length,
    title,
    sequence: cleaned.sequence
  };
}

function makeTextMap(scannedRecords) {
  return scannedRecords.map((record, recordIndex) => {
    const items = record.rows.map((row, index) => ({ ...row, label: `t${index + 1}` }));
    return renderTextAnnotationMapFromItems([{
      title: `Record ${recordIndex + 1}: ${record.title}`,
      sequence: record.sequence,
      items
    }], { width: 60, alphabet: "dna-rna", showSecondStrand: true, headerPrefix: "" })
      + (items.length ? "\n\nTechnical sequence labels:\n" + items.map(row => `${row.label}\t${row.start}-${row.end} (${row.strand})\t${row.motif_name}\t${row.motif_id}\t${row.match_type}`).join("\n") : "");
  }).join("\n\n");
}

function mapMatchTypeLabel(matchType) {
  switch (matchType) {
    case "full": return "Full sequence match";
    case "mismatch_tolerant_full": return "Full sequence match with mismatch tolerance";
    case "5_prime_partial": return "5′ end partial match";
    case "3_prime_partial": return "3′ end partial match";
    default: return String(matchType ?? "match").replaceAll("_", " ");
  }
}

function makeMapInspectionText(row, index, recordTitle) {
  const featureClass = String(row.motif_class ?? "technical sequence")
    .replaceAll("-", " ")
    .replace(/\brna\b/giu, "RNA")
    .replace(/\bdna\b/giu, "DNA");
  return [
    `${row.motif_name} (t${index + 1})`,
    `Class: ${featureClass}`,
    `Match type: ${mapMatchTypeLabel(row.match_type)}`,
    `Coordinates: ${row.start.toLocaleString()}–${row.end.toLocaleString()}`,
    `Strand: ${row.strand === "-" ? "reverse (−)" : "forward (+)"}`,
    row.match_type === "mismatch_tolerant_full" ? `Mismatches: ${row.mismatches}` : "",
    row.match_type === "mismatch_tolerant_full" ? `Identity: ${formatPercent(row.identity_percent)}%` : "",
    row.matched_text ? `Matched bases — ${row.matched_text}` : "",
    `Input: ${recordTitle}`
  ].filter(Boolean).join("; ");
}

function summarizeSvgRecords(scannedRecords, warnings) {
  const drawableRecords = scannedRecords.slice(0, TECHNICAL_SEQUENCE_SVG_MAX_RECORDS);
  const omittedRecords = Math.max(0, scannedRecords.length - drawableRecords.length);
  const totalHits = scannedRecords.reduce((sum, record) => sum + record.rows.length, 0);
  const shownCounts = drawableRecords.map(() => 0);
  let remaining = TECHNICAL_SEQUENCE_SVG_MAX_TOTAL_HITS;
  for (let round = 0; round < TECHNICAL_SEQUENCE_SVG_MAX_HITS_PER_RECORD && remaining > 0; round += 1) {
    for (let index = 0; index < drawableRecords.length && remaining > 0; index += 1) {
      if (shownCounts[index] < drawableRecords[index].rows.length) { shownCounts[index] += 1; remaining -= 1; }
    }
  }
  const shown = shownCounts.reduce((sum, count) => sum + count, 0);
  if (shown < totalHits || omittedRecords) warnings.push(`Linear technical-sequence map shows ${shown} of ${totalHits} hits across ${drawableRecords.length} of ${scannedRecords.length} records. Select Summary table for all hit coordinates.`);
  return {
    omittedRecords,
    totalHits,
    records: drawableRecords.map((record, index) => {
      const shownLimit = shownCounts[index];
      const shownRows = record.rows.slice(0, shownLimit);
      const omitted = Math.max(0, record.rows.length - shownRows.length);
      return {
        title: record.title,
        length: record.sequenceLength ?? record.sequence.length,
        molecule: "dna",
        features: shownRows.map((row, index) => ({
          start: row.start,
          end: row.end,
          strand: row.strand,
          className: row.match_type === "mismatch_tolerant_full" ? "variant" : row.match_type === "full" ? "regulatory" : "other",
          label: `t${index + 1}`,
          showLabel: true,
          inspectionText: makeMapInspectionText(row, index, record.title)
        })),
        notes: [
          `Technical sequence hits: ${record.rows.length}; shown: ${shownRows.length}; omitted: ${omitted}.`,
          ...(omittedRecords > 0 ? [`${omittedRecords} additional record(s) not drawn; see table output.`] : [])
        ]
      };
    })
  };
}

function makeSvgMap(scannedRecords, warnings) {
  const summary = summarizeSvgRecords(scannedRecords, warnings);
  if (summary.totalHits === 0) {
    return renderSequenceMap({
      title: "Technical sequence map",
      records: scannedRecords.slice(0, TECHNICAL_SEQUENCE_SVG_MAX_RECORDS).map((record) => ({
        title: record.title,
        length: record.sequenceLength ?? record.sequence.length,
        molecule: "dna",
        features: [],
        notes: ["No technical sequence hits found."]
      }))
    });
  }
  return renderSequenceMap({
    title: "Technical sequence map",
    records: summary.records,
    styles: {
      regulatory: { label: "Full match", fill: "#2563eb", stroke: "#1d4ed8" },
      other: { label: "Partial-end match", fill: "#0891b2", stroke: "#0e7490" },
      variant: { label: "Mismatch-tolerant", fill: "#d97706", stroke: "#b45309" },
      source: { label: "Source", fill: "#94a3b8", stroke: "#64748b" }
    }
  });
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function makeTechnicalSequenceViewerData(scannedRecords, options = {}) {
  const layout = options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear";
  return makeDnaViewerData(scannedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.sequence.length,
    topology: layout,
    tracks: record.rows.length > 0
      ? [
          {
            id: "technical-sequence-hits",
            type: "features",
            label: "Technical sequence hits",
            layout: "stacked-intervals",
            featureOpacity: 0.72,
            items: record.rows.map((row) => ({
              start: row.start,
              end: row.end,
              length: row.length,
              strand: row.strand,
              label: row.motif_name,
              name: row.motif_name,
              type: row.match_type,
              motifId: row.motif_id,
              motifClass: row.motif_class,
              matchType: row.match_type,
              mismatches: row.mismatches,
              mismatchPositions: row.mismatch_positions,
              identityPercent: row.identity_percent,
              source: row.source,
              matchedText: row.matched_text
            }))
          }
        ]
      : []
  })), {
    title: "Technical sequence viewer",
    layout
  });
}

function makeTsv(rows) {
  return exportDelimitedTable(technicalSequenceTableColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

function makeReport({ rows, selectedRecords, recordsProcessed, basesProcessed, provenance, options }) {
  const lines = [
    "Technical sequence scanner",
    `Technical sequences scanned: ${selectedRecords.length}`,
    `Sequences scanned: ${recordsProcessed}`,
    `Bases scanned: ${basesProcessed}`,
    `Matches found: ${rows.length}`,
    options.sequenceClass === "custom" ? "Reference: user-supplied technical sequences" : `Database: ${provenance.dataset} ${provenance.version}`,
    ...(options.sequenceClass === "custom" ? [] : [`Database note: ${provenance.description}`]),
    ""
  ];

  if (selectedRecords.length > 0) {
    lines.push("Selected technical sequences:");
    for (const record of selectedRecords) {
      const source = `${record.source?.name ?? ""} ${record.source?.version ?? ""}`.trim();
      lines.push(`- ${record.name} (${record.id}; ${record.class}; ${source})`);
    }
    lines.push("");
  }

  if (rows.length === 0) {
    lines.push("No technical sequence matches found.");
    return lines.join("\n");
  }

  lines.push("Match summary:");
  lines.push(`- By match type: ${formatCounts(countBy(rows, "match_type"))}`);
  lines.push(`- By class: ${formatCounts(countBy(rows, "motif_class"))}`);
  if (rows.some((row) => Number(row.mismatches) > 0)) {
    lines.push(`- Mismatch-tolerant hits: ${rows.filter((row) => Number(row.mismatches) > 0).length}`);
  }
  lines.push("");

  const longestHits = summarizeLongestHits(rows);
  if (longestHits.length > 0) {
    lines.push("Longest hit by input record:");
    for (const row of longestHits) {
      lines.push(
        `- ${row.record}: ${row.motif_name}; ${row.length} bases; ${row.match_type}; ${row.strand}:${row.start}-${row.end}; record ${row.record_index}`
      );
    }
    lines.push("");
  }

  lines.push("record\trecord_number\ttechnical_sequence\tclass\tstrand\tstart\tend\tmatch_type\tmismatches\tmatched_text\tcontext_sequence");
  for (const row of rows) {
    lines.push(
      [
        row.record,
        row.record_index,
        row.motif_name,
        row.motif_class,
        row.strand,
        row.start,
        row.end,
        row.match_type,
        row.mismatches ?? "",
        row.matched_text,
        row.context_sequence
      ].join("\t")
    );
  }

  return lines.join("\n");
}

async function runStreamedTechnicalSequenceScanner(input, options, context, technicalSequences, provenance) {
  const maxCandidateHits = effectiveToolLimit(options, "technicalCandidateHitLimit", MAX_STREAMED_TECHNICAL_HITS);
  const maxOutputCharacters = effectiveToolLimit(options, "technicalOutputLimit", MAX_MATERIALIZED_OUTPUT_CHARACTERS);
  const outputFormat = options.outputFormat ?? "svg-map";
  const richOutput = !["report", "tsv", "svg-map"].includes(outputFormat);
  if (richOutput && (options.loadedFastaFile?.stream || ["indexed", "bgzf"].includes(options.sourceMode) || String(input ?? "").length > 1_000_000)) throw new Error("Large FASTA technical scans support report, table, and linear map output. Text maps and sequence viewers require bounded pasted input.");
  const usesCustomSequences = options.sequenceClass === "custom";
  const custom = usesCustomSequences ? parseCustomSequences(options.customSequences ?? "") : [];
  const selectedRecords = usesCustomSequences ? custom.map((item) => item.record).filter((record) => record.pattern.length > 0) : getSelectedRecords(technicalSequences, options);
  const warnings = custom.flatMap((item) => item.warnings);
  const notes = custom.flatMap(item => item.notes ?? []);
  notes.push(usesCustomSequences ? `Reference: user-supplied technical sequences; searched ${selectedRecords.length}.` : `Reference: ${provenance.dataset}, ${provenance.version}; searched ${selectedRecords.length} of ${technicalSequences.length}.`);
  if (!selectedRecords.length) warnings.push(usesCustomSequences ? "No custom technical sequences were provided." : "No bundled technical sequences matched the selected filters.");
  if (selectedRecords.length > 1000) throw new Error("Technical-sequence selection exceeds the fixed 1,000-pattern limit.");
  if (["partial-ends", "full-or-partial"].includes(options.matchMode) && options.minimumPartialLength < 8) warnings.push("Minimum partial match length is short; expect many low-specificity matches.");
  const shortestSelected = Math.min(...selectedRecords.map(record => record.pattern.length), Infinity);
  if (options.matchMode === "mismatch-tolerant" && options.maxMismatches > 0 && (shortestSelected <= 12 || options.maxMismatches / shortestSelected >= 0.2)) warnings.push("Mismatch-tolerant matching can produce low-specificity FASTA hits for short technical sequences or high mismatch fractions.");
  const maxWidth = Math.max(1, ...selectedRecords.map((record) => record.pattern.length));
  const edgeLength = maxWidth + 20;
  if (maxWidth > 32_000) throw new Error("Selected technical sequence exceeds the 32,000-base large-source pattern limit.");
  const mode = options.matchMode ?? "full";
  const scanFull = mode === "full" || mode === "full-or-partial";
  const scanMismatch = mode === "mismatch-tolerant";
  const scanPartial = mode === "partial-ends" || mode === "full-or-partial";
  const fullWorkLimit = effectiveToolLimit(options, "technicalComparisonLimits", scanMismatch ? MAX_STREAMED_TECHNICAL_MISMATCH_WORK : MAX_STREAMED_TECHNICAL_FULL_WORK);
  const partialWorkLimit = effectiveToolLimit(options, "technicalComparisonLimits", MAX_STREAMED_TECHNICAL_PARTIAL_WORK);
  const partialWorkPerRecord = scanPartial ? selectedRecords.reduce((sum, record) => sum + 2 * record.pattern.length * Math.max(0, record.pattern.length - 1) * (options.strand === "forward" ? 1 : 2), 0) : 0;
  const workPerBase = (scanFull || scanMismatch) ? selectedRecords.reduce((sum, record) => sum + record.pattern.length * (options.strand === "forward" ? 1 : 2), 0) : 0;
  const sourceOptions = applyDisabledFastaSourceLimits({ ...options, sourceChunkSize: Math.min(65536, Number(options.sourceChunkSize) || 65536), maxSourceBases: Math.min(MAX_STREAMED_TECHNICAL_BASES, Number(options.maxSourceBases) || MAX_STREAMED_TECHNICAL_BASES) }, {
    maxSourceBases: "technicalLargeSourceLimitNote",
    maxSourceRecords: "technicalLargeSourceLimitNote",
    maxDecodedSourceBytes: "technicalLargeSourceLimitNote",
    maxSourceBytes: "technicalLargeSourceLimitNote"
  });
  let sourceGapCount = 0;
  const opened = await openCleanDnaRnaFastaSource(input, { ...sourceOptions, strictHeaders: true, onSourceChunk: text => { sourceGapCount += (text.match(/[-.]/g) ?? []).length; } }, context);
  const executionOptions = {
    sourceMode: opened.sourceMode,
    limits: Object.fromEntries(Object.entries({ ...opened.source.limits, scanWork: fullWorkLimit, terminalWork: partialWorkLimit, candidateHits: maxCandidateHits, outputCharacters: maxOutputCharacters }).map(([key, value]) => [key, value === Infinity ? "disabled" : value]))
  };
  const scannedRecords = [];
  let current = null;
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let candidateHits = 0;
  let retainedRowCharacters = 0;
  let work = 0;
  let partialWork = 0;
  async function* sourceEvents() {
    for await (const event of opened.events()) {
      if (event.type === "sequence-chunk" && current) {
        if (richOutput) current.sequence += event.text;
        current.prefix = (current.prefix + event.text).slice(0, edgeLength);
        current.suffix = (current.suffix + event.text).slice(-edgeLength);
      }
      yield event;
    }
  }
  for await (const event of iterateFastaFixedWindowSegments(sourceEvents(), { maxWindowLength: maxWidth + 20 })) {
    if (event.type === "record-start") {
      sourceGapCount = 0;
      current = { title: event.title ?? "sequence", sequence: "", sequenceLength: 0, rows: [], prefix: "", suffix: "" };
      continue;
    }
    if (event.type === "scan-segment") {
      context.reportProgress?.({ phase: "scanning", recordsProcessed: scannedRecords.length, basesProcessed: basesProcessed + event.ownedEnd0 });
      work += event.text.length * workPerBase;
      if (work > fullWorkLimit) throw new Error(`Technical-sequence scan exceeds the ${fullWorkLimit.toLocaleString()}-symbol ${scanMismatch ? "mismatch" : "full-match"} comparison budget. Choose fewer technical sequences or fewer input records.`);
      if (scanFull || scanMismatch) {
        const result = await scanTechnicalRecord({ title: current.title, sequence: event.text }, selectedRecords, { ...options, allowOverlaps: true, matchMode: scanMismatch ? "mismatch-tolerant" : "full", maxMatches: maxCandidateHits, maxMatchedCharacters: maxOutputCharacters, failOnLimit: true }, context);
        for (const row of result.rows) {
          const start0 = event.segmentStart0 + row.start - 1;
          if (start0 < event.ownedStart0 || start0 >= event.ownedEnd0) continue;
          const retained = { ...row, start: start0 + 1, end: event.segmentStart0 + row.end };
          retainedRowCharacters += JSON.stringify(retained).length;
          if (retainedRowCharacters > maxOutputCharacters) throw new Error("Technical-sequence hit table exceeds the materialized-output limit.");
          current.rows.push(retained);
          candidateHits += 1;
          if (candidateHits > maxCandidateHits) throw new Error(`Technical-sequence scan exceeds the ${maxCandidateHits.toLocaleString()}-candidate-hit limit. Narrow the selected sequences or use stricter matching.`);
        }
      }
      await context.yieldIfNeeded?.();
      continue;
    }
    if (event.type === "record-end" && current) {
      current.sequenceLength = event.length;
      basesProcessed += event.length;
      charactersRemoved += event.removedCount;
      if (sourceGapCount) notes.push(`Record ${scannedRecords.length + 1} (${current.title}): removed ${sourceGapCount} alignment gap character(s); coordinates refer to the cleaned sequence.`);
      if (event.removedCount > sourceGapCount) warnings.push(`${current.title}: removed ${event.removedCount - sourceGapCount} non-DNA/RNA character(s).`);
      if (!event.length) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      if (scanPartial) {
        partialWork += partialWorkPerRecord;
        if (partialWork > partialWorkLimit) throw new Error(`Technical-sequence scan exceeds the ${partialWorkLimit.toLocaleString()}-symbol terminal-comparison budget. Choose fewer technical sequences or records.`);
        for (const motif of selectedRecords) {
          const partialOptions = { ...options, minimumPartialLength: options.minimumPartialLength ?? 12 };
          const prefixRows = (await scanPartialEndsForSequence(current.title, current.prefix, motif, partialOptions, context)).filter((row) => row.start === 1);
          const suffixRows = (await scanPartialEndsForSequence(current.title, current.suffix, motif, partialOptions, context)).filter((row) => row.end === current.suffix.length).map((row) => ({ ...row, start: event.length - current.suffix.length + row.start, end: event.length - current.suffix.length + row.end }));
          for (const strand of ["+", "-"]) for (const matchType of ["5_prime_partial", "3_prime_partial"]) {
            if (strand === "-" && options.strand === "forward") continue;
            const candidates = [...prefixRows, ...suffixRows].filter((row) => row.strand === strand && row.match_type === matchType);
            candidates.sort((a, b) => b.length - a.length || (strand === "+" ? a.start - b.start : b.start - a.start));
            if (!candidates.length) continue;
            const chosen = candidates[0];
            const contextSequence = chosen.start === 1 ? current.prefix : current.suffix;
            const localStart = chosen.start === 1 ? chosen.start : chosen.start - (event.length - current.suffix.length);
            const localEnd = chosen.start === 1 ? chosen.end : chosen.end - (event.length - current.suffix.length);
            const retained = { ...chosen, ...makeSequenceContext(contextSequence, localStart, localEnd) };
            retainedRowCharacters += JSON.stringify(retained).length;
            if (retainedRowCharacters > maxOutputCharacters) throw new Error("Technical-sequence hit table exceeds the materialized-output limit.");
            current.rows.push(retained);
            candidateHits += 1;
            if (candidateHits > maxCandidateHits) throw new Error(`Technical-sequence scan exceeds the ${maxCandidateHits.toLocaleString()}-candidate-hit limit.`);
          }
        }
      }
      if (options.allowOverlaps === false && (scanFull || scanMismatch)) {
        const groups = new Map();
        for (const row of current.rows) {
          if (row.match_type.includes("partial")) continue;
          const key = `${row.motif_id}\t${row.strand}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(row);
        }
        const selected = current.rows.filter((row) => row.match_type.includes("partial"));
        for (const group of groups.values()) {
          const reverse = group[0].strand === "-";
          group.sort((a, b) => reverse ? b.start - a.start : a.start - b.start);
          let edge = reverse ? event.length + 1 : 0;
          for (const row of group) if (reverse ? row.end < edge : row.start > edge) { selected.push(row); edge = reverse ? row.start : row.end; }
        }
        current.rows = selected;
      }
      if (current.rows.some(row => /[RYSWKMBDHVNX]/.test(row.matched_text))) warnings.push(`Record ${scannedRecords.length + 1} (${current.title}): hits include ambiguous bases; compatible matches do not establish resolved-base identity.`);
      for (const row of current.rows) row.record_index = scannedRecords.length + 1;
      current.rows.sort((a, b) => a.start - b.start || a.end - b.end || a.strand.localeCompare(b.strand) || a.match_type.localeCompare(b.match_type) || a.motif_id.localeCompare(b.motif_id));
      delete current.prefix;
      delete current.suffix;
      scannedRecords.push(current);
      current = null;
      context.reportProgress?.({ phase: "scanning", recordsProcessed: scannedRecords.length, progress: Math.min(0.95, 0.05 + basesProcessed / MAX_STREAMED_TECHNICAL_BASES * 0.9) });
    }
  }
  warnings.push(...opened.warnings);
  if (!scannedRecords.length) return makeToolResult({ optionsUsed: executionOptions, output: "", warnings: ["No DNA/RNA sequence input was provided.", ...warnings], recordsProcessed: 0, basesProcessed: 0, charactersRemoved: 0, streams: options.outputFormat === "tsv" ? { table: makeTableStream(technicalSequenceTableColumns, [], "technical-sequence-scanner") } : {} });
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  const result = makeTechnicalResult({ scannedRecords, options, warnings, notes, basesProcessed, charactersRemoved, selectedRecords, provenance });
  context.throwIfCancelled?.();
  if (result.output.length > maxOutputCharacters || JSON.stringify(result).length > maxOutputCharacters) throw new Error("Technical-sequence output exceeds the materialized-output limit.");
  return { ...result, optionsUsed: executionOptions };
}

async function runTechnicalSequenceScannerInternal(input, options, context) {
  context.reportProgress?.({ phase: "loading-reference-data", progress: 0.05 });
  const { records: technicalSequences, provenance } = await loadTechnicalSequenceData();
  context.throwIfCancelled?.();
  if (String(options.customSequences).length > 1_000_000) throw new Error("Custom technical sequences exceed the fixed 1,000,000-character limit.");
  return runStreamedTechnicalSequenceScanner(input, options, context, technicalSequences, provenance);
}

function makeTechnicalResult({ scannedRecords, options, warnings, notes, basesProcessed, charactersRemoved, selectedRecords, provenance }) {
  const outputFormat = options.outputFormat;
  const rows = scannedRecords.flatMap(record => record.rows);
  const report = outputFormat === "report" ? makeReport({
    rows,
    selectedRecords,
    recordsProcessed: scannedRecords.length,
    basesProcessed,
    provenance, options
  }) : "";
  const tsv = outputFormat === "tsv" ? makeTsv(rows) : "";

  const textMap = outputFormat === "text-map" ? makeTextMap(scannedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(scannedRecords, warnings) : "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makeTechnicalSequenceViewerData(scannedRecords, { outputFormat }) : null;
  const output = outputFormat === "tsv"
    ? tsv
    : outputFormat === "text-map"
      ? textMap
      : outputFormat === "svg-map"
        ? svgMap
        : viewer
          ? JSON.stringify(viewer, null, 2)
          : report;

  return makeToolResult({
    output,
    sequenceSearch: outputFormat === "text-map"
      ? { format: "labelled-blocks", alphabet: "dna-rna", plainMapHeadings: true }
      : undefined,
    download: {
      filename: `technical-sequence-scanner.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
      mimeType: outputFormat === "tsv" ? "text/tab-separated-values" : outputFormat === "svg-map" ? "image/svg+xml;charset=utf-8" : viewer ? "application/json;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings, notes,
    recordsProcessed: scannedRecords.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", alphabet: "dna-rna", plainMapHeadings: true }) } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      ...(outputFormat === "tsv" ? { table: makeTableStream(technicalSequenceTableColumns, rows, "technical-sequence-scanner") } : {})
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : viewer
        ? { viewer }
        : undefined
  });
}

export async function runTechnicalSequenceScanner(input, options = {}, context = {}) {
  const optionsUsed = normalizeTechnicalSequenceOptions(options);
  let lastYield = performance.now();
  const pacedContext = { ...context, yieldIfNeeded: async () => {
    context.throwIfCancelled?.();
    if (performance.now() - lastYield >= 8) { await context.yieldIfNeeded?.(); lastYield = performance.now(); }
    context.throwIfCancelled?.();
  } };
  const result = await runTechnicalSequenceScannerInternal(input, { ...options, ...optionsUsed }, pacedContext);
  return { ...result, optionsUsed: { ...optionsUsed, ...result.optionsUsed } };
}
