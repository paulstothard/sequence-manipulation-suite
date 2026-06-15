import { tsneEmbeddingColumns } from "../../core/tsne-plot.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const tsnePlotMetadata = {
  id: "tsne-plot",
  name: "t-SNE Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Run Barnes-Hut t-SNE on numeric table columns and draw a two-dimensional embedding.",
  whenToUse: "Use this when many numeric measurements per sample need a quick nonlinear two-dimensional view of clusters or outliers.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "t-SNE plot, embedding table, or summary report",
  runtime: {
    browserBioWasm: { required: true, tool: "bhtsne" }
  },
  fileInput: {
    accept: ".csv,.tsv,.tab,.xlsx,.txt",
    dropLabel: "Drop CSV, TSV, Excel workbook, or plain-text table here"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "embeddingTable", kind: "table", schema: "tsne-embedding", columns: tsneEmbeddingColumns, label: "Embedding table" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/tsne-plot/run.js",
  workerExport: "runTsnePlot",
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
      label: "t-SNE setup",
      options: [
        {
          id: "numericColumns",
          type: "text",
          label: "Numeric columns",
          defaultValue: "gene_A,gene_B,gene_C,gene_D,gene_E,gene_F",
          suggestionsFrom: "table-numeric-columns",
          help: "Comma-separated numeric columns to include. Leave blank to use all numeric columns."
        },
        { id: "labelColumn", type: "text", label: "Point labels", defaultValue: "sample_id", suggestionsFrom: "table-columns" },
        { id: "groupColumn", type: "text", label: "Color by", defaultValue: "condition", suggestionsFrom: "table-columns" },
        {
          id: "scaleColumns",
          type: "checkbox",
          label: "Center and scale columns",
          defaultValue: true,
          help: "Scaling gives each selected variable equal variance before t-SNE, which is usually appropriate when columns use different units or ranges."
        },
        {
          id: "perplexity",
          type: "number",
          label: "Perplexity",
          defaultValue: 3,
          min: 1,
          max: 100,
          step: 1,
          help: "Smaller examples need smaller perplexity; SMS3 reduces values that are too large for the row count."
        },
        {
          id: "theta",
          type: "number",
          label: "Approximation theta",
          defaultValue: 0.5,
          min: 0,
          max: 1,
          step: 0.05
        },
        {
          id: "maxIterations",
          type: "number",
          label: "Iterations",
          defaultValue: 500,
          min: 50,
          max: 2000,
          step: 50
        },
        {
          id: "seed",
          type: "text",
          label: "Random seed",
          defaultValue: "",
          help: "Leave blank to generate a seed for this run; set a number to reproduce the layout."
        }
      ]
    },
    {
      type: "group",
      label: "Plot",
      options: [
        { id: "title", type: "text", label: "Title", defaultValue: "RNA expression t-SNE" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "t-SNE plot" },
          { value: "embedding-table", label: "Embedding table" },
          { value: "report", label: "Summary report" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: true, y: true }),
    {
      type: "group",
      id: "limits",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxRows", type: "number", label: "Maximum rows", defaultValue: 500, min: 4, max: 2000, step: 10 },
        { id: "maxNumericColumns", type: "number", label: "Maximum numeric columns", defaultValue: 100, min: 2, max: 500, step: 10 },
        {
          id: "maxPointsDrawn",
          type: "number",
          label: "Maximum plotted points",
          defaultValue: 5000,
          min: 100,
          max: 50000,
          step: 100,
          help: "The embedding table still contains all embedded rows; this only caps visual drawing for browser responsiveness."
        }
      ]
    }
  ],
  citations: [
    {
      text: "Barnes-Hut t-SNE uses the BioWasm bhtsne 2016.08.22 runtime, based on van der Maaten and Hinton 2008 and van der Maaten 2014."
    }
  ]
};
