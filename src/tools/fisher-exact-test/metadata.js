import { fisherExactTestColumns } from "../../core/hypothesis-tests.js";

export const fisherExactTestMetadata = {
  id: "fisher-exact-test",
  name: "Fisher Exact Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Run Fisher's exact test on a 2 x 2 contingency count table.",
  inputType: "CSV, TSV, or Excel 2 x 2 contingency count table",
  outputType: "Fisher exact-test result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "fisher-exact-test", columns: fisherExactTestColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fisher-exact-test/run.js",
  workerExport: "runFisherExactTestTool",
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
      label: "2 x 2 table",
      options: [
        {
          id: "rowLabelColumn",
          type: "text",
          label: "Row category column",
          defaultValue: "phenotype",
          suggestionsFrom: "table-columns",
          help: "This column supplies the two row categories."
        },
        {
          id: "countColumns",
          type: "text",
          label: "Two count columns",
          defaultValue: "control,treatment",
          suggestionsFrom: "table-numeric-columns",
          help: "Comma-separated count columns. Fisher's exact test requires exactly two selected count columns and two non-empty row categories."
        },
        {
          id: "alternative",
          type: "radio",
          label: "Alternative",
          defaultValue: "two-sided",
          choices: [
            { value: "two-sided", label: "Two-sided" },
            { value: "greater", label: "Row A enriched in column A" },
            { value: "less", label: "Row A depleted in column A" }
          ],
          help: "The one-sided alternatives are defined using the first non-empty row and first selected count column."
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
      text: "Fisher's exact test is calculated by summing hypergeometric probabilities for 2 x 2 tables with fixed row and column margins."
    }
  ]
};
