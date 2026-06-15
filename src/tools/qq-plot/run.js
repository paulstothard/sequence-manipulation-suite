import {
  makeQqPlot,
  qqPlotColumns,
  plotRowsToTsv
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runQqPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeQqPlot(input, options);
  const outputFormat = options.outputFormat === "quantile-tsv" ? "quantile-tsv" : "svg";
  const tsv = plotRowsToTsv(qqPlotColumns, result.rows);
  const output = outputFormat === "quantile-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "quantile-tsv" ? "qq-plot-quantiles.tsv" : "qq-plot.svg",
      mimeType: outputFormat === "quantile-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      quantileTable: makeTableStream(qqPlotColumns, result.rows, "qq-plot-quantiles")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
