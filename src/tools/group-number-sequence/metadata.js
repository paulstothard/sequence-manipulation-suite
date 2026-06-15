const groupNumberBaseOptions = [
  {
    id: "groupSize",
    type: "number",
    label: "Characters per block",
    help: "Number of sequence characters in each space-separated block.",
    defaultValue: 10,
    min: 1,
    max: 100
  },
  {
    id: "groupsPerLine",
    type: "number",
    label: "Blocks per line",
    help: "Number of blocks shown on each output line.",
    defaultValue: 6,
    min: 1,
    max: 20
  },
  {
    id: "startPosition",
    type: "number",
    label: "First coordinate",
    help: "Coordinate label to use for the first sequence character in the output.",
    defaultValue: 1,
    min: 0,
    max: 1000000000
  },
  { id: "showPositionNumbers", type: "checkbox", label: "Show coordinate numbers", defaultValue: true, help: "Adds dynamically padded coordinate labels at the left of each output line." },
  { id: "preserveCase", type: "checkbox", label: "Preserve input case", defaultValue: true },
  { id: "keepGaps", type: "checkbox", label: "Keep gap characters (. and -)", defaultValue: true }
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
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "groupedText", kind: "text", mediaType: "text/plain" },
      { id: "textRecords", kind: "text-records", schema: "group-number-sequence" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet, schema: "group-number-sequence-cleaned" },
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
      help: "Adds a second grouped line showing the complement below each DNA/RNA sequence line.",
      defaultValue: true
    },
    {
      type: "group",
      label: "Grouping and numbering",
      options: groupNumberBaseOptions
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is cleaned to DNA/RNA IUPAC symbols before grouping."
    }
  ]
};

export const groupNumberProteinMetadata = {
  id: "group-number-protein",
  name: "Group / Number Protein",
  category: "Sequence Utilities",
  tags: ["protein", "raw", "FASTA", "format conversion"],
  summary: "Group protein characters into fixed-width blocks with optional position numbering.",
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
      text: "Input is cleaned to protein IUPAC symbols before grouping."
    }
  ]
};
