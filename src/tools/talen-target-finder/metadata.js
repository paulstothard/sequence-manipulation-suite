import { talenRvdColumns, talenTargetColumns } from "../../core/talen-design.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const talenTargetFinderMetadata = {
  id: "talen-target-finder",
  name: "TALEN Design / Review",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "RNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "coordinates", "map", "search"],
  summary: "Design and review paired TALEN half-site candidates in local DNA/RNA target sequences, with spacer geometry, 5' base checks, and simple RVD strings.",
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
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "talen-target-pairs", columns: talenTargetColumns },
      { id: "rvdTable", kind: "table", schema: "talen-rvd-repeats", columns: talenRvdColumns },
      { id: "contextText", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Target-pair settings",
      options: [
        { id: "minHalfSiteLength", type: "number", label: "Minimum half-site length", defaultValue: 15, min: 10, max: 25, step: 1 },
        { id: "maxHalfSiteLength", type: "number", label: "Maximum half-site length", defaultValue: 18, min: 10, max: 25, step: 1 },
        { id: "minSpacerLength", type: "number", label: "Minimum spacer length", defaultValue: 14, min: 5, max: 40, step: 1 },
        { id: "maxSpacerLength", type: "number", label: "Maximum spacer length", defaultValue: 20, min: 5, max: 40, step: 1 },
        {
          id: "requireFivePrimeT",
          type: "checkbox",
          label: "Require 5' T bases",
          defaultValue: true,
          help: "Requires T immediately before the left half-site and A immediately after the right half-site, corresponding to a 5' T for both TAL effectors."
        },
        {
          id: "allowAmbiguousTargets",
          type: "checkbox",
          label: "Allow ambiguous target bases",
          defaultValue: false,
          help: "Ambiguous half-sites are reported with uncertain RVD entries and warning flags. Leave off for order-ready review tables."
        },
        { id: "maxPairsPerRecord", type: "number", label: "Pairs per record", defaultValue: 100, min: 1, max: 2000, step: 1 }
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
          defaultValue: "NN",
          choices: [
            { value: "NN", label: "NN for G" },
            { value: "NH", label: "NH for G" }
          ],
          help: "NN is a common G-targeting RVD but can also recognize A in some contexts; NH is often used as a more G-specific alternative."
        }
      ]
    },
    makeOptionalReferenceGenomeOptionGroup({
      help: "Optional local reference genome used to count exact full target-pair hits for each returned TALEN candidate. Hits are reported for interpretation, not treated as automatic failures, because the intended target may also be present in the reference."
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
            { value: "tsv", label: "Target pair table" },
            { value: "rvd-tsv", label: "RVD repeat table" },
            { value: "context-text", label: "Context text" },
            { value: "halfsite-fasta", label: "Half-site FASTA" },
            { value: "text-map", label: "Text annotation map" },
            { value: "svg-map", label: "Linear target map" },
            { value: "interactive-viewer", label: "Linear DNA sequence viewer" }
          ]
        },
        { id: "contextBases", type: "number", label: "Context bases", defaultValue: 20, min: 0, max: 200, step: 1, visibleWhen: { option: "outputFormat", value: "context-text" } },
        {
          id: "mapMaxPairsPerRecord",
          type: "number",
          label: "Map pairs per record",
          defaultValue: 30,
          min: 1,
          max: 500,
          step: 1,
          visibleWhen: { option: "outputFormat", value: ["text-map", "svg-map"] },
          help: "Limits how many ranked target pairs are drawn in dense visual maps. The target pair table can still report more candidates."
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
          id: "maxRecordLength",
          type: "number",
          label: "Maximum record length",
          defaultValue: 200000,
          min: 100,
          step: 100,
          help: "Maximum target-record length scanned. Larger genomic searches need more specialized indexed or chunked approaches."
        },
        {
          id: "maxCandidateWindows",
          type: "number",
          label: "Maximum candidate windows",
          defaultValue: 2000000,
          min: 1000,
          step: 1000,
          help: "Upper bound on half-site/spacer combinations evaluated per record to keep broad searches cancellable."
        },
        {
          id: "maxReferenceRecordLength",
          type: "number",
          label: "Loaded reference record bp limit",
          defaultValue: 500000,
          min: 100,
          step: 100,
          visibleWhen: { option: "referenceGenomeMode", value: "loaded" },
          help: "Maximum loaded FASTA reference-record length scanned for TALEN target hits."
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
          help: "Total indexed reference bases scanned for TALEN target hits."
        }
      ]
    },
    {
      id: "scopeNote",
      type: "note",
      text: "This is a local sequence review aid, not an experimentally validated TALEN activity model. It reports candidate geometry, 5-prime base compatibility, simple RVD strings, and review flags so designs can be checked before ordering."
    },
    {
      id: "citationNote",
      type: "note",
      text: "Citations: Boch and Bonas, Annu Rev Phytopathol 2010; Bogdanove and Voytas, Science 2011; Miller et al., Nat Biotechnol 2011."
    }
  ]
};
