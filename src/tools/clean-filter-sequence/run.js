import { formatFastaRecord, parseFilterSequenceInput } from "../../core/fasta.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

import { applySequenceCharacterFilter } from "../../core/sequence-character-filter.js";
import { normalizeCleanFilterDnaRnaOptions } from "../../core/clean-filter-dna-rna-options.js";

import { normalizeCleanFilterProteinOptions } from "../../core/clean-filter-protein-options.js";

const WORKER_CHUNK_SIZE = 100_000;

function getAlphabetLabel(alphabet) {
  return alphabet === "protein" ? "protein" : "DNA/RNA";
}

function getAlphabetMismatchWarning(sequence, alphabet) {
  const letters = String(sequence ?? "").replace(/[^A-Za-z*]/g, "");
  if (letters.length < 12) {
    return "";
  }

  const upper = letters.toUpperCase();
  const dnaLikeCount = Array.from(upper).filter((character) => /[ACGTUN]/.test(character)).length;
  const dnaLikeFraction = dnaLikeCount / upper.length;

  if (alphabet === "dna-rna" && /[EFILOPQZJ]/.test(upper)) {
    return "input contains letters commonly found in protein sequences. If this is protein, use Clean / Filter Protein.";
  }

  if (alphabet === "protein" && dnaLikeFraction >= 0.9) {
    return "input looks nucleotide-rich. If this is DNA/RNA, use Clean / Filter DNA/RNA.";
  }

  return "";
}

function* filterSequenceChunks(sequence, alphabet, options, context) {
  let filteredCount = 0;
  const outputParts = [];
  const source = String(sequence ?? "");
  for (let index = 0; index < source.length;) {
    context.throwIfCancelled?.();
    let end = Math.min(index + WORKER_CHUNK_SIZE, source.length);
    // Keep one Unicode code point together, including at a scheduling boundary.
    if (end < source.length && /[\uD800-\uDBFF]/.test(source[end - 1]) && /[\uDC00-\uDFFF]/.test(source[end])) end += 1;
    const filtered = applySequenceCharacterFilter(source.slice(index, end), alphabet, options);
    filteredCount += filtered.filteredCount;
    outputParts.push(filtered.sequence);
    index = end;
    yield;
  }
  return { sequence: outputParts.join(""), filteredCount };
}

function shouldWarnAboutFilteredCharacters(alphabet, options = {}) {
  if (options.warnOnFilteredCharacters === true) {
    return true;
  }
  if (options.warnOnFilteredCharacters === false) {
    return false;
  }
  return false;
}

