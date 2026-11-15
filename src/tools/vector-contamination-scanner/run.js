import { exportDelimitedTable } from '../../core/table.js';
import { normalizeVectorOptions, VECTOR_SCAN_LIMITS, VECTOR_MATCH_MODEL } from '../../core/vector-contamination-options.js';
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { iterateFastaFixedWindowSegments } from "../../core/fasta-fixed-window-segments.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import {
  scanVectorContaminationRecordAsync,
  deduplicateMergeAndSortRows,
  vectorContaminationTableColumns
} from "../../core/vector-contamination-scanner.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS } from "../fasta-input-policy.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";

export const VECTOR_CONTAMINATION_SVG_MAP_HIT_THRESHOLD = VECTOR_SCAN_LIMITS.mapHits;
const MAX_STREAMED_VECTOR_BASES = VECTOR_SCAN_LIMITS.inputCharacters;
const MAX_VECTOR_QUERY_WINDOWS = VECTOR_SCAN_LIMITS.queryWindows;
const MAX_VECTOR_SEED_EXTENSIONS = VECTOR_SCAN_LIMITS.seedExtensions;
const MAX_VECTOR_CANDIDATE_ROWS = VECTOR_SCAN_LIMITS.candidateRows;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = VECTOR_SCAN_LIMITS.outputCharacters;


let vectorReferenceDataPromise;

