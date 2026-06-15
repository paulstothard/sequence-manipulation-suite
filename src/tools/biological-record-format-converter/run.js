import {
  bedColumns,
  convertBiologicalRecord,
  gff3Columns,
  makeBiologicalRecordOutput
} from "../../core/biological-record-format-converter.js";
import { flatfileFeatureColumns } from "../../core/flatfile-records.js";
import { makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set([
  "whole-fasta",
  "cds-fasta",
  "protein-fasta",
  "feature-tsv",
  "gff3",
  "gff3-bundle",
  "gff3-fasta",
  "genbank",
  "embl",
  "ddbj",
  "bed",
  "bed-bundle",
  "bed-fasta",
  "viewer-json",
  "parsed-json",
  "report"
]);

const MIME_TYPES = {
  "whole-fasta": "text/x-fasta;charset=utf-8",
  "cds-fasta": "text/x-fasta;charset=utf-8",
  "protein-fasta": "text/x-fasta;charset=utf-8",
  "feature-tsv": "text/tab-separated-values;charset=utf-8",
  gff3: "text/plain;charset=utf-8",
  "gff3-bundle": "text/plain;charset=utf-8",
  "gff3-fasta": "text/plain;charset=utf-8",
  genbank: "text/plain;charset=utf-8",
  embl: "text/plain;charset=utf-8",
  ddbj: "text/plain;charset=utf-8",
  bed: "text/plain;charset=utf-8",
  "bed-bundle": "text/plain;charset=utf-8",
  "bed-fasta": "text/plain;charset=utf-8",
  "viewer-json": "application/json;charset=utf-8",
  "parsed-json": "application/json;charset=utf-8",
  report: "text/plain;charset=utf-8"
};

const EXTENSIONS = {
  "whole-fasta": "fasta",
  "cds-fasta": "fasta",
  "protein-fasta": "fasta",
  "feature-tsv": "tsv",
  gff3: "gff3",
  "gff3-bundle": "gff3",
  "gff3-fasta": "gff3",
  genbank: "gb",
  embl: "embl",
  ddbj: "ddbj",
  bed: "bed",
  "bed-bundle": "txt",
  "bed-fasta": "txt",
  "viewer-json": "json",
  "parsed-json": "json",
  report: "txt"
};

function warningsForSelectedFormat(outputFormat) {
  if (["gff3", "gff3-bundle", "gff3-fasta", "bed", "bed-bundle", "bed-fasta"].includes(outputFormat)) {
    return [
      "GFF3/BED exports are interval-oriented exchange formats and may not preserve every flatfile qualifier, fuzzy-location detail, or protein-feature semantic."
    ];
  }
  if (["genbank", "embl", "ddbj"].includes(outputFormat)) {
    return [
      "Reconstructed flatfile exports are practical exchange files but cannot recreate all original source metadata, references, fuzzy-location notation, dates, or unsupported qualifiers."
    ];
  }
  if (["whole-fasta", "cds-fasta", "protein-fasta"].includes(outputFormat)) {
    return [
      "FASTA exports preserve sequence text and titles but do not preserve feature tables or qualifiers."
    ];
  }
  return [];
}

export async function runBiologicalRecordFormatConverter(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-records", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "feature-tsv";
  const result = convertBiologicalRecord(input, options);
  const output = makeBiologicalRecordOutput(result, outputFormat);

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: `biological-record-converter.${EXTENSIONS[outputFormat]}`,
      mimeType: MIME_TYPES[outputFormat]
    },
    warnings: [...result.warnings, ...warningsForSelectedFormat(outputFormat)],
    recordsProcessed: result.records.length,
    basesProcessed: result.records.reduce((sum, record) => sum + (record.sequence?.length ?? 0), 0),
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      featureTable: makeTableStream(flatfileFeatureColumns, result.featureRows, "flatfile-features"),
      gff3Table: makeTableStream(gff3Columns, result.gff3Rows, "gff3-like"),
      bedTable: makeTableStream(bedColumns, result.bedRows, "bed-like"),
      viewer: makeDnaViewerStream(result.viewer)
    },
    visual: outputFormat === "viewer-json" ? { viewer: result.viewer } : undefined
  });
}
