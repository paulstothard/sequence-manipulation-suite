import { volcanoPlotColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const volcanoPlotMetadata = {
  id: "volcano-plot",
  name: "Volcano Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Create a volcano plot from log2 fold changes and p values.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Volcano plot or plotted-point table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "pointTable", kind: "table", schema: "volcano-points", columns: volcanoPlotColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/volcano-plot/run.js",
  workerExport: "runVolcanoPlot",
  options: [
    {
      type: "group",
      label: "Input",
      options: [
        {
          id: "delimiter",
          type: "select",
          label: "Delimiter",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "tab", label: "Tab" },
            { value: "comma", label: "Comma" },
            { value: "semicolon", label: "Semicolon" },
            { value: "pipe", label: "Pipe" }
          ]
        },
        { id: "hasHeader", type: "checkbox", label: "First row contains column names", defaultValue: true }
      ]
    },
    {
      type: "group",
      label: "Plot columns",
      options: [
        { id: "foldChangeColumn", type: "text", label: "log2 fold-change column", defaultValue: "log2_fold_change", suggestionsFrom: "table-numeric-columns" },
        { id: "pValueColumn", type: "text", label: "p-value column", defaultValue: "adjusted_p_value", suggestionsFrom: "table-numeric-columns" },
        { id: "labelColumn", type: "text", label: "Point labels", defaultValue: "gene_id", suggestionsFrom: "table-columns" },
        { id: "foldChangeCutoff", type: "number", label: "|log2 fold-change| threshold", defaultValue: 1, min: 0, max: 20, step: 0.1 },
        { id: "pValueCutoff", type: "number", label: "p-value threshold", defaultValue: 0.05, min: 0.000001, max: 1, step: 0.001 },
        {
          id: "maxPointsDrawn",
          type: "number",
          label: "Maximum plotted points",
          defaultValue: 10000,
          min: 100,
          max: 100000,
          step: 100,
          help: "The Point TSV still contains all parsed points; this only caps visual drawing for browser responsiveness."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "Differential expression volcano plot" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "svg",
          choices: [
            { value: "svg", label: "Volcano plot" },
            { value: "point-tsv", label: "Point table" }
          ]
        }
      ]
    },
    makeAxisLimitsGroup({ x: true, y: true })
  ]
};
