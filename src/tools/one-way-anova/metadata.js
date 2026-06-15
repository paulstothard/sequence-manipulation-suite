import { oneWayAnovaColumns } from "../../core/hypothesis-tests.js";

export const oneWayAnovaMetadata = {
  id: "one-way-anova",
  name: "One-Way ANOVA",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Compare means across two or more groups for one numeric table column with one-way ANOVA.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "ANOVA result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "one-way-anova", columns: oneWayAnovaColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/one-way-anova/run.js",
  workerExport: "runOneWayAnovaTool",
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
          defaultValue: "concentration_ng_ul",
          suggestionsFrom: "table-numeric-columns",
          help: "Blank, NA, N/A, null, and - values are excluded from the ANOVA."
        },
        { id: "groupColumn", type: "text", label: "Group column", defaultValue: "treatment", suggestionsFrom: "table-columns" }
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
      text: "One-way ANOVA is reported with right-tailed p values from the F distribution; SMS3 reports simple variance and group-size suitability notes."
    }
  ]
};
