const TABLE_COLUMNS = [];

export const tableViewerCleanerMetadata = {
  id: "table-viewer-cleaner",
  name: "Table Viewer / Cleaner",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel", "cleaning"],
  summary: "Parse CSV/TSV-style text, clean cells and headers, filter rows and columns, sort rows, and export a structured table.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Cleaned table, report",
  layout: {
    options: "wide"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "generic-table", columns: TABLE_COLUMNS },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Input",
      help: "Controls how pasted or loaded text is parsed into rows and columns.",
      options: [
        {
          id: "delimiter",
          type: "select",
          label: "Delimiter",
          help: "The character that separates columns. Auto detect checks common delimiters while respecting quoted fields.",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "tab", label: "Tab" },
            { value: "comma", label: "Comma" },
            { value: "semicolon", label: "Semicolon" },
            { value: "pipe", label: "Pipe" }
          ]
        },
        { id: "hasHeader", type: "checkbox", label: "First row contains column names", defaultValue: true, help: "When enabled, the first parsed row becomes column names. When disabled, generic column names are assigned." }
      ]
    },
    {
      type: "group",
      label: "Clean cells",
      help: "Lightweight cleanup applied to every cell before filters, sorting, and export.",
      options: [
        {
          id: "trimWhitespace",
          type: "checkbox",
          label: "Trim leading and trailing spaces",
          defaultValue: true,
          help: "Removes spaces around cell values. This is usually safe for pasted spreadsheet or delimited data."
        },
        {
          id: "collapseWhitespace",
          type: "checkbox",
          label: "Collapse repeated whitespace inside cells",
          defaultValue: false,
          help: "Converts runs of spaces, tabs, or line breaks inside a cell to a single space."
        },
        {
          id: "standardizeMissing",
          type: "checkbox",
          label: "Convert missing-value markers to blanks",
          defaultValue: false,
          help: "When enabled, values listed below are converted to empty cells before filtering and export."
        },
        {
          id: "missingValues",
          type: "text",
          label: "Missing-value markers",
          defaultValue: "NA,N/A,null,NULL,.",
          help: "Comma-separated markers to treat as missing when missing-value standardization is enabled."
        }
      ]
    },
    {
      type: "group",
      label: "Filter rows",
      help: "Row filtering is applied after cleanup and before sorting, column filtering, and empty row/column cleanup.",
      options: [
        {
          id: "filterRules",
          type: "rule-list",
          ruleKind: "filter",
          label: "Filters",
          addLabel: "+ Filter",
          defaultValue: "",
          defaultRule: "contains",
          columnSuggestionsFrom: "table-columns",
          help: "Add one or more AND filters. Text rules compare strings; numeric rules convert cell values and the filter value to numbers.",
          ruleChoices: [
            { value: "contains", label: "Contains text" },
            { value: "not_contains", label: "Does not contain text" },
            { value: "equals", label: "Equals text" },
            { value: "not_equals", label: "Does not equal text" },
            { value: "not_empty", label: "Is not empty" },
            { value: "empty", label: "Is empty" },
            { value: "gt", label: "Greater than" },
            { value: "gte", label: "Greater than or equal" },
            { value: "lt", label: "Less than" },
            { value: "lte", label: "Less than or equal" }
          ]
        }
      ]
    },
    {
      type: "group",
      label: "Sort rows",
      help: "Sorting is applied after row filtering. Earlier sort keys take priority over later keys.",
      options: [
        {
          id: "sortRules",
          type: "rule-list",
          ruleKind: "sort",
          label: "Sort keys",
          addLabel: "+ Sort key",
          defaultValue: "",
          defaultRule: "asc",
          columnSuggestionsFrom: "table-columns",
          help: "Add one or more sort keys. Earlier keys take priority over later keys.",
          ruleChoices: [
            { value: "asc", label: "Ascending" },
            { value: "desc", label: "Descending" }
          ]
        }
      ]
    },
    {
      type: "group",
      label: "Filter columns",
      help: "Column filters are applied after row filtering and sorting, before empty row/column cleanup. They affect which columns are included in the final output.",
      options: [
        {
          id: "columnFilterAction",
          type: "select",
          label: "Column filter action",
          help: "Keep or remove columns whose names or normalized ids match all column filter rules.",
          defaultValue: "keep",
          choices: [
            { value: "keep", label: "Keep matching columns" },
            { value: "remove", label: "Remove matching columns" },
            { value: "all", label: "Use all columns" }
          ]
        },
        {
          id: "columnFilterRules",
          type: "rule-list",
          ruleKind: "column-filter",
          label: "Column filters",
          valueLabel: "Column name or id",
          addLabel: "+ Column filter",
          defaultValue: "",
          defaultRule: "contains",
          help: "Add one or more AND filters against column names or normalized ids. Leave this empty to keep all columns.",
          ruleChoices: [
            { value: "contains", label: "Contains text" },
            { value: "not_contains", label: "Does not contain text" },
            { value: "equals", label: "Equals text" },
            { value: "not_equals", label: "Does not equal text" },
            { value: "starts_with", label: "Starts with text" },
            { value: "ends_with", label: "Ends with text" }
          ]
        }
      ]
    },
    {
      type: "group",
      label: "Remove empty rows / columns",
      help: "These cleanup steps run after row filtering, sorting, and column filtering so filtered output does not keep newly empty rows or columns.",
      options: [
        {
          id: "removeEmptyRows",
          type: "checkbox",
          label: "Remove empty rows",
          defaultValue: true,
          help: "Drops rows where every remaining cell is blank after cleanup, row filtering, and column filtering."
        },
        {
          id: "removeEmptyColumns",
          type: "checkbox",
          label: "Remove empty columns",
          defaultValue: false,
          help: "Drops columns where every remaining row is blank after cleanup, row filtering, and column filtering. This is ignored if it would remove every column."
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
          defaultValue: "tsv",
          choices: [
            { value: "tsv", label: "Table" },
            { value: "csv", label: "CSV output" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      id: "columnNote",
      type: "note",
      text: "Column filters compare both visible column names and normalized ids, for example: sample or gc_percent."
    },
    {
      id: "ruleNote",
      type: "note",
      text: "Cleanup runs first, then row filters, row sorting, column filtering, and empty row/column removal for export."
    }
  ]
};
