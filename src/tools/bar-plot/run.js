import {
  makeBarPlot,
  barPlotColumns,
  plotRowsToTsv
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runBarPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeBarPlot(input, options);
  const outputFormat = options.outputFormat === "bar-tsv" ? "bar-tsv" : "svg";
  const tsv = plotRowsToTsv(barPlotColumns, result.rows);
  const output = outputFormat === "bar-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "bar-tsv" ? "bar-values.tsv" : "bar-plot.svg",
      mimeType: outputFormat === "bar-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      barTable: makeTableStream(barPlotColumns, result.rows, "bar-values")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
