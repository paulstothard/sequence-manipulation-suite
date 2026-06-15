import {
  runTwoWayAnova,
  twoWayAnovaColumns,
  twoWayAnovaRowsToTsv
} from "../../core/hypothesis-tests.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["result-tsv", "report"]);

export async function runTwoWayAnovaTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "fitting-two-way-anova", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "result-tsv";
  const result = runTwoWayAnova(input, options);
  const report = result.report ?? "Two-Way ANOVA\nNo test result was calculated.\n";
  const tsv = twoWayAnovaRowsToTsv(result.rows);
  const output = outputFormat === "report" ? report : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "two-way-anova.txt" : "two-way-anova.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(report, "text/plain"),
      resultTable: makeTableStream(twoWayAnovaColumns, result.rows, "two-way-anova")
    }
  });
}
