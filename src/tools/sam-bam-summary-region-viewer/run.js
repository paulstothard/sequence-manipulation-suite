import {
  analyzeSam,
  analyzeSamChunks,
  makeSamTableTsv,
  renderSamRegionSvg,
  samAlignmentColumns,
  samCoverageColumns,
  samFlagColumns,
  samReferenceColumns
} from "../../core/sam-bam-summary.js";
import { streamTextFileChunks } from "../../core/compressed-text-reader.js";
import {
  hasIndexedBamInputs,
  readIndexedBamRegion
} from "../../core/indexed-genomics/indexed-bam-reader.js";
import { makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { makeSamViewerData } from "../../core/alignment-viewer-data.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["report", "coverage-tsv", "alignment-tsv", "reference-tsv", "flag-tsv", "region-svg", "interactive-viewer"]);
const SOURCE_MODES = new Set(["sam-text", "indexed-bam"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

function normalizeSourceMode(value, options = {}) {
  if (SOURCE_MODES.has(value)) {
    return value;
  }
  return hasIndexedBamInputs(options) ? "indexed-bam" : "sam-text";
}

function isInteractiveViewerFormat(value) {
  return value === "interactive-viewer";
}

export async function runSamBamSummaryRegionViewer(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const sourceMode = normalizeSourceMode(options.dataSourceMode, options);
  if (sourceMode === "indexed-bam" && !hasIndexedBamInputs(options)) {
    throw new Error("Indexed BAM mode requires a BAM file and its matching BAI or CSI index.");
  }
  let effectiveInput = input;
  let indexedBamWarnings = [];
  let indexedBamEngineLabel = "";
  const useIndexedBam = sourceMode === "indexed-bam";
  if (useIndexedBam) {
    const indexedRegion = await readIndexedBamRegion(options, context);
    effectiveInput = indexedRegion.samText;
    indexedBamWarnings = indexedRegion.warnings;
    indexedBamEngineLabel = indexedRegion.engineLabel || indexedRegion.engine || "";
  }
  const result = !useIndexedBam && options.samInputFile?.stream
    ? await analyzeSamChunks(
        streamTextFileChunks(options.samInputFile, {
          onProgress: (detail) => context.reportProgress?.({
            ...detail,
            phase: detail.phase === "decompressing-text" ? "decompressing-sam" : "reading-sam"
          })
        }),
        options,
        context
      )
    : analyzeSam(effectiveInput, options, context);
  if (indexedBamWarnings.length > 0) {
    result.warnings.push(...indexedBamWarnings);
  }
  if (useIndexedBam) {
    result.report = [
      result.report,
      "",
      "Indexed BAM query:",
      indexedBamEngineLabel ? `- Reader: ${indexedBamEngineLabel}` : "",
      ...indexedBamWarnings.map((warning) => `- ${warning}`)
    ].filter(Boolean).join("\n");
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const alignmentRows = outputFormat === "alignment-tsv"
    ? result.regionRows
    : result.alignments;
  const viewer = isInteractiveViewerFormat(outputFormat)
    ? await makeSamViewerData(result, options, result.warnings, context)
    : null;
  const outputs = {
    report: result.report,
    "coverage-tsv": makeSamTableTsv(samCoverageColumns, result.coverageRows),
    "alignment-tsv": makeSamTableTsv(samAlignmentColumns, alignmentRows),
    "reference-tsv": makeSamTableTsv(samReferenceColumns, result.referenceRows),
    "flag-tsv": makeSamTableTsv(samFlagColumns, result.flagRows),
    "region-svg": renderSamRegionSvg(result, options),
    "interactive-viewer": viewer ? JSON.stringify(viewer, null, 2) : ""
  };
  const filenames = {
    report: "sam-bam-summary-region-viewer.txt",
    "coverage-tsv": "sam-bam-coverage-statistics.tsv",
    "alignment-tsv": "sam-alignments.tsv",
    "reference-tsv": "sam-references.tsv",
    "flag-tsv": "sam-flags.tsv",
    "region-svg": "sam-region-map.svg",
    "interactive-viewer": "sam-bam-alignment-viewer.json"
  };
  const mimeTypes = {
    report: "text/plain;charset=utf-8",
    "coverage-tsv": "text/tab-separated-values;charset=utf-8",
    "alignment-tsv": "text/tab-separated-values;charset=utf-8",
    "reference-tsv": "text/tab-separated-values;charset=utf-8",
    "flag-tsv": "text/tab-separated-values;charset=utf-8",
    "region-svg": "image/svg+xml;charset=utf-8",
    "interactive-viewer": "application/json;charset=utf-8"
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  const alignmentsProcessed = viewer
    ? (viewer.records ?? []).reduce((sum, record) => sum + (record.tracks?.[0]?.items?.length ?? 0), 0)
    : result.alignmentLines;

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: filenames[outputFormat],
      mimeType: mimeTypes[outputFormat]
    },
    warnings: result.warnings,
    recordsProcessed: alignmentsProcessed,
    basesProcessed: alignmentsProcessed,
    processedUnitLabel: "alignment",
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(result.report, "text/plain") } : {}),
      ...(outputFormat === "alignment-tsv"
        ? { alignments: makeTableStream(samAlignmentColumns, alignmentRows, "sam-alignments") }
        : {}),
      ...(outputFormat === "coverage-tsv"
        ? { coverage: makeTableStream(samCoverageColumns, result.coverageRows, "sam-coverage") }
        : {}),
      ...(outputFormat === "reference-tsv"
        ? { references: makeTableStream(samReferenceColumns, result.referenceRows, "sam-references") }
        : {}),
      ...(outputFormat === "flag-tsv"
        ? { flags: makeTableStream(samFlagColumns, result.flagRows, "sam-flags") }
        : {}),
      ...(outputFormat === "region-svg" ? { regionSvg: makeTextStream(outputs["region-svg"], "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: outputFormat === "region-svg"
      ? { svg: outputs["region-svg"], pngDownload: true }
      : viewer
        ? { viewer }
        : undefined
  });
}
