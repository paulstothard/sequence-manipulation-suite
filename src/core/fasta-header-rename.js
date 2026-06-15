import { formatFastaRecord, parseSequenceInput } from "./fasta.js";

export const fastaHeaderRenameTableColumns = [
  { id: "record_number", label: "Record number", type: "number" },
  { id: "original_title", label: "Original title", type: "string" },
  { id: "new_title", label: "New title", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "changed", label: "Changed", type: "boolean" }
];

function normalizeOptions(options = {}) {
  const useRegex = options.findMode === "regex" || options.useRegex === true;
  return {
    findText: String(options.findText ?? ""),
    replaceText: String(options.replaceText ?? ""),
    useRegex,
    regexFlags: String(options.regexFlags ?? "g").trim() || "g",
    prefix: String(options.prefix ?? ""),
    suffix: String(options.suffix ?? ""),
    safeIds: options.safeIds !== false,
    numberMode: ["none", "prefix", "suffix"].includes(options.numberMode) ? options.numberMode : "none",
    numberStart: Number.parseInt(options.numberStart, 10) || 1,
    numberWidth: Math.max(1, Math.min(12, Number.parseInt(options.numberWidth, 10) || 3)),
    lineWidth: Math.max(10, Math.min(200, Number.parseInt(options.lineWidth, 10) || 60))
  };
}

function makeSafeId(title) {
  return String(title ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "sequence";
}

function makeReplacer(options, warnings) {
  if (!options.findText) {
    return (value) => value;
  }
  if (!options.useRegex) {
    return (value) => value.split(options.findText).join(options.replaceText);
  }
  try {
    const cleanFlags = [...new Set(options.regexFlags.replace(/[^dgimsuvy]/g, "").split(""))].join("");
    const flags = cleanFlags.includes("g") ? cleanFlags : `${cleanFlags}g`;
    if (cleanFlags !== options.regexFlags) {
      warnings.push(`Regular expression flags were normalized from "${options.regexFlags}" to "${flags}".`);
    }
    const pattern = new RegExp(options.findText, flags);
    return (value) => value.replace(pattern, options.replaceText);
  } catch (error) {
    warnings.push(`Invalid regular expression "${options.findText}": ${error.message}`);
    return (value) => value;
  }
}

export function renameFastaHeaders(input, options = {}) {
  const normalized = normalizeOptions(options);
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

  if (records.length === 0) {
    return {
      records: [],
      renamedRecords: [],
      tableRows: [],
      fasta: "",
      report: "",
      warnings: ["No sequence input was provided."],
      basesProcessed: 0,
      options: normalized
    };
  }
  if (!String(input ?? "").trim().startsWith(">")) {
    warnings.push("Input did not start with a FASTA header; treated it as one raw sequence record.");
  }

  const replaceTitle = makeReplacer(normalized, warnings);
  const renamedRecords = [];
  const tableRows = [];
  const titleCounts = new Map();
  let basesProcessed = 0;

  records.forEach((record, index) => {
    basesProcessed += record.sequence.length;
    const number = String(normalized.numberStart + index).padStart(normalized.numberWidth, "0");
    let title = replaceTitle(record.title).trim();
    title = `${normalized.prefix}${title}${normalized.suffix}`;
    if (normalized.numberMode === "prefix") {
      title = `${number}_${title}`;
    } else if (normalized.numberMode === "suffix") {
      title = `${title}_${number}`;
    }
    if (normalized.safeIds) {
      title = makeSafeId(title);
    }
    if (titleCounts.has(title)) {
      titleCounts.set(title, titleCounts.get(title) + 1);
    } else {
      titleCounts.set(title, 1);
    }
    const renamed = { title, sequence: record.sequence, hadHeader: true };
    renamedRecords.push(renamed);
    tableRows.push({
      record_number: index + 1,
      original_title: record.title,
      new_title: title,
      length: record.sequence.length,
      changed: title !== record.title
    });
  });

  for (const [title, count] of titleCounts.entries()) {
    if (count > 1) {
      warnings.push(`Renamed title "${title}" appears ${count} times.`);
    }
  }

  const changedCount = tableRows.filter((row) => row.changed).length;
  const report = [
    "FASTA header rename",
    "",
    `Records processed: ${records.length}`,
    `Bases processed: ${basesProcessed}`,
    `Headers changed: ${changedCount}`,
    `Safe ID cleanup: ${normalized.safeIds ? "on" : "off"}`,
    `Numbering: ${normalized.numberMode}`
  ].join("\n");
  const fasta = renamedRecords.map((record) => formatFastaRecord(record.title, record.sequence, normalized.lineWidth)).join("");

  return {
    records,
    renamedRecords,
    tableRows,
    fasta,
    report,
    warnings,
    basesProcessed,
    options: normalized
  };
}
