import { formatFastaRecord } from "../../core/fasta.js";
import { exportDelimitedTable } from "../../core/table.js";
import { normalizeDnaRnaPatternOptions, DNA_RNA_PATTERN_LIMITS } from "../../core/dna-rna-pattern-options.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { iterateFastaFixedWindowSegments } from "../../core/fasta-fixed-window-segments.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { findPatternMatches, makePatternRegex } from "../../core/pattern.js";
import { complementDnaRnaSequence, makeSequenceContext } from "../../core/sequence.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS } from "../fasta-input-policy.js";

export const dnaRnaPatternFinderTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "record_index", label: "Record number", type: "number" },
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
const DETAILED_REPORT_MATCH_THRESHOLD = 2000;
const MAX_STREAMED_PATTERN_LENGTH = DNA_RNA_PATTERN_LIMITS.patternCharacters;
const MAX_STREAMED_PATTERN_BASES = DNA_RNA_PATTERN_LIMITS.inputCharacters;
const MAX_STREAMED_PATTERN_WORK = DNA_RNA_PATTERN_LIMITS.work;
const MAX_STREAMED_PATTERN_MATCHES = DNA_RNA_PATTERN_LIMITS.hits;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = DNA_RNA_PATTERN_LIMITS.outputCharacters;
export const DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD = DNA_RNA_PATTERN_LIMITS.regionRecords;
export const DNA_RNA_PATTERN_SVG_MAP_MATCH_THRESHOLD = DNA_RNA_PATTERN_LIMITS.mapMatches;

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: true })).reverse().join("");
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
  const reverseMatches = findPatternMatches(rcSequence, pattern, { ...options, alphabet: "dna-rna", maxMatchedCharacters: options.maxMatchedCharacters == null ? undefined : options.maxMatchedCharacters - forwardMatches.reduce((n, match) => n + match.length, 0) }, context).map((match) => ({
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
  return records.flatMap((record, recordIndex) =>
    record.matches.map((match, index) => ({
      record: record.title,
      record_index: recordIndex + 1,
      match: index + 1,
      strand: match.strand,
      start: match.start,
      end: match.end,
      length: match.length,
      ...(match.context ?? makeSequenceContext(record.sequence, match.start, match.end))
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
        title: `${record.title} match ${index + 1} ${match.strand}${match.start}-${match.end}`,
        sequence: match.matchedText,
        sourceTitle: record.title,
        sourceRecordIndex: recordIndex + 1,
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
        const context = match.context ?? makeSequenceContext(record.sequence, match.start, match.end);
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
  return exportDelimitedTable(dnaRnaPatternFinderTableColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
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
    labelPrefix: "m",
    headerPrefix: ""
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
        inspectionLabel: makePatternLegendLabel(pattern),
        type: "pattern match",
        matchedText: match.matchedText,
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

export async function runDnaRnaPatternFinder(input, options = {}, context = {}) {
  const optionsUsed = normalizeDnaRnaPatternOptions(options);
  const result = await scanDnaRnaPatterns(input, { ...options, ...optionsUsed }, context);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return { ...result, optionsUsed };
}

export const runDnaRnaPatternFinderWorker = runDnaRnaPatternFinder;

function buildPatternResult(analyzedRecords, pattern, options, warnings, basesProcessed, charactersRemoved, context) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  const outputFormat = options.outputFormat;
  const totalMatches = analyzedRecords.reduce((sum, record) => sum + record.matches.length, 0);
  const matchedRegionLimit = effectiveToolLimit(options, "patternRegionStream", DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD);
  if (outputFormat === "matched-regions" && totalMatches > matchedRegionLimit) {
    warnings.push(
      `Matched-region sequence stream was capped at ${matchedRegionLimit} of ${totalMatches} matches to avoid duplicating a very large hit set. Use the table output for all coordinates.`
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
  const tableRows = outputFormat === "tsv" ? makeRows(analyzedRecords) : null;
  const matchedRegions = outputFormat === "matched-regions" ? makeMatchedRegionRecords(analyzedRecords, matchedRegionLimit) : null;
  const reportOutput = outputFormat === "report"
    ? (totalMatches > DETAILED_REPORT_MATCH_THRESHOLD ? makeSummaryReport : makeReport)(analyzedRecords, pattern, options)
    : "";
  const textMap = outputFormat === "text-map" ? makeTextMap(analyzedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(analyzedRecords, pattern) : "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makePatternViewerData(analyzedRecords, pattern, { outputFormat }) : null;
  const output = matchedRegions
    ? matchedRegions.map(record => formatFastaRecord(record.title, record.sequence)).join("\n\n")
    : outputFormat === "tsv"
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
    sequenceSearch: outputFormat === "text-map"
      ? { format: "labelled-blocks", plainMapHeadings: true, alphabet: "dna-rna" }
      : undefined,
    download: {
      filename: `dna-rna-pattern-finder.${matchedRegions ? "fasta" : outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
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
    recordsProcessed: analyzedRecords.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(reportOutput, "text/plain") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", plainMapHeadings: true, alphabet: "dna-rna" }) } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      ...(tableRows ? { table: makeTableStream(dnaRnaPatternFinderTableColumns, tableRows, "dna-rna-pattern-finder") } : {}),
      ...(matchedRegions ? { matchedRegions: {
        kind: "sequence-records",
        schema: "dna-rna-pattern-finder",
        alphabet: "dna-rna",
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

async function scanDnaRnaPatterns(input, options, context) {
  // Source parsing requests a checkpoint for every record. Bound real timer
  // yields/progress messages without dropping cancellation checks.
  const executionContext = context;
  let lastYield = -Infinity;
  let lastProgress = -Infinity;
  let lastPhase;
  context = {
    ...executionContext,
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
        executionContext.reportProgress?.(detail);
        lastPhase = detail.phase;
        lastProgress = now;
      }
    }
  };
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const pattern = String(options.pattern ?? "").trim();
  if (!pattern) return makeToolResult({ output: "", warnings: ["No DNA/RNA pattern was provided."], recordsProcessed: 0, basesProcessed: 0, charactersRemoved: 0 });
  const boundedPaste = !options.loadedFastaFile?.stream && !["indexed", "bgzf"].includes(options.sourceMode) && String(input ?? "").length <= MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS;
  const regexMode = options.patternMode === "regex";
  const richOutput = ["text-map", "interactive-viewer", "interactive-circular-viewer"].includes(options.outputFormat);
  if (regexMode && !boundedPaste) throw new Error("Large FASTA sources support plain-text and IUPAC patterns. JavaScript regex requires a bounded pasted input.");
  try { makePatternRegex(pattern, { ...options, alphabet: "dna-rna" }); }
  catch (error) { return makeToolResult({ output: "", warnings: [`Invalid ${regexMode ? "regex" : "pattern"}: ${error.message}`], recordsProcessed: 0, basesProcessed: 0, charactersRemoved: 0 }); }
  const maxPatternLength = effectiveToolLimit(options, "patternLength", MAX_STREAMED_PATTERN_LENGTH);
  const maxWork = effectiveToolLimit(options, "patternWork", MAX_STREAMED_PATTERN_WORK);
  const maxMatches = effectiveToolLimit(options, "patternHits", MAX_STREAMED_PATTERN_MATCHES);
  const maxOutputCharacters = effectiveToolLimit(options, "patternOutput", MAX_MATERIALIZED_OUTPUT_CHARACTERS);
  if (!regexMode && pattern.length > maxPatternLength) throw new Error(`Pattern length exceeds the ${maxPatternLength.toLocaleString()}-base large-source limit.`);
  const outputFormat = options.outputFormat ?? "svg-map";
  if (richOutput && !boundedPaste) {
    throw new Error("Large FASTA sources support report, table, and linear map output. Text maps and sequence viewers require a bounded pasted input.");
  }
  let sourceLetterCount = 0;
  let sourceProteinLetters = false;
  const sourceOptions = applyDisabledFastaSourceLimits({
    ...options,
    strictHeaders: true,
    preserveCase: options.caseInsensitive === false,
    sourceChunkSize: Math.min(65_536, Number(options.sourceChunkSize) || 65_536),
    onSourceChunk(text) {
      sourceLetterCount += text.replace(/[^A-Za-z*]/g, "").length;
      sourceProteinLetters ||= /[EFILOPQZJ]/i.test(text);
    },
    maxSourceBases: Math.min(MAX_STREAMED_PATTERN_BASES, Number(options.maxSourceBases) || MAX_STREAMED_PATTERN_BASES)
  }, {
    maxSourceBases: "patternSource",
    maxSourceRecords: "patternSource",
    maxDecodedSourceBytes: "patternSource",
    maxSourceBytes: "patternSource"
  });
  const opened = await openCleanDnaRnaFastaSource(input, sourceOptions, context);
  const records = [];
  const warnings = [];
  if (regexMode && looksLikeSlashDelimitedRegex(pattern)) warnings.push("Regex mode expects a JavaScript regex source without slash delimiters; use ATG instead of /ATG/i and the case-insensitive checkbox for the i flag.");
  const both = options.strand === "both";
  const searchOptions = { ...options, alphabet: "dna-rna", allowOverlaps: true };
  const maxWidth = regexMode ? 1 : pattern.length + 20;
  let current = null;
  let work = 0;
  let totalMatches = 0;
  let regexMatchedCharacters = 0;
  let retainedRowCharacters = 0;
  let basesProcessed = 0;
  let charactersRemoved = 0;

  async function* events() {
    for await (const event of opened.events()) {
      if (event.type === "sequence-chunk" && (richOutput || regexMode)) current.sequenceChunks.push(event.text);
      yield event;
    }
  }
  for await (const event of iterateFastaFixedWindowSegments(events(), { maxWindowLength: maxWidth, segmentLength: 8192 })) {
    if (event.type === "record-start") {
      sourceLetterCount = 0;
      sourceProteinLetters = false;
      current = { title: event.title, cleanedLength: 0, sequenceChunks: [], matches: [] };
      continue;
    }
    if (event.type === "scan-segment") {
      if (regexMode) continue;
      const ownedLength = event.ownedEnd0 - event.ownedStart0;
      work += ownedLength * pattern.length * (both ? 2 : 1);
      if (work > maxWork) throw new Error(`Pattern scan exceeds the ${maxWork.toLocaleString()}-symbol comparison budget. Use a shorter pattern, one strand, or fewer records.`);
      const add = (match, strand, localStart0, localEnd0) => {
        const start0 = event.segmentStart0 + localStart0;
        if (start0 < event.ownedStart0 || start0 >= event.ownedEnd0) return;
        const contextDetails = makeSequenceContext(event.text, localStart0 + 1, localEnd0);
        const retained = {
          start: start0 + 1,
          end: event.segmentStart0 + localEnd0,
          length: localEnd0 - localStart0,
          matchedText: match.matchedText,
          strand,
          context: contextDetails
        };
        retainedRowCharacters += JSON.stringify(retained).length;
        if (retainedRowCharacters > maxOutputCharacters) throw new Error("Pattern hit table exceeds the materialized-output limit. Narrow the pattern or choose fewer records.");
        current.matches.push(retained);
        totalMatches += 1;
        if (totalMatches > maxMatches) throw new Error(`Pattern matches exceed the ${maxMatches.toLocaleString()}-hit limit. Narrow the pattern or select fewer records.`);
      };
      for (const match of findPatternMatches(event.text, pattern, searchOptions, context)) {
        add(match, "+", match.start - 1, match.end);
      }
      if (both) {
        const reverse = reverseComplement(event.text);
        for (const match of findPatternMatches(reverse, pattern, searchOptions, context)) {
          add(match, "-", reverse.length - match.end, reverse.length - match.start + 1);
        }
      }
      await context.yieldIfNeeded?.();
      continue;
    }
    if (event.type === "record-end" && current) {
      current.cleanedLength = event.length;
      current.sequence = current.sequenceChunks.join("");
      delete current.sequenceChunks;
      if (sourceLetterCount >= 12 && sourceProteinLetters) warnings.push(`${current.title}: input contains letters commonly found in protein sequences. If this is protein, use Protein Pattern Finder.`);
      if (regexMode) {
        current.matches = findDnaRnaMatches(current.sequence, pattern, { ...options, maxMatches, maxMatchedCharacters: maxOutputCharacters - regexMatchedCharacters }, context);
        regexMatchedCharacters += current.matches.reduce((n, match) => n + match.length, 0);
        totalMatches += current.matches.length;
        if (totalMatches > maxMatches) throw new Error(`Pattern matches exceed the ${maxMatches.toLocaleString()}-hit limit.`);
      }
      basesProcessed += event.length;
      charactersRemoved += event.removedCount;
      if (event.removedCount > 0) warnings.push(`${current.title}: removed ${event.removedCount} non-DNA/RNA character(s).`);
      if (event.length === 0) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      if (!regexMode && options.allowOverlaps === false) {
        const forward = current.matches.filter((match) => match.strand === "+").sort((a, b) => a.start - b.start);
        const reverse = current.matches.filter((match) => match.strand === "-").sort((a, b) => b.start - a.start);
        const selected = [];
        let next = 1;
        for (const match of forward) if (match.start >= next) { selected.push(match); next = match.end + 1; }
        next = event.length;
        for (const match of reverse) if (match.end <= next) { selected.push(match); next = match.start - 1; }
        current.matches = selected;
      }
      current.matches.sort((a, b) => a.start - b.start || a.end - b.end || a.strand.localeCompare(b.strand));
      records.push(current);
      current = null;
      context.reportProgress?.({ phase: "scanning", recordsProcessed: records.length, progress: Math.min(0.9, 0.1 + (basesProcessed / MAX_STREAMED_PATTERN_BASES) * 0.8) });
    }
  }
  warnings.push(...opened.warnings);
  if (!records.length) return makeToolResult({ output: "", warnings: [opened.source.stats.inputProvided ? "No DNA/RNA records were found." : "No sequence input was provided.", ...warnings], recordsProcessed: 0, basesProcessed: 0, charactersRemoved });
  totalMatches = records.reduce((sum, record) => sum + record.matches.length, 0);
  context.throwIfCancelled?.();
  const result = buildPatternResult(records, pattern, options, warnings, basesProcessed, charactersRemoved, context);
  if (result.output.length > maxOutputCharacters) throw new Error("Pattern output exceeds the materialized-output limit. Narrow the pattern or select fewer records.");
  return result;
}
