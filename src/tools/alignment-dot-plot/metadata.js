import { alignmentDotPlotColumns } from "../../core/alignment-dot-plot.js";

function makeWorkflow() {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "alignment-dot-plot", columns: alignmentDotPlotColumns },
      { id: "matches", kind: "table", schema: "alignment-dot-plot", columns: alignmentDotPlotColumns },
      { id: "plot", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function makeOutputOptions() {
  return [
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "svg",
      choices: [
        { value: "svg", label: "Dot plot" },
        { value: "tsv", label: "Match table" },
        { value: "report", label: "Summary report" }
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
          id: "maxMatches",
          type: "number",
          label: "Maximum matches to keep",
          defaultValue: 25000,
          min: 100,
          max: 500000,
          step: 100,
          help: "Dense or repetitive inputs can produce very large match tables and slow visual output. Extra matches are counted and reported as omitted."
        }
      ]
    }
  ];
}

export const dnaRnaAlignmentDotPlotMetadata = {
  id: "alignment-dot-plot-dna-rna",
  name: "DNA/RNA Dot Plot",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "FASTA", "alignment", "plot"],
  summary: "Draw an exact word-match dot plot for two DNA/RNA sequences with optional reverse-complement matches.",
  inputType: "Two DNA/RNA FASTA records",
  outputType: "Dot plot, match table, or summary report",
  runInWorker: true,
  workerModule: "../tools/alignment-dot-plot/run.js",
  workerExport: "runDnaRnaAlignmentDotPlot",
  workflow: makeWorkflow(),
  options: [
    {
      id: "wordSize",
      type: "number",
      label: "Word size",
      defaultValue: 11,
      min: 4,
      max: 100,
      step: 1,
      help: "Exact DNA/RNA words of this length are indexed from sequence B and plotted against sequence A. Smaller words show more background matches; larger words show stronger similarity blocks."
    },
    {
      id: "includeReverseComplement",
      type: "checkbox",
      label: "Show reverse-complement matches",
      defaultValue: true,
      help: "Plots matches to the reverse complement of sequence B in a separate color."
    },
    ...makeOutputOptions()
  ]
};

export const proteinAlignmentDotPlotMetadata = {
  id: "alignment-dot-plot-protein",
  name: "Protein Dot Plot",
  category: "Sequence Alignment & Assembly",
  tags: ["protein", "FASTA", "alignment", "plot"],
  summary: "Draw an exact word-match dot plot for two protein sequences.",
  inputType: "Two protein FASTA records",
  outputType: "Dot plot, match table, or summary report",
  runInWorker: true,
  workerModule: "../tools/alignment-dot-plot/run.js",
  workerExport: "runProteinAlignmentDotPlot",
  workflow: makeWorkflow(),
  options: [
    {
      id: "wordSize",
      type: "number",
      label: "Word size",
      defaultValue: 3,
      min: 1,
      max: 30,
      step: 1,
      help: "Exact amino-acid words of this length are indexed from sequence B and plotted against sequence A. Smaller words show more background matches; larger words show stronger similarity blocks."
    },
    ...makeOutputOptions()
  ]
};
