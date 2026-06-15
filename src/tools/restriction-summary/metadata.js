import { restrictionEnzymeRecords } from "../../reference-data/restriction-enzymes/records.js";
import {
  getRestrictionEnzymeChoices,
  restrictionSummaryTableColumns
} from "../../core/restriction-tools.js";

export const restrictionSummaryMetadata = {
  id: "restriction-summary",
  name: "Restriction Summary",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "table", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "restriction", "enzyme", "search"],
  summary: "Screen restriction enzymes and summarize cut counts, positions, and fragment sizes.",
  inputType: "DNA sequence, FASTA records, or GenBank/DDBJ/EMBL records",
  outputType: "Restriction summary report, table, text map, site maps",
  fileInput: {
    dropLabel: "Drop one plain-text DNA sequence, FASTA records, or GenBank/DDBJ/EMBL records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq"
  },
  runInWorker: true,
  workerModule: "../tools/restriction-summary/run.js",
  workerExport: "runRestrictionSummary",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "restriction-summary", columns: restrictionSummaryTableColumns },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "enzymeIds",
      type: "select",
      label: "Enzymes to screen",
      help: "Choose the bundled common set or one specific enzyme from the current restriction enzyme reference data.",
      defaultValue: "common",
      choices: [
        { value: "common", label: "Common seed set" },
        ...getRestrictionEnzymeChoices(restrictionEnzymeRecords)
      ]
    },
    {
      id: "topology",
      type: "radio",
      label: "Topology",
      help: "Linear treats sequence ends as fragment ends. Circular treats the last base as connected to the first base when estimating per-enzyme fragment sizes.",
      defaultValue: "linear",
      choices: [
        { value: "linear", label: "Linear" },
        { value: "circular", label: "Circular" }
      ]
    },
    {
      id: "minimumSites",
      type: "number",
      label: "Minimum sites per enzyme",
      help: "Only show enzymes that cut at least this many times in a record.",
      defaultValue: 1,
      min: 0,
      step: 1
    },
    {
      id: "maximumSites",
      type: "number",
      label: "Maximum sites per enzyme",
      help: "Use this to find infrequent cutters, for example enzymes with one to three sites.",
      defaultValue: 3,
      min: 1,
      step: 1
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "report",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Summary table" },
        { value: "text-map", label: "Text annotation map" },
        { value: "svg-map", label: "Restriction site map" },
        { value: "svg-line-map", label: "Single-line site map" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "sourceNote",
      type: "note",
      text:
        "Restriction enzyme records are a small bundled seed set from common Type II enzymes, checked against NEB recognition-specificity listings and REBASE literature. Coordinates are 1-based on the submitted sequence."
    }
  ]
};
