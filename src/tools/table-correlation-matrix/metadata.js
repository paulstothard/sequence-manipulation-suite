import { tableCorrelationColumns } from "../../core/table-correlation.js";

export const tableCorrelationMatrixMetadata = {
  id: "table-correlation-matrix",
  name: "Correlation / Covariance Matrix",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Calculate pairwise Pearson, Spearman, Kendall, and covariance values for numeric table columns.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Correlation/covariance table, report, or heatmap",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "matrixTable", kind: "table", schema: "table-correlation-matrix", columns: tableCorrelationColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/table-correlation-matrix/run.js",
  workerExport: "runTableCorrelationMatrix",
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
      label: "Pairwise statistics",
      options: [
        {
          id: "numericColumns",
          type: "text",
          label: "Numeric columns",
          defaultValue: "",
          suggestionsFrom: "table-numeric-columns",
          help: "Optional comma-separated column names. Leave blank to compare columns that parse as numeric after blanks, NA, N/A, null, and - are treated as missing. Pairwise calculations use rows where both selected columns have numeric values."
        },
        { id: "title", type: "text", label: "Heatmap title", defaultValue: "RNA QC pairwise heatmap" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "matrix-tsv", choices: [
          { value: "matrix-tsv", label: "Matrix table" },
          { value: "correlation-heatmap-svg", label: "Pearson r heatmap" },
          { value: "spearman-heatmap-svg", label: "Spearman rho heatmap" },
          { value: "kendall-heatmap-svg", label: "Kendall tau-b heatmap" },
          { value: "covariance-heatmap-svg", label: "Covariance heatmap" },
          { value: "report", label: "Summary report" }
        ] }
      ]
    }
  ],
  citations: [
    {
      text: "Pearson r, Spearman rho, Kendall tau-b, and sample covariance use pairwise-complete numeric observations. Spearman rho uses average ranks for ties; Kendall tau-b applies tie correction."
    }
  ]
};
