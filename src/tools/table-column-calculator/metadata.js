const TABLE_COLUMNS = [];

export const tableColumnCalculatorMetadata = {
  id: "table-column-calculator",
  name: "Table Column Calculator",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel", "statistics"],
  summary: "Add a calculated numeric column using safe operations such as ratios, percentages, logs, and z-scores.",
  inputType: "CSV, TSV, or Excel table",
  outputType: "Table with calculated column or report",
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
  workerModule: "../tools/table-column-calculator/run.js",
  workerExport: "runTableColumnCalculator",
  options: [
    {
      type: "group",
      label: "Input table",
      help: "Controls how pasted or loaded text is parsed before calculating the new column.",
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
          help: "When disabled, generic column names such as Column 1 are assigned."
        }
      ]
    },
    {
      type: "group",
      label: "Calculation",
      options: [
        {
          id: "leftColumn",
          type: "text",
          label: "Column",
          defaultValue: "mapped_reads",
          suggestionsFrom: "table-columns",
          help: "Numeric column used as the main input for the calculation."
        },
        {
          id: "operation",
          type: "select",
          label: "Operation",
          defaultValue: "percent",
          help: "Choose a binary operation using another column or constant, or a single-column transform such as log or z-score.",
          choices: [
            { value: "add", label: "Add" },
            { value: "subtract", label: "Subtract" },
            { value: "multiply", label: "Multiply" },
            { value: "divide", label: "Divide" },
            { value: "percent", label: "Percent" },
            { value: "log2", label: "Log2" },
            { value: "log10", label: "Log10" },
            { value: "zscore", label: "Z-score" }
          ]
        },
        {
          id: "rightColumn",
          type: "text",
          label: "Other column",
          defaultValue: "total_reads",
          suggestionsFrom: "table-columns",
          help: "Used by add, subtract, multiply, divide, and percent. Leave blank to use a constant instead.",
          visibleWhen: { option: "operation", value: ["add", "subtract", "multiply", "divide", "percent"] }
        },
        {
          id: "constant",
          type: "text",
          label: "Or constant",
          defaultValue: "",
          help: "Optional number used when Other column is blank.",
          visibleWhen: { option: "operation", value: ["add", "subtract", "multiply", "divide", "percent"] }
        },
        {
          id: "resultColumn",
          type: "text",
          label: "New column name",
          defaultValue: "percent_mapped",
          help: "Name of the calculated output column appended to the table."
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
            { value: "tsv", label: "Calculated table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
