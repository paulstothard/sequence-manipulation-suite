import { fastaExtractByIdColumns } from "../../core/fasta-extract-by-id.js";
import { INDEXED_FASTA_BUNDLE_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const fastaExtractByIdMetadata = {
  id: "fasta-extract-by-id",
  name: "FASTA Extract By ID List",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "FASTA", "search"],
  summary: "Keep or remove FASTA records using a separate pasted ID/title list, with optional output in ID-list order.",
  inputType: "FASTA records and ID list",
  outputType: "Extracted FASTA, match table, or report",
  splitInput: {
    separator: "---",
    panels: [
      {
        id: "fasta",
        label: "FASTA source",
        description: "Paste FASTA records or choose a FASTA source above. Indexed sources support exact first-word ID lookup from prepared FASTA+FAI or BGZF FASTA+FAI+GZI bundles.",
        dropLabel: "Drop FASTA or FASTA.GZ here",
        accept: ".fa,.fasta,.fna,.faa,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.txt",
        placeholder: "Paste FASTA records here."
      },
      {
        id: "ids",
        label: "ID/title list",
        description: "Enter one ID or title per line, or paste a simple CSV/TSV list. Header columns named ID, accession, query, or title are recognized.",
        dropLabel: "Drop plain-text, CSV, or TSV ID/title list here",
        accept: ".txt,.csv,.tsv,.tab",
        placeholder: "Paste one ID, accession, or title per line."
      }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "fasta-extract-by-id", columns: fastaExtractByIdColumns },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "fasta-extract-by-id" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fasta-extract-by-id/run.js",
  workerExport: "runFastaExtractById",
  options: [
    ...makeFastaSourceInputOptions(),
    {
      id: "action",
      type: "radio",
      label: "Action",
      defaultValue: "keep",
      choices: [
        { value: "keep", label: "Keep matching records" },
        { value: "remove", label: "Remove matching records" }
      ]
    },
    {
      id: "outputOrder",
      type: "radio",
      label: "Output order",
      defaultValue: "input",
      visibleWhen: { option: "action", value: "keep" },
      choices: [
        { value: "input", label: "FASTA order" },
        { value: "id-list", label: "ID-list order" }
      ],
      help: "ID-list order is only meaningful when keeping matching records. It can duplicate records if the same ID appears more than once in the list."
    },
    {
      id: "matchMode",
      type: "radio",
      label: "Match mode",
      defaultValue: "id-exact",
      choices: [
        { value: "id-exact", label: "Match first FASTA title word" },
        { value: "title-exact", label: "Match full FASTA title" },
        { value: "title-contains", label: "Title contains ID/list item" }
      ],
      help: "The first title word is the text after > up to the first space. Use the full-title or contains modes when your list contains longer headers or partial title text."
    },
    { id: "caseSensitive", type: "checkbox", label: "Case-sensitive matching", defaultValue: true },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "fasta",
          choices: [
            { value: "fasta", label: "FASTA" },
            { value: "table-tsv", label: "Match table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      id: "compressedInputNote",
      type: "note",
      text: `Paste/upload mode scans loaded FASTA records. Indexed mode supports keep workflows with exact first-title-word IDs. ${INDEXED_FASTA_BUNDLE_NOTE}`
    }
  ]
};
