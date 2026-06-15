import {
  buildFastaFaiIndex,
  fastaFaiIndexColumns,
  makeFaiIndexText,
  makeFastaIndexReport
} from "../../core/fasta-index-creator.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["fai", "table", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "fai";
}

export async function runFastaIndexCreator(input, options = {}, context = {}) {
  const maxInputCharacters = Number.isFinite(Number(options.maxInputCharacters))
    ? Number(options.maxInputCharacters)
    : 50000000;
  if (String(input ?? "").length > maxInputCharacters) {
    throw new Error(`Input has ${String(input ?? "").length} characters, which exceeds the current FASTA index creator limit of ${maxInputCharacters}.`);
  }

  context.reportProgress?.({ phase: "indexing-fasta", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = await buildFastaFaiIndex(input, options, context);

  context.reportProgress?.({ phase: "building-output", progress: 0.8 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const faiText = makeFaiIndexText(result.rows);
  const tableText = exportDelimitedTable(fastaFaiIndexColumns, result.rows, "\t");
  const report = makeFastaIndexReport(result);
  const output = outputFormat === "table" ? tableText : outputFormat === "report" ? report : faiText;
  const filename = outputFormat === "table"
    ? "fasta-index-table.tsv"
    : outputFormat === "report"
      ? "fasta-index-report.txt"
      : "sequence.fasta.fai";
  const mimeType = outputFormat === "table"
    ? "text/tab-separated-values;charset=utf-8"
    : "text/plain;charset=utf-8";

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output,
    download: { filename, mimeType },
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    basesProcessed: result.totalBases,
    streams: {
      fai: makeTextStream(faiText, "text/plain"),
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(fastaFaiIndexColumns, result.rows, "fasta-fai-index")
    }
  });
}
