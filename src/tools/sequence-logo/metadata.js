import {
  SEQUENCE_LOGO_LIMITS,
  sequenceLogoTableColumns
} from "../../core/sequence-logo.js";
import {
  sequenceLogoCountExample,
  sequenceLogoFrequencyExample
} from "../../examples/sequence-logo-example.js";

export const sequenceLogoMetadata = {
  id: "sequence-logo",
  name: "Sequence Logo",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "protein", "table", "FASTA", "TSV", "composition", "alignment", "plot", "statistics"],
  summary: "Create an interactive information-content or frequency logo from an aligned DNA, RNA, or protein sequence set or a position table.",
  whenToUse: "Use when you want a compact, column-by-column summary of residue frequencies and conservation in an existing alignment. The logo summarizes the supplied alignment; it does not establish homology or functional importance.",
  inputType: "Aligned DNA/RNA/protein FASTA or CLUSTAL text, or position-specific count/frequency table",
  outputType: "Interactive sequence logo and column statistics",
  fileInput: {
    dropLabel: "Drop aligned FASTA, CLUSTAL, count, or frequency data here",
    accept: ".fa,.fasta,.faa,.fna,.aln,.clustal,.txt,.tsv,.csv,.xlsx"
  },
  inputTable: {
    label: "Position table format",
    visibleWhen: { option: "inputFormat", value: ["counts", "frequencies"] },
    description: "Preview position counts or frequencies without changing the editable source. Tables may be long (position, symbol, count or frequency) or wide (position followed by residue columns); frequency tables may include an n or sample-size column.",
    ariaLabel: "Sequence logo position table preview"
  },
  runInWorker: true,
  workerModule: "../tools/sequence-logo/run.js",
  workerExport: "runSequenceLogoWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", minRecords: 2 }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "sequenceLogo", kind: "figure", figureType: "sequence-logo", label: "Sequence logo" },
      { id: "table", kind: "table", schema: "sequence-logo-columns", columns: sequenceLogoTableColumns },
      { id: "tsv", kind: "text", mediaType: "text/tab-separated-values" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Input",
      options: [
        {
          id: "inputFormat",
          type: "radio",
          presentation: "tabs",
          placement: "input",
          label: "Input data",
          defaultValue: "alignment",
          choices: [
            { value: "alignment", label: "Aligned sequences" },
            { value: "counts", label: "Position counts", example: sequenceLogoCountExample },
            { value: "frequencies", label: "Position frequencies", example: sequenceLogoFrequencyExample }
          ],
          help: "Aligned sequences may be FASTA or CLUSTAL. Position tables may be long (position, symbol, count/frequency) or wide (position followed by symbol columns); a frequency table can include lowercase n for sample size. Uppercase N remains a biological symbol."
        },
        {
          id: "alphabet",
          type: "select",
          label: "Alphabet",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "dna", label: "DNA" },
            { value: "rna", label: "RNA" },
            { value: "protein", label: "Protein" }
          ]
        },
        {
          id: "firstPosition",
          type: "number",
          label: "First alignment position",
          defaultValue: 1,
          step: 1,
          visibleWhen: { option: "inputFormat", value: "alignment" },
          help: "The coordinate assigned to the first aligned column. Position tables use their position column instead."
        }
      ]
    },
    {
      type: "group",
      label: "Calculation",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "ambiguousPolicy",
          type: "radio",
          label: "Ambiguous symbols",
          defaultValue: "exclude",
          choices: [
            { value: "exclude", label: "Exclude from letter frequencies" },
            { value: "fractional", label: "Distribute across possible residues" }
          ],
          help: "Gaps are always excluded from letter frequencies and reported separately. Fractional mode distributes IUPAC nucleotide symbols and B/Z/J/X protein symbols across their possible residues."
        },
        {
          id: "sequenceWeighting",
          type: "radio",
          label: "Sequence weighting",
          defaultValue: "none",
          choices: [
            { value: "none", label: "Equal sequence weights" },
            { value: "henikoff", label: "Henikoff position-based weights" }
          ],
          visibleWhen: { option: "inputFormat", value: "alignment" },
          help: "Henikoff weighting reduces the influence of redundant residue patterns. It is calculated from the supplied alignment and is not a phylogenetic correction."
        },
        {
          id: "correction",
          type: "radio",
          label: "Small-sample correction",
          defaultValue: "none",
          choices: [
            { value: "none", label: "None (direct Shannon information)" },
            { value: "schneider", label: "Schneider–Stormo approximation" }
          ],
          help: "The approximation subtracts (K−1)/(2 ln(2) n effective) bits and floors the result at zero. Direct Shannon information is the clearest choice for exact analytical and cross-software comparisons."
        },
        {
          id: "uncertainty",
          type: "radio",
          label: "Uncertainty",
          defaultValue: "none",
          choices: [
            { value: "none", label: "No confidence intervals" },
            { value: "bootstrap", label: "Whole-sequence bootstrap" }
          ],
          visibleWhen: { option: "inputFormat", value: "alignment" },
          help: "Bootstrap resampling samples entire aligned sequences with replacement, preserving correlations among columns."
        },
        {
          id: "bootstrapReplicates",
          type: "number",
          label: "Bootstrap replicates",
          defaultValue: 500,
          min: 50,
          max: 2000,
          step: 50,
          visibleWhen: { option: "uncertainty", value: "bootstrap" }
        },
        {
          id: "confidenceLevel",
          type: "number",
          label: "Confidence level",
          defaultValue: 0.95,
          min: 0.5,
          max: 0.999,
          step: 0.01,
          visibleWhen: { option: "uncertainty", value: "bootstrap" }
        },
        {
          id: "randomSeed",
          type: "text",
          label: "Bootstrap seed (optional)",
          defaultValue: "",
          visibleWhen: { option: "uncertainty", value: "bootstrap" },
          help: "Use the same seed for reproducible intervals. When left blank, SMS3 derives a deterministic seed from the alignment and replicate count."
        }
      ]
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "interactive-logo",
      choices: [
        { value: "interactive-logo", label: "Interactive sequence logo" },
        { value: "column-table", label: "Column statistics table", resultView: { kind: "table", streamId: "table" } }
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
          id: "logoInputCells",
          type: "limit-value",
          label: "Input matrix cells",
          value: SEQUENCE_LOGO_LIMITS.inputCells,
          detail: "Alignment sequences × columns, or table positions × alphabet symbols. This browser-local analysis limit can be turned off."
        },
        {
          id: "logoBootstrapObservations",
          type: "limit-value",
          label: "Bootstrap sequence-column observations",
          value: SEQUENCE_LOGO_LIMITS.bootstrapObservations,
          detail: "Sequence count × columns × replicates. This browser-local work limit can be turned off."
        },
        {
          id: "logoVisibleColumns",
          type: "limit-value",
          label: "Columns in one rendered logo",
          value: SEQUENCE_LOGO_LIMITS.visibleColumns,
          detail: "A visual-density ceiling. The editor can move to any range and the table retains every column; this limit cannot be turned off."
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Information logos use R = log2(K) − H and letter height pᵢR, where H is Shannon entropy over valid residues. Frequency logos use letter height pᵢ. The result editor can switch views, colors, wrapping, labels, tracks, and export format without recalculating the logo."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nSchneider and Stephens 1990.\n\nCrooks et al. 2004 (WebLogo).\n\nHenikoff and Henikoff 1994 (optional position-based sequence weighting)."
    }
  ]
};
