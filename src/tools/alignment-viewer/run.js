import {
  analyzeSam,
  analyzeSamChunks,
  makeSamTableTsv,
  samAlignmentColumns
} from "../../core/sam-bam-summary.js";
import { streamTextFileChunks } from "../../core/compressed-text-reader.js";
import {
  hasIndexedBamInputs,
  readIndexedBamRegion
} from "../../core/indexed-genomics/indexed-bam-reader.js";
import {
  extractVcfData,
  extractVcfDataFromChunks
} from "../../core/vcf-genotype-table.js";
import {
  makeVcfTextFromIndexedRegion,
  readIndexedVcfRegion,
  hasIndexedVcfInputs
} from "../../core/indexed-genomics/indexed-vcf-reader.js";
import { makeAlignmentViewerData } from "../../core/alignment-viewer-data.js";
import { makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["interactive-viewer", "alignment-tsv", "report"]);
const ALIGNMENT_SOURCE_MODES = new Set(["sam-text", "indexed-bam"]);
const VCF_SOURCE_MODES = new Set(["none", "paste-upload", "indexed-vcf"]);
const SPLIT_SEPARATOR = "##VCF";

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "interactive-viewer";
}

function normalizeAlignmentSourceMode(value, options = {}) {
  if (ALIGNMENT_SOURCE_MODES.has(value)) return value;
  return hasIndexedBamInputs(options) ? "indexed-bam" : "sam-text";
}

function normalizeVcfSourceMode(value, options = {}, vcfText = "") {
  if (VCF_SOURCE_MODES.has(value)) return value;
  if (hasIndexedVcfInputs(options)) return "indexed-vcf";
  return String(vcfText ?? "").trim() || options.vcfInputFile?.stream ? "paste-upload" : "none";
}

function parseSplitInput(input) {
  const text = String(input ?? "");
  const separator = new RegExp(`\\n?${SPLIT_SEPARATOR}\\s*\\n`, "u");
  const parts = text.split(separator);
  return {
    alignmentText: parts[0] ?? "",
    vcfText: parts.length > 1 ? parts.slice(1).join(`\n${SPLIT_SEPARATOR}\n`) : ""
  };
}

async function readAlignmentInput(alignmentText, options = {}, context = {}) {
  const sourceMode = normalizeAlignmentSourceMode(options.dataSourceMode, options);
  if (sourceMode === "indexed-bam") {
    if (!hasIndexedBamInputs(options)) {
      throw new Error("Indexed BAM mode requires a BAM file and its matching BAI or CSI index.");
    }
    const indexedRegion = await readIndexedBamRegion(options, context);
    const result = analyzeSam(indexedRegion.samText, options, context);
    if (indexedRegion.warnings.length > 0) {
      result.warnings.push(...indexedRegion.warnings);
    }
    result.report = [
      result.report,
      "",
      "Indexed BAM query:",
      indexedRegion.engineLabel ? `- Reader: ${indexedRegion.engineLabel}` : "",
      ...indexedRegion.warnings.map((warning) => `- ${warning}`)
    ].filter(Boolean).join("\n");
    return result;
  }

  if (options.samInputFile?.stream) {
    return analyzeSamChunks(
      streamTextFileChunks(options.samInputFile, {
        onProgress: (detail) => context.reportProgress?.({
          ...detail,
          phase: detail.phase === "decompressing-text" ? "decompressing-sam" : "reading-sam"
        })
      }),
      options,
      context
    );
  }
  return analyzeSam(alignmentText, options, context);
}

