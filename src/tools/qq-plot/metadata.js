import { qqPlotColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const qqPlotMetadata = {
  id: "qq-plot",
  name: "Q-Q Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Compare a numeric column against normal-theory quantiles with a downloadable quantile table.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Q-Q plot or quantile table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "quantileTable", kind: "table", schema: "qq-plot-quantiles", columns: qqPlotColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/qq-plot/run.js",
  workerExport: "runQqPlot",
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
      label: "Q-Q plot",
      options: [
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "normalized_expression", suggestionsFrom: "table-numeric-columns" },
        { id: "labelColumn", type: "text", label: "Label column", defaultValue: "sample_id", suggestionsFrom: "table-columns" },
        {
          id: "maxPointsDrawn",
          type: "number",
          label: "Max plotted points",
          defaultValue: 10000,
          min: 100,
          max: 100000,
          step: 100,
          help: "The plot samples evenly across sorted quantiles above this limit; the quantile TSV still includes every usable row."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "Normal Q-Q plot of normalized expression" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Q-Q plot" },
          { value: "quantile-tsv", label: "Quantile table" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: true, y: true })
  ]
};
