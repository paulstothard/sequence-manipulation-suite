import { convertTableDataFormat, tableToDelimited } from "./table-data-format-converter.js";
import { findColumn, parseDelimitedTable } from "./table.js";

const INPUT_FORMATS = new Set(["auto", "csv", "tsv", "json"]);
const OUTPUT_FORMATS = new Set(["table", "csv", "json", "report"]);
const AGGREGATE_FUNCTIONS = new Set(["count", "sum", "avg", "min", "max"]);
const COMPARISON_OPERATORS = ["not like", "is not", ">=", "<=", "!=", "<>", "=", ">", "<", "like", "in", "is"];

export const tableSqlQueryColumns = [];

function normalizeInputFormat(value) {
  return INPUT_FORMATS.has(value) ? value : "auto";
}

function normalizePositiveInteger(value, fallback, max) {
  const number = Number.parseInt(String(value ?? "").trim(), 10);
  const normalized = Number.isFinite(number) && number > 0 ? number : fallback;
  return Math.min(Math.max(1, normalized), max);
}

function inferInputFormat(input, options = {}) {
  const requested = normalizeInputFormat(options.inputFormat ?? "auto");
  if (requested !== "auto") {
    return requested;
  }
  const trimmed = String(input ?? "").trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "json";
  }
  return "auto";
}

function coerceTableInput(input, options = {}) {
  if (input?.kind === "table" && Array.isArray(input.columns) && Array.isArray(input.rows)) {
    return {
      inputFormat: "structured table",
      columns: input.columns,
      rows: input.rows,
      warnings: []
    };
  }
  const inputFormat = inferInputFormat(input, options);
  if (inputFormat === "json") {
    const converted = convertTableDataFormat(input, { inputFormat: "json" });
    return {
      inputFormat,
      columns: converted.columns,
      rows: converted.rows,
      warnings: converted.warnings
    };
  }
  const table = parseDelimitedTable(String(input ?? ""), {
    delimiter: inputFormat === "csv" ? "comma" : inputFormat === "tsv" ? "tab" : options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  return {
    inputFormat: inputFormat === "auto" ? table.delimiterId : inputFormat,
    columns: table.columns,
    rows: table.rows,
    warnings: table.warnings
  };
}

function stripOuterIdentifierQuotes(value) {
  const text = String(value ?? "").trim();
  if (
    (text.startsWith("`") && text.endsWith("`")) ||
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    return text.slice(1, -1).replace(/``/g, "`").replace(/""/g, '"');
  }
  return text;
}

function normalizeIdentifier(value) {
  return stripOuterIdentifierQuotes(value)
    .trim()
    .toLowerCase()
    .replace(/^table\./, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitTopLevel(text, separator = ",") {
  const parts = [];
  let current = "";
  let quote = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      current += character;
      if (character === quote) {
        if (text[index + 1] === quote) {
          current += text[index + 1];
          index += 1;
        } else {
          quote = "";
        }
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      current += character;
      continue;
    }
    if (character === ")") {
      depth = Math.max(0, depth - 1);
      current += character;
      continue;
    }
    if (depth === 0 && character === separator) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function findKeyword(sql, keyword, start = 0) {
  const lower = sql.toLowerCase();
  const target = keyword.toLowerCase();
  let quote = "";
  let depth = 0;
  for (let index = start; index <= sql.length - target.length; index += 1) {
    const character = sql[index];
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote) {
          index += 1;
        } else {
          quote = "";
        }
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0 || lower.slice(index, index + target.length) !== target) {
      continue;
    }
    const before = index === 0 ? " " : lower[index - 1];
    const after = index + target.length >= lower.length ? " " : lower[index + target.length];
    if (!/[a-z0-9_]/.test(before) && !/[a-z0-9_]/.test(after)) {
      return index;
    }
  }
  return -1;
}

function parseSql(sqlText) {
  const sql = String(sqlText ?? "").trim().replace(/;+$/g, "").trim();
  if (!sql) {
    throw new Error("Enter a SELECT query.");
  }
  if (!/^select\b/i.test(sql)) {
    throw new Error("Only SELECT queries are supported.");
  }
  const clauseKeywords = [
    { key: "from", keyword: " from " },
    { key: "where", keyword: " where " },
    { key: "groupBy", keyword: " group by " },
    { key: "orderBy", keyword: " order by " },
    { key: "limit", keyword: " limit " }
  ];
  const positions = clauseKeywords
    .map((clause) => ({ ...clause, index: findKeyword(sql, clause.keyword.trim(), 6) }))
    .filter((clause) => clause.index >= 0)
    .sort((a, b) => a.index - b.index);

  const firstClause = positions[0];
  const select = sql.slice(6, firstClause?.index ?? sql.length).trim();
  if (!select) {
    throw new Error("The SELECT clause is empty.");
  }
  const clauses = { select };
  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index];
    const next = positions[index + 1];
    const start = current.index + current.keyword.trim().length;
    clauses[current.key] = sql.slice(start, next?.index ?? sql.length).trim();
  }
  return clauses;
}

function parseAlias(expression) {
  const asIndex = findKeyword(expression, "as");
  if (asIndex >= 0) {
    return {
      expression: expression.slice(0, asIndex).trim(),
      alias: stripOuterIdentifierQuotes(expression.slice(asIndex + 2).trim())
    };
  }
  const parts = expression.match(/^(.+?)\s+([A-Za-z_][A-Za-z0-9_]*)$/);
  if (parts && !/\)$/.test(parts[1].trim())) {
    return { expression: parts[1].trim(), alias: parts[2].trim() };
  }
  return { expression: expression.trim(), alias: "" };
}

