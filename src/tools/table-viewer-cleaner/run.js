import {
  applyTableOperations,
  exportDelimitedTable,
  parseDelimitedTable,
  summarizeTable
} from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

function coerceTableInput(input) {
  if (input?.kind === "table" && Array.isArray(input.columns) && Array.isArray(input.rows)) {
    return {
      columns: input.columns,
      rows: input.rows,
      delimiterId: "structured table",
      warnings: []
    };
  }
  return null;
}

function makeOperationReport(summary, stats = {}) {
  const lines = [summary, "", "Operations"];
  let changed = false;
  lines.push(`Input size: ${stats.inputRows ?? 0} row(s), ${stats.inputColumns ?? 0} column(s)`);
  lines.push(`Output size: ${stats.outputRows ?? 0} row(s), ${stats.outputColumns ?? 0} column(s)`);
  if ((stats.normalizedCells ?? 0) > 0) {
    lines.push(`Cells cleaned: ${stats.normalizedCells}`);
    changed = true;
  }
  if ((stats.missingValuesStandardized ?? 0) > 0) {
    lines.push(`Missing-value markers standardized: ${stats.missingValuesStandardized}`);
    changed = true;
  }
  if ((stats.emptyRowsRemoved ?? 0) > 0) {
    lines.push(`Empty rows removed: ${stats.emptyRowsRemoved}`);
    changed = true;
  }
  if ((stats.emptyColumnsRemoved ?? 0) > 0) {
    lines.push(`Empty columns removed: ${stats.emptyColumnsRemoved}`);
    changed = true;
  }
  if ((stats.rowsRemovedByFilters ?? 0) > 0) {
    lines.push(`Rows removed by filters: ${stats.rowsRemovedByFilters}`);
    changed = true;
  }
  if ((stats.columnsRemovedByFilters ?? 0) > 0) {
    lines.push(`Columns removed by filters: ${stats.columnsRemovedByFilters}`);
    changed = true;
  }
  if ((stats.duplicateRowsRemoved ?? 0) > 0) {
    lines.push(`Duplicate rows removed: ${stats.duplicateRowsRemoved}`);
    changed = true;
  }
  if (!changed) {
    lines.push("No cleanup, filter, or sort changes were requested.");
  }
  return lines.join("\n");
}

export function runTableViewerCleaner(input, options = {}) {
  const structuredInput = coerceTableInput(input);
  const parsed = structuredInput ?? parseDelimitedTable(String(input ?? ""), {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const warnings = [...parsed.warnings];

  if (parsed.columns.length === 0) {
    return makeToolResult({
      output: "",
      warnings: warnings.length > 0 ? warnings : ["No table input was provided."],
      recordsProcessed: 0
    });
  }

  const cleaned = applyTableOperations(
    { columns: parsed.columns, rows: parsed.rows },
    options
  );
  warnings.push(...cleaned.warnings);

  const report = makeOperationReport(
    summarizeTable(cleaned.columns, cleaned.rows, parsed.delimiterId),
    cleaned.stats
  );
  const outputFormat = ["csv", "report"].includes(options.outputFormat) ? options.outputFormat : "tsv";
  const output = outputFormat === "report"
    ? report
    : exportDelimitedTable(cleaned.columns, cleaned.rows, outputFormat === "csv" ? "," : "\t");

  return makeToolResult({
    output,
    download: {
      filename: `table-viewer-cleaner.${outputFormat === "csv" ? "csv" : outputFormat === "tsv" ? "tsv" : "txt"}`,
      mimeType:
        outputFormat === "csv"
          ? "text/csv;charset=utf-8"
          : outputFormat === "tsv"
            ? "text/tab-separated-values;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: cleaned.rows.length,
    streams: {
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(cleaned.columns, cleaned.rows, "generic-table")
    }
  });
}
