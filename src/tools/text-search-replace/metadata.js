import { textSearchMatchColumns } from "../../core/text-search-replace.js";

export const textSearchReplaceMetadata = {
  id: "text-search-replace",
  name: "Text Search / Replace",
  category: "Text & Notes",
  tags: ["table", "text", "regex", "search"],
  summary: "Search plain text or regular expressions, replace matches, extract matches, or remove matching lines.",
  inputType: "Plain text",
  outputType: "Transformed text, match table, report",
  runInWorker: true,
  workerModule: "../tools/text-search-replace/run.js",
  workerExport: "runTextSearchReplace",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "text", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "text-search-replace", columns: textSearchMatchColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Match settings",
      help: "Choose whether the pattern is literal text or JavaScript regular-expression syntax.",
      options: [
        {
          id: "searchMode",
          type: "radio",
          label: "Pattern type",
          help: "Plain text searches literal characters. JavaScript regex treats the pattern as a regular-expression source, without slash delimiters such as /sample_\\d+/i. See the JavaScript regex reference page for syntax and supported flags.",
          defaultValue: "regex",
          choices: [
            { value: "plain", label: "Plain text" },
            { value: "regex", label: "JavaScript regex" }
          ]
        },
        {
          id: "pattern",
          type: "text",
          label: "Pattern to find",
          help: "Text or regular expression to search for.",
          defaultValue: "sample_(\\d+)"
        },
        { id: "caseSensitive", type: "checkbox", label: "Case-sensitive search", defaultValue: false, help: "When off, uppercase and lowercase letters are treated as equivalent. In regex mode this controls JavaScript i-flag behavior." },
        {
          id: "multiline",
          type: "checkbox",
          label: "Regex multiline anchors",
          defaultValue: true,
          visibleWhen: { option: "searchMode", value: "regex" },
          help: "Makes ^ and $ match the start and end of each line. This controls JavaScript m-flag behavior."
        }
      ]
    },
    {
      type: "group",
      label: "Action on matches",
      help: "Choose the result to produce from the matched text.",
      options: [
        {
          id: "operation",
          type: "select",
          label: "Action",
          defaultValue: "replace",
          choices: [
            { value: "replace", label: "Replace all matches" },
            { value: "extract", label: "Extract matches only" },
            { value: "remove-lines", label: "Remove matching lines" }
          ]
        },
        {
          id: "replacement",
          type: "text",
          label: "Replace with",
          help: "Replacement text. In regex mode, JavaScript replacement tokens such as $1 can refer to capture groups.",
          defaultValue: "SRR$1",
          visibleWhen: { option: "operation", value: "replace" }
        },
        {
          id: "joinMode",
          type: "select",
          label: "Return extracted matches as",
          help: "Only used when the action is Extract matches only.",
          defaultValue: "lines",
          visibleWhen: { option: "operation", value: "extract" },
          choices: [
            { value: "lines", label: "One match per line" },
            { value: "comma", label: "Comma-separated text" },
            { value: "tab", label: "Tab-separated text" }
          ]
        }
      ]
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "text",
      choices: [
        { value: "text", label: "Result text" },
        { value: "tsv", label: "Match table" },
        { value: "report", label: "Summary report" }
      ]
    }
  ]
};
