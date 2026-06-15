import { pcaLoadingColumns, pcaScoreColumns, pcaVarianceColumns } from "../../core/pca-plot.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const pcaPlotMetadata = {
  id: "pca-plot",
  name: "PCA Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Calculate principal components from numeric table columns and draw a PC1/PC2 scatter plot.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "PCA plot, score table, loading table, or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "scoreTable", kind: "table", schema: "pca-scores", columns: pcaScoreColumns },
      { id: "loadingTable", kind: "table", schema: "pca-loadings", columns: pcaLoadingColumns },
      { id: "varianceTable", kind: "table", schema: "pca-variance", columns: pcaVarianceColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/pca-plot/run.js",
  workerExport: "runPcaPlot",
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
      label: "PCA setup",
      options: [
        {
          id: "numericColumns",
          type: "text",
          label: "Numeric columns",
          defaultValue: "gene_A,gene_B,gene_C,gene_D,gene_E",
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
          help: "Scaling gives each selected variable equal variance before PCA, which is usually appropriate when columns use different units or ranges."
        },
        { id: "maxPointsDrawn", type: "number", label: "Maximum points drawn", defaultValue: 5000, min: 100, max: 50000, step: 100 }
      ]
    },
    {
      type: "group",
      label: "Plot",
      options: [
        { id: "title", type: "text", label: "Title", defaultValue: "RNA expression PCA" }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        { id: "outputFormat", type: "radio", label: "Format", defaultValue: "svg", choices: [
          { value: "svg", label: "PCA plot" },
          { value: "scores-tsv", label: "Scores table" },
          { value: "loadings-tsv", label: "Loadings table" },
          { value: "variance-tsv", label: "Variance table" },
          { value: "report", label: "Summary report" }
        ] }
      ]
    },
    makeAxisLimitsGroup({ x: true, y: true })
  ],
  citations: [
    {
      text: "PCA is calculated by eigendecomposition of the covariance matrix after centering and optional scaling of complete numeric rows."
    }
  ]
};
