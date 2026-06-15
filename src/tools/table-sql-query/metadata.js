import { tableSqlQueryColumns } from "../../core/table-sql-query.js";

export const tableSqlQueryMetadata = {
  id: "table-sql-query",
  name: "Table SQL Query",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel"],
  summary: "Run SQL-like SELECT, WHERE, GROUP BY, ORDER BY, and LIMIT queries against browser-local tables.",
  whenToUse: "Use this when a table needs a compact query step that would be awkward to express with separate filter, group, sort, or column-selection controls.",
  inputType: "CSV, TSV, JSON array, or Excel table",
  outputType: "Query result table, CSV, JSON, or report",
  fileInput: {
    accept: ".csv,.tsv,.tab,.json,.xlsx,.txt",
    dropLabel: "Drop CSV, TSV, JSON, Excel workbook, or plain-text table here"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "generic-table", columns: tableSqlQueryColumns },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/table-sql-query/run.js",
  workerExport: "runTableSqlQuery",
  options: [
    {
      type: "group",
      label: "Input table",
      help: "Controls how pasted or loaded text is parsed before the query runs. Excel files are converted to tabular text by the shared browser input reader.",
      options: [
        {
          id: "inputFormat",
          type: "select",
          label: "Input format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "csv", label: "CSV" },
            { value: "tsv", label: "TSV" },
            { value: "json", label: "JSON array/object" }
          ],
          help: "Auto detect treats JSON-looking input as JSON and otherwise detects common delimited text."
        },
        {
          id: "hasHeader",
          type: "checkbox",
          label: "First row contains column names",
          defaultValue: true,
          help: "Used for CSV/TSV input. JSON object keys become column names automatically."
        }
      ]
    },
    {
      type: "group",
      label: "Query",
      help: "Use a single browser-local table named table. Supported clauses are SELECT, FROM, WHERE, GROUP BY, ORDER BY, and LIMIT.",
      options: [
        {
          id: "sqlQuery",
          type: "textarea",
          label: "SQL-like query",
          defaultValue: "SELECT treatment, count(*) AS samples, avg(concentration_ng_ul) AS mean_concentration\nFROM table\nWHERE concentration_ng_ul >= 20\nGROUP BY treatment\nORDER BY mean_concentration DESC",
          rows: 7,
          help: "Supported expressions are column names, *, count(*), count(column), sum, avg, min, and max. WHERE supports AND-combined comparisons such as =, !=, >, >=, <, <=, LIKE, IN (...), IS, and IS NOT."
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
          label: "Output format",
          defaultValue: "table",
          choices: [
            { value: "table", label: "Query result table" },
            { value: "csv", label: "CSV output" },
            { value: "json", label: "JSON array" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      type: "group",
      id: "limits",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "maxInputRows",
          type: "number",
          label: "Maximum input rows to query",
          defaultValue: 50000,
          min: 1,
          max: 1000000,
          step: 1000,
          help: "Caps rows read into the query engine so accidental large table pastes stay responsive."
        },
        {
          id: "maxOutputRows",
          type: "number",
          label: "Maximum output rows",
          defaultValue: 10000,
          min: 1,
          max: 1000000,
          step: 1000,
          help: "Caps materialized query rows for display and download. A SQL LIMIT clause can choose a smaller result."
        }
      ]
    },
    {
      id: "sqlSubsetNote",
      type: "note",
      text: "This is a local SQL-like subset for one table, not a full database engine. It does not run INSERT, UPDATE, DELETE, JOIN, subqueries, or arbitrary JavaScript."
    }
  ]
};
