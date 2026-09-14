import { formatFastaRecord, parseSequenceInput } from "./fasta.js";

export const FASTA_LENGTH_FILTER_LIMITS = Object.freeze({
  maxMaterializedOutputCharacters: 25 * 1024 * 1024,
  maxSequenceQueryCharacters: 10_000
});

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

export function normalizeFastaLengthFilterOptions(options = {}) {
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
  const normalized = normalizeFastaLengthFilterOptions(options);
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

function countSequenceStats(state, text) {
  const upper = text.toUpperCase();
  for (const character of upper) {
    if (character === "G" || character === "C") state.gc += 1;
    if (character === "A" || character === "C" || character === "G" || character === "T" || character === "U") {
      state.atgc += 1;
    } else {
      state.ambiguous += 1;
    }
    if (state.leadingOpen) {
      if (character === "T" || character === "U") state.leadingTu += 1;
      else state.leadingOpen = false;
    }
    state.trailingA = character === "A" ? state.trailingA + 1 : 0;
  }
  if (state.sequenceContains && !state.sequenceContainsFound) {
    const combined = state.sequenceCarry + upper;
    state.sequenceContainsFound = combined.includes(state.sequenceContains);
    const overlap = Math.max(0, state.sequenceContains.length - 1);
    state.sequenceCarry = overlap > 0 ? combined.slice(-overlap) : "";
  }
}

function makeStreamingReasons(record, normalized) {
  const reasons = [];
  if (record.length < normalized.minLength) {
    reasons.push(`length ${record.length} is shorter than minimum ${normalized.minLength}`);
  }
  if (record.length > normalized.maxLength) {
    reasons.push(`length ${record.length} is longer than maximum ${normalized.maxLength}`);
  }
  if (normalized.titleContains && !record.title.toLowerCase().includes(normalized.titleContains.toLowerCase())) {
    reasons.push(`title does not contain "${normalized.titleContains}"`);
  }
  if (normalized.sequenceContains && !record.sequenceContainsFound) {
    reasons.push(`sequence does not contain "${normalized.sequenceContains}"`);
  }
  if (normalized.minGcPercent !== null && (record.gcPercent === null || record.gcPercent < normalized.minGcPercent)) {
    reasons.push(`GC percent is below ${normalized.minGcPercent}`);
  }
  if (normalized.maxGcPercent !== null && (record.gcPercent === null || record.gcPercent > normalized.maxGcPercent)) {
    reasons.push(`GC percent is above ${normalized.maxGcPercent}`);
  }
  if (normalized.maxAmbiguousCount !== null && record.ambiguousCount > normalized.maxAmbiguousCount) {
    reasons.push(`ambiguous character count ${record.ambiguousCount} is above ${normalized.maxAmbiguousCount}`);
  }
  return reasons;
}

function makeFilterReport(analysis, normalized) {
  const maxLabel = Number.isFinite(normalized.maxLength) ? normalized.maxLength : "no maximum";
  return [
    "FASTA filter / select",
    "",
    `Records processed: ${analysis.records.length}`,
    `Bases processed: ${analysis.basesProcessed}`,
    `Length range: ${normalized.minLength} to ${maxLabel}`,
    `Title contains: ${normalized.titleContains || "not used"}`,
    `Sequence contains: ${normalized.sequenceContains || "not used"}`,
    `GC percent range: ${normalized.minGcPercent ?? "no minimum"} to ${normalized.maxGcPercent ?? "no maximum"}`,
    `Maximum ambiguous characters: ${normalized.maxAmbiguousCount ?? "not used"}`,
    `Action for matching records: ${normalized.selectionAction === "keep" ? "Keep matching records" : "Remove matching records"}`,
    `Output sort: ${normalized.sortMode}`,
    `Terminal poly-A/T trimming: ${normalized.trimTerminalPolyAt ? `on, minimum run ${normalized.polyAtMinLength}` : "off"}`,
    `Join selected records: ${normalized.joinSelectedRecords ? `yes, title "${normalized.joinedTitle}"` : "no"}`,
    `Records selected: ${analysis.keptCount}`,
    `Records not selected: ${analysis.removedCount}`,
    `Output FASTA records: ${normalized.joinSelectedRecords && analysis.keptCount > 0 ? 1 : analysis.keptCount}`
  ].join("\n");
}

function formattedFastaLength(title, sequenceLength, lineWidth) {
  return title.length + 2 + sequenceLength + (sequenceLength > 0 ? Math.ceil(sequenceLength / lineWidth) : 0);
}

function compareStreamingRecords(left, right, sortMode) {
  const compareStrings = (first, second) => String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: "base" });
  if (sortMode === "length-asc") return left.sortLength - right.sortLength || compareStrings(left.title, right.title);
  if (sortMode === "length-desc") return right.sortLength - left.sortLength || compareStrings(left.title, right.title);
  if (sortMode === "title-asc") return compareStrings(left.title, right.title);
  if (sortMode === "title-desc") return compareStrings(right.title, left.title);
  if (sortMode === "gc-asc") return (left.sortGcPercent ?? -1) - (right.sortGcPercent ?? -1) || compareStrings(left.title, right.title);
  if (sortMode === "gc-desc") return (right.sortGcPercent ?? -1) - (left.sortGcPercent ?? -1) || compareStrings(left.title, right.title);
  if (sortMode === "ambiguous-asc") return left.sortAmbiguousCount - right.sortAmbiguousCount || compareStrings(left.title, right.title);
  if (sortMode === "ambiguous-desc") return right.sortAmbiguousCount - left.sortAmbiguousCount || compareStrings(left.title, right.title);
  return left.index - right.index;
}

