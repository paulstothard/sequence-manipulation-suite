import { fastaTableColumns } from "../../core/fasta-table-converter.js";
import { FASTA_TABLE_CONVERTER_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

const sharedOutputs = [
  { id: "primary", kind: "text", mediaType: "text/plain" },
  { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
  { id: "report", kind: "text", mediaType: "text/plain" },
  { id: "table", kind: "table", schema: "fasta-table-converter", columns: fastaTableColumns },
  { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "fasta-table-converter" },
  { id: "warnings", kind: "warnings" }
];

export const fastaToTableMetadata = {
  id: "fasta-to-table",
  name: "FASTA To Table",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "table", "FASTA", "CSV", "TSV", "format conversion"],
  summary: "Convert FASTA record titles, IDs, sequences, and lengths into a copyable table.",
  whenToUse: "Use this when FASTA records need to become rows for review, filtering, spreadsheet work, or downstream table workflows.",
  inputType: "FASTA records",
  outputType: "Table or summary report",
  fileInput: {
    dropLabel: "Drop FASTA records here",
    accept: ".fa,.fasta,.fna,.faa,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.txt"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: sharedOutputs
  },
  runInWorker: true,
  workerModule: "../tools/fasta-table-converter/run.js",
  workerExport: "runFastaToTable",
  options: [
    ...makeFastaSourceInputOptions(),
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "table-tsv",
          choices: [
            { value: "table-tsv", label: "Record table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      id: "compressedInputNote",
      type: "note",
      text: FASTA_TABLE_CONVERTER_SCAN_NOTE
    }
  ]
};

export const tableToFastaMetadata = {
  id: "table-to-fasta",
  name: "Table To FASTA",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "table", "FASTA", "CSV", "TSV", "Excel", "format conversion"],
  summary: "Build FASTA records from title and sequence columns in a CSV, TSV, Excel, or plain-text table.",
  whenToUse: "Use this when sequence data already lives in table columns and needs to be exported as FASTA records.",
  inputType: "CSV, TSV, Excel, or plain-text table",
  outputType: "FASTA, table, or summary report",
  fileInput: {
    dropLabel: "Drop CSV, TSV, Excel workbook, or plain-text table here",
    accept: ".csv,.tsv,.tab,.xlsx,.txt"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: sharedOutputs
  },
  runInWorker: true,
  workerModule: "../tools/fasta-table-converter/run.js",
  workerExport: "runTableToFasta",
  options: [
    {
      id: "delimiter",
      type: "select",
      label: "Table delimiter",
      defaultValue: "auto",
      choices: [
        { value: "auto", label: "Auto detect" },
        { value: "tab", label: "Tab" },
        { value: "comma", label: "Comma" },
        { value: "semicolon", label: "Semicolon" },
        { value: "pipe", label: "Pipe" }
      ],
      help: "Choose the delimiter for plain-text tables, or leave auto detect for common CSV and TSV inputs."
    },
    { id: "hasHeader", type: "checkbox", label: "First table row contains column names", defaultValue: true },
    {
      id: "titleColumn",
      type: "text",
      label: "Title column override",
      defaultValue: "",
      help: "Leave blank to auto-detect columns such as title, name, id, record_id, sequence_id, or accession."
    },
    {
      id: "sequenceColumn",
      type: "text",
      label: "Sequence column override",
      defaultValue: "",
      help: "Leave blank to auto-detect columns such as sequence, seq, dna, rna, protein, bases, or residues."
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "fasta",
          choices: [
            { value: "fasta", label: "FASTA" },
            { value: "table-tsv", label: "Parsed table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      id: "tableInputNote",
      type: "note",
      text: "Use FASTA To Table when the input starts as FASTA records. This table tool reads browser-loaded CSV, TSV, plain-text, or Excel worksheet data."
    }
  ]
};

export const fastaTableConverterMetadata = fastaToTableMetadata;
