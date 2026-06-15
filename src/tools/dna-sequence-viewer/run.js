import { parseSequenceInput } from "../../core/fasta.js";
import {
  makeBiologicalRecordViewerRecords,
  parseBiologicalRecordInput
} from "../../core/biological-record-format-converter.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { cleanDnaRnaSequence } from "../../core/sequence.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

function normalizeOptions(options = {}, forcedLayout = "") {
  const topology = forcedLayout === "circular" || options.topology === "circular"
    ? "circular"
    : "linear";
  const legacyCompositionMode = ["none", "gc", "gc-skew", "gc-and-skew"].includes(options.compositionTracks)
    ? options.compositionTracks
    : "none";
  const customWindowSize = Number.parseInt(options.compositionWindowSize, 10);
  return {
    topology,
    geneticCode: String(options.geneticCode ?? "1"),
    compositionControls: {
      enabled: true,
      showGcPercent: legacyCompositionMode === "gc" || legacyCompositionMode === "gc-and-skew",
      showGcSkew: legacyCompositionMode === "gc-skew" || legacyCompositionMode === "gc-and-skew",
      autoWindow: !(Number.isFinite(customWindowSize) && customWindowSize > 0),
      windowSize: Number.isFinite(customWindowSize) && customWindowSize > 0 ? customWindowSize : undefined
    }
  };
}

async function parsePlainSequenceViewerRecords(input, normalized, context, warnings) {
  const sequenceRecords = parseSequenceInput(input, "sequence");
  let basesProcessed = 0;
  let charactersRemoved = 0;
  const records = [];
  for (const [recordIndex, record] of sequenceRecords.entries()) {
    context.throwIfCancelled?.();
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
    records.push({
      title: record.title,
      sequence: cleaned.sequence,
      length: cleaned.sequence.length,
      topology: normalized.topology,
      compositionControls: normalized.compositionControls,
      tracks: []
    });
    context.reportProgress?.({
      phase: "preparing-records",
      progress: 0.1 + ((recordIndex + 1) / Math.max(1, sequenceRecords.length)) * 0.65,
      record: record.title,
      currentRecord: recordIndex + 1,
      totalRecords: sequenceRecords.length
    });
    await context.yieldIfNeeded?.();
  }
  return { records, basesProcessed, charactersRemoved };
}

function countTrackItems(record) {
  return (record.tracks ?? []).reduce((sum, track) => sum + (track.items?.length ?? 0), 0);
}

function makeDnaViewerSummaryReport(records, normalized, metrics) {
  const layoutLabel = normalized.topology === "circular" ? "Circular DNA sequence viewer" : "Linear DNA sequence viewer";
  const featureCount = records.reduce((sum, record) => sum + countTrackItems(record), 0);
  const lines = [
    `${layoutLabel} summary report`,
    "",
    `Records: ${records.length.toLocaleString()}`,
    `Bases: ${metrics.basesProcessed.toLocaleString()}`,
    `Layout: ${normalized.topology}`,
    `Feature track items: ${featureCount.toLocaleString()}`
  ];

  if (metrics.charactersRemoved > 0) {
    lines.push(`Characters removed during cleanup: ${metrics.charactersRemoved.toLocaleString()}`);
  }

  lines.push("", "Record details");
  for (const record of records) {
    const trackCount = (record.tracks ?? []).length;
    const trackItems = countTrackItems(record);
    const recordLength = Number.isFinite(record.length) ? record.length : record.sequence.length;
    lines.push(`- ${record.title}: ${recordLength.toLocaleString()} bp; ${trackCount.toLocaleString()} track(s); ${trackItems.toLocaleString()} feature item(s)`);
  }

  return lines.join("\n");
}

function filterNucleotideRecords(records) {
  return records.filter((record) => record.sequence && record.molecule !== "protein");
}

async function runDnaSequenceViewerWithLayout(input, options = {}, context = {}, layout = "linear") {
  const normalized = normalizeOptions(options, layout);
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const warnings = [];
  const parsed = parseBiologicalRecordInput(input, options);
  warnings.push(...parsed.warnings);
  const annotatedRecords = filterNucleotideRecords(parsed.records);
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let records = [];

  if (annotatedRecords.length > 0) {
    records = makeBiologicalRecordViewerRecords(annotatedRecords, {
      topology: normalized.topology,
      compositionControls: normalized.compositionControls
    });
    basesProcessed = records.reduce((sum, record) => sum + record.sequence.length, 0);
    warnings.push(`Input: parsed ${annotatedRecords.length.toLocaleString()} annotated nucleotide record(s) as ${parsed.sourceFormat}.`);
    await context.yieldIfNeeded?.();
  } else {
    const plain = await parsePlainSequenceViewerRecords(input, normalized, context, warnings);
    records = plain.records;
    basesProcessed = plain.basesProcessed;
    charactersRemoved = plain.charactersRemoved;
  }

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: warnings.length > 0
        ? [...warnings, "No nucleotide sequence records were found."]
        : ["No nucleotide sequence records were found."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  if (options.outputFormat === "report") {
    context.reportProgress?.({ phase: "building-output", progress: 0.85 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();

    const output = makeDnaViewerSummaryReport(records, normalized, {
      basesProcessed,
      charactersRemoved
    });
    context.reportProgress?.({ phase: "finished", progress: 1 });
    return makeToolResult({
      output,
      download: {
        filename: normalized.topology === "circular"
          ? "circular-dna-sequence-viewer-report.txt"
          : "linear-dna-sequence-viewer-report.txt",
        mimeType: "text/plain;charset=utf-8"
      },
      warnings,
      recordsProcessed: records.length,
      basesProcessed,
      charactersRemoved,
      streams: {
        report: makeTextStream(output, "text/plain")
      }
    });
  }

  const title = normalized.topology === "circular"
    ? "Circular DNA sequence viewer"
    : "Linear DNA sequence viewer";
  const viewer = makeDnaViewerData(records, {
    title,
    geneticCode: normalized.geneticCode,
    layout: normalized.topology
  });
  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const output = JSON.stringify(viewer, null, 2);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: normalized.topology === "circular"
        ? "circular-dna-sequence-viewer.json"
        : "linear-dna-sequence-viewer.json",
      mimeType: "application/json;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      viewer: makeDnaViewerStream(viewer)
    },
    visual: { viewer }
  });
}

export async function runDnaSequenceViewer(input, options = {}, context = {}) {
  return runDnaSequenceViewerWithLayout(input, options, context, options.topology === "circular" ? "circular" : "linear");
}

export async function runLinearDnaSequenceViewer(input, options = {}, context = {}) {
  return runDnaSequenceViewerWithLayout(input, options, context, "linear");
}

export async function runCircularDnaSequenceViewer(input, options = {}, context = {}) {
  return runDnaSequenceViewerWithLayout(input, options, context, "circular");
}

export const dnaSequenceViewerRunner = runDnaSequenceViewer;
