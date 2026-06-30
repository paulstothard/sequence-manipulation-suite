import {
  dnaRnaSequenceSetReciprocalBestMatchColumns,
  dnaRnaSequenceSetUnmatchedColumns,
  proteomeReciprocalBestMatchColumns,
  proteomeUnmatchedColumns
} from "../../core/proteome-reciprocal-best-match.js";
import { PAIRWISE_ALIGNMENT_ENGINES } from "../../core/pairwise-alignment.js";

function makeWorkflow({ tableSchema, unmatchedSchema, tableColumns, unmatchedColumns }) {
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      {
        id: "table",
        kind: "table",
        schema: tableSchema,
        columns: tableColumns
      },
      {
        id: "unmatchedTable",
        kind: "table",
        schema: unmatchedSchema,
        columns: unmatchedColumns
      },
      { id: "heatmap", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function makeOptions({ alphabet, kmerLabel, kmerDefault, kmerMin, kmerMax, sequenceCountLimitLabel, sequenceLimitLabel, sequenceLimitDefault, includeDnaScores = false }) {
  return [
    {
      type: "group",
      label: "Candidate screening",
      help: "Shared k-mers are only used to decide which sequence pairs receive full pairwise alignment.",
      options: [
        { id: "kmerSize", type: "number", label: kmerLabel, defaultValue: kmerDefault, min: kmerMin, max: kmerMax, step: 1 },
        { id: "minSharedKmers", type: "number", label: "Minimum shared k-mers", defaultValue: 1, min: 0, step: 1 },
        {
          id: "topCandidatesPerProtein",
          type: "number",
          label: "Candidates per sequence",
          defaultValue: 5,
          min: 1,
          max: 50,
          step: 1,
          help: "Top candidates are selected from both A-to-B and B-to-A screens before alignment so reciprocal matches are not one-directional artifacts."
        }
      ]
    },
    {
      type: "group",
      label: "Alignment verification",
      options: [
        {
          id: "verificationEngine",
          type: "radio",
          label: "Verification engine",
          defaultValue: PAIRWISE_ALIGNMENT_ENGINES.seqAlign,
          choices: [
            { value: PAIRWISE_ALIGNMENT_ENGINES.seqAlign, label: "seq-align" },
            { value: PAIRWISE_ALIGNMENT_ENGINES.sms3, label: "SMS3 affine" }
          ],
          help: "Browser runs use bundled local seq-align files for the seq-align engine. Select SMS3 affine when you want the JavaScript verification engine."
        },
        {
          id: "alignmentMode",
          type: "radio",
          label: "Pairwise alignment mode",
          defaultValue: "local",
          choices: [
            { value: "local", label: "Local" },
            { value: "global", label: "Global" }
          ],
          help: alphabet === "protein"
            ? "Local alignment is usually more appropriate for domain-level similarity; global alignment is stricter for near-full-length orthologs."
            : "Local alignment is usually more appropriate for shared regions; global alignment is stricter for near-full-length sequence matches."
        },
        ...(includeDnaScores ? [
          { id: "matchScore", type: "number", label: "Match score", defaultValue: 5, min: -100, max: 100, step: 0.5 },
          { id: "similarScore", type: "number", label: "Ambiguous overlap score", defaultValue: 1, min: -100, max: 100, step: 0.5 },
          { id: "mismatchScore", type: "number", label: "Mismatch score", defaultValue: -4, min: -100, max: 100, step: 0.5 }
        ] : []),
        { id: "gapOpen", type: "number", label: "Gap open penalty", defaultValue: 10, min: 1, max: 100, step: 1 },
        { id: "gapExtend", type: "number", label: "Gap extend penalty", defaultValue: 1, min: 1, max: 50, step: 1 }
      ]
    },
    {
      type: "group",
      label: "Reporting filters",
      options: [
        { id: "minIdentityPercent", type: "number", label: "Minimum identity %", defaultValue: 0, min: 0, max: 100, step: 1 },
        { id: "minCoveragePercent", type: "number", label: "Minimum coverage %", defaultValue: 0, min: 0, max: 100, step: 1 },
        {
          id: "nearTiePercent",
          type: "number",
          label: "Paralog warning threshold %",
          defaultValue: 5,
          min: 0,
          max: 100,
          step: 1,
          help: "Warns when a second verified candidate is close to the best score for a sequence."
        }
      ]
    },
    {
      type: "group",
      label: "Output",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "report",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "reciprocal-tsv", label: "Reciprocal best-match table" },
            { value: "candidates-tsv", label: "Aligned candidate pair table" },
            { value: "unmatched-tsv", label: alphabet === "protein" ? "Proteins without reciprocal matches" : "Sequences without reciprocal matches" },
            { value: "heatmap-svg", label: "Identity heatmap" }
          ]
        }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxProteinsPerProteome", type: "number", label: sequenceCountLimitLabel, defaultValue: 500, min: 1, max: 5000, step: 10 },
        { id: "maxSequenceLength", type: "number", label: sequenceLimitLabel, defaultValue: sequenceLimitDefault, min: 10, max: 20000, step: 100 },
        { id: "maxPairwiseAlignments", type: "number", label: "Maximum pairwise alignments", defaultValue: 500, min: 1, max: 10000, step: 10 }
      ]
    }
  ];
}

