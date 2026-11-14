import { parseSequenceInput } from "../../core/fasta.js";
import { normalizeGroupNumberOptions } from "../../core/group-number-options.js";
import {
  cleanSequence,
  complementDnaRnaSequence,
  groupSequenceLines
} from "../../core/sequence.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

const LARGE_GROUPED_OUTPUT_WARNING_BYTES = 1000000;
const SEQUENCE_CHUNK_SIZE = 100000;

function getAlphabetLabel(alphabet) {
  return alphabet === "protein" ? "protein" : "DNA/RNA";
}

function* cleanRecord(sequence, options, context) {
  const parts = [];
  let removedCount = 0;
  let gapsRemoved = 0;
  let letterCount = 0;
  let dnaLikeCount = 0;
  let proteinLetters = false;
  for (let start = 0; start < sequence.length;) {
    context.throwIfCancelled?.();
    let end = Math.min(sequence.length, start + SEQUENCE_CHUNK_SIZE);
    if (end < sequence.length && /[\uD800-\uDBFF]/.test(sequence[end - 1])) end += 1;
    const chunk = sequence.slice(start, end);
    const cleaned = cleanSequence(chunk, options);
    parts.push(cleaned.sequence);
    removedCount += cleaned.removedCount;
    if (!options.keepGaps) gapsRemoved += chunk.replace(/[^.-]/g, "").length;
    const letters = chunk.replace(/[^A-Za-z*]/g, "").toUpperCase();
    letterCount += letters.length;
    dnaLikeCount += letters.replace(/[^ACGTUN]/g, "").length;
    proteinLetters ||= /[EFILOPQZJ]/.test(letters);
    start = end;
    yield;
  }
  let mismatchWarning = "";
  if (letterCount >= 12) {
    if (options.alphabet === "dna-rna" && proteinLetters) mismatchWarning = "input contains letters commonly found in protein sequences. If this is protein, use Group / Number Protein.";
    if (options.alphabet === "protein" && dnaLikeCount / letterCount >= 0.9) mismatchWarning = "input looks nucleotide-rich. If this is DNA/RNA, use Group / Number DNA/RNA.";
  }
  return { sequence: parts.join(""), removedCount, gapsRemoved, mismatchWarning };
}

