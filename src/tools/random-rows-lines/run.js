import {
  makeRandomRowsLinesReport,
  makeRandomRowsLinesTsv,
  randomRowsLinesColumns,
  sampleRandomRowsOrLines
} from "../../core/random-rows-lines.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["sampled-text", "sample-table", "report"]);

export async function runRandomRowsLines(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "sampling", progress: 0.15 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "sampled-text";
  const result = sampleRandomRowsOrLines(input, options, context);
  const report = makeRandomRowsLinesReport(result);
  const tableTsv = makeRandomRowsLinesTsv(result.rows);
  const output = outputFormat === "sample-table" ? tableTsv : outputFormat === "report" ? report : result.outputText;
  const mimeType = outputFormat === "sample-table" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8";

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "sample-table" ? "random-sample.tsv" : "random-sample.txt",
      mimeType
    },
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    streams: {
      report: makeTextStream(report, "text/plain"),
      sampleTable: makeTableStream(randomRowsLinesColumns, result.rows, "random-rows-lines")
    }
  });
}
