import {
  codonAdaptationCodonColumns,
  codonAdaptationIndexColumns
} from "../../core/codon-adaptation-index.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
import { CODON_ADAPTATION_DEFAULTS } from "../../core/codon-adaptation-options.js";

export const codonAdaptationIndexMetadata = {
  id: "codon-adaptation-index",
  name: "Codon Adaptation Index",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "FASTA", "codon", "statistics", "reference data"],
  summary: "Calculate codon adaptation index for coding DNA/RNA against a bundled codon usage reference.",
  whenToUse: "Compare coding DNA/RNA sequences with a selected codon-usage reference and inspect the codon weights behind each score.",
  inputType: "Coding DNA/RNA sequence or FASTA records",
  outputType: "CAI report, summary table, or codon-weight table",
  fileInput: {
    dropLabel: "Drop one plain-text coding DNA/RNA sequence or FASTA records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "summaryTable", kind: "table", schema: "codon-adaptation-index", columns: codonAdaptationIndexColumns },
      { id: "codonTable", kind: "table", schema: "codon-adaptation-index-codons", columns: codonAdaptationCodonColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/codon-adaptation-index/run.js",
  workerExport: "runCodonAdaptationIndex",
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }),
    {
      id: "referenceId",
      type: "select",
      label: "Codon usage reference",
      defaultValue: CODON_ADAPTATION_DEFAULTS.referenceId,
      choices: codonUsageReferences.map((reference) => ({ value: reference.id, label: reference.name })),
      help: "CAI depends strongly on the selected codon reference. Use a reference that matches the host or biological comparison you intend."
    },
    {
      id: "sourceNote",
      type: "note",
      text: `Each record is scored independently from its first cleaned base, with RNA U treated as T. Codon numbers are 1-based positions in the cleaned reading frame. ${STREAMED_FASTA_SCAN_NOTE}`
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: CODON_ADAPTATION_DEFAULTS.outputFormat,
          choices: [
            { value: "summary-tsv", label: "CAI summary table" },
            { value: "codon-tsv", label: "Per-codon weight table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [{
        id: "streamingLimitsNote",
        type: "note",
        text: "All outputs accept up to 10,000 records and 100 million non-whitespace sequence characters, with 512 MiB source files and 150 MiB decoded text. Per-codon output is limited to 250,000 rows. Materialized output is limited to 26,214,400 characters. Exceeding a ceiling rejects the run. Headers are limited to 10,000 characters each and 5 million in total; index files are limited to 16 MiB."
      }]
    },
    {
      id: "methodNote",
      type: "note",
      text: "CAI is the geometric mean of relative adaptiveness weights for codons in the selected reference. Ambiguous, stop, and single-codon amino-acid families (Met/Trp in the bundled codes) are counted but not scored. Zero reference counts use a 0.5 pseudocount. Bundled organism references summarize CDS usage, not highly expressed gene subsets; CAI here measures reference similarity, not predicted expression. The equal-synonymous seed is illustrative.\n\nReferences:\n\nCodon adaptation index: Sharp and Li 1987."
    }
  ]
};
