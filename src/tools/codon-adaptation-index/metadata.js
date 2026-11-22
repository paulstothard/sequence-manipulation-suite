import { FASTA_RECORD_SOURCE_LIMITS as sourceLimits } from "../../core/fasta-record-source.js";
import {
  codonAdaptationCodonColumns,
  codonAdaptationIndexColumns
} from "../../core/codon-adaptation-index.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
import { CODON_ADAPTATION_DEFAULTS, CODON_ADAPTATION_INDEX_LIMITS as limits, CAI_ZERO_REFERENCE_COUNT } from "../../core/codon-adaptation-options.js";

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
            { showcase: false, value: "summary-tsv", label: "CAI summary table" },
            { showcase: false, value: "codon-tsv", label: "Per-codon weight table" },
            { showcase: false, value: "report", label: "Summary report" }
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
        text: `All outputs accept up to ${limits.maxRecords.toLocaleString("en-US")} records and ${sourceLimits.maxAcceptedBases.toLocaleString("en-US")} non-whitespace sequence characters, with ${sourceLimits.maxSourceBytes / 1048576} MiB source files and ${sourceLimits.maxDecodedBytes / 1048576} MiB decoded text. Per-codon output is limited to ${limits.maxCodonRows.toLocaleString("en-US")} rows. Materialized output is limited to ${limits.maxMaterializedOutputCharacters.toLocaleString("en-US")} characters. Exceeding a ceiling rejects the run. Headers are limited to ${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters each and ${sourceLimits.maxTotalHeaderCharacters.toLocaleString("en-US")} in total; index files are limited to ${sourceLimits.maxIndexBytes / 1048576} MiB.`
      }]
    },
    {
      id: "methodNote",
      type: "note",
      text: `CAI is the geometric mean of relative adaptiveness weights for codons in the selected reference. Ambiguous, stop, and single-codon amino-acid families (Met/Trp in the bundled codes) are counted but not scored. Zero reference counts use a ${CAI_ZERO_REFERENCE_COUNT} pseudocount. Bundled organism references summarize CDS usage, not highly expressed gene subsets; CAI here measures reference similarity, not predicted expression. The equal-synonymous seed is illustrative.\n\nReferences:\n\nCodon adaptation index: Sharp and Li 1987.`
    }
  ]
};
