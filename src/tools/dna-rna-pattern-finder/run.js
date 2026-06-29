import { parseSequenceInput } from "../../core/fasta.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { findPatternMatches, makePatternRegex } from "../../core/pattern.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence, makeSequenceContext } from "../../core/sequence.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const dnaRnaPatternFinderTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "match", label: "Match", type: "number" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched text", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];
const TSV_COLUMNS = dnaRnaPatternFinderTableColumns.map((column) => column.id);
const DETAILED_REPORT_MATCH_THRESHOLD = 2000;
export const DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD = 5000;
export const DNA_RNA_PATTERN_SVG_MAP_MATCH_THRESHOLD = 5000;

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function getAlphabetMismatchWarning(sequence) {
  const letters = String(sequence ?? "").replace(/[^A-Za-z*]/g, "");
  if (letters.length < 12) {
    return "";
  }

  const upper = letters.toUpperCase();
  if (/[EFILOPQZJ]/.test(upper)) {
    return "input contains letters commonly found in protein sequences. If this is protein, use Protein Pattern Finder.";
  }

  return "";
}

function findDnaRnaMatches(sequence, pattern, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const forwardMatches = findPatternMatches(sequence, pattern, { ...options, alphabet: "dna-rna" }, context).map((match) => ({
    ...match,
    strand: "+"
  }));

  if (options.strand !== "both") {
    return forwardMatches;
  }

  context.throwIfCancelled?.();
  const rcSequence = reverseComplement(sequence);
  context.throwIfCancelled?.();
  const reverseMatches = findPatternMatches(rcSequence, pattern, { ...options, alphabet: "dna-rna" }, context).map((match) => ({
    start: sequence.length - match.end + 1,
    end: sequence.length - match.start + 1,
    length: match.length,
    matchedText: match.matchedText,
    strand: "-"
  }));

  return [...forwardMatches, ...reverseMatches].sort((left, right) =>
    left.start - right.start || left.end - right.end || left.strand.localeCompare(right.strand)
  );
}

function makeRows(records) {
  return records.flatMap((record) =>
    record.matches.map((match, index) => ({
      record: record.title,
      match: index + 1,
      strand: match.strand,
      start: match.start,
      end: match.end,
      length: match.length,
      ...makeSequenceContext(record.sequence, match.start, match.end)
    }))
  );
}

function makeMatchedRegionRecords(records, maxRecords = Number.POSITIVE_INFINITY) {
  let remaining = maxRecords;
  return records.flatMap((record) =>
    record.matches.flatMap((match, index) => {
      if (remaining <= 0) {
        return [];
      }
      remaining -= 1;
      return [{
        title: `${record.title} match ${index + 1} ${match.strand}${match.start}-${match.end}`,
        sequence: match.matchedText,
        sourceTitle: record.title,
        strand: match.strand,
        start: match.start,
        end: match.end
      }];
    })
  );
}

function getModeLabel(options = {}) {
  if (options.patternMode === "regex") {
    return "regex";
  }
  if (options.patternMode === "iupac") {
    return "IUPAC motif";
  }
  return "plain text";
}

function makeReport(records, pattern, options = {}) {
  const lines = [];

  lines.push("DNA/RNA pattern finder");
  lines.push(`Pattern: ${pattern}`);
  lines.push(`Pattern mode: ${getModeLabel(options)}`);
  lines.push(`Strand search: ${options.strand === "both" ? "both strands" : "forward only"}`);
  lines.push(`Overlapping matches: ${options.allowOverlaps !== false ? "yes" : "no"}`);
  lines.push("");

  for (const record of records) {
    lines.push(`${record.title} pattern matches`);
    lines.push(`Length: ${record.cleanedLength}`);
    lines.push(`Matches: ${record.matches.length}`);
    if (record.matches.length > 0) {
      lines.push("match\tstrand\tstart\tend\tlength\tmatched_text\tcontext_sequence");
      record.matches.forEach((match, index) => {
        const context = makeSequenceContext(record.sequence, match.start, match.end);
        lines.push([index + 1, match.strand, match.start, match.end, match.length, context.matched_text, context.context_sequence].join("\t"));
      });
    } else {
      lines.push("No matches found.");
    }
    lines.push("");
  }

  lines.push(`Total matches: ${records.reduce((sum, record) => sum + record.matches.length, 0)}`);
  return lines.join("\n").trimEnd();
}

