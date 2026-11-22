import { applySirnaDesignOptionDefinitions } from "../../core/sirna-design-options.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
import {
  sirnaDesignTableColumns,
  sirnaSeedColumns,
  sirnaReferenceMatchColumns
} from "../../core/sirna-design.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const sirnaDesignMetadata = {
  id: "sirna-design",
  name: "siRNA Design",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "RNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "coordinates", "search"],
  summary: "Rank siRNA candidates from DNA/RNA transcript sequences using Reynolds-style and Ui-Tei-style rules, with optional local reference hit counts.",
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
      { id: "analysis", kind: "text", mediaType: "application/json" },
      { id: "duplexFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "duplexText", kind: "text", mediaType: "text/plain" },
      { id: "seedTable", kind: "table", schema: "sirna-seed-matches", columns: sirnaSeedColumns },
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
  options: applySirnaDesignOptionDefinitions([
    ...makeFastaSourceInputOptions({ includeIndexed: false, alphabet: "dna-rna", allowPlainSequence: true, annotatedRecords: true, featurePolicy: "none" }),
    {
      type: "group",
      label: "Candidate rules",
      options: [
        { id: "targetLength", type: "number", label: "Target length", help: "Sequence-rule scores apply only to 19-nt targets. Longer targets are enumerated in input coordinate order with unavailable scores." },
        { id: "minGcPercent", type: "number", label: "Minimum target GC %" },
        { id: "maxGcPercent", type: "number", label: "Maximum target GC %" },
        { id: "skipFirstBases", type: "number", label: "Skip first bases", help: "Set this when you want to avoid candidates near the 5' end, for example around the start codon." }
      ]
    },
    {
      type: "group",
      label: "Duplex output",
      options: [
        { id: "includeOverhangs", type: "checkbox", label: "Add 3' overhangs" },
        { id: "overhang", type: "text", label: "3' overhang", visibleWhen: { option: "includeOverhangs", value: true } }
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome or transcript set used to count near matches for each siRNA candidate target window. Hits are reported for interpretation, not treated as automatic failures, because the intended target may also be present in the reference.",
      additionalOptions: [
        { id: "referenceSequenceType", type: "radio", label: "Reference sequence type", choices: [{ value: "genomic", label: "Genome / unspecified" }, { value: "transcripts", label: "Sense transcripts" }], help: "Choose mature sense transcripts to screen full-length targets and guide seeds in transcribed orientation. Genomic DNA does not represent splicing. Counts include intended transcripts; UTRs and isoforms are not classified.", visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] } },
        { id: "intendedTranscriptIds", type: "text", label: "Intended transcript IDs", help: "Optional comma/space-separated FASTA identifiers (first header word), including intended isoforms. Exact unique IDs classify seed hits as intended or other. Without intended IDs, or for duplicate reference IDs, hits remain unclassified. No transcript identity is inferred from sequence similarity.", visibleWhen: { option: "referenceSequenceType", value: "transcripts" } },
        { id: "seedLength", type: "radio", label: "Guide seed", choices: [{ value: 7, label: "Positions 2–8 (7 nt)" }, { value: 6, label: "Positions 2–7 (6 nt)" }], help: "Exact seed-complement review only. Seed scanning is limited to 5 million reference bases and 10 million matching candidate/site comparisons; hit details to 5000 rows. Complete counts do not rule out other unintended silencing effects.", visibleWhen: { option: "referenceSequenceType", value: "transcripts" } },
        {
          id: "maxOffTargetMismatches",
          type: "number",
          label: "Maximum mismatches",
          visibleWhen: { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] },
          help: "Reference hits are ungapped candidate target-window comparisons against the reference."
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
            { showcase: false, value: "tsv", label: "Candidate table" },
            { showcase: false, value: "offtarget-tsv", label: "Reference-match table", resultView: { kind: "table", streamId: "offTargetTable" } },
            { showcase: false, value: "seed-tsv", label: "Transcript seed matches", resultView: { kind: "table", streamId: "seedTable" } },
            { showcase: false, value: "analysis-json", label: "Complete analysis JSON" },
            { showcase: false, value: "duplex-fasta", label: "Paired guide/passenger FASTA" },
            { showcase: false, value: "duplex-text", label: "Antiparallel duplex alignment" },
            { showcase: false, value: "guide-fasta", label: "Guide FASTA" },
            { showcase: false, value: "context-text", label: "Context text" }
          ]
        },
        { id: "contextBases", type: "number", label: "Context bases", visibleWhen: { option: "outputFormat", value: "context-text" } }
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
          help: "Only the top-ranked candidates up to this count are returned for each record." }
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
          id: "maxOffTargetMatchesPerCandidate",
          type: "number",
          label: "Rows per candidate"
        },
        {
          id: "maxOffTargetRows",
          type: "number",
          label: "Maximum reference-match rows"
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
      text: "Reference hit counting reports ungapped candidate target windows matched in the reference you provide, allowing the selected mismatch count."
    },
    {
      id: "methodNote",
      type: "note",
      text: "Assumes each input sequence or flatfile record is the direct/sense transcript or cDNA sequence. DNA is converted to RNA by replacing T with U. Scores are uncalibrated counts of seven Reynolds-derived sequence rules (hairpin stability omitted) and four Ui-Tei-derived rules, with a homopolymer penalty. They apply only to 19-nt targets."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nsiRNA design rules: Reynolds et al. 2004; Ui-Tei et al. 2004.\n\nSeed-mediated transcript effects: Jackson et al. 2006."
    }
  ])
};
