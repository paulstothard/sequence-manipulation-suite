import {
  tableColumnComparisonColumns,
  tableColumnComparisonPairColumns
} from "../../core/table-column-comparison.js";

export const tableColumnComparisonMetadata = {
  id: "table-column-comparison",
  name: "Table Column Comparison",
  category: "Tables",
  tags: ["table", "CSV", "TSV", "Excel", "plot", "statistics"],
  summary: "Compare two table columns with type-aware summaries, missingness checks, and a suitable plot.",
  whenToUse: "Use this when two columns need a quick relationship check before deciding whether they belong in a scatter plot, grouped distribution plot, or contingency table.",
  inputType: "CSV, TSV, JSON array, or Excel table",
  outputType: "Comparison plot, compact heat map, type-aware comparison table, row comparison table, or report",
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
      { id: "plot", kind: "text", mediaType: "image/svg+xml", label: "Comparison plot" },
      { id: "comparisonTable", kind: "table", schema: "table-column-comparison", columns: tableColumnComparisonColumns },
      { id: "pairTable", kind: "table", schema: "table-column-comparison-pairs", columns: tableColumnComparisonPairColumns },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/table-column-comparison/run.js",
  workerExport: "runTableColumnComparison",
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
      label: "Columns to compare",
      options: [
        {
          id: "columnA",
          type: "text",
          label: "Column A",
          defaultValue: "concentration_ng_ul",
          suggestionsFrom: "table-columns"
        },
        {
          id: "columnB",
          type: "text",
          label: "Column B",
          defaultValue: "rin",
          suggestionsFrom: "table-columns"
        },
        {
          id: "comparisonType",
          type: "select",
          label: "Comparison type",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect from selected columns" },
            { value: "numeric-numeric", label: "Numeric vs numeric" },
            { value: "numeric-category", label: "Numeric vs category" },
            { value: "category-category", label: "Category vs category" }
          ],
          help: "Auto detect uses numeric-vs-numeric when both selected columns parse as numeric, numeric-vs-category when exactly one is numeric, and category-vs-category otherwise."
        }
      ]
    },
    {
      type: "group",
      label: "Plot",
      options: [
        {
          id: "plotStyle",
          type: "radio",
          label: "Numeric/category plot",
          defaultValue: "violin",
          choices: [
            { value: "violin", label: "Violin plot" },
            { value: "box", label: "Box plot" }
          ],
          help: "Used only when one selected column is numeric and the other is categorical."
        },
        {
          id: "maxPointsDrawn",
          type: "number",
          label: "Maximum scatter points",
          defaultValue: 5000,
          min: 100,
          max: 50000,
          step: 100,
          help: "Caps points drawn in numeric-vs-numeric plots. Tables and summaries still use all parsed rows within the tool limits."
        },
        {
          id: "maxDotsDrawn",
          type: "number",
          label: "Maximum distribution dots",
          defaultValue: 1000,
          min: 0,
          max: 10000,
          step: 100,
          help: "Caps individual dots drawn in numeric-vs-category plots. Distribution summaries still use all complete values."
        },
        {
          id: "title",
          type: "text",
          label: "Plot title",
          defaultValue: "Sample QC column comparison"
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
          defaultValue: "plot",
          choices: [
            { value: "plot", label: "Comparison plot" },
            { value: "compact-heatmap", label: "Compact heat map" },
            { value: "comparison-table", label: "Comparison table" },
            { value: "pair-table", label: "Row comparison table" },
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
          id: "maxCategories",
          type: "number",
          label: "Maximum categories per column",
          defaultValue: 20,
          min: 2,
          max: 100,
          step: 1,
          help: "For category plots and contingency tables, values outside the most frequent categories are grouped as Other."
        },
        {
          id: "maxPairRows",
          type: "number",
          label: "Maximum row comparison rows",
          defaultValue: 10000,
          min: 1,
          max: 1000000,
          step: 1000,
          help: "Caps the optional row-level comparison table for display and download."
        }
      ]
    }
  ],
  citations: [
    {
      text: "Numeric summaries use pairwise-complete rows. Violin density uses a Gaussian kernel-density estimate with a robust Silverman-style bandwidth."
    }
  ]
};
