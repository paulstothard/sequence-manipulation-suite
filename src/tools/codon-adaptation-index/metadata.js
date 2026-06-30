import {
  codonAdaptationCodonColumns,
  codonAdaptationIndexColumns
} from "../../core/codon-adaptation-index.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

export const codonAdaptationIndexMetadata = {
  id: "codon-adaptation-index",
  name: "Codon Adaptation Index",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "FASTA", "codon", "statistics", "reference data"],
  summary: "Calculate codon adaptation index for coding DNA/RNA against a bundled codon usage reference.",
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
    {
      id: "referenceId",
      type: "select",
      label: "Codon usage reference",
      defaultValue: "ecoli-k12-mg1655-refseq",
      choices: codonUsageReferences.map((reference) => ({ value: reference.id, label: reference.name })),
      help: "CAI depends strongly on the selected codon reference. Use a reference that matches the host or biological comparison you intend."
    },
    {
      id: "methodNote",
      type: "note",
      text: "CAI is the geometric mean of relative adaptiveness weights for codons in the selected reference. Ambiguous, stop, and zero-weight codons are counted but not scored.\n\nReferences:\n\nCodon adaptation index: Sharp and Li 1987."
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "summary-tsv",
          choices: [
            { value: "summary-tsv", label: "CAI summary table" },
            { value: "codon-tsv", label: "Per-codon weight table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
