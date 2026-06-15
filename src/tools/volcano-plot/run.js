import {
  makeVolcanoPlot,
  plotRowsToTsv,
  volcanoPlotColumns
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runVolcanoPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeVolcanoPlot(input, options);
  const outputFormat = options.outputFormat === "point-tsv" ? "point-tsv" : "svg";
  const tsv = plotRowsToTsv(volcanoPlotColumns, result.rows);
  const output = outputFormat === "point-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "point-tsv" ? "volcano-points.tsv" : "volcano-plot.svg",
      mimeType: outputFormat === "point-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      pointTable: makeTableStream(volcanoPlotColumns, result.rows, "volcano-points")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
