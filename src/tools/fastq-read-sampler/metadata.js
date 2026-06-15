import { fastqSamplerColumns } from "../../core/fastq-sampler.js";

export const fastqReadSamplerMetadata = {
  id: "fastq-read-sampler",
  name: "FASTQ Read Sampler",
  category: "Random & Mutagenesis",
  tags: ["DNA", "FASTQ", "statistics"],
  summary: "Randomly sample reads from single-end or paired-end FASTQ inputs while keeping paired mates together.",
  whenToUse: "Use this when you need a smaller reproducible FASTQ subset for testing, teaching, QC spot checks, or browser-local workflow examples.",
  inputType: "Single-end FASTQ text/file or paired FASTQ files",
  outputType: "Sampled FASTQ, paired FASTQ, sample table, or report",
  fileInput: {
    accept: ".fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
    dropLabel: "Drop FASTQ or FASTQ.GZ here",
    directFileOption: "fastqInputFile"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fastq", kind: "text", mediaType: "text/x-fastq", label: "Sampled reads" },
      { id: "read1Fastq", kind: "text", mediaType: "text/x-fastq", label: "Sampled R1 reads" },
      { id: "read2Fastq", kind: "text", mediaType: "text/x-fastq", label: "Sampled R2 reads" },
      { id: "interleavedFastq", kind: "text", mediaType: "text/x-fastq", label: "Interleaved sampled read pairs" },
      { id: "table", kind: "table", schema: "fastq-read-sampler", columns: fastqSamplerColumns, label: "Sample table" },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fastq-read-sampler/run.js",
  workerExport: "runFastqReadSampler",
  options: [
    {
      type: "group",
      id: "readSource",
      label: "Read source",
      options: [
        {
          id: "readLayout",
          type: "radio",
          placement: "input",
          presentation: "tabs",
          label: "Read layout",
          defaultValue: "single",
          choices: [
            { value: "single", label: "Single-end reads" },
            { value: "paired", label: "Paired-end reads" }
          ],
          help: "Paired-end mode samples by pair number and keeps R1/R2 mates together."
        }
      ]
    },
    {
      id: "read1FastqFile",
      type: "file",
      placement: "input",
      label: "Read 1 FASTQ file",
      accept: ".fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
      defaultValue: null,
      dropLabel: "Drop R1 FASTQ here",
      pasteArea: true,
      pasteName: "reads_R1.fastq",
      pastePlaceholder: "Paste R1 FASTQ reads here",
      pasteRows: 8,
      example: `@sample_pair_1/1
ACGTACGTACGTACGT
+
IIIIIIIIIIIIIIII
@sample_pair_2/1
TTTTCCCCAAAAGGGG
+
HHHHHHHHHHHHHHHH
@sample_pair_3/1
GATTACAGATTACAGA
+
GGGGGGGGGGGGGGGG`,
      visibleWhen: { option: "readLayout", value: "paired" },
      help: "First mate FASTQ or FASTQ.GZ file. Records are paired by ordinal position with the R2 file."
    },
    {
      id: "read2FastqFile",
      type: "file",
      placement: "input",
      label: "Read 2 FASTQ file",
      accept: ".fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
      defaultValue: null,
      dropLabel: "Drop R2 FASTQ here",
      pasteArea: true,
      pasteName: "reads_R2.fastq",
      pastePlaceholder: "Paste R2 FASTQ reads here",
      pasteRows: 8,
      example: `@sample_pair_1/2
TGCATGCATGCATGCA
+
IIIIIIIIIIIIIIII
@sample_pair_2/2
GGGGAAAACCCCTTTT
+
HHHHHHHHHHHHHHHH
@sample_pair_3/2
TCTGTAATCTGTAATC
+
GGGGGGGGGGGGGGGG`,
      visibleWhen: { option: "readLayout", value: "paired" },
      help: "Second mate FASTQ or FASTQ.GZ file. Read-name mismatches are reported but sampling still follows paired record order."
    },
    {
      type: "group",
      label: "Sampling",
      options: [
        {
          id: "sampleSize",
          type: "number",
          label: "Reads or pairs to sample",
          defaultValue: 1000,
          min: 0,
          max: 1000000,
          step: 1,
          help: "Single-end mode samples this many reads. Paired-end mode samples this many read pairs."
        },
        {
          id: "seed",
          type: "text",
          label: "Random seed",
          defaultValue: "",
          help: "Enter a seed to reproduce the same sampled reads; leave empty for a new random draw."
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
          dependsOn: "readLayout",
          defaultValue: "fastq",
          choices: [
            { value: "fastq", label: "Sampled FASTQ", dependsOnValue: "single" },
            { value: "interleaved-fastq", label: "Interleaved paired FASTQ", dependsOnValue: "paired" },
            { value: "read1-fastq", label: "Read 1 sampled FASTQ", dependsOnValue: "paired" },
            { value: "read2-fastq", label: "Read 2 sampled FASTQ", dependsOnValue: "paired" },
            { value: "table", label: "Sample table", always: true },
            { value: "report", label: "Summary report", always: true }
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
          id: "maxInputReads",
          type: "number",
          label: "Maximum reads or pairs to inspect",
          defaultValue: 5000000,
          min: 1,
          max: 100000000,
          help: "Caps the number of reads scanned from single-end input, or read pairs scanned from paired-end input."
        },
        {
          id: "maxOutputBytes",
          type: "number",
          label: "Maximum output bytes",
          defaultValue: 200000000,
          min: 1000,
          max: 2000000000,
          help: "Rejects sampled FASTQ output above this size so browser-local downloads remain bounded."
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Uses streaming reservoir sampling without replacement; paired-end mode samples read pairs together."
    }
  ]
};
