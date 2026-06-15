import {
  descriptiveStatisticsColumns,
  makeDescriptiveStatisticsReport,
  statisticsRowsToTsv,
  summarizeDescriptiveStatistics
} from "../../core/table-descriptive-statistics.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["summary-tsv", "report"]);

export async function runTableDescriptiveStatistics(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "summarizing-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "summary-tsv";
  const result = summarizeDescriptiveStatistics(input, options);
  const report = makeDescriptiveStatisticsReport(result);
  const tsv = statisticsRowsToTsv(descriptiveStatisticsColumns, result.rows);
  const output = outputFormat === "report" ? report : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "statistical-summary.txt" : "statistical-summary.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.sourceRows.length,
    streams: {
      report: makeTextStream(report, "text/plain"),
      summaryTable: makeTableStream(descriptiveStatisticsColumns, result.rows, "table-descriptive-statistics")
    }
  });
}
