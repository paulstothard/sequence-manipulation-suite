import {
  calculateOutlierDiagnostics,
  makeOutlierDiagnosticsReport,
  outlierDiagnosticsColumns,
  outlierGroupSummaryColumns,
  outlierRowsToTsv,
  renderOutlierDiagnosticsSvg
} from "../../core/outlier-diagnostics.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["outlier-tsv", "summary-tsv", "plot-svg", "report"]);

export async function runOutlierDiagnostics(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "checking-outliers", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = calculateOutlierDiagnostics(input, options);
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "outlier-tsv";
  const report = makeOutlierDiagnosticsReport(result);
  const outlierTsv = outlierRowsToTsv(outlierDiagnosticsColumns, result.rows);
  const summaryTsv = outlierRowsToTsv(outlierGroupSummaryColumns, result.summaries);
  const svg = outputFormat === "plot-svg" ? renderOutlierDiagnosticsSvg(result, options) : "";
  const output = outputFormat === "report"
    ? report
    : outputFormat === "summary-tsv"
      ? summaryTsv
      : outputFormat === "plot-svg"
        ? svg
        : outlierTsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "outlier-diagnostics.txt"
        : outputFormat === "summary-tsv"
          ? "outlier-group-summary.tsv"
          : outputFormat === "plot-svg"
            ? "outlier-diagnostics.svg"
            : "outlier-diagnostics.tsv",
      mimeType: outputFormat === "plot-svg"
        ? "image/svg+xml;charset=utf-8"
        : outputFormat === "report"
          ? "text/plain;charset=utf-8"
          : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      report: makeTextStream(report, "text/plain"),
      outlierTable: makeTableStream(outlierDiagnosticsColumns, result.rows, "outlier-diagnostics"),
      summaryTable: makeTableStream(outlierGroupSummaryColumns, result.summaries, "outlier-group-summary")
    },
    visual: outputFormat === "plot-svg" ? { svg, pngDownload: true } : undefined
  });
}
