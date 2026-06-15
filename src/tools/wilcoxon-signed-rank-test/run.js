import {
  runWilcoxonSignedRankTest,
  wilcoxonSignedRankRowsToTsv,
  wilcoxonSignedRankTestColumns
} from "../../core/hypothesis-tests.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["result-tsv", "report"]);

export async function runWilcoxonSignedRankTestTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "ranking-paired-differences", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "result-tsv";
  const result = runWilcoxonSignedRankTest(input, options);
  const report = result.report ?? "Wilcoxon Signed-Rank Test\nNo test result was calculated.\n";
  const tsv = wilcoxonSignedRankRowsToTsv(result.rows);
  const output = outputFormat === "report" ? report : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "wilcoxon-signed-rank-test.txt" : "wilcoxon-signed-rank-test.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(report, "text/plain"),
      resultTable: makeTableStream(wilcoxonSignedRankTestColumns, result.rows, "wilcoxon-signed-rank-test")
    }
  });
}
