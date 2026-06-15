import { genomicIntervalOperationColumns } from "../../core/genomic-interval-operations.js";

export const genomicIntervalOperationsMetadata = {
  id: "genomic-interval-operations",
  name: "BED/GFF/VCF Interval Operations",
  category: "High-Throughput Sequencing",
  tags: ["DNA", "RNA", "BED", "GFF", "GTF", "VCF", "annotation", "coordinates"],
  summary: "Compare genomic interval sets to find overlaps, remove masked regions, merge nearby intervals, or locate nearest features and variants.",
  inputType: "Two BED, GFF/GTF, or VCF interval sets",
  outputType: "Interval comparison table, BED intervals, or summary report",
  splitInput: {
    separator: "---",
    panels: [
      {
        id: "query",
        label: "Intervals to analyze",
        dropLabel: "Drop BED, GFF/GTF, or VCF intervals to analyze here",
        accept: ".bed,.gff,.gff3,.gtf,.vcf,.txt",
        placeholder: "Paste variants, peaks, windows, or intervals to analyze here."
      },
      {
        id: "reference",
        label: "Features or intervals to compare",
        dropLabel: "Drop BED, GFF/GTF, or VCF features or intervals here",
        accept: ".bed,.gff,.gff3,.gtf,.vcf,.txt",
        placeholder: "Paste genes, features, masks, variants, or intervals here. Merge only uses the intervals to analyze."
      }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      {
        id: "table",
        kind: "table",
        schema: "genomic-interval-operations",
        label: "Interval table",
        columns: genomicIntervalOperationColumns
      },
      { id: "bed", kind: "text", mediaType: "text/plain", label: "BED intervals" },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/genomic-interval-operations/run.js",
  workerExport: "runGenomicIntervalOperations",
  options: [
    {
      type: "group",
      label: "Question",
      options: [
        {
          id: "operation",
          type: "radio",
          label: "Question to answer",
          defaultValue: "intersect",
          choices: [
            { value: "intersect", label: "Which analyzed intervals overlap the compare set?" },
            { value: "subtract", label: "What remains after removing the compare set?" },
            { value: "merge", label: "Which analyzed intervals merge together?" },
            { value: "nearest", label: "What is the nearest compare interval for each analyzed interval?" }
          ],
          help: "Intersect, subtract, and nearest compare the intervals to analyze against the compare set. Merge combines nearby intervals from the analyze set and ignores the compare set."
        }
      ]
    },
    {
      type: "group",
      label: "Computation",
      options: [
        {
          id: "intervalEngine",
          type: "radio",
          label: "Computation engine",
          defaultValue: "bedtools",
          choices: [
            { value: "bedtools", label: "bedtools-compatible engine" },
            { value: "sms3", label: "SMS3 interval engine" }
          ],
          help: "Browser runs use the bundled local bedtools runtime for the bedtools-compatible engine. Select SMS3 interval engine for simpler deterministic small checks."
        }
      ]
    },
    {
      type: "group",
      label: "File formats",
      options: [
        {
          id: "queryFormat",
          type: "select",
          label: "Analyze-set format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "bed", label: "BED" },
            { value: "gff", label: "GFF3" },
            { value: "gtf", label: "GTF" },
            { value: "vcf", label: "VCF" }
          ]
        },
        {
          id: "referenceFormat",
          type: "select",
          label: "Compare-set format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "bed", label: "BED" },
            { value: "gff", label: "GFF3" },
            { value: "gtf", label: "GTF" },
            { value: "vcf", label: "VCF" }
          ],
          help: "Reference intervals are ignored for merge operations."
        }
      ]
    },
    {
      type: "group",
      label: "Overlap and merge rules",
      options: [
        {
          id: "minOverlapBp",
          type: "number",
          label: "Minimum overlap",
          defaultValue: 1,
          min: 1,
          max: 1000000000,
          step: 1,
          visibleWhen: { option: "operation", value: "intersect" }
        },
        {
          id: "minReciprocalOverlapPercent",
          type: "number",
          label: "Minimum reciprocal overlap %",
          defaultValue: 0,
          min: 0,
          max: 100,
          step: 1,
          visibleWhen: { option: "operation", value: "intersect" }
        },
        {
          id: "mergeGapBp",
          type: "number",
          label: "Merge gap",
          defaultValue: 0,
          min: 0,
          max: 1000000000,
          step: 1,
          visibleWhen: { option: "operation", value: "merge" }
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
          defaultValue: "interval-table",
          choices: [
            { value: "interval-table", label: "Interval comparison table" },
            { value: "bed", label: "BED interval output" },
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
          id: "maxQueryIntervals",
          type: "number",
          label: "Maximum query intervals",
          defaultValue: 100000,
          min: 1,
          max: 10000000,
          step: 1000
        },
        {
          id: "maxReferenceIntervals",
          type: "number",
          label: "Maximum reference intervals",
          defaultValue: 100000,
          min: 1,
          max: 10000000,
          step: 1000
        },
        {
          id: "maxOutputRows",
          type: "number",
          label: "Maximum output rows",
          defaultValue: 50000,
          min: 1,
          max: 5000000,
          step: 1000
        },
        {
          id: "maxInputCharacters",
          type: "number",
          label: "Maximum input characters",
          defaultValue: 20000000,
          min: 1000,
          max: 2000000000,
          step: 100000
        }
      ]
    },
    {
      id: "methodsAndCitations",
      type: "note",
      text: "Common uses: overlap VCF variants with genes, intersect peaks or windows with annotations, subtract blacklist or repeat intervals, merge nearby intervals, or find the nearest feature. BED input is interpreted as 0-based half-open; table and report coordinates are 1-based inclusive."
    }
  ]
};
