import {
  makeGroupSummaryTsv,
  summarizeTableGroups
} from "../../core/table-group-summary.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["summary-tsv", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "summary-tsv";
}

export async function runTableGroupSummary(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = summarizeTableGroups(input, options);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const summaryTsv = makeGroupSummaryTsv(result.summaryColumns, result.summaryRows);
  const outputs = {
    "summary-tsv": summaryTsv,
    report: result.report
  };
  const filenames = {
    "summary-tsv": "table-group-summary.tsv",
    report: "table-group-summary.txt"
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
      summaryTable: makeTableStream(result.summaryColumns, result.summaryRows, "table-group-summary")
    }
  });
}
