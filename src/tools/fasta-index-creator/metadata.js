import { fastaFaiIndexColumns } from "../../core/fasta-index-creator.js";
import { INDEXED_FASTA_BUNDLE_NOTE } from "../fasta-input-policy.js";

export const fastaIndexCreatorMetadata = {
  id: "fasta-index-creator",
  name: "FASTA Index Creator",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "FASTA", "validation", "coordinates"],
  summary: "Create a .fai index for an uncompressed FASTA file so it can be used by indexed FASTA region tools.",
  inputType: "Uncompressed FASTA records",
  outputType: "FASTA index, index table, or summary report",
  fileInput: {
    dropLabel: "Drop uncompressed FASTA records here",
    accept: ".fa,.fasta,.fna,.ffn,.faa,.txt"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fai", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "fasta-fai-index", columns: fastaFaiIndexColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fasta-index-creator/run.js",
  workerExport: "runFastaIndexCreator",
  options: [
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "fai",
          choices: [
            { value: "fai", label: "FASTA index" },
            { value: "table", label: "Index table" },
            { value: "report", label: "Summary report" }
          ]
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
          id: "maxInputCharacters",
          type: "number",
          label: "Maximum input characters",
          defaultValue: 50000000,
          min: 100,
          max: 2000000000,
          help: "Refuse pasted or loaded FASTA text above this size so browser-local indexing remains bounded and cancellable."
        }
      ]
    },
    {
      id: "indexedFastaNote",
      type: "note",
      text: `This tool creates .fai indexes for uncompressed FASTA. ${INDEXED_FASTA_BUNDLE_NOTE}`
    }
  ]
};
