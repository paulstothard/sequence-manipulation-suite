import { proteinFilterOptions, proteinOutputOption, CLEAN_FILTER_PROTEIN_DEFAULTS as proteinDefaults } from "../../core/clean-filter-protein-options.js";
import { dnaRnaFilterOptions, dnaRnaOutputOption, CLEAN_FILTER_DNA_RNA_DEFAULTS as defaults } from "../../core/clean-filter-dna-rna-options.js";

const cleanFilterBaseOptions = [
  { id: "keepGaps", type: "checkbox", label: "Keep gap characters (. and -)" }
];

const dnaRnaTextFastaFileInput = {
  dropLabel: "Drop one plain-text DNA/RNA sequence or FASTA records here",
  accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
};

const proteinTextFastaFileInput = {
  dropLabel: "Drop one plain-text protein sequence or FASTA records here",
  accept: ".fa,.fasta,.faa,.fa.gz,.fasta.gz,.faa.gz,.gz,.txt,.seq"
};

function makeCleanFilterWorkflow(alphabet) {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet, schema: "clean-filter-sequence" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}


export const cleanFilterDnaRnaMetadata = {
  id: "clean-filter-dna-rna",
  name: "Clean / Filter DNA/RNA",
  category: "Sequence Utilities",
  tags: ["DNA", "RNA", "raw", "FASTA", "cleaning"],
  summary:
    "Remove or replace selected characters from DNA/RNA text using common filtering presets.",
  whenToUse: "Clean pasted DNA/RNA text, preserve or select letter case, or replace specified characters before sequence analysis.",
  inputType: "DNA/RNA sequence",
  outputType: "Filtered DNA/RNA sequence",
  fileInput: dnaRnaTextFastaFileInput,
  runInWorker: true,
  workerModule: "../tools/clean-filter-sequence/run.js",
  workerExport: "runCleanFilterDnaRnaWorker",
  workflow: makeCleanFilterWorkflow("dna-rna"),
  options: [
    ...dnaRnaFilterOptions,
    { ...cleanFilterBaseOptions[0], defaultValue: defaults.keepGaps,
      help: "Keep dot and dash gaps with nucleotide and case-selective filters. Other presets remove only the characters named in the filter." },
    dnaRnaOutputOption
  ]
};

export const cleanFilterProteinMetadata = {
  id: "clean-filter-protein",
  name: "Clean / Filter Protein",
  category: "Sequence Utilities",
  tags: ["protein", "raw", "FASTA", "cleaning"],
  summary: "Remove or replace selected characters from protein text using common filtering presets.",
  whenToUse: "Clean pasted protein text, select residue symbols or letter case, or replace specified characters before sequence analysis.",
  inputType: "Protein sequence",
  outputType: "Filtered protein sequence",
  fileInput: proteinTextFastaFileInput,
  runInWorker: true,
  workerModule: "../tools/clean-filter-sequence/run.js",
  workerExport: "runCleanFilterProteinWorker",
  workflow: makeCleanFilterWorkflow("protein"),
  options: [
    ...proteinFilterOptions,
    { ...cleanFilterBaseOptions[0], defaultValue: proteinDefaults.keepGaps,
      help: "Keep dot and dash gaps with residue and case-selective filters. Other presets remove only the characters named in the filter." },
    proteinOutputOption,
    {
      id: "cleaningNote",
      type: "note",
      text: "The standard filter keeps only the 20 common amino acid symbols. The IUPAC filter also preserves ambiguity and uncommon residue symbols such as B, J, O, U, X, and Z. Use Keep gap characters to preserve dot and dash alignment gaps. Filtered character counts appear in the output details; warnings are reserved for unexpected issues."
    }
  ]
};
