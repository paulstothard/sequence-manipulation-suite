import {
  pairedTTestColumns,
  pairedTTestRowsToTsv,
  runPairedTTest
} from "../../core/hypothesis-tests.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export async function runPairedTTestTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "testing-paired-values", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = runPairedTTest(input, options);
  const outputFormat = options.outputFormat === "report" ? "report" : "result-tsv";
  const tsv = pairedTTestRowsToTsv(result.rows);
  const output = outputFormat === "report" ? result.report ?? "" : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "paired-t-test.txt" : "paired-t-test.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(result.report ?? "", "text/plain"),
      resultTable: makeTableStream(pairedTTestColumns, result.rows, "paired-t-test")
    }
  });
}
