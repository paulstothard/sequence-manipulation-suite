import { ALIGNED_SEQUENCE_LIMITS } from "../../core/aligned-sequences.js";
import { DEFAULT_ALIGNMENT_SVG_CELL_LIMIT } from "../../core/alignment-svg.js";
import { PAIRWISE_DEFAULTS, PAIRWISE_DNA_DEFAULTS } from "../../core/pairwise-alignment-options.js";
const TWO_SEQUENCE_INPUT_HELP = "Use two FASTA records, or separate two plain-text sequences with a blank line. Sequence lines may wrap.";

import { geneticCodes } from "../../core/genetic-code.js";
import {
  codonAlignmentTableColumns,
  PAIRWISE_ALIGNMENT_ENGINES,
  pairwiseAlignmentDefaultLimits,
  pairwiseAlignmentTableColumns,
  pairwiseDnaAlignmentTableColumns,
  BLOSUM62_UNLISTED_SCORE
} from "../../core/pairwise-alignment.js";

function makeWorkflow(alphabet) {
  return {
    requestedOutputStreamsOption: "requestedPairwiseOutputs",
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet, minRecords: 2, maxRecords: 2 }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "alignmentText", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "clustal", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: `pairwise-alignment-${alphabet}`, columns: alphabet === 'dna-rna' ? pairwiseDnaAlignmentTableColumns : pairwiseAlignmentTableColumns },
      { id: "coloredSvg", kind: "text", mediaType: "image/svg+xml" },
      { id: "alignmentDocument", kind: "text", mediaType: "application/json", label: "Aligned sequence viewer", outputFormat: "aligned-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function makeCodonWorkflow() {
  return {
    requestedOutputStreamsOption: "requestedPairwiseOutputs",
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", minRecords: 2, maxRecords: 2 }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "alignmentText", kind: "text", mediaType: "text/plain" },
      { id: "codonFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "proteinFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "table", kind: "table", schema: "pairwise-coding-dna-alignment", columns: codonAlignmentTableColumns },
      { id: "coloredSvg", kind: "text", mediaType: "image/svg+xml" },
      { id: "alignmentDocument", kind: "text", mediaType: "application/json", label: "Aligned sequence viewer", outputFormat: "aligned-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

const commonOptions = [
  {
    id: "mode",
    type: "radio",
    label: "Alignment mode",
    defaultValue: PAIRWISE_DEFAULTS.mode,
    choices: [
      { value: "global", label: "Global" },
      { value: "local", label: "Local" }
    ],
    help: "Global aligns both sequences end to end, including gaps. Local returns one highest-scoring alignment between subsequences and leaves their other ends unaligned."
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
    defaultValue: PAIRWISE_DEFAULTS.gapOpen,
    min: 0,
    max: 100,
    step: 0.5,
    help: "Penalty for starting a gap. Internally this is applied as a negative score."
  },
  {
    id: "gapExtend",
    type: "number",
    label: "Gap extension penalty",
    defaultValue: PAIRWISE_DEFAULTS.gapExtend,
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
        defaultValue: PAIRWISE_DEFAULTS.outputFormat,
        choices: [
          { showcase: false, value: "report", label: "Summary report" },
          { showcase: false, value: "alignment-text", label: "Pairwise text" },
          { showcase: false, value: "aligned-fasta", label: "Aligned FASTA" },
          { showcase: false, value: "clustal", label: "CLUSTAL-format text alignment" },
          { showcase: false, value: "tsv", label: "Alignment table" },
          { showcase: "colored-alignment", value: "svg-color", label: "Colored alignment" },
          { showcase: "aligned-sequence-viewer", value: "aligned-sequence-viewer", label: "Aligned sequence viewer" }
        ]
      }
    ]
  }
];

const pairwiseLimitsGroup = {
  id: "advancedLimits",
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    { id: "alignedSequenceFigureCells", type: "limit-value", label: "Aligned sequence viewer cells", value: ALIGNED_SEQUENCE_LIMITS.displayedCells, visibleWhen: { option: "outputFormat", value: "aligned-sequence-viewer" }, help: "Complete alignment length × displayed sequences, including gaps. Larger alignments remain available as FASTA or alignment tables." },
    { type: "limit-value", id: "pairwiseFigureCells", label: "Colored alignment cells", value: DEFAULT_ALIGNMENT_SVG_CELL_LIMIT, help: "Fixed drawing ceiling across both rows; larger alignments remain available as reports, text, FASTA or tables." },
    { type: "limit-value", label: "Input sequences per alignment", value: 2,
      help: "Exactly two records or raw sequence blocks are required. Extra records are rejected." },
    {
      id: "maxAlignmentCells",
      type: "number",
      label: "Maximum alignment cells",
      defaultValue: pairwiseAlignmentDefaultLimits.maxAlignmentCells,
      min: 1000,
      max: pairwiseAlignmentDefaultLimits.maxAlignmentCells * 10,
      step: 100000,
      help: "Caps the dynamic-programming matrix for either engine. Coding DNA counts translated codons as alignment symbols."
    }
  ]
};

