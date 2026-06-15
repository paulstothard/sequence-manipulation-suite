import { barPlotColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const barPlotMetadata = {
  id: "bar-plot",
  name: "Bar Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot"],
  summary: "Create grouped or ungrouped bar plots from category and numeric value columns.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Bar plot or plotted-bar table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "barTable", kind: "table", schema: "bar-values", columns: barPlotColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/bar-plot/run.js",
  workerExport: "runBarPlot",
  options: [
    {
      type: "group",
      label: "Input",
      options: [
        { id: "delimiter", type: "select", label: "Delimiter", defaultValue: "auto", choices: [
          { value: "auto", label: "Auto detect" },
          { value: "tab", label: "Tab" },
          { value: "comma", label: "Comma" },
          { value: "semicolon", label: "Semicolon" },
          { value: "pipe", label: "Pipe" }
        ] },
        { id: "hasHeader", type: "checkbox", label: "First row contains column names", defaultValue: true }
      ]
    },
    {
      type: "group",
      label: "Plot columns",
      options: [
        { id: "categoryColumn", type: "text", label: "Category column", defaultValue: "gene_id", suggestionsFrom: "table-columns" },
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "mean_tpm", suggestionsFrom: "table-numeric-columns" },
        { id: "groupColumn", type: "text", label: "Group bars by", defaultValue: "condition", suggestionsFrom: "table-columns" },
        {
          id: "maxBarsDrawn",
          type: "number",
          label: "Maximum plotted bars",
          defaultValue: 300,
          min: 10,
          max: 2000,
          step: 10,
          help: "The Bar TSV still contains all parsed bars; this only caps visual drawing for browser responsiveness."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "Expression by gene and condition" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Bar plot" },
          { value: "bar-tsv", label: "Bar table" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: false, y: true })
  ]
};