function resolveColumn(columns, name) {
  const cleaned = stripOuterIdentifierQuotes(name).replace(/^table\./i, "");
  return findColumn(columns, cleaned) ??
    columns.find((column) => normalizeIdentifier(column.label) === normalizeIdentifier(cleaned)) ??
    columns.find((column) => normalizeIdentifier(column.id) === normalizeIdentifier(cleaned)) ??
    null;
}

function parseSelectItems(selectText, columns) {
  const rawItems = splitTopLevel(selectText);
  const items = [];
  for (const rawItem of rawItems) {
    if (rawItem === "*") {
      items.push({ kind: "star" });
      continue;
    }
    const { expression, alias } = parseAlias(rawItem);
    const aggregateMatch = expression.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
    if (aggregateMatch) {
      const fn = aggregateMatch[1].toLowerCase();
      const argument = aggregateMatch[2].trim();
      if (!AGGREGATE_FUNCTIONS.has(fn)) {
        throw new Error(`Unsupported aggregate function "${aggregateMatch[1]}".`);
      }
      if (fn !== "count" && argument === "*") {
        throw new Error(`${aggregateMatch[1]}(*) is not supported; use count(*) or a numeric column.`);
      }
      const column = argument === "*" ? null : resolveColumn(columns, argument);
      if (argument !== "*" && !column) {
        throw new Error(`Column "${argument}" in SELECT was not found.`);
      }
      const label = alias || `${fn}_${argument === "*" ? "rows" : column.id}`;
      items.push({ kind: "aggregate", fn, column, label });
      continue;
    }
    const column = resolveColumn(columns, expression);
    if (!column) {
      throw new Error(`Column "${expression}" in SELECT was not found.`);
    }
    items.push({ kind: "column", column, label: alias || column.label });
  }
  return items;
}

function parseColumnListExpression(value, columns, clauseName) {
  if (!value) {
    return [];
  }
  return splitTopLevel(value).map((name) => {
    const column = resolveColumn(columns, name);
    if (!column) {
      throw new Error(`Column "${name}" in ${clauseName} was not found.`);
    }
    return column;
  });
}

function unquoteLiteral(value) {
  const text = String(value ?? "").trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).replace(/''/g, "'").replace(/""/g, '"');
  }
  return text;
}

function parseLiteral(value) {
  const text = unquoteLiteral(value);
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) {
    return Number(text);
  }
  if (/^null$/i.test(text)) {
    return "";
  }
  return text;
}