function makeSummaryReport(records, pattern, options = {}) {
  const lines = [];
  lines.push("DNA/RNA pattern finder");
  lines.push(`Pattern: ${pattern}`);
  lines.push(`Pattern mode: ${getModeLabel(options)}`);
  lines.push(`Strand search: ${options.strand === "both" ? "both strands" : "forward only"}`);
  lines.push(`Overlapping matches: ${options.allowOverlaps !== false ? "yes" : "no"}`);
  lines.push("");
  for (const record of records) {
    lines.push(`${record.title} pattern matches`);
    lines.push(`Length: ${record.cleanedLength}`);
    lines.push(`Matches: ${record.matches.length}`);
    lines.push("");
  }
  lines.push(`Total matches: ${records.reduce((sum, record) => sum + record.matches.length, 0)}`);
  return lines.join("\n").trimEnd();
}

function makeTsv(rows) {
  return [
    TSV_COLUMNS.join("\t"),
    ...rows.map((row) =>
      [
        row.record,
        row.match,
        row.strand,
        row.start,
        row.end,
        row.length,
        row.left_context,
        row.matched_text,
        row.right_context,
        row.context_sequence
      ].join("\t")
    )
  ].join("\n");
}

function makeTextMap(records) {
  return renderTextAnnotationMapFromItems(records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.matches
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    labelPrefix: "m"
  });
}

function makePatternLegendLabel(pattern, maxLength = 56) {
  const normalized = String(pattern ?? "").replace(/\s+/g, " ").trim() || "match";
  const suffix = " match";
  const available = Math.max(8, maxLength - suffix.length);
  const displayPattern =
    normalized.length > available ? `${normalized.slice(0, available - 3)}...` : normalized;
  return `${displayPattern}${suffix}`;
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function makePatternViewerData(records, pattern, options = {}) {
  const layout = options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear";
  const matchName = makePatternLegendLabel(pattern, 80);
  return makeDnaViewerData(records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.cleanedLength,
    topology: layout,
    tracks: record.matches.length > 0
      ? [
          {
            id: "pattern-matches",
            type: "features",
            label: "Pattern matches",
            layout: "stacked-intervals",
            featureOpacity: 0.72,
            items: record.matches.map((match, index) => ({
              start: match.start,
              end: match.end,
              length: match.length,
              strand: match.strand,
              label: match.matchedText || `match ${index + 1}`,
              name: matchName,
              matchNumber: index + 1,
              type: "pattern match",
              matchedText: match.matchedText
            }))
          }
        ]
      : []
  })), {
    title: "DNA/RNA pattern viewer",
    layout
  });
}

function makeSvgMap(records, pattern, maxMatches = DNA_RNA_PATTERN_SVG_MAP_MATCH_THRESHOLD) {
  let remaining = maxMatches;
  const mapRecords = records.map((record) => {
    const features = [];
    for (const match of record.matches) {
      if (remaining <= 0) {
        break;
      }
      remaining -= 1;
      features.push({
        start: match.start,
        end: match.end,
        strand: match.strand,
        label: "match",
        className: "variant"
      });
    }
    return {
      title: record.title,
      length: record.cleanedLength,
      topology: "linear",
      molecule: "dna",
      features
    };
  });
  return renderSequenceMap({
    title: "DNA/RNA pattern match map",
    records: mapRecords,
    styles: {
      variant: { label: makePatternLegendLabel(pattern), fill: "#dc2626", stroke: "#b91c1c" }
    }
  });
}

function looksLikeSlashDelimitedRegex(pattern) {
  return /^\/.*\/[a-z]*$/i.test(String(pattern ?? ""));
}

