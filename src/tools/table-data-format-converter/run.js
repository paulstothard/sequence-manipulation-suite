import {
  convertTableDataFormat
} from "../../core/table-data-format-converter.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["tsv", "csv", "json", "markdown", "xlsx", "report"]);

const MIME_TYPES = {
  tsv: "text/tab-separated-values;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  report: "text/plain;charset=utf-8"
};

export async function runTableDataFormatConverter(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "tsv";
  const result = convertTableDataFormat(input, options);
  const output = outputFormat === "report" || outputFormat === "xlsx" ? result.report : result.outputs[outputFormat] ?? result.outputs.tsv ?? "";

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "table-data-format-converter.txt"
        : outputFormat === "markdown"
          ? "table-data-format-converter.md"
          : `table-data-format-converter.${outputFormat}`,
      mimeType: MIME_TYPES[outputFormat]
    },
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(result.columns, result.rows, "generic-table")
    }
  });
}
