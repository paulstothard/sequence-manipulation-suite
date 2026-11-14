import { exportDelimitedTable } from "../../core/table.js";
import { PROTEIN_PATTERN_LIMITS, normalizeProteinPatternOptions } from "../../core/protein-pattern-options.js";
import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { findPatternMatchSteps, makePatternRegex } from "../../core/pattern.js";
import { cleanProteinSequence, makeSequenceContext } from "../../core/sequence.js";
import { makeProteinViewerData, makeProteinViewerStream } from "../../core/protein-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const proteinPatternFinderTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "record_index", label: "Record number", type: "number" },
  { id: "match", label: "Match", type: "number" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched text", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];
const DETAILED_REPORT_MATCH_THRESHOLD = 2000;
export const PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD = 5000;
export const PROTEIN_PATTERN_SVG_MAP_MATCH_THRESHOLD = 5000;

function makeRows(records) {
  return records.flatMap((record, recordIndex) =>
    record.matches.map((match, index) => ({
      record: record.title,
      record_index: recordIndex + 1,
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
  return records.flatMap((record, recordIndex) =>
    record.matches.flatMap((match, index) => {
      if (remaining <= 0) {
        return [];
      }
      remaining -= 1;
      return [{
        title: `${record.title} match ${index + 1} ${match.start}-${match.end}`,
        sequence: match.matchedText,
        sourceTitle: record.title,
        sourceRecordIndex: recordIndex + 1,
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
  return exportDelimitedTable(proteinPatternFinderTableColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
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
    includeStrand: false,
    headerPrefix: ""
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
        inspectionLabel: makePatternLegendLabel(pattern),
        type: "pattern match",
        matchedText: match.matchedText,
        className: "variant"
      });
    }
    return {
      title: record.title,
      sequence: record.sequence,
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

export async function runProteinPatternFinder(input, options = {}, context = {}) {
  const optionsUsed = normalizeProteinPatternOptions(options);
  const result = await scanProteinPatterns(input, { ...options, ...optionsUsed }, context);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return { ...result, optionsUsed };
}

async function scanProteinPatterns(input, options, context) {
  const executionContext = context;
  let lastYield = -Infinity, lastProgress = -Infinity, lastPhase;
  context = { ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    },
    reportProgress(detail) {
      const now = Date.now();
      if (detail.phase !== lastPhase || now - lastProgress >= 32) {
        executionContext.reportProgress?.(detail); lastPhase = detail.phase; lastProgress = now;
      }
    }
  };
  const limits = PROTEIN_PATTERN_LIMITS;
  const maxInput = effectiveToolLimit(options, "proteinPatternInput", limits.inputCharacters);
  const maxHits = effectiveToolLimit(options, "proteinPatternHits", limits.hits);
  const maxOutput = effectiveToolLimit(options, "proteinPatternOutput", limits.outputCharacters);
  if (String(input ?? "").length > maxInput) throw new Error("Protein pattern input exceeds 2,000,000 characters.");
  await context.yieldIfNeeded();
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, "sequence", { strictHeaders: true });
  if (records.length > effectiveToolLimit(options, "proteinPatternRecords", limits.records)) throw new Error("Protein pattern input exceeds 10,000 records.");
  if (records.some(record => record.title.length > limits.headerCharacters)) throw new Error("Protein pattern FASTA headers must not exceed 1,000 characters.");
  const warnings = [];
  const notes = [];
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

  if (pattern.length > limits.patternCharacters) throw new Error("Protein patterns must not exceed 1,000 characters.");

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

  let work = 0, hitCount = 0, matchedCharacters = 0;
  for (const [recordIndex, record] of records.entries()) {
    await context.yieldIfNeeded();
    work += record.sequence.length * pattern.length;
    if (work > effectiveToolLimit(options, "proteinPatternWork", limits.work)) throw new Error("Protein pattern scan exceeds 50,000,000 residue-pattern positions. Use a shorter pattern or fewer records.");
    context.throwIfCancelled?.();
    context.reportProgress?.({
      phase: "scanning",
      progress: 0.1 + (recordIndex / Math.max(1, records.length)) * 0.75,
      recordsProcessed: recordIndex,
      totalRecords: records.length
    });
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: options.caseInsensitive === false,
      keepGaps: false
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    const gapCount = (record.sequence.match(/[-.]/g) ?? []).length;
    if (gapCount) notes.push(`${record.title}: removed ${gapCount} alignment gap character(s); coordinates refer to the cleaned sequence.`);
    if (cleaned.removedCount > gapCount) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount - gapCount} non-protein character(s).`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    const steps = findPatternMatchSteps(cleaned.sequence, pattern, {
      ...searchOptions, alphabet: "protein", maxMatches: maxHits - hitCount,
      maxMatchedCharacters: maxOutput / 2 - matchedCharacters
    }, context);
    let step = steps.next();
    while (!step.done) { await context.yieldIfNeeded(); step = steps.next(); }
    const matches = step.value;
    hitCount += matches.length;
    matchedCharacters += matches.reduce((sum, match) => sum + match.length, 0);

    analyzedRecords.push({
      title: record.title,
      cleanedLength: cleaned.sequence.length,
      sequence: cleaned.sequence,
      matches
    });
  }

  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  const outputFormat = options.outputFormat;
  const totalMatches = analyzedRecords.reduce((sum, record) => sum + record.matches.length, 0);
  const maxMatchedRegionRecords = effectiveToolLimit(options, "proteinPatternRegions", PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD);
  if (outputFormat === "matched-regions" && totalMatches > maxMatchedRegionRecords) {
    warnings.push(
      `Matched-region sequence stream was capped at ${maxMatchedRegionRecords === PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD ? String(maxMatchedRegionRecords) : maxMatchedRegionRecords.toLocaleString()} of ${totalMatches} matches to avoid duplicating a very large hit set. Use the table output for all coordinates.`
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
  const tableRows = outputFormat === "tsv" ? makeRows(analyzedRecords) : null;
  const matchedRegions = outputFormat === "matched-regions" ? makeMatchedRegionRecords(analyzedRecords, maxMatchedRegionRecords) : null;
  const reportOutput = outputFormat === "report"
    ? (totalMatches > DETAILED_REPORT_MATCH_THRESHOLD ? makeSummaryReport : makeReport)(analyzedRecords, pattern, options)
    : "";
  const textMap = outputFormat === "text-map" ? makeTextMap(analyzedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(analyzedRecords, pattern) : "";
  const viewer = outputFormat === "interactive-viewer" ? makeProteinPatternViewerData(analyzedRecords, pattern) : null;
  const output = matchedRegions ? matchedRegions.map(record => formatFastaRecord(record.title, record.sequence)).join("") : outputFormat === "tsv"
    ? makeTsv(tableRows)
    : outputFormat === "text-map"
      ? textMap
      : outputFormat === "svg-map"
        ? svgMap
        : viewer
          ? JSON.stringify(viewer, null, 2)
          : reportOutput;

  if (output.length > maxOutput) throw new Error("Protein pattern output exceeds 26,214,400 characters. Select fewer records or a narrower pattern.");
  return makeToolResult({
    output,
    sequenceSearch: outputFormat === "text-map"
      ? { format: "labelled-blocks", plainMapHeadings: true, alphabet: "protein" }
      : undefined,
    download: {
      filename: `protein-pattern-finder.${matchedRegions ? "fasta" : outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
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
    notes: [...notes, ...(analyzedRecords.some(record => record.sequence.includes("*")) ? ["Stop symbols are retained as sequence characters. User patterns can match them; regex anchors refer to the full record."] : [])],
    recordsProcessed: records.length,
    basesProcessed,
    processedUnitLabel: analyzedRecords.some(record => record.sequence.includes("*")) ? "character" : "residue",
    charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(reportOutput, "text/plain") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", plainMapHeadings: true, alphabet: "protein" }) } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeProteinViewerStream(viewer) } : {}),
      ...(tableRows ? { table: makeTableStream(proteinPatternFinderTableColumns, tableRows, "protein-pattern-finder") } : {}),
      ...(matchedRegions ? { matchedRegions: {
        kind: "sequence-records",
        schema: "protein-pattern-finder",
        alphabet: "protein",
        records: matchedRegions
      } } : {})
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : viewer
        ? { viewer }
        : undefined
  });
}

export const runProteinPatternFinderWorker = runProteinPatternFinder;
