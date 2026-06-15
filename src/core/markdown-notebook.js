const DEFAULT_NOTEBOOK_TITLE = "Untitled notes";
const DEFAULT_NOTEBOOK_FILE_STEM = "untitled-notes";

function isoDate(value) {
  const text = String(value ?? "").trim();
  if (text) return text;
  return new Date().toISOString().slice(0, 10);
}

function normalizeMarkdownTableCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isMarkdownTableDividerCell(value) {
  return /^:?-{3,}:?$/.test(normalizeMarkdownTableCell(value));
}

function splitMarkdownTableRow(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed.includes("|")) return [];
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map(normalizeMarkdownTableCell);
}

function renderMarkdownTableRow(cells, widths, indent = "") {
  return `${indent}| ${cells.map((cell, index) => normalizeMarkdownTableCell(cell).padEnd(widths[index] ?? 3)).join(" | ")} |`;
}

export function formatMarkdownTableRows(headerCells, bodyRows = [], indent = "") {
  const header = Array.isArray(headerCells) ? headerCells.map(normalizeMarkdownTableCell) : [];
  const rows = Array.isArray(bodyRows) ? bodyRows : [];
  const columnCount = Math.max(1, header.length, ...rows.map((row) => Array.isArray(row) ? row.length : 0));
  const normalizeRow = (row) => Array.from({ length: columnCount }, (_, index) => normalizeMarkdownTableCell(row?.[index]));
  const normalizedHeader = normalizeRow(header);
  const normalizedRows = rows.map(normalizeRow);
  const widths = Array.from({ length: columnCount }, (_, index) => Math.max(
    3,
    normalizedHeader[index].length,
    ...normalizedRows.map((row) => row[index].length)
  ));
  const divider = widths.map((width) => "-".repeat(width));
  return [
    renderMarkdownTableRow(normalizedHeader, widths, indent),
    renderMarkdownTableRow(divider, widths, indent),
    ...normalizedRows.map((row) => renderMarkdownTableRow(row, widths, indent))
  ].join("\n");
}

export function formatMarkdownTableBlock(block) {
  const lines = String(block ?? "").split(/\r?\n/);
  const tableLines = lines.filter((line) => line.trim());
  if (tableLines.length < 2 || !tableLines.every((line) => line.includes("|"))) {
    return String(block ?? "");
  }
  const indent = tableLines[0].match(/^\s*/)?.[0] ?? "";
  const parsedRows = tableLines.map(splitMarkdownTableRow).filter((row) => row.length > 0);
  if (parsedRows.length < 2) {
    return String(block ?? "");
  }
  const header = parsedRows[0];
  const bodyRows = parsedRows.slice(1).filter((row) => !row.every(isMarkdownTableDividerCell));
  return formatMarkdownTableRows(header, bodyRows, indent);
}

function slugify(value) {
  return String(value ?? DEFAULT_NOTEBOOK_FILE_STEM)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || DEFAULT_NOTEBOOK_FILE_STEM;
}

function frontMatter(options) {
  if (options.includeFrontMatter !== true) return "";
  return [
    "---",
    `title: "${String(options.title ?? DEFAULT_NOTEBOOK_TITLE).replaceAll('"', '\\"')}"`,
    `date: "${isoDate(options.date)}"`,
    "---",
    ""
  ].join("\n");
}

export function buildMarkdownNotebook(input, options = {}) {
  const title = String(options.title ?? "").trim() || DEFAULT_NOTEBOOK_TITLE;
  const date = isoDate(options.date);
  const source = String(input ?? "").trimEnd();
  const body = source
    ? source + "\n"
    : `# ${title}\n\nDate: ${date}\n\n`;
  const markdown = frontMatter({ ...options, title, date }) + body;
  const filename = `${slugify(options.fileName || title || DEFAULT_NOTEBOOK_FILE_STEM)}.md`;
  const report = [
    "Markdown notebook",
    `Filename: ${filename}`,
    source ? "Started from the Markdown already present in the input area." : "Started from a blank Markdown notebook."
  ].join("\n") + "\n";
  return {
    markdown,
    filename,
    report,
    warnings: []
  };
}
