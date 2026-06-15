const TABLE_COLUMNS = [];

export const tableGroupSummaryMetadata = {
  id: "table-group-summary",
  name: "Table Group Summary",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Group a CSV, TSV, or Excel table by selected columns and calculate counts plus numeric summary statistics.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Grouped summary table or report",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "summaryTable", kind: "table", schema: "generic-table", columns: TABLE_COLUMNS },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/table-group-summary/run.js",
  workerExport: "runTableGroupSummary",
  options: [
    {
      type: "group",
      label: "Input",
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
        {
          id: "hasHeader",
          type: "checkbox",
          label: "First row contains column names",
          defaultValue: true,
          help: "When disabled, generic names such as Column 1 and Column 2 are assigned. Blank header cells are also renamed this way and reported as warnings."
        },
        {
          id: "trimCells",
          type: "checkbox",
          label: "Trim cells before summarizing",
          defaultValue: true,
          help: "Removes spaces around group and value cells before missing-value checks and summary calculations."
        }
      ]
    },
    {
      id: "groupColumns",
      type: "value-list",
      label: "Group columns",
      addLabel: "+ Group column",
      itemLabel: "group column",
      itemPlaceholder: "Column",
      defaultValue: "treatment",
      suggestionsFrom: "table-columns",
      help: "Add visible column names or normalized ids to group by. Leave empty to summarize all rows together."
    },
    {
      id: "valueColumns",
      type: "value-list",
      label: "Value columns",
      addLabel: "+ Value column",
      itemLabel: "value column",
      itemPlaceholder: "Numeric column",
      defaultValue: "concentration_ng_ul, od260_280",
      suggestionsFrom: "table-columns",
      help: "Add numeric columns to summarize. Non-numeric non-missing values are ignored for numeric operations and reported as warnings."
    },
    {
      id: "operations",
      type: "text",
      label: "Operations",
      defaultValue: "count, mean, median, min, max, sd",
      help: "Supported operations are count, sum, mean, median, min, max, sd, and distinct."
    },
    {
      id: "missingValues",
      type: "text",
      label: "Additional missing tokens",
      defaultValue: "NA,N/A,na,n/a,null,NULL,-",
      help: "Comma- or line-separated cell values to treat as missing. Empty cells are always missing."
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "summary-tsv",
          choices: [
            { value: "summary-tsv", label: "Summary table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
