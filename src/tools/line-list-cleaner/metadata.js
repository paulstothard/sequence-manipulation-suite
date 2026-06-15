import { lineListCountColumns } from "../../core/line-list.js";

export const lineListCleanerMetadata = {
  id: "line-list-cleaner",
  name: "Line / List Cleaner",
  category: "Text & Notes",
  tags: ["table", "text", "cleaning", "statistics"],
  summary: "Clean, split, sort, deduplicate, count, and rejoin simple text lists.",
  inputType: "Text list",
  outputType: "Cleaned list, count table, report",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "listText", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "line-list-counts", columns: lineListCountColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Parse and cleanup",
      help: "Controls how pasted text is split into items before duplicate removal, sorting, counting, or rejoining.",
      options: [
        {
          id: "splitMode",
          type: "select",
          label: "Split input by",
          help: "Choose how the input should be separated into list items.",
          defaultValue: "lines",
          choices: [
            { value: "lines", label: "Lines" },
            { value: "comma", label: "Commas" },
            { value: "semicolon", label: "Semicolons" },
            { value: "tab", label: "Tabs" },
            { value: "whitespace", label: "Any whitespace" }
          ]
        },
        { id: "trimItems", type: "checkbox", label: "Trim each item", defaultValue: true, help: "Remove spaces and tabs from the start and end of each item." },
        { id: "removeBlankItems", type: "checkbox", label: "Remove blank items", defaultValue: true, help: "Drop empty items after splitting and trimming." },
        { id: "collapseInternalSpaces", type: "checkbox", label: "Collapse repeated spaces inside items", defaultValue: false, help: "Replace each run of two or more ordinary spaces inside an item with one space." }
      ]
    },
    {
      type: "group",
      label: "Duplicate handling",
      help: "Duplicate removal preserves the first occurrence of each item. It does not require sorting.",
      options: [
        {
          id: "removeDuplicates",
          type: "checkbox",
          label: "Remove duplicate items",
          defaultValue: true,
          help: "Keep the first item for each comparison key and remove later duplicates. Turn on sorting separately if you want the unique items sorted."
        },
        {
          id: "caseSensitive",
          type: "checkbox",
          label: "Case-sensitive comparisons",
          defaultValue: false,
          help: "When off, Apple and apple are treated as the same item for duplicate removal, sorting, and counts."
        }
      ]
    },
    {
      type: "group",
      label: "Sorting",
      help: "Sorting is optional and runs after cleanup and duplicate removal.",
      options: [
        {
          id: "sortItems",
          type: "checkbox",
          label: "Sort list output",
          defaultValue: true,
          help: "Sort the cleaned list. If duplicate removal is also enabled, SMS3 removes duplicates first and then sorts the remaining items."
        },
        {
          id: "sortMode",
          type: "select",
          label: "Sort mode",
          visibleWhen: { option: "sortItems", value: true },
          help: "Natural sorting treats embedded numbers numerically, so sample2 sorts before sample10.",
          defaultValue: "natural",
          choices: [
            { value: "natural", label: "Natural text" },
            { value: "text", label: "Plain text" },
            { value: "numeric", label: "Numeric first" }
          ]
        },
        {
          id: "sortDirection",
          type: "select",
          label: "Sort direction",
          visibleWhen: { option: "sortItems", value: true },
          defaultValue: "asc",
          choices: [
            { value: "asc", label: "Ascending" },
            { value: "desc", label: "Descending" }
          ]
        }
      ]
    },
    {
      type: "group",
      label: "Output",
      help: "Controls how cleaned list output is joined. Count table output summarizes cleaned input items regardless of the selected list operation.",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "list",
          choices: [
            { value: "list", label: "List text" },
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Count table" }
          ]
        },
        {
          id: "joinMode",
          type: "select",
          label: "Join list with",
          visibleWhen: { option: "outputFormat", value: "list" },
          defaultValue: "lines",
          choices: [
            { value: "lines", label: "Lines" },
            { value: "comma", label: "Comma + space" },
            { value: "semicolon", label: "Semicolon + space" },
            { value: "tab", label: "Tabs" }
          ]
        }
      ]
    }
  ]
};
