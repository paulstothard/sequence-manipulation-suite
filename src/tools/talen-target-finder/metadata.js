import { applyTalenDesignOptionDefinitions } from "../../core/talen-design-options.js";
import { makeDesignFeatureOptions, designFeaturePreviewLimit } from "../design-feature-options.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
import { talenRvdColumns, talenTargetColumns, talenReferenceHitColumns } from "../../core/talen-design.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const talenTargetFinderMetadata = {
  id: "talen-target-finder",
  name: "TALEN Design / Review",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "RNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "coordinates", "map", "search"],
  summary: "Design and review paired TALEN half-site candidates in local DNA/RNA target sequences, with spacer geometry, 5' base checks, and RVD strings.",
  inputType: "Target DNA/RNA sequence, FASTA records, or GenBank/DDBJ/EMBL target records",
  outputType: "TALEN design report, target table, RVD table, context text, text map, linear target map, or linear DNA sequence viewer",
  fileInput: {
    dropLabel: "Drop one plain-text DNA/RNA target sequence, FASTA records, or GenBank/DDBJ/EMBL target records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq"
  },
  runInWorker: true,
  workerModule: "../tools/talen-target-finder/run.js",
  workerExport: "runTalenTargetFinder",
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
      { id: "referenceHits", kind: "table", schema: "talen-reference-hits", columns: talenReferenceHitColumns },
      { id: "table", kind: "table", schema: "talen-target-pairs", columns: talenTargetColumns },
      { id: "rvdTable", kind: "table", schema: "talen-rvd-repeats", columns: talenRvdColumns },
      { id: "contextText", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: applyTalenDesignOptionDefinitions([
    ...makeFastaSourceInputOptions({ includeIndexed: false, alphabet: "dna-rna", allowPlainSequence: true, annotatedRecords: true, featurePolicy: "viewer" }),
    makeDesignFeatureOptions("talen"),
    {
      type: "group",
      label: "Target-pair settings",
      options: [
        { id: "minHalfSiteLength", type: "number", label: "Minimum half-site length" },
        { id: "maxHalfSiteLength", type: "number", label: "Maximum half-site length" },
        { id: "minSpacerLength", type: "number", label: "Minimum spacer length" },
        { id: "maxSpacerLength", type: "number", label: "Maximum spacer length" },
        {
          id: "requireFivePrimeT",
          type: "checkbox",
          label: "Require 5' T bases",
          help: "Requires T immediately before the left half-site and A immediately after the right half-site, corresponding to a 5' T for both TAL effectors."
        },
        {
          id: "allowAmbiguousTargets",
          type: "checkbox",
          label: "Allow ambiguous target bases",
          help: "Ambiguous half-sites are reported with uncertain RVD entries and warning flags. Leave off for unambiguous binding sequences."
        },
      ]
    },
    {
      type: "group",
      label: "RVDs",
      options: [
        {
          id: "guanineRvd",
          type: "radio",
          label: "Guanine RVD",
          choices: [
            { value: "NN", label: "NN for G" },
            { value: "NH", label: "NH for G" }
          ],
          help: "NN is a common G-targeting RVD but can also recognize A in some contexts; NH is often used as a more G-specific alternative."
        }
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome used to find paired half-site RVD-code matches across the selected spacer range (NN recognizes G/A; NH matches G). Spacer sequence is unrestricted. Additional mismatches, bulges and cleavage likelihood are not modeled. Hits are reported for interpretation and include intended sites. Search work is bounded at 50 million oriented bases; details at 5000 hits."
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
            { showcase: false, value: "tsv", label: "Target pair table" },
            { showcase: false, value: "rvd-tsv", label: "RVD repeat table", resultView: { kind: "table", streamId: "rvdTable" } },
            { showcase: false, value: "reference-tsv", label: "Reference half-site matches", resultView: { kind: "table", streamId: "referenceHits" } },
            { showcase: false, value: "analysis-json", label: "Complete analysis JSON" },
            { showcase: false, value: "context-text", label: "Context text" },
            { showcase: false, value: "halfsite-fasta", label: "Half-site FASTA" },
            { showcase: false, value: "text-map", label: "Text annotation map" },
            { showcase: "linear-target-map", value: "svg-map", label: "Linear target map" },
            { showcase: "linear-dna-viewer", value: "interactive-viewer", label: "Linear DNA sequence viewer" }
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
        { id: "maxPairsPerRecord", type: "number", label: "Pairs per record",
          help: "Only the top-ranked target pairs up to this count are returned for each record." },
        {
          id: "mapMaxPairsPerRecord",
          type: "number",
          label: "Map pairs per record",
          visibleWhen: { option: "outputFormat", value: ["text-map", "svg-map"] },
          help: "Limits how many ranked target pairs are drawn in dense visual maps. The target pair table can still report more candidates."
        },
        {
          id: "maxRecordLength",
          type: "number",
          label: "Maximum record length",
          help: "Maximum target-record length scanned."
        },
        {
          id: "maxCandidateWindows",
          type: "number",
          label: "Maximum candidate windows",
          help: "Upper bound on half-site/spacer combinations evaluated per record."
        },
        {
          id: "maxReferenceRecordLength",
          type: "number",
          label: "Loaded reference record bp limit",
          visibleWhen: { option: "referenceGenomeMode", value: "loaded" },
          help: "Maximum loaded FASTA reference-record length scanned for TALEN target hits."
        },
        {
          id: "maxIndexedReferenceBases",
          type: "number",
          label: "Indexed reference bp cap",
          visibleWhen: { option: "referenceGenomeMode", value: ["indexed", "bgzf"] },
          help: "Total indexed reference bases scanned for TALEN target hits."
        },
        designFeaturePreviewLimit
      ]
    },
    {
      id: "scopeNote",
      type: "note",
      text: "This is a local sequence review aid, not an experimentally validated TALEN activity model. It reports candidate geometry, 5-prime base compatibility, simple RVD strings, and review flags so designs can be checked before ordering. Spacer limits must match your TALEN backbone/linker. Each physical pair is reported once with the left monomer on + and the right monomer on −."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nTALE DNA-recognition code: Boch and Bonas 2010; Bogdanove and Voytas 2011.\n\nTALEN design/use example: Miller et al. 2011."
    }
  ])
};
