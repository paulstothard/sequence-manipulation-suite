import { linePlotColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const linePlotMetadata = {
  id: "line-plot",
  name: "Line Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot"],
  summary: "Create a line plot from numeric x and y table columns, optionally split into series.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Line plot or plotted-point table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "pointTable", kind: "table", schema: "line-points", columns: linePlotColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/line-plot/run.js",
  workerExport: "runLinePlot",
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
        { id: "xColumn", type: "text", label: "X column", defaultValue: "time_hr", suggestionsFrom: "table-numeric-columns" },
        { id: "yColumn", type: "text", label: "Y column", defaultValue: "mean_tpm", suggestionsFrom: "table-numeric-columns" },
        { id: "seriesColumn", type: "text", label: "Series", defaultValue: "condition", suggestionsFrom: "table-columns" },
        { id: "labelColumn", type: "text", label: "Point labels", defaultValue: "sample_id", suggestionsFrom: "table-columns" },
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
        { id: "title", type: "text", label: "Plot title", defaultValue: "Expression time course" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Line plot" },
          { value: "point-tsv", label: "Point table" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: true, y: true })
  ]
};
