export function getBaseMimeType(mimeType = "") {
  return String(mimeType).split(";")[0].trim().toLowerCase();
}

export function isDelimitedDownload(format = "", download = {}) {
  const selectedFormat = String(format ?? "").toLowerCase();
  const filename = String(download.filename ?? "").toLowerCase();
  const mimeType = getBaseMimeType(download.mimeType);
  return (
    selectedFormat === "tsv" ||
    selectedFormat === "csv" ||
    selectedFormat.endsWith("-tsv") ||
    selectedFormat.endsWith("-csv") ||
    filename.endsWith(".tsv") ||
    filename.endsWith(".csv") ||
    mimeType === "text/tab-separated-values" ||
    mimeType === "text/csv"
  );
}

export function alignTsv(tsv) {
  const rows = String(tsv ?? "")
    .split(/\r?\n/)
    .map((line) => line.split("\t"));
  const widths = [];

  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    });
  }

  return rows
    .map((row) =>
      row.map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index]))).join("  ")
    )
    .join("\n");
}

function getTableStreamColumns(stream) {
  return stream?.columns?.length > 0
    ? stream.columns
    : Object.keys(stream?.rows?.[0] ?? {}).map((id) => ({ id, label: id }));
}

export function tableStreamToTsv(stream) {
  const columnIds = stream?.columns?.length > 0
    ? stream.columns.map((column) => column.id)
    : Object.keys(stream?.rows?.[0] ?? {});
  return [
    columnIds.join("\t"),
    ...(stream?.rows ?? []).map((row) => columnIds.map((columnId) => row[columnId] ?? "").join("\t"))
  ].join("\n");
}

export function tableRowsToTsv(columns, rows) {
  const columnIds = columns.map((column) => column.id);
  return [
    columnIds.join("\t"),
    ...rows.map((row) => columnIds.map((columnId) => row[columnId] ?? "").join("\t"))
  ].join("\n");
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function tableStreamToCsv(stream) {
  return tableRowsToCsv(getTableStreamColumns(stream), stream?.rows ?? []);
}

export function tableRowsToCsv(columns, rows) {
  const columnIds = columns.map((column) => column.id);
  return [
    columnIds.map(escapeCsvCell).join(","),
    ...rows.map((row) => columnIds.map((columnId) => escapeCsvCell(row[columnId])).join(","))
  ].join("\n");
}
