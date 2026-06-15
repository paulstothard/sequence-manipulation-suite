import { twoWayAnovaColumns } from "../../core/hypothesis-tests.js";

export const twoWayAnovaMetadata = {
  id: "two-way-anova",
  name: "Two-Way ANOVA",
  category: "Statistics",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Run a two-way ANOVA with interaction for one numeric column and two categorical factors.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Two-way ANOVA result table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "resultTable", kind: "table", schema: "two-way-anova", columns: twoWayAnovaColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/two-way-anova/run.js",
  workerExport: "runTwoWayAnovaTool",
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
      label: "ANOVA setup",
      options: [
        {
          id: "valueColumn",
          type: "text",
          label: "Value column",
          defaultValue: "expression",
          suggestionsFrom: "table-numeric-columns",
          help: "Blank, NA, N/A, null, and - values are excluded before model fitting."
        },
        {
          id: "factorAColumn",
          type: "text",
          label: "Factor A",
          defaultValue: "genotype",
          suggestionsFrom: "table-columns",
          help: "SMS3 reports sequential Type I sums of squares in Factor A then Factor B order."
        },
        {
          id: "factorBColumn",
          type: "text",
          label: "Factor B",
          defaultValue: "treatment",
          suggestionsFrom: "table-columns",
          help: "The model includes Factor A, Factor B, and their interaction."
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
      text: "Two-way ANOVA is reported as sequential Type I sums of squares for a crossed two-factor model with an interaction term; unbalanced designs are flagged because term order affects interpretation."
    }
  ]
};
