import { fastaLengthFilterTableColumns } from "../../core/fasta-length-filter.js";
import { WHOLE_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const fastaLengthFilterMetadata = {
  id: "fasta-length-filter",
  name: "FASTA Filter / Select",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "FASTA"],
  summary: "Select FASTA records by length, title text, sequence text, GC percent, or ambiguous-character count, then optionally sort, trim terminal poly-A/T tails, or join selected records.",
  inputType: "FASTA records",
  outputType: "Selected FASTA, non-selected FASTA, report, table",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "filteredFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "removedFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "fasta-length-filter", columns: fastaLengthFilterTableColumns },
      { id: "sequenceRecords", kind: "sequence-records" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fasta-length-filter/run.js",
  workerExport: "runFastaLengthFilter",
  options: [
    ...makeFastaSourceInputOptions(),
    {
      id: "minLength",
      type: "number",
      label: "Minimum length",
      defaultValue: 10,
      min: 0,
      step: 1
    },
    {
      id: "maxLength",
      type: "number",
      label: "Maximum length",
      defaultValue: 1000,
      min: 0,
      step: 1,
      help: "Use 0 to apply no maximum length."
    },
    {
      id: "titleContains",
      type: "text",
      label: "Title contains",
      defaultValue: "",
      help: "Optional case-insensitive text that must appear in the FASTA title."
    },
    {
      id: "sequenceContains",
      type: "text",
      label: "Sequence contains",
      defaultValue: "",
      help: "Optional ungapped sequence text that must appear in the record sequence."
    },
    {
      id: "minGcPercent",
      type: "text",
      label: "Minimum GC %",
      defaultValue: "",
      help: "Optional DNA/RNA criterion. Leave blank to ignore."
    },
    {
      id: "maxGcPercent",
      type: "text",
      label: "Maximum GC %",
      defaultValue: "",
      help: "Optional DNA/RNA criterion. Leave blank to ignore."
    },
    {
      id: "maxAmbiguousCount",
      type: "text",
      label: "Maximum ambiguous characters",
      defaultValue: "",
      help: "Optional criterion counting characters outside A/C/G/T/U."
    },
    {
      id: "selectionAction",
      type: "radio",
      label: "Action for matching records",
      defaultValue: "keep",
      help: "The selected FASTA output contains the records produced by this action. The non-selected FASTA output is available separately for audit or recovery.",
      choices: [
        { value: "keep", label: "Keep matching records" },
        { value: "remove", label: "Remove matching records" }
      ]
    },
    {
      id: "sortMode",
      type: "select",
      label: "Sort selected records",
      defaultValue: "input",
      choices: [
        { value: "input", label: "Keep input order" },
        { value: "length-asc", label: "Length, shortest first" },
        { value: "length-desc", label: "Length, longest first" },
        { value: "title-asc", label: "Title, A to Z" },
        { value: "title-desc", label: "Title, Z to A" },
        { value: "gc-asc", label: "GC %, low to high" },
        { value: "gc-desc", label: "GC %, high to low" },
        { value: "ambiguous-asc", label: "Ambiguous count, low to high" },
        { value: "ambiguous-desc", label: "Ambiguous count, high to low" }
      ]
    },
    {
      type: "group",
      label: "Selected-record cleanup",
      options: [
        {
          id: "trimTerminalPolyAt",
          type: "checkbox",
          label: "Trim terminal poly-A/T tails",
          defaultValue: false,
          help: "Removes only long terminal A runs at the 3' end and T/U runs at the 5' end of selected records."
        },
        {
          id: "polyAtMinLength",
          type: "number",
          label: "Minimum A/T run",
          defaultValue: 10,
          min: 1,
          max: 1000,
          step: 1,
          visibleWhen: { option: "trimTerminalPolyAt", value: true }
        },
        {
          id: "joinSelectedRecords",
          type: "checkbox",
          label: "Join selected records into one FASTA record",
          defaultValue: false,
          help: "Concatenates the selected records after filtering, sorting, and optional tail trimming. Useful for aggregate CDS/codon-use summaries."
        },
        {
          id: "joinedTitle",
          type: "text",
          label: "Joined FASTA title",
          defaultValue: "joined_selected_records",
          visibleWhen: { option: "joinSelectedRecords", value: true }
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "filtered-fasta",
          choices: [
            { value: "filtered-fasta", label: "Selected records FASTA" },
            { value: "removed-fasta", label: "Non-selected records FASTA" },
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Decision table" }
          ]
        }
      ]
    },
    {
      id: "compressedInputNote",
      type: "note",
      text: WHOLE_FASTA_SCAN_NOTE
    }
  ]
};
