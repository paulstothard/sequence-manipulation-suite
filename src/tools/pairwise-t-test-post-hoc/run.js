import {
  pairwiseTTestPostHocColumns,
  pairwiseTTestPostHocRowsToTsv,
  runPairwiseTTestPostHoc
} from "../../core/hypothesis-tests.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["result-tsv", "report"]);

export async function runPairwiseTTestPostHocTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "running-post-hoc-tests", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "result-tsv";
  const result = runPairwiseTTestPostHoc(input, options);
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = result.report ?? "Pairwise t-Test Post-Hoc\nNo comparison results were calculated.\n";
  const tsv = pairwiseTTestPostHocRowsToTsv(result.rows);
  const output = outputFormat === "report" ? report : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "pairwise-t-test-post-hoc.txt" : "pairwise-t-test-post-hoc.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(report, "text/plain"),
      resultTable: makeTableStream(pairwiseTTestPostHocColumns, result.rows, "pairwise-t-test-post-hoc")
    }
  });
}
