import {
  makeViolinPlot,
  plotRowsToTsv,
  violinDensityColumns,
  violinSummaryColumns
} from "../../core/plot-tools.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["svg", "density-tsv", "summary-tsv"]);

export async function runViolinPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-table", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeViolinPlot(input, options);
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "svg";
  const densityTsv = plotRowsToTsv(violinDensityColumns, result.densityRows);
  const summaryTsv = plotRowsToTsv(violinSummaryColumns, result.summaries);
  const output = outputFormat === "density-tsv"
    ? densityTsv
    : outputFormat === "summary-tsv"
      ? summaryTsv
      : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "density-tsv"
        ? "violin-density.tsv"
        : outputFormat === "summary-tsv"
          ? "violin-summary.tsv"
          : "violin-plot.svg",
      mimeType: outputFormat === "svg"
        ? "image/svg+xml;charset=utf-8"
        : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      densityTable: makeTableStream(violinDensityColumns, result.densityRows, "violin-density"),
      summaryTable: makeTableStream(violinSummaryColumns, result.summaries, "violin-summary")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
