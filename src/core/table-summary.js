import { exportDelimitedTable, parseDelimitedTable } from "./table.js";

export const tableSummaryColumns = [
  { id: "column", label: "Column", type: "string" },
  { id: "inferred_type", label: "Inferred type", type: "string" },
  { id: "non_missing_count", label: "Non-missing count", type: "number" },
  { id: "missing_count", label: "Missing count", type: "number" },
  { id: "missing_percent", label: "Missing percent", type: "number" },
  { id: "distinct_count", label: "Distinct count", type: "number" },
  { id: "distinct_percent", label: "Distinct percent", type: "number" },
  { id: "mean", label: "Mean", type: "number" },
  { id: "sd", label: "SD", type: "number" },
  { id: "min", label: "Min", type: "string" },
  { id: "q1", label: "Q1", type: "number" },
  { id: "median", label: "Median", type: "number" },
  { id: "q3", label: "Q3", type: "number" },
  { id: "max", label: "Max", type: "string" },
  { id: "min_length", label: "Min length", type: "number" },
  { id: "mean_length", label: "Mean length", type: "number" },
  { id: "max_length", label: "Max length", type: "number" },
  { id: "top_values", label: "Top values", type: "string" }
];

function coerceTableInput(input, options = {}) {
  if (input?.kind === "table" && Array.isArray(input.columns) && Array.isArray(input.rows)) {
    return {
      columns: input.columns,
      rows: input.rows,
      delimiterId: "structured table",
      warnings: []
    };
  }
  return parseDelimitedTable(String(input ?? ""), {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
}

function makeMissingSet(value) {
  return new Set(
    String(value ?? "")
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function normalizeCell(value, trimCells) {
  const raw = String(value ?? "");
  return trimCells ? raw.trim() : raw;
}

function isMissingValue(value, missingSet, trimCells) {
  const normalized = normalizeCell(value, trimCells);
  return normalized === "" || missingSet.has(normalized);
}

function roundNumber(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(digits));
}

function isNumericValue(value) {
  if (String(value).trim() === "") {
    return false;
  }
  return Number.isFinite(Number(value));
}

function isIntegerLike(value) {
  return isNumericValue(value) && Number.isInteger(Number(value));
}

function isBooleanLike(value) {
  return /^(true|false|yes|no)$/i.test(String(value).trim());
}

function parseIsoDate(value) {
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const timestamp = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return text;
}

function inferSummaryType(values) {
  if (values.length === 0) {
    return "empty";
  }
  if (values.every(isBooleanLike)) {
    return "boolean";
  }
  if (values.every(isIntegerLike)) {
    return "integer";
  }
  if (values.every(isNumericValue)) {
    return "number";
  }
  if (values.every((value) => parseIsoDate(value) !== null)) {
    return "date";
  }
  return "text";
}

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) {
    return "";
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function sampleSd(values, mean) {
  if (values.length < 2) {
    return "";
  }
  const sumSquares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

function formatTopValues(values, maxTopValues) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { numeric: true }))
    .slice(0, maxTopValues)
    .map(([value, count]) => `${value} (${count})`)
    .join("; ");
}

function summarizeColumn(column, rows, options) {
  const missingSet = options.missingSet;
  const trimCells = options.trimCells;
  const maxTopValues = options.maxTopValues;
  const rawValues = rows.map((row) => row[column.id]);
  const values = rawValues
    .filter((value) => !isMissingValue(value, missingSet, trimCells))
    .map((value) => normalizeCell(value, trimCells));
  const missingCount = rawValues.length - values.length;
  const type = inferSummaryType(values);
  const distinctCount = new Set(values).size;
  const base = {
    column: column.label,
    inferred_type: type,
    non_missing_count: values.length,
    missing_count: missingCount,
    missing_percent: rawValues.length > 0 ? roundNumber((missingCount / rawValues.length) * 100, 2) : 0,
    distinct_count: distinctCount,
    distinct_percent: values.length > 0 ? roundNumber((distinctCount / values.length) * 100, 2) : 0,
    mean: "",
    sd: "",
    min: "",
    q1: "",
    median: "",
    q3: "",
    max: "",
    min_length: "",
    mean_length: "",
    max_length: "",
    top_values: formatTopValues(values, maxTopValues)
  };

  if (type === "integer" || type === "number") {
    const numericValues = values.map(Number).sort((left, right) => left - right);
    const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    return {
      ...base,
      mean: roundNumber(mean),
      sd: roundNumber(sampleSd(numericValues, mean)),
      min: roundNumber(numericValues[0]),
      q1: roundNumber(quantile(numericValues, 0.25)),
      median: roundNumber(quantile(numericValues, 0.5)),
      q3: roundNumber(quantile(numericValues, 0.75)),
      max: roundNumber(numericValues[numericValues.length - 1])
    };
  }

  if (type === "date") {
    const sortedDates = values.map(parseIsoDate).sort();
    return {
      ...base,
      min: sortedDates[0] ?? "",
      max: sortedDates[sortedDates.length - 1] ?? ""
    };
  }

  if (type === "text" || type === "boolean") {
    const lengths = values.map((value) => value.length).sort((left, right) => left - right);
    const meanLength = lengths.length > 0
      ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length
      : "";
    return {
      ...base,
      min_length: lengths[0] ?? "",
      mean_length: roundNumber(meanLength),
      max_length: lengths[lengths.length - 1] ?? ""
    };
  }

  return base;
}

export function summarizeTableProfile(input, options = {}) {
  const parsed = coerceTableInput(input, options);
  const warnings = [...parsed.warnings];
  const missingSet = makeMissingSet(options.missingValues ?? "NA,N/A,na,n/a,null,NULL,-");
  const trimCells = options.trimCells !== false;
  const maxTopValues = Math.max(1, Math.min(20, Number(options.maxTopValues ?? 5) || 5));

  if (parsed.columns.length === 0) {
    return {
      columns: [],
      rows: [],
      summaryRows: [],
      report: "",
      warnings: warnings.length > 0 ? warnings : ["No table input was provided."],
      delimiterId: parsed.delimiterId
    };
  }

  const summaryRows = parsed.columns.map((column) => summarizeColumn(column, parsed.rows, {
    missingSet,
    trimCells,
    maxTopValues
  }));
  const missingCells = summaryRows.reduce((sum, row) => sum + row.missing_count, 0);
  const numericColumns = summaryRows.filter((row) => row.inferred_type === "number" || row.inferred_type === "integer").length;
  const textColumns = summaryRows.filter((row) => row.inferred_type === "text").length;
  const report = [
    "Table summary / profiler",
    "",
    `Rows: ${parsed.rows.length}`,
    `Columns: ${parsed.columns.length}`,
    `Delimiter: ${parsed.delimiterId}`,
    `Numeric columns: ${numericColumns}`,
    `Text columns: ${textColumns}`,
    `Missing cells: ${missingCells}`,
    `Additional missing tokens: ${[...missingSet].join(", ") || "none"}`,
    "",
    "Column overview:",
    ...summaryRows.map((row) => `- ${row.column}: ${row.inferred_type}; ${row.non_missing_count} non-missing; ${row.distinct_count} distinct`)
  ].join("\n");

  return {
    columns: parsed.columns,
    rows: parsed.rows,
    summaryRows,
    report,
    warnings,
    delimiterId: parsed.delimiterId
  };
}

export function makeTableSummaryTsv(rows) {
  return exportDelimitedTable(tableSummaryColumns, rows, "\t");
}
