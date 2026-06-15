import {
  gffGtfFeatureColumns,
  makeGffGtfFeatureTable,
  extractGffGtfFeatures
} from "../../core/gff-gtf-feature-extractor.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set([
  "feature-table",
  "transcript-fasta",
  "cds-fasta",
  "protein-fasta",
  "gff3",
  "report"
]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "feature-table";
}

function selectedOutput(result, outputFormat) {
  if (outputFormat === "transcript-fasta") return result.transcriptFasta;
  if (outputFormat === "cds-fasta") return result.cdsFasta;
  if (outputFormat === "protein-fasta") return result.proteinFasta;
  if (outputFormat === "gff3") return result.gff3;
  if (outputFormat === "report") return result.report;
  return makeGffGtfFeatureTable(result.featureRows);
}

function downloadMetadata(outputFormat) {
  if (outputFormat === "transcript-fasta") {
    return { filename: "gff-gtf-transcripts.fasta", mimeType: "text/plain;charset=utf-8" };
  }
  if (outputFormat === "cds-fasta") {
    return { filename: "gff-gtf-cds.fasta", mimeType: "text/plain;charset=utf-8" };
  }
  if (outputFormat === "protein-fasta") {
    return { filename: "gff-gtf-proteins.fasta", mimeType: "text/plain;charset=utf-8" };
  }
  if (outputFormat === "gff3") {
    return { filename: "normalized-features.gff3", mimeType: "text/plain;charset=utf-8" };
  }
  if (outputFormat === "report") {
    return { filename: "gff-gtf-feature-extractor-report.txt", mimeType: "text/plain;charset=utf-8" };
  }
  return { filename: "gff-gtf-feature-table.tsv", mimeType: "text/tab-separated-values;charset=utf-8" };
}

export async function runGffGtfFeatureExtractor(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const result = await extractGffGtfFeatures(input, { ...options, outputFormat }, context);
  const tableText = makeGffGtfFeatureTable(result.featureRows);
  const streams = {
    table: makeTableStream(gffGtfFeatureColumns, result.featureRows, "gff-gtf-features"),
    transcriptFasta: makeTextStream(result.transcriptFasta, "text/plain"),
    cdsFasta: makeTextStream(result.cdsFasta, "text/plain"),
    proteinFasta: makeTextStream(result.proteinFasta, "text/plain"),
    gff3: makeTextStream(result.gff3, "text/plain"),
    report: makeTextStream(result.report, "text/plain")
  };

  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat),
    warnings: result.warnings,
    recordsProcessed: result.recordsProcessed,
    basesProcessed: result.basesProcessed,
    streams,
    optionsUsed: {
      ...result.options,
      outputFormat,
      inputFormat: result.format,
      engine: result.engine,
      features: result.featureRows.length,
      transcripts: result.transcripts.length,
      tableBytes: tableText.length
    }
  });
}
