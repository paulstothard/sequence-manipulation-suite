import { parseSequenceInput } from "../../core/fasta.js";
import {
  cleanSequence,
  complementDnaRnaSequence,
  getGroupedSequenceNumberWidth,
  groupSequence
} from "../../core/sequence.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

const LARGE_GROUPED_OUTPUT_WARNING_BYTES = 1000000;

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
    return "input contains letters commonly found in protein sequences. If this is protein, use Group / Number Protein.";
  }

  if (alphabet === "protein" && dnaLikeFraction >= 0.9) {
    return "input looks nucleotide-rich. If this is DNA/RNA, use Group / Number DNA/RNA.";
  }

  return "";
}

function groupSequenceWithComplement(sequence, options = {}) {
  const grouped = groupSequence(sequence, options).split("\n");
  const complement = complementDnaRnaSequence(sequence, {
    preserveCase: options.preserveCase
  });
  const groupedComplement = groupSequence(complement, {
    ...options,
    showPositionNumbers: false
  }).split("\n");
  const lines = [];
  const showPositionNumbers = options.showPositionNumbers === true;
  const numberWidth = getGroupedSequenceNumberWidth(sequence, options);

  for (let index = 0; index < grouped.length; index += 1) {
    lines.push(grouped[index]);

    const complementLine = groupedComplement[index] ?? "";
    if (showPositionNumbers) {
      lines.push(`${"".padStart(numberWidth, " ")} ${complementLine}`);
    } else {
      lines.push(complementLine);
    }
  }

  return lines.join("\n");
}

export function runGroupNumberSequence(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  const alphabetLabel = getAlphabetLabel(alphabet);
  const outputParts = [];
  const groupedRecords = [];
  const sequenceRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    context.throwIfCancelled?.();
    const mismatchWarning = getAlphabetMismatchWarning(record.sequence, alphabet);
    if (mismatchWarning) {
      warnings.push(`${record.title}: ${mismatchWarning}`);
    }

    const cleaned = cleanSequence(record.sequence, {
      alphabet,
      preserveCase: options.preserveCase,
      keepGaps: options.keepGaps
    });
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} non-${alphabetLabel} character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no ${alphabetLabel} sequence characters were found.`);
    }

    const groupOptions = {
      groupSize: options.groupSize,
      groupsPerLine: options.groupsPerLine,
      showPositionNumbers: options.showPositionNumbers,
      startPosition: options.startPosition,
      preserveCase: options.preserveCase
    };
    const grouped =
      alphabet === "dna-rna" && options.showComplement !== false
        ? groupSequenceWithComplement(cleaned.sequence, groupOptions)
        : groupSequence(cleaned.sequence, groupOptions);

    const title = `${record.title} grouped`;
    const text = `${title}\n${grouped}`;
    outputParts.push(text);
    groupedRecords.push({
      title,
      text,
      sourceTitle: record.title,
      alphabet
    });
    sequenceRecords.push({
      title: record.title,
      sequence: cleaned.sequence,
      sourceTitle: record.title,
      alphabet,
      charactersRemoved: cleaned.removedCount
    });
  }

  const output = `${outputParts.join("\n\n")}\n`;
  if (output.length > LARGE_GROUPED_OUTPUT_WARNING_BYTES) {
    warnings.push(
      `Grouped output is ${output.length.toLocaleString()} characters. Copy/download may be slow for very large grouped outputs.`
    );
  }

  return makeToolResult({
    output,
    download: {
      filename: "group-number-sequence.txt",
      mimeType: "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      groupedText: makeTextStream(output, "text/plain"),
      textRecords: {
        kind: "text-records",
        schema: "group-number-sequence",
        records: groupedRecords
      },
      sequenceRecords: {
        kind: "sequence-records",
        schema: "group-number-sequence-cleaned",
        alphabet,
        records: sequenceRecords
      }
    }
  });
}

export function runGroupNumberDnaRna(input, options = {}, context = {}) {
  return runGroupNumberSequence(input, { ...options, alphabet: "dna-rna" }, context);
}

export function runGroupNumberProtein(input, options = {}, context = {}) {
  return runGroupNumberSequence(input, { ...options, alphabet: "protein", showComplement: false }, context);
}
