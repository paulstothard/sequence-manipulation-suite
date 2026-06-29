import { parseSequenceInput } from "../../core/fasta.js";
import { findPatternMatches, makePatternRegex } from "../../core/pattern.js";
import { cleanProteinSequence, makeSequenceContext } from "../../core/sequence.js";
import { makeProteinViewerData, makeProteinViewerStream } from "../../core/protein-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const proteinPatternFinderTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "match", label: "Match", type: "number" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched text", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];
const TSV_COLUMNS = proteinPatternFinderTableColumns.map((column) => column.id);
const DETAILED_REPORT_MATCH_THRESHOLD = 2000;
export const PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD = 5000;
export const PROTEIN_PATTERN_SVG_MAP_MATCH_THRESHOLD = 5000;

function makeRows(records) {
  return records.flatMap((record) =>
    record.matches.map((match, index) => ({
      record: record.title,
      match: index + 1,
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
        title: `${record.title} match ${index + 1} ${match.start}-${match.end}`,
        sequence: match.matchedText,
        sourceTitle: record.title,
        start: match.start,
        end: match.end
      }];
    })
  );
}

function makeReport(records, pattern, options = {}) {
  const lines = [];
  const mode = options.patternMode === "regex" ? "regex" : options.patternMode === "iupac" ? "IUPAC motif" : "plain text";

  lines.push(`Protein pattern finder`);
  lines.push(`Pattern: ${pattern}`);
  lines.push(`Pattern mode: ${mode}`);
  lines.push(`Overlapping matches: ${options.allowOverlaps !== false ? "yes" : "no"}`);
  lines.push("");

  for (const record of records) {
    lines.push(`${record.title} pattern matches`);
    lines.push(`Length: ${record.cleanedLength}`);
    lines.push(`Matches: ${record.matches.length}`);
    if (record.matches.length > 0) {
      lines.push("match\tstart\tend\tlength\tmatched_text\tcontext_sequence");
      record.matches.forEach((match, index) => {
        const context = makeSequenceContext(record.sequence, match.start, match.end);
        lines.push([index + 1, match.start, match.end, match.length, context.matched_text, context.context_sequence].join("\t"));
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
  const mode = options.patternMode === "regex" ? "regex" : options.patternMode === "iupac" ? "IUPAC motif" : "plain text";

  lines.push("Protein pattern finder");
  lines.push(`Pattern: ${pattern}`);
  lines.push(`Pattern mode: ${mode}`);
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
    alphabet: "protein",
    labelPrefix: "m",
    includeStrand: false
  });
}

function makePatternLegendLabel(pattern, maxLength = 56) {
  const normalizedPattern = String(pattern ?? "").replace(/\s+/g, " ").trim();
  const displayPattern =
    normalizedPattern.length > maxLength ? `${normalizedPattern.slice(0, maxLength - 3)}...` : normalizedPattern;
  return `${displayPattern || "Pattern"} match`;
}

function makeSvgMap(records, pattern, maxMatches = PROTEIN_PATTERN_SVG_MAP_MATCH_THRESHOLD) {
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
        label: "match",
        className: "variant"
      });
    }
    return {
      title: record.title,
      length: record.cleanedLength,
      topology: "linear",
      molecule: "protein",
      features
    };
  });
  return renderSequenceMap({
    title: "Protein pattern match map",
    records: mapRecords,
    styles: {
      variant: { label: makePatternLegendLabel(pattern), fill: "#7c3aed", stroke: "#6d28d9" }
    }
  });
}

function makeProteinPatternViewerData(records, pattern) {
  const label = makePatternLegendLabel(pattern, 36);
  return makeProteinViewerData(records.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.cleanedLength,
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
              label: `m${index + 1}`,
              name: label,
              type: "pattern match",
              matchedText: match.matchedText
            }))
          }
        ]
      : []
  })), {
    title: "Protein pattern viewer"
  });
}

function looksLikeSlashDelimitedRegex(pattern) {
  return /^\/.*\/[a-z]*$/i.test(String(pattern ?? ""));
}

export function runProteinPatternFinder(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const pattern = String(options.pattern ?? "").trim();
  const searchOptions = { ...options, keepGaps: false };

  if (!pattern) {
    return makeToolResult({
      output: "",
      warnings: ["No protein pattern was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  try {
    makePatternRegex(pattern, { ...searchOptions, alphabet: "protein" });
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
      "Regex mode expects a JavaScript regex source without slash delimiters; use K.D instead of /K.D/i and the case-insensitive checkbox for the i flag."
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
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-protein character(s).`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    let matches = [];
    try {
      matches = findPatternMatches(cleaned.sequence, pattern, { ...searchOptions, alphabet: "protein" }, context);
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
  const outputFormat = ["tsv", "text-map", "svg-map", "interactive-viewer"].includes(options.outputFormat) ? options.outputFormat : "report";
  const totalMatches = analyzedRecords.reduce((sum, record) => sum + record.matches.length, 0);
  if (totalMatches > PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD) {
    warnings.push(
      `Matched-region sequence stream was capped at ${PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD} of ${totalMatches} matches to avoid duplicating a very large hit set. Use the table output for all coordinates.`
    );
  }
  if (outputFormat === "report" && totalMatches > DETAILED_REPORT_MATCH_THRESHOLD) {
    warnings.push(
      `Detailed report rows were summarized because this run found ${totalMatches} matches. Use table output for the full hit table.`
    );
  }
  if (outputFormat === "svg-map" && totalMatches > PROTEIN_PATTERN_SVG_MAP_MATCH_THRESHOLD) {
    warnings.push(
      `Linear pattern map was capped at ${PROTEIN_PATTERN_SVG_MAP_MATCH_THRESHOLD} of ${totalMatches} matches to keep the browser responsive. Use table output for all coordinates.`
    );
  }
  const tableRows = makeRows(analyzedRecords);
  const matchedRegions = makeMatchedRegionRecords(analyzedRecords, PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD);
  const reportOutput = outputFormat === "report" && totalMatches > DETAILED_REPORT_MATCH_THRESHOLD
    ? makeSummaryReport(analyzedRecords, pattern, options)
    : makeReport(analyzedRecords, pattern, options);
  const textMap = outputFormat === "text-map" ? makeTextMap(analyzedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(analyzedRecords, pattern) : "";
  const viewer = outputFormat === "interactive-viewer" ? makeProteinPatternViewerData(analyzedRecords, pattern) : null;
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
      filename: `protein-pattern-finder.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
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
    processedUnitLabel: "residue",
    charactersRemoved,
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeProteinViewerStream(viewer) } : {}),
      table: makeTableStream(proteinPatternFinderTableColumns, tableRows, "protein-pattern-finder"),
      matchedRegions: {
        kind: "sequence-records",
        schema: "protein-pattern-finder",
        alphabet: "protein",
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

export async function runProteinPatternFinderWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "started", progress: 0 });
  await context.yieldIfNeeded?.();
  const result = runProteinPatternFinder(input, options, context);
  await context.yieldIfNeeded?.();
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
