import { EXTRACT_SUBSEQUENCES_DEFAULTS as defaults } from "../../core/extract-subsequences-options.js";
import { EXTRACT_SUBSEQUENCES_MAX_OUTPUT_RECORDS, extractSubsequencesTableColumns } from "./run.js";

const dnaRnaTextFastaFileInput = {
  dropLabel: "Drop one plain-text DNA/RNA sequence or FASTA records here",
  accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
};

const proteinTextFastaFileInput = {
  dropLabel: "Drop one plain-text protein sequence or FASTA records here",
  accept: ".fa,.fasta,.faa,.fa.gz,.fasta.gz,.faa.gz,.gz,.txt,.seq"
};

const coordinateOptions = [
  {
    id: "coordinates",
    type: "textarea",
    label: "Coordinates",
    defaultValue: defaults.coordinates,
    rows: 3,
    help: "Coordinates are 1-based and inclusive on each cleaned sequence: whitespace and invalid characters are removed first, and retained gaps count as positions. Use 2-8, 2..8, 2:8 or a single position; separate ranges with commas, semicolons or new lines."
  },
  {
    id: "selectionMode",
    type: "radio",
    label: "Selection mode",
    defaultValue: defaults.selectionMode,
    choices: [
      { value: "extract", label: "Extract listed coordinates" },
      { value: "exclude", label: "Extract everything except listed coordinates" }
    ],
    help: "Exclude mode removes the listed coordinate ranges, merges overlaps, and returns the remaining sequence segments."
  },
  {
    id: "resultGrouping",
    type: "radio",
    label: "Result grouping",
    defaultValue: defaults.resultGrouping,
    choices: [
      { value: "separate", label: "One record or table row per resulting segment" },
      { value: "joined", label: "Join resulting segments per input record" }
    ],
    help: "Extraction follows listed order and retains overlaps or repeated ranges. Exclusion returns the remaining segments in sequence order. Joined output combines those segments per input record."
  }
];

const sequenceCleanupOptions = [
  { id: "preserveCase", type: "checkbox", label: "Preserve input case", defaultValue: defaults.preserveCase },
  {
    id: "keepGaps",
    type: "checkbox",
    label: "Keep gap characters (. and -)",
    defaultValue: defaults.keepGaps,
    help: "When gaps are kept, they remain part of the sequence used for coordinate extraction."
  }
];

const outputOptions = [
  {
    id: "outputFormat",
    type: "radio",
    label: "Output format",
    defaultValue: defaults.outputFormat,
    choices: [
      { showcase: false, value: "fasta", label: "FASTA records" },
      { showcase: false, value: "tsv", label: "Table", resultView: { kind: "table", streamId: "table" } }
    ]
  }
];

const outputLimitsGroup = {
  id: "advancedLimits",
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    {
      id: "outputRecordLimitNote",
      type: "limit-value",
      label: "Separate-segment output",
      value: `${EXTRACT_SUBSEQUENCES_MAX_OUTPUT_RECORDS.toLocaleString()} FASTA records or table rows`,
      detail: "Separate grouping keeps the first 50,000 resulting segments across input records and warns when later segments are omitted."
    }
  ]
};

function makeWorkflow(alphabet) {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "table", kind: "table", schema: "extract-subsequences", columns: extractSubsequencesTableColumns },
      { id: "sequenceRecords", kind: "sequence-records", alphabet, schema: "extract-subsequences" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

export const extractSubsequencesDnaRnaMetadata = {
  id: "extract-subsequences-dna-rna",
  name: "Extract Subsequences DNA/RNA",
  category: "Sequence Utilities",
  tags: ["DNA", "RNA", "raw", "FASTA", "coordinates"],
  summary:
    "Extract or exclude 1-based inclusive DNA/RNA ranges from plain sequence or FASTA input.",
  whenToUse: "Recover coordinate-defined regions or remove selected intervals from DNA/RNA sequences, with separate or joined results.",
  inputType: "DNA/RNA sequence",
  outputType: "Extracted DNA/RNA sequences, table",
  fileInput: dnaRnaTextFastaFileInput,
  runInWorker: true,
  workerModule: "../tools/extract-subsequences/run.js",
  workerExport: "runExtractSubsequencesDnaRna",
  workflow: makeWorkflow("dna-rna"),
  options: [
    {
      type: "group",
      label: "Coordinate selection",
      options: coordinateOptions
    },
    {
      type: "group",
      label: "Sequence handling",
      options: [
        ...sequenceCleanupOptions,
        {
          id: "reverseComplement",
          type: "checkbox",
          label: "Reverse complement output",
          defaultValue: defaults.reverseComplement,
          help: "Uses the DNA complement convention: A→T and U→A. Applied after extraction; joined segments are reverse-complemented as one sequence."
        }
      ]
    },
    {
      type: "group",
      label: "Output",
      options: outputOptions
    },
    outputLimitsGroup
  ]
};

export const extractSubsequencesProteinMetadata = {
  id: "extract-subsequences-protein",
  name: "Extract Subsequences Protein",
  category: "Sequence Utilities",
  tags: ["protein", "raw", "FASTA", "coordinates"],
  summary:
    "Extract or exclude 1-based inclusive protein ranges from plain sequence or FASTA input.",
  whenToUse: "Recover coordinate-defined protein regions or remove selected intervals, with separate or joined results.",
  inputType: "Protein sequence",
  outputType: "Extracted protein sequences, table",
  fileInput: proteinTextFastaFileInput,
  runInWorker: true,
  workerModule: "../tools/extract-subsequences/run.js",
  workerExport: "runExtractSubsequencesProtein",
  workflow: makeWorkflow("protein"),
  options: [
    {
      type: "group",
      label: "Coordinate selection",
      options: coordinateOptions.map(option => option.id === "coordinates" ? {
        ...option,
        help: "Coordinates are 1-based and inclusive after whitespace and invalid characters are removed. Protein letters (including B, Z, J, O, U and X), stops (*) and retained gaps each count as one position. Use 2-8, 2..8, 2:8 or a single position; separate ranges with commas, semicolons or new lines."
      } : option)
    },
    {
      type: "group",
      label: "Sequence handling",
      options: sequenceCleanupOptions
    },
    {
      type: "group",
      label: "Output",
      options: outputOptions
    },
    outputLimitsGroup
  ]
};
