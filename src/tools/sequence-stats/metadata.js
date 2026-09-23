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
  inputType: "DNA/RNA sequence or FASTA records",
  outputType: "Sequence statistics report, table",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "sequence-stats-dna-rna", columns: sequenceStatsTableColumns },
      { id: "statsRecords", kind: "stats-records", schema: "sequence-stats-dna-rna" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/sequence-stats/run.js",
  workerExport: "runSequenceStatsDnaRnaWorker",
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true }),
    {
      type: "group",
      label: "Output",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "tsv",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } }
          ]
        }
      ]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: `Input is cleaned to DNA/RNA IUPAC symbols before statistics are calculated. Alignment gap characters (. and -) are removed. GC% uses G+C divided by A+C+G+T+U. ${STREAMED_FASTA_SCAN_NOTE}`
    },
    {
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [{
        id: "streamingLimitsNote",
        type: "note",
        text: "Runs accept source files up to 512 MiB, 150 MiB of decoded text, 10,000 records, and 100 million accepted source characters. Materialized report or table output is limited to 25 MiB."
      }]
    }
  ]
};
