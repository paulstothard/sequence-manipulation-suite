import {
  outlierDiagnosticsColumns,
  outlierGroupSummaryColumns
} from "../../core/outlier-diagnostics.js";

export const outlierDiagnosticsMetadata = {
  id: "outlier-diagnostics",
  name: "Outlier Diagnostics",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Flag possible numeric outliers with IQR fences, z-scores, and modified z-scores.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Outlier table, group summary, report, or outlier plot",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "outlierTable", kind: "table", schema: "outlier-diagnostics", columns: outlierDiagnosticsColumns },
      { id: "summaryTable", kind: "table", schema: "outlier-group-summary", columns: outlierGroupSummaryColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/outlier-diagnostics/run.js",
  workerExport: "runOutlierDiagnostics",
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
      label: "Columns",
      options: [
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "measurement", suggestionsFrom: "table-numeric-columns" },
        { id: "groupColumn", type: "text", label: "Group column", defaultValue: "condition", suggestionsFrom: "table-columns", help: "Optional. Leave blank to analyze all numeric values as one group." },
        { id: "labelColumn", type: "text", label: "Label column", defaultValue: "sample_id", suggestionsFrom: "table-columns" }
      ]
    },
    {
      type: "group",
      label: "Outlier rules",
      options: [
        { id: "iqrMultiplier", type: "number", label: "IQR fence multiplier", defaultValue: 1.5, min: 0, step: 0.1 },
        { id: "zCutoff", type: "number", label: "Absolute z-score cutoff", defaultValue: 3, min: 0, step: 0.1 },
        { id: "modifiedZCutoff", type: "number", label: "Absolute modified Z cutoff", defaultValue: 3.5, min: 0, step: 0.1 }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "outlier-tsv", choices: [
          { value: "outlier-tsv", label: "Outlier table" },
          { value: "summary-tsv", label: "Group summary table" },
          { value: "plot-svg", label: "Outlier plot" },
          { value: "report", label: "Summary report" }
        ] }
      ]
    }
  ],
  citations: [
    {
      text: "IQR fences use the common Tukey 1.5 x IQR rule. Modified Z-scores use 0.6745 x (x - median) / MAD following Iglewicz and Hoaglin's robust outlier guidance."
    }
  ]
};
