import { restrictionEnzymeRecords } from "../../reference-data/restriction-enzymes/records.js";
import {
  getRestrictionEnzymeChoices,
  restrictionFragmentTableColumns
} from "../../core/restriction-tools.js";

const enzymeChoices = [
  { value: "", label: "None" },
  ...getRestrictionEnzymeChoices(restrictionEnzymeRecords)
];

export const restrictionDigestMetadata = {
  id: "restriction-digest",
  name: "Restriction Digest",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "raw", "FASTA", "GenBank", "EMBL", "DDBJ", "restriction", "enzyme", "digest", "map"],
  summary: "Digest DNA with up to three selected restriction enzymes and show fragment sizes, a linear map, or a simulated gel.",
  inputType: "DNA sequence, FASTA records, or GenBank/DDBJ/EMBL records",
  outputType: "Digest report, fragment table, FASTA fragments, fragment map, simulated gel",
  fileInput: {
    dropLabel: "Drop one plain-text DNA sequence, FASTA records, or GenBank/DDBJ/EMBL records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq"
  },
  runInWorker: true,
  workerModule: "../tools/restriction-digest/run.js",
  workerExport: "runRestrictionDigest",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "restriction-fragments", columns: restrictionFragmentTableColumns },
      { id: "fragments", kind: "table", schema: "restriction-fragments", columns: restrictionFragmentTableColumns },
      { id: "fasta", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "gel", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Digest enzymes",
      help: "Choose up to three specific enzymes for the simulated digest.",
      options: [
        {
          id: "enzyme1",
          type: "select",
          label: "Enzyme 1",
          defaultValue: "ecori",
          choices: enzymeChoices.filter((choice) => choice.value !== "")
        },
        {
          id: "enzyme2",
          type: "select",
          label: "Enzyme 2",
          defaultValue: "bamhi",
          choices: enzymeChoices
        },
        {
          id: "enzyme3",
          type: "select",
          label: "Enzyme 3",
          defaultValue: "",
          choices: enzymeChoices
        }
      ]
    },
    {
      id: "topology",
      type: "radio",
      label: "Topology",
      help: "Circular digests can produce a wrap-around fragment that spans the displayed end/start boundary. The linear map labels that as one fragment.",
      defaultValue: "linear",
      choices: [
        { value: "linear", label: "Linear" },
        { value: "circular", label: "Circular" }
      ]
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "svg-gel",
      choices: [
        { value: "svg-gel", label: "Simulated gel" },
        { value: "svg-map", label: "Fragment map" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" },
        { value: "text-map", label: "Text annotation map" },
        { value: "report", label: "Fragment-size report" },
        { value: "tsv", label: "Fragment table" },
        { value: "fasta", label: "FASTA cut fragments" }
      ]
    },
    {
      id: "sourceNote",
      type: "note",
      text:
        "The simulated gel is qualitative. It uses log-size migration and draws uncut circular DNA with faster apparent mobility than an equivalent-length linear molecule."
    }
  ]
};
