import {
  calculateTableCorrelationMatrix,
  correlationRowsToTsv,
  makeCorrelationHeatmap,
  makeCorrelationReport,
  tableCorrelationColumns
} from "../../core/table-correlation.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["matrix-tsv", "correlation-heatmap-svg", "spearman-heatmap-svg", "kendall-heatmap-svg", "covariance-heatmap-svg", "heatmap-svg", "report"]);

export async function runTableCorrelationMatrix(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "summarizing-pairs", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "matrix-tsv";
  const result = calculateTableCorrelationMatrix(input, options);
  const report = makeCorrelationReport(result);
  const tsv = correlationRowsToTsv(result.rows);
  const isHeatmap = outputFormat === "heatmap-svg" || outputFormat.endsWith("-heatmap-svg");
  const heatmapMetric = outputFormat === "covariance-heatmap-svg"
    ? "covariance"
    : outputFormat === "spearman-heatmap-svg"
      ? "spearman"
      : outputFormat === "kendall-heatmap-svg"
        ? "kendall"
        : "correlation";
  const svg = isHeatmap ? makeCorrelationHeatmap(result, { ...options, metric: heatmapMetric }) : "";
  const output = outputFormat === "report" ? report : isHeatmap ? svg : tsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "correlation-covariance-matrix.txt"
        : isHeatmap
          ? `${heatmapMetric}-heatmap.svg`
          : "correlation-covariance-matrix.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : isHeatmap ? "image/svg+xml;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      report: makeTextStream(report, "text/plain"),
      matrixTable: makeTableStream(tableCorrelationColumns, result.rows, "table-correlation-matrix")
    },
    visual: isHeatmap ? { svg, pngDownload: true } : undefined
  });
}
