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
    defaultValue: "2-8, 12-18",
    rows: 3,
    help: "Coordinates are 1-based and inclusive. Use ranges like 2-8, 2..8, or 2:8; separate ranges with commas, semicolons, or new lines."
  },
  {
    id: "selectionMode",
    type: "radio",
    label: "Selection mode",
    defaultValue: "extract",
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
    defaultValue: "separate",
    choices: [
      { value: "separate", label: "One FASTA record per resulting segment" },
      { value: "joined", label: "Join resulting segments per input record" }
    ],
    help: "Joined output is useful for deletion-style results, for example a sequence with the listed coordinates removed."
  }
];

const sequenceCleanupOptions = [
  { id: "preserveCase", type: "checkbox", label: "Preserve input case", defaultValue: true },
  {
    id: "keepGaps",
    type: "checkbox",
    label: "Keep gap characters (. and -)",
    defaultValue: true,
    help: "When gaps are kept, they remain part of the sequence used for coordinate extraction."
  }
];

const outputOptions = [
  {
    id: "outputFormat",
    type: "radio",
    label: "Output format",
    defaultValue: "fasta",
    choices: [
      { value: "fasta", label: "FASTA records" },
      { value: "tsv", label: "Table" }
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
      type: "note",
      text: `Separate-segment output is capped at ${EXTRACT_SUBSEQUENCES_MAX_OUTPUT_RECORDS.toLocaleString()} FASTA records/table rows. Joined output avoids this segment-row cap.`
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
    "Extract 1-based inclusive DNA/RNA subsequences from raw or FASTA input.",
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
          defaultValue: false,
          help: "Applied after extraction. For joined output, the joined sequence is reverse-complemented as one sequence."
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
    "Extract 1-based inclusive protein subsequences from raw or FASTA input.",
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
      options: coordinateOptions
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
