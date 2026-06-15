import { listOverlapColumns } from "../../core/list-overlap.js";

export const upsetPlotMetadata = {
  id: "upset-plot",
  name: "UpSet Plot",
  category: "Plots",
  tags: ["table", "text", "plot", "search"],
  summary: "Compare two or more pasted lists as an UpSet plot, with exact overlap tables and item-list outputs.",
  inputType: "Two or more text lists",
  outputType: "UpSet plot, comparison report, item list, or table",
  splitInput: {
    separator: "---",
    allowAdd: true,
    addLabel: "Add list",
    panels: [
      { id: "a", label: "List A", dropLabel: "Drop List A plain-text, CSV, or TSV items here", accept: ".txt,.csv,.tsv,.tab" },
      { id: "b", label: "List B", dropLabel: "Drop List B plain-text, CSV, or TSV items here", accept: ".txt,.csv,.tsv,.tab" },
      { id: "c", label: "List C", dropLabel: "Drop List C plain-text, CSV, or TSV items here", accept: ".txt,.csv,.tsv,.tab" }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "upset", kind: "text", mediaType: "image/svg+xml", label: "UpSet plot" },
      { id: "sharedItems", kind: "text", mediaType: "text/plain", label: "Shared items" },
      { id: "uniqueItems", kind: "text", mediaType: "text/plain", label: "Unique-to-one-list items" },
      { id: "table", kind: "table", schema: "list-overlap", columns: listOverlapColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/upset-plot/run.js",
  workerExport: "runUpsetPlot",
  options: [
    {
      type: "group",
      label: "Comparison",
      help: "List membership is treated as set presence/absence, while duplicate counts are retained in the table.",
      options: [
        { id: "trimItems", type: "checkbox", label: "Trim item whitespace", defaultValue: true },
        { id: "caseSensitive", type: "checkbox", label: "Case-sensitive comparison", defaultValue: false },
        { id: "ignoreCommentLines", type: "checkbox", label: "Ignore comment lines starting with #", defaultValue: true }
      ]
    },
    {
      type: "group",
      label: "Output format",
      help: "Shared items are present in every list. Unique items are present in exactly one list. The comparison TSV contains exact item-level membership and duplicate counts.",
      options: [
        { id: "maxIntersections", type: "number", label: "Maximum plotted intersections", defaultValue: 24, min: 1, max: 80, step: 1 },
        {
          id: "scaleMode",
          type: "select",
          label: "Bar scale",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto" },
            { value: "linear", label: "Linear counts" },
            { value: "log", label: "Log10 counts" }
          ],
          help: "Auto uses a linear scale for compact count ranges and log10 scaling when positive counts span 100-fold or more. Labels always show raw counts."
        },
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "upset-svg",
          choices: [
            { value: "upset-svg", label: "UpSet plot" },
            { value: "table-tsv", label: "Comparison table" },
            { value: "shared", label: "Shared by all item list" },
            { value: "unique-one", label: "Unique to one list item list" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