export const pairwiseAlignDnaRnaMetadata = {
  id: "pairwise-align-dna-rna",
  name: "Pairwise Align DNA/RNA",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "raw", "FASTA", "alignment", "coordinates"],
  summary:
    "Align two DNA/RNA sequences with global or local dynamic programming and affine gap penalties.",
  whenToUse: "Compare two nucleotide sequences end to end or locate their best matching subsequences, optionally testing the second sequence's reverse complement.",
  inputType: "Two DNA/RNA sequences",
  inputHelp: TWO_SEQUENCE_INPUT_HELP,
  outputType: "Alignment report, text, FASTA, CLUSTAL-format text, table, colored alignment",
  workflow: makeWorkflow("dna-rna"),
  runInWorker: true,
  workerModule: "../tools/pairwise-alignment/run.js",
  workerExport: "runPairwiseAlignDnaRna",
  options: [
    commonOptions[0],
    { ...commonOptions[1], help: "seq-align accepts integer scores and unambiguous DNA or RNA, with no mixed T/U input. SMS3 affine also accepts fractional scores and IUPAC ambiguity symbols." },
    { id: "matchScore", type: "number", label: "Match score", defaultValue: PAIRWISE_DEFAULTS.matchScore, min: -100, max: 100, step: 0.5 },
    {
      id: "similarScore",
      type: "number",
      label: "Ambiguous overlap score",
      defaultValue: PAIRWISE_DEFAULTS.similarScore,
      min: -100,
      max: 100,
      step: 0.5,
      visibleWhen: { option: "alignmentEngine", value: PAIRWISE_ALIGNMENT_ENGINES.sms3 },
      help: "Only the SMS3 affine engine scores overlapping IUPAC ambiguity symbols separately."
    },
    { id: "mismatchScore", type: "number", label: "Mismatch score", defaultValue: PAIRWISE_DEFAULTS.mismatchScore, min: -100, max: 100, step: 0.5 },
    {
      id: "secondSequenceOrientation",
      type: "radio",
      label: "Second sequence orientation",
      defaultValue: PAIRWISE_DEFAULTS.secondSequenceOrientation,
      choices: [
        { value: "as-provided", label: "Use submitted orientation" },
        { value: "best", label: "Try reverse complement and use best score" }
      ],
      help: "For DNA/RNA only. When enabled, sequence B is aligned as submitted and as its reverse complement; the higher-scoring orientation is reported."
    },
    { ...commonOptions[2], defaultValue: PAIRWISE_DNA_DEFAULTS.gapOpen },
    { ...commonOptions[3], defaultValue: PAIRWISE_DNA_DEFAULTS.gapExtend },
    ...commonOptions.slice(4),
    pairwiseLimitsGroup,
    {
      id: "methodNote",
      type: "note",
      text: "Pre-existing gaps are removed before alignment. Coordinates are 1-based inclusive positions in the cleaned sequences. Identity counts identical symbols, including identical ambiguity symbols, across all alignment columns. SMS3 scores distinct overlapping IUPAC symbols and T/U with the ambiguous overlap score. A gap of length L costs opening + (L - 1) × extension. Reverse-complement displays number the selected orientation; the table also retains submitted positions."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nGlobal alignment: Needleman and Wunsch 1970.\n\nLocal alignment: Smith and Waterman 1981.\n\nAffine gap model: Gotoh 1982."
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
  whenToUse: "Compare two protein sequences end to end or identify their highest-scoring matching regions while retaining residue coordinates and gap positions.",
  inputType: "Two protein sequences",
  inputHelp: TWO_SEQUENCE_INPUT_HELP,
  outputType: "Alignment report, text, FASTA, CLUSTAL-format text, table, colored alignment",
  workflow: makeWorkflow("protein"),
  runInWorker: true,
  workerModule: "../tools/pairwise-alignment/run.js",
  workerExport: "runPairwiseAlignProtein",
  options: [
    commonOptions[0],
    { ...commonOptions[1], help: "seq-align accepts integer gap penalties. SMS3 affine also accepts fractional gap penalties." },
    ...commonOptions.slice(2),
    pairwiseLimitsGroup,
    {
      id: "matrixNote",
      type: "note",
      text: `BLOSUM62 includes B, Z, X and stop symbols. J, O and U are retained with a generic pair score of ${BLOSUM62_UNLISTED_SCORE}. Pre-existing gaps are removed; coordinates are 1-based inclusive positions in the cleaned sequences, including retained stops. Identity counts identical symbols across all alignment columns. Similarity counts identical symbols plus positive-scoring substitutions. A gap of length L costs opening + (L - 1) × extension.`
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nGlobal alignment: Needleman and Wunsch 1970.\n\nLocal alignment: Smith and Waterman 1981.\n\nAffine gap model: Gotoh 1982.\n\nBLOSUM62: Henikoff and Henikoff 1992."
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
  whenToUse: "Compare two coding sequences in the same reading frame while preserving codon boundaries in the aligned nucleotides.",
  inputType: "Two coding DNA/RNA sequences",
  inputHelp: `${TWO_SEQUENCE_INPUT_HELP} Submit both coding strands in the intended orientation, with the first base starting a codon.`,
  outputType: "Codon alignment report, text, aligned codon FASTA, aligned translated protein FASTA, table, colored alignment",
  workflow: makeCodonWorkflow(),
  runInWorker: true,
  workerModule: "../tools/pairwise-alignment/run.js",
  workerExport: "runPairwiseAlignCodingDna",
  options: [
    {
      ...commonOptions[0],
      help: "Global aligns the complete translated proteins end to end. Local returns one highest-scoring alignment between protein subsequences. Both results are projected back to complete codons."
    },
    { ...commonOptions[1], help: "Both engines align translated amino acids with BLOSUM62 and affine gaps. seq-align uses integer penalties; SMS3 affine also accepts fractional penalties. Ambiguous and stop codons use X in both engines." },
    { ...commonOptions[2], help: "Penalty for starting a codon-sized gap. Internally this is applied as a negative amino-acid alignment score." },
    { ...commonOptions[3], help: "Penalty for extending an existing codon-sized gap by one codon." },
    {
      id: "geneticCode",
      type: "select",
      label: "Genetic code",
      defaultValue: PAIRWISE_DEFAULTS.geneticCode,
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
          defaultValue: PAIRWISE_DEFAULTS.outputFormat,
          choices: [
            { showcase: false, value: "report", label: "Summary report" },
            { showcase: false, value: "alignment-text", label: "Codon text" },
            { showcase: false, value: "codon-fasta", label: "Aligned codon FASTA" },
            { showcase: false, value: "protein-fasta", label: "Aligned translated protein FASTA" },
            { showcase: false, value: "tsv", label: "Codon table" },
            { showcase: "colored-alignment", value: "svg-color", label: "Colored alignment" },
            { showcase: "aligned-sequence-viewer", value: "aligned-sequence-viewer", label: "Aligned sequence viewer" }
          ]
        }
      ]
    },
    pairwiseLimitsGroup,
    {
      id: "methodNote",
      type: "note",
      text: "Codons start at the first cleaned base; reading frames and frameshifts are not inferred. U is converted to T and pre-existing gaps are removed. Incomplete trailing codons are omitted with a warning. Ambiguous and stop codons are scored as X. Identity and similarity describe translated amino acids; coordinates are 1-based inclusive positions in the cleaned coding sequence."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nGlobal alignment: Needleman and Wunsch 1970.\n\nLocal alignment: Smith and Waterman 1981.\n\nAffine gap model: Gotoh 1982.\n\nBLOSUM62: Henikoff and Henikoff 1992.\n\nGenetic code assignments follow NCBI transl_table definitions."
    }
  ]
};