function splitWhereConditions(whereText) {
  if (!whereText) {
    return [];
  }
  const parts = [];
  let current = "";
  let quote = "";
  let depth = 0;
  const source = String(whereText);
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      current += character;
      if (character === quote) {
        if (source[index + 1] === quote) {
          current += source[index + 1];
          index += 1;
        } else {
          quote = "";
        }
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === "(") {
      depth += 1;
      current += character;
      continue;
    }
    if (character === ")") {
      depth = Math.max(0, depth - 1);
      current += character;
      continue;
    }
    if (depth === 0 && /^and\b/i.test(source.slice(index).trimStart())) {
      const leading = source.slice(index).match(/^\s*/)[0].length;
      const wordStart = index + leading;
      if (/^and\b/i.test(source.slice(wordStart))) {
        parts.push(current.trim());
        current = "";
        index = wordStart + 2;
        continue;
      }
    }
    current += character;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseCondition(text, columns) {
  const condition = String(text ?? "").trim();
  for (const operator of COMPARISON_OPERATORS) {
    let index = findKeyword(condition, operator);
    if (index < 0 && /^[<>=!]+$/.test(operator)) {
      index = condition.indexOf(operator);
    }
    if (index < 0) {
      continue;
    }
    const columnText = condition.slice(0, index).trim();
    const valueText = condition.slice(index + operator.length).trim();
    const column = resolveColumn(columns, columnText);
    if (!column) {
      throw new Error(`Column "${columnText}" in WHERE was not found.`);
    }
    const normalizedOperator = operator.toLowerCase();
    if (normalizedOperator === "in") {
      const trimmed = valueText.trim();
      if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
        throw new Error("WHERE IN expects a parenthesized value list.");
      }
      return {
        column,
        operator: normalizedOperator,
        value: splitTopLevel(trimmed.slice(1, -1)).map(parseLiteral)
      };
    }
    return { column, operator: normalizedOperator, value: parseLiteral(valueText) };
  }
  throw new Error(`Could not parse WHERE condition "${condition}".`);
}

function parseWhere(whereText, columns) {
  return splitWhereConditions(whereText).map((condition) => parseCondition(condition, columns));
}

function compareCell(row, condition) {
  const rawValue = row[condition.column.id] ?? "";
  const leftText = String(rawValue);
  const leftNumber = Number(leftText);
  const rightNumber = Number(condition.value);
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  const compare = bothNumeric
    ? leftNumber - rightNumber
    : leftText.localeCompare(String(condition.value ?? ""), undefined, { numeric: true });
  switch (condition.operator) {
    case "=":
      return bothNumeric ? compare === 0 : leftText === String(condition.value ?? "");
    case "!=":
    case "<>":
      return bothNumeric ? compare !== 0 : leftText !== String(condition.value ?? "");
    case ">":
      return compare > 0;
    case ">=":
      return compare >= 0;
    case "<":
      return compare < 0;
    case "<=":
      return compare <= 0;
    case "like":
      return leftText.toLowerCase().includes(String(condition.value ?? "").replaceAll("%", "").toLowerCase());
    case "not like":
      return !leftText.toLowerCase().includes(String(condition.value ?? "").replaceAll("%", "").toLowerCase());
    case "in":
      return condition.value.some((item) => {
        const itemNumber = Number(item);
        return Number.isFinite(leftNumber) && Number.isFinite(itemNumber)
          ? leftNumber === itemNumber
          : leftText === String(item ?? "");
      });
    case "is":
      return String(condition.value ?? "").trim() === "" ? leftText.trim() === "" : leftText === String(condition.value ?? "");
    case "is not":
      return String(condition.value ?? "").trim() === "" ? leftText.trim() !== "" : leftText !== String(condition.value ?? "");
    default:
      return false;
  }
}

function applyWhere(rows, conditions) {
  if (conditions.length === 0) {
    return rows;
  }
  return rows.filter((row) => conditions.every((condition) => compareCell(row, condition)));
}

