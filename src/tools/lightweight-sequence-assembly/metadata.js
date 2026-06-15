import { lightweightAssemblyColumns } from "../../core/lightweight-sequence-assembly.js";

export const lightweightSequenceAssemblyMetadata = {
  id: "lightweight-sequence-assembly",
  name: "Lightweight Sequence Assembly",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "FASTA", "alignment", "assembly"],
  summary: "Assemble small sets of DNA reads or contigs with greedy overlap detection and automatic reverse-complement orientation testing.",
  inputType: "DNA/RNA FASTA reads or contigs",
  outputType: "Assembly report, consensus FASTA, read placement table, or consensus/read text map",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "lightweight-sequence-assembly", columns: lightweightAssemblyColumns },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "assembled-contigs" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/lightweight-sequence-assembly/run.js",
  workerExport: "runLightweightSequenceAssembly",
  options: [
    {
      type: "group",
      label: "Assembly",
      options: [
        { id: "minOverlap", type: "number", label: "Minimum overlap", defaultValue: 20, min: 6, max: 10000, step: 1, help: "Minimum suffix/prefix overlap required to merge two reads. Reads already contained within a contig can still be placed when they satisfy the mismatch setting." },
        { id: "maxMismatchPercent", type: "number", label: "Maximum mismatch percent", defaultValue: 5, min: 0, max: 40, step: 0.1, help: "Allowed mismatch rate inside the overlap or contained-read alignment. Conflicting bases in accepted overlaps become N in the consensus." }
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
            { value: "report", label: "Assembly report" },
            { value: "fasta", label: "Consensus FASTA" },
            { value: "text-map", label: "Consensus/read text map" },
            { value: "tsv", label: "Read placement table" }
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
        { id: "maxReads", type: "number", label: "Maximum reads/contigs to assemble", defaultValue: 100, min: 2, max: 1000, step: 1, help: "Caps this small lab-scale assembler before work begins. It is not intended for whole-genome or NGS read assembly." }
      ]
    },
    {
      id: "scopeNote",
      type: "note",
      text: "This is a lightweight overlap assembler for Sanger reads, cloning fragments, amplicons, and small contig sets. It is not intended for whole-genome or NGS read assembly."
    }
  ]
};
