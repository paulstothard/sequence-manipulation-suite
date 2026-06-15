import { wilcoxonSignedRankTestColumns } from "../../core/hypothesis-tests.js";

export const wilcoxonSignedRankTestMetadata = {
  id: "wilcoxon-signed-rank-test",
  name: "Wilcoxon Signed-Rank Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Compare two paired numeric columns using a rank-based Wilcoxon signed-rank test.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Wilcoxon signed-rank result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "wilcoxon-signed-rank-test", columns: wilcoxonSignedRankTestColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/wilcoxon-signed-rank-test/run.js",
  workerExport: "runWilcoxonSignedRankTestTool",
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
          help: "The ranked paired difference is second column minus first column."
        },
        {
          id: "pairIdColumn",
          type: "text",
          label: "Pair ID column",
          defaultValue: "sample",
          suggestionsFrom: "table-columns",
          help: "Optional label column used in the report and future paired-difference diagnostics; rows remain paired by row order."
        },
        {
          id: "alternative",
          type: "radio",
          label: "Alternative",
          defaultValue: "two-sided",
          choices: [
            { value: "two-sided", label: "Two-sided" },
            { value: "greater", label: "Second tends higher" },
            { value: "less", label: "Second tends lower" }
          ]
        },
        {
          id: "continuityCorrection",
          type: "checkbox",
          label: "Use continuity correction",
          defaultValue: true,
          help: "Applied to the normal approximation for the signed-rank statistic."
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
      text: "The Wilcoxon signed-rank test ranks absolute paired differences after removing zero differences and reports a tie-corrected normal approximation."
    }
  ]
};
