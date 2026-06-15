import { mannWhitneyUTestColumns } from "../../core/hypothesis-tests.js";

export const mannWhitneyUTestMetadata = {
  id: "mann-whitney-u-test",
  name: "Mann-Whitney U Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Compare two independent groups using a rank-based Mann-Whitney U test.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Mann-Whitney U result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "mann-whitney-u-test", columns: mannWhitneyUTestColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/mann-whitney-u-test/run.js",
  workerExport: "runMannWhitneyUTestTool",
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
          id: "valueColumn",
          type: "text",
          label: "Value column",
          defaultValue: "expression",
          suggestionsFrom: "table-numeric-columns",
          help: "Blank, NA, N/A, null, and - values are excluded from the test."
        },
        {
          id: "groupColumn",
          type: "text",
          label: "Group column",
          defaultValue: "condition",
          suggestionsFrom: "table-columns"
        },
        { id: "groupA", type: "text", label: "Group A", defaultValue: "control", help: "Exact group label to compare." },
        { id: "groupB", type: "text", label: "Group B", defaultValue: "treatment", help: "Exact group label to compare." },
        {
          id: "alternative",
          type: "radio",
          label: "Alternative",
          defaultValue: "two-sided",
          choices: [
            { value: "two-sided", label: "Two-sided" },
            { value: "greater", label: "Group A tends higher" },
            { value: "less", label: "Group A tends lower" }
          ]
        },
        {
          id: "continuityCorrection",
          type: "checkbox",
          label: "Use continuity correction",
          defaultValue: true,
          help: "Applied to the normal approximation for the U statistic."
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
      text: "The Mann-Whitney U test is calculated from pooled ranks and reported with a tie-corrected normal approximation."
    }
  ]
};
