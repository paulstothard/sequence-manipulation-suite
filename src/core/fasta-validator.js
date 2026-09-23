import { formatFastaRecord } from "./fasta.js";
import { complementDnaRnaSequence } from "./sequence.js";
import { BoundedTextBuilder, StreamingFastaFormatter } from "./bounded-text-builder.js";
import { IncrementalSha256 } from "./incremental-sha256.js";

export const FASTA_SUMMARIZER_LIMITS = Object.freeze({
  maxMaterializedOutputCharacters: 25 * 1024 * 1024,
  maxReverseComplementBases: 25_000_000
});

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

function reverseComplementDigest(sequence, chunkSize = 64 * 1024) {
  const hasher = new IncrementalSha256();
  for (let end = sequence.length; end > 0; end -= chunkSize) {
    const start = Math.max(0, end - chunkSize);
    const reversed = sequence.slice(start, end).split("").reverse().join("");
    hasher.update(complementDnaRnaSequence(reversed, { preserveCase: false }));
  }
  return hasher.digestHex();
}

function summarizeRecordTitles(records, { maxCharacters = 1_000, maxTitles = 20 } = {}) {
  const titles = [];
  let usedCharacters = 0;
  for (const record of records) {
    const title = String(record.title ?? "");
    const separatorLength = titles.length > 0 ? 2 : 0;
    if (titles.length >= maxTitles || usedCharacters + separatorLength + title.length > maxCharacters) break;
    titles.push(title);
    usedCharacters += separatorLength + title.length;
  }
  const omitted = records.length - titles.length;
  return `${titles.join(", ")}${omitted > 0 ? `${titles.length > 0 ? "; " : ""}${omitted.toLocaleString()} more` : ""}`;
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

function normalizePositiveLimit(value, fallback) {
  if (value === Infinity) return Infinity;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function recordLength(record) {
  return Number.isFinite(record.length) ? record.length : String(record.sequence ?? "").length;
}

function recordSequenceKey(record) {
  const sequence = String(record.sequence ?? "");
  return sequence ? sequence.toUpperCase() : record.sequenceDigest ?? "";
}

export async function summarizeFastaSource(source, options = {}, context = {}) {
  const outputFormat = ["report", "fasta", "tsv"].includes(options.outputFormat) ? options.outputFormat : "report";
  const checkReverseComplement = options.checkReverseComplement === true;
  const maxMaterializedOutputCharacters = normalizePositiveLimit(
    options.maxMaterializedOutputCharacters,
    FASTA_SUMMARIZER_LIMITS.maxMaterializedOutputCharacters
  );
  const maxReverseComplementBases = normalizePositiveLimit(
    options.maxReverseComplementBases,
    FASTA_SUMMARIZER_LIMITS.maxReverseComplementBases
  );
  const records = [];
  const titleCounts = new Map();
  const sequenceGroups = new Map();
  const fastaBuilder = outputFormat === "fasta"
    ? new BoundedTextBuilder(maxMaterializedOutputCharacters, "Normalized FASTA output")
    : null;
  const formatter = fastaBuilder ? new StreamingFastaFormatter(fastaBuilder, options.lineWidth ?? 60) : null;
  let current = null;
  let basesProcessed = 0;
  let formattedRecords = 0;

  for await (const event of source.events()) {
    context.throwIfCancelled?.();
    if (event.type === "record-start") {
      if (fastaBuilder && formattedRecords > 0) fastaBuilder.append("\n");
      current = {
        record: event.record,
        title: event.title,
        hadHeader: event.hadHeader,
        issues: [...event.issues],
        sequenceHasher: new IncrementalSha256(),
        sequenceParts: checkReverseComplement ? [] : null,
        length: 0,
        sequenceLines: 0
      };
      formatter?.startRecord(event.title);
      formattedRecords += 1;
      continue;
    }
    if (event.type === "sequence-chunk" && current) {
      const upper = event.text.toUpperCase();
      current.sequenceHasher.update(upper);
      current.sequenceParts?.push(upper);
      current.length += event.text.length;
      basesProcessed += event.text.length;
      if (checkReverseComplement && basesProcessed > maxReverseComplementBases) {
        throw new Error(`Reverse-complement duplicate checking requires retaining sequence text and is limited to ${maxReverseComplementBases.toLocaleString()} total bases. Turn off that check or reduce the source.`);
      }
      formatter?.appendSequence(event.text);
      continue;
    }
    if (event.type === "record-end" && current) {
      formatter?.finishRecord();
      current.length = event.length;
      current.sequenceLines = event.sequenceLines;
      current.issues = [...event.issues];
      current.sequenceDigest = current.length > 0 ? current.sequenceHasher.digestHex() : "";
      delete current.sequenceHasher;
      if (current.sequenceParts) {
        current.sequence = current.sequenceParts.join("");
        delete current.sequenceParts;
      }
      records.push(current);
      titleCounts.set(current.title, (titleCounts.get(current.title) ?? 0) + 1);
      if (current.sequenceDigest) {
        if (!sequenceGroups.has(current.sequenceDigest)) sequenceGroups.set(current.sequenceDigest, []);
        sequenceGroups.get(current.sequenceDigest).push(current);
      }
      current = null;
    }
  }

  const warnings = [...source.warnings];
  if (records.length === 0) {
    warnings.push(source.stats.nonWhitespaceSeen || source.stats.inputProvided
      ? "No FASTA records were found. FASTA records must start with >."
      : "No FASTA input was provided.");
  }
  for (const record of records) {
    if ((titleCounts.get(record.title) ?? 0) > 1) record.issues.push("duplicate title");
  }
  for (const group of sequenceGroups.values()) {
    if (group.length <= 1) continue;
    const issue = `duplicate sequence (${summarizeRecordTitles(group)})`;
    for (const record of group) record.issues.push(issue);
  }
  if (checkReverseComplement) {
    for (const record of records) {
      const sequence = String(record.sequence ?? "");
      if (!sequence) continue;
      const reverseDigest = reverseComplementDigest(sequence);
      if (reverseDigest === record.sequenceDigest) continue;
      const matches = sequenceGroups.get(reverseDigest) ?? [];
      if (matches.length > 0) {
        record.issues.push(`reverse-complement duplicate of ${summarizeRecordTitles(matches)}`);
      }
    }
  }

  const invalidRecords = records.filter((record) => record.issues.length > 0).length;
  if (invalidRecords > 0) warnings.push(`${invalidRecords} FASTA record(s) have format issues.`);
  const tableRows = outputFormat === "tsv"
    ? records.map((record) => ({
      record: record.record,
      title: record.title,
      length: record.length,
      sequence_lines: record.sequenceLines,
      title_count: titleCounts.get(record.title) ?? 0,
      sequence_count: record.sequenceDigest ? sequenceGroups.get(record.sequenceDigest)?.length ?? 0 : 0,
      status: record.issues.length > 0 ? "warning" : "ok",
      issues: record.issues.join("; ")
    }))
    : [];
  const report = outputFormat === "report"
    ? makeFastaValidationReport(records, warnings, basesProcessed, maxMaterializedOutputCharacters)
    : "";

  return {
    records,
    warnings,
    normalizedFasta: fastaBuilder?.toString() ?? "",
    report,
    tableRows,
    basesProcessed,
    sourceLabel: source.sourceLabel
  };
}

export function makeFastaValidationReport(records, warnings = [], basesProcessed = 0, maxCharacters = Infinity) {
  const uniqueTitles = new Set(records.map((record) => record.title)).size;
  const nonEmptySequences = records.map(recordSequenceKey).filter(Boolean);
  const uniqueSequences = new Set(nonEmptySequences).size;
  const lengths = records.map(recordLength);
  const minLength = lengths.length > 0 ? Math.min(...lengths) : 0;
  const maxLength = lengths.length > 0 ? Math.max(...lengths) : 0;
  const averageLength = lengths.length > 0 ? basesProcessed / lengths.length : 0;
  const builder = new BoundedTextBuilder(maxCharacters, "FASTA summary report");
  let lineCount = 0;
  const appendLine = (value = "") => {
    if (lineCount > 0) builder.append("\n");
    builder.append(value);
    lineCount += 1;
  };
  appendLine("FASTA summary report");
  appendLine();
  appendLine(`Records: ${records.length}`);
  appendLine(`Unique titles: ${uniqueTitles}`);
  appendLine(`Unique non-empty sequences: ${uniqueSequences}`);
  appendLine(`Total sequence characters: ${basesProcessed}`);
  appendLine(`Minimum length: ${minLength}`);
  appendLine(`Maximum length: ${maxLength}`);
  appendLine(`Average length: ${averageLength.toFixed(2)}`);
  appendLine(`Records with issues: ${records.filter((record) => record.issues.length > 0).length}`);
  appendLine(`Duplicate titles: ${records.filter((record) => record.issues.some((issue) => issue === "duplicate title")).length}`);
  appendLine(`Duplicate sequences: ${records.filter((record) => record.issues.some((issue) => issue.startsWith("duplicate sequence"))).length}`);
  appendLine(`Reverse-complement duplicates: ${records.filter((record) => record.issues.some((issue) => issue.startsWith("reverse-complement duplicate"))).length}`);

  if (warnings.length > 0) {
    appendLine();
    appendLine("Warnings:");
    for (const warning of warnings) {
      appendLine(`- ${warning}`);
    }
  }

  if (records.length > 0) {
    appendLine();
    appendLine("Records:");
    for (const record of records) {
      appendLine(
        `${record.record}. ${record.title}: ${recordLength(record)} characters, ${record.sequenceLines} sequence line(s), ${record.issues.length > 0 ? record.issues.join("; ") : "OK"}`
      );
    }
  }

  return builder.toString();
}
