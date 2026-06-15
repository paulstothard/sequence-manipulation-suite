import { sankeyFlowColumns } from "../../core/sankey-plot.js";

export const sankeyPlotMetadata = {
  id: "sankey-plot",
  name: "Sankey Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot"],
  summary: "Draw a Sankey-style flow diagram from source, target, and value columns.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Sankey plot or flow table",
  runInWorker: true,
  workerModule: "../tools/sankey-plot/run.js",
  workerExport: "runSankeyPlot",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "flowTable", kind: "table", schema: "sankey-flows", columns: sankeyFlowColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
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
      label: "Flow columns",
      options: [
        { id: "sourceColumn", type: "text", label: "Source column", defaultValue: "source", suggestionsFrom: "table-columns" },
        { id: "targetColumn", type: "text", label: "Target column", defaultValue: "target", suggestionsFrom: "table-columns" },
        { id: "valueColumn", type: "text", label: "Value column", defaultValue: "reads_million", suggestionsFrom: "table-numeric-columns" },
        {
          id: "maxFlows",
          type: "number",
          label: "Maximum flows",
          defaultValue: 80,
          min: 1,
          max: 150,
          step: 1,
          help: "Only the largest positive flows are drawn and returned when this cap is reached; increase it only when labels remain readable."
        },
        { id: "title", type: "text", label: "Plot title", defaultValue: "Read assignment flow" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "Sankey plot" },
          { value: "flow-tsv", label: "Flow table" }
        ] }
      ]
    }
  ],
  examples: [
    {
      label: "RNA-seq read assignment flow",
      input: `source,target,reads_million
raw reads,trimmed reads,18.2
raw reads,adapter/quality removed,1.6
trimmed reads,genome aligned,15.1
trimmed reads,rRNA or contaminant,0.8
trimmed reads,unmapped,2.3
genome aligned,exonic,10.4
genome aligned,intronic,2.1
genome aligned,intergenic,2.6
exonic,protein coding,8.7
exonic,lncRNA,1.1
exonic,other annotation,0.6`
    }
  ]
};
