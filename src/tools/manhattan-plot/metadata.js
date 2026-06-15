import { manhattanPlotColumns } from "../../core/plot-tools.js";
import { makeAxisLimitsGroup } from "../plot-axis-options.js";

export const manhattanPlotMetadata = {
  id: "manhattan-plot",
  name: "Manhattan Plot",
  category: "Plots",
  tags: ["table", "CSV", "TSV", "Excel", "coordinates", "plot", "statistics"],
  summary: "Create a Manhattan plot from genome-wide marker p values.",
  whenToUse: "Use this when you want to inspect association p values across chromosomes and spot genome-wide signal peaks.",
  inputType: "CSV, TSV, or Excel table with chromosome, p-value, marker, and optional position columns",
  outputType: "Manhattan plot or plotted-marker table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "pointTable", kind: "table", schema: "manhattan-points", columns: manhattanPlotColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/manhattan-plot/run.js",
  workerExport: "runManhattanPlot",
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
      label: "Plot columns",
      options: [
        { id: "chromosomeColumn", type: "text", label: "Chromosome column", defaultValue: "CHR", suggestionsFrom: "table-columns" },
        { id: "pValueColumn", type: "text", label: "p-value column", defaultValue: "P", suggestionsFrom: "table-numeric-columns" },
        { id: "positionColumn", type: "text", label: "Position column", defaultValue: "BP", suggestionsFrom: "table-numeric-columns", help: "Leave blank or use a missing column name to assign sequential positions within each chromosome." },
        { id: "markerColumn", type: "text", label: "Marker labels", defaultValue: "SNP", suggestionsFrom: "table-columns" }
      ]
    },
    {
      type: "group",
      label: "Manhattan plot",
      options: [
        { id: "title", type: "text", label: "Plot title", defaultValue: "Genome-wide marker associations" },
        { id: "plotChromosomes", type: "textarea", label: "Chromosomes to plot", defaultValue: "", placeholder: "Optional: chr1, chr2, chrX", rows: 2, help: "Optional comma-, semicolon-, or line-separated chromosome list. Leave blank to plot all chromosomes in natural chromosome order." },
        { id: "pointSize", type: "number", label: "Point radius", defaultValue: 3.5, min: 1, max: 8, step: 0.5 },
        { id: "labelTopMarkers", type: "checkbox", label: "Label top marker on each chromosome", defaultValue: false },
        { id: "suggestiveThreshold", type: "number", label: "Suggestive threshold (-log10 p)", defaultValue: 5, min: 0, max: 100, step: 0.1, help: "Use 0 to hide the suggestive threshold line." },
        { id: "genomeWideThreshold", type: "number", label: "Genome-wide threshold (-log10 p)", defaultValue: 7.3, min: 0, max: 100, step: 0.1, help: "Use 0 to hide the genome-wide threshold line." }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "svg",
          choices: [
            { value: "svg", label: "Manhattan plot" },
            { value: "point-tsv", label: "Point table" }
          ]
        }
      ]
    },
    makeAxisLimitsGroup({ x: false, y: true }),
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "maxPointsDrawn",
          type: "number",
          label: "Maximum plotted points",
          defaultValue: 50000,
          min: 1000,
          max: 500000,
          step: 1000,
          help: "The Point table contains all parsed markers; this only caps visual drawing for browser responsiveness."
        }
      ]
    }
  ]
};