function aggregateValue(fn, column, rows) {
  if (fn === "count") {
    if (!column) {
      return rows.length;
    }
    return rows.filter((row) => String(row[column.id] ?? "").trim() !== "").length;
  }
  const values = rows
    .map((row) => Number(row[column.id]))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return "";
  }
  if (fn === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (fn === "avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (fn === "min") return Math.min(...values);
  if (fn === "max") return Math.max(...values);
  return "";
}

function formatAggregateValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toPrecision(12)) : value;
}

function groupRows(rows, groupColumns) {
  if (groupColumns.length === 0) {
    return [{ rows, key: "__all__" }];
  }
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify(groupColumns.map((column) => row[column.id] ?? ""));
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, groupRowsValue]) => ({ key, rows: groupRowsValue }));
}

function makeUniqueColumnId(label, index, usedIds) {
  const base = normalizeIdentifier(label) || `column_${index + 1}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function buildOutputColumns(selectItems) {
  const usedIds = new Set();
  return selectItems.map((item, index) => {
    const label = item.label || item.column?.label || `Column ${index + 1}`;
    return {
      id: makeUniqueColumnId(label, index, usedIds),
      label,
      type: item.kind === "aggregate" && item.fn !== "count" ? "number" : item.column?.type ?? "string"
    };
  });
}

function ensureSelectedColumnsAreGrouped(selectItems, groupColumns) {
  if (groupColumns.length === 0) {
    return;
  }
  const groupIds = new Set(groupColumns.map((column) => column.id));
  for (const item of selectItems) {
    if (item.kind === "column" && !groupIds.has(item.column.id)) {
      throw new Error(`Column "${item.column.label}" must appear in GROUP BY or be used in an aggregate.`);
    }
  }
}

function runProjection(rows, columns, selectItems, groupColumns, maxOutputRows) {
  if (selectItems.length === 1 && selectItems[0].kind === "star" && groupColumns.length === 0) {
    return { columns, rows };
  }
  const hasAggregate = selectItems.some((item) => item.kind === "aggregate");
  if (selectItems.some((item) => item.kind === "star")) {
    throw new Error("SELECT * cannot be combined with grouped or aggregate output.");
  }
  if (hasAggregate && groupColumns.length === 0 && selectItems.some((item) => item.kind === "column")) {
    throw new Error("Non-aggregate columns must appear in GROUP BY when aggregate functions are used.");
  }
  if (!hasAggregate && groupColumns.length === 0) {
    const outputColumns = buildOutputColumns(selectItems);
    const outputRows = rows.map((row) =>
      Object.fromEntries(selectItems.map((item, index) => [
        outputColumns[index].id,
        row[item.column.id] ?? ""
      ]))
    );
    return { columns: outputColumns, rows: outputRows };
  }
  ensureSelectedColumnsAreGrouped(selectItems, groupColumns);
  const grouped = groupRows(rows, groupColumns);
  const outputColumns = buildOutputColumns(selectItems);
  const outputRows = [];
  for (const group of grouped) {
    const out = {};
    for (let index = 0; index < selectItems.length; index += 1) {
      const item = selectItems[index];
      const outputColumn = outputColumns[index];
      if (item.kind === "column") {
        out[outputColumn.id] = group.rows[0]?.[item.column.id] ?? "";
      } else if (item.kind === "aggregate") {
        out[outputColumn.id] = formatAggregateValue(aggregateValue(item.fn, item.column, group.rows));
      }
    }
    outputRows.push(out);
    if (outputRows.length >= maxOutputRows) {
      break;
    }
  }
  return { columns: outputColumns, rows: outputRows };
}

function parseOrderBy(orderByText, outputColumns) {
  return splitTopLevel(orderByText ?? "").map((part) => {
    const match = part.match(/^(.+?)(?:\s+(asc|desc))?$/i);
    const columnText = match?.[1]?.trim() ?? "";
    const direction = (match?.[2] ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
    const column = resolveColumn(outputColumns, columnText);
    if (!column) {
      throw new Error(`Column "${columnText}" in ORDER BY was not found in the query result.`);
    }
    return { column, direction };
  });
}

function applyOrderBy(rows, sortRules) {
  if (sortRules.length === 0) {
    return rows;
  }
  return [...rows].sort((left, right) => {
    for (const rule of sortRules) {
      const leftValue = left[rule.column.id] ?? "";
      const rightValue = right[rule.column.id] ?? "";
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const comparison = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
      if (comparison !== 0) {
        return rule.direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

function parseLimit(limitText, maxOutputRows) {
  if (!limitText) {
    return maxOutputRows;
  }
  const match = String(limitText).trim().match(/^\d+/);
  if (!match) {
    throw new Error("LIMIT expects a positive integer.");
  }
  return Math.min(Number.parseInt(match[0], 10), maxOutputRows);
}

function makeReport(result) {
  return [
    "Table SQL query",
    `Input format interpreted as: ${result.inputFormat}`,
    `Input rows: ${result.inputRows}`,
    `Input columns: ${result.inputColumns}`,
    `Rows after WHERE: ${result.filteredRows}`,
    `Output rows: ${result.rows.length}`,
    `Output columns: ${result.columns.length}`,
    `Query: ${result.query}`,
    ...result.warnings.map((warning) => `Warning: ${warning}`)
  ].join("\n") + "\n";
}

export function runTableSqlQueryCore(input, options = {}, context = {}) {
  const maxInputRows = normalizePositiveInteger(options.maxInputRows, 50000, 1000000);
  const maxOutputRows = normalizePositiveInteger(options.maxOutputRows, 10000, 1000000);
  const warnings = [];
  const parsed = coerceTableInput(input, options);
  warnings.push(...parsed.warnings);
  if (parsed.rows.length > maxInputRows) {
    warnings.push(`Only the first ${maxInputRows.toLocaleString()} input row(s) were queried because the input-row limit was reached.`);
  }
  const inputRows = parsed.rows.slice(0, maxInputRows);
  if (parsed.columns.length === 0) {
    return {
      inputFormat: parsed.inputFormat,
      inputRows: 0,
      inputColumns: 0,
      filteredRows: 0,
      columns: [],
      rows: [],
      tsv: "",
      csv: "",
      json: "[]",
      report: "Table SQL query\nWarning: No table input was provided.\n",
      query: "",
      warnings: warnings.length > 0 ? warnings : ["No table input was provided."]
    };
  }

  context?.throwIfCancelled?.();
  const query = String(options.sqlQuery ?? "SELECT * FROM table LIMIT 20").trim();
  const clauses = parseSql(query);
  const selectItems = parseSelectItems(clauses.select, parsed.columns);
  const conditions = parseWhere(clauses.where, parsed.columns);
  const groupColumns = parseColumnListExpression(clauses.groupBy, parsed.columns, "GROUP BY");
  const filteredRows = applyWhere(inputRows, conditions);
  context?.throwIfCancelled?.();

  const projected = runProjection(filteredRows, parsed.columns, selectItems, groupColumns, maxOutputRows);
  const sortedRows = applyOrderBy(projected.rows, parseOrderBy(clauses.orderBy, projected.columns));
  const limit = parseLimit(clauses.limit, maxOutputRows);
  const rows = sortedRows.slice(0, limit);
  if (projected.rows.length > rows.length || filteredRows.length > maxOutputRows) {
    warnings.push(`Query output was limited to ${rows.length.toLocaleString()} row(s).`);
  }
  const tsv = tableToDelimited(projected.columns, rows, "\t");
  const csv = tableToDelimited(projected.columns, rows, ",");
  const json = JSON.stringify(rows.map((row) =>
    Object.fromEntries(projected.columns.map((column) => [column.label, row[column.id] ?? ""]))
  ), null, 2);
  const result = {
    inputFormat: parsed.inputFormat,
    inputRows: parsed.rows.length,
    inputColumns: parsed.columns.length,
    filteredRows: filteredRows.length,
    columns: projected.columns,
    rows,
    tsv,
    csv,
    json,
    query,
    warnings
  };
  return { ...result, report: makeReport(result) };
}

export function normalizeTableSqlOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "table";
}
