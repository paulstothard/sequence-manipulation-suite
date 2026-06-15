import { readSimulatorTruthColumns } from "../../core/read-simulator.js";

export const readSimulatorMetadata = {
  id: "read-simulator",
  name: "Read Simulator",
  category: "Random & Mutagenesis",
  tags: ["DNA", "RNA", "raw", "FASTA", "FASTQ"],
  summary: "Simulate small DNA sequencing read sets from a reference sequence for testing, teaching, and workflow examples.",
  inputType: "Reference DNA/RNA sequence or FASTA records",
  outputType: "Simulated reads, paired read files, read metadata table, or summary report",
  runtime: {
    browserBioWasm: { required: true, tool: "wgsim" }
  },
  fileInput: {
    accept: ".txt,.fa,.fasta,.fna",
    dropLabel: "Drop one reference DNA/RNA sequence or FASTA records here"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fastq", kind: "text", mediaType: "text/x-fastq", label: "Simulated reads" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta", label: "Read sequences" },
      { id: "read1Fastq", kind: "text", mediaType: "text/x-fastq", label: "R1 FASTQ" },
      { id: "read2Fastq", kind: "text", mediaType: "text/x-fastq", label: "R2 FASTQ" },
      { id: "read1Fasta", kind: "text", mediaType: "text/x-fasta", label: "R1 FASTA" },
      { id: "read2Fasta", kind: "text", mediaType: "text/x-fasta", label: "R2 FASTA" },
      { id: "table", kind: "table", schema: "read-simulator-truth", columns: readSimulatorTruthColumns, label: "Read metadata table" },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/read-simulator/run.js",
  workerExport: "runReadSimulator",
  options: [
    {
      type: "group",
      label: "Read design",
      options: [
        {
          id: "readLayout",
          type: "radio",
          label: "Read layout",
          defaultValue: "paired",
          help: "Paired-end runs provide separate R1/R2 downloads for read sequence outputs. The main FASTQ or FASTA preview is interleaved for single-file copy/paste.",
          choices: [
            { value: "paired", label: "Paired-end reads" },
            { value: "single", label: "Single-end reads" }
          ]
        },
        {
          id: "readCount",
          type: "number",
          label: "Read pairs or reads",
          defaultValue: 20,
          min: 1,
          max: 1000000,
          help: "For paired-end layout this is read pairs. For single-end layout this is individual reads."
        },
        {
          id: "readLength",
          type: "number",
          label: "Read length",
          defaultValue: 100,
          min: 20,
          max: 2000
        },
        {
          id: "insertSize",
          type: "number",
          label: "Insert size",
          defaultValue: 300,
          min: 20,
          max: 100000,
          visibleWhen: { option: "readLayout", value: "paired" }
        },
        {
          id: "insertSizeStdDev",
          type: "number",
          label: "Insert size standard deviation",
          defaultValue: 40,
          min: 0,
          max: 100000,
          visibleWhen: { option: "readLayout", value: "paired" }
        }
      ]
    },
    {
      type: "group",
      label: "Variation and quality",
      options: [
        {
          id: "baseErrorPercent",
          type: "number",
          label: "Base error %",
          defaultValue: 1,
          min: 0,
          max: 100,
          step: 0.01
        },
        {
          id: "mutationPercent",
          type: "number",
          label: "Reference mutation %",
          defaultValue: 0.1,
          min: 0,
          max: 100,
          step: 0.001
        },
        {
          id: "indelPercent",
          type: "number",
          label: "Indel fraction %",
          defaultValue: 15,
          min: 0,
          max: 100,
          step: 0.1
        },
        {
          id: "indelExtensionPercent",
          type: "number",
          label: "Indel extension probability %",
          defaultValue: 30,
          min: 0,
          max: 100,
          step: 0.1
        },
        {
          id: "seed",
          type: "text",
          label: "Random seed",
          defaultValue: "",
          help: "Enter a seed to reproduce the same simulated reads; leave empty for a new random draw."
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "fastq",
          help: "For paired-end read outputs, SMS3 shows one interleaved preview after Run and offers separate R1/R2 downloads.",
          choices: [
            { value: "fastq", label: "Read FASTQ" },
            { value: "fasta", label: "Read FASTA" },
            { value: "truth-table", label: "Read metadata table" },
            { value: "report", label: "Summary report" }
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
        {
          id: "maxReads",
          type: "number",
          label: "Maximum read pairs or reads",
          defaultValue: 5000,
          min: 1,
          max: 1000000
        },
        {
          id: "maxReferenceLength",
          type: "number",
          label: "Maximum reference bases",
          defaultValue: 1000000,
          min: 100,
          max: 500000000
        }
      ]
    },
    {
      id: "methodsAndCitations",
      type: "note",
      text: "Uses local WGSIM read simulation; this tool is intended for compact teaching, testing, and workflow fixtures."
    }
  ]
};
