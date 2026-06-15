import {
  simpleLinearRegressionColumns,
  simpleLinearRegressionFitColumns
} from "../../core/simple-linear-regression.js";

export const simpleLinearRegressionMetadata = {
  id: "simple-linear-regression",
  name: "Simple Linear Regression",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Fit an ordinary least-squares line for one numeric response and one numeric predictor.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Regression result table, fitted/residual table, plot, or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "simple-linear-regression", columns: simpleLinearRegressionColumns },
      { id: "fitTable", kind: "table", schema: "simple-linear-regression-fit", columns: simpleLinearRegressionFitColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/simple-linear-regression/run.js",
  workerExport: "runSimpleLinearRegressionTool",
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
      label: "Model setup",
      options: [
        { id: "xColumn", type: "text", label: "Predictor column (x)", defaultValue: "dose_uM", suggestionsFrom: "table-numeric-columns" },
        { id: "yColumn", type: "text", label: "Response column (y)", defaultValue: "response", suggestionsFrom: "table-numeric-columns" },
        { id: "labelColumn", type: "text", label: "Point labels", defaultValue: "sample_id", suggestionsFrom: "table-columns" },
        { id: "groupColumn", type: "text", label: "Color by", defaultValue: "condition", suggestionsFrom: "table-columns" }
      ]
    },
    {
      type: "group",
      label: "Plot",
      options: [
        { id: "title", type: "text", label: "Title", defaultValue: "Dose response linear regression" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "result-tsv", choices: [
          { value: "result-tsv", label: "Result table" },
          { value: "fit-tsv", label: "Fitted/residual table" },
          { value: "plot-svg", label: "Regression plot" },
          { value: "report", label: "Summary report" }
        ] }
      ]
    }
  ],
  citations: [
    {
      text: "Simple linear regression uses ordinary least squares; slope p values use the t distribution with n - 2 degrees of freedom."
    }
  ]
};
