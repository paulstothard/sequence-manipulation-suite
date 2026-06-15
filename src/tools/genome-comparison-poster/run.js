import {
  calculateGenomeComparisonPoster,
  genomeComparisonBlockColumns,
  genomeComparisonSummaryColumns
} from "../../core/genome-comparison-poster.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const PLOT_OUTPUT_FORMAT_LAYOUTS = new Map([
  ["linear-plot", "linear"],
  ["wrapped-plot", "wrapped"],
  ["circular-plot", "circular"],
  ["spiral-plot", "spiral"],
  ["loom-plot", "loom"]
]);
const LAYOUT_OUTPUT_FORMATS = new Map(
  [...PLOT_OUTPUT_FORMAT_LAYOUTS.entries()].map(([outputFormat, layout]) => [layout, outputFormat])
);
const NONVISUAL_OUTPUT_FORMATS = new Set(["blocks-table", "summary-table", "report"]);

function normalizeOutputFormat(value, options = {}) {
  if (PLOT_OUTPUT_FORMAT_LAYOUTS.has(value) || NONVISUAL_OUTPUT_FORMATS.has(value)) {
    return value;
  }
  if (value === "plot") {
    return LAYOUT_OUTPUT_FORMATS.get(options.layout) ?? "circular-plot";
  }
  return "circular-plot";
}

function isPlotOutputFormat(outputFormat) {
  return PLOT_OUTPUT_FORMAT_LAYOUTS.has(outputFormat);
}

function normalizeOptionsForOutputFormat(options, outputFormat) {
  const layout = PLOT_OUTPUT_FORMAT_LAYOUTS.get(outputFormat);
  if (!layout) {
    return options;
  }
  return {
    ...options,
    layout
  };
}

function selectedOutput(result, outputFormat) {
  if (outputFormat === "blocks-table") return result.blockTsv;
  if (outputFormat === "summary-table") return result.summaryTsv;
  if (outputFormat === "report") return result.report;
  return result.svg;
}

function downloadMetadata(outputFormat) {
  if (isPlotOutputFormat(outputFormat)) {
    const layout = PLOT_OUTPUT_FORMAT_LAYOUTS.get(outputFormat);
    return {
      filename: `genome-comparison-${layout}.svg`,
      mimeType: "image/svg+xml;charset=utf-8"
    };
  }
  if (outputFormat === "blocks-table") {
    return {
      filename: "genome-comparison-alignment-blocks.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "summary-table") {
    return {
      filename: "genome-comparison-summary.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "report") {
    return {
      filename: "genome-comparison-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  return {
    filename: "genome-comparison-circular.svg",
    mimeType: "image/svg+xml;charset=utf-8"
  };
}

export async function runGenomeComparisonPoster(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  const outputFormat = normalizeOutputFormat(options.outputFormat, options);
  const result = await calculateGenomeComparisonPoster(input, normalizeOptionsForOutputFormat(options, outputFormat), context);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  const recordsProcessed = 1 + result.comparisons.length;
  const basesProcessed = (result.reference.baseLength ?? result.reference.sequence.length) +
    result.comparisons.reduce((sum, comparison) => sum + (comparison.baseLength ?? comparison.sequence.length), 0);

  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat),
    warnings: result.warnings,
    recordsProcessed,
    basesProcessed,
    streams: {
      plot: makeTextStream(result.svg, "image/svg+xml"),
      table: makeTableStream(genomeComparisonBlockColumns, result.blockRows, "genome-comparison-blocks"),
      summaryTable: makeTableStream(genomeComparisonSummaryColumns, result.summaryRows, "genome-comparison-summary"),
      report: makeTextStream(result.report, "text/plain")
    },
    visual: isPlotOutputFormat(outputFormat) ? { svg: result.svg } : undefined,
    optionsUsed: result.options
  });
}
