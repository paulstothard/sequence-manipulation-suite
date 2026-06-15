import { histogramColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const histogramMetadata = {
  id: "histogram",
  name: "Histogram",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Create a histogram for a numeric table column with a downloadable bin table.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Histogram plot or bin table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "binTable", kind: "table", schema: "histogram-bins", columns: histogramColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/histogram/run.js",
  workerExport: "runHistogram",
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
      label: "Histogram",
      options: [
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "read_length", suggestionsFrom: "table-numeric-columns" },
        {
          id: "binMode",
          type: "select",
          label: "Bin selection",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto" },
            { value: "manual", label: "Manual" }
          ],
          help: "Auto uses the Freedman-Diaconis rule when possible, with a Sturges fallback for very small or tied datasets."
        },
        {
          id: "binCount",
          type: "number",
          label: "Bins",
          defaultValue: 12,
          min: 1,
          max: 80,
          step: 1,
          visibleWhen: { option: "binMode", value: "manual" },
          help: "Bins span the observed numeric range; the final bin includes the maximum value."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "Read length histogram" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Histogram plot" },
          { value: "bin-tsv", label: "Bin table" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: true, y: true })
  ]
};
