import { GROUP_NUMBER_DEFAULTS as defaults } from "../../core/group-number-options.js";

const groupNumberBaseOptions = [
  {
    id: "groupSize",
    type: "number",
    label: "Characters per block",
    help: "Number of sequence characters in each space-separated block.",
    defaultValue: defaults.groupSize,
    min: 1,
    max: 100
  },
  {
    id: "groupsPerLine",
    type: "number",
    label: "Blocks per line",
    help: "Number of blocks shown on each output line.",
    defaultValue: defaults.groupsPerLine,
    min: 1,
    max: 20
  },
  {
    id: "startPosition",
    type: "number",
    label: "First coordinate",
    help: "Coordinate label for the first cleaned sequence character. Retained gaps each count as one position.",
    defaultValue: defaults.startPosition,
    min: 0,
    max: 1000000000
  },
  { id: "showPositionNumbers", type: "checkbox", label: "Show coordinate numbers", defaultValue: defaults.showPositionNumbers, help: "Adds dynamically padded coordinate labels at the left of each output line." },
  { id: "preserveCase", type: "checkbox", label: "Preserve input case", defaultValue: defaults.preserveCase },
  { id: "keepGaps", type: "checkbox", label: "Keep gap characters (. and -)", defaultValue: defaults.keepGaps }
];

const dnaRnaTextFastaFileInput = {
  dropLabel: "Drop one plain-text DNA/RNA sequence or FASTA records here",
  accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
};

const proteinTextFastaFileInput = {
  dropLabel: "Drop one plain-text protein sequence or FASTA records here",
  accept: ".fa,.fasta,.faa,.fa.gz,.fasta.gz,.faa.gz,.gz,.txt,.seq"
};

function makeGroupNumberWorkflow(alphabet) {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet }
    ],
    outputs: [
      { id: "primary", label: "Grouped text", kind: "text", mediaType: "text/plain" },
      { id: "groupedText", label: "Grouped text", kind: "text", mediaType: "text/plain", outputFormat: "text" },
      { id: "textRecords", label: "Grouped text records", kind: "text-records", schema: "group-number-sequence", outputFormat: "text-records" },
      { id: "sequenceRecords", label: alphabet === "protein" ? "Protein sequences" : "DNA/RNA sequences", kind: "sequence-records", alphabet, schema: "group-number-sequence-cleaned", outputFormat: "sequence-records" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

export const groupNumberDnaRnaMetadata = {
  id: "group-number-dna-rna",
  name: "Group / Number DNA/RNA",
  category: "Sequence Utilities",
  tags: ["DNA", "RNA", "raw", "FASTA", "format conversion"],
  summary:
    "Group DNA/RNA characters into fixed-width blocks with optional position numbering and complementary strand display.",
  whenToUse: "Prepare block-formatted DNA/RNA text with coordinate labels or an aligned complementary strand for inspection or sharing.",
  inputType: "DNA/RNA sequence",
  outputType: "Grouped DNA/RNA text",
  fileInput: dnaRnaTextFastaFileInput,
  runInWorker: true,
  workerModule: "../tools/group-number-sequence/run.js",
  workerExport: "runGroupNumberDnaRna",
  workflow: makeGroupNumberWorkflow("dna-rna"),
  options: [
    {
      id: "showComplement",
      type: "checkbox",
      label: "Show complementary strand",
      help: "Adds the DNA complement below each sequence line in the same left-to-right order (A→T and U→A).",
      defaultValue: defaults.showComplement
    },
    {
      type: "group",
      label: "Grouping and numbering",
      options: groupNumberBaseOptions
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is cleaned to DNA/RNA IUPAC symbols and X before grouping."
    }
  ]
};

export const groupNumberProteinMetadata = {
  id: "group-number-protein",
  name: "Group / Number Protein",
  category: "Sequence Utilities",
  tags: ["protein", "raw", "FASTA", "format conversion"],
  summary: "Group protein characters into fixed-width blocks with optional position numbering.",
  whenToUse: "Prepare block-formatted protein text with coordinate labels for inspection or sharing.",
  inputType: "Protein sequence",
  outputType: "Grouped protein text",
  fileInput: proteinTextFastaFileInput,
  runInWorker: true,
  workerModule: "../tools/group-number-sequence/run.js",
  workerExport: "runGroupNumberProtein",
  workflow: makeGroupNumberWorkflow("protein"),
  options: [
    {
      type: "group",
      label: "Grouping and numbering",
      options: groupNumberBaseOptions
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input retains standard amino-acid letters plus B, Z, J, O, U and X. Stop symbols (*) are retained and each count as one position."
    }
  ]
};
