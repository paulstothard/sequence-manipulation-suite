import {
  exportDelimitedTable,
  findColumn,
  parseDelimitedTable
} from "./table.js";

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

function normalizeColumnId(label, usedIds) {
  const base = String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "calculated";
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function toNumber(value) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) ? number : null;
}

function roundNumber(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(digits));
}

function sampleSd(values, mean) {
  if (values.length < 2) {
    return null;
  }
  const sumSquares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

function calculateValue(left, right, operation) {
  if (left === null) {
    return "";
  }
  if (operation === "log2") {
    return left > 0 ? Math.log2(left) : "";
  }
  if (operation === "log10") {
    return left > 0 ? Math.log10(left) : "";
  }
  if (right === null) {
    return "";
  }
  if (operation === "add") {
    return left + right;
  }
  if (operation === "subtract") {
    return left - right;
  }
  if (operation === "multiply") {
    return left * right;
  }
  if (operation === "divide") {
    return right === 0 ? "" : left / right;
  }
  if (operation === "percent") {
    return right === 0 ? "" : (left / right) * 100;
  }
  return "";
}

export function calculateTableColumn(input, options = {}) {
  const parsed = coerceTableInput(input, options);
  const warnings = [...parsed.warnings];
  const leftColumn = findColumn(parsed.columns, options.leftColumn);
  const rightColumn = findColumn(parsed.columns, options.rightColumn);
  const operation = ["add", "subtract", "multiply", "divide", "percent", "log2", "log10", "zscore"].includes(options.operation)
    ? options.operation
    : "divide";
  if (!leftColumn) {
    warnings.push(`Left column "${options.leftColumn ?? ""}" was not found.`);
  }
  if (!rightColumn && !["log2", "log10", "zscore"].includes(operation) && String(options.constant ?? "").trim() === "") {
    warnings.push(`Right column "${options.rightColumn ?? ""}" was not found and no constant was supplied.`);
  }

  const usedIds = new Set(parsed.columns.map((column) => column.id));
  const resultLabel = String(options.resultColumn ?? "").trim() || "calculated_value";
  const resultColumn = {
    id: normalizeColumnId(resultLabel, usedIds),
    label: resultLabel,
    type: "number"
  };
  const outputColumns = [...parsed.columns, resultColumn];
  const leftValues = parsed.rows.map((row) => toNumber(leftColumn ? row[leftColumn.id] : ""));
  const zMean = leftValues.filter((value) => value !== null).reduce((sum, value) => sum + value, 0) / Math.max(1, leftValues.filter((value) => value !== null).length);
  const zSd = sampleSd(leftValues.filter((value) => value !== null), zMean);
  const constant = toNumber(options.constant);
  let invalidRows = 0;
  const outputRows = parsed.rows.map((row, rowIndex) => {
    const left = leftValues[rowIndex];
    const right = rightColumn ? toNumber(row[rightColumn.id]) : constant;
    let value = operation === "zscore"
      ? left !== null && zSd ? (left - zMean) / zSd : ""
      : calculateValue(left, right, operation);
    if (value === "") {
      invalidRows += 1;
    } else {
      value = roundNumber(value);
    }
    return { ...row, [resultColumn.id]: value };
  });
  if (invalidRows > 0) {
    warnings.push(`${invalidRows} row(s) produced a blank calculated value because input values were missing, non-numeric, or invalid for the operation.`);
  }

  const report = [
    "Table column calculator",
    "",
    `Rows: ${parsed.rows.length}`,
    `Columns: ${parsed.columns.length}`,
    `Operation: ${operation}`,
    `Left column: ${leftColumn?.label ?? "not found"}`,
    `Right column: ${rightColumn?.label ?? (constant !== null ? `constant ${constant}` : "none")}`,
    `Result column: ${resultColumn.label}`,
    `Blank calculated values: ${invalidRows}`
  ].join("\n");

  return {
    columns: parsed.columns,
    rows: parsed.rows,
    outputColumns,
    outputRows,
    report,
    warnings,
    delimiterId: parsed.delimiterId
  };
}

export function makeCalculatedTableTsv(columns, rows) {
  return exportDelimitedTable(columns, rows, "\t");
}
