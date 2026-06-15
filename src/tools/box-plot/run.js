import {
  makeBoxPlot,
  boxPlotColumns,
  plotRowsToTsv
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runBoxPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeBoxPlot(input, options);
  const outputFormat = options.outputFormat === "box-tsv" ? "box-tsv" : "svg";
  const tsv = plotRowsToTsv(boxPlotColumns, result.rows);
  const output = outputFormat === "box-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "box-tsv" ? "box-summary.tsv" : "box-plot.svg",
      mimeType: outputFormat === "box-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      boxTable: makeTableStream(boxPlotColumns, result.rows, "box-summary")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
