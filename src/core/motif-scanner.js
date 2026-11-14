import { normalizePwmThreshold } from "./motif-scanner-options.js";
import { findPatternMatchSteps } from "./pattern.js";
import { cleanSequence, complementDnaRnaSequence, makeSequenceContext } from "./sequence.js";

const SUPPORTED_SYNTAXES = new Set(["exact", "iupac", "regex", "pwm"]);

export const motifMatchTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "motif_id", label: "Motif ID", type: "string" },
  { id: "motif_name", label: "Motif name", type: "string" },
  { id: "motif_class", label: "Motif class", type: "string" },
  { id: "source", label: "Source", type: "string" },
  { id: "syntax", label: "Syntax", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched text", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" },
  { id: "score", label: "Score", type: "number" },
  { id: "description", label: "Description", type: "string" },
  { id: "record_index", label: "Record number", type: "number" }
];

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function getPatternMode(syntax) {
  if (syntax === "regex") {
    return "regex";
  }
  if (syntax === "iupac") {
    return "iupac";
  }
  return "plain";
}

function makeMatchRow(recordTitle, sequence, motif, match, strand = "+") {
  return {
    record: recordTitle,
    record_index: 1,
    motif_id: motif.id,
    motif_name: motif.name,
    motif_class: motif.class,
    source: motif.source?.name ?? "",
    syntax: motif.syntax,
    strand,
    start: match.start,
    end: match.end,
    length: match.length,
    ...makeSequenceContext(sequence, match.start, match.end),
    score: match.score ?? null,
    description: motif.description
  };
}

function normalizePwmBase(base) {
  const upper = String(base ?? "").toUpperCase();
  return upper === "U" ? "T" : upper;
}

function scorePwmWindow(sequence, startIndex, motif) {
  const weights = motif.pwm?.weights ?? [];
  const alphabet = motif.pwm?.alphabet ?? ["A", "C", "G", "T"];
  if (weights.length === 0) {
    throw new Error("PWM motif is missing weights.");
  }
  let rawScore = 0;
  for (let offset = 0; offset < weights.length; offset += 1) {
    const base = normalizePwmBase(sequence[startIndex + offset]);
    const column = weights[offset];
    const weight = Array.isArray(column) ? column[alphabet.indexOf(base)] : column[base];
    if (weight === undefined) {
      return null;
    }
    rawScore += weight;
  }
  const minScore = Number(motif.pwm.minScore);
  const maxScore = Number(motif.pwm.maxScore);
  const denominator = maxScore - minScore;
  const relativeScore = denominator === 0 ? 100 : ((rawScore - minScore) / denominator) * 100;
  return {
    rawScore,
    relativeScore
  };
}

function findPwmMatches(sequence, motif, options = {}, context = {}) {
  const length = motif.pwm?.weights?.length ?? 0;
  if (length <= 0) {
    throw new Error("PWM motif length is zero.");
  }
  if (sequence.length < length) {
    return [];
  }
  const threshold = normalizePwmThreshold(options.pwmThresholdPercent);
  const allowOverlaps = options.allowOverlaps !== false;
  const matches = [];
  for (let index = 0; index <= sequence.length - length; index += 1) {
    if (index % 4096 === 0) {
      context.throwIfCancelled?.();
    }
    const score = scorePwmWindow(sequence, index, motif);
    if (!score || score.relativeScore < threshold) {
      continue;
    }
    matches.push({
      start: index + 1,
      end: index + length,
      length,
      matchedText: sequence.slice(index, index + length),
      score: score.relativeScore
    });
    if (Number.isFinite(options.maxMatches) && matches.length > options.maxMatches) {
      throw new Error(`PWM matches exceed the ${options.maxMatches.toLocaleString()}-hit scan limit.`);
    }
    if (!allowOverlaps) {
      index += length - 1;
    }
  }
  return matches;
}

function shouldScanReverse(motif, options = {}) {
  if (motif.alphabet !== "dna-rna") {
    return false;
  }
  if (options.strand === "forward") {
    return false;
  }
  return motif.match?.strand === "both" || options.strand === "both";
}

