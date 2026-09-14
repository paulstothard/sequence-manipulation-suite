import {
  fastaValidationTableColumns,
  FASTA_SUMMARIZER_LIMITS,
  summarizeFastaSource
} from "../../core/fasta-validator.js";
import { openFastaRecordSource } from "../../core/fasta-record-source.js";
import { makeBoundedTsv } from "../../core/bounded-text-builder.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const TABLE_COLUMNS = fastaValidationTableColumns;

function selectedOutputLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : FASTA_SUMMARIZER_LIMITS.maxMaterializedOutputCharacters;
}

export async function runFastaValidatorNormalizer(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const source = await openFastaRecordSource(input, options, context);
  const result = await summarizeFastaSource(source, options, context);
  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = options.outputFormat ?? "report";
  const maxOutputCharacters = selectedOutputLimit(options.maxMaterializedOutputCharacters);
  const tsv = outputFormat === "tsv"
    ? makeBoundedTsv(TABLE_COLUMNS, result.tableRows, maxOutputCharacters, "FASTA summary table output")
    : "";
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

  if (output.length > maxOutputCharacters) {
    throw new Error(`Selected output contains ${output.length.toLocaleString()} characters, above the current materialized-output limit of ${maxOutputCharacters.toLocaleString()}.`);
  }

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output,
    download: { filename, mimeType },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.basesProcessed,
    charactersRemoved: source.stats.ignoredSequenceWhitespace,
    streams: outputFormat === "fasta"
      ? { fasta: makeTextStream(result.normalizedFasta, "text/x-fasta") }
      : outputFormat === "tsv"
        ? { table: makeTableStream(TABLE_COLUMNS, result.tableRows, "fasta-validation") }
        : { report: makeTextStream(result.report, "text/plain") }
  });
}
