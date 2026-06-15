import {
  fastqDistributionColumns,
  fastqPerBaseQualityColumns,
  fastqSummaryColumns
} from "../../core/fastq-summary.js";

export const fastqSummaryMetadata = {
  id: "fastq-summary",
  name: "FASTQ QC Report",
  category: "High-Throughput Sequencing",
  tags: ["DNA", "FASTQ", "plot", "statistics"],
  summary: "Summarize FASTQ reads with read statistics, quality metrics, duplicate/overrepresented read checks, and QC plots.",
  inputType: "Single-end FASTQ text/file or paired FASTQ files",
  outputType: "FASTQ summary report, tables, or QC plots",
  fileInput: {
    accept: ".fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
    dropLabel: "Drop FASTQ or FASTQ.GZ here",
    directFileOption: "fastqInputFile"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "fastq-summary", columns: fastqSummaryColumns },
      { id: "perBaseQuality", kind: "table", schema: "fastq-per-base-quality", columns: fastqPerBaseQualityColumns },
      { id: "lengthDistribution", kind: "table", schema: "fastq-length-distribution", columns: fastqDistributionColumns },
      { id: "gcDistribution", kind: "table", schema: "fastq-gc-distribution", columns: fastqDistributionColumns },
      { id: "readQualityDistribution", kind: "table", schema: "fastq-read-quality-distribution", columns: fastqDistributionColumns },
      { id: "nDistribution", kind: "table", schema: "fastq-n-distribution", columns: fastqDistributionColumns },
      { id: "plot", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fastq-summary/run.js",
  workerExport: "runFastqSummary",
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
            { value: "single", label: "Single-end" },
            { value: "paired", label: "Paired-end" }
          ],
          help: "Paired-end mode summarizes matching R1/R2 FASTQ files together."
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
      example: `@qc_pair_1/1
ACGTACGTACGTACGT
+
IIIIIIIIIIIIIIII
@qc_pair_2/1
TTTTCCCCAAAAGGGG
+
HHHHHHHHHHHHHHHH`,
      visibleWhen: { option: "readLayout", value: "paired" },
      help: "First mate FASTQ or FASTQ.GZ file."
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
      example: `@qc_pair_1/2
TGCATGCATGCATGCA
+
IIIIIIIIIIIIIIII
@qc_pair_2/2
GGGGAAAACCCCTTTT
+
FFFFFFFFFFFFFFFF`,
      visibleWhen: { option: "readLayout", value: "paired" },
      help: "Second mate FASTQ or FASTQ.GZ file."
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "report",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Summary table" },
            { value: "per-base-quality-tsv", label: "Per-base quality table" },
            { value: "length-distribution-tsv", label: "Read length distribution table" },
            { value: "gc-distribution-tsv", label: "Read GC distribution table" },
            { value: "read-quality-distribution-tsv", label: "Read mean quality distribution table" },
            { value: "n-distribution-tsv", label: "Read N distribution table" },
            { value: "quality-svg", label: "Per-base quality plot" },
            { value: "read-quality-svg", label: "Read mean quality plot" },
            { value: "base-composition-svg", label: "Per-base composition plot" },
            { value: "length-svg", label: "Read length plot" },
            { value: "gc-svg", label: "Read GC plot" },
            { value: "n-distribution-svg", label: "Read N distribution plot" }
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
          label: "Maximum reads",
          defaultValue: 100000,
          min: 1,
          max: 10000000,
          help: "Stop after this many reads so a browser-local QC run stays cancellable and bounded."
        },
        {
          id: "maxInputCharacters",
          type: "number",
          label: "Maximum pasted characters",
          defaultValue: 50000000,
          min: 100,
          max: 2000000000,
          help: "Applies to pasted FASTQ text. Use the FASTQ file control for chunked worker-side reading."
        },
        {
          id: "maxPerBasePositions",
          type: "number",
          label: "Maximum per-base positions",
          defaultValue: 1000,
          min: 1,
          max: 100000,
          help: "Per-base quality and composition tables/plots are capped at this read position. Overall read-length and quality summaries still use the processed reads."
        },
        {
          id: "maxDuplicateSequences",
          type: "number",
          label: "Maximum unique sequences tracked",
          defaultValue: 50000,
          min: 0,
          max: 1000000,
          help: "Caps exact duplicate and overrepresented-read tracking, which can otherwise grow with every unique read."
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Quality scores are interpreted as Phred+33. When a local FASTQ or FASTQ.GZ file is selected, decompression and summarization happen chunk by chunk inside the worker."
    }
  ]
};
