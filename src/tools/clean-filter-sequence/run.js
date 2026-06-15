import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

const WORKER_CHUNK_SIZE = 100_000;

function getAlphabetLabel(alphabet) {
  return alphabet === "protein" ? "protein" : "DNA/RNA";
}

function parseFilterSequenceInput(input, fallbackTitle = "sequence") {
  const text = String(input ?? "");
  if (!text.trim()) {
    return [];
  }

  if (!text.trimStart().startsWith(">")) {
    return [
      {
        title: fallbackTitle,
        sequence: text,
        hadHeader: false
      }
    ];
  }

  const records = [];
  const normalized = text.replace(/^\s+/, "");
  const entries = normalized.split(/\n(?=>)/);
  for (const entry of entries) {
    const lines = entry.split(/\r?\n/);
    const header = lines.shift() ?? "";
    const title = header.replace(/^>\s*/, "").trim() || fallbackTitle;
    records.push({
      title,
      sequence: lines.join("\n"),
      hadHeader: true
    });
  }
  return records;
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

function getCaseMode(options = {}) {
  if (["uppercase", "lowercase", "preserve"].includes(options.caseMode)) {
    return options.caseMode;
  }
  return options.preserveCase === false ? "uppercase" : "preserve";
}

function applyCaseMode(sequence, options = {}) {
  const caseMode = getCaseMode(options);
  if (caseMode === "uppercase") {
    return String(sequence ?? "").toUpperCase();
  }
  if (caseMode === "lowercase") {
    return String(sequence ?? "").toLowerCase();
  }
  return String(sequence ?? "");
}

function isDnaRnaIupac(character) {
  return /[ACGTURYSWKMBDHVNX]/i.test(character);
}

function isBasicDnaRna(character) {
  return /[ACGTUN]/i.test(character);
}

function isProteinIupac(character) {
  return /[ABCDEFGHIKLMNPQRSTUVWYZXJO*]/i.test(character);
}

function isStandardProtein(character) {
  return /[ACDEFGHIKLMNPQRSTVWY]/i.test(character);
}

function isAllowedGap(character, options = {}) {
  return options.keepGaps === true && /[.-]/.test(character);
}

function isLowercaseLetter(character) {
  return /[a-z]/.test(character);
}

function isUppercaseLetter(character) {
  return /[A-Z]/.test(character);
}

function getFilterPreset(alphabet, options = {}) {
  if (options.filterPreset) {
    return options.filterPreset;
  }
  return alphabet === "protein" ? "valid-protein-iupac" : "valid-dna-rna-iupac";
}

function shouldFilterCharacter(character, alphabet, options = {}) {
  const preset = getFilterPreset(alphabet, options);

  if (alphabet === "protein") {
    if (preset === "standard-protein") {
      return !(isStandardProtein(character) || isAllowedGap(character, options));
    }
    if (preset === "standard-protein-stop") {
      return !(isStandardProtein(character) || character === "*" || isAllowedGap(character, options));
    }
    if (preset === "whitespace") {
      return /\s/.test(character);
    }
    if (preset === "digits") {
      return /\d/.test(character);
    }
    if (preset === "digits-whitespace") {
      return /[\s\d]/.test(character);
    }
    if (preset === "keep-lowercase-protein") {
      return !(isProteinIupac(character) && isLowercaseLetter(character));
    }
    if (preset === "keep-uppercase-protein") {
      return !(isProteinIupac(character) && isUppercaseLetter(character));
    }
    return !(isProteinIupac(character) || isAllowedGap(character, options));
  }

  if (preset === "valid-basic-dna-rna") {
    return !(isBasicDnaRna(character) || isAllowedGap(character, options));
  }
  if (preset === "remove-t") {
    return /[tT]/.test(character);
  }
  if (preset === "remove-u") {
    return /[uU]/.test(character);
  }
  if (preset === "whitespace") {
    return /\s/.test(character);
  }
  if (preset === "digits") {
    return /\d/.test(character);
  }
  if (preset === "digits-whitespace") {
    return /[\s\d]/.test(character);
  }
  if (preset === "keep-lowercase-dna-rna") {
    return !(isDnaRnaIupac(character) && isLowercaseLetter(character));
  }
  if (preset === "keep-uppercase-dna-rna") {
    return !(isDnaRnaIupac(character) && isUppercaseLetter(character));
  }

  return !(isDnaRnaIupac(character) || isAllowedGap(character, options));
}

function applyFilterToSequence(sequence, alphabet, options = {}) {
  let filteredCount = 0;
  let output = "";
  const replacement = String(options.replacement ?? "");

  for (const character of String(sequence ?? "")) {
    if (shouldFilterCharacter(character, alphabet, options)) {
      filteredCount += 1;
      output += replacement;
    } else {
      output += character;
    }
  }

  return {
    sequence: applyCaseMode(output, options),
    filteredCount
  };
}

async function applyFilterToSequenceChunked(sequence, alphabet, options = {}, context = {}) {
  let filteredCount = 0;
  const outputParts = [];
  const source = String(sequence ?? "");

  for (let index = 0; index < source.length; index += WORKER_CHUNK_SIZE) {
    context.throwIfCancelled?.();
    const filtered = applyFilterToSequence(
      source.slice(index, index + WORKER_CHUNK_SIZE),
      alphabet,
      options
    );
    filteredCount += filtered.filteredCount;
    outputParts.push(filtered.sequence);
    await context.yieldIfNeeded?.();
  }

  return {
    sequence: outputParts.join(""),
    filteredCount
  };
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
  const formatFasta = options.formatFasta !== false;
  const lineWidth = options.lineWidth ?? 60;
  const outputParts = [];
  const sequenceRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of processedRecords) {
    basesProcessed += record.sequence.length;
    charactersRemoved += record.filteredCount;
    sequenceRecords.push({
      title: `${record.title} filtered`,
      sequence: record.sequence,
      sourceTitle: record.title,
      alphabet: record.alphabet,
      charactersRemoved: record.filteredCount,
      charactersFiltered: record.filteredCount
    });

    if (formatFasta) {
      outputParts.push(formatFastaRecord(`${record.title} filtered`, record.sequence, lineWidth));
    } else {
      outputParts.push(record.sequence);
    }
  }

  const output = outputParts.join("\n");
  const fastaOutput = sequenceRecords
    .map((record) => formatFastaRecord(record.title, record.sequence, lineWidth))
    .join("\n");

  return makeToolResult({
    output,
    download: {
      filename: `clean-filter-sequence.${formatFasta ? "fasta" : "txt"}`,
      mimeType: "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: processedRecords.length,
    basesProcessed,
    charactersRemoved,
    charactersFiltered: charactersRemoved,
    streams: {
      fasta: makeTextStream(fastaOutput, "text/x-fasta"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "clean-filter-sequence",
        alphabet: processedRecords[0]?.alphabet ?? "dna-rna",
        records: sequenceRecords
      }
    }
  });
}

export function runCleanFilterSequence(input, options = {}) {
  const records = options.preserveFilterWhitespace === false
    ? parseSequenceInput(input, "sequence")
    : parseFilterSequenceInput(input, "sequence");
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
  const processedRecords = [];

  for (const record of records) {
    const mismatchWarning = getAlphabetMismatchWarning(record.sequence, alphabet);
    if (mismatchWarning) {
      warnings.push(`${record.title}: ${mismatchWarning}`);
    }

    const cleaned = applyFilterToSequence(record.sequence, alphabet, options);
    const sequence = cleaned.sequence;
    const filteredCount = cleaned.filteredCount ?? cleaned.removedCount ?? 0;

    if (filteredCount > 0 && shouldWarnAboutFilteredCharacters(alphabet, options)) {
      const message =
        alphabet === "protein" && !options.filterPreset && !options.replacement && !options.caseMode
          ? `removed ${filteredCount} non-${alphabetLabel} character(s).`
          : `filtered ${filteredCount} character(s) using ${alphabetLabel} settings.`;
      warnings.push(`${record.title}: ${message}`);
    }

    if (sequence.length === 0) {
      warnings.push(`${record.title}: no ${alphabetLabel} sequence characters were found.`);
    }

    processedRecords.push({
      title: record.title,
      sequence,
      alphabet,
      filteredCount
    });
  }

  return buildCleanFilterResult(processedRecords, warnings, options);
}

export async function runCleanFilterSequenceWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const records = options.preserveFilterWhitespace === false
    ? parseSequenceInput(input, "sequence")
    : parseFilterSequenceInput(input, "sequence");
  await context.yieldIfNeeded?.();

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0,
      charactersFiltered: 0
    });
  }

  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
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

    const filtered = await applyFilterToSequenceChunked(record.sequence, alphabet, options, context);
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
  await context.yieldIfNeeded?.();

  const result = buildCleanFilterResult(processedRecords, warnings, options);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
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
