import {
  fastaLengthFilterTableColumns,
  FASTA_LENGTH_FILTER_LIMITS,
  filterFastaRecordSource
} from "../../core/fasta-length-filter.js";
import { makeBoundedTsv } from "../../core/bounded-text-builder.js";
import { openFastaRecordSource } from "../../core/fasta-record-source.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["filtered-fasta", "removed-fasta", "report", "tsv"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "filtered-fasta";
}

function selectedOutputLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : FASTA_LENGTH_FILTER_LIMITS.maxMaterializedOutputCharacters;
}

export async function runFastaLengthFilter(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const source = await openFastaRecordSource(input, { ...options, allowRawSequence: true }, context);
  const result = await filterFastaRecordSource(source, options, context);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const maxOutputCharacters = selectedOutputLimit(options.maxMaterializedOutputCharacters);
  const tsv = outputFormat === "tsv"
    ? makeBoundedTsv(fastaLengthFilterTableColumns, result.tableRows, maxOutputCharacters, "FASTA decision table output")
    : "";
  const outputs = {
    "filtered-fasta": result.keptFasta,
    "removed-fasta": result.removedFasta,
    report: result.report,
    tsv
  };
  const filenames = {
    "filtered-fasta": "filtered-selected.fasta",
    "removed-fasta": "removed-selected.fasta",
    report: "fasta-filter-select-report.txt",
    tsv: "fasta-filter-select.tsv"
  };
  const mimeTypes = {
    "filtered-fasta": "text/plain;charset=utf-8",
    "removed-fasta": "text/plain;charset=utf-8",
    report: "text/plain;charset=utf-8",
    tsv: "text/tab-separated-values;charset=utf-8"
  };
  if (outputs[outputFormat].length > maxOutputCharacters) {
    throw new Error(`Selected output contains ${outputs[outputFormat].length.toLocaleString()} characters, above the current materialized-output limit of ${maxOutputCharacters.toLocaleString()}.`);
  }

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: filenames[outputFormat],
      mimeType: mimeTypes[outputFormat]
    },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.basesProcessed,
    charactersRemoved: source.stats.ignoredSequenceWhitespace,
    streams: outputFormat === "filtered-fasta"
      ? {
        filteredFasta: makeTextStream(result.keptFasta, "text/x-fasta"),
        sequenceRecords: {
          kind: "sequence-records",
          schema: "fasta-length-filter-records",
          records: result.keptRecords
        }
      }
      : outputFormat === "removed-fasta"
        ? { removedFasta: makeTextStream(result.removedFasta, "text/x-fasta") }
        : outputFormat === "tsv"
          ? { table: makeTableStream(fastaLengthFilterTableColumns, result.tableRows, "fasta-length-filter") }
          : { report: makeTextStream(result.report, "text/plain") }
  });
}
