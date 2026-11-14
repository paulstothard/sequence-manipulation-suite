import { alignmentDotPlotColumns, calculateAlignmentDotPlot } from "../../core/alignment-dot-plot.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

function selectedOutput(result, outputFormat) {
  if (["tsv", "matches"].includes(outputFormat)) return result.tsv;
  if (outputFormat === "report") return result.report;
  return result.svg;
}

function downloadMetadata(outputFormat, stem = "alignment-dot-plot") {
  if (["tsv", "matches"].includes(outputFormat)) {
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
  const { downloadStem, ...calculationDefaults } = defaults;
  const result = await calculateAlignmentDotPlot(input, { ...options, ...calculationDefaults }, context);
  const outputFormat = result.optionsUsed.outputFormat;
  const streams = outputFormat === "report"
    ? { report: makeTextStream(result.report, "text/plain") }
    : outputFormat === "svg"
      ? { plot: makeTextStream(result.svg, "image/svg+xml") }
      : { [outputFormat === "matches" ? "matches" : "table"]: makeTableStream(alignmentDotPlotColumns, result.matches, "alignment-dot-plot") };
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat, downloadStem),
    warnings: result.warnings,
    notes: result.notes,
    charactersRemoved: result.charactersRemoved,
    optionsUsed: result.optionsUsed,
    recordsProcessed: result.records.length,
    processedUnitLabel: result.alphabet === "protein" ? (result.records.some(record => record.sequence.includes("*")) ? "character" : "residue") : "base",
    basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    streams,
    visual: outputFormat === "svg" ? { svg: result.svg } : undefined
  });
}

export async function runAlignmentDotPlot(input, options = {}, context = {}) {
  return runAlignmentDotPlotWithDefaults(input, options, context);
}

export async function runDnaRnaAlignmentDotPlot(input, options = {}, context = {}) {
  return runAlignmentDotPlotWithDefaults(input, options, context, {
    alphabet: "dna-rna",
    downloadStem: "dna-rna-dot-plot"
  });
}

export async function runProteinAlignmentDotPlot(input, options = {}, context = {}) {
  return runAlignmentDotPlotWithDefaults(input, options, context, {
    alphabet: "protein",
    downloadStem: "protein-dot-plot"
  });
}