async function loadVectorReferenceData() {
  vectorReferenceDataPromise ??= Promise.all([
    import("../../reference-data/vector-contamination/index.json", { with: { type: "json" } }),
    import("../../reference-data/vector-contamination/summary.json", { with: { type: "json" } }),
    import("../../reference-data/vector-contamination/provenance.json", { with: { type: "json" } })
  ]).then(([index, summary, provenance]) => ({
    index: index.default,
    summary: summary.default,
    provenance: provenance.default
  }));
  return vectorReferenceDataPromise;
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

function truncateText(value, maxLength = 44) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function makeVectorReferenceLabel(row, maxLength = 44) {
  const name = row.reference_name || row.reference_id || "vector reference";
  const accession = row.source_accession && row.source_accession !== row.reference_id
    ? ` (${row.source_accession})`
    : "";
  return truncateText(`${name}${accession}`, maxLength);
}

function makeVectorReferenceDetails(row) {
  return [
    row.reference_name,
    row.source_accession ? `accession ${row.source_accession}` : "",
    row.reference_id ? `id ${row.reference_id}` : ""
  ].filter(Boolean).join("; ");
}

function formatReport({ rows, recordsProcessed, basesProcessed, summary, provenance, recordSummaries }) {
  const omitted = recordSummaries.reduce((sum, record) => sum + record.hitsOmitted, 0);
  const lines = [
    "Vector contamination scanner",
    "",
    `Input records scanned: ${recordsProcessed}`,
    `Bases scanned: ${basesProcessed}`,
    `Reference dataset: ${summary.dataset}`,
    `Reference version: ${summary.version}`,
    `Reference records searched: ${summary.recordCount}`,
    `Reference source: ${summary.sourceName}`,
    `Hits reported: ${rows.length}`,
    `Hits omitted by per-record cap: ${omitted}`,
    `Confidence summary: ${formatCounts(countBy(rows, "confidence"))}`,
    `Source summary: ${formatCounts(countBy(rows, "source_database"))}`,
    `Match model: ${summary.matchModel}`
  ];

  if (provenance.redistribution) {
    lines.push(`Reference note: ${provenance.redistribution}`);
  }

  lines.push("");
  lines.push("Record summary:");
  for (const record of recordSummaries) {
    const capNote = record.hitsOmitted > 0 ? `; ${record.hitsOmitted} omitted by cap` : "";
    lines.push(`Record ${record.recordIndex} (${record.title}): ${record.sequenceLength} bases; ${record.hitsReported} hits reported${capNote}`);
  }

  lines.push("");
  if (rows.length === 0) {
    lines.push("No candidate matches passed the selected thresholds.");
    return lines.join("\n");
  }

  lines.push("Hits:");
  for (const row of rows) {
    lines.push(
      `Record ${row.record_index} (${row.record}): ${makeVectorReferenceDetails(row)}; ${row.aligned_length} bases; ${row.confidence}; ${row.strand}:${row.query_start}-${row.query_end}; identity ${Number(row.percent_identity.toPrecision(6))}%`
    );
  }

  return lines.join("\n");
}

function formatTsv(rows) {
  return exportDelimitedTable(vectorContaminationTableColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

function makeTextMap(analyzedRecords) {
  return renderTextAnnotationMapFromItems(analyzedRecords.map((record) => ({
    title: record.title,
    sequence: record.cleanedSequence,
    items: record.rows.map((row) => ({
      start: row.query_start,
      end: row.query_end,
      strand: row.strand,
      label: makeVectorReferenceLabel(row, 40)
    }))
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    headerPrefix: ""
  });
}

function makeSvgMap(analyzedRecords, maxHits = VECTOR_CONTAMINATION_SVG_MAP_HIT_THRESHOLD) {
  let remaining = maxHits;
  const mapRecords = analyzedRecords.map((record) => {
    const features = [];
    for (const row of record.rows) {
      if (remaining <= 0) {
        break;
      }
      remaining -= 1;
      features.push({
        start: row.query_start,
        end: row.query_end,
        strand: row.strand,
        label: makeVectorReferenceLabel(row, 36),
        type: row.confidence,
        className: row.confidence === "strong" ? "strong" : row.confidence === "moderate" ? "moderate" : "low"
      });
    }
    return {
      title: record.title,
      length: record.sequenceLength,
      topology: "linear",
      molecule: "dna",
      features,
      notes: [
        `${features.length} hits shown; ${record.rows.length - features.length} omitted from map.` +
        (record.hitsOmitted > 0 ? ` ${record.hitsOmitted} additional hits omitted by per-record cap.` : "")
      ]
    };
  });
  return renderSequenceMap({
    title: "Vector contamination hit map",
    records: mapRecords,
    styles: {
      strong: { label: "Strong hit", fill: "#dc2626", stroke: "#991b1b" },
      moderate: { label: "Moderate hit", fill: "#f97316", stroke: "#c2410c" },
      low: { label: "Low-confidence hit", fill: "#facc15", stroke: "#ca8a04" }
    }
  });
}

function isInteractiveViewerFormat(outputFormat) {
  return outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
}

function makeVectorViewerData(analyzedRecords, options = {}) {
  const layout = options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear";
  return makeDnaViewerData(analyzedRecords.map((record) => ({
    title: record.title,
    sequence: record.cleanedSequence,
    length: record.sequenceLength,
    topology: layout,
    tracks: record.rows.length > 0
      ? [
          {
            id: "vector-contamination-hits",
            type: "features",
            label: "Vector contamination hits",
            layout: "stacked-intervals",
            featureOpacity: 0.72,
            items: record.rows.map((row) => ({
              start: row.query_start,
              end: row.query_end,
              length: row.aligned_length,
              strand: row.strand,
              label: makeVectorReferenceLabel(row, 44),
              name: row.reference_name,
              type: row.confidence,
              featureType: row.confidence,
              referenceId: row.reference_id,
              referenceName: row.reference_name,
              referenceAccession: row.source_accession,
              referenceCoordinates: `${row.reference_start}-${row.reference_end}`,
              percentIdentity: row.percent_identity,
              mismatches: row.mismatches,
              gaps: row.gaps,
              score: row.score,
              source: [row.source_database, row.source_accession].filter(Boolean).join(" "),
              matchedText: row.matched_text,
              vectorConfidence: row.confidence
            }))
          }
        ]
      : []
  })), {
    title: "Vector contamination viewer",
    layout
  });
}

function makeVectorResult({ analyzedRecords, options, warnings, notes, basesProcessed, charactersRemoved, summary, provenance }) {
  const outputFormat = options.outputFormat;
  const rows = analyzedRecords.flatMap(record => record.rows);
  const report = outputFormat === "report" ? formatReport({
    rows,
    recordsProcessed: analyzedRecords.length,
    basesProcessed,
    summary,
    provenance,
    recordSummaries: analyzedRecords.map((record, index) => ({
      recordIndex: index + 1,
      title: record.title,
      sequenceLength: record.sequenceLength,
      hitsReported: record.rows.length,
      hitsOmitted: record.hitsOmitted
    }))
  }) : "";
  const tsv = outputFormat === "tsv" ? formatTsv(rows) : "";
  if (outputFormat === "svg-map" && rows.length > VECTOR_CONTAMINATION_SVG_MAP_HIT_THRESHOLD) {
    warnings.push(`Linear contamination map output is capped at ${VECTOR_CONTAMINATION_SVG_MAP_HIT_THRESHOLD.toLocaleString()} shown hits. Use the table for all retained hit coordinates.`);
  }
  const textMap = outputFormat === "text-map" ? makeTextMap(analyzedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(analyzedRecords) : "";
  const viewer = isInteractiveViewerFormat(outputFormat) ? makeVectorViewerData(analyzedRecords, { outputFormat }) : null;
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
      filename: `vector-contamination-scanner.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
      mimeType: outputFormat === "tsv"
        ? "text/tab-separated-values"
        : outputFormat === "svg-map"
          ? "image/svg+xml"
          : viewer
            ? "application/json;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    notes,
    recordsProcessed: analyzedRecords.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(outputFormat === "tsv" ? { table: makeTableStream(vectorContaminationTableColumns, rows, "vector-contamination-scanner") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", alphabet: "dna-rna", plainMapHeadings: true }) } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : viewer
        ? { viewer }
        : undefined
  });
}

async function runStreamedVectorContaminationScanner(input, options, context, index, summary, provenance) {
  const maxQueryWindows = effectiveToolLimit(options, "vectorWindows", MAX_VECTOR_QUERY_WINDOWS);
  const maxSeedExtensions = effectiveToolLimit(options, "vectorSeedExtensions", MAX_VECTOR_SEED_EXTENSIONS);
  const maxCandidateRows = effectiveToolLimit(options, "vectorCandidates", MAX_VECTOR_CANDIDATE_ROWS);
  const maxOutputCharacters = effectiveToolLimit(options, "vectorOutput", MAX_MATERIALIZED_OUTPUT_CHARACTERS);
  const outputFormat = options.outputFormat;
  const richOutput = !["report", "tsv", "svg-map"].includes(outputFormat);
  if (richOutput && (options.loadedFastaFile?.stream || ["indexed", "bgzf"].includes(options.sourceMode) || String(input ?? "").length > MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS)) throw new Error("Large FASTA vector scans support report, table, and linear map output. Text maps and sequence viewers require bounded pasted input.");
  const maxReferenceLength = Math.max(1, ...index.records.map((record) => record.sequence.length));
  if (maxReferenceLength + 20 > 65_536) throw new Error("Bundled vector references exceed the fixed-window scan length for large FASTA sources.");
  const sourceOptions = applyDisabledFastaSourceLimits({ ...options, sourceChunkSize: Math.min(65536, Number(options.sourceChunkSize) || 65536), maxSourceBases: Math.min(MAX_STREAMED_VECTOR_BASES, Number(options.maxSourceBases) || MAX_STREAMED_VECTOR_BASES) }, {
    maxSourceBases: "vectorSource",
    maxSourceRecords: "vectorSource",
    maxDecodedSourceBytes: "vectorSource",
    maxSourceBytes: "vectorSource"
  });
  let sourceGapCount = 0;
  let containsUracil = false;
  const opened = await openCleanDnaRnaFastaSource(input, {
    ...sourceOptions, strictHeaders: true,
    onSourceChunk: text => {
      sourceGapCount += (text.match(/[-.]/g) ?? []).length;
      containsUracil ||= /u/i.test(text);
    }
  }, context);
  const analyzedRecords = [];
  const warnings = [];
  const notes = [
    `Reference: ${summary.sourceName}, ${summary.sourceVersion}; ${summary.recordCount.toLocaleString("en-US")} sequences.`,
    `Candidate screen: exact ${index.kmerLength}-base seeds and ungapped +${VECTOR_MATCH_MODEL.matchScore}/${VECTOR_MATCH_MODEL.mismatchPenalty} extension (X-drop ${VECTOR_MATCH_MODEL.xDrop}); confidence tiers use alignment length and identity.`
  ];
  const scanBudget = { queryWindows: 0, seedExtensions: 0, candidateRows: 0, maxQueryWindows, maxSeedExtensions, maxCandidateRows };
  let current = null;
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let retainedRowCharacters = 0;
  async function* sourceEvents() {
    for await (const event of opened.events()) {
      if (event.type === "sequence-chunk" && richOutput && current) current.cleanedSequence += event.text;
      yield event;
    }
  }
  for await (const event of iterateFastaFixedWindowSegments(sourceEvents(), { maxWindowLength: maxReferenceLength + 20 })) {
    if (event.type === "record-start") {
      sourceGapCount = 0;
      current = { title: event.title ?? `sequence ${analyzedRecords.length + 1}`, cleanedSequence: "", sequenceLength: 0, candidateRows: [] };
      continue;
    }
    if (event.type === "scan-segment") {
      context.reportProgress?.({ phase: "scanning", recordsProcessed: analyzedRecords.length, basesProcessed: basesProcessed + event.ownedEnd0 });
      const result = await scanVectorContaminationRecordAsync({ title: current.title, sequence: event.text }, index, options, { ...context, scanBudget, maxRetainedHits: maxCandidateRows });
      for (const row of result.rows) {
        const start0 = event.segmentStart0 + row.query_start - 1;
        if (start0 < event.ownedStart0 || start0 >= event.ownedEnd0) continue;
        const retained = { ...row, query_start: start0 + 1, query_end: event.segmentStart0 + row.query_end };
        retainedRowCharacters += JSON.stringify(retained).length;
        if (retainedRowCharacters > maxOutputCharacters) throw new Error("Vector candidate-hit table exceeds the materialized-output limit.");
        current.candidateRows.push(retained);
      }
      await context.yieldIfNeeded?.();
      continue;
    }
    if (event.type === "record-end" && current) {
      current.sequenceLength = event.length;
      basesProcessed += event.length;
      charactersRemoved += event.removedCount;
      if (sourceGapCount) notes.push(`Record ${analyzedRecords.length + 1} (${current.title}): removed ${sourceGapCount} alignment gap character(s); coordinates refer to the cleaned sequence.`);
      if (event.removedCount > sourceGapCount) warnings.push(`${current.title}: removed ${event.removedCount - sourceGapCount} non-DNA/RNA character(s); coordinates refer to the cleaned sequence.`);
      if (!event.length) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      const enforcedHitsPerRecord = options.maxHitsPerRecord;
      const cappedHits = effectiveToolLimit(options, "maxHitsPerRecord", enforcedHitsPerRecord);
      const merged = deduplicateMergeAndSortRows(current.candidateRows, cappedHits);
      current.rows = merged.rows;
      for (const row of current.rows) row.record_index = analyzedRecords.length + 1;
      current.hitsOmitted = merged.hitsOmitted;
      current.totalMergedRows = merged.totalMergedRows;
      current.totalCandidateRows = merged.totalCandidateRows;
      if (merged.hitsOmitted) warnings.push(`${current.title}: ${merged.hitsOmitted} hit(s) omitted by the per-record report cap.`);
      delete current.candidateRows;
      analyzedRecords.push(current);
      current = null;
      context.reportProgress?.({ phase: "scanning", recordsProcessed: analyzedRecords.length, progress: Math.min(0.95, 0.05 + basesProcessed / MAX_STREAMED_VECTOR_BASES * 0.9) });
    }
  }
  warnings.push(...opened.warnings);
  if (!analyzedRecords.length) return makeToolResult({ output: "", warnings: ["No DNA/RNA sequence input was provided.", ...warnings], recordsProcessed: 0, basesProcessed: 0, charactersRemoved: 0, streams: options.outputFormat === "tsv" ? { table: makeTableStream(vectorContaminationTableColumns, [], "vector-contamination-scanner") } : {} });
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "building-output", progress: 0.98 });
  if (containsUracil) notes.push("U is compared as T; original U symbols are retained in sequence outputs.");
  const result = makeVectorResult({ analyzedRecords, options, warnings, notes, basesProcessed, charactersRemoved, summary, provenance });
  if (result.output.length > maxOutputCharacters || JSON.stringify(result).length > maxOutputCharacters) throw new Error("Vector-scan output exceeds the materialized-output limit.");
  context.throwIfCancelled?.();
  return { ...result, optionsUsed: { sourceMode: opened.sourceMode, limits: Object.fromEntries(Object.entries({ ...opened.source.limits, queryWindows: maxQueryWindows, seedExtensions: maxSeedExtensions, candidateRows: maxCandidateRows, outputCharacters: maxOutputCharacters }).map(([key, value]) => [key, value === Infinity ? "disabled" : value])) } };
}

async function runVectorContaminationScannerInternal(input, options, context) {
  context.reportProgress?.({ phase: "loading-reference-data", progress: 0.05 });
  const { index, summary, provenance } = await loadVectorReferenceData();
  context.throwIfCancelled?.();
  return runStreamedVectorContaminationScanner(input, options, context, index, summary, provenance);
}

export async function runVectorContaminationScanner(input, options = {}, context = {}) {
  const optionsUsed = normalizeVectorOptions(options);
  let lastYield = performance.now();
  const pacedContext = { ...context, yieldIfNeeded: async () => {
    context.throwIfCancelled?.();
    if (performance.now() - lastYield >= 8) { await context.yieldIfNeeded?.(); lastYield = performance.now(); }
    context.throwIfCancelled?.();
  } };
  const result = await runVectorContaminationScannerInternal(input, { ...options, ...optionsUsed }, pacedContext);
  return { ...result, optionsUsed: { ...optionsUsed, ...result.optionsUsed } };
}
