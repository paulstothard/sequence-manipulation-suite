import {
  makePcaPlot,
  pcaLoadingColumns,
  pcaLoadingsToTsv,
  pcaScoreColumns,
  pcaScoresToTsv,
  pcaVarianceColumns,
  pcaVarianceToTsv
} from "../../core/pca-plot.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["svg", "scores-tsv", "loadings-tsv", "variance-tsv", "report"]);

export async function runPcaPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "calculating-pca", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "svg";
  const result = makePcaPlot(input, options);
  const scoreTsv = pcaScoresToTsv(result.rows);
  const loadingTsv = pcaLoadingsToTsv(result.loadingRows);
  const varianceTsv = pcaVarianceToTsv(result.varianceRows);
  const output = outputFormat === "report"
    ? result.report
    : outputFormat === "scores-tsv"
      ? scoreTsv
      : outputFormat === "loadings-tsv"
        ? loadingTsv
        : outputFormat === "variance-tsv"
          ? varianceTsv
          : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "pca-plot.txt"
        : outputFormat === "svg"
          ? "pca-plot.svg"
          : outputFormat === "scores-tsv"
            ? "pca-scores.tsv"
            : outputFormat === "loadings-tsv"
              ? "pca-loadings.tsv"
              : "pca-variance.tsv",
      mimeType: outputFormat === "svg" ? "image/svg+xml;charset=utf-8" : outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      scoreTable: makeTableStream(pcaScoreColumns, result.rows, "pca-scores"),
      loadingTable: makeTableStream(pcaLoadingColumns, result.loadingRows, "pca-loadings"),
      varianceTable: makeTableStream(pcaVarianceColumns, result.varianceRows, "pca-variance")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
