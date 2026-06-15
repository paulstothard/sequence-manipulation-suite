const DELIMITER_CANDIDATES = [
  { id: "tab", label: "Tab", value: "\t" },
  { id: "comma", label: "Comma", value: "," },
  { id: "semicolon", label: "Semicolon", value: ";" },
  { id: "pipe", label: "Pipe", value: "|" }
];

function makeWarning(message) {
  return message;
}

function countDelimiterOutsideQuotes(line, delimiter) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === delimiter) {
      count += 1;
    }
  }

  return count;
}

function splitPhysicalLines(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.length > 0);
}

export function detectDelimiter(text) {
  const lines = splitPhysicalLines(text).slice(0, 25);
  if (lines.length === 0) {
    return { delimiter: "\t", delimiterId: "tab", confidence: 0 };
  }

  const scored = DELIMITER_CANDIDATES.map((candidate) => {
    const counts = lines.map((line) => countDelimiterOutsideQuotes(line, candidate.value));
    const positiveCounts = counts.filter((count) => count > 0);
    if (positiveCounts.length === 0) {
      return { ...candidate, score: 0, consistency: 0, averageFields: 1 };
    }

    const frequencies = new Map();
    for (const count of positiveCounts) {
      frequencies.set(count, (frequencies.get(count) ?? 0) + 1);
    }
    const mostCommon = [...frequencies.entries()].sort((a, b) => b[1] - a[1])[0];
    const consistency = mostCommon[1] / positiveCounts.length;
    const coverage = positiveCounts.length / lines.length;
    const averageFields = positiveCounts.reduce((total, count) => total + count + 1, 0) / positiveCounts.length;

    return {
      ...candidate,
      score: consistency * coverage * averageFields,
      consistency,
      averageFields
    };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  return {
    delimiter: best.value,
    delimiterId: best.id,
    confidence: best.score === 0 ? 0 : Number(Math.min(1, best.consistency).toFixed(3))
  };
}

export function parseDelimitedRows(text, delimiter = "\t") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let hadQuotedField = false;
  const warnings = [];
  const source = String(text ?? "").replace(/\r\n?/g, "\n");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
        hadQuotedField = true;
      }
      continue;
    }

    if (!inQuotes && character === delimiter) {
      row.push(field);
      field = "";
      hadQuotedField = false;
      continue;
    }

    if (!inQuotes && character === "\n") {
      row.push(field);
      if (row.some((value) => value.length > 0) || hadQuotedField) {
        rows.push(row);
      }
      row = [];
      field = "";
      hadQuotedField = false;
      continue;
    }

    field += character;
  }

  if (inQuotes) {
    warnings.push(makeWarning("A quoted field was not closed before the end of the input."));
  }

  row.push(field);
  if (row.some((value) => value.length > 0) || hadQuotedField) {
    rows.push(row);
  }

  return { rows, warnings };
}

