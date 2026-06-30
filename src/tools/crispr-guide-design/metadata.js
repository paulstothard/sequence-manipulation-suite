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
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
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
  options: [
    {
      type: "group",
      label: "PAM model",
      options: [
        {
          id: "pamPreset",
          type: "select",
          label: "PAM model",
          defaultValue: "spcas9-ngg",
          choices: [
            { value: "spcas9-ngg", label: "SpCas9 NGG" },
            { value: "spcas9-ngn", label: "SpCas9 NGN relaxed" },
            { value: "spcas9-nag", label: "SpCas9 NAG alternate" },
            { value: "custom-3prime", label: "Custom 3' PAM" },
            { value: "custom-5prime", label: "Custom 5' PAM" }
          ],
          help: "SpCas9 NGG is the default. Relaxed, alternate, and custom PAMs are review modes and should be validated before ordering guides."
        },
        {
          id: "customPamPattern",
          type: "text",
          label: "Custom PAM",
          defaultValue: "NGG",
          visibleWhen: { option: "pamPreset", value: ["custom-3prime", "custom-5prime"] },
          help: "Use IUPAC DNA letters. For Custom 3' PAM, the guide is upstream of the PAM. For Custom 5' PAM, the guide is downstream of the PAM."
        },
        {
          id: "guideLength",
          type: "number",
          label: "Guide length",
          defaultValue: 20,
          min: 16,
          max: 30,
          step: 1,
          visibleWhen: { option: "pamPreset", value: ["custom-3prime", "custom-5prime"] }
        }
      ]
    },
    {
      type: "group",
      label: "Guide filters",
      options: [
        { id: "minGcPercent", type: "number", label: "Minimum guide GC %", defaultValue: 35, min: 0, max: 100, step: 1 },
        { id: "maxGcPercent", type: "number", label: "Maximum guide GC %", defaultValue: 75, min: 0, max: 100, step: 1 },
        {
          id: "fivePrimeGPolicy",
          type: "radio",
          label: "5' G handling",
          defaultValue: "flag",
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
          defaultValue: false,
          help: "When enabled, IUPAC ambiguity is treated as a possible overlap and flagged in the table."
        },
        { id: "maxCandidatesPerRecord", type: "number", label: "Candidates per record", defaultValue: 50, min: 1, max: 2000, step: 1 }
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome used to count PAM-compatible guide matches for each candidate. Hits are reported for interpretation, not treated as automatic failures, because the intended target may also be present in the reference."
    }),
    {
      type: "group",
      label: "Output",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "report",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Guide table" },
            { value: "offtarget-tsv", label: "Reference-match table" },
            { value: "guide-fasta", label: "Guide RNA FASTA" },
            { value: "context-text", label: "Context text" },
            { value: "text-map", label: "Text annotation map" },
            { value: "svg-map", label: "Linear guide map" },
            { value: "interactive-viewer", label: "Linear DNA sequence viewer" }
          ]
        },
        { id: "contextBases", type: "number", label: "Context bases", defaultValue: 20, min: 0, max: 200, step: 1, visibleWhen: { option: "outputFormat", value: ["context-text"] } },
        { id: "mapMaxCandidatesPerRecord", type: "number", label: "Map candidates per record", defaultValue: 80, min: 1, max: 500, step: 1, visibleWhen: { option: "outputFormat", value: ["text-map", "svg-map"] } }
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
          id: "maxOffTargetMismatches",
          type: "number",
          label: "Maximum mismatches",
          defaultValue: 2,
          min: 0,
          max: 5,
          step: 1,
          help: "Reference hits are ungapped guide-sequence comparisons at PAM-compatible sites."
        },
        {
          id: "maxOffTargetMatchesPerGuide",
          type: "number",
          label: "Rows per guide",
          defaultValue: 25,
          min: 1,
          max: 500,
          step: 1
        },
        {
          id: "maxOffTargetRows",
          type: "number",
          label: "Maximum reference-match rows",
          defaultValue: 1000,
          min: 1,
          max: 10000,
          step: 100
        },
        {
          id: "maxReferenceRecordLength",
          type: "number",
          label: "Loaded reference record bp limit",
          defaultValue: 500000,
          min: 100,
          step: 100,
          help: "Maximum loaded FASTA reference-record length scanned for local reference matches."
        },
        {
          id: "maxIndexedReferenceBases",
          type: "number",
          label: "Indexed reference bp cap",
          defaultValue: 5000000,
          min: 1000,
          max: 50000000,
          step: 100000,
          help: "Total indexed reference bases scanned by the current local mismatch model."
        }
      ]
    },
    {
      id: "referenceScopeNote",
      type: "note",
      visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] },
      text: "Reference hit counting reports ungapped guide matches at PAM-compatible sites in the reference you provide."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nCas9 guide system: Jinek et al. 2012.\n\nMammalian CRISPR-Cas editing examples: Cong et al. 2013; Mali et al. 2013."
    }
  ]
};
