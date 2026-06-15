import { alignmentDotPlotColumns, calculateAlignmentDotPlot } from "../../core/alignment-dot-plot.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["svg", "tsv", "report"]);

function selectedOutput(result, outputFormat) {
  if (outputFormat === "tsv") return result.tsv;
  if (outputFormat === "report") return result.report;
  return result.svg;
}

function downloadMetadata(outputFormat, stem = "alignment-dot-plot") {
  if (outputFormat === "tsv") {
    return { filename: `${stem}-matches.tsv`, mimeType: "text/tab-separated-values;charset=utf-8" };
  }
  if (outputFormat === "report") {
    return { filename: `${stem}-report.txt`, mimeType: "text/plain;charset=utf-8" };
  }
  return { filename: `${stem}.svg`, mimeType: "image/svg+xml;charset=utf-8" };
}

async function runAlignmentDotPlotWithDefaults(input, options = {}, context = {}, defaults = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.05 });
  context.throwIfCancelled?.();
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "svg";
  const { downloadStem, ...calculationDefaults } = defaults;
  const result = await calculateAlignmentDotPlot(input, { ...options, ...calculationDefaults }, context);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat, downloadStem),
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(alignmentDotPlotColumns, result.matches, "alignment-dot-plot"),
      matches: makeTableStream(alignmentDotPlotColumns, result.matches, "alignment-dot-plot"),
      plot: makeTextStream(result.svg, "image/svg+xml")
    },
    visual: outputFormat === "svg" ? { svg: result.svg } : undefined
  });
}

export async function runAlignmentDotPlot(input, options = {}, context = {}) {
  return runAlignmentDotPlotWithDefaults(input, options, context);
}

export async function runDnaRnaAlignmentDotPlot(input, options = {}, context = {}) {
  return runAlignmentDotPlotWithDefaults(input, options, context, {
    alphabet: "dna-rna",
    wordSize: options.wordSize ?? 11,
    includeReverseComplement: options.includeReverseComplement !== false,
    downloadStem: "dna-rna-dot-plot"
  });
}

export async function runProteinAlignmentDotPlot(input, options = {}, context = {}) {
  return runAlignmentDotPlotWithDefaults(input, options, context, {
    alphabet: "protein",
    wordSize: options.wordSize ?? 3,
    includeReverseComplement: false,
    downloadStem: "protein-dot-plot"
  });
}