function normalizeColumnId(label, index, usedIds) {
  const base = String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || `column_${index + 1}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function inferColumnType(values) {
  const nonEmpty = values.filter((value) => String(value ?? "").trim() !== "");
  if (nonEmpty.length === 0) {
    return "string";
  }
  const numeric = nonEmpty.every((value) => Number.isFinite(Number(String(value).trim())));
  return numeric ? "number" : "string";
}

export function buildTableFromRows(parsedRows, { hasHeader = true } = {}) {
  const warnings = [];
  if (parsedRows.length === 0) {
    return { columns: [], rows: [], warnings: [makeWarning("No table rows were found.")] };
  }

  const expectedWidth = Math.max(...parsedRows.map((row) => row.length));
  const rawHeader = hasHeader
    ? parsedRows[0]
    : Array.from({ length: expectedWidth }, (_, index) => `Column ${index + 1}`);
  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;

  const usedIds = new Set();
  const seenLabels = new Map();
  const columns = Array.from({ length: expectedWidth }, (_, index) => {
    const rawLabel = String(rawHeader[index] ?? "").trim();
    const label = rawLabel || `Column ${index + 1}`;
    if (!rawLabel) {
      warnings.push(makeWarning(`Column ${index + 1} had an empty header; renamed to "${label}".`));
    }
    const duplicateCount = seenLabels.get(label.toLowerCase()) ?? 0;
    seenLabels.set(label.toLowerCase(), duplicateCount + 1);
    if (duplicateCount > 0) {
      warnings.push(makeWarning(`Duplicate header "${label}" was renamed internally.`));
    }
    return {
      id: normalizeColumnId(label, index, usedIds),
      label,
      type: "string"
    };
  });

  const rows = dataRows.map((dataRow, rowIndex) => {
    if (dataRow.length !== expectedWidth) {
      warnings.push(
        makeWarning(`Row ${hasHeader ? rowIndex + 2 : rowIndex + 1} has ${dataRow.length} field(s); expected ${expectedWidth}.`)
      );
    }
    return Object.fromEntries(
      columns.map((column, columnIndex) => [column.id, dataRow[columnIndex] ?? ""])
    );
  });

  for (const column of columns) {
    column.type = inferColumnType(rows.map((row) => row[column.id]));
    if (rows.length > 0 && rows.every((row) => String(row[column.id] ?? "").trim() === "")) {
      warnings.push(makeWarning(`Column "${column.label}" is empty for all rows.`));
    }
  }

  return { columns, rows, warnings };
}

export function parseDelimitedTable(input, options = {}) {
  const delimiterChoice = options.delimiter ?? "auto";
  const detection = delimiterChoice === "auto"
    ? detectDelimiter(input)
    : {
      delimiter: DELIMITER_CANDIDATES.find((candidate) => candidate.id === delimiterChoice)?.value ?? "\t",
      delimiterId: delimiterChoice,
      confidence: 1
    };
  const parsed = parseDelimitedRows(input, detection.delimiter);
  const table = buildTableFromRows(parsed.rows, { hasHeader: options.hasHeader !== false });

  return {
    delimiter: detection.delimiter,
    delimiterId: detection.delimiterId,
    delimiterConfidence: detection.confidence,
    columns: table.columns,
    rows: table.rows,
    warnings: [...parsed.warnings, ...table.warnings]
  };
}

export function findColumn(columns, name) {
  const query = String(name ?? "").trim().toLowerCase();
  if (!query) {
    return null;
  }
  return columns.find(
    (column) => column.id.toLowerCase() === query || column.label.toLowerCase() === query
  ) ?? null;
}

export function parseColumnList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitRuleLine(line) {
  if (line.includes("|")) {
    return line.split("|").map((part) => part.trim());
  }
  return line.split(",").map((part) => part.trim());
}

export function parseTableFilterRules(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [column = "", operator = "", ...rest] = splitRuleLine(line);
      return {
        column,
        operator: operator || "contains",
        value: rest.join("|").trim()
      };
    });
}

export function parseTableSortRules(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [column = "", direction = "asc"] = splitRuleLine(line);
      return {
        column,
        direction: String(direction || "asc").toLowerCase() === "desc" ? "desc" : "asc"
      };
    });
}

export function parseTableColumnFilterRules(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [operator = "", ...rest] = splitRuleLine(line);
      return {
        operator: operator || "contains",
        value: rest.join("|").trim()
      };
    });
}

function compareValues(left, right, type) {
  if (type === "number") {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
  }
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true });
}

function normalizeCellValue(value, options = {}) {
  let text = String(value ?? "");
  if (options.trimWhitespace !== false) {
    text = text.trim();
  }
  if (options.collapseWhitespace === true) {
    text = text.replace(/\s+/g, " ");
  }
  return text;
}

function makeMissingValueSet(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeRows(columns, rows, options = {}) {
  const missingValues = makeMissingValueSet(options.missingValues ?? "");
  const standardizeMissing = options.standardizeMissing === true;
  let normalizedCells = 0;
  let missingValuesStandardized = 0;
  const normalizedRows = rows.map((row) => {
    const normalizedRow = {};
    for (const column of columns) {
      const original = row[column.id] ?? "";
      let value = normalizeCellValue(original, options);
      if (standardizeMissing && missingValues.has(value.toLowerCase())) {
        value = "";
        missingValuesStandardized += 1;
      }
      if (value !== String(original ?? "")) {
        normalizedCells += 1;
      }
      normalizedRow[column.id] = value;
    }
    return normalizedRow;
  });
  return { rows: normalizedRows, normalizedCells, missingValuesStandardized };
}

function filterRow(row, column, operator, filterValue) {
  const cell = String(row[column.id] ?? "");
  const cellNumber = Number(cell);
  const filterNumber = Number(filterValue);
  if (operator === "contains") {
    return cell.toLowerCase().includes(filterValue.toLowerCase());
  }
  if (operator === "not_contains") {
    return !cell.toLowerCase().includes(filterValue.toLowerCase());
  }
  if (operator === "equals") {
    return cell === filterValue;
  }
  if (operator === "not_equals") {
    return cell !== filterValue;
  }
  if (operator === "not_empty") {
    return cell.trim() !== "";
  }
  if (operator === "empty") {
    return cell.trim() === "";
  }
  if (!Number.isFinite(cellNumber) || !Number.isFinite(filterNumber)) {
    return false;
  }
  if (operator === "gt") {
    return cellNumber > filterNumber;
  }
  if (operator === "gte") {
    return cellNumber >= filterNumber;
  }
  if (operator === "lt") {
    return cellNumber < filterNumber;
  }
  if (operator === "lte") {
    return cellNumber <= filterNumber;
  }
  return true;
}

const FILTER_OPERATORS = new Set([
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "not_empty",
  "empty",
  "gt",
  "gte",
  "lt",
  "lte"
]);

const COLUMN_FILTER_OPERATORS = new Set([
  "contains",
  "not_contains",
  "equals",
  "not_equals",
  "starts_with",
  "ends_with"
]);

function applyFilterRule(rows, columns, rule, warnings) {
  if ((rule.operator ?? "none") === "none") {
    return rows;
  }
  if (!FILTER_OPERATORS.has(rule.operator)) {
    warnings.push(makeWarning(`Filter rule "${rule.operator ?? ""}" is not supported.`));
    return rows;
  }
  const filterColumn = findColumn(columns, rule.column);
  if (!filterColumn) {
    warnings.push(makeWarning(`Filter column "${rule.column ?? ""}" was not found.`));
    return rows;
  }
  const filterValue = String(rule.value ?? "");
  const before = rows.length;
  const filteredRows = rows.filter((row) => filterRow(row, filterColumn, rule.operator, filterValue));
  return Object.assign(filteredRows, { removedCount: before - filteredRows.length });
}

function removeEmptyRows(columns, rows) {
  const before = rows.length;
  const filteredRows = rows.filter((row) =>
    columns.some((column) => String(row[column.id] ?? "").trim() !== "")
  );
  return { rows: filteredRows, removedCount: before - filteredRows.length };
}

function removeEmptyColumns(columns, rows) {
  const keptColumns = columns.filter((column) =>
    rows.some((row) => String(row[column.id] ?? "").trim() !== "")
  );
  if (keptColumns.length === 0) {
    return { columns, rows, removedCount: 0, ignored: columns.length > 0 };
  }
  const keptIds = new Set(keptColumns.map((column) => column.id));
  return {
    columns: keptColumns,
    rows: rows.map((row) => Object.fromEntries(columns.filter((column) => keptIds.has(column.id)).map((column) => [column.id, row[column.id] ?? ""]))),
    removedCount: columns.length - keptColumns.length,
    ignored: false
  };
}

function columnMatchesRule(column, rule) {
  const query = String(rule.value ?? "").trim().toLowerCase();
  if (!query) {
    return true;
  }
  const candidates = [column.label, column.id].map((value) => String(value ?? "").toLowerCase());
  if (rule.operator === "contains") {
    return candidates.some((value) => value.includes(query));
  }
  if (rule.operator === "not_contains") {
    return candidates.every((value) => !value.includes(query));
  }
  if (rule.operator === "equals") {
    return candidates.some((value) => value === query);
  }
  if (rule.operator === "not_equals") {
    return candidates.every((value) => value !== query);
  }
  if (rule.operator === "starts_with") {
    return candidates.some((value) => value.startsWith(query));
  }
  if (rule.operator === "ends_with") {
    return candidates.some((value) => value.endsWith(query));
  }
  return true;
}

function filterColumnsByRules(columns, rows, rules, action, warnings) {
  const validRules = [];
  for (const rule of rules) {
    if (!COLUMN_FILTER_OPERATORS.has(rule.operator)) {
      warnings.push(makeWarning(`Column filter rule "${rule.operator ?? ""}" is not supported.`));
    } else {
      validRules.push(rule);
    }
  }
  if (validRules.length === 0 || action === "all") {
    return { columns, rows, removedCount: 0 };
  }
  const matchedIds = new Set(
    columns
      .filter((column) => validRules.every((rule) => columnMatchesRule(column, rule)))
      .map((column) => column.id)
  );
  const keptColumns = action === "remove"
    ? columns.filter((column) => !matchedIds.has(column.id))
    : columns.filter((column) => matchedIds.has(column.id));
  if (keptColumns.length === 0) {
    warnings.push(makeWarning("Column filtering was ignored because it would remove every column."));
    return { columns, rows, removedCount: 0 };
  }
  return {
    columns: keptColumns,
    rows: rows.map((row) => Object.fromEntries(keptColumns.map((column) => [column.id, row[column.id] ?? ""]))),
    removedCount: columns.length - keptColumns.length
  };
}

function sortRowsByRules(columns, rows, rules, warnings) {
  const sortRules = [];
  for (const rule of rules) {
    const column = findColumn(columns, rule.column);
    if (!column) {
      warnings.push(makeWarning(`Sort column "${rule.column ?? ""}" was not found.`));
    } else {
      sortRules.push({ column, direction: rule.direction === "desc" ? "desc" : "asc" });
    }
  }
  if (sortRules.length === 0) {
    return rows;
  }
  return [...rows].sort((left, right) => {
    for (const rule of sortRules) {
      const comparison = compareValues(left[rule.column.id], right[rule.column.id], rule.column.type);
      if (comparison !== 0) {
        return rule.direction === "desc" ? -comparison : comparison;
      }
    }
    return 0;
  });
}

export function applyTableOperations(table, options = {}) {
  const warnings = [];
  let columns = table.columns.map((column) => ({ ...column }));
  let rows = table.rows.map((row) => ({ ...row }));
  const stats = {
    inputRows: rows.length,
    inputColumns: columns.length,
    normalizedCells: 0,
    missingValuesStandardized: 0,
    emptyRowsRemoved: 0,
    emptyColumnsRemoved: 0,
    rowsRemovedByFilters: 0,
    columnsRemovedByFilters: 0,
    duplicateRowsRemoved: 0,
    outputRows: 0,
    outputColumns: 0
  };

  const normalized = normalizeRows(columns, rows, options);
  rows = normalized.rows;
  stats.normalizedCells = normalized.normalizedCells;
  stats.missingValuesStandardized = normalized.missingValuesStandardized;

  const filterOperator = options.filterOperator ?? "none";
  const filterRules = [];
  if (filterOperator !== "none") {
    filterRules.push({
      column: options.filterColumn,
      operator: filterOperator,
      value: String(options.filterValue ?? "")
    });
  }
  filterRules.push(...parseTableFilterRules(options.filterRules));
  for (const rule of filterRules) {
    const filteredRows = applyFilterRule(rows, columns, rule, warnings);
    stats.rowsRemovedByFilters += filteredRows.removedCount ?? 0;
    rows = filteredRows;
  }

  const sortDirection = options.sortDirection ?? "none";
  const sortRules = [];
  if (sortDirection !== "none") {
    sortRules.push({ column: options.sortColumn, direction: sortDirection });
  }
  sortRules.push(...parseTableSortRules(options.sortRules));

  if (options.removeDuplicates === true) {
    const before = rows.length;
    const seen = new Set();
    rows = rows.filter((row) => {
      const key = JSON.stringify(columns.map((column) => row[column.id] ?? ""));
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    stats.duplicateRowsRemoved = before - rows.length;
  }

  rows = sortRowsByRules(columns, rows, sortRules, warnings);

  const columnAction = options.columnFilterAction ?? options.columnAction ?? (options.selectedColumns ? "keep" : "all");
  const columnFilterRules = parseTableColumnFilterRules(options.columnFilterRules);
  if (columnFilterRules.length > 0) {
    const columnFilterResult = filterColumnsByRules(columns, rows, columnFilterRules, columnAction, warnings);
    columns = columnFilterResult.columns;
    rows = columnFilterResult.rows;
    stats.columnsRemovedByFilters = columnFilterResult.removedCount;
  }

  const selectedNames = parseColumnList(options.columnList ?? options.selectedColumns);
  if (columnFilterRules.length === 0 && columnAction === "keep" && selectedNames.length > 0) {
    const selectedColumns = [];
    for (const name of selectedNames) {
      const column = findColumn(columns, name);
      if (column) {
        selectedColumns.push(column);
      } else {
        warnings.push(makeWarning(`Column "${name}" was requested but not found.`));
      }
    }
    if (selectedColumns.length > 0) {
      columns = selectedColumns;
      rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column.id, row[column.id] ?? ""])));
    }
  } else if (columnFilterRules.length === 0 && columnAction === "remove" && selectedNames.length > 0) {
    const removeColumns = new Set();
    for (const name of selectedNames) {
      const column = findColumn(columns, name);
      if (column) {
        removeColumns.add(column.id);
      } else {
        warnings.push(makeWarning(`Column "${name}" was requested but not found.`));
      }
    }
    const keptColumns = columns.filter((column) => !removeColumns.has(column.id));
    if (keptColumns.length > 0) {
      columns = keptColumns;
      rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column.id, row[column.id] ?? ""])));
    } else if (removeColumns.size > 0) {
      warnings.push(makeWarning("Column removal was ignored because it would remove every column."));
    }
  }

  if (options.removeEmptyRows === true) {
    const emptyRowResult = removeEmptyRows(columns, rows);
    rows = emptyRowResult.rows;
    stats.emptyRowsRemoved = emptyRowResult.removedCount;
  }

  if (options.removeEmptyColumns === true) {
    const emptyColumnResult = removeEmptyColumns(columns, rows);
    if (emptyColumnResult.ignored) {
      warnings.push(makeWarning("Empty-column removal was ignored because it would remove every column."));
    } else {
      columns = emptyColumnResult.columns;
      rows = emptyColumnResult.rows;
      stats.emptyColumnsRemoved = emptyColumnResult.removedCount;
    }
  }

  stats.outputRows = rows.length;
  stats.outputColumns = columns.length;

  return { columns, rows, warnings, stats };
}

function escapeDelimitedValue(value, delimiter) {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes("\n") || text.includes("\r") || text.includes(delimiter)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function exportDelimitedTable(columns, rows, delimiter = "\t") {
  const lines = [
    columns.map((column) => escapeDelimitedValue(column.label, delimiter)).join(delimiter)
  ];

  for (const row of rows) {
    lines.push(columns.map((column) => escapeDelimitedValue(row[column.id], delimiter)).join(delimiter));
  }

  return lines.join("\n");
}

export function summarizeTable(columns, rows, delimiterId = "tab") {
  const lines = [
    "Table summary",
    `Delimiter: ${delimiterId}`,
    `Columns: ${columns.length}`,
    `Rows: ${rows.length}`
  ];
  if (columns.length > 0) {
    lines.push(`Column names: ${columns.map((column) => column.label).join(", ")}`);
  }
  return lines.join("\n");
}
