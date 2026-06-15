import {
  analyzeTableColumnComparison,
  normalizeTableColumnComparisonOutputFormat,
  tableColumnComparisonColumns,
  tableColumnComparisonPairColumns,
  tableColumnComparisonRowsToTsv
} from "../../core/table-column-comparison.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const DOWNLOADS = {
  plot: {
    filename: "table-column-comparison.svg",
    mimeType: "image/svg+xml;charset=utf-8"
  },
  "compact-heatmap": {
    filename: "table-column-comparison-compact-heatmap.svg",
    mimeType: "image/svg+xml;charset=utf-8"
  },
  "comparison-table": {
    filename: "table-column-comparison.tsv",
    mimeType: "text/tab-separated-values;charset=utf-8"
  },
  "pair-table": {
    filename: "table-column-comparison-pairs.tsv",
    mimeType: "text/tab-separated-values;charset=utf-8"
  },
  report: {
    filename: "table-column-comparison.txt",
    mimeType: "text/plain;charset=utf-8"
  }
};

function outputForFormat(result, outputFormat) {
  if (outputFormat === "comparison-table") {
    return tableColumnComparisonRowsToTsv(result.comparisonRows, tableColumnComparisonColumns);
  }
  if (outputFormat === "pair-table") {
    return tableColumnComparisonRowsToTsv(result.pairRows, tableColumnComparisonPairColumns);
  }
  if (outputFormat === "report") {
    return result.report;
  }
  if (outputFormat === "compact-heatmap") {
    return result.compactHeatmapSvg;
  }
  return result.svg;
}

export async function runTableColumnComparison(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "comparing-columns", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeTableColumnComparisonOutputFormat(options.outputFormat);
  const result = analyzeTableColumnComparison(input, options);
  const output = outputForFormat(result, outputFormat);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const streams = {
    ...(outputFormat === "plot" ? { plot: makeTextStream(result.svg, "image/svg+xml") } : {}),
    ...(outputFormat === "compact-heatmap" ? { plot: makeTextStream(result.compactHeatmapSvg, "image/svg+xml") } : {}),
    ...(outputFormat === "comparison-table"
      ? { comparisonTable: makeTableStream(tableColumnComparisonColumns, result.comparisonRows, "table-column-comparison") }
      : {}),
    ...(outputFormat === "pair-table"
      ? { pairTable: makeTableStream(tableColumnComparisonPairColumns, result.pairRows, "table-column-comparison-pairs") }
      : {}),
    ...(outputFormat === "report" ? { report: makeTextStream(result.report, "text/plain") } : {})
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: DOWNLOADS[outputFormat],
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams,
    visual: outputFormat === "plot"
      ? { svg: result.svg, pngDownload: true }
      : outputFormat === "compact-heatmap"
        ? { svg: result.compactHeatmapSvg, pngDownload: true }
        : undefined,
    optionsUsed: { outputFormat, comparisonType: result.comparisonType }
  });
}