export function runDnaRnaPatternFinder(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const pattern = String(options.pattern ?? "").trim();
  const searchOptions = { ...options, keepGaps: false };

  if (!pattern) {
    return makeToolResult({
      output: "",
      warnings: ["No DNA/RNA pattern was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  try {
    makePatternRegex(pattern, { ...searchOptions, alphabet: "dna-rna" });
  } catch (error) {
    return makeToolResult({
      output: "",
      warnings: [`Invalid ${options.patternMode === "regex" ? "regex" : "pattern"}: ${error.message}`],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  if (options.patternMode === "regex" && looksLikeSlashDelimitedRegex(pattern)) {
    warnings.push(
      "Regex mode expects a JavaScript regex source without slash delimiters; use ATG instead of /ATG/i and the case-insensitive checkbox for the i flag."
    );
  }

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  records.forEach((record, recordIndex) => {
    context.throwIfCancelled?.();
    context.reportProgress?.({
      phase: "scanning",
      progress: 0.1 + (recordIndex / Math.max(1, records.length)) * 0.75,
      recordsProcessed: recordIndex,
      totalRecords: records.length
    });
    const mismatchWarning = getAlphabetMismatchWarning(record.sequence);
    if (mismatchWarning) {
      warnings.push(`${record.title}: ${mismatchWarning}`);
    }

    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    let matches = [];
    try {
      matches = findDnaRnaMatches(cleaned.sequence, pattern, searchOptions, context);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      warnings.push(`${record.title}: ${error.message}`);
    }

    analyzedRecords.push({
      title: record.title,
      cleanedLength: cleaned.sequence.length,
      sequence: cleaned.sequence,
      matches
    });
  });

  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  const outputFormat = ["tsv", "text-map", "svg-map", "interactive-viewer", "interactive-circular-viewer"].includes(options.outputFormat) ? options.outputFormat : "report";
  const totalMatches = analyzedRecords.reduce((sum, record) => sum + record.matches.length, 0);
  if (totalMatches > DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD) {
    warnings.push(
      `Matched-region sequence stream was capped at ${DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD} of ${totalMatches} matches to avoid duplicating a very large hit set. Use the table output for all coordinates.`
    );
  }
  if (outputFormat === "report" && totalMatches > DETAILED_REPORT_MATCH_THRESHOLD) {
    warnings.push(
      `Detailed report rows were summarized because this run found ${totalMatches} matches. Use table output for the full hit table.`
    );
  }
  if (outputFormat === "svg-map" && totalMatches > DNA_RNA_PATTERN_SVG_MAP_MATCH_THRESHOLD) {
    warnings.push(
      `SVG match map was capped at ${DNA_RNA_PATTERN_SVG_MAP_MATCH_THRESHOLD} of ${totalMatches} matches to keep the browser responsive. Use table output for all coordinates.`
    );
  }
  const tableRows = makeRows(analyzedRecords);
  const matchedRegions = makeMatchedRegionRecords(analyzedRecords, DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD);
  const reportOutput = outputFormat === "report" && totalMatches > DETAILED_REPORT_MATCH_THRESHOLD
    ? makeSummaryReport(analyzedRecords, pattern, options)
    : makeReport(analyzedRecords, pattern, options);
  const textMap = outputFormat === "text-map" ? makeTextMap(analyzedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(analyzedRecords, pattern) : "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makePatternViewerData(analyzedRecords, pattern, { outputFormat }) : null;
  const output = outputFormat === "tsv"
    ? makeTsv(tableRows)
    : outputFormat === "text-map"
      ? textMap
      : outputFormat === "svg-map"
        ? svgMap
        : viewer
          ? JSON.stringify(viewer, null, 2)
          : reportOutput;

  return makeToolResult({
    output,
    download: {
      filename: `dna-rna-pattern-finder.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values"
          : outputFormat === "svg-map"
            ? "image/svg+xml;charset=utf-8"
            : viewer
              ? "application/json;charset=utf-8"
              : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      table: makeTableStream(dnaRnaPatternFinderTableColumns, tableRows, "dna-rna-pattern-finder"),
      matchedRegions: {
        kind: "sequence-records",
        schema: "dna-rna-pattern-finder",
        alphabet: "dna-rna",
        records: matchedRegions
      }
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : viewer
        ? { viewer }
        : undefined
  });
}

export async function runDnaRnaPatternFinderWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "started", progress: 0 });
  await context.yieldIfNeeded?.();
  const result = runDnaRnaPatternFinder(input, options, context);
  await context.yieldIfNeeded?.();
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
