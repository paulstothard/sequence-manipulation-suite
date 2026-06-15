import { boxPlotColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const boxPlotMetadata = {
  id: "box-plot",
  name: "Box Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Create box plots for a numeric column, optionally grouped by a category column.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Box plot or box-summary table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "boxTable", kind: "table", schema: "box-summary", columns: boxPlotColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/box-plot/run.js",
  workerExport: "runBoxPlot",
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
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "rin", suggestionsFrom: "table-numeric-columns" },
        { id: "groupColumn", type: "text", label: "Group column", defaultValue: "treatment", suggestionsFrom: "table-columns" },
        {
          id: "maxDotsDrawn",
          type: "number",
          label: "Maximum measurement dots",
          defaultValue: 1000,
          min: 0,
          max: 10000,
          step: 100,
          help: "Quartiles, whiskers, and the Box summary TSV use all numeric values; this only caps individual dot drawing in the visual output."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "RNA integrity by treatment" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Box plot" },
          { value: "box-tsv", label: "Box summary table" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: false, y: true })
  ]
};
