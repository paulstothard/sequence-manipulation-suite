import {
  runTextSearchReplaceCore,
  summarizeTextSearchReplace,
  textSearchMatchColumns
} from "../../core/text-search-replace.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OPERATION_LABELS = {
  replace: "Replace all matches",
  extract: "Extract matches only",
  "remove-lines": "Remove matching lines"
};

function getOutputFormat(options) {
  if (options.outputFormat === "tsv") {
    return "tsv";
  }
  if (options.outputFormat === "report") {
    return "report";
  }
  return "text";
}

export function runTextSearchReplace(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "search", message: "Finding matches" });
  context.throwIfCancelled?.();
  const result = runTextSearchReplaceCore(input, options);
  context.throwIfCancelled?.();
  const outputFormat = getOutputFormat(options);
  const report = summarizeTextSearchReplace(
    result,
    OPERATION_LABELS[result.operation] ?? "Search text",
    options.searchMode === "regex" ? "regex" : "plain"
  );
  const tsv = exportDelimitedTable(textSearchMatchColumns, result.rows, "\t");
  const output = outputFormat === "report" ? report : outputFormat === "tsv" ? tsv : result.output;
  context.reportProgress?.({ phase: "output", message: "Preparing output", completed: 1, total: 1 });

  return makeToolResult({
    output,
    download: {
      filename: `text-search-replace.${outputFormat === "tsv" ? "tsv" : "txt"}`,
      mimeType: outputFormat === "tsv" ? "text/tab-separated-values;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.stats.matches,
    streams: {
      text: makeTextStream(result.output, "text/plain"),
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(textSearchMatchColumns, result.rows, "text-search-replace")
    }
  });
}

export const textSearchReplaceRunner = runTextSearchReplace;
