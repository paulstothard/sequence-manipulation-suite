import {
  chiSquareExpectedCountColumns,
  chiSquareTestColumns
} from "../../core/hypothesis-tests.js";

export const chiSquareTestMetadata = {
  id: "chi-square-test",
  name: "Chi-Square Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Run Pearson's chi-square test of independence on a contingency count table.",
  inputType: "CSV, TSV, or Excel contingency count table",
  outputType: "Chi-square result table, expected-count table, or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "chi-square-test", columns: chiSquareTestColumns },
      { id: "expectedTable", kind: "table", schema: "chi-square-expected-counts", columns: chiSquareExpectedCountColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/chi-square-test/run.js",
  workerExport: "runChiSquareTestTool",
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
      type: "group",
      label: "Contingency table",
      options: [
        {
          id: "rowLabelColumn",
          type: "text",
          label: "Row category column",
          defaultValue: "phenotype",
          suggestionsFrom: "table-columns",
          help: "This column supplies the row categories. All selected count columns are treated as column categories."
        },
        {
          id: "countColumns",
          type: "text",
          label: "Count columns",
          defaultValue: "control,treatment",
          suggestionsFrom: "table-numeric-columns",
          help: "Comma-separated count columns. Leave blank to use every column except the row category column."
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "result-tsv",
          choices: [
            { value: "result-tsv", label: "Result table" },
            { value: "expected-tsv", label: "Observed/expected table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ],
  citations: [
    {
      text: "Pearson's chi-square test is reported with right-tailed p values from the chi-square distribution and expected-count suitability warnings."
    }
  ]
};
