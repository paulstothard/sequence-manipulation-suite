import { fastaHeaderRenameTableColumns } from "../../core/fasta-header-rename.js";
import { WHOLE_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const fastaHeaderRenameMetadata = {
  id: "fasta-header-rename",
  name: "FASTA Header Rename",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "FASTA", "cleaning"],
  summary: "Rename FASTA headers with prefix/suffix rules, find-and-replace, safe-ID cleanup, and optional numbering.",
  inputType: "FASTA records",
  outputType: "Renamed FASTA, report, table",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "fasta-header-rename", columns: fastaHeaderRenameTableColumns },
      { id: "sequenceRecords", kind: "sequence-records" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/fasta-header-rename/run.js",
  workerExport: "runFastaHeaderRename",
  options: [
    ...makeFastaSourceInputOptions(),
    {
      type: "group",
      label: "Header text replacement",
      options: [
        {
          id: "findText",
          type: "text",
          label: "Find in header",
          defaultValue: "",
          help: "Leave blank to skip text replacement and only apply prefix, suffix, numbering, or safe-ID cleanup."
        },
        {
          id: "replaceText",
          type: "text",
          label: "Replace with",
          defaultValue: "",
          help: "Leave blank to delete the matched text. In regular expression mode, capture groups such as $1 can be used."
        },
        {
          id: "findMode",
          type: "radio",
          label: "Match type",
          defaultValue: "plain",
          help: "Plain text is safest for routine header edits. Use regular expression only when you need pattern matching.",
          choices: [
            { value: "plain", label: "Plain text" },
            { value: "regex", label: "Regular expression" }
          ]
        },
        {
          id: "regexFlags",
          type: "text",
          label: "Regular expression flags",
          defaultValue: "g",
          visibleWhen: { option: "findMode", value: "regex" },
          help: "Advanced JavaScript flags. Use g to replace every match and i for case-insensitive matching. Do not include slash delimiters."
        },
        {
          id: "regexHelpNote",
          type: "note",
          visibleWhen: { option: "findMode", value: "regex" },
          text: "Enter only the pattern, not /pattern/flags. Capture groups can be reused in the replacement text, for example $1."
        }
      ]
    },
    { id: "prefix", type: "text", label: "Add prefix", defaultValue: "" },
    { id: "suffix", type: "text", label: "Add suffix", defaultValue: "" },
    { id: "safeIds", type: "checkbox", label: "Clean headers into safe IDs", defaultValue: true, help: "Replaces spaces and unusual punctuation with underscores so headers are easier to use in scripts." },
    {
      id: "numberMode",
      type: "radio",
      label: "Numbering",
      defaultValue: "none",
      choices: [
        { value: "none", label: "No numbering" },
        { value: "prefix", label: "Number prefix" },
        { value: "suffix", label: "Number suffix" }
      ]
    },
    { id: "numberStart", type: "number", label: "First number", defaultValue: 1, min: 0, step: 1, visibleWhen: { option: "numberMode", value: ["prefix", "suffix"] } },
    { id: "numberWidth", type: "number", label: "Number width", defaultValue: 3, min: 1, max: 12, step: 1, visibleWhen: { option: "numberMode", value: ["prefix", "suffix"] } },
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
            { value: "fasta", label: "Renamed FASTA" },
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Rename table" }
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
