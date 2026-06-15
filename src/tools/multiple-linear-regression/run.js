import {
  calculateMultipleLinearRegression,
  multipleLinearRegressionCoefficientColumns,
  multipleLinearRegressionCoefficientRowsToTsv,
  multipleLinearRegressionFitColumns,
  multipleLinearRegressionFitRowsToTsv,
  multipleLinearRegressionModelColumns,
  multipleLinearRegressionModelRowsToTsv
} from "../../core/multiple-linear-regression.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["coefficient-tsv", "model-tsv", "fit-tsv", "residual-plot-svg", "report"]);

export async function runMultipleLinearRegressionTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "fitting-multiple-regression", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "coefficient-tsv";
  const result = calculateMultipleLinearRegression(input, options);
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const coefficientTsv = multipleLinearRegressionCoefficientRowsToTsv(result.coefficientRows);
  const modelTsv = multipleLinearRegressionModelRowsToTsv(result.rows);
  const fitTsv = multipleLinearRegressionFitRowsToTsv(result.fitRows);
  const output = outputFormat === "report"
    ? result.report
    : outputFormat === "model-tsv"
      ? modelTsv
      : outputFormat === "fit-tsv"
        ? fitTsv
        : outputFormat === "residual-plot-svg"
          ? result.svg
          : coefficientTsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "multiple-linear-regression.txt"
        : outputFormat === "model-tsv"
          ? "multiple-linear-regression-model.tsv"
          : outputFormat === "fit-tsv"
            ? "multiple-linear-regression-fit.tsv"
            : outputFormat === "residual-plot-svg"
              ? "multiple-linear-regression-residuals.svg"
              : "multiple-linear-regression-coefficients.tsv",
      mimeType: outputFormat === "residual-plot-svg"
        ? "image/svg+xml;charset=utf-8"
        : outputFormat === "report"
          ? "text/plain;charset=utf-8"
          : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      modelTable: makeTableStream(multipleLinearRegressionModelColumns, result.rows, "multiple-linear-regression-model"),
      coefficientTable: makeTableStream(multipleLinearRegressionCoefficientColumns, result.coefficientRows, "multiple-linear-regression-coefficients"),
      fitTable: makeTableStream(multipleLinearRegressionFitColumns, result.fitRows, "multiple-linear-regression-fit")
    },
    visual: outputFormat === "residual-plot-svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
