import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { exportDelimitedTable, findColumn, parseDelimitedTable } from "./table.js";

export const fastaTableColumns = [
  { id: "id", label: "ID", type: "string" },
  { id: "title", label: "Title", type: "string" },
  { id: "sequence", label: "Sequence", type: "string" },
  { id: "length", label: "Length", type: "number" }
];

function recordId(record) {
  return String(record.title ?? "").trim().split(/\s+/)[0] ?? "";
}

function detectMode(input, requestedMode) {
  if (requestedMode === "fasta-to-table" || requestedMode === "table-to-fasta") {
    return requestedMode;
  }
  return String(input ?? "").trimStart().startsWith(">") ? "fasta-to-table" : "table-to-fasta";
}

function findFirstColumn(columns, names) {
  for (const name of names) {
    const column = findColumn(columns, name);
    if (column) {
      return column;
    }
  }
  return null;
}

export function convertFastaTable(input, options = {}) {
  const mode = detectMode(input, options.mode);
  const warnings = [];
  let tableRows = [];
  let fasta = "";
  let sequenceRecords = [];

  if (mode === "fasta-to-table") {
    sequenceRecords = parseSequenceInput(input, "sequence");
    tableRows = sequenceRecords.map((record) => ({
      id: recordId(record),
      title: record.title,
      sequence: record.sequence,
      length: record.sequence.length
    }));
    fasta = sequenceRecords.map((record) => formatFastaRecord(record.title, record.sequence, options.lineWidth ?? 60)).join("");
  } else {
    const parsed = parseDelimitedTable(String(input ?? ""), {
      delimiter: options.delimiter ?? "auto",
      hasHeader: options.hasHeader !== false
    });
    warnings.push(...parsed.warnings);
    const requestedTitleColumn = String(options.titleColumn ?? "").trim();
    const requestedSequenceColumn = String(options.sequenceColumn ?? "").trim();
    const titleColumn = requestedTitleColumn
      ? findColumn(parsed.columns, requestedTitleColumn)
      : findFirstColumn(parsed.columns, ["title", "header", "name", "id", "record", "record_id", "sequence_id", "accession"]);
    const sequenceColumn = requestedSequenceColumn
      ? findColumn(parsed.columns, requestedSequenceColumn)
      : findFirstColumn(parsed.columns, ["sequence", "seq", "dna", "rna", "protein", "bases", "residues"]);
    if (!titleColumn) {
      warnings.push(requestedTitleColumn
        ? `Title column "${requestedTitleColumn}" was not found.`
        : "No title column was detected. Expected a column such as title, name, id, record_id, sequence_id, or accession.");
    }
    if (!sequenceColumn) {
      warnings.push(requestedSequenceColumn
        ? `Sequence column "${requestedSequenceColumn}" was not found.`
        : "No sequence column was detected. Expected a column such as sequence, seq, dna, rna, protein, bases, or residues.");
    }
    sequenceRecords = titleColumn && sequenceColumn
      ? parsed.rows.map((row, index) => ({
        title: String(row[titleColumn.id] ?? "").trim() || `record_${index + 1}`,
        sequence: String(row[sequenceColumn.id] ?? "").replace(/\s+/g, "")
      }))
      : [];
    fasta = sequenceRecords.map((record) => formatFastaRecord(record.title, record.sequence, options.lineWidth ?? 60)).join("");
    tableRows = sequenceRecords.map((record) => ({
      id: recordId(record),
      title: record.title,
      sequence: record.sequence,
      length: record.sequence.length
    }));
  }

  const report = [
    "FASTA table converter",
    "",
    `Detected input: ${mode === "fasta-to-table" ? "FASTA records" : "table"}`,
    `Conversion: ${mode === "fasta-to-table" ? "FASTA to table" : "table to FASTA"}`,
    `Records: ${sequenceRecords.length}`,
    `Total bases/residues: ${sequenceRecords.reduce((sum, record) => sum + record.sequence.length, 0)}`
  ].join("\n");
  return { mode, tableRows, fasta, sequenceRecords, report, warnings };
}

export function makeFastaTableTsv(rows) {
  return exportDelimitedTable(fastaTableColumns, rows, "\t");
}
