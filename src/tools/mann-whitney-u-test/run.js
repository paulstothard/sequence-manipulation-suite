import {
  mannWhitneyRowsToTsv,
  mannWhitneyUTestColumns,
  runMannWhitneyUTest
} from "../../core/hypothesis-tests.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["result-tsv", "report"]);

export async function runMannWhitneyUTestTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "ranking-independent-groups", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "result-tsv";
  const result = runMannWhitneyUTest(input, options);
  const report = result.report ?? "Mann-Whitney U Test\nNo test result was calculated.\n";
  const tsv = mannWhitneyRowsToTsv(result.rows);
  const output = outputFormat === "report" ? report : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "mann-whitney-u-test.txt" : "mann-whitney-u-test.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(report, "text/plain"),
      resultTable: makeTableStream(mannWhitneyUTestColumns, result.rows, "mann-whitney-u-test")
    }
  });
}
