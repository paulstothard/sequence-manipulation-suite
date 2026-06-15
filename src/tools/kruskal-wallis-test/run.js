import {
  kruskalWallisRowsToTsv,
  kruskalWallisTestColumns,
  runKruskalWallisTest
} from "../../core/hypothesis-tests.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["result-tsv", "report"]);

export async function runKruskalWallisTestTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "ranking-groups", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "result-tsv";
  const result = runKruskalWallisTest(input, options);
  const tsv = kruskalWallisRowsToTsv(result.rows);
  const output = outputFormat === "report" ? result.report ?? "Kruskal-Wallis Test\nNo test result was calculated.\n" : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "kruskal-wallis-test.txt" : "kruskal-wallis-test.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(result.report ?? "Kruskal-Wallis Test\nNo test result was calculated.\n", "text/plain"),
      resultTable: makeTableStream(kruskalWallisTestColumns, result.rows, "kruskal-wallis-test")
    }
  });
}