function* scanMotif(recordTitle, sequence, motif, options = {}, context = {}) {
  const warnings = [];

  if (!SUPPORTED_SYNTAXES.has(motif.syntax)) {
    return {
      rows: [],
      warnings: [`${motif.id}: unsupported motif syntax "${motif.syntax}".`]
    };
  }

  const patternOptions = {
    alphabet: motif.alphabet,
    patternMode: getPatternMode(motif.syntax),
    allowOverlaps: options.allowOverlaps ?? motif.match?.overlappingDefault ?? true,
    caseInsensitive: true,
    ...(Number.isFinite(options.maxMatches) ? { maxMatches: options.maxMatches } : {}),
    ...(Number.isFinite(options.maxMatchedCharacters) ? { maxMatchedCharacters: options.maxMatchedCharacters } : {})
  };
  const rows = [];
  const matchFinder = motif.syntax === "pwm"
    ? function* (sourceSequence) { return findPwmMatches(sourceSequence, motif, options, context); }
    : (sourceSequence) => findPatternMatchSteps(
        motif.alphabet === "dna-rna" && motif.syntax === "exact" ? sourceSequence.replaceAll("U", "T") : sourceSequence,
        motif.alphabet === "dna-rna" && motif.syntax === "exact" ? motif.pattern.replaceAll("U", "T") : motif.pattern,
        patternOptions,
        context
      );

  // A translation stop separates peptide chains. Keep its source position, but
  // never let regex wildcards consume it; terminal anchors apply to each chain.
  let offset = 0;
  for (const chain of motif.alphabet === "protein" ? sequence.split("*") : [sequence]) {
    if (chain) for (const match of yield* matchFinder(chain)) {
      if (Number.isFinite(motif.match?.maxStart) && match.start > motif.match.maxStart) continue;
      rows.push(makeMatchRow(recordTitle, sequence, motif, {
        ...match, start: match.start + offset, end: match.end + offset
      }, "+"));
    }
    offset += chain.length + 1;
  }

  if (shouldScanReverse(motif, options)) {
    const reverseSequence = reverseComplement(sequence);
    for (const match of yield* matchFinder(reverseSequence)) {
      rows.push(makeMatchRow(recordTitle, sequence, motif, {
        start: sequence.length - match.end + 1,
        end: sequence.length - match.start + 1,
        length: match.length,
        score: match.score
      }, "-"));
    }
  }

  rows.sort((left, right) =>
    left.start - right.start ||
    left.end - right.end ||
    left.strand.localeCompare(right.strand) ||
    left.motif_id.localeCompare(right.motif_id)
  );

  return { rows, warnings };
}

function* scanMotifRecordSteps(record, motifs, options = {}, context = {}) {
  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  const title = record.title ?? "sequence";
  const cleaned = cleanSequence(record.sequence ?? "", {
    alphabet,
    preserveCase: false,
    keepGaps: false
  });
  const warnings = [];
  const notes = [];
  const gapCount = alphabet === "protein" ? (String(record.sequence ?? "").match(/[-.]/g) ?? []).length : 0;
  if (gapCount) notes.push(`${title}: removed ${gapCount} alignment gap character(s); coordinates refer to the cleaned sequence.`);

  if (cleaned.removedCount > gapCount) {
    warnings.push(`${title}: removed ${cleaned.removedCount - gapCount} non-${alphabet === "protein" ? "protein" : "DNA/RNA"} character(s).`);
  }

  if (cleaned.sequence.length === 0) {
    warnings.push(`${title}: no ${alphabet === "protein" ? "protein" : "DNA/RNA"} sequence characters were found.`);
    return {
      rows: [],
      warnings, notes,
      charactersRemoved: cleaned.removedCount,
      sequenceLength: 0,
      sequence: ""
    };
  }

  const rows = [];
  let motifsScanned = 0;
  let retainedCharacters = 0;
  for (const motif of motifs) {
    if (motifsScanned > 0 && motifsScanned % 25 === 0) {
      yield;
    } else {
      context.throwIfCancelled?.();
    }
    motifsScanned += 1;

    if (motif.alphabet !== alphabet) {
      continue;
    }
    if (options.classes?.length > 0 && !options.classes.includes(motif.class)) {
      continue;
    }
    if (options.motifIds?.length > 0 && !options.motifIds.includes(motif.id)) {
      continue;
    }

    const result = yield* scanMotif(title, cleaned.sequence, motif, {
      ...options,
      maxMatches: Number.isFinite(options.maxMatches) ? options.maxMatches - rows.length : undefined,
      maxMatchedCharacters: Number.isFinite(options.maxMatchedCharacters) ? options.maxMatchedCharacters - retainedCharacters : undefined
    }, context);
    for (const row of result.rows) {
      rows.push(row);
      retainedCharacters += row.matched_text.length;
      if (Number.isFinite(options.maxMatches) && rows.length > options.maxMatches) throw new Error("Motif scan exceeds the candidate-hit limit.");
      if (Number.isFinite(options.maxMatchedCharacters) && retainedCharacters > options.maxMatchedCharacters) throw new Error("Motif matched sequence exceeds the character retention limit.");
    }
    warnings.push(...result.warnings);
  }

  if (alphabet === "protein" && rows.some(row => /[BJXZ]/.test(row.matched_text))) warnings.push(`${title}: motif hits include ambiguous B/J/X/Z symbols; wildcard or negated-class matches may be uncertain.`);
  return {
    rows,
    warnings, notes,
    charactersRemoved: cleaned.removedCount,
    sequenceLength: cleaned.sequence.length,
    sequence: cleaned.sequence
  };
}

export function scanMotifRecords(record, motifs, options = {}) {
  const steps = scanMotifRecordSteps(record, motifs, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export async function scanMotifRecordsWithContext(record, motifs, options = {}, context = {}) {
  const steps = scanMotifRecordSteps(record, motifs, options, context);
  let step = steps.next();
  while (!step.done) {
    await context.yieldIfNeeded?.();
    step = steps.next();
  }
  return step.value;
}
