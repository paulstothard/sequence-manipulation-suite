import {
  lineListCountColumns,
  processLineList,
  summarizeLineList
} from "../../core/line-list.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OPERATION_LABELS = {
  clean: "Clean only",
  sort: "Sort",
  unique: "Remove duplicates",
  "sort-unique": "Sort and remove duplicates",
  count: "Count occurrences"
};

function describeOperation(options, result) {
  if (OPERATION_LABELS[options.operation]) {
    return OPERATION_LABELS[options.operation];
  }
  const steps = ["Clean"];
  if (result.settings?.removeDuplicates) {
    steps.push("remove duplicates");
  }
  if (result.settings?.sortItems) {
    steps.push("sort");
  }
  return steps.join(", ");
}

function getOutputFormat(options) {
  if (options.outputFormat === "report") {
    return "report";
  }
  if (options.outputFormat === "tsv") {
    return "tsv";
  }
  return "list";
}

export function runLineListCleaner(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const result = processLineList(input, options, context);
  const operationLabel = describeOperation(options, result);
  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  const report = summarizeLineList(result, operationLabel);
  const outputFormat = getOutputFormat(options);
  const tsv = result.countRows.length > 0
    ? ["item\tcount", ...result.countRows.map((row) => `${row.item}\t${row.count}`)].join("\n")
    : "";
  const output = outputFormat === "report" ? report : outputFormat === "tsv" ? tsv : result.output;

  return makeToolResult({
    output,
    download: {
      filename: `line-list-cleaner.${outputFormat === "tsv" ? "tsv" : "txt"}`,
      mimeType: outputFormat === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.stats.normalizedItemCount,
    streams: {
      listText: makeTextStream(result.output, "text/plain"),
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(lineListCountColumns, result.countRows, "line-list-counts")
    }
  });
}

export const lineListCleanerRunner = runLineListCleaner;
