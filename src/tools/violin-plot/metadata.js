import { violinDensityColumns, violinSummaryColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const violinPlotMetadata = {
  id: "violin-plot",
  name: "Violin Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Create violin plots for a numeric column, optionally grouped by a category column.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Violin plot, density table, or summary table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "densityTable", kind: "table", schema: "violin-density", columns: violinDensityColumns },
      { id: "summaryTable", kind: "table", schema: "violin-summary", columns: violinSummaryColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/violin-plot/run.js",
  workerExport: "runViolinPlot",
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
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "expression", suggestionsFrom: "table-numeric-columns" },
        { id: "groupColumn", type: "text", label: "Group column", defaultValue: "condition", suggestionsFrom: "table-columns" },
        {
          id: "bandwidth",
          type: "number",
          label: "KDE bandwidth",
          defaultValue: 0,
          min: 0,
          step: 0.1,
          help: "Use 0 for an automatic robust bandwidth. A larger value smooths the violin; a smaller value follows local peaks more closely."
        },
        {
          id: "gridPoints",
          type: "number",
          label: "Density resolution",
          defaultValue: 80,
          min: 24,
          max: 200,
          step: 8,
          help: "Number of vertical points used to draw each kernel-density curve and density table."
        },
        {
          id: "maxDotsDrawn",
          type: "number",
          label: "Maximum measurement dots",
          defaultValue: 1000,
          min: 0,
          max: 10000,
          step: 100,
          help: "Density and summary TSV outputs use all numeric values; this only caps individual dot drawing in the visual output."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "Expression distribution by condition" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Violin plot" },
          { value: "density-tsv", label: "Density table" },
          { value: "summary-tsv", label: "Summary table" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: false, y: true })
  ],
  citations: [
    {
      text: "Violin shape is estimated with a Gaussian kernel-density estimate; automatic bandwidth uses a robust Silverman-style rule of thumb (Silverman, Density Estimation for Statistics and Data Analysis, 1986)."
    }
  ]
};
