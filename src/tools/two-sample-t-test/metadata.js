import { twoSampleTTestColumns } from "../../core/hypothesis-tests.js";

export const twoSampleTTestMetadata = {
  id: "two-sample-t-test",
  name: "Two-Sample t-Test",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Compare two groups for one numeric table column using Welch or Student two-sample t-tests.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "t-test result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "two-sample-t-test", columns: twoSampleTTestColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/two-sample-t-test/run.js",
  workerExport: "runTwoSampleTTest",
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
          id: "test",
          type: "radio",
          label: "Variance model",
          defaultValue: "welch",
          choices: [
            { value: "welch", label: "Welch t-test" },
            { value: "student", label: "Student equal-variance t-test" }
          ],
          help: "Welch is the default because it does not assume equal group variances. SMS3 reports simple variance and group-size checks, but users should still review study design and outliers."
        },
        {
          id: "valueColumn",
          type: "text",
          label: "Value column",
          defaultValue: "concentration_ng_ul",
          suggestionsFrom: "table-numeric-columns",
          help: "Blank, NA, N/A, null, and - values are excluded from the test."
        },
        {
          id: "groupColumn",
          type: "text",
          label: "Group column",
          defaultValue: "treatment",
          suggestionsFrom: "table-columns"
        },
        { id: "groupA", type: "text", label: "Group A", defaultValue: "control", help: "Exact group label to compare." },
        { id: "groupB", type: "text", label: "Group B", defaultValue: "treatment", help: "Exact group label to compare." }
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
      text: "Welch's t-test and Student's t-test are reported with two-sided p values from the Student t distribution; variance-model assumptions are noted in the report."
    }
  ]
};
