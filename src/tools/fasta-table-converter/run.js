import {
  convertFastaTable,
  fastaTableColumns,
  makeFastaTableTsv
} from "../../core/fasta-table-converter.js";
import { resolveFastaSourceInput } from "../fasta-source-runner.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["auto", "table-tsv", "fasta", "report"]);

function normalizeOutputFormat(value, fallback = "auto") {
  return OUTPUT_FORMATS.has(value) ? value : fallback;
}

export async function runFastaTableConverter(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const resolvedInput = options.mode === "fasta-to-table"
    ? await resolveFastaSourceInput(input, options, context)
    : { input, warnings: [] };
  const result = convertFastaTable(resolvedInput.input, options);
  if (resolvedInput.warnings.length) {
    result.warnings.unshift(...resolvedInput.warnings);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const requestedOutputFormat = normalizeOutputFormat(options.outputFormat);
  const outputFormat = requestedOutputFormat === "auto"
    ? result.mode === "fasta-to-table" ? "table-tsv" : "fasta"
    : requestedOutputFormat;
  const tsv = makeFastaTableTsv(result.tableRows);
  const outputs = {
    "table-tsv": tsv,
    fasta: result.fasta,
    report: result.report
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "fasta" ? "fasta-table-converter.fasta" : outputFormat === "table-tsv" ? "fasta-table-converter.tsv" : "fasta-table-converter.txt",
      mimeType: outputFormat === "fasta" ? "text/x-fasta;charset=utf-8" : outputFormat === "table-tsv" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.sequenceRecords.length,
    streams: {
      fasta: makeTextStream(result.fasta, "text/x-fasta"),
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(fastaTableColumns, result.tableRows, "fasta-table-converter"),
      sequenceRecords: {
        kind: "sequence-records",
        alphabet: "dna-rna",
        schema: "fasta-table-converter",
        records: result.sequenceRecords
      }
    }
  });
}

export async function runFastaToTable(input, options = {}, context = {}) {
  return runFastaTableConverter(input, {
    ...options,
    mode: "fasta-to-table",
    outputFormat: normalizeOutputFormat(options.outputFormat, "table-tsv")
  }, context);
}

export async function runTableToFasta(input, options = {}, context = {}) {
  return runFastaTableConverter(input, {
    ...options,
    mode: "table-to-fasta",
    outputFormat: normalizeOutputFormat(options.outputFormat, "fasta")
  }, context);
}
