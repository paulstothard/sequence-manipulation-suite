import { readTextFile } from "../core/compressed-text-reader.js";

export const WORKBOOK_IMPORT_ROW_LIMIT = 50000;
export const WORKBOOK_IMPORT_CELL_LIMIT = 250000;

export function arrayBufferToBase64(buffer, encodeBase64 = globalThis.btoa?.bind(globalThis)) {
  if (typeof encodeBase64 !== "function") {
    throw new Error("Base64 encoding is unavailable in this browser.");
  }
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return encodeBase64(binary);
}

export function workbookCellToText(cell) {
  if (!cell || cell.value == null) {
    return "";
  }
  const value = cell.value;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if (value.text) {
      return String(value.text);
    }
    if (value.result != null) {
      return String(value.result);
    }
    if (value.richText) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if (value.hyperlink) {
      return String(value.hyperlink);
    }
    if (value.error) {
      return String(value.error);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function delimitedCell(value, delimiter = "\t") {
  const text = String(value ?? "");
  if (text.includes(delimiter) || text.includes("\n") || text.includes('"')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function worksheetToDelimitedText(worksheet, {
  delimiter = "\t",
  maxRows = WORKBOOK_IMPORT_ROW_LIMIT,
  maxCells = WORKBOOK_IMPORT_CELL_LIMIT
} = {}) {
  const rowCount = worksheet.actualRowCount ?? worksheet.rowCount ?? 0;
  const columnCount = worksheet.actualColumnCount ?? worksheet.columnCount ?? 0;
  const cellCount = rowCount * columnCount;
  if (rowCount > maxRows || cellCount > maxCells) {
    throw new Error(`Workbook sheet is too large for browser import (${rowCount.toLocaleString()} rows, ${cellCount.toLocaleString()} cells).`);
  }
  const lines = [];
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cells = [];
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      cells.push(delimitedCell(workbookCellToText(row.getCell(columnNumber)), delimiter));
    }
    lines.push(cells.join(delimiter));
  }
  return lines.join("\n");
}

export async function readWorkbookFileAsDelimitedText(file, {
  ExcelJS = globalThis.ExcelJS,
  onMessage = () => {}
} = {}) {
  if (!ExcelJS?.Workbook) {
    throw new Error("Excel workbook reading is unavailable because ExcelJS did not load.");
  }
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  const nonEmptyWorksheets = workbook.worksheets.filter((sheet) => sheet?.actualRowCount > 0);
  const worksheet = nonEmptyWorksheets[0] ?? workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("The workbook does not contain any worksheets.");
  }
  const worksheetName = worksheet.name ? `"${worksheet.name}"` : "the first worksheet";
  if (nonEmptyWorksheets.length > 1) {
    onMessage(
      `${file.name}: loaded worksheet ${worksheetName}; ignored ${nonEmptyWorksheets.length - 1} other non-empty worksheet(s).`,
      "warning"
    );
  } else if (workbook.worksheets.length > 1) {
    onMessage(`${file.name}: loaded worksheet ${worksheetName}.`);
  }
  return worksheetToDelimitedText(worksheet);
}

export async function readToolInputFileText(file, {
  ExcelJS = globalThis.ExcelJS,
  encodeBase64,
  onMessage = () => {},
  readText = readTextFile
} = {}) {
  if (/\.(ab1|abi|abif|scf)$/i.test(file.name)) {
    const buffer = await file.arrayBuffer();
    const isScf = /\.scf$/i.test(file.name);
    return JSON.stringify(
      {
        format: isScf ? "sms3-binary-scf-v1" : "sms3-binary-ab1-v1",
        filename: file.name,
        size: file.size,
        base64: arrayBufferToBase64(buffer, encodeBase64)
      },
      null,
      2
    );
  }
  if (/\.xlsx$/i.test(file.name)) {
    return readWorkbookFileAsDelimitedText(file, { ExcelJS, onMessage });
  }
  return readText(file);
}