export const dnaRnaSequenceSetReciprocalBestMatchMetadata = {
  id: "dna-rna-set-reciprocal-best-match",
  name: "DNA/RNA Set Reciprocal Best Match",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "FASTA", "alignment", "search"],
  summary: "Find candidate reciprocal best sequence matches between two DNA/RNA FASTA sets using k-mer screening followed by affine pairwise alignment.",
  whenToUse: "Use when comparing two DNA/RNA sequence sets to find likely one-to-one reciprocal best matches and sequences without a reciprocal partner.",
  inputType: "Two DNA/RNA FASTA sets",
  outputType: "Summary report, reciprocal best-match table, aligned candidate pair table, sequences without reciprocal matches, or identity heatmap",
  splitInput: {
    separator: "---",
    panels: [
      { id: "a", label: "DNA/RNA set A", dropLabel: "Drop DNA/RNA FASTA records for set A here", accept: ".fa,.fna,.fasta,.txt" },
      { id: "b", label: "DNA/RNA set B", dropLabel: "Drop DNA/RNA FASTA records for set B here", accept: ".fa,.fna,.fasta,.txt" }
    ]
  },
  workflow: makeWorkflow({
    tableSchema: "dna-rna-set-reciprocal-best-match",
    unmatchedSchema: "dna-rna-set-unmatched-sequences",
    tableColumns: dnaRnaSequenceSetReciprocalBestMatchColumns,
    unmatchedColumns: dnaRnaSequenceSetUnmatchedColumns
  }),
  runInWorker: true,
  workerModule: "../tools/proteome-reciprocal-best-match/run.js",
  workerExport: "runDnaRnaSequenceSetReciprocalBestMatch",
  options: [
    ...makeOptions({
      alphabet: "dna-rna",
      kmerLabel: "DNA/RNA k-mer size",
      kmerDefault: 11,
      kmerMin: 4,
      kmerMax: 100,
      sequenceCountLimitLabel: "Maximum sequences per set",
      sequenceLimitLabel: "Maximum sequence length",
      sequenceLimitDefault: 10000,
      includeDnaScores: true
    }),
    {
      id: "methodNote",
      type: "note",
      text: "This is a browser-local DNA/RNA set reciprocal-best-match screen. It is not a BLAST, minimap2, or whole-genome comparison replacement; k-mers narrow the candidates, then selected pairs are verified with affine pairwise alignment."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nGlobal alignment: Needleman and Wunsch 1970.\n\nLocal alignment: Smith and Waterman 1981.\n\nAffine gap model: Gotoh 1982.\n\nThe seq-align option runs the bundled public-domain build locally in browser runs."
    }
  ]
};

export const proteomeReciprocalBestMatchMetadata = {
  id: "proteome-reciprocal-best-match",
  name: "Protein Set Reciprocal Best Match",
  category: "Sequence Alignment & Assembly",
  tags: ["protein", "FASTA", "alignment", "search"],
  summary: "Find candidate reciprocal best protein matches between two FASTA protein sets using k-mer screening followed by affine pairwise alignment.",
  whenToUse: "Use when comparing two protein sequence sets to find likely one-to-one reciprocal best matches and proteins without a reciprocal partner.",
  inputType: "Two protein FASTA sets",
  outputType: "Summary report, reciprocal best-match table, aligned candidate pair table, proteins without reciprocal matches, or identity heatmap",
  splitInput: {
    separator: "---",
    panels: [
      { id: "a", label: "Protein set A", dropLabel: "Drop protein FASTA records for set A here", accept: ".fa,.faa,.fasta,.txt" },
      { id: "b", label: "Protein set B", dropLabel: "Drop protein FASTA records for set B here", accept: ".fa,.faa,.fasta,.txt" }
    ]
  },
  workflow: makeWorkflow({
    tableSchema: "protein-set-reciprocal-best-match",
    unmatchedSchema: "protein-set-unmatched-proteins",
    tableColumns: proteomeReciprocalBestMatchColumns,
    unmatchedColumns: proteomeUnmatchedColumns
  }),
  runInWorker: true,
  workerModule: "../tools/proteome-reciprocal-best-match/run.js",
  workerExport: "runProteomeReciprocalBestMatch",
  options: [
    ...makeOptions({
      alphabet: "protein",
      kmerLabel: "Protein k-mer size",
      kmerDefault: 4,
      kmerMin: 2,
      kmerMax: 8,
      sequenceCountLimitLabel: "Maximum proteins per set",
      sequenceLimitLabel: "Maximum protein length",
      sequenceLimitDefault: 1500
    }),
    {
      id: "methodNote",
      type: "note",
      text: "This is a browser-local protein-set reciprocal-best-match screen. It is not a BLAST, DIAMOND, or MMseqs replacement; k-mers narrow the candidates, then selected pairs are verified with BLOSUM62 affine pairwise alignment."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nBLOSUM62: Henikoff and Henikoff 1992.\n\nAffine gap model: Gotoh 1982.\n\nThe seq-align option runs the bundled public-domain build locally in browser runs."
    }
  ]
};
