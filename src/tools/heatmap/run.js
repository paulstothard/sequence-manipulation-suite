import {
  makeHeatmapPlot,
  heatmapColumns,
  plotRowsToTsv
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runHeatmap(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeHeatmapPlot(input, options);
  const outputFormat = options.outputFormat === "cell-tsv" ? "cell-tsv" : "svg";
  const tsv = plotRowsToTsv(heatmapColumns, result.rows);
  const output = outputFormat === "cell-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "cell-tsv" ? "heatmap-cells.tsv" : "heatmap.svg",
      mimeType: outputFormat === "cell-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      cellTable: makeTableStream(heatmapColumns, result.rows, "heatmap-cells")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true, plotSpec: result.plotSpec, renderer: "observable-plot" } : undefined
  });
}
