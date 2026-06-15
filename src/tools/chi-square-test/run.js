import {
  chiSquareExpectedCountColumns,
  chiSquareExpectedRowsToTsv,
  chiSquareRowsToTsv,
  chiSquareTestColumns,
  runChiSquareTest
} from "../../core/hypothesis-tests.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export async function runChiSquareTestTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "testing-contingency-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = runChiSquareTest(input, options);
  const outputFormat = options.outputFormat === "report"
    ? "report"
    : options.outputFormat === "expected-tsv"
      ? "expected-tsv"
      : "result-tsv";
  const resultTsv = chiSquareRowsToTsv(result.rows);
  const expectedTsv = chiSquareExpectedRowsToTsv(result.expectedRows ?? []);
  const output = outputFormat === "report" ? result.report ?? "" : outputFormat === "expected-tsv" ? expectedTsv : resultTsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "chi-square-test.txt"
        : outputFormat === "expected-tsv"
          ? "chi-square-expected-counts.tsv"
          : "chi-square-test.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(result.report ?? "", "text/plain"),
      resultTable: makeTableStream(chiSquareTestColumns, result.rows, "chi-square-test"),
      expectedTable: makeTableStream(chiSquareExpectedCountColumns, result.expectedRows ?? [], "chi-square-expected-counts")
    }
  });
}
