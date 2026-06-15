export const tableDataFormatConverterMetadata = {
  id: "table-data-format-converter",
  name: "Table/Data Format Converter",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel", "format conversion"],
  summary: "Convert CSV, TSV, simple JSON object arrays, Markdown tables, and Excel workbook imports/exports while keeping a structured table stream.",
  inputType: "CSV, TSV, Excel, or JSON",
  outputType: "CSV, TSV, JSON, Markdown table, XLSX, report, or table",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "generic-table" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/table-data-format-converter/run.js",
  workerExport: "runTableDataFormatConverter",
  options: [
    {
      type: "group",
      label: "Input",
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
          ]
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
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "tsv",
          choices: [
            { value: "tsv", label: "TSV" },
            { value: "csv", label: "CSV" },
            { value: "json", label: "JSON" },
            { value: "markdown", label: "Markdown table" },
            { value: "xlsx", label: "Excel workbook (.xlsx)" },
            { value: "report", label: "Summary report" }
          ],
          help: "XLSX files loaded through the file picker or drop zone are converted to tabular text with the bundled ExcelJS browser library. XLSX export uses the same library from the structured table stream. YAML remains planned."
        }
      ]
    }
  ]
};
