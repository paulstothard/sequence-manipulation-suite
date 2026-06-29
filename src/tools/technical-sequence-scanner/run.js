import { parseSequenceInput } from "../../core/fasta.js";
import { motifMatchTableColumns, scanMotifRecordsWithContext } from "../../core/motif-scanner.js";
import { makePatternRegex } from "../../core/pattern.js";
import { cleanSequence, complementDnaRnaSequence, makeSequenceContext } from "../../core/sequence.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const technicalSequenceTableColumns = [
  ...motifMatchTableColumns,
  { id: "match_type", label: "Match type", type: "string" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "mismatch_positions", label: "Mismatch positions", type: "string" },
  { id: "identity_percent", label: "Identity percent", type: "number" }
];

const DNA_RNA_SYMBOLS = {
  A: new Set(["A"]),
  C: new Set(["C"]),
  G: new Set(["G"]),
  T: new Set(["T", "U"]),
  U: new Set(["T", "U"]),
  R: new Set(["A", "G"]),
  Y: new Set(["C", "T", "U"]),
  S: new Set(["G", "C"]),
  W: new Set(["A", "T", "U"]),
  K: new Set(["G", "T", "U"]),
  M: new Set(["A", "C"]),
  B: new Set(["C", "G", "T", "U"]),
  D: new Set(["A", "G", "T", "U"]),
  H: new Set(["A", "C", "T", "U"]),
  V: new Set(["A", "C", "G"]),
  N: new Set(["A", "C", "G", "T", "U"])
};

