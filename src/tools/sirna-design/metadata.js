import {
  sirnaDesignTableColumns,
  sirnaReferenceMatchColumns
} from "../../core/sirna-design.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const sirnaDesignMetadata = {
  id: "sirna-design",
  name: "siRNA Design",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "RNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "coordinates", "search"],
  summary: "Rank siRNA candidates from DNA/RNA transcript sequences using transparent Reynolds-style and Ui-Tei-style rules, with optional local reference hit counts.",
  inputType: "DNA/RNA transcript sequence, FASTA records, or GenBank/DDBJ/EMBL transcript records",
  outputType: "siRNA design report, candidate table, reference-match table, guide FASTA, or context text",
  fileInput: {
    dropLabel: "Drop one plain-text DNA/RNA transcript sequence, FASTA records, or GenBank/DDBJ/EMBL transcript records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq,.gb,.gbk,.genbank,.embl,.ddbj"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "sirna-design", columns: sirnaDesignTableColumns },
      { id: "offTargetTable", kind: "table", schema: "sirna-reference-matches", columns: sirnaReferenceMatchColumns },
      { id: "guideFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "contextText", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/sirna-design/run.js",
  workerExport: "runSirnaDesign",
  options: [
    {
      type: "group",
      label: "Candidate rules",
      options: [
        { id: "targetLength", type: "number", label: "Target length", defaultValue: 19, min: 19, max: 23, step: 1 },
        { id: "minGcPercent", type: "number", label: "Minimum target GC %", defaultValue: 30, min: 0, max: 100, step: 1 },
        { id: "maxGcPercent", type: "number", label: "Maximum target GC %", defaultValue: 52, min: 0, max: 100, step: 1 },
        { id: "skipFirstBases", type: "number", label: "Skip first bases", defaultValue: 0, min: 0, step: 1, help: "Set this when you want to avoid candidates near the 5' end, for example around the start codon." },
        { id: "maxCandidatesPerRecord", type: "number", label: "Candidates per record", defaultValue: 25, min: 1, max: 1000, step: 1 }
      ]
    },
    {
      type: "group",
      label: "Duplex output",
      options: [
        { id: "includeOverhangs", type: "checkbox", label: "Add 3' overhangs", defaultValue: true },
        { id: "overhang", type: "text", label: "3' overhang", defaultValue: "UU", visibleWhen: { option: "includeOverhangs", value: true } }
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome or transcript set used to count near matches for each siRNA candidate target window. Hits are reported for interpretation, not treated as automatic failures, because the intended target may also be present in the reference."
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
            { value: "tsv", label: "Candidate table" },
            { value: "offtarget-tsv", label: "Reference-match table" },
            { value: "guide-fasta", label: "Guide FASTA" },
            { value: "context-text", label: "Context text" }
          ]
        },
        { id: "contextBases", type: "number", label: "Context bases", defaultValue: 20, min: 0, max: 100, step: 1, visibleWhen: { option: "outputFormat", value: "context-text" } }
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
          help: "Reference hits are ungapped candidate target-window comparisons against the reference."
        },
        {
          id: "maxOffTargetMatchesPerCandidate",
          type: "number",
          label: "Rows per candidate",
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
          defaultValue: 200000,
          min: 100,
          step: 100,
          help: "Maximum loaded FASTA reference-record length scanned for local reference matches."
        },
        {
          id: "maxIndexedReferenceBases",
          type: "number",
          label: "Indexed reference bp cap",
          defaultValue: 1000000,
          min: 1000,
          max: 10000000,
          step: 100000,
          help: "Total indexed reference bases scanned by the current local mismatch model."
        }
      ]
    },
    {
      id: "referenceScopeNote",
      type: "note",
      visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] },
      text: "Reference hit counting reports ungapped candidate target windows matched in the reference you provide, allowing the selected mismatch count."
    },
    {
      id: "methodNote",
      type: "note",
      text: "Assumes each input sequence or flatfile record is the direct/sense transcript or cDNA sequence. DNA is converted to RNA by replacing T with U."
    },
    {
      id: "citationNote",
      type: "note",
      text: "Citations: Reynolds et al. Nat Biotechnol. 2004; Ui-Tei et al. Nucleic Acids Res. 2004."
    }
  ]
};
