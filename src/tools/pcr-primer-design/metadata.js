import { pcrPrimerDesignTableColumns } from "../../core/pcr-primer-design.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const pcrPrimerDesignMetadata = {
  id: "pcr-primer-design",
  name: "PCR Primer Design",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "primer", "coordinates", "statistics"],
  summary: "Design ranked PCR primer pairs for local DNA templates with transparent browser scoring and Primer3-checked fixtures.",
  inputType: "Template DNA sequence, FASTA records, or GenBank/DDBJ/EMBL template records",
  outputType: "Primer design report, candidate table, primer FASTA, product FASTA, or linear DNA sequence viewer",
  fileInput: {
    dropLabel: "Drop one plain-text template DNA sequence, FASTA records, or GenBank/DDBJ/EMBL template records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "pcr-primer-design", columns: pcrPrimerDesignTableColumns },
      { id: "primerFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "productFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/pcr-primer-design/run.js",
  workerExport: "runPcrPrimerDesign",
  options: [
    {
      id: "designSummary",
      type: "summary-card",
      title: "Preset summary",
      text: "Standard PCR: 200-800 bp products, 18-24 nt primers, Tm around 60 C, GC 40-60%."
    },
    {
      id: "designPreset",
      type: "select",
      label: "Design type",
      defaultValue: "standard-pcr",
      choices: [
        { value: "standard-pcr", label: "Standard PCR" },
        { value: "qpcr-short", label: "qPCR / short amplicon" },
        { value: "colony-screening", label: "Colony PCR / screening" },
        { value: "sequencing-amplicon", label: "Sequencing amplicon" },
        { value: "custom", label: "Custom" }
      ],
      help: "Presets fill the detailed constraints below. Choose Custom to open and edit the full constraint set."
    },
    {
      type: "group",
      label: "Desired product size",
      options: [
        { id: "minProductLength", type: "number", label: "Minimum product length", defaultValue: 200, min: 40, step: 1 },
        { id: "maxProductLength", type: "number", label: "Maximum product length", defaultValue: 800, min: 40, step: 1 }
      ]
    },
    { id: "returnCount", type: "number", label: "Primer pairs to return", defaultValue: 10, min: 1, max: 5000, step: 1, help: "Large candidate tables can be slow to render; keep this modest for normal exploratory use." },
    {
      id: "templateRegions",
      type: "group",
      label: "Template regions",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "targetRegion",
          type: "text",
          label: "Target region",
          defaultValue: "",
          help: "Optional 1-based coordinate range that each returned amplicon must include, for example 140-180. Leave blank to design anywhere."
        },
        {
          id: "excludedRegions",
          type: "textarea",
          label: "Excluded primer-binding regions",
          defaultValue: "",
          help: "Optional comma-, semicolon-, or newline-separated 1-based ranges where primers must not bind, for example 1-40, 210-240."
        }
      ]
    },
    {
      id: "primerLength",
      type: "group",
      label: "Primer length",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "primerMinLength", type: "number", label: "Minimum length", defaultValue: 18, min: 12, max: 40, step: 1 },
        { id: "primerOptLength", type: "number", label: "Optimum length", defaultValue: 20, min: 12, max: 40, step: 1 },
        { id: "primerMaxLength", type: "number", label: "Maximum length", defaultValue: 24, min: 12, max: 40, step: 1 }
      ]
    },
    {
      id: "tmAndGc",
      type: "group",
      label: "Tm and GC",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "primerMinTm", type: "number", label: "Minimum Tm", defaultValue: 57, min: 20, max: 95, step: 0.1 },
        { id: "primerOptTm", type: "number", label: "Optimum Tm", defaultValue: 60, min: 20, max: 95, step: 0.1 },
        { id: "primerMaxTm", type: "number", label: "Maximum Tm", defaultValue: 63, min: 20, max: 95, step: 0.1 },
        { id: "primerMinGc", type: "number", label: "Minimum GC percent", defaultValue: 40, min: 0, max: 100, step: 1 },
        { id: "primerMaxGc", type: "number", label: "Maximum GC percent", defaultValue: 60, min: 0, max: 100, step: 1 }
      ]
    },
    {
      id: "threePrimeAndClamp",
      type: "group",
      label: "3' end and clamp",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "gcClampMin", type: "number", label: "Minimum 3' GC clamp", defaultValue: 1, min: 0, max: 5, step: 1, help: "Counts G/C bases in the final five bases at the primer 3' end." },
        { id: "gcClampMax", type: "number", label: "Maximum 3' GC clamp", defaultValue: 4, min: 0, max: 5, step: 1 },
        { id: "maxThreePrimeComplementRun", type: "number", label: "Maximum 3' complement run", defaultValue: 5, min: 1, max: 20, step: 1 }
      ]
    },
    {
      id: "secondaryStructure",
      type: "group",
      label: "Secondary structure",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxSelfComplementRun", type: "number", label: "Maximum self-complement run", defaultValue: 8, min: 2, max: 20, step: 1 },
        { id: "maxHairpinStem", type: "number", label: "Maximum hairpin stem", defaultValue: 5, min: 1, max: 20, step: 1 }
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome used to count exact binding hits for each returned left and right primer. Hits are reported for interpretation, not treated as automatic failures, because the intended amplicon may also be present in the reference."
    }),
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "report",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Candidate table" },
        { value: "primer-fasta", label: "Primer FASTA" },
        { value: "product-fasta", label: "Product FASTA" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxTemplateLength", type: "number", label: "Maximum template length", defaultValue: 20000, min: 100, step: 100, help: "Current browser primer design enumerates local candidates. Larger templates should be narrowed before design." },
        { id: "maxPairsToEvaluate", type: "number", label: "Maximum evaluated pairs", defaultValue: 250000, min: 1000, step: 1000 },
        {
          id: "maxReferenceRecordLength",
          type: "number",
          label: "Loaded reference record bp limit",
          defaultValue: 500000,
          min: 100,
          step: 100,
          visibleWhen: { option: "referenceGenomeMode", value: "loaded" },
          help: "Maximum loaded FASTA reference-record length scanned for primer binding hits."
        },
        {
          id: "maxIndexedReferenceBases",
          type: "number",
          label: "Indexed reference bp cap",
          defaultValue: 5000000,
          min: 1000,
          max: 50000000,
          step: 100000,
          visibleWhen: { option: "referenceGenomeMode", value: ["indexed", "bgzf"] },
          help: "Total indexed reference bases scanned for primer binding hits."
        }
      ]
    },
    {
      id: "methodsAndCitations",
      type: "group",
      label: "Methods and citations",
      options: [
        {
          id: "methodNote",
          type: "note",
          text: "SMS3 uses transparent browser-side scoring formulas and ranks lower scores first. Primer3 oracle fixtures are used to catch coordinate and candidate-selection regressions; this is not an exact Primer3 reimplementation."
        },
        {
          id: "citationNote",
          type: "note",
          text: "Citations: Wallace RB et al. Nucleic Acids Res. 1979; Marmur J and Doty P. J Mol Biol. 1962; Untergasser et al. Nucleic Acids Res. 2012."
        }
      ]
    }
  ]
};
