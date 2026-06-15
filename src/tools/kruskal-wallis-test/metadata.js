import { kruskalWallisTestColumns } from "../../core/hypothesis-tests.js";

export const kruskalWallisTestMetadata = {
  id: "kruskal-wallis-test",
  name: "Kruskal-Wallis Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Compare a numeric value across two or more independent groups using a rank-based Kruskal-Wallis test.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Kruskal-Wallis result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "kruskal-wallis-test", columns: kruskalWallisTestColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/kruskal-wallis-test/run.js",
  workerExport: "runKruskalWallisTestTool",
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
      label: "Test setup",
      options: [
        {
          id: "valueColumn",
          type: "text",
          label: "Value column",
          defaultValue: "expression",
          suggestionsFrom: "table-numeric-columns",
          help: "Blank, NA, N/A, null, and - values are excluded from the rank test."
        },
        { id: "groupColumn", type: "text", label: "Group column", defaultValue: "condition", suggestionsFrom: "table-columns" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "result-tsv", choices: [
          { value: "result-tsv", label: "Result table" },
          { value: "report", label: "Summary report" }
        ] }
      ]
    }
  ],
  citations: [
    {
      text: "The Kruskal-Wallis H statistic ranks pooled observations with average ranks for ties and reports the chi-square approximation with k - 1 degrees of freedom."
    }
  ]
};
