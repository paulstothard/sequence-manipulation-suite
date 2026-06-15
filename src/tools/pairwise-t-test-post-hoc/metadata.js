import { pairwiseTTestPostHocColumns } from "../../core/hypothesis-tests.js";

export const pairwiseTTestPostHocMetadata = {
  id: "pairwise-t-test-post-hoc",
  name: "Pairwise t-Test Post-Hoc",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Run pairwise Welch t-tests across all groups for one numeric table column, with adjusted p values.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "post-hoc comparison table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "pairwise-t-test-post-hoc", columns: pairwiseTTestPostHocColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/pairwise-t-test-post-hoc/run.js",
  workerExport: "runPairwiseTTestPostHocTool",
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
          help: "Blank, NA, N/A, null, and - values are excluded before grouping."
        },
        {
          id: "groupColumn",
          type: "text",
          label: "Group column",
          defaultValue: "condition",
          suggestionsFrom: "table-columns",
          help: "Every group with at least two numeric observations is compared with every other usable group."
        },
        {
          id: "adjustment",
          type: "select",
          label: "P-value adjustment",
          defaultValue: "holm",
          choices: [
            { value: "holm", label: "Holm" },
            { value: "bonferroni", label: "Bonferroni" },
            { value: "none", label: "None" }
          ],
          help: "Adjustment is applied across all reported pairwise comparisons. Holm is the default because it is usually less conservative than Bonferroni while controlling family-wise error."
        },
        {
          id: "alpha",
          type: "number",
          label: "Alpha",
          defaultValue: 0.05,
          min: 0.001,
          max: 0.5,
          step: 0.001,
          help: "Used only for the interpretation text; all p values are reported."
        }
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
      text: "Each comparison uses Welch's two-sample t-test with two-sided p values from the Student t distribution; Holm and Bonferroni adjustments are applied across the reported family of comparisons."
    }
  ]
};
