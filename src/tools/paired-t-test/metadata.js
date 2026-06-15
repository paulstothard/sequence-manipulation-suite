import { pairedTTestColumns } from "../../core/hypothesis-tests.js";

export const pairedTTestMetadata = {
  id: "paired-t-test",
  name: "Paired t-Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Compare two paired numeric measurement columns using a paired two-sided t-test.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Paired t-test result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "paired-t-test", columns: pairedTTestColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/paired-t-test/run.js",
  workerExport: "runPairedTTestTool",
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
      label: "Test setup",
      options: [
        {
          id: "firstColumn",
          type: "text",
          label: "First measurement column",
          defaultValue: "before",
          suggestionsFrom: "table-numeric-columns",
          help: "Blank, NA, N/A, null, and - values are excluded row-wise with their paired partner."
        },
        {
          id: "secondColumn",
          type: "text",
          label: "Second measurement column",
          defaultValue: "after",
          suggestionsFrom: "table-numeric-columns",
          help: "The tested paired difference is second column minus first column."
        },
        {
          id: "pairIdColumn",
          type: "text",
          label: "Pair ID column",
          defaultValue: "sample",
          suggestionsFrom: "table-columns",
          help: "Optional label column used in the report and future paired-difference diagnostics; rows remain paired by row order."
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
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ],
  citations: [
    {
      text: "The paired t-test is calculated as a one-sample t-test on row-wise paired differences, with a two-sided p value from the Student t distribution."
    }
  ]
};
