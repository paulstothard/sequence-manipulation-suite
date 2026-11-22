import { ASSEMBLY_DEFAULTS as defaults, ASSEMBLY_LIMITS as limits } from "../../core/lightweight-assembly-options.js";
import { lightweightAssemblyColumns, MAX_ASSEMBLY_RECORDS } from "../../core/lightweight-sequence-assembly.js";

export const lightweightSequenceAssemblyMetadata = {
  id: "lightweight-sequence-assembly",
  name: "Lightweight Sequence Assembly",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "FASTA", "alignment", "assembly"],
  summary: "Assemble small sets of DNA reads or contigs with greedy overlap detection and automatic reverse-complement orientation testing.",
  whenToUse: "Combine overlapping Sanger reads, cloning fragments or amplicons into small consensus contigs and inspect their placements.",
  inputType: "DNA/RNA FASTA reads or contigs",
  outputType: "Assembly report, consensus FASTA, read placement table, or consensus/read text map",
  workflow: {
    requestedOutputStreamsOption: "requestedAssemblyOutputs",
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", minRecords: 2 }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "lightweight-sequence-assembly", columns: lightweightAssemblyColumns },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "assembled-contigs", outputFormat: "sequence-records" },
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
        { id: "minOverlap", type: "number", label: "Minimum overlap", defaultValue: defaults.minOverlap, min: 6, max: 10000, step: 1, help: "Minimum aligned length for suffix/prefix overlaps and contained reads. Contained reads shorter than this remain separate." },
        { id: "maxMismatchPercent", type: "number", label: "Maximum mismatch percent", defaultValue: defaults.maxMismatchPercent, min: 0, max: 40, step: 0.1, help: "Allowed mismatches divided by the full aligned length. N matches any base; other IUPAC symbols are compared literally. Conflicting calls become N and remain unresolved by later reads." }
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
            { showcase: false, value: "report", label: "Assembly report" },
            { showcase: false, value: "fasta", label: "Consensus FASTA" },
            { showcase: false, value: "text-map", label: "Consensus/read text map" },
            { showcase: false, value: "tsv", label: "Read placement table" }
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
        { id: "maxAssemblyRecords", type: "limit-value", label: "Maximum reads/contigs", value: MAX_ASSEMBLY_RECORDS },
        { id: "assemblyResourceLimits", type: "note", text: `Fixed ceilings: ${limits.inputCharacters.toLocaleString()} input characters, ${limits.inputRecords.toLocaleString()} records, ${limits.readBases.toLocaleString()} bases per read, ${limits.totalBases.toLocaleString()} total bases, ${limits.readTrials.toLocaleString()} read trials and ${limits.comparisons.toLocaleString()} base comparisons. Titles support ${limits.titleCharacters} characters; each raw read supports ${limits.readCharacters.toLocaleString()} characters. Text maps support ${limits.mapCells.toLocaleString()} alignment cells; generated text supports ${limits.outputCharacters.toLocaleString()} characters.` }
      ]
    },
    {
      id: "scopeNote",
      type: "note",
      text: "Greedy ungapped assembly seeds the longest read and tests both orientations. It removes alignment gaps and converts U to T. Placement coordinates are 1-based inclusive on the contig, with reverse reads shown in contig orientation. Base qualities, indels and global optimality are outside this method."
    }
  ]
};