function* computeGroupNumberSequence(input, options = {}, context = {}) {
  options = normalizeGroupNumberOptions(options);
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, "sequence", { strictHeaders: true });
  yield;
  const warnings = [];
  const notes = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      optionsUsed: options,
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      processedUnitLabel: "character",
      charactersRemoved: 0,
      streams: options.outputFormat === "sequence-records"
        ? { sequenceRecords: { kind: "sequence-records", schema: "group-number-sequence-cleaned", alphabet: options.alphabet, records: [] } }
        : options.outputFormat === "text-records"
          ? { textRecords: { kind: "text-records", schema: "group-number-sequence", records: [] } }
          : {}
    });
  }

  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  const alphabetLabel = getAlphabetLabel(alphabet);
  const sequenceOnly = options.outputFormat === "sequence-records";
  const textRecordsOnly = options.outputFormat === "text-records";
  const outputParts = [];
  const groupedRecords = [];
  const sequenceRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const [recordIndex, record] of records.entries()) {
    context.throwIfCancelled?.();
    context.reportProgress?.({ phase: "cleaning-record", progress: 0.1 + 0.8 * recordIndex / records.length });
    const cleaned = yield* cleanRecord(record.sequence, options, context);
    if (cleaned.mismatchWarning) warnings.push(`${record.title}: ${cleaned.mismatchWarning}`);
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    const invalidRemoved = cleaned.removedCount - cleaned.gapsRemoved;
    if (invalidRemoved > 0) {
      warnings.push(
        `${record.title}: removed ${invalidRemoved} non-${alphabetLabel} character(s).`
      );
    }
    if (cleaned.gapsRemoved > 0) notes.push(`${record.title}: removed ${cleaned.gapsRemoved} gap character(s) before grouping, as selected.`);

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no ${alphabetLabel} sequence characters were found.`);
    }

    if (sequenceOnly) {
      sequenceRecords.push({
        title: record.title,
        sequence: cleaned.sequence,
        sourceTitle: record.title,
        alphabet,
        charactersRemoved: cleaned.removedCount
      });
      continue;
    }

    context.reportProgress?.({ phase: "grouping-record", progress: 0.1 + 0.8 * (recordIndex + 0.5) / records.length });
    const lines = [];
    let pendingCharacters = 0;
    for (const line of groupSequenceLines(cleaned.sequence, options)) {
      lines.push(line.text);
      if (options.showComplement) {
        const indent = options.showPositionNumbers ? " ".repeat(line.numberWidth + 1) : "";
        lines.push(indent + complementDnaRnaSequence(line.grouped, options));
      }
      pendingCharacters += line.text.length;
      if (pendingCharacters >= SEQUENCE_CHUNK_SIZE) {
        context.throwIfCancelled?.();
        yield;
        pendingCharacters = 0;
      }
    }
    const grouped = lines.join("\n");

    const title = `${record.title} grouped`;
    const text = `${title}\n${grouped}`;
    if (!textRecordsOnly) outputParts.push(text);
    if (textRecordsOnly) groupedRecords.push({
      title,
      text,
      sourceTitle: record.title,
      alphabet
    });
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  yield;
  const output = outputParts.length ? `${outputParts.join("\n\n")}\n` : "";
  const outputCharacters = textRecordsOnly ? groupedRecords.reduce((count, record) => count + record.text.length, 0) : output.length;
  if (outputCharacters > LARGE_GROUPED_OUTPUT_WARNING_BYTES) {
    warnings.push(
      `Grouped output is ${outputCharacters.toLocaleString()} characters. Copy/download may be slow for very large grouped outputs.`
    );
  }

  return makeToolResult({
    output,
    optionsUsed: options,
    sequenceSearch: !sequenceOnly && !textRecordsOnly && {
      format: "grouped",
      alphabet,
      showComplement: alphabet === "dna-rna" && options.showComplement !== false
    },
    download: {
      filename: "group-number-sequence.txt",
      mimeType: "text/plain;charset=utf-8"
    },
    warnings,
    notes,
    recordsProcessed: records.length,
    basesProcessed,
    processedUnitLabel: "character",
    charactersRemoved,
    streams: {
      ...(!sequenceOnly && !textRecordsOnly ? { groupedText: makeTextStream(output, "text/plain", {
        format: "grouped",
        alphabet,
        showComplement: alphabet === "dna-rna" && options.showComplement !== false
      }) } : {}),
      ...(textRecordsOnly ? { textRecords: {
        kind: "text-records",
        schema: "group-number-sequence",
        records: groupedRecords
      } } : {}),
      ...(sequenceOnly ? { sequenceRecords: {
        kind: "sequence-records",
        schema: "group-number-sequence-cleaned",
        alphabet,
        records: sequenceRecords
      } } : {})
    }
  });
}

// Preserve the synchronous direct API; native workers drain the same computation
// with their scheduler. Cleanup, formatting and result construction have one owner.
export function runGroupNumberSequence(input, options = {}, context = {}) {
  const computation = computeGroupNumberSequence(input, options, context);
  if (context.yieldIfNeeded) return (async () => {
    let step = computation.next();
    while (!step.done) {
      await context.yieldIfNeeded();
      context.throwIfCancelled?.();
      step = computation.next();
    }
    return step.value;
  })();
  let step = computation.next();
  while (!step.done) step = computation.next();
  return step.value;
}

export function runGroupNumberDnaRna(input, options = {}, context = {}) {
  return runGroupNumberSequence(input, { ...options, alphabet: "dna-rna" }, context);
}

export function runGroupNumberProtein(input, options = {}, context = {}) {
  return runGroupNumberSequence(input, { ...options, alphabet: "protein", showComplement: false }, context);
}
