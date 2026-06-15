import {
  MAX_GENOME_COMPARISON_POSTER_COMPARISONS,
  genomeComparisonBlockColumns,
  genomeComparisonSummaryColumns
} from "../../core/genome-comparison-poster.js";

const plotOutputFormats = ["linear-plot", "wrapped-plot", "circular-plot", "spiral-plot", "loom-plot"];

export const genomeComparisonPosterMetadata = {
  id: "genome-comparison-poster",
  name: "Genome Comparison Poster",
  category: "Viewers & Figures",
  tags: ["DNA", "FASTA", "alignment", "coordinates", "map", "plot"],
  summary: `Compare one reference genome with up to ${MAX_GENOME_COMPARISON_POSTER_COMPARISONS} comparison genomes and draw Genome Artistry-style block posters or multi-genome loom ribbon figures.`,
  inputType: `Reference genome FASTA section and up to ${MAX_GENOME_COMPARISON_POSTER_COMPARISONS} comparison genome FASTA sections`,
  outputType: "Genome comparison plot, alignment block table, genome summary table, or summary report",
  splitInput: {
    separator: "---",
    allowAdd: true,
    addLabel: "Add comparison genome",
    maxPanels: MAX_GENOME_COMPARISON_POSTER_COMPARISONS + 1,
    repeatFromIndex: 1,
    panels: [
      {
        id: "reference",
        label: "Reference genome",
        description: "One reference genome. Multi-record FASTA is treated as contigs of the same reference genome.",
        dropLabel: "Drop FASTA records for the reference genome here",
        accept: ".fa,.fasta,.fna,.txt",
        multipleFiles: true
      },
      {
        id: "comparison-1",
        label: "Comparison genome 1",
        description: `One poster row or ring. Multi-record FASTA is treated as contigs of this comparison genome. Up to ${MAX_GENOME_COMPARISON_POSTER_COMPARISONS} comparison genomes can be included.`,
        dropLabel: "Drop FASTA records for one comparison genome here",
        accept: ".fa,.fasta,.fna,.txt",
        multipleFiles: true
      }
    ],
    additionalPanelTemplate: {
      idPrefix: "comparison",
      label: "Comparison genome",
      description: `One poster row or ring. Multi-record FASTA is treated as contigs of this comparison genome. Up to ${MAX_GENOME_COMPARISON_POSTER_COMPARISONS} comparison genomes can be included.`,
      dropLabel: "Drop FASTA records for one comparison genome here",
      accept: ".fa,.fasta,.fna,.txt",
      multipleFiles: true
    }
  },
  runInWorker: true,
  workerModule: "../tools/genome-comparison-poster/run.js",
  workerExport: "runGenomeComparisonPoster",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "plot", kind: "text", mediaType: "image/svg+xml", label: "Genome comparison plot" },
      {
        id: "table",
        kind: "table",
        schema: "genome-comparison-blocks",
        label: "Alignment block table",
        columns: genomeComparisonBlockColumns
      },
      {
        id: "summaryTable",
        kind: "table",
        schema: "genome-comparison-summary",
        label: "Genome summary table",
        columns: genomeComparisonSummaryColumns
      },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "alignmentSetup",
      type: "group",
      label: "Alignment setup",
      options: [
        {
          id: "alignmentEngine",
          type: "radio",
          label: "Alignment method",
          defaultValue: "minimap2",
          choices: [
            { value: "minimap2", label: "Minimap2 whole-genome alignment" },
            { value: "exact", label: "SMS3 local shared-block screen" }
          ],
          help: "Minimap2 is preferred for real genome comparisons. The local screen is deterministic and useful for examples, smoke tests, and small artificial inputs."
        },
        {
          id: "minimap2Preset",
          type: "select",
          label: "Minimap2 preset",
          defaultValue: "none",
          choices: [
            { value: "none", label: "Standard minimap2" },
            { value: "asm5", label: "Assembly comparison, close genomes" },
            { value: "asm10", label: "Assembly comparison, moderate divergence" },
            { value: "asm20", label: "Assembly comparison, higher divergence" }
          ],
          visibleWhen: { option: "alignmentEngine", value: "minimap2" },
          help: "The assembly presets adjust minimap2 seeding for whole-genome assembly-to-reference comparisons. The standard setting uses minimap2 without an assembly preset."
        },
        {
          id: "includeReverseComplement",
          type: "checkbox",
          label: "Show reverse-complement blocks",
          defaultValue: true
        }
      ]
    },
    {
      id: "posterDesign",
      type: "group",
      label: "Plot design",
      options: [
        {
          id: "loomColorMode",
          type: "radio",
          label: "Loom coloring",
          defaultValue: "reference",
          choices: [
            { value: "reference", label: "Reference position paint" },
            { value: "identity", label: "Identity color scale" }
          ],
          visibleWhen: { option: "outputFormat", value: "loom-plot" },
          help: "Reference position paint colors reference contigs, or even reference intervals when the reference is one contiguous sequence, and carries those colors into each comparison genome through alignment ribbons. Identity coloring colors ribbons by percent identity instead."
        },
        {
          id: "wrappedSections",
          type: "number",
          label: "Wrapped sections",
          defaultValue: 8,
          min: 1,
          max: 40,
          step: 1,
          visibleWhen: { option: "outputFormat", value: "wrapped-plot" },
          help: "For wrapped linear plots, split the reference into this many coordinate sections. More sections make each section shorter and rows thinner."
        },
        {
          id: "alignmentBlockStyle",
          type: "radio",
          label: "Block style",
          defaultValue: "standard",
          choices: [
            { value: "standard", label: "Smooth blocks" },
            { value: "fragmented", label: "Fragmented blocks" }
          ],
          visibleWhen: { option: "alignmentEngine", value: "minimap2" },
          help: "Smooth blocks keep longer minimap2 chains. Fragmented blocks use tighter chaining so similar regions break into shorter segments, matching Genome Artistry's textured poster mode."
        },
        {
          id: "sortOrder",
          type: "select",
          label: "Comparison order",
          defaultValue: "divergence",
          choices: [
            { value: "divergence", label: "Divergence" },
            { value: "similarity", label: "Similarity" },
            { value: "input", label: "Input order" }
          ],
          help: "Divergence places less similar comparison genomes first; similarity places the closest comparison genomes first; input order preserves the pasted FASTA order."
        },
        {
          id: "showAxis",
          type: "checkbox",
          label: "Show coordinate axis",
          defaultValue: false,
          visibleWhen: { option: "outputFormat", value: plotOutputFormats },
          help: "Art poster layouts omit coordinate axes by default. Turn this on when approximate reference positions should be visible in the figure."
        },
        {
          id: "showGenomeLabels",
          type: "checkbox",
          label: "Show sequence names",
          defaultValue: true,
          visibleWhen: { option: "outputFormat", value: plotOutputFormats },
          help: "Labels the reference and comparison genomes directly in layouts where space allows; circular plots use the numbered comparison-track key."
        },
        {
          id: "colorMode",
          type: "radio",
          label: "Identity color scale",
          defaultValue: "adaptive",
          choices: [
            { value: "adaptive", label: "Adaptive to shown blocks" },
            { value: "fixed", label: "Fixed 0-100% identity" }
          ],
          visibleWhen: { option: "outputFormat", value: plotOutputFormats },
          help: "Adaptive color uses the identity range among the displayed alignment blocks. Fixed color uses the full 0-100% identity scale for easier comparison across runs. Loom figures use this only when Loom coloring is set to identity."
        },
        {
          id: "colorScheme",
          type: "select",
          label: "Color scheme",
          defaultValue: "magma-ocean",
          choices: [
            { value: "magma-ocean", label: "Magma / ocean" },
            { value: "viridis", label: "Viridis" },
            { value: "cividis", label: "Cividis" },
            { value: "sunset", label: "Sunset" },
            { value: "blue-gold", label: "Blue / gold" }
          ],
          visibleWhen: { option: "outputFormat", value: plotOutputFormats },
          help: "Chooses the identity-color palette for comparison blocks. Reverse-complement blocks use a paired variant of the same scheme."
        },
        {
          id: "showLegend",
          type: "checkbox",
          label: "Show legend",
          defaultValue: false,
          visibleWhen: { option: "outputFormat", value: plotOutputFormats },
          help: "Most Genome Artistry-style posters leave legends out of the figure. Loom reference-color figures always include a compact color key; identity-colored loom figures use this option for the identity scale."
        }
      ]
    },
    {
      id: "blockFilters",
      type: "group",
      label: "Block filters",
      options: [
        {
          id: "minIdentityPercent",
          type: "number",
          label: "Minimum identity %",
          defaultValue: 70,
          min: 0,
          max: 100,
          step: 1
        },
        {
          id: "minBlockLength",
          type: "number",
          label: "Minimum block length",
          defaultValue: 40,
          min: 6,
          max: 1000000,
          step: 10
        },
        {
          id: "minMapq",
          type: "number",
          label: "Minimum MAPQ",
          defaultValue: 0,
          min: 0,
          max: 255,
          step: 1,
          visibleWhen: { option: "alignmentEngine", value: "minimap2" },
          help: "Filters minimap2 alignment blocks by mapping quality."
        }
      ]
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "circular-plot",
      choices: [
        { value: "linear-plot", label: "Linear genome comparison plot" },
        { value: "wrapped-plot", label: "Wrapped linear genome comparison plot" },
        { value: "circular-plot", label: "Circular genome comparison plot" },
        { value: "spiral-plot", label: "Spiral genome comparison plot" },
        { value: "loom-plot", label: "Loom ribbon genome comparison plot" },
        { value: "blocks-table", label: "Alignment block table" },
        { value: "summary-table", label: "Genome summary table" },
        { value: "report", label: "Summary report" }
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
          id: "seedSize",
          type: "number",
          label: "Exact-screen seed size",
          defaultValue: 14,
          min: 6,
          max: 200,
          step: 1,
          help: "Only used when the exact shared-block screen is selected."
        },
        {
          id: "maxBlocks",
          type: "number",
          label: "Maximum alignment blocks",
          defaultValue: 5000,
          min: 1,
          max: 1000000,
          step: 100
        },
        {
          id: "maxReferenceLength",
          type: "number",
          label: "Maximum reference length",
          defaultValue: 15000000,
          min: 100,
          max: 500000000,
          step: 100000
        },
        {
          id: "maxComparisonLength",
          type: "number",
          label: "Maximum comparison length",
          defaultValue: 15000000,
          min: 100,
          max: 500000000,
          step: 100000
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Uses local minimap2 for whole-genome alignment. Select the exact shared-block screen for small deterministic checks."
    }
  ]
};
