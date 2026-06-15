import {
  multipleLinearRegressionCoefficientColumns,
  multipleLinearRegressionFitColumns,
  multipleLinearRegressionModelColumns
} from "../../core/multiple-linear-regression.js";

export const multipleLinearRegressionMetadata = {
  id: "multiple-linear-regression",
  name: "Multiple Linear Regression",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Fit an ordinary least-squares model for one numeric response and multiple numeric predictors.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Coefficient table, model summary table, fitted/residual table, residual plot, or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "modelTable", kind: "table", schema: "multiple-linear-regression-model", columns: multipleLinearRegressionModelColumns },
      { id: "coefficientTable", kind: "table", schema: "multiple-linear-regression-coefficients", columns: multipleLinearRegressionCoefficientColumns },
      { id: "fitTable", kind: "table", schema: "multiple-linear-regression-fit", columns: multipleLinearRegressionFitColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/multiple-linear-regression/run.js",
  workerExport: "runMultipleLinearRegressionTool",
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
        {
          id: "responseColumn",
          type: "text",
          label: "Response column",
          defaultValue: "yield_ng",
          suggestionsFrom: "table-numeric-columns",
          help: "The numeric outcome to model. Blank, NA, N/A, null, and - values are excluded row-wise before fitting."
        },
        {
          id: "predictorColumns",
          type: "text",
          label: "Predictor columns",
          defaultValue: "input_ng,fragment_kb,gc_percent",
          suggestionsFrom: "table-numeric-columns",
          help: "Enter one or more numeric predictor columns separated by commas. The browser tool refuses more than 12 predictors."
        },
        {
          id: "labelColumn",
          type: "text",
          label: "Row labels",
          defaultValue: "sample_id",
          suggestionsFrom: "table-columns",
          help: "Labels are used in fitted/residual output and residual-plot tooltips."
        }
      ]
    },
    {
      type: "group",
      label: "Plot",
      options: [
        { id: "title", type: "text", label: "Title", defaultValue: "Library yield multiple regression" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "coefficient-tsv", choices: [
          { value: "coefficient-tsv", label: "Coefficient table" },
          { value: "model-tsv", label: "Model summary table" },
          { value: "fit-tsv", label: "Fitted/residual table" },
          { value: "residual-plot-svg", label: "Residual plot" },
          { value: "report", label: "Summary report" }
        ] }
      ]
    }
  ],
  citations: [
    {
      text: "Multiple linear regression uses ordinary least squares with an intercept; coefficient p values use t tests and the overall model p value uses the F distribution."
    }
  ]
};
