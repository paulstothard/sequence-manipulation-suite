import { listOverlapColumns, VENN_DIAGRAM_MAX_LISTS } from "../../core/list-overlap.js";

export const vennDiagramMetadata = {
  id: "venn-diagram",
  name: "Venn Diagram",
  category: "Plots",
  tags: ["table", "text", "plot", "search"],
  summary: "Compare two or three pasted lists with a Venn diagram and exact overlap tables.",
  inputType: "Two or three text lists",
  outputType: "Venn diagram, comparison report, item list, or table",
  splitInput: {
    separator: "---",
    allowAdd: true,
    addLabel: "Add list",
    maxPanels: VENN_DIAGRAM_MAX_LISTS,
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
      { id: "venn", kind: "text", mediaType: "image/svg+xml", label: "Venn diagram" },
      { id: "sharedItems", kind: "text", mediaType: "text/plain", label: "Shared items" },
      { id: "uniqueItems", kind: "text", mediaType: "text/plain", label: "Unique-to-one-list items" },
      { id: "table", kind: "table", schema: "list-overlap", columns: listOverlapColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/venn-diagram/run.js",
  workerExport: "runVennDiagram",
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
      help: "The diagram shows exact region counts for up to three lists. Use UpSet Plot for larger list comparisons.",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "venn-svg",
          choices: [
            { value: "venn-svg", label: "Venn diagram" },
            { value: "table-tsv", label: "Comparison table" },
            { value: "shared", label: "Shared by all item list" },
            { value: "unique-one", label: "Unique to one list item list" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "vennListLimitNote",
          type: "note",
          text: `Venn diagrams are limited to ${VENN_DIAGRAM_MAX_LISTS} lists. Use UpSet Plot for larger list comparisons.`
        }
      ]
    }
  ]
};
