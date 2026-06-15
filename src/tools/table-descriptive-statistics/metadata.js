import { descriptiveStatisticsColumns } from "../../core/table-descriptive-statistics.js";

export const tableDescriptiveStatisticsMetadata = {
  id: "table-descriptive-statistics",
  name: "Statistical Summary",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Calculate descriptive, robust, shape, and mean-interval summary statistics for numeric columns in a CSV, TSV, or Excel table.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Descriptive statistics table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "summaryTable", kind: "table", schema: "table-descriptive-statistics", columns: descriptiveStatisticsColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/table-descriptive-statistics/run.js",
  workerExport: "runTableDescriptiveStatistics",
  options: [
    {
      type: "group",
      label: "Input",
      options: [
        {
          id: "delimiter",
          type: "select",
          label: "Delimiter",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "tab", label: "Tab" },
            { value: "comma", label: "Comma" },
            { value: "semicolon", label: "Semicolon" },
            { value: "pipe", label: "Pipe" }
          ]
        },
        { id: "hasHeader", type: "checkbox", label: "First row contains column names", defaultValue: true }
      ]
    },
    {
      id: "numericColumns",
      type: "text",
      label: "Numeric columns",
      defaultValue: "",
      suggestionsFrom: "table-numeric-columns",
      help: "Optional comma-separated column names. Leave blank to summarize columns that parse as numeric after blanks, NA, N/A, null, and - are treated as missing."
    },
    {
      id: "trimPercent",
      type: "number",
      label: "Trim from each tail (%)",
      defaultValue: 10,
      min: 0,
      max: 45,
      step: 5,
      help: "Used for the trimmed mean. A 10% trim removes floor(n x 0.10) values from the low end and the same count from the high end before taking the mean."
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "summary-tsv",
          choices: [
            { value: "summary-tsv", label: "Summary table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ],
  citations: [
    {
      text: "Descriptive statistics use sample SD (n - 1), linear-interpolated quartiles, SE = SD / sqrt(n), t-distribution 95% mean confidence intervals, selected-percent trimmed means, CV = SD / abs(mean) * 100, unscaled MAD, and the 1.5 x IQR outlier rule."
    },
    {
      text: "Skewness is adjusted Fisher-Pearson sample skewness; excess kurtosis is unbiased Fisher excess kurtosis, matching the common pandas/R-style sample definitions."
    }
  ]
};
