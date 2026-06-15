import {
  fastaValidationTableColumns,
  validateFasta
} from "../../core/fasta-validator.js";
import { resolveFastaSourceInput } from "../fasta-source-runner.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const TABLE_COLUMNS = fastaValidationTableColumns;

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function makeTsv(rows) {
  const headers = TABLE_COLUMNS.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => escapeTsv(row[header])).join("\t"))
  ].join("\n");
}

export async function runFastaValidatorNormalizer(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const resolvedInput = await resolveFastaSourceInput(input, options, context);
  const result = validateFasta(resolvedInput.input, options);
  if (resolvedInput.warnings.length) {
    result.warnings.unshift(...resolvedInput.warnings);
  }
  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = options.outputFormat ?? "report";
  const tsv = makeTsv(result.tableRows);
  let output = result.report;
  let filename = "fasta-summary-report.txt";
  let mimeType = "text/plain;charset=utf-8";

  if (outputFormat === "fasta") {
    output = result.normalizedFasta;
    filename = "normalized.fasta";
    mimeType = "text/plain;charset=utf-8";
  } else if (outputFormat === "tsv") {
    output = tsv;
    filename = "fasta-summary.tsv";
    mimeType = "text/tab-separated-values;charset=utf-8";
  }

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output,
    download: { filename, mimeType },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.basesProcessed,
    charactersRemoved: 0,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      fasta: makeTextStream(result.normalizedFasta, "text/x-fasta"),
      table: makeTableStream(TABLE_COLUMNS, result.tableRows, "fasta-validation")
    }
  });
}
