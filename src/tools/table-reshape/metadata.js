const TABLE_COLUMNS = [];

export const tableReshapeMetadata = {
  id: "table-reshape",
  name: "Table Reshape",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel"],
  summary: "Reshape CSV or TSV data between long and wide table layouts for sample, feature, and measurement tables.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Reshaped table or report",
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
  runInWorker: true,
  workerModule: "../tools/table-reshape/run.js",
  workerExport: "runTableReshape",
  options: [
    {
      type: "group",
      label: "Input",
      help: "Controls how pasted or loaded text is parsed before reshaping.",
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
          help: "When disabled, generic column names such as Column 1 are assigned and can be used in the reshape settings."
        },
        {
          id: "trimCells",
          type: "checkbox",
          label: "Trim cells before reshaping",
          defaultValue: true,
          help: "Removes leading and trailing spaces from ID values and output values before reshaping."
        }
      ]
    },
    {
      id: "mode",
      type: "radio",
      label: "Reshape mode",
      defaultValue: "long-to-wide",
      help: "Long to wide turns key-value rows into one row per ID. Wide to long gathers selected measurement columns into name/value rows.",
      choices: [
        { value: "long-to-wide", label: "Long to wide" },
        { value: "wide-to-long", label: "Wide to long" }
      ]
    },
    {
      id: "idColumns",
      type: "value-list",
      label: "ID columns",
      addLabel: "+ ID column",
      itemLabel: "ID column",
      itemPlaceholder: "Column",
      defaultValue: "sample_id,treatment",
      suggestionsFrom: "table-columns",
      help: "Columns that identify each sample, observation, or row group. These stay as ID columns in both reshape modes."
    },
    {
      type: "group",
      id: "longToWideSettings",
      label: "Long to wide settings",
      help: "Use when each measurement is currently a row and should become its own output column.",
      visibleWhen: { option: "mode", value: "long-to-wide" },
      options: [
        {
          id: "namesFrom",
          type: "text",
          label: "Column names from",
          defaultValue: "gene_id",
          suggestionsFrom: "table-columns",
          help: "This column supplies the new output column names."
        },
        {
          id: "valuesFrom",
          type: "text",
          label: "Values from",
          defaultValue: "tpm",
          suggestionsFrom: "table-numeric-columns",
          help: "This column supplies the values placed into the new output columns."
        },
        {
          id: "duplicateMode",
          type: "select",
          label: "Duplicate long values",
          defaultValue: "first",
          help: "Controls what happens when the same ID and output column name occur more than once.",
          choices: [
            { value: "first", label: "Use first value" },
            { value: "last", label: "Use last value" },
            { value: "sum", label: "Sum numeric values" },
            { value: "mean", label: "Mean of numeric values" }
          ]
        }
      ]
    },
    {
      type: "group",
      id: "wideToLongSettings",
      label: "Wide to long settings",
      help: "Use when several measurement columns should be gathered into a two-column name/value layout.",
      visibleWhen: { option: "mode", value: "wide-to-long" },
      options: [
        {
          id: "valueColumns",
          type: "value-list",
          label: "Columns to gather",
          addLabel: "+ Gather column",
          itemLabel: "gather column",
          itemPlaceholder: "Column",
          defaultValue: "TP53,BRCA1,MYC",
          suggestionsFrom: "table-columns",
          help: "These wide measurement columns become rows."
        },
        {
          id: "namesTo",
          type: "text",
          label: "Name column",
          defaultValue: "gene_id",
          help: "Name of the output column that will hold the gathered source column names."
        },
        {
          id: "valuesTo",
          type: "text",
          label: "Value column",
          defaultValue: "tpm",
          help: "Name of the output column that will hold the gathered values."
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
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