async function materializeSelectedRecords(source, records, normalized, outputFormat, options, context) {
  const includeKept = outputFormat === "filtered-fasta";
  const targets = records.filter((record) => includeKept ? record.keep : !record.keep);
  const lineWidth = normalized.lineWidth;
  const maxOutputCharacters = normalizePositiveLimit(
    options.maxMaterializedOutputCharacters,
    FASTA_LENGTH_FILTER_LIMITS.maxMaterializedOutputCharacters
  );
  const predictedLength = includeKept && normalized.joinSelectedRecords && targets.length > 0
    ? formattedFastaLength(normalized.joinedTitle, targets.reduce((sum, record) => sum + record.outputLength, 0), lineWidth)
    : targets.reduce((sum, record) => sum + formattedFastaLength(
      record.title,
      includeKept ? record.outputLength : record.length,
      lineWidth
    ), 0);
  if (predictedLength > maxOutputCharacters) {
    throw new Error(`Selected FASTA output would contain ${predictedLength.toLocaleString()} characters, above the current materialized-output limit of ${maxOutputCharacters.toLocaleString()}. Choose a summary/table output or narrow the selection.`);
  }

  const byIndex = new Map(targets.map((record) => [record.index, { ...record, parts: [] }]));
  for await (const event of source.events({ recordIndexes: byIndex.keys(), trackStats: false })) {
    context.throwIfCancelled?.();
    if (event.type === "sequence-chunk") byIndex.get(event.record)?.parts.push(event.text);
  }
  let materialized = targets.map((record) => {
    const value = byIndex.get(record.index);
    const originalSequence = value?.parts.join("") ?? "";
    const end = Math.max(record.trimmedFivePrime, originalSequence.length - record.trimmedThreePrime);
    const sequence = includeKept
      ? originalSequence.slice(record.trimmedFivePrime, end)
      : originalSequence;
    const stats = sequenceStats(sequence);
    return {
      ...record,
      sequence,
      sortLength: sequence.length,
      sortGcPercent: stats.gcPercent,
      sortAmbiguousCount: stats.ambiguousCount
    };
  });
  if (includeKept) materialized.sort((left, right) => compareStreamingRecords(left, right, normalized.sortMode));
  if (includeKept && normalized.joinSelectedRecords && materialized.length > 0) {
    materialized = [{
      title: normalized.joinedTitle,
      sequence: materialized.map((record) => record.sequence).join("")
    }];
  }
  return {
    records: materialized,
    fasta: materialized.map((record) => formatFastaRecord(record.title, record.sequence, lineWidth)).join("")
  };
}

function normalizePositiveLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function filterFastaRecordSource(source, options = {}, context = {}) {
  const normalized = normalizeFastaLengthFilterOptions(options);
  if (normalized.sequenceContains.length > FASTA_LENGTH_FILTER_LIMITS.maxSequenceQueryCharacters) {
    throw new Error(`Sequence filter text contains ${normalized.sequenceContains.length.toLocaleString()} characters, above the current limit of ${FASTA_LENGTH_FILTER_LIMITS.maxSequenceQueryCharacters.toLocaleString()}.`);
  }
  const outputFormat = ["filtered-fasta", "removed-fasta", "report", "tsv"].includes(options.outputFormat)
    ? options.outputFormat
    : "filtered-fasta";
  const records = [];
  let current = null;
  let basesProcessed = 0;

  for await (const event of source.events()) {
    context.throwIfCancelled?.();
    if (event.type === "record-start") {
      current = {
        index: event.record,
        title: event.title,
        length: 0,
        gc: 0,
        atgc: 0,
        ambiguous: 0,
        leadingOpen: true,
        leadingTu: 0,
        trailingA: 0,
        sequenceContains: normalized.sequenceContains,
        sequenceContainsFound: !normalized.sequenceContains,
        sequenceCarry: ""
      };
      continue;
    }
    if (event.type === "sequence-chunk" && current) {
      current.length += event.text.length;
      basesProcessed += event.text.length;
      countSequenceStats(current, event.text);
      continue;
    }
    if (event.type === "record-end" && current) {
      current.length = event.length;
      current.gcPercent = current.atgc > 0 ? Number(((current.gc / current.atgc) * 100).toFixed(2)) : null;
      current.ambiguousCount = current.ambiguous;
      current.trimmedFivePrime = normalized.trimTerminalPolyAt && current.leadingTu >= normalized.polyAtMinLength ? current.leadingTu : 0;
      current.trimmedThreePrime = normalized.trimTerminalPolyAt && current.trailingA >= normalized.polyAtMinLength ? current.trailingA : 0;
      const outputEnd = Math.max(current.trimmedFivePrime, current.length - current.trimmedThreePrime);
      current.outputLength = outputEnd - current.trimmedFivePrime;
      current.reasons = makeStreamingReasons(current, normalized);
      const matches = current.reasons.length === 0;
      current.keep = normalized.selectionAction === "keep" ? matches : !matches;
      records.push({
        index: current.index,
        title: current.title,
        length: current.length,
        gcPercent: current.gcPercent,
        ambiguousCount: current.ambiguousCount,
        trimmedFivePrime: current.trimmedFivePrime,
        trimmedThreePrime: current.trimmedThreePrime,
        outputLength: current.outputLength,
        reasons: current.reasons,
        keep: current.keep
      });
      current = null;
    }
  }

  const warnings = [...source.warnings];
  if (records.length === 0) warnings.push("No sequence input was provided.");
  if (source.stats.usedRawSequence) warnings.push("Input did not start with a FASTA header; treated it as one raw sequence record.");
  if (normalized.maxLength < normalized.minLength) {
    warnings.push("Maximum length is shorter than minimum length; no records can be within the selected range.");
  }
  if (normalized.minGcPercent !== null || normalized.maxGcPercent !== null) {
    warnings.push("GC percent filters count A/C/G/T/U characters only; other symbols are ignored for the percentage denominator.");
  }
  const keptCount = records.filter((record) => record.keep).length;
  const removedCount = records.length - keptCount;
  const analysis = { records, basesProcessed, keptCount, removedCount };
  const tableRows = outputFormat === "tsv"
    ? records.map((record) => ({
      title: record.title,
      length: record.length,
      output_length: record.keep ? record.outputLength : "",
      gc_percent: record.gcPercent,
      ambiguous_count: record.ambiguousCount,
      trimmed_5_prime: record.keep ? record.trimmedFivePrime : 0,
      trimmed_3_prime: record.keep ? record.trimmedThreePrime : 0,
      status: record.keep ? "kept" : "removed",
      reason: record.reasons.length > 0 ? record.reasons.join("; ") : "matched all selected criteria"
    }))
    : [];
  const report = outputFormat === "report" ? makeFilterReport(analysis, normalized) : "";
  const selected = ["filtered-fasta", "removed-fasta"].includes(outputFormat)
    ? await materializeSelectedRecords(source, records, normalized, outputFormat, options, context)
    : { records: [], fasta: "" };

  return {
    records,
    keptRecords: outputFormat === "filtered-fasta" ? selected.records : [],
    removedRecords: outputFormat === "removed-fasta" ? selected.records : [],
    tableRows,
    report,
    keptFasta: outputFormat === "filtered-fasta" ? selected.fasta : "",
    removedFasta: outputFormat === "removed-fasta" ? selected.fasta : "",
    warnings,
    basesProcessed,
    options: normalized,
    keptCount,
    removedCount
  };
}
