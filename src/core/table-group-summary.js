import {
  exportDelimitedTable,
  findColumn,
  parseColumnList,
  parseDelimitedTable
} from "./table.js";

const DEFAULT_OPERATIONS = ["count", "mean", "median", "min", "max", "sd"];
const SUPPORTED_OPERATIONS = new Set(["count", "sum", "mean", "median", "min", "max", "sd", "distinct"]);
const NUMERIC_OPERATIONS = new Set(["sum", "mean", "median", "min", "max", "sd"]);

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

function normalizeOperations(value) {
  const requested = parseColumnList(value).length > 0 ? parseColumnList(value) : DEFAULT_OPERATIONS;
  const operations = [];
  const warnings = [];
  for (const operation of requested) {
    const normalized = operation.toLowerCase();
    if (!SUPPORTED_OPERATIONS.has(normalized)) {
      warnings.push(`Unsupported summary operation "${operation}" was ignored.`);
    } else if (!operations.includes(normalized)) {
      operations.push(normalized);
    }
  }
  return { operations: operations.length > 0 ? operations : DEFAULT_OPERATIONS, warnings };
}

function normalizeColumnId(label, usedIds) {
  const base = String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "column";
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function summarizeValues(values, operation) {
  if (operation === "count") {
    return values.length;
  }
  if (operation === "distinct") {
    return new Set(values).size;
  }
  const numericValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (numericValues.length === 0) {
    return "";
  }
  if (operation === "sum") {
    return roundNumber(numericValues.reduce((sum, value) => sum + value, 0));
  }
  if (operation === "mean") {
    return roundNumber(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length);
  }
  if (operation === "median") {
    return roundNumber(quantile(numericValues, 0.5));
  }
  if (operation === "min") {
    return roundNumber(numericValues[0]);
  }
  if (operation === "max") {
    return roundNumber(numericValues[numericValues.length - 1]);
  }
  if (operation === "sd") {
    const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    return roundNumber(sampleSd(numericValues, mean));
  }
  return "";
}

export function summarizeTableGroups(input, options = {}) {
  const parsed = coerceTableInput(input, options);
  const warnings = [...parsed.warnings];
  const missingSet = makeMissingSet(options.missingValues ?? "NA,N/A,na,n/a,null,NULL,-");
  const trimCells = options.trimCells !== false;
  const groupColumns = parseColumnList(options.groupColumns).map((name) => findColumn(parsed.columns, name)).filter(Boolean);
  const requestedGroupCount = parseColumnList(options.groupColumns).length;
  if (requestedGroupCount > groupColumns.length) {
    warnings.push("One or more requested group columns were not found.");
  }
  const valueColumns = parseColumnList(options.valueColumns).map((name) => findColumn(parsed.columns, name)).filter(Boolean);
  if (parseColumnList(options.valueColumns).length > valueColumns.length) {
    warnings.push("One or more requested value columns were not found.");
  }
  const operationResult = normalizeOperations(options.operations);
  warnings.push(...operationResult.warnings);
  const operations = operationResult.operations;
  const usesNumericOperations = operations.some((operation) => NUMERIC_OPERATIONS.has(operation));

  if (parsed.columns.length === 0) {
    return {
      columns: [],
      rows: [],
      summaryColumns: [],
      summaryRows: [],
      report: "",
      warnings: warnings.length > 0 ? warnings : ["No table input was provided."],
      delimiterId: parsed.delimiterId
    };
  }

  const groups = new Map();
  for (const row of parsed.rows) {
    const keyValues = groupColumns.map((column) => normalizeCell(row[column.id], trimCells));
    const key = JSON.stringify(keyValues);
    if (!groups.has(key)) {
      groups.set(key, { keyValues, rows: [] });
    }
    groups.get(key).rows.push(row);
  }
  if (groupColumns.length === 0) {
    groups.set("[]", { keyValues: [], rows: parsed.rows });
  }

  if (usesNumericOperations) {
    for (const valueColumn of valueColumns) {
      const badCount = parsed.rows
        .map((row) => normalizeCell(row[valueColumn.id], trimCells))
        .filter((value) => !isMissingValue(value, missingSet, false))
        .filter((value) => !Number.isFinite(Number(value))).length;
      if (badCount > 0) {
        warnings.push(
          `Value column "${valueColumn.label}" has ${badCount} non-missing nonnumeric value(s); numeric operations ignore them.`
        );
      }
    }
  }

  const usedIds = new Set();
  const groupSummaryColumns = groupColumns.map((column) => ({
    id: normalizeColumnId(column.label, usedIds),
    label: column.label,
    type: "string"
  }));
  const rowCountColumn = { id: normalizeColumnId("row_count", usedIds), label: "Row count", type: "number" };
  const summaryColumns = [...groupSummaryColumns, rowCountColumn];
  const metricColumns = [];
  for (const valueColumn of valueColumns) {
    for (const operation of operations) {
      const label = `${valueColumn.label} ${operation}`;
      const column = {
        id: normalizeColumnId(`${valueColumn.label}_${operation}`, usedIds),
        label,
        type: "number"
      };
      summaryColumns.push(column);
      metricColumns.push({ column, valueColumn, operation });
    }
  }

  const summaryRows = [...groups.values()].map((group) => {
    const outputRow = {};
    groupColumns.forEach((column, index) => {
      outputRow[summaryColumns[index].id] = group.keyValues[index];
    });
    outputRow[rowCountColumn.id] = group.rows.length;
    for (const metric of metricColumns) {
      const values = group.rows
        .map((row) => normalizeCell(row[metric.valueColumn.id], trimCells))
        .filter((value) => !isMissingValue(value, missingSet, false));
      outputRow[metric.column.id] = summarizeValues(values, metric.operation);
    }
    return outputRow;
  });

  const report = [
    "Table group summary",
    "",
    `Rows: ${parsed.rows.length}`,
    `Columns: ${parsed.columns.length}`,
    `Groups: ${summaryRows.length}`,
    `Group columns: ${groupColumns.map((column) => column.label).join(", ") || "none"}`,
    `Value columns: ${valueColumns.map((column) => column.label).join(", ") || "none"}`,
    `Operations: ${operations.join(", ")}`
  ].join("\n");

  return {
    columns: parsed.columns,
    rows: parsed.rows,
    summaryColumns,
    summaryRows,
    report,
    warnings,
    delimiterId: parsed.delimiterId
  };
}

export function makeGroupSummaryTsv(columns, rows) {
  return exportDelimitedTable(columns, rows, "\t");
}
