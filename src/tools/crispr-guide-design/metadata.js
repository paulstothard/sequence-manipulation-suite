import { applyCrisprGuideDesignOptionDefinitions } from "../../core/crispr-guide-design-options.js";
import { makeDesignFeatureOptions, designFeaturePreviewLimit } from "../design-feature-options.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
import {
  crisprGuideDesignColumns,
  crisprReferenceMatchColumns
} from "../../core/crispr-guide-design.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const crisprGuideDesignMetadata = {
  id: "crispr-guide-design",
  name: "CRISPR Guide Design / Review",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "RNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "coordinates", "map", "search"],
  summary: "Find and review local CRISPR guide candidates for SpCas9-style or custom PAM models, with annotated-target feature context and optional reference hit counts.",
  inputType: "Target DNA/RNA sequence, FASTA records, or GenBank/DDBJ/EMBL target records",
  outputType: "CRISPR guide report, guide table with feature context, reference-match table, guide FASTA, context text, text map, or linear guide map",
  fileInput: {
    dropLabel: "Drop one plain-text DNA/RNA target sequence, FASTA records, or GenBank/DDBJ/EMBL target records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq"
  },
  runInWorker: true,
  workerModule: "../tools/crispr-guide-design/run.js",
  workerExport: "runCrisprGuideDesign",
  workflow: {
    sequenceRecordInput: true,
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "analysis", kind: "text", mediaType: "application/json" },
      { id: "bed", kind: "text", mediaType: "text/plain" },
      { id: "gff3", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "crispr-guide-design", columns: crisprGuideDesignColumns },
      { id: "offTargetTable", kind: "table", schema: "crispr-guide-reference-matches", columns: crisprReferenceMatchColumns },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "guideFasta", kind: "text", mediaType: "text/x-fasta", alphabet: "dna-rna" },
      { id: "contextText", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: applyCrisprGuideDesignOptionDefinitions([
    ...makeFastaSourceInputOptions({ includeIndexed: false, alphabet: "dna-rna", allowPlainSequence: true, annotatedRecords: true, featurePolicy: "viewer" }),
    makeDesignFeatureOptions("crispr"),
    {
      type: "group",
      label: "PAM model",
      options: [
        {
          id: "pamPreset",
          type: "select",
          label: "PAM model",
          choices: [
            { value: "spcas9-ngg", label: "SpCas9 NGG" },
            { value: "spcas9-ngn", label: "SpG NGN" },
            { value: "spcas9-nag", label: "SpCas9 NAG alternate" },
            { value: "custom-3prime", label: "Custom 3' PAM" },
            { value: "custom-5prime", label: "Custom 5' PAM" }
          ],
          help: "SpCas9 NGG is the default. SpG is an engineered nuclease, distinct from wild-type SpCas9. Alternate and custom PAMs are review modes and should be validated before ordering guides."
        },
        {
          id: "customPamPattern",
          type: "text",
          label: "Custom PAM",
          visibleWhen: { option: "pamPreset", value: ["custom-3prime", "custom-5prime"] },
          help: "Use IUPAC DNA letters. For Custom 3' PAM, the guide is upstream of the PAM. For Custom 5' PAM, the guide is downstream of the PAM."
        },
        {
          id: "guideLength",
          type: "number",
          label: "Guide length",
          visibleWhen: { option: "pamPreset", value: ["custom-3prime", "custom-5prime"] }
        }
      ]
    },
    {
      type: "group",
      label: "Guide filters",
      options: [
        { id: "minGcPercent", type: "number", label: "Minimum guide GC %" },
        { id: "maxGcPercent", type: "number", label: "Maximum guide GC %" },
        {
          id: "fivePrimeGPolicy",
          type: "radio",
          label: "5' G handling",
          choices: [
            { value: "flag", label: "Flag missing 5' G" },
            { value: "require", label: "Require 5' G" },
            { value: "off", label: "No preference" }
          ],
          help: "Useful for U6-style expression designs. Flagging lowers the review score; requiring removes candidates that lack a 5' G."
        },
        {
          id: "allowAmbiguousCandidates",
          type: "checkbox",
          label: "Allow ambiguous guide/PAM bases",
          help: "When enabled, IUPAC ambiguity is treated as a possible overlap and flagged in the table."
        },
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome used to count PAM-compatible guide matches for each candidate. Hits are reported for interpretation, not treated as automatic failures, because the intended target may also be present in the reference.",
      additionalOptions: [
        { id: "referencePamPolicy", type: "radio", label: "Reference PAM scope", choices: [{ value: "expanded", label: "Include SpCas9 NGG and NAG" }, { value: "selected", label: "Selected target PAM only" }], help: "NGG/NAG target presets search both PAMs by default. SpG and custom models use their selected PAM. This remains a bounded ungapped search, not a comprehensive specificity model.", visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] } },
        {
          id: "maxOffTargetMismatches",
          type: "number",
          label: "Maximum mismatches",
          visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] },
          help: "Reference hits are ungapped guide-sequence comparisons at PAM-compatible sites."
        }
      ]
    }),
    {
      type: "group",
      label: "Output",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          choices: [
            { showcase: false, value: "report", label: "Summary report" },
            { showcase: false, value: "tsv", label: "Guide table" },
            { showcase: false, value: "offtarget-tsv", label: "Reference-match table", resultView: { kind: "table", streamId: "offTargetTable" } },
            { showcase: false, value: "guide-fasta", label: "Spacer RNA FASTA (no scaffold)" },
            { showcase: false, value: "analysis-json", label: "Complete analysis JSON" },
            { showcase: false, value: "bed", label: "Spacer coordinates BED" },
            { showcase: false, value: "gff3", label: "Guide/PAM GFF3 with sequence" },
            { showcase: false, value: "context-text", label: "Context text" },
            { showcase: false, value: "text-map", label: "Text annotation map" },
            { showcase: "linear-guide-map", value: "svg-map", label: "Linear guide map" },
            { showcase: "linear-dna-viewer", value: "interactive-viewer", label: "Linear DNA sequence viewer" }
          ]
        },
        { id: "contextBases", type: "number", label: "Context bases", visibleWhen: { option: "outputFormat", value: ["context-text"] } }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "maxCandidatesPerRecord", type: "number", label: "Candidates per record",
          help: "Only the top-ranked candidates up to this count are returned for each record." },
        { id: "mapMaxCandidatesPerRecord", type: "number", label: "Map candidates per record",
          visibleWhen: { option: "outputFormat", value: ["text-map", "svg-map"] },
          help: "Limits how many returned candidates are drawn in the map." },
        designFeaturePreviewLimit
      ]
    },
    {
      id: "referenceMatchLimitsGroup",
      type: "group",
      label: "Reference match limits",
      collapsible: true,
      collapsed: true,
      visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] },
      options: [
        {
          id: "maxOffTargetMatchesPerGuide",
          type: "number",
          label: "Rows per guide",
        },
        {
          id: "maxOffTargetRows",
          type: "number",
          label: "Maximum reference-match rows",
        },
        {
          id: "maxReferenceRecordLength",
          type: "number",
          label: "Loaded reference record bp limit",
          help: "Maximum loaded FASTA reference-record length scanned for local reference matches."
        },
        {
          id: "maxIndexedReferenceBases",
          type: "number",
          label: "Indexed reference bp cap",
          help: "Total indexed reference bases scanned by the current local mismatch model."
        }
      ]
    },
    {
      id: "referenceScopeNote",
      type: "note",
      visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] },
      text: "Reference hit counting reports ungapped guide matches at PAM-compatible sites under the stated PAM and mismatch limits. Bulges/indels and other PAMs can be missed. Review scores are uncalibrated sequence heuristics."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nCas9 guide system: Jinek et al. 2012.\n\nMammalian CRISPR-Cas editing examples: Cong et al. 2013; Mali et al. 2013.\n\nSpCas9 alternate PAM specificity: Hsu et al. 2013.\n\nEngineered SpG NGN recognition: Walton et al. 2020."
    }
  ])
};
