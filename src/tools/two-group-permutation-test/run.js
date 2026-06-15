import {
  permutationNullDistributionColumns,
  permutationTestResultColumns,
  rowsToTsv,
  runTwoGroupPermutationTest
} from "../../core/two-group-permutation-test.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["report", "result-tsv", "null-tsv", "svg"]);

export async function runTwoGroupPermutationTestTool(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "running-permutation-test", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = runTwoGroupPermutationTest(input, options, context);
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "report";
  const resultTsv = rowsToTsv(permutationTestResultColumns, result.resultRows);
  const nullTsv = rowsToTsv(permutationNullDistributionColumns, result.nullRows);
  const output =
    outputFormat === "result-tsv" ? resultTsv :
      outputFormat === "null-tsv" ? nullTsv :
        outputFormat === "svg" ? result.svg :
          result.report;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "svg"
        ? "two-group-permutation-test.svg"
        : outputFormat === "null-tsv"
          ? "two-group-permutation-null-distribution.tsv"
          : outputFormat === "result-tsv"
            ? "two-group-permutation-test.tsv"
            : "two-group-permutation-test.txt",
      mimeType: outputFormat === "svg"
        ? "image/svg+xml;charset=utf-8"
        : outputFormat.endsWith("tsv")
          ? "text/tab-separated-values;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table?.rows.length ?? 0,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      resultTable: makeTableStream(permutationTestResultColumns, result.resultRows, "two-group-permutation-test"),
      nullDistribution: makeTableStream(permutationNullDistributionColumns, result.nullRows, "two-group-permutation-null-distribution"),
      ...(outputFormat === "svg" ? { overview: makeTextStream(result.svg, "image/svg+xml") } : {})
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
