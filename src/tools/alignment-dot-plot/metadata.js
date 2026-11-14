import { makeAxisLimitsGroup } from "../plot-axis-options.js";
import { DOT_PLOT_DEFAULTS, DOT_PLOT_WORD_RANGES, DOT_PLOT_MATCH_RANGE, DOT_PLOT_LIMITS as limits } from "../../core/alignment-dot-plot-options.js";
import { alignmentDotPlotColumns } from "../../core/alignment-dot-plot.js";

function makeWorkflow() {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", minRecords: 2, maxRecords: 2 }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "report", label: "Summary report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", label: "Match table", outputFormat: "tsv", kind: "table", schema: "alignment-dot-plot", columns: alignmentDotPlotColumns },
      { id: "matches", label: "Match table", outputFormat: "matches", kind: "table", schema: "alignment-dot-plot", columns: alignmentDotPlotColumns },
      { id: "plot", label: "Dot plot", outputFormat: "svg", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function makeOutputOptions(alphabet) {
  const defaults = DOT_PLOT_DEFAULTS[alphabet];
  const axisLimits = makeAxisLimitsGroup();
  axisLimits.options = axisLimits.options.map(option => ({ ...option, defaultValue: defaults[option.id] }));
  return [
    axisLimits,
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: defaults.outputFormat,
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
          defaultValue: defaults.maxMatches,
          min: DOT_PLOT_MATCH_RANGE[0],
          max: DOT_PLOT_MATCH_RANGE[1],
          step: 100,
          help: "Extra matches are counted and reported as omitted."
        },
        { id: "dotPlotInputLimit", type: "limit-value", label: "Input", value: `${limits.inputCharacters.toLocaleString()} characters; exactly two records`, detail: `Each sequence is limited to ${limits.sequenceLength.toLocaleString()} cleaned positions; titles to ${limits.titleCharacters} characters.` },
        { id: "dotPlotVisualLimit", type: "limit-value", label: "Dot plot", value: `${limits.svgPoints.toLocaleString()} retained matches`, detail: "Denser plots are suppressed; select Match table or increase Word size." },
        { id: "dotPlotOutputLimit", type: "limit-value", label: "Retained rows and output", value: `${limits.outputCharacters.toLocaleString()} characters`, detail: "Larger results are rejected. Reduce Maximum matches to keep." }
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
  whenToUse: "Compare two DNA/RNA sequences for exact shared regions, repeats and candidate inversions.",
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
      defaultValue: DOT_PLOT_DEFAULTS["dna-rna"].wordSize,
      min: DOT_PLOT_WORD_RANGES["dna-rna"][0],
      max: DOT_PLOT_WORD_RANGES["dna-rna"][1],
      step: 1,
      help: "Exact DNA/RNA words of this length are indexed from sequence B and plotted against sequence A. Smaller words show more background matches; larger words show stronger similarity blocks."
    },
    {
      id: "includeReverseComplement",
      type: "checkbox",
      label: "Show reverse-complement matches",
      defaultValue: DOT_PLOT_DEFAULTS["dna-rna"].includeReverseComplement,
      help: "Plots matches to the reverse complement of sequence B in a separate color."
    },
    ...makeOutputOptions("dna-rna"),
    { type: "note", text: "Compares overlapping words on linear sequences. T and U are equivalent; ambiguity symbols are matched literally, including complemented codes. Matches involving ambiguity do not establish resolved-base identity. Gaps are removed before comparison. Coordinates are 1-based inclusive on the cleaned inputs; reverse matches retain sequence B's supplied coordinates. Dots mark word midpoints. No mismatch scores or gapped alignments are calculated." }
  ]
};

export const proteinAlignmentDotPlotMetadata = {
  id: "alignment-dot-plot-protein",
  name: "Protein Dot Plot",
  category: "Sequence Alignment & Assembly",
  tags: ["protein", "FASTA", "alignment", "plot"],
  summary: "Draw an exact word-match dot plot for two protein sequences.",
  whenToUse: "Compare two protein sequences for exact shared regions and repeated sequence blocks.",
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
      defaultValue: DOT_PLOT_DEFAULTS.protein.wordSize,
      min: DOT_PLOT_WORD_RANGES.protein[0],
      max: DOT_PLOT_WORD_RANGES.protein[1],
      step: 1,
      help: "Exact amino-acid words of this length are indexed from sequence B and plotted against sequence A. Smaller words show more background matches; larger words show stronger similarity blocks."
    },
    ...makeOutputOptions("protein"),
    { type: "note", text: "Compares overlapping words on linear sequences. B, J, X, Z, U, O and * are literal symbols; * retains a position and words can cross it. Gaps are removed before comparison. Coordinates are 1-based inclusive on the cleaned inputs; dots mark word midpoints. No substitution scores or gapped alignments are calculated." }
  ]
};
