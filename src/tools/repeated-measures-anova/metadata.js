import { repeatedMeasuresAnovaColumns } from "../../core/hypothesis-tests.js";

export const repeatedMeasuresAnovaMetadata = {
  id: "repeated-measures-anova",
  name: "Repeated-Measures ANOVA",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Test one numeric measurement across repeated conditions for the same subjects.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Repeated-measures ANOVA table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "repeated-measures-anova", columns: repeatedMeasuresAnovaColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/repeated-measures-anova/run.js",
  workerExport: "runRepeatedMeasuresAnovaTool",
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
          help: "Numeric repeated measurement. Blank, NA, N/A, null, and - values are excluded before complete-subject filtering."
        },
        {
          id: "subjectColumn",
          type: "text",
          label: "Subject column",
          defaultValue: "subject",
          suggestionsFrom: "table-columns",
          help: "Identifier for the matched subject, sample, donor, strain, or unit measured under each condition."
        },
        {
          id: "conditionColumn",
          type: "text",
          label: "Repeated condition column",
          defaultValue: "condition",
          suggestionsFrom: "table-columns",
          help: "Repeated condition or timepoint. Each retained subject must have one value for every condition."
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
      text: "One-factor repeated-measures ANOVA partitions variation into condition, subject, and residual terms using complete subjects; SMS3 does not apply sphericity corrections."
    }
  ]
};
