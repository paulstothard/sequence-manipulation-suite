import {
  permutationNullDistributionColumns,
  permutationTestResultColumns
} from "../../core/two-group-permutation-test.js";

export const twoGroupPermutationTestMetadata = {
  id: "two-group-permutation-test",
  name: "Two-Group Permutation Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Compare two groups in a numeric table column using an exact or seeded random permutation test.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Result table, null-distribution table, summary report, or null-distribution plot",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "two-group-permutation-test", columns: permutationTestResultColumns },
      { id: "nullDistribution", kind: "table", schema: "two-group-permutation-null-distribution", columns: permutationNullDistributionColumns },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/two-group-permutation-test/run.js",
  workerExport: "runTwoGroupPermutationTestTool",
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
          help: "Blank, NA, N/A, null, and - values are excluded from the permutation test."
        },
        { id: "groupColumn", type: "text", label: "Group column", defaultValue: "condition", suggestionsFrom: "table-columns" },
        { id: "groupA", type: "text", label: "Group A", defaultValue: "control" },
        { id: "groupB", type: "text", label: "Group B", defaultValue: "treated" },
        { id: "statistic", type: "radio", label: "Statistic", defaultValue: "mean-difference", choices: [
          { value: "mean-difference", label: "Difference in means" },
          { value: "median-difference", label: "Difference in medians" }
        ] }
      ]
    },
    {
      type: "group",
      label: "Resampling",
      options: [
        {
          id: "iterations",
          type: "number",
          label: "Random permutations",
          defaultValue: 5000,
          min: 100,
          max: 100000,
          step: 100,
          help: "Used only when the number of possible group assignments is larger than the exact-enumeration limit."
        },
        {
          id: "maxExactPermutations",
          type: "number",
          label: "Exact enumeration limit",
          defaultValue: 10000,
          min: 100,
          max: 100000,
          step: 100
        },
        {
          id: "seed",
          type: "text",
          label: "Random seed",
          defaultValue: "",
          help: "Leave blank to generate a new seed for random permutations. Exact enumeration does not use the seed."
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "report", choices: [
          { value: "report", label: "Summary report" },
          { value: "result-tsv", label: "Result table" },
          { value: "null-tsv", label: "Null distribution table" },
          { value: "svg", label: "Null distribution plot" }
        ] }
      ]
    }
  ],
  citations: [
    {
      text: "Permutation p values are calculated from the null distribution of reassigned group labels; random-mode p values use the common plus-one correction."
    }
  ],
  examples: [
    {
      label: "Expression response by condition",
      input: `sample,condition,expression
C1,control,8.2
C2,control,7.9
C3,control,8.4
C4,control,8.0
T1,treated,10.3
T2,treated,9.8
T3,treated,10.7
T4,treated,9.9`
    }
  ]
};
