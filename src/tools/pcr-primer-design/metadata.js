import { formatPcrPrimerDesignSummary } from '../../app/pcr-primer-design-options-model.js';
import { PCR_PRIMER_DESIGN_DEFAULTS, PCR_PRIMER_DESIGN_PRESETS, applyPcrPrimerDesignOptionDefinitions } from "../../core/pcr-primer-design-options.js";
import { makeDesignFeatureOptions, designFeaturePreviewLimit } from "../design-feature-options.js";
import { pcrPrimerDesignTableColumns } from "../../core/pcr-primer-design.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const pcrPrimerDesignMetadata = {
  id: "pcr-primer-design",
  name: "PCR Primer Design",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "raw", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "primer", "coordinates", "statistics"],
  summary: "Design and rank PCR primer pairs for selected sequences, regions, or annotated features, with adjustable primer constraints and optional reference checks.",
  inputType: "Template DNA sequence, FASTA records, GenBank/DDBJ/EMBL records, or GFF3/GTF/BED annotations with FASTA",
  outputType: "Primer design report, candidate table, primer FASTA, product FASTA, analysis JSON, or linear/circular DNA sequence viewer",
  splitInput: {
    workspaceSourcePanel: true,
    panels: [{ id: "template", label: "Template sequences", dropLabel: "Drop one plain-text template DNA sequence or FASTA records here", accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq" }]
  },
  fileInput: {
    dropLabel: "Drop one plain-text template DNA sequence, FASTA records, or GenBank/DDBJ/EMBL template records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq"
  },
  workflow: {
    sequenceRecordInput: true,
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "analysis", kind: "text", mediaType: "application/json", label: "Analysis JSON", outputFormat: "analysis-json" },
      { id: "table", kind: "table", schema: "pcr-primer-design", columns: pcrPrimerDesignTableColumns },
      { id: "primerFasta", kind: "text", mediaType: "text/x-fasta", outputFormat: "primer-fasta" },
      { id: "productFasta", kind: "text", mediaType: "text/x-fasta", outputFormat: "product-fasta" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/pcr-primer-design/run.js",
  workerExport: "runPcrPrimerDesign",
  options: applyPcrPrimerDesignOptionDefinitions([
    {
      id: "designSummary",
      type: "summary-card",
      title: "Preset summary",
      text: formatPcrPrimerDesignSummary(PCR_PRIMER_DESIGN_DEFAULTS)
    },
    {
      id: "designPreset",
      type: "select",
      label: "Design type",
      choices: [
        { value: "standard-pcr", label: PCR_PRIMER_DESIGN_PRESETS["standard-pcr"].label },
        { value: "qpcr-short", label: PCR_PRIMER_DESIGN_PRESETS["qpcr-short"].label },
        { value: "colony-screening", label: PCR_PRIMER_DESIGN_PRESETS["colony-screening"].label },
        { value: "sequencing-amplicon", label: PCR_PRIMER_DESIGN_PRESETS["sequencing-amplicon"].label },
        { value: "custom", label: "Custom" }
      ],
      help: "Presets fill the detailed constraints below. Choose Custom to open and edit the full constraint set."
    },
    {
      type: "group",
      label: "Desired product size",
      options: [
        { id: "minProductLength", type: "number", label: "Minimum product length" },
        { id: "maxProductLength", type: "number", label: "Maximum product length" }
      ]
    },
    { id: "returnCount", type: "number", label: "Primer pairs to return", help: "Large candidate tables can be slow to render; keep this modest for normal exploratory use." },
    makeDesignFeatureOptions("pcr"),
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
          help: "Optional 1-based coordinate range that each returned amplicon must include, for example 140-180. Leave blank to design anywhere."
        },
        {
          id: "excludedRegions",
          type: "textarea",
          label: "Excluded primer-binding regions",
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
        { id: "primerMinLength", type: "number", label: "Minimum length" },
        { id: "primerOptLength", type: "number", label: "Optimum length" },
        { id: "primerMaxLength", type: "number", label: "Maximum length" }
      ]
    },
    {
      id: "tmAndGc",
      type: "group",
      label: "Tm and GC",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "primerMinTm", type: "number", label: "Minimum Tm" },
        { id: "primerOptTm", type: "number", label: "Optimum Tm" },
        { id: "primerMaxTm", type: "number", label: "Maximum Tm" },
        { id: "primerMinGc", type: "number", label: "Minimum GC percent" },
        { id: "primerMaxGc", type: "number", label: "Maximum GC percent" }
      ]
    },
    {
      id: "threePrimeAndClamp",
      type: "group",
      label: "3' end and clamp",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "gcClampMin", type: "number", label: "Minimum 3' GC clamp", help: "Counts G/C bases in the final five bases at the primer 3' end." },
        { id: "gcClampMax", type: "number", label: "Maximum 3' GC clamp" },
        { id: "maxThreePrimeComplementRun", type: "number", label: "Maximum 3' complement run" }
      ]
    },
    {
      id: "secondaryStructure",
      type: "group",
      label: "Secondary structure",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxSelfComplementRun", type: "number", label: "Maximum self-complement run" },
        { id: "maxHairpinStem", type: "number", label: "Maximum hairpin stem" }
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome used to count exact binding hits for each returned left and right primer. Hits are reported for interpretation, not treated as automatic failures, because the intended amplicon may also be present in the reference."
    }),
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      help: "Summary report and Analysis JSON retain settings, search scope and warnings. FASTA exports contain sequences only.",
      choices: [
        { showcase: false, value: "report", label: "Summary report" },
        { showcase: false, value: "analysis-json", label: "Analysis JSON" },
        { showcase: false, value: "tsv", label: "Candidate table" },
        { showcase: false, value: "primer-fasta", label: "Primer FASTA" },
        { showcase: false, value: "product-fasta", label: "Product FASTA" },
        { showcase: "linear-dna-viewer", value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { showcase: "circular-dna-viewer", value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxTemplateLength", type: "number", label: "Maximum template length", help: "Templates above this length are rejected; narrow the template before design." },
        { id: "maxPairsToEvaluate", type: "number", label: "Maximum evaluated pairs" },
        {
          id: "maxReferenceRecordLength",
          type: "number",
          label: "Loaded reference record bp limit",
          visibleWhen: { option: "referenceGenomeMode", value: "loaded" },
          help: "Maximum loaded FASTA reference-record length scanned for primer binding hits."
        },
        {
          id: "maxIndexedReferenceBases",
          type: "number",
          label: "Indexed reference bp cap",
          visibleWhen: { option: "referenceGenomeMode", value: ["indexed", "bgzf"] },
          help: "Total indexed reference bases scanned for primer binding hits."
        },
        designFeaturePreviewLimit
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
          text: "References:\n\nWallace rule Tm: Wallace et al. 1979.\n\nMarmur-Doty Tm approximation: Marmur and Doty 1962.\n\nPrimer3 oracle comparisons: Untergasser et al. 2012."
        }
      ]
    }
  ])
};
