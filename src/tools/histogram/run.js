import {
  makeHistogramPlot,
  histogramColumns,
  plotRowsToTsv
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runHistogram(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeHistogramPlot(input, options);
  const outputFormat = options.outputFormat === "bin-tsv" ? "bin-tsv" : "svg";
  const tsv = plotRowsToTsv(histogramColumns, result.rows);
  const output = outputFormat === "bin-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "bin-tsv" ? "histogram-bins.tsv" : "histogram.svg",
      mimeType: outputFormat === "bin-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      binTable: makeTableStream(histogramColumns, result.rows, "histogram-bins")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
