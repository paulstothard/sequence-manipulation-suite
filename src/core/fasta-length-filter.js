import { formatFastaRecord, parseSequenceInput } from "./fasta.js";

export const fastaLengthFilterTableColumns = [
  { id: "title", label: "Title", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "output_length", label: "Output length", type: "number" },
  { id: "gc_percent", label: "GC %", type: "number" },
  { id: "ambiguous_count", label: "Ambiguous count", type: "number" },
  { id: "trimmed_5_prime", label: "Trimmed 5 prime", type: "number" },
  { id: "trimmed_3_prime", label: "Trimmed 3 prime", type: "number" },
  { id: "status", label: "Status", type: "string" },
  { id: "reason", label: "Reason", type: "string" }
];

const SORT_MODES = new Set([
  "input",
  "length-asc",
  "length-desc",
  "title-asc",
  "title-desc",
  "gc-asc",
  "gc-desc",
  "ambiguous-asc",
  "ambiguous-desc"
]);

function normalizeOptions(options = {}) {
  const minLength = Math.max(0, Number.parseInt(options.minLength, 10) || 0);
  const rawMax = Number.parseInt(options.maxLength, 10);
  const maxLength = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : Number.POSITIVE_INFINITY;
  const minGc = parseOptionalNumber(options.minGcPercent);
  const maxGc = parseOptionalNumber(options.maxGcPercent);
  const maxAmbiguous = parseOptionalInteger(options.maxAmbiguousCount);
  const rawAction = options.selectionAction ?? options.keepMode ?? "keep";
  const selectionAction = rawAction === "outside" || rawAction === "remove" ? "remove" : "keep";
  const sortMode = SORT_MODES.has(options.sortMode) ? options.sortMode : "input";
  return {
    minLength,
    maxLength,
    titleContains: String(options.titleContains ?? "").trim(),
    sequenceContains: String(options.sequenceContains ?? "").replace(/\s+/g, "").toUpperCase(),
    minGcPercent: minGc === null ? null : Math.max(0, Math.min(100, minGc)),
    maxGcPercent: maxGc === null ? null : Math.max(0, Math.min(100, maxGc)),
    maxAmbiguousCount: maxAmbiguous === null ? null : Math.max(0, maxAmbiguous),
    selectionAction,
    keepMode: selectionAction === "remove" ? "outside" : "inside",
    sortMode,
    trimTerminalPolyAt: options.trimTerminalPolyAt === true || options.trimPolyATails === true,
    polyAtMinLength: Math.max(1, Math.min(1000, Number.parseInt(options.polyAtMinLength, 10) || 10)),
    joinSelectedRecords: options.joinSelectedRecords === true,
    joinedTitle: String(options.joinedTitle ?? "joined_selected_records").trim() || "joined_selected_records",
    lineWidth: Math.max(10, Math.min(200, Number.parseInt(options.lineWidth, 10) || 60))
  };
}

function parseOptionalNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInteger(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function sequenceStats(sequence) {
  const upper = String(sequence ?? "").toUpperCase();
  const gc = (upper.match(/[GC]/g) ?? []).length;
  const atgc = (upper.match(/[ACGTU]/g) ?? []).length;
  const ambiguous = (upper.match(/[^ACGTU]/g) ?? []).length;
  return {
    gcPercent: atgc > 0 ? Number(((gc / atgc) * 100).toFixed(2)) : null,
    ambiguousCount: ambiguous
  };
}

function trimTerminalPolyAt(record, normalized) {
  if (!normalized.trimTerminalPolyAt) {
    return {
      record,
      trimmedFivePrime: 0,
      trimmedThreePrime: 0
    };
  }

  const sequence = String(record.sequence ?? "");
  const fivePrimeMatch = sequence.match(new RegExp(`^[TtUu]{${normalized.polyAtMinLength},}`));
  const threePrimeMatch = sequence.match(new RegExp(`[Aa]{${normalized.polyAtMinLength},}$`));
  const trimmedFivePrime = fivePrimeMatch?.[0]?.length ?? 0;
  const trimmedThreePrime = threePrimeMatch?.[0]?.length ?? 0;
  const end = Math.max(trimmedFivePrime, sequence.length - trimmedThreePrime);
  return {
    record: {
      ...record,
      sequence: sequence.slice(trimmedFivePrime, end)
    },
    trimmedFivePrime,
    trimmedThreePrime
  };
}

function sortRecords(records, sortMode) {
  const sorted = [...records];
  const compareStrings = (left, right) => String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  const statsCache = new WeakMap();
  const getStats = (record) => {
    if (!statsCache.has(record)) {
      statsCache.set(record, sequenceStats(record.sequence));
    }
    return statsCache.get(record);
  };

  sorted.sort((left, right) => {
    if (sortMode === "length-asc") {
      return left.sequence.length - right.sequence.length || compareStrings(left.title, right.title);
    }
    if (sortMode === "length-desc") {
      return right.sequence.length - left.sequence.length || compareStrings(left.title, right.title);
    }
    if (sortMode === "title-asc") {
      return compareStrings(left.title, right.title);
    }
    if (sortMode === "title-desc") {
      return compareStrings(right.title, left.title);
    }
    if (sortMode === "gc-asc") {
      return (getStats(left).gcPercent ?? -1) - (getStats(right).gcPercent ?? -1) || compareStrings(left.title, right.title);
    }
    if (sortMode === "gc-desc") {
      return (getStats(right).gcPercent ?? -1) - (getStats(left).gcPercent ?? -1) || compareStrings(left.title, right.title);
    }
    if (sortMode === "ambiguous-asc") {
      return getStats(left).ambiguousCount - getStats(right).ambiguousCount || compareStrings(left.title, right.title);
    }
    if (sortMode === "ambiguous-desc") {
      return getStats(right).ambiguousCount - getStats(left).ambiguousCount || compareStrings(left.title, right.title);
    }
    return 0;
  });
  return sorted;
}

function recordReasons(record, normalized, stats) {
  const reasons = [];
  const length = record.sequence.length;
  if (length < normalized.minLength) {
    reasons.push(`length ${length} is shorter than minimum ${normalized.minLength}`);
  }
  if (length > normalized.maxLength) {
    reasons.push(`length ${length} is longer than maximum ${normalized.maxLength}`);
  }
  if (normalized.titleContains && !record.title.toLowerCase().includes(normalized.titleContains.toLowerCase())) {
    reasons.push(`title does not contain "${normalized.titleContains}"`);
  }
  if (normalized.sequenceContains && !record.sequence.toUpperCase().includes(normalized.sequenceContains)) {
    reasons.push(`sequence does not contain "${normalized.sequenceContains}"`);
  }
  if (normalized.minGcPercent !== null && (stats.gcPercent === null || stats.gcPercent < normalized.minGcPercent)) {
    reasons.push(`GC percent is below ${normalized.minGcPercent}`);
  }
  if (normalized.maxGcPercent !== null && (stats.gcPercent === null || stats.gcPercent > normalized.maxGcPercent)) {
    reasons.push(`GC percent is above ${normalized.maxGcPercent}`);
  }
  if (normalized.maxAmbiguousCount !== null && stats.ambiguousCount > normalized.maxAmbiguousCount) {
    reasons.push(`ambiguous character count ${stats.ambiguousCount} is above ${normalized.maxAmbiguousCount}`);
  }
  return reasons;
}

export function filterFastaByLength(input, options = {}) {
  const normalized = normalizeOptions(options);
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

  if (records.length === 0) {
    return {
      records: [],
      keptRecords: [],
      removedRecords: [],
      tableRows: [],
      report: "",
      keptFasta: "",
      removedFasta: "",
      warnings: ["No sequence input was provided."],
      basesProcessed: 0,
      options: normalized
    };
  }

  if (!String(input ?? "").trim().startsWith(">")) {
    warnings.push("Input did not start with a FASTA header; treated it as one raw sequence record.");
  }
  if (normalized.maxLength < normalized.minLength) {
    warnings.push("Maximum length is shorter than minimum length; no records can be within the selected range.");
  }
  if (normalized.minGcPercent !== null || normalized.maxGcPercent !== null) {
    warnings.push("GC percent filters count A/C/G/T/U characters only; other symbols are ignored for the percentage denominator.");
  }

  const keptRecords = [];
  const removedRecords = [];
  const tableRows = [];
  let basesProcessed = 0;

  for (const record of records) {
    const length = record.sequence.length;
    basesProcessed += length;
    const stats = sequenceStats(record.sequence);
    const reasons = recordReasons(record, normalized, stats);
    const matches = reasons.length === 0;
    const keep = normalized.selectionAction === "keep" ? matches : !matches;
    const destination = keep ? keptRecords : removedRecords;
    const transformed = trimTerminalPolyAt(record, normalized);
    destination.push(keep ? transformed.record : record);
    tableRows.push({
      title: record.title,
      length,
      output_length: keep ? transformed.record.sequence.length : "",
      gc_percent: stats.gcPercent,
      ambiguous_count: stats.ambiguousCount,
      trimmed_5_prime: keep ? transformed.trimmedFivePrime : 0,
      trimmed_3_prime: keep ? transformed.trimmedThreePrime : 0,
      status: keep ? "kept" : "removed",
      reason: reasons.length > 0 ? reasons.join("; ") : "matched all selected criteria"
    });
  }

  const sortedKeptRecords = sortRecords(keptRecords, normalized.sortMode);
  const outputKeptRecords = normalized.joinSelectedRecords
    ? sortedKeptRecords.length > 0
      ? [{
          title: normalized.joinedTitle,
          sequence: sortedKeptRecords.map((record) => record.sequence).join("")
        }]
      : []
    : sortedKeptRecords;

  const maxLabel = Number.isFinite(normalized.maxLength) ? normalized.maxLength : "no maximum";
  const report = [
    "FASTA filter / select",
    "",
    `Records processed: ${records.length}`,
    `Bases processed: ${basesProcessed}`,
    `Length range: ${normalized.minLength} to ${maxLabel}`,
    `Title contains: ${normalized.titleContains || "not used"}`,
    `Sequence contains: ${normalized.sequenceContains || "not used"}`,
    `GC percent range: ${normalized.minGcPercent ?? "no minimum"} to ${normalized.maxGcPercent ?? "no maximum"}`,
    `Maximum ambiguous characters: ${normalized.maxAmbiguousCount ?? "not used"}`,
    `Action for matching records: ${normalized.selectionAction === "keep" ? "Keep matching records" : "Remove matching records"}`,
    `Output sort: ${normalized.sortMode}`,
    `Terminal poly-A/T trimming: ${normalized.trimTerminalPolyAt ? `on, minimum run ${normalized.polyAtMinLength}` : "off"}`,
    `Join selected records: ${normalized.joinSelectedRecords ? `yes, title "${normalized.joinedTitle}"` : "no"}`,
    `Records selected: ${keptRecords.length}`,
    `Records not selected: ${removedRecords.length}`,
    `Output FASTA records: ${outputKeptRecords.length}`
  ].join("\n");
  const keptFasta = outputKeptRecords.map((record) => formatFastaRecord(record.title, record.sequence, normalized.lineWidth)).join("");
  const removedFasta = removedRecords.map((record) => formatFastaRecord(record.title, record.sequence, normalized.lineWidth)).join("");

  return {
    records,
    keptRecords: outputKeptRecords,
    selectedRecords: outputKeptRecords,
    removedRecords,
    tableRows,
    report,
    keptFasta,
    removedFasta,
    warnings,
    basesProcessed,
    options: normalized
  };
}
