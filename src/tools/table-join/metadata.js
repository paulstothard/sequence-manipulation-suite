const TABLE_COLUMNS = [];

export const tableJoinMetadata = {
  id: "table-join",
  name: "Table Join",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel"],
  summary: "Join two CSV, TSV, or Excel tables by one or more key columns using inner, left, or full joins.",
  inputType: "Two CSV, TSV, or Excel tables separated by a marker line",
  outputType: "Joined table or report",
  splitInput: {
    separator: "---",
    panels: [
      { id: "left", label: "Left table", dropLabel: "Drop left CSV, TSV, Excel workbook, or plain-text table here", accept: ".csv,.tsv,.tab,.xlsx,.txt" },
      { id: "right", label: "Right table", dropLabel: "Drop right CSV, TSV, Excel workbook, or plain-text table here", accept: ".csv,.tsv,.tab,.xlsx,.txt" }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "generic-table", columns: TABLE_COLUMNS },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/table-join/run.js",
  workerExport: "runTableJoin",
  options: [
    {
      id: "delimiter",
      type: "select",
      label: "Delimiter",
      help: "The character that separates columns in both input tables. Auto detect checks common delimiters while respecting quoted fields.",
      defaultValue: "auto",
      choices: [
        { value: "auto", label: "Auto detect" },
        { value: "tab", label: "Tab" },
        { value: "comma", label: "Comma" },
        { value: "semicolon", label: "Semicolon" },
        { value: "pipe", label: "Pipe" }
      ]
    },
    {
      id: "hasHeader",
      type: "checkbox",
      label: "First row contains column names",
      defaultValue: true,
      help: "When disabled, generic column names such as Column 1 are assigned in both tables."
    },
    {
      id: "leftKeyColumns",
      type: "value-list",
      label: "Left key columns",
      addLabel: "+ Left key",
      itemLabel: "left key column",
      itemPlaceholder: "Left column",
      defaultValue: "sample_id",
      suggestionsFrom: "table-left-columns",
      help: "Column or columns in the left table used to identify matching rows. For multiple keys, add them in the same order as the right keys."
    },
    {
      id: "rightKeyColumns",
      type: "value-list",
      label: "Right key columns",
      addLabel: "+ Right key",
      itemLabel: "right key column",
      itemPlaceholder: "Right column",
      defaultValue: "sample_id",
      suggestionsFrom: "table-right-columns",
      help: "Column or columns in the right table used to identify matching rows. Use the same order as the left keys."
    },
    {
      id: "joinType",
      type: "radio",
      label: "Join type",
      defaultValue: "inner",
      help: "Inner keeps only matching keys, left keeps every left-table row, and full keeps every row from both tables.",
      choices: [
        { value: "inner", label: "Inner" },
        { value: "left", label: "Left" },
        { value: "full", label: "Full" }
      ]
    },
    {
      id: "caseSensitive",
      type: "checkbox",
      label: "Case-sensitive key comparison",
      defaultValue: false,
      help: "When disabled, key values that differ only by letter case are treated as the same key."
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
            { value: "tsv", label: "Joined table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
