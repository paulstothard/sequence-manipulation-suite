import {
  genomeFigureFeatureColumns,
  makeGenomeFigureData,
  makeGenomeFigureStream
} from "../../core/genome-figure-data.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

function normalizeOptions(options = {}) {
  const outputFormat = options.outputFormat ?? options.layout;
  return {
    outputFormat: outputFormat === "report" ? "report" : outputFormat === "linear" ? "linear" : "circular",
    layout: outputFormat === "linear" ? "linear" : "circular",
    labelDensity: new Set(["low", "medium", "high"]).has(options.labelDensity) ? options.labelDensity : "medium",
    featureLayout: new Set(["non-overlap", "type-slots"]).has(options.featureLayout) ? options.featureLayout : "type-slots"
  };
}

export function runGenomeFigure(input, options = {}, context = {}) {
  const normalized = normalizeOptions(options);
  const prepared = makeGenomeFigureData(input, normalized, context);
  const { figure, rows, warnings } = prepared;

  if (figure.records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: warnings.length ? warnings : ["No DNA sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0
    });
  }

  const output = [
    "Genome figure prepared",
    `Records: ${prepared.recordsProcessed}`,
    `Bases: ${prepared.basesProcessed}`,
    `Layout: ${normalized.layout === "linear" ? "wrapped linear" : "circular"}`,
    `Features available in table stream: ${rows.length}`,
    normalized.outputFormat === "report"
      ? "Select a genome figure output to open the editable figure panel."
      : "Use the editable figure panel to adjust theme, plots, feature layout, labels, and export PNG/SVG."
  ].join("\n");

  return makeToolResult({
    output,
    download: {
      filename: "genome-figure-report.txt",
      mimeType: "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: prepared.recordsProcessed,
    basesProcessed: prepared.basesProcessed,
    streams: normalized.outputFormat === "report"
      ? {
          report: makeTextStream(output, "text/plain")
        }
      : {
          figure: makeGenomeFigureStream(figure),
          table: makeTableStream(genomeFigureFeatureColumns, rows, "genome-figure-features")
        },
    visual: normalized.outputFormat === "report" ? undefined : { figure }
  });
}

export const genomeFigureRunner = runGenomeFigure;
