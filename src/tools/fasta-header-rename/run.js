import {
  fastaHeaderRenameTableColumns,
  renameFastaHeaders
} from "../../core/fasta-header-rename.js";
import { resolveFastaSourceInput } from "../fasta-source-runner.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["fasta", "report", "tsv"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "fasta";
}

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function makeTsv(rows) {
  const headers = fastaHeaderRenameTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => escapeTsv(row[header])).join("\t"))
  ].join("\n");
}

export async function runFastaHeaderRename(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const resolvedInput = await resolveFastaSourceInput(input, options, context);
  const result = renameFastaHeaders(resolvedInput.input, options);
  if (resolvedInput.warnings.length) {
    result.warnings.unshift(...resolvedInput.warnings);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const tsv = makeTsv(result.tableRows);
  const outputs = {
    fasta: result.fasta,
    report: result.report,
    tsv
  };
  const filenames = {
    fasta: "renamed-headers.fasta",
    report: "fasta-header-rename-report.txt",
    tsv: "fasta-header-rename.tsv"
  };
  const mimeTypes = {
    fasta: "text/plain;charset=utf-8",
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
      fasta: makeTextStream(result.fasta, "text/x-fasta"),
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(fastaHeaderRenameTableColumns, result.tableRows, "fasta-header-rename"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "fasta-header-rename-records",
        records: result.renamedRecords
      }
    }
  });
}