async function readVcfOverlayRows(vcfText, options = {}, warnings = [], context = {}) {
  const sourceMode = normalizeVcfSourceMode(options.vcfSourceMode, options, vcfText);
  if (sourceMode === "none") {
    return [];
  }
  const vcfOptions = {
    ...options,
    dataType: "region-variants"
  };
  if (sourceMode === "indexed-vcf") {
    if (!hasIndexedVcfInputs(options)) {
      throw new Error("Indexed VCF mode requires a bgzip-compressed VCF.GZ file and its matching TBI or CSI index.");
    }
    const indexedRegion = await readIndexedVcfRegion(options, context);
    warnings.push(...indexedRegion.warnings);
    const indexedText = makeVcfTextFromIndexedRegion(indexedRegion);
    if (!indexedText.trim()) {
      warnings.push("Indexed VCF query returned no header or variant lines for the requested region.");
      return [];
    }
    const result = extractVcfData(indexedText, vcfOptions, context);
    warnings.push(...result.warnings);
    return result.rows;
  }

  if (options.vcfInputFile?.stream) {
    const result = await extractVcfDataFromChunks(
      streamTextFileChunks(options.vcfInputFile, {
        onProgress: (detail) => context.reportProgress?.({
          ...detail,
          phase: detail.phase === "decompressing-text" ? "decompressing-vcf" : "reading-vcf"
        })
      }),
      vcfOptions,
      context
    );
    warnings.push(...result.warnings);
    return result.rows;
  }

  if (!String(vcfText ?? "").trim()) {
    return [];
  }
  const result = extractVcfData(vcfText, vcfOptions, context);
  warnings.push(...result.warnings);
  return result.rows;
}

function makeAlignmentViewerReport(samResult, vcfRows, warnings) {
  return [
    "Alignment Viewer",
    "",
    samResult.report,
    "",
    "Viewer overlays:",
    `- Region alignments: ${(samResult.regionRows ?? []).length.toLocaleString()}`,
    `- VCF variant markers: ${vcfRows.length.toLocaleString()}`,
    warnings.length > 0 ? "" : null,
    warnings.length > 0 ? "Warnings:" : null,
    ...warnings.map((warning) => `- ${warning}`)
  ].filter((line) => line !== null).join("\n");
}

export async function runAlignmentViewer(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.04 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const { alignmentText, vcfText } = parseSplitInput(input);
  const samResult = await readAlignmentInput(alignmentText, options, context);

  context.reportProgress?.({ phase: "reading-variant-overlay", progress: 0.45 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const overlayWarnings = [];
  const vcfRows = await readVcfOverlayRows(vcfText, options, overlayWarnings, context);
  samResult.warnings.push(...overlayWarnings);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const viewer = outputFormat === "interactive-viewer"
    ? await makeAlignmentViewerData({
        samResult,
        vcfRows,
        options,
        warnings: samResult.warnings,
        title: "Alignment Viewer",
        context
      })
    : null;
  const alignmentTsv = outputFormat === "alignment-tsv"
    ? makeSamTableTsv(samAlignmentColumns, samResult.regionRows)
    : "";
  const report = outputFormat === "report"
    ? makeAlignmentViewerReport(samResult, vcfRows, samResult.warnings)
    : "";
  const outputs = {
    "interactive-viewer": viewer ? JSON.stringify(viewer, null, 2) : "",
    "alignment-tsv": alignmentTsv,
    report
  };
  const filenames = {
    "interactive-viewer": "alignment-viewer.json",
    "alignment-tsv": "alignment-viewer-region-alignments.tsv",
    report: "alignment-viewer-summary.txt"
  };
  const mimeTypes = {
    "interactive-viewer": "application/json;charset=utf-8",
    "alignment-tsv": "text/tab-separated-values;charset=utf-8",
    report: "text/plain;charset=utf-8"
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  const alignmentsProcessed = viewer
    ? (viewer.records ?? []).reduce((sum, record) => {
        const readTrack = record.tracks?.find((track) => track.id === "sam-alignments");
        return sum + (readTrack?.items?.length ?? 0);
      }, 0)
    : samResult.regionRows.length;

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: filenames[outputFormat],
      mimeType: mimeTypes[outputFormat]
    },
    warnings: samResult.warnings,
    recordsProcessed: alignmentsProcessed,
    basesProcessed: alignmentsProcessed,
    processedUnitLabel: "alignment",
    streams: {
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      ...(outputFormat === "alignment-tsv"
        ? { alignments: makeTableStream(samAlignmentColumns, samResult.regionRows, "sam-alignments") }
        : {}),
      ...(outputFormat === "report" ? { report: makeTextStream(report, "text/plain") } : {})
    },
    visual: viewer ? { viewer } : undefined
  });
}
