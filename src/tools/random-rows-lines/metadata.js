import { randomRowsLinesColumns } from "../../core/random-rows-lines.js";

export const randomRowsLinesMetadata = {
  id: "random-rows-lines",
  name: "Random Rows / Lines",
  category: "Random & Mutagenesis",
  tags: ["table", "text", "CSV", "TSV", "statistics"],
  summary: "Randomly sample lines or table rows, with optional header preservation, replacement, and reproducible seeds.",
  inputType: "Plain text, CSV, or TSV",
  outputType: "Sampled text or sampling table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "sampleTable", kind: "table", schema: "random-rows-lines", columns: randomRowsLinesColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/random-rows-lines/run.js",
  workerExport: "runRandomRowsLines",
  options: [
    {
      type: "group",
      label: "Sampling",
      options: [
        {
          id: "mode",
          type: "radio",
          label: "Sample from",
          defaultValue: "lines",
          choices: [
            { value: "lines", label: "Lines" },
            { value: "table", label: "Table rows" }
          ],
          help: "Line mode preserves the original text lines. Table mode parses delimited rows and can display the sampled rows as a structured table."
        },
        { id: "sampleSize", type: "number", label: "Sample size", defaultValue: 5, min: 0, step: 1 },
        { id: "withReplacement", type: "checkbox", label: "Sample with replacement", defaultValue: false },
        {
          id: "seed",
          type: "text",
          label: "Random seed",
          defaultValue: "",
          help: "Enter a seed to reproduce the same result; leave empty for a new random draw."
        }
      ]
    },
    {
      type: "group",
      label: "Input handling",
      options: [
        { id: "includeHeader", type: "checkbox", label: "Keep first line as header", defaultValue: true, visibleWhen: { option: "mode", value: "lines" } },
        { id: "keepBlankLines", type: "checkbox", label: "Allow blank lines to be sampled", defaultValue: false, visibleWhen: { option: "mode", value: "lines" } },
        {
          id: "delimiter",
          type: "select",
          label: "Delimiter",
          defaultValue: "auto",
          visibleWhen: { option: "mode", value: "table" },
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "tab", label: "Tab" },
            { value: "comma", label: "Comma" },
            { value: "semicolon", label: "Semicolon" },
            { value: "pipe", label: "Pipe" }
          ]
        },
        { id: "hasHeader", type: "checkbox", label: "First row contains column names", defaultValue: true, visibleWhen: { option: "mode", value: "table" } }
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
          defaultValue: "sampled-text",
          choices: [
            { value: "sampled-text", label: "Sampled text" },
            { value: "sample-table", label: "Sample table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
