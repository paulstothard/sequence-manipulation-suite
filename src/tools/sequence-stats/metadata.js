import { SEQUENCE_STATS_DEFAULTS } from "../../core/sequence-stats-options.js";
import { sequenceStatsTableColumns } from "./table-columns.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const sequenceStatsDnaRnaMetadata = {
  id: "sequence-stats-dna-rna",
  name: "Sequence Stats DNA/RNA",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "GC", "statistics"],
  summary:
    "Summarize DNA/RNA sequence length, base counts, ambiguity symbols, and GC content.",
  whenToUse: "Compare sequence lengths, base composition, and ambiguous-symbol counts across DNA/RNA records.",
  inputType: "DNA/RNA sequence or FASTA records",
  outputType: "Sequence statistics report, table",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", outputFormat: "tsv", kind: "table", schema: "sequence-stats-dna-rna", columns: sequenceStatsTableColumns },
      { id: "statsRecords", outputFormat: "stats-records", kind: "stats-records", schema: "sequence-stats-dna-rna" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/sequence-stats/run.js",
  workerExport: "runSequenceStatsDnaRnaWorker",
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }).map(option => option.id === "sourceMode" ? { ...option, defaultValue: SEQUENCE_STATS_DEFAULTS.sourceMode } : option),
    {
      type: "group",
      label: "Output",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: SEQUENCE_STATS_DEFAULTS.outputFormat,
          choices: [
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } }
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
        text: "Runs accept source files up to 512 MiB, 150 MiB of decoded text, 10,000 records, and 100 million accepted source characters. Selected output is limited to 26,214,400 characters. FASTA headers are limited to 10,000 characters each and 5,000,000 in total; each index sidecar is limited to 16 MiB."
      }]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: `Counts retain DNA/RNA IUPAC symbols and X; alignment gaps (. and -) are removed. GC% is 100 × (G+C)/(A+C+G+T+U), excluding ambiguity symbols. GC is undefined without unambiguous bases (blank in tables; n/a in reports). Multi-record totals combine counts before calculating GC%. ${STREAMED_FASTA_SCAN_NOTE}`
    }
  ]
};
