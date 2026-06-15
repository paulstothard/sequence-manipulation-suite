import {
  calculateSimpleLinearRegression,
  simpleLinearRegressionColumns,
  simpleLinearRegressionFitColumns,
  simpleLinearRegressionFitRowsToTsv,
  simpleLinearRegressionRowsToTsv
} from "../../core/simple-linear-regression.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["result-tsv", "fit-tsv", "plot-svg", "report"]);

export async function runSimpleLinearRegressionTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "fitting-linear-regression", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "result-tsv";
  const result = calculateSimpleLinearRegression(input, options);
  const resultTsv = simpleLinearRegressionRowsToTsv(result.rows);
  const fitTsv = simpleLinearRegressionFitRowsToTsv(result.fitRows);
  const output = outputFormat === "report"
    ? result.report
    : outputFormat === "fit-tsv"
      ? fitTsv
      : outputFormat === "plot-svg"
        ? result.svg
        : resultTsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "simple-linear-regression.txt"
        : outputFormat === "fit-tsv"
          ? "simple-linear-regression-fit.tsv"
          : outputFormat === "plot-svg"
            ? "simple-linear-regression.svg"
            : "simple-linear-regression.tsv",
      mimeType: outputFormat === "plot-svg" ? "image/svg+xml;charset=utf-8" : outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      resultTable: makeTableStream(simpleLinearRegressionColumns, result.rows, "simple-linear-regression"),
      fitTable: makeTableStream(simpleLinearRegressionFitColumns, result.fitRows, "simple-linear-regression-fit")
    },
    visual: outputFormat === "plot-svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
