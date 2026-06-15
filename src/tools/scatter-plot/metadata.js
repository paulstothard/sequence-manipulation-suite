import { scatterPlotColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const scatterPlotMetadata = {
  id: "scatter-plot",
  name: "Scatter Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot"],
  summary: "Create a scatter plot from two numeric table columns, optionally colored by group.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Scatter plot or plotted-point table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "pointTable", kind: "table", schema: "scatter-points", columns: scatterPlotColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/scatter-plot/run.js",
  workerExport: "runScatterPlot",
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
        { id: "xColumn", type: "text", label: "X column", defaultValue: "concentration_ng_ul", suggestionsFrom: "table-numeric-columns" },
        { id: "yColumn", type: "text", label: "Y column", defaultValue: "od260_280", suggestionsFrom: "table-numeric-columns" },
        { id: "groupColumn", type: "text", label: "Color by", defaultValue: "treatment", suggestionsFrom: "table-columns" },
        { id: "labelColumn", type: "text", label: "Point labels", defaultValue: "sample_id", suggestionsFrom: "table-columns" },
        {
          id: "maxPointsDrawn",
          type: "number",
          label: "Maximum plotted points",
          defaultValue: 5000,
          min: 100,
          max: 50000,
          step: 100,
          help: "The Point TSV still contains all parsed points; this only caps visual drawing for browser responsiveness."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "RNA sample QC scatter plot" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Scatter plot" },
          { value: "point-tsv", label: "Point table" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: true, y: true })
  ]
};
