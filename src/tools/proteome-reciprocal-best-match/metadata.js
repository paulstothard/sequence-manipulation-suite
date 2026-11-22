import { RECIPROCAL_DEFAULTS, RECIPROCAL_NUMBER_RULES, RECIPROCAL_RESOURCE_LIMITS as LIMITS } from "../../core/reciprocal-best-match-options.js";
import {
  dnaRnaSequenceSetReciprocalBestMatchColumns,
  dnaRnaSequenceSetUnmatchedColumns,
  MAX_HEATMAP_RECORDS,
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
      { id: "report", label: "Summary report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      {
        id: "table",
        label: "Reciprocal best-match table",
        outputFormat: "reciprocal-tsv",
        kind: "table",
        schema: tableSchema,
        columns: tableColumns
      },
      {
        id: "unmatchedTable",
        label: "Records without reciprocal matches",
        outputFormat: "unmatched-tsv",
        kind: "table",
        schema: unmatchedSchema,
        columns: unmatchedColumns
      },
      { id: "heatmap", label: "Identity heatmap", outputFormat: "heatmap-svg", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  };
}

function makeOptions({ alphabet, kmerLabel, sequenceCountLimitLabel, sequenceLimitLabel, includeDnaScores = false }) {
  const defaults = RECIPROCAL_DEFAULTS[alphabet];
  const rules = RECIPROCAL_NUMBER_RULES[alphabet];
  const applyRules = (option) => {
    if (option.options) return { ...option, options: option.options.map(applyRules) };
    if (!rules[option.id]) return option;
    const [min, max] = rules[option.id];
    return { ...option, defaultValue: defaults[option.id], min, max };
  };
  return [
    {
      type: "group",
      label: "Candidate screening",
      help: "Shared k-mers are only used to decide which sequence pairs receive full pairwise alignment.",
      options: [
        { id: "kmerSize", type: "number", label: kmerLabel, step: 1, help: "Counts distinct canonical words. A sequence shorter than k contributes its whole canonical sequence as one word; ambiguous words are excluded." },
        { id: "minSharedKmers", type: "number", label: "Minimum shared k-mers", step: 1, help: "Zero admits pairs with no shared canonical word; the candidate-count selection still applies." },
        {
          id: "topCandidatesPerProtein",
          type: "number",
          label: "Candidates per sequence",
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
          defaultValue: defaults.verificationEngine,
          choices: [
            { value: PAIRWISE_ALIGNMENT_ENGINES.seqAlign, label: "seq-align" },
            { value: PAIRWISE_ALIGNMENT_ENGINES.sms3, label: "SMS3 affine" }
          ],
          help: alphabet === "protein" ? "Both engines use BLOSUM62. seq-align uses integer gap penalties; SMS3 affine also supports fractional penalties. Both run locally." : "seq-align uses integer scores and canonical DNA/RNA. SMS3 affine also supports fractional scores and IUPAC-overlap scoring. Both engines run locally."
        },
        {
          id: "alignmentMode",
          type: "radio",
          label: "Pairwise alignment mode",
          defaultValue: defaults.alignmentMode,
          choices: [
            { value: "local", label: "Local" },
            { value: "global", label: "Global" }
          ],
          help: alphabet === "protein"
            ? "Local scores one highest-scoring aligned region per protein pair, which can reveal shared domains. Global aligns both complete proteins end to end. Use the coverage filter to require a minimum aligned fraction of each protein."
            : "Local scores one highest-scoring aligned region per sequence pair. Global aligns both complete sequences end to end. Use the coverage filter to require a minimum aligned fraction of each sequence."
        },
        ...(includeDnaScores ? [
          { id: "matchScore", type: "number", label: "Match score", step: 0.5 },
          {
            id: "similarScore",
            type: "number",
            label: "Ambiguous overlap score",
            step: 0.5,
            visibleWhen: { option: "verificationEngine", value: PAIRWISE_ALIGNMENT_ENGINES.sms3 },
            help: "Only the SMS3 affine engine scores overlapping IUPAC ambiguity symbols separately."
          },
          { id: "mismatchScore", type: "number", label: "Mismatch score", step: 0.5 }
        ] : []),
        { id: "gapOpen", type: "number", label: "Gap open penalty", step: 1 },
        { id: "gapExtend", type: "number", label: "Gap extend penalty", step: 1 }
      ]
    },
    {
      type: "group",
      label: "Reporting filters",
      help: "Apply identity and coverage thresholds after ranking. Candidate tables and heatmaps retain verified comparisons; reciprocal tables and heatmap markers show passing reciprocal pairs.",
      options: [
        { id: "minIdentityPercent", type: "number", label: "Minimum identity %", step: 1 },
        { id: "minCoveragePercent", type: "number", label: "Minimum coverage %", step: 1 },
        {
          id: "nearTiePercent",
          type: "number",
          label: "Near-tie warning threshold %",
          step: 1,
          help: "Warns about aligned alternatives within this percentage of the absolute best score. Exact ties are included, including zero or negative global scores."
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
          defaultValue: defaults.outputFormat,
          choices: [
            { showcase: false, value: "report", label: "Summary report" },
            { showcase: false, value: "reciprocal-tsv", label: "Reciprocal best-match table" },
            { showcase: false, value: "candidates-tsv", label: "Aligned candidate pair table" },
            { showcase: false, value: "unmatched-tsv", label: alphabet === "protein" ? "Proteins without reciprocal matches" : "Sequences without reciprocal matches" },
            { showcase: "sequence-identity-heatmap", value: "heatmap-svg", label: "Identity heatmap" }
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
        { id: "maxProteinsPerProteome", type: "number", label: sequenceCountLimitLabel, step: 10 },
        { id: "maxSequenceLength", type: "number", label: sequenceLimitLabel, step: 100 },
        { id: "maxPairwiseAlignments", type: "number", label: "Maximum pairwise alignments", step: 10 },
        { id: "fixedResourceLimits", type: "limit-value", label: "Fixed work budgets", value: `${LIMITS.inputCharacters.toLocaleString()} input characters; ${LIMITS.inputRecords.toLocaleString()} input records per set; ${LIMITS.pairCells.toLocaleString()} cells per alignment; ${LIMITS.totalCells.toLocaleString()} total alignment cells`, help: `Also limited to ${LIMITS.titleCharacters} characters per title, ${LIMITS.recordPairs.toLocaleString()} possible record pairs, ${LIMITS.kmerSymbols.toLocaleString()} k-mer symbols, ${LIMITS.screeningVisits.toLocaleString()} word-to-record visits, ${LIMITS.candidatePairs.toLocaleString()} eligible pairs, ${LIMITS.verifiedPairs.toLocaleString()} verified pairs and ${LIMITS.outputCharacters.toLocaleString()} output characters. These fixed budgets apply even when optional ceilings are disabled.` },
        { id: "heatmapRecordLimit", type: "limit-value", label: "Identity heatmap", value: `${MAX_HEATMAP_RECORDS} records from each set`, help: `When either set has more records, the heatmap shows only its first ${MAX_HEATMAP_RECORDS}. The verified-pair table still includes all processed pairs.` }
      ]
    }
  ].map(applyRules);
}

export const dnaRnaSequenceSetReciprocalBestMatchMetadata = {
  id: "dna-rna-set-reciprocal-best-match",
  name: "DNA/RNA Set Reciprocal Best Match",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "FASTA", "alignment", "search"],
  summary: "Find candidate reciprocal best matches between two DNA/RNA FASTA sets in their supplied orientation using k-mer screening and affine pairwise alignment.",
  whenToUse: "Compare two DNA/RNA sequence sets to identify candidate reciprocal best matches and sequences without a reciprocal partner.",
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
      sequenceCountLimitLabel: "Maximum sequences per set",
      sequenceLimitLabel: "Maximum sequence length",
      includeDnaScores: true
    }),
    {
      id: "methodNote",
      type: "note",
      text: "Sequences are compared as provided; reverse complements are not searched, and U is compared as T. Reciprocity is relative to selected candidates. Exact score ties use shared k-mers and title order to select one partner; close alternatives are flagged for inspection."
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
  whenToUse: "Compare two protein sequence sets to identify candidate reciprocal best matches and proteins without a reciprocal partner.",
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
      sequenceCountLimitLabel: "Maximum proteins per set",
      sequenceLimitLabel: "Maximum protein length",
    }),
    {
      id: "methodNote",
      type: "note",
      text: "Canonical protein k-mers select candidates for BLOSUM62 affine alignment. Reciprocity is relative to selected candidates. Exact score ties use shared k-mers and title order to select one partner; close alternatives are flagged for inspection."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nBLOSUM62: Henikoff and Henikoff 1992.\n\nAffine gap model: Gotoh 1982.\n\nThe seq-align option runs the bundled public-domain build locally in browser runs."
    }
  ]
};
