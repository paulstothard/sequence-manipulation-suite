import {
  makeTableSummaryTsv,
  summarizeTableProfile,
  tableSummaryColumns
} from "../../core/table-summary.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["summary-tsv", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "summary-tsv";
}

export async function runTableSummary(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = summarizeTableProfile(input, options);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const summaryTsv = makeTableSummaryTsv(result.summaryRows);
  const outputs = {
    "summary-tsv": summaryTsv,
    report: result.report
  };
  const filenames = {
    "summary-tsv": "table-summary.tsv",
    report: "table-summary.txt"
  };
  const mimeTypes = {
    "summary-tsv": "text/tab-separated-values;charset=utf-8",
    report: "text/plain;charset=utf-8"
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: filenames[outputFormat],
      mimeType: mimeTypes[outputFormat]
    },
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      summaryTable: makeTableStream(tableSummaryColumns, result.summaryRows, "table-summary")
    }
  });
}