export const TECHNICAL_SEQUENCE_SVG_MAX_RECORDS = 12;
export const TECHNICAL_SEQUENCE_SVG_MAX_TOTAL_HITS = 240;
export const TECHNICAL_SEQUENCE_SVG_MAX_HITS_PER_RECORD = 80;

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
  const parsed = text.startsWith(">")
    ? parseSequenceInput(text, "dna-rna").map((record, index) => ({
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

  return parsed
    .filter(Boolean)
    .map((entry, index) => {
      const cleaned = cleanSequence(entry.sequence, {
        alphabet: "dna-rna",
        preserveCase: false,
        keepGaps: false
      });
      const warnings = [];
      if (cleaned.removedCount > 0) {
        warnings.push(`Custom technical sequence ${index + 1}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
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
        warnings
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
    const current = byRecord.get(row.record);
    if (
      !current ||
      row.length > current.length ||
      (row.length === current.length && row.match_type.localeCompare(current.match_type) < 0)
    ) {
      byRecord.set(row.record, row);
    }
  }
  return [...byRecord.values()].sort((left, right) => left.record.localeCompare(right.record));
}

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function getPatternMode(syntax) {
  return syntax === "iupac" ? "iupac" : "plain";
}

function patternMatches(sequence, pattern, syntax) {
  const regex = makePatternRegex(pattern, {
    alphabet: "dna-rna",
    patternMode: getPatternMode(syntax),
    caseInsensitive: true
  });
  return regex.test(sequence);
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

function basesOverlap(left, right) {
  const leftSet = DNA_RNA_SYMBOLS[String(left ?? "").toUpperCase()];
  const rightSet = DNA_RNA_SYMBOLS[String(right ?? "").toUpperCase()];
  if (!leftSet || !rightSet) {
    return false;
  }
  for (const base of leftSet) {
    if (rightSet.has(base)) {
      return true;
    }
  }
  return false;
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
    score: Number((((details.length - mismatches) / details.length) * 100).toFixed(3)),
    description: motif.description,
    match_type: "mismatch_tolerant_full",
    mismatches,
    mismatch_positions: details.mismatchPositions.join(","),
    identity_percent: Number((((details.length - mismatches) / details.length) * 100).toFixed(3))
  };
}

function scanMismatchTolerantForward(recordTitle, sequence, motif, options = {}, context = {}) {
  const pattern = String(motif.pattern ?? "").toUpperCase().replaceAll("U", "T");
  const maxMismatches = Math.max(0, Math.floor(Number(options.maxMismatches) || 0));
  const exactThreePrimeBases = options.requireExactThreePrime
    ? Math.max(1, Math.min(pattern.length, Math.floor(Number(options.exactThreePrimeBases) || 3)))
    : 0;
  const allowOverlaps = options.allowOverlaps !== false;
  const rows = [];
  if (pattern.length === 0 || sequence.length < pattern.length) {
    return rows;
  }
  for (let offset = 0; offset <= sequence.length - pattern.length; offset += 1) {
    if (offset % 4096 === 0) {
      context.throwIfCancelled?.();
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
      if (!allowOverlaps) {
        offset += pattern.length - 1;
      }
    }
  }
  return rows;
}

function scanMismatchTolerantForSequence(recordTitle, sequence, motif, options = {}, context = {}) {
  const rows = scanMismatchTolerantForward(recordTitle, sequence, motif, options, context);
  if ((options.strand ?? "both") !== "both") {
    return rows;
  }
  const reverseSequence = reverseComplement(sequence);
  const reverseRows = scanMismatchTolerantForward(recordTitle, reverseSequence, motif, {
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

function scanPartialEndsForSequence(recordTitle, sequence, motif, options, context = {}) {
  const minLength = Math.max(1, Math.floor(Number(options.minimumPartialLength) || 12));
  const rows = [];
  if (motif.pattern.length < minLength || sequence.length < minLength) {
    return rows;
  }

  const maxLength = Math.min(motif.pattern.length - 1, sequence.length);
  for (let length = maxLength; length >= minLength; length -= 1) {
    if (length % 4096 === 0) {
      context.throwIfCancelled?.();
    }
    const motifPrefix = motif.pattern.slice(0, length);
    const motifSuffix = motif.pattern.slice(motif.pattern.length - length);
    const sequencePrefix = sequence.slice(0, length);
    const sequenceSuffix = sequence.slice(sequence.length - length);

    if (patternMatches(sequencePrefix, motifSuffix, motif.syntax)) {
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
      break;
    }

    if (patternMatches(sequenceSuffix, motifPrefix, motif.syntax)) {
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
      break;
    }
  }

  if ((options.strand ?? "both") === "both") {
    const reverseSequence = reverseComplement(sequence);
    const reverseRows = scanPartialEndsForSequence(recordTitle, reverseSequence, motif, {
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
          allowOverlaps: options.allowOverlaps !== false
        }, context)).rows.map((row) => ({
          ...row,
          match_type: "full",
          mismatches: 0,
          mismatch_positions: "",
          identity_percent: 100
        }));
  const mismatchRows =
    matchMode === "mismatch-tolerant"
      ? selectedRecords.flatMap((motif) =>
          scanMismatchTolerantForSequence(title, cleaned.sequence, motif, options, context)
        )
      : [];
  const partialRows =
    matchMode === "full" || matchMode === "mismatch-tolerant"
      ? []
      : selectedRecords.flatMap((motif) =>
          scanPartialEndsForSequence(title, cleaned.sequence, motif, options, context)
        );

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
  return renderTextAnnotationMapFromItems(scannedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.rows
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    labelPrefix: "t"
  });
}

function summarizeSvgRecords(scannedRecords) {
  const drawableRecords = scannedRecords.slice(0, TECHNICAL_SEQUENCE_SVG_MAX_RECORDS);
  const omittedRecords = Math.max(0, scannedRecords.length - drawableRecords.length);
  const totalHits = scannedRecords.reduce((sum, record) => sum + record.rows.length, 0);
  const perRecordBase = Math.max(1, Math.floor(TECHNICAL_SEQUENCE_SVG_MAX_TOTAL_HITS / Math.max(1, drawableRecords.length)));
  return {
    omittedRecords,
    totalHits,
    records: drawableRecords.map((record) => {
      const shownLimit = Math.min(TECHNICAL_SEQUENCE_SVG_MAX_HITS_PER_RECORD, Math.max(perRecordBase, Math.min(record.rows.length, TECHNICAL_SEQUENCE_SVG_MAX_HITS_PER_RECORD)));
      const shownRows = record.rows.slice(0, shownLimit);
      const omitted = Math.max(0, record.rows.length - shownRows.length);
      return {
        title: record.title,
        length: record.sequence.length,
        molecule: "dna",
        features: shownRows.map((row, index) => ({
          start: row.start,
          end: row.end,
          strand: row.strand,
          className: row.mismatches > 0 ? "variant" : row.match_type === "full" ? "regulatory" : "other",
          label: `t${index + 1}`,
          showLabel: true,
          type: "technical-sequence"
        })),
        notes: [
          `Technical sequence hits: ${record.rows.length}; shown: ${shownRows.length}; omitted: ${omitted}.`,
          ...(omittedRecords > 0 ? [`${omittedRecords} additional record(s) not drawn; see table output.`] : [])
        ]
      };
    })
  };
}

function makeSvgMap(scannedRecords) {
  const summary = summarizeSvgRecords(scannedRecords);
  if (summary.totalHits === 0) {
    return renderSequenceMap({
      title: "Technical sequence map",
      records: scannedRecords.slice(0, TECHNICAL_SEQUENCE_SVG_MAX_RECORDS).map((record) => ({
        title: record.title,
        length: record.sequence.length,
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
  const columns = technicalSequenceTableColumns.map((column) => column.id);
  return [
    columns.join("\t"),
    ...rows.map((row) =>
      [
        row.record,
        row.motif_id,
        row.motif_name,
        row.motif_class,
        row.source,
        row.syntax,
        row.strand,
        row.start,
        row.end,
        row.length,
        row.left_context,
        row.matched_text,
        row.right_context,
        row.context_sequence,
        formatScore(row.score),
        row.description,
        row.match_type,
        row.mismatches ?? "",
        row.mismatch_positions ?? "",
        formatPercent(row.identity_percent)
      ].join("\t")
    )
  ].join("\n");
}

function makeReport({ rows, selectedRecords, recordsProcessed, basesProcessed, provenance }) {
  const lines = [
    "Technical sequence scanner",
    `Technical sequences scanned: ${selectedRecords.length}`,
    `Sequences scanned: ${recordsProcessed}`,
    `Bases scanned: ${basesProcessed}`,
    `Matches found: ${rows.length}`,
    `Database: ${provenance.dataset} ${provenance.version}`,
    `Database note: ${provenance.description}`,
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
        `- ${row.record}: ${row.motif_name}; ${row.length} bases; ${row.match_type}; ${row.strand}:${row.start}-${row.end}`
      );
    }
    lines.push("");
  }

  lines.push("record\ttechnical_sequence\tclass\tstrand\tstart\tend\tmatch_type\tmismatches\tmatched_text\tcontext_sequence");
  for (const row of rows) {
    lines.push(
      [
        row.record,
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

export async function runTechnicalSequenceScanner(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "loading-reference-data", progress: 0.05 });
  const { records: technicalSequences, provenance } = await loadTechnicalSequenceData();
  context.throwIfCancelled?.();
  const records = parseSequenceInput(input, "dna-rna");
  const usesCustomSequences = options.sequenceClass === "custom";
  const custom = usesCustomSequences ? parseCustomSequences(options.customSequences ?? "") : [];
  const selectedRecords = usesCustomSequences
    ? custom.map((item) => item.record).filter((record) => record.pattern.length > 0)
    : getSelectedRecords(technicalSequences, options);
  const warnings = custom.flatMap((item) => item.warnings);

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No DNA/RNA sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0,
      streams: {
        table: makeTableStream(technicalSequenceTableColumns, [], "technical-sequence-scanner")
      }
    });
  }

  if (selectedRecords.length === 0) {
    warnings.push(usesCustomSequences
      ? "No custom technical sequences were provided."
      : "No bundled technical sequences matched the selected filters.");
  }
  const minimumPartialLength = Math.floor(Number(options.minimumPartialLength) || 12);
  if ((options.matchMode === "partial-ends" || options.matchMode === "full-or-partial") && minimumPartialLength < 8) {
    warnings.push("Minimum partial match length is short; expect many low-specificity matches.");
  }
  const maxMismatches = Math.max(0, Math.floor(Number(options.maxMismatches) || 0));
  if (options.matchMode === "mismatch-tolerant" && maxMismatches > 0) {
    const shortestSelected = Math.min(...selectedRecords.map((record) => record.pattern.length).filter((length) => length > 0), Infinity);
    if (shortestSelected <= 12 || maxMismatches / Math.max(1, shortestSelected) >= 0.2) {
      warnings.push("Mismatch-tolerant matching can produce low-specificity FASTA hits for short technical sequences or high mismatch fractions.");
    }
  }

  const rows = [];
  const scannedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const [index, record] of records.entries()) {
    if (index > 0 && index % 25 === 0) {
      await context.yieldIfNeeded?.();
    } else {
      context.throwIfCancelled?.();
    }
    const result = await scanTechnicalRecord(record, selectedRecords, {
      ...options,
      minimumPartialLength
    }, context);
    rows.push(...result.rows);
    scannedRecords.push({
      title: result.title,
      sequence: result.sequence,
      rows: result.rows
    });
    warnings.push(...result.warnings);
    basesProcessed += result.sequenceLength;
    charactersRemoved += result.charactersRemoved;
    context.reportProgress?.({
      phase: "scanning",
      progress: 0.05 + ((index + 1) / records.length) * 0.9,
      recordsProcessed: index + 1,
      totalRecords: records.length
    });
  }
  context.throwIfCancelled?.();

  const report = makeReport({
    rows,
    selectedRecords,
    recordsProcessed: records.length,
    basesProcessed,
    provenance
  });
  const tsv = makeTsv(rows);
  const outputFormat = ["tsv", "text-map", "svg-map", "interactive-viewer", "interactive-circular-viewer"].includes(options.outputFormat) ? options.outputFormat : "report";
  const textMap = outputFormat === "text-map" ? makeTextMap(scannedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(scannedRecords) : "";
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
    download: {
      filename: `technical-sequence-scanner.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
      mimeType: outputFormat === "tsv" ? "text/tab-separated-values" : outputFormat === "svg-map" ? "image/svg+xml;charset=utf-8" : viewer ? "application/json;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      table: makeTableStream(technicalSequenceTableColumns, rows, "technical-sequence-scanner")
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : viewer
        ? { viewer }
        : undefined
  });
}
