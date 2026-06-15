import { formatFastaRecord } from "./fasta.js";
import { complementDnaRnaSequence } from "./sequence.js";

export const fastaValidationTableColumns = [
  { id: "record", label: "Record", type: "number" },
  { id: "title", label: "Title", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "sequence_lines", label: "Sequence lines", type: "number" },
  { id: "title_count", label: "Title count", type: "number" },
  { id: "sequence_count", label: "Sequence count", type: "number" },
  { id: "status", label: "Status", type: "string" },
  { id: "issues", label: "Issues", type: "string" }
];

function reverseComplement(sequence) {
  return complementDnaRnaSequence(sequence, { preserveCase: false }).split("").reverse().join("");
}

function normalizeLineBreaks(input) {
  return String(input ?? "").replace(/\r\n?/g, "\n");
}

function makeRecord(index, title, lines = [], issues = []) {
  const sequence = lines.join("").replace(/\s+/g, "");
  return {
    record: index,
    title,
    sequence,
    sequenceLines: lines.length,
    issues
  };
}

export function validateFasta(input, options = {}) {
  const text = normalizeLineBreaks(input).trim();
  const warnings = [];

  if (!text) {
    return {
      records: [],
      warnings: ["No FASTA input was provided."],
      normalizedFasta: "",
      report: "",
      tableRows: [],
      basesProcessed: 0
    };
  }

  const lines = text.split("\n");
  const records = [];
  const titleCounts = new Map();
  let currentTitle = null;
  let currentLines = [];
  let currentIssues = [];
  let preambleLines = 0;

  function pushCurrent() {
    if (currentTitle === null) {
      return;
    }
    const record = makeRecord(records.length + 1, currentTitle, currentLines, currentIssues);
    if (record.sequence.length === 0) {
      record.issues.push("empty sequence");
    }
    records.push(record);
    titleCounts.set(record.title, (titleCounts.get(record.title) ?? 0) + 1);
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith(">")) {
      pushCurrent();
      currentTitle = line.slice(1).trim();
      currentLines = [];
      currentIssues = [];
      if (!currentTitle) {
        currentTitle = `record-${records.length + 1}`;
        currentIssues.push("missing title");
      }
      if (line.slice(1).trimStart() !== line.slice(1)) {
        currentIssues.push("header has leading whitespace after >");
      }
      continue;
    }

    if (currentTitle === null) {
      if (line.trim()) {
        preambleLines += 1;
      }
      continue;
    }

    if (!line.trim()) {
      currentIssues.push("blank sequence line");
      continue;
    }
    if (/\s/.test(line)) {
      currentIssues.push("sequence line contains whitespace");
    }
    currentLines.push(line);
  }
  pushCurrent();

  if (preambleLines > 0) {
    warnings.push(`${preambleLines} non-header line(s) before the first FASTA header were ignored.`);
  }

  for (const record of records) {
    if ((titleCounts.get(record.title) ?? 0) > 1) {
      record.issues.push("duplicate title");
    }
  }

  const sequenceGroups = new Map();
  for (const record of records) {
    const key = record.sequence.toUpperCase();
    if (!key) {
      continue;
    }
    if (!sequenceGroups.has(key)) {
      sequenceGroups.set(key, []);
    }
    sequenceGroups.get(key).push(record);
  }
  const sequenceCounts = new Map([...sequenceGroups.entries()].map(([key, group]) => [key, group.length]));
  for (const group of sequenceGroups.values()) {
    if (group.length > 1) {
      for (const record of group) {
        record.issues.push(`duplicate sequence (${group.map((item) => item.title).join(", ")})`);
      }
    }
  }
  if (options.checkReverseComplement === true) {
    for (const record of records) {
      const sequence = record.sequence.toUpperCase();
      const rc = reverseComplement(sequence);
      if (!sequence || rc === sequence) {
        continue;
      }
      const matches = sequenceGroups.get(rc) ?? [];
      if (matches.length > 0) {
        record.issues.push(`reverse-complement duplicate of ${matches.map((item) => item.title).join(", ")}`);
      }
    }
  }

  const lineWidth = options.lineWidth ?? 60;
  const normalizedFasta = records
    .map((record) => formatFastaRecord(record.title, record.sequence, lineWidth))
    .join("\n");
  const basesProcessed = records.reduce((sum, record) => sum + record.sequence.length, 0);
  const invalidRecords = records.filter((record) => record.issues.length > 0).length;

  if (records.length === 0) {
    warnings.push("No FASTA records were found. FASTA records must start with >.");
  }
  if (invalidRecords > 0) {
    warnings.push(`${invalidRecords} FASTA record(s) have format issues.`);
  }

  const tableRows = records.map((record) => ({
    record: record.record,
    title: record.title,
    length: record.sequence.length,
    sequence_lines: record.sequenceLines,
    title_count: titleCounts.get(record.title) ?? 0,
    sequence_count: record.sequence ? sequenceCounts.get(record.sequence.toUpperCase()) ?? 0 : 0,
    status: record.issues.length > 0 ? "warning" : "ok",
    issues: record.issues.join("; ")
  }));

  const report = makeFastaValidationReport(records, warnings, basesProcessed);

  return {
    records,
    warnings,
    normalizedFasta,
    report,
    tableRows,
    basesProcessed
  };
}

export function makeFastaValidationReport(records, warnings = [], basesProcessed = 0) {
  const uniqueTitles = new Set(records.map((record) => record.title)).size;
  const nonEmptySequences = records.map((record) => record.sequence.toUpperCase()).filter(Boolean);
  const uniqueSequences = new Set(nonEmptySequences).size;
  const lengths = records.map((record) => record.sequence.length);
  const minLength = lengths.length > 0 ? Math.min(...lengths) : 0;
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : 0;
  const averageLength = lengths.length > 0 ? basesProcessed / lengths.length : 0;
  const lines = ["FASTA summary report", ""];
  lines.push(`Records: ${records.length}`);
  lines.push(`Unique titles: ${uniqueTitles}`);
  lines.push(`Unique non-empty sequences: ${uniqueSequences}`);
  lines.push(`Total sequence characters: ${basesProcessed}`);
  lines.push(`Minimum length: ${minLength}`);
  lines.push(`Maximum length: ${maxLength}`);
  lines.push(`Average length: ${averageLength.toFixed(2)}`);
  lines.push(`Records with issues: ${records.filter((record) => record.issues.length > 0).length}`);
  lines.push(`Duplicate titles: ${records.filter((record) => record.issues.some((issue) => issue === "duplicate title")).length}`);
  lines.push(`Duplicate sequences: ${records.filter((record) => record.issues.some((issue) => issue.startsWith("duplicate sequence"))).length}`);
  lines.push(`Reverse-complement duplicates: ${records.filter((record) => record.issues.some((issue) => issue.startsWith("reverse-complement duplicate"))).length}`);

  if (warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (records.length > 0) {
    lines.push("");
    lines.push("Records:");
    for (const record of records) {
      lines.push(
        `${record.record}. ${record.title}: ${record.sequence.length} characters, ${record.sequenceLines} sequence line(s), ${record.issues.length > 0 ? record.issues.join("; ") : "OK"}`
      );
    }
  }

  return lines.join("\n");
}
