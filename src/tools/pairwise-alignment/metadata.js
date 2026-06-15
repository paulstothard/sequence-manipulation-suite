import { geneticCodes } from "../../core/genetic-code.js";
import { codonAlignmentTableColumns, PAIRWISE_ALIGNMENT_ENGINES, pairwiseAlignmentTableColumns } from "../../core/pairwise-alignment.js";

function makeWorkflow(alphabet) {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "alignmentText", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "clustal", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: `pairwise-alignment-${alphabet}`, columns: pairwiseAlignmentTableColumns },
      { id: "coloredSvg", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function makeCodonWorkflow() {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "alignmentText", kind: "text", mediaType: "text/plain" },
      { id: "codonFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "proteinFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "table", kind: "table", schema: "pairwise-coding-dna-alignment", columns: codonAlignmentTableColumns },
      { id: "coloredSvg", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

const commonOptions = [
  {
    id: "mode",
    type: "radio",
    label: "Alignment mode",
    defaultValue: "global",
    choices: [
      { value: "global", label: "Global" },
      { value: "local", label: "Local" }
    ],
    help: "Global aligns both complete sequences. Local reports the best matching region."
  },
  {
    id: "alignmentEngine",
    type: "radio",
    label: "Alignment engine",
    defaultValue: PAIRWISE_ALIGNMENT_ENGINES.seqAlign,
    choices: [
      { value: PAIRWISE_ALIGNMENT_ENGINES.seqAlign, label: "seq-align" },
      { value: PAIRWISE_ALIGNMENT_ENGINES.sms3, label: "SMS3 affine" }
    ],
    help: "Browser runs use bundled local seq-align files for the seq-align engine. Select SMS3 affine when you need ambiguity-aware SMS3 scoring."
  },
  {
    id: "gapOpen",
    type: "number",
    label: "Gap opening penalty",
    defaultValue: 10,
    min: 0,
    max: 100,
    step: 0.5,
    help: "Penalty for starting a gap. Internally this is applied as a negative score."
  },
  {
    id: "gapExtend",
    type: "number",
    label: "Gap extension penalty",
    defaultValue: 1,
    min: 0,
    max: 100,
    step: 0.5,
    help: "Penalty for extending an existing gap by one aligned symbol."
  },
  {
    type: "group",
    label: "Output format",
    options: [
      {
        id: "outputFormat",
        type: "radio",
        label: "Format",
        defaultValue: "svg-color",
        choices: [
          { value: "report", label: "Summary report" },
          { value: "alignment-text", label: "Pairwise text" },
          { value: "aligned-fasta", label: "Aligned FASTA" },
          { value: "clustal", label: "CLUSTAL-format text alignment" },
          { value: "tsv", label: "Alignment table" },
          { value: "svg-color", label: "Colored alignment" }
        ]
      }
    ]
  }
];

export const pairwiseAlignDnaRnaMetadata = {
  id: "pairwise-align-dna-rna",
  name: "Pairwise Align DNA/RNA",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "raw", "FASTA", "alignment", "coordinates"],
  summary:
    "Align two DNA/RNA sequences with global or local dynamic programming and affine gap penalties.",
  inputType: "Two DNA/RNA sequences",
  outputType: "Alignment report, text, FASTA, CLUSTAL-format text, table, colored alignment",
  workflow: makeWorkflow("dna-rna"),
  runInWorker: true,
  workerModule: "../tools/pairwise-alignment/run.js",
  workerExport: "runPairwiseAlignDnaRna",
  options: [
    ...commonOptions.slice(0, 2),
    { id: "matchScore", type: "number", label: "Match score", defaultValue: 5, min: -100, max: 100, step: 0.5 },
    { id: "similarScore", type: "number", label: "Ambiguous overlap score", defaultValue: 1, min: -100, max: 100, step: 0.5 },
    { id: "mismatchScore", type: "number", label: "Mismatch score", defaultValue: -4, min: -100, max: 100, step: 0.5 },
    {
      id: "secondSequenceOrientation",
      type: "radio",
      label: "Second sequence orientation",
      defaultValue: "as-provided",
      choices: [
        { value: "as-provided", label: "Use submitted orientation" },
        { value: "best", label: "Try reverse complement and use best score" }
      ],
      help: "For DNA/RNA only. When enabled, sequence B is aligned as submitted and as its reverse complement; the higher-scoring orientation is reported."
    },
    { ...commonOptions[2], defaultValue: 16 },
    { ...commonOptions[3], defaultValue: 4 },
    ...commonOptions.slice(4),
    {
      id: "citationNote",
      type: "note",
      text: "References: Needleman and Wunsch 1970; Smith and Waterman 1981; Gotoh 1982. DNA/RNA ambiguity symbols are scored by IUPAC set overlap."
    }
  ]
};

export const pairwiseAlignProteinMetadata = {
  id: "pairwise-align-protein",
  name: "Pairwise Align Protein",
  category: "Sequence Alignment & Assembly",
  tags: ["protein", "raw", "FASTA", "alignment", "coordinates"],
  summary:
    "Align two protein sequences with global or local dynamic programming, BLOSUM62 scores, and affine gap penalties.",
  inputType: "Two protein sequences",
  outputType: "Alignment report, text, FASTA, CLUSTAL-format text, table, colored alignment",
  workflow: makeWorkflow("protein"),
  runInWorker: true,
  workerModule: "../tools/pairwise-alignment/run.js",
  workerExport: "runPairwiseAlignProtein",
  options: [
    ...commonOptions,
    {
      id: "matrixNote",
      type: "note",
      text: "Protein alignments use the BLOSUM62 substitution matrix with affine gap penalties."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References: Needleman and Wunsch 1970; Smith and Waterman 1981; Gotoh 1982; Henikoff and Henikoff 1992."
    }
  ]
};

export const pairwiseAlignCodingDnaMetadata = {
  id: "pairwise-align-coding-dna",
  name: "Pairwise Align Coding DNA",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "raw", "FASTA", "alignment", "codon", "coordinates", "translation"],
  summary:
    "Align two coding DNA/RNA sequences by translating complete codons, aligning amino acids with BLOSUM62 and affine gap penalties, and projecting the alignment back to codons.",
  inputType: "Two coding DNA/RNA sequences",
  outputType: "Codon alignment report, text, aligned codon FASTA, aligned translated protein FASTA, table, colored alignment",
  workflow: makeCodonWorkflow(),
  runInWorker: true,
  workerModule: "../tools/pairwise-alignment/run.js",
  workerExport: "runPairwiseAlignCodingDna",
  options: [
    ...commonOptions.slice(0, 2),
    { ...commonOptions[2], help: "Penalty for starting a codon-sized gap. Internally this is applied as a negative amino-acid alignment score." },
    { ...commonOptions[3], help: "Penalty for extending an existing codon-sized gap by one codon." },
    {
      id: "geneticCode",
      type: "select",
      label: "Genetic code",
      defaultValue: "1",
      help: "Selects the codon table used to translate codons before alignment.",
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "svg-color",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "alignment-text", label: "Codon text" },
            { value: "codon-fasta", label: "Aligned codon FASTA" },
            { value: "protein-fasta", label: "Aligned translated protein FASTA" },
            { value: "tsv", label: "Codon table" },
            { value: "svg-color", label: "Colored alignment" }
          ]
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Complete codons are translated first; the amino-acid alignment is then projected back to codon triplets. Ambiguous and stop codons are scored as X."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References: Needleman and Wunsch 1970; Smith and Waterman 1981; Gotoh 1982; Henikoff and Henikoff 1992. Genetic code assignments follow NCBI transl_table definitions."
    }
  ]
};
