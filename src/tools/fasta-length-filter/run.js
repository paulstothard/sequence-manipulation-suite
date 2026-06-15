import {
  fastaLengthFilterTableColumns,
  filterFastaByLength
} from "../../core/fasta-length-filter.js";
import { resolveFastaSourceInput } from "../fasta-source-runner.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["filtered-fasta", "removed-fasta", "report", "tsv"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "filtered-fasta";
}

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function makeTsv(rows) {
  const headers = fastaLengthFilterTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => escapeTsv(row[header])).join("\t"))
  ].join("\n");
}

export async function runFastaLengthFilter(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const resolvedInput = await resolveFastaSourceInput(input, options, context);
  const result = filterFastaByLength(resolvedInput.input, options);
  if (resolvedInput.warnings.length) {
    result.warnings.unshift(...resolvedInput.warnings);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const tsv = makeTsv(result.tableRows);
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
    charactersRemoved: 0,
    streams: {
      filteredFasta: makeTextStream(result.keptFasta, "text/x-fasta"),
      removedFasta: makeTextStream(result.removedFasta, "text/x-fasta"),
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(fastaLengthFilterTableColumns, result.tableRows, "fasta-length-filter"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "fasta-length-filter-records",
        records: result.keptRecords
      }
    }
  });
}