function buildCleanFilterResult(processedRecords, warnings, options = {}) {
  const dna = options.alphabet === "dna-rna";
  const formatFasta = options.formatFasta !== false;
  const lineWidth = options.lineWidth ?? 60;
  const outputParts = [];
  const sequenceRecords = [];
  let basesProcessed = 0;
  let charactersFiltered = 0;
  const removed = count => options.replacement ? 0 : count;
  const invalidSymbols = dna ? /[^ACGTURYSWKMBDHVNX.\-\s]/i : /[^A-Z*.\-\s]/i;

  for (const record of processedRecords) {
    if (formatFasta && invalidSymbols.test(record.sequence)) {
      throw new Error(`${record.title}: filtered output contains ${dna ? "non-nucleotide" : "non-protein"} characters. Choose Filtered text to retain them, or change the filter/replacement for FASTA output.`);
    }
    for (const character of record.sequence) basesProcessed += 1;
    charactersFiltered += record.filteredCount;
    // FASTA's structured records support the existing Workspace save action.
    // Plain text has no secondary FASTA or sequence-record materialization.
    if (formatFasta) sequenceRecords.push({
      title: `${record.title} filtered`,
      sequence: record.sequence.replace(/\s+/g, ""),
      sourceTitle: record.title,
      alphabet: record.alphabet,
      charactersRemoved: removed(record.filteredCount),
      charactersFiltered: record.filteredCount
    });
    outputParts.push(formatFasta
      ? formatFastaRecord(`${record.title} filtered`, record.sequence, lineWidth)
      : record.sequence);
  }

  const output = outputParts.join(!formatFasta ? "\n\n" : "\n");
  let sequenceSearch = false;
  if (formatFasta) sequenceSearch = { format: "fasta", alphabet: options.alphabet };
  else if (processedRecords.every(record => !invalidSymbols.test(record.sequence))) {
    let offset = 0;
    sequenceSearch = { format: "plain", alphabet: options.alphabet, recordRanges: outputParts.map((text, index) => {
      const range = { start: offset, end: offset + text.length, title: processedRecords[index].title };
      offset = range.end + 2;
      return range;
    }) };
  }
  const fastaOutput = formatFasta ? output : undefined;
  return makeToolResult({
    output,
    sequenceSearch,
    optionsUsed: dna ? normalizeCleanFilterDnaRnaOptions(options) : normalizeCleanFilterProteinOptions(options),
    download: {
      filename: `clean-filter-sequence.${formatFasta ? "fasta" : "txt"}`,
      mimeType: formatFasta ? "text/x-fasta;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings,
    notes: charactersFiltered > 0 && options.replacement
      ? [`${charactersFiltered} character(s) replaced by the selected filter.`] : [],
    recordsProcessed: processedRecords.length,
    basesProcessed,
    processedUnitLabel: "character",
    charactersRemoved: removed(charactersFiltered),
    streams: {
      ...(fastaOutput !== undefined ? { fasta: makeTextStream(fastaOutput, "text/x-fasta", sequenceSearch) } : {}),
      ...(formatFasta ? { sequenceRecords: {
        kind: "sequence-records",
        schema: "clean-filter-sequence",
        alphabet: processedRecords[0]?.alphabet ?? "dna-rna",
        records: sequenceRecords
      } } : {})
    }
  });
}

function* computeCleanFilterSequence(input, options = {}, context = {}) {
  const alphabet = options?.alphabet === "protein" ? "protein" : "dna-rna";
  options = { ...(alphabet === "dna-rna" ? normalizeCleanFilterDnaRnaOptions(options) : normalizeCleanFilterProteinOptions(options)), alphabet };
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const records = parseFilterSequenceInput(input, "sequence");
  if (options.preserveFilterWhitespace === false) {
    for (const record of records) record.sequence = record.sequence.replace(/\s+/g, "");
  }
  yield;

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      optionsUsed: alphabet === "dna-rna" ? normalizeCleanFilterDnaRnaOptions(options) : normalizeCleanFilterProteinOptions(options),
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel: "character",
      charactersRemoved: 0,
      charactersFiltered: 0
    });
  }

  const alphabetLabel = getAlphabetLabel(alphabet);
  const warnings = [];
  const processedRecords = [];

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    context.reportProgress?.({
      phase: "filtering-records",
      progress: 0.1 + 0.8 * (recordIndex / Math.max(1, records.length))
    });

    const mismatchWarning = getAlphabetMismatchWarning(record.sequence, alphabet);
    if (mismatchWarning) {
      warnings.push(`${record.title}: ${mismatchWarning}`);
    }

    const filtered = yield* filterSequenceChunks(record.sequence, alphabet, options, context);
    if (filtered.filteredCount > 0 && shouldWarnAboutFilteredCharacters(alphabet, options)) {
      const message =
        alphabet === "protein" && !options.filterPreset && !options.replacement && !options.caseMode
          ? `removed ${filtered.filteredCount} non-${alphabetLabel} character(s).`
          : `filtered ${filtered.filteredCount} character(s) using ${alphabetLabel} settings.`;
      warnings.push(`${record.title}: ${message}`);
    }

    if (filtered.sequence.length === 0) {
      warnings.push(`${record.title}: no ${alphabetLabel} sequence characters were found.`);
    }

    processedRecords.push({
      title: record.title,
      sequence: filtered.sequence,
      alphabet,
      filteredCount: filtered.filteredCount
    });
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  context.throwIfCancelled?.();
  yield;

  const result = buildCleanFilterResult(processedRecords, warnings, options);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}

// Both API shapes drain the same computation; only scheduling differs.
export function runCleanFilterSequence(input, options = {}) {
  const computation = computeCleanFilterSequence(input, options);
  let step = computation.next();
  while (!step.done) step = computation.next();
  return step.value;
}

export async function runCleanFilterSequenceWorker(input, options = {}, context = {}) {
  const computation = computeCleanFilterSequence(input, options, context);
  let step = computation.next();
  while (!step.done) {
    await context.yieldIfNeeded?.();
    context.throwIfCancelled?.();
    step = computation.next();
  }
  return step.value;
}

export function runCleanFilterDnaRna(input, options = {}) {
  return runCleanFilterSequence(input, { ...options, alphabet: "dna-rna" });
}

export function runCleanFilterDnaRnaWorker(input, options = {}, context = {}) {
  return runCleanFilterSequenceWorker(input, { ...options, alphabet: "dna-rna" }, context);
}

export function runCleanFilterProtein(input, options = {}) {
  return runCleanFilterSequence(input, { ...options, alphabet: "protein" });
}

export function runCleanFilterProteinWorker(input, options = {}, context = {}) {
  return runCleanFilterSequenceWorker(input, { ...options, alphabet: "protein" }, context);
}
