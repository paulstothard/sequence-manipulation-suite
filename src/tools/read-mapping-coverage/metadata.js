import {
  readMappingAlignmentColumns,
  readMappingCoverageColumns
} from "../../core/read-mapping-coverage.js";

export const readMappingCoverageMetadata = {
  id: "read-mapping-coverage",
  name: "Read Mapping Coverage",
  category: "High-Throughput Sequencing",
  tags: ["DNA", "RNA", "FASTA", "FASTQ", "alignment", "coordinates", "plot"],
  summary: "Map local DNA/RNA reads to reference sequences and summarize read coverage.",
  inputType: "Reference DNA/RNA sequence or FASTA records plus single-end or paired FASTQ/FASTQ.GZ reads; FASTA reads are accepted when qualities are unavailable",
  outputType: "Coverage plot, mapped read table, coverage table, coverage viewer, or summary report",
  splitInput: {
    separator: "---",
    panels: [
      {
        id: "reference",
        label: "Reference",
        dropLabel: "Drop one reference DNA/RNA sequence or FASTA records here",
        accept: ".txt,.fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz,.gz"
      },
      {
        id: "reads",
        label: "Reads",
        dropLabel: "Drop FASTQ or FASTQ.GZ reads here",
        description: "Use FASTQ/FASTQ.GZ for real read data. FASTA reads are accepted when qualities are unavailable.",
        accept: ".fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz,.fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt"
      }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/read-mapping-coverage/run.js",
  workerExport: "runReadMappingCoverage",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "plot", kind: "text", mediaType: "image/svg+xml", label: "Coverage plot" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer", label: "Coverage viewer" },
      {
        id: "table",
        kind: "table",
        schema: "read-mapping-alignments",
        label: "Mapped read table",
        columns: readMappingAlignmentColumns
      },
      {
        id: "coverageTable",
        kind: "table",
        schema: "read-mapping-coverage",
        label: "Coverage table",
        columns: readMappingCoverageColumns
      },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
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
          help: "Paired-end mode accepts matching R1/R2 FASTQ or FASTQ.GZ read sets. FASTA reads are accepted when qualities are unavailable."
        }
      ]
    },
    {
      type: "group",
      label: "Mapping",
      options: [
        {
          id: "alignmentEngine",
          type: "radio",
          label: "Alignment method",
          defaultValue: "minimap2",
          choices: [
            { value: "minimap2", label: "Minimap2 read mapping" },
            { value: "exact", label: "Exact-match screen" }
          ],
          help: "Minimap2 is preferred for real read mapping. Select exact-match screening for simple deterministic checks."
        },
        {
          id: "minimap2Preset",
          type: "select",
          label: "Read type",
          defaultValue: "sr",
          choices: [
            { value: "sr", label: "Short reads" },
            { value: "map-ont", label: "Oxford Nanopore reads" },
            { value: "map-pb", label: "PacBio reads" },
            { value: "none", label: "Standard minimap2" }
          ],
          visibleWhen: { option: "alignmentEngine", value: "minimap2" },
          help: "Chooses the minimap2 preset used for mapping. Short reads, Oxford Nanopore reads, and PacBio reads tune minimap2 for those read types; Standard minimap2 runs without a read-type preset."
        },
        {
          id: "minMapq",
          type: "number",
          label: "Minimum MAPQ",
          defaultValue: 0,
          min: 0,
          max: 255,
          step: 1
        },
        {
          id: "minAlignedBases",
          type: "number",
          label: "Minimum aligned bases",
          defaultValue: 20,
          min: 1,
          max: 1000000,
          step: 1
        }
      ]
    },
    {
      type: "group",
      label: "Coverage",
      visibleWhen: {
        option: "outputFormat",
        value: ["coverage-plot", "coverage-table", "interactive-viewer", "summary-report"]
      },
      options: [
        {
          id: "coverageWindowSize",
          type: "number",
          label: "Coverage window size",
          defaultValue: 0,
          min: 0,
          max: 10000000,
          step: 10,
          help: "Use 0 for automatic windowing. SMS3 chooses a window size that keeps the plot readable across all reference records."
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
          defaultValue: "coverage-plot",
          choices: [
            { value: "coverage-plot", label: "Coverage plot" },
            { value: "alignment-table", label: "Mapped read table" },
            { value: "coverage-table", label: "Coverage table" },
            { value: "interactive-viewer", label: "Coverage viewer" },
            { value: "summary-report", label: "Summary report" }
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
          id: "maxReferenceBases",
          type: "number",
          label: "Maximum reference bases",
          defaultValue: 5000000,
          min: 100,
          max: 500000000,
          step: 1000
        },
        {
          id: "maxReads",
          type: "number",
          label: "Maximum reads",
          defaultValue: 100000,
          min: 1,
          max: 10000000,
          step: 1000
        },
        {
          id: "maxReportedAlignments",
          type: "number",
          label: "Maximum mapped read rows",
          defaultValue: 10000,
          min: 1,
          max: 1000000,
          step: 1000
        },
        {
          id: "maxCoverageBins",
          type: "number",
          label: "Maximum coverage windows",
          defaultValue: 800,
          min: 10,
          max: 100000,
          step: 100
        }
      ]
    },
    {
      id: "methodsAndCitations",
      type: "note",
      text: "Uses local minimap2 for read mapping. Select the exact-match screen for small deterministic checks."
    }
  ]
};
