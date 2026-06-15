import {
  makeScatterPlot,
  plotRowsToTsv,
  scatterPlotColumns
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runScatterPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeScatterPlot(input, options);
  const outputFormat = options.outputFormat === "point-tsv" ? "point-tsv" : "svg";
  const tsv = plotRowsToTsv(scatterPlotColumns, result.rows);
  const output = outputFormat === "point-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "point-tsv" ? "scatter-points.tsv" : "scatter-plot.svg",
      mimeType: outputFormat === "point-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      pointTable: makeTableStream(scatterPlotColumns, result.rows, "scatter-points")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
