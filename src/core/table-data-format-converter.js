import { buildTableFromRows, detectDelimiter, parseDelimitedTable } from "./table.js";

export function tableToDelimited(columns, rows, delimiter) {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    if (text.includes(delimiter) || text.includes("\n") || text.includes('"')) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };
  return [
    columns.map((column) => escapeCell(column.label)).join(delimiter),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column.id])).join(delimiter))
  ].join("\n");
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replace(/\r\n?|\n/g, "<br>");
}

export function tableToMarkdown(columns, rows) {
  if (!columns.length) {
    return "";
  }
  const header = `| ${columns.map((column) => escapeMarkdownCell(column.label)).join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) =>
    `| ${columns.map((column) => escapeMarkdownCell(row[column.id])).join(" | ")} |`
  );
  return [header, separator, ...body].join("\n");
}

function inferInputFormat(input, options = {}) {
  if (options.inputFormat && options.inputFormat !== "auto") {
    return options.inputFormat;
  }
  const trimmed = String(input ?? "").trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return "json";
  }
  const delimiter = detectDelimiter(input).delimiterId;
  return delimiter === "comma" ? "csv" : "tsv";
}

function stringifyJsonCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeJsonTableShape(parsed, warnings) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && typeof parsed === "object") {
    for (const key of ["rows", "data", "records", "items"]) {
      if (Array.isArray(parsed[key])) {
        warnings.push(`Interpreted top-level JSON object property "${key}" as the table rows.`);
        return parsed[key];
      }
    }
    warnings.push("Interpreted top-level JSON object as a one-row table.");
    return [parsed];
  }
  warnings.push("Interpreted top-level JSON scalar as a one-row, one-column table.");
  return [{ value: parsed }];
}

function rowsFromJson(input) {
  const warnings = [];
  const parsed = JSON.parse(String(input ?? ""));
  const array = normalizeJsonTableShape(parsed, warnings);
  if (array.every((item) => Array.isArray(item))) {
    const expectedWidth = Math.max(1, ...array.map((item) => item.length));
    warnings.push("Interpreted JSON array of arrays as a table without a header row.");
    const table = buildTableFromRows(array.map((item) =>
      Array.from({ length: expectedWidth }, (_, index) => stringifyJsonCell(item[index]))
    ), { hasHeader: false });
    return { ...table, warnings: [...warnings, ...table.warnings] };
  }
  const keys = Array.from(new Set(array.flatMap((item) =>
    item && typeof item === "object" && !Array.isArray(item) ? Object.keys(item) : ["value"]
  )));
  const rawRows = [
    keys,
    ...array.map((item) => {
      const rowObject = item && typeof item === "object" && !Array.isArray(item) ? item : { value: item };
      return keys.map((key) => stringifyJsonCell(rowObject[key]));
    })
  ];
  const table = buildTableFromRows(rawRows, { hasHeader: true });
  return { ...table, warnings: [...warnings, ...table.warnings] };
}

export function convertTableDataFormat(input, options = {}) {
  const warnings = [];
  const inputFormat = inferInputFormat(input, options);
  let columns = [];
  let rows = [];
  if (inputFormat === "json") {
    try {
      const table = rowsFromJson(input);
      columns = table.columns;
      rows = table.rows;
      warnings.push(...table.warnings);
    } catch (error) {
      return { inputFormat, columns: [], rows: [], warnings: [`Could not parse JSON input: ${error.message}`], outputs: {} };
    }
  } else {
    const table = parseDelimitedTable(input, {
      delimiter: inputFormat === "csv" ? "comma" : inputFormat === "tsv" ? "tab" : options.delimiter ?? "auto",
      hasHeader: options.hasHeader !== false
    });
    columns = table.columns;
    rows = table.rows;
    warnings.push(...table.warnings);
  }
  const outputs = {
    tsv: tableToDelimited(columns, rows, "\t"),
    csv: tableToDelimited(columns, rows, ","),
    markdown: tableToMarkdown(columns, rows),
    json: JSON.stringify(rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column.label, row[column.id] ?? ""]))
    ), null, 2)
  };
  const report = [
    "Table/data format converter",
    `Input format interpreted as: ${inputFormat}`,
    `Rows: ${rows.length}`,
    `Columns: ${columns.length}`,
    "XLSX input and export are handled by the bundled ExcelJS browser library. XLSX files loaded through the app shell are converted to tabular text before this worker runs. YAML remains a planned library-backed format; SMS3 does not implement custom spreadsheet parsers."
  ].join("\n") + "\n";
  return { inputFormat, columns, rows, warnings, outputs, report };
}
