import { heatmapColumns } from "../../core/plot-tools.js";

export const heatmapMetadata = {
  id: "heatmap",
  name: "Heatmap",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Create a heatmap from two categorical columns and one numeric value column.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Heatmap plot or heatmap cell table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "cellTable", kind: "table", schema: "heatmap-cells", columns: heatmapColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/heatmap/run.js",
  workerExport: "runHeatmap",
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
      label: "Plot columns",
      options: [
        { id: "xColumn", type: "text", label: "X column", defaultValue: "sample_id", suggestionsFrom: "table-columns" },
        { id: "yColumn", type: "text", label: "Y column", defaultValue: "gene_id", suggestionsFrom: "table-columns" },
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "tpm", suggestionsFrom: "table-numeric-columns" },
        {
          id: "colorScale",
          type: "select",
          label: "Color scale",
          defaultValue: "light-viridis",
          choices: [
            { value: "light-viridis", label: "Light teal-yellow" },
            { value: "viridis", label: "Viridis" },
            { value: "blue", label: "Blue sequential" },
            { value: "red-blue", label: "Red-blue diverging" }
          ]
        },
        {
          id: "categoryOrder",
          type: "select",
          label: "Category order",
          defaultValue: "input",
          choices: [
            { value: "input", label: "First appearance" },
            { value: "alphabetical", label: "Alphabetical" }
          ]
        },
        {
          id: "showMissingCells",
          type: "checkbox",
          label: "Show missing cells as blanks",
          defaultValue: true
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "Expression heatmap" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Heatmap plot" },
          { value: "cell-tsv", label: "Cell table" }
        ] }
      ]
    }
  ]
};
