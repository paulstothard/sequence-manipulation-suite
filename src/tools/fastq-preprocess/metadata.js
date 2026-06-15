import { fastqPreprocessSummaryColumns } from "../../core/fastq-preprocess.js";

export const fastqPreprocessMetadata = {
  id: "fastq-preprocess",
  name: "FASTQ Quality Trimmer",
  category: "High-Throughput Sequencing",
  tags: ["DNA", "FASTQ", "cleaning"],
  summary: "Trim low-quality FASTQ read tails and filter reads by quality, length, and N content.",
  inputType: "Single-end FASTQ text/file or paired FASTQ files",
  outputType: "Trimmed FASTQ, paired FASTQ, summary table, or trimming report",
  runtime: {
    browserBioWasm: { required: true, tool: "fastp" }
  },
  fileInput: {
    accept: ".fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
    dropLabel: "Drop FASTQ or FASTQ.GZ here",
    directFileOption: "fastqInputFile"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fastq", kind: "text", mediaType: "text/x-fastq", label: "Trimmed reads" },
      { id: "read1Fastq", kind: "text", mediaType: "text/x-fastq", label: "Trimmed R1 reads" },
      { id: "read2Fastq", kind: "text", mediaType: "text/x-fastq", label: "Trimmed R2 reads" },
      { id: "interleavedFastq", kind: "text", mediaType: "text/x-fastq", label: "Interleaved trimmed read pairs" },
      { id: "table", kind: "table", schema: "fastq-preprocess-summary", columns: fastqPreprocessSummaryColumns, label: "Summary table" },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fastq-preprocess/run.js",
  workerExport: "runFastqPreprocess",
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
          help: "Paired-end mode trims matching R1/R2 FASTQ files together and keeps mate outputs separate."
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
      example: `@trim_pair_1/1
ACGTACGTACGTACGTACGTACGTACGTACGT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@trim_pair_2/1
TTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGG
+
IIIIIIIIIIIIIIIIIIIIIIIIIIII!!!!`,
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
      example: `@trim_pair_1/2
TGCATGCATGCATGCATGCATGCATGCATGCA
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@trim_pair_2/2
GGGGAAAACCCCTTTTGGGGAAAACCCCTTTT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIII!!!!`,
      visibleWhen: { option: "readLayout", value: "paired" },
      help: "Second mate FASTQ or FASTQ.GZ file."
    },
    {
      type: "group",
      label: "Read trimming and filters",
      options: [
        {
          id: "qualityCutoff",
          type: "number",
          label: "Quality cutoff",
          defaultValue: 20,
          min: 2,
          max: 40,
          help: "Bases below this Phred quality are treated as low quality. Tail trimming removes low-quality bases from the 3' end."
        },
        {
          id: "maxLowQualityPercent",
          type: "number",
          label: "Maximum low-quality bases %",
          defaultValue: 40,
          min: 0,
          max: 100,
          step: 1,
          help: "Discard reads when more than this percentage of retained bases are below the quality cutoff."
        },
        {
          id: "minimumLength",
          type: "number",
          label: "Minimum retained length",
          defaultValue: 30,
          min: 1,
          max: 10000
        },
        {
          id: "maximumNCount",
          type: "number",
          label: "Maximum N bases per read",
          defaultValue: 5,
          min: 0,
          max: 1000
        },
        {
          id: "trimTailLowQuality",
          type: "checkbox",
          label: "Trim low-quality read tails",
          defaultValue: true
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
          defaultValue: "report",
          choices: [
            { value: "report", label: "Trimming report", always: true },
            { value: "table", label: "Summary table", always: true },
            { value: "fastq", label: "Trimmed FASTQ", dependsOnValue: "single" },
            { value: "interleaved-fastq", label: "Interleaved paired FASTQ", dependsOnValue: "paired" },
            { value: "read1-fastq", label: "Read 1 trimmed FASTQ", dependsOnValue: "paired" },
            { value: "read2-fastq", label: "Read 2 trimmed FASTQ", dependsOnValue: "paired" }
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
          max: 10000000
        },
        {
          id: "maxInputBases",
          type: "number",
          label: "Maximum input bases",
          defaultValue: 100000000,
          min: 100,
          max: 2000000000
        },
        {
          id: "maxInputBytes",
          type: "number",
          label: "Maximum uploaded file bytes",
          defaultValue: 200000000,
          min: 100,
          max: 4000000000,
          help: "Reject larger local files before starting a worker run. This keeps browser-local trimming bounded; use command-line tools for production-scale FASTQ preprocessing."
        }
      ]
    },
    {
      id: "methodsAndCitations",
      type: "note",
      text: "Uses local fastp quality trimming and filtering. Adapter trimming is not enabled in this tool."
    }
  ]
};
