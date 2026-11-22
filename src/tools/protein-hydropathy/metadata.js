import { makeAxisLimitsGroup } from "../plot-axis-options.js";
import { PROTEIN_HYDROPATHY_DEFAULTS, PROTEIN_HYDROPATHY_LIMITS as LIMITS } from "../../core/protein-hydropathy-options.js";
import { SVG_PLOT_WINDOW_THRESHOLD, proteinHydropathyTableColumns } from "./run.js";

const axisLimits = makeAxisLimitsGroup();
axisLimits.options = axisLimits.options.map(option => ({ ...option, defaultValue: PROTEIN_HYDROPATHY_DEFAULTS[option.id] }));

export const proteinHydropathyMetadata = {
  id: "protein-hydropathy",
  name: "Protein Hydropathy",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "hydropathy", "plot"],
  summary:
    "Calculate Kyte-Doolittle GRAVY and sliding-window hydropathy profiles for protein sequences.",
  whenToUse: "Compare hydrophobic and hydrophilic regions of protein sequences and their whole-sequence GRAVY values.",
  inputType: "Protein sequence or FASTA",
  outputType: "Hydropathy report, table, plot",
  runInWorker: true,
  workerModule: "../tools/protein-hydropathy/run.js",
  workerExport: "runProteinHydropathyWorker",
  workflow: {
    requestedOutputStreamsOption: "requestedOutputStreams",
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", label: "Summary report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", label: "Table", outputFormat: "tsv", kind: "table", schema: "protein-hydropathy", columns: proteinHydropathyTableColumns },
      { id: "plot", label: "Protein hydropathy plot", outputFormat: "svg-plot", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "windowSize",
      type: "number",
      label: "Window size",
      help: "Residues per sliding window, advancing one residue at a time. Shorter sequences use one full-length window. Positions are 1-based window midpoints on the cleaned sequence.",
      defaultValue: PROTEIN_HYDROPATHY_DEFAULTS.windowSize,
      min: 1,
      max: 1001,
      step: 1
    },
    axisLimits,
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: PROTEIN_HYDROPATHY_DEFAULTS.outputFormat,
      choices: [
        { showcase: false, value: "report", label: "Summary report" },
        { showcase: false, value: "tsv", label: "Table", resultView: { kind: "table", streamId: "table" } },
        { showcase: "protein-hydropathy-plot", value: "svg-plot", label: "Protein hydropathy plot" }
      ]
    },
    {
      id: "advancedLimits", type: "group", label: "Limits", collapsible: true, collapsed: true,
      options: [
        { id: "hydropathyInput", type: "limit-value", label: "Input characters", value: LIMITS.inputCharacters, detail: "Applies to pasted input and decoded sequence files, including headers and whitespace." },
        { id: "hydropathyRecords", type: "limit-value", label: "Protein records", value: LIMITS.records },
        { id: "hydropathyRows", type: "limit-value", label: "Table windows", value: LIMITS.tableWindows, detail: "Larger tables are rejected; summary reports retain all window counts and extrema." },
        { id: "hydropathyOutput", type: "limit-value", label: "Output characters", value: LIMITS.outputCharacters, detail: "Larger outputs are rejected." },
        { id: "hydropathyHeaders", type: "limit-value", label: "FASTA header characters", value: LIMITS.headerCharacters },
        { type: "limit-value", label: "Hydropathy plot", value: `${SVG_PLOT_WINDOW_THRESHOLD.toLocaleString("en-US")} sliding windows`, detail: "The plot is withheld above this size; the table retains every calculated window." },
        { type: "note", text: "The plot is replaced with an explanation above this size. Table output retains every calculated window." }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Kyte-Doolittle values are averaged over the 20 standard amino acids. B/J/X/Z/O/U and stops retain positions but do not contribute to means; all-excluded windows are undefined. Gaps are removed before coordinates are assigned. Positive values indicate hydrophobicity."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nKyte-Doolittle hydropathy scale: Kyte and Doolittle 1982.\n\nScale values: ExPASy ProtScale."
    }
  ]
};
