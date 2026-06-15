import { findPatternMatches } from "./pattern.js";
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
  { id: "description", label: "Description", type: "string" }
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

function normalizePwmThreshold(value, fallback = 85) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, parsed));
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
      score: Number(score.relativeScore.toFixed(2))
    });
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

function scanMotif(recordTitle, sequence, motif, options = {}, context = {}) {
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
    caseInsensitive: true
  };
  const rows = [];
  const matchFinder = motif.syntax === "pwm"
    ? (sourceSequence) => findPwmMatches(sourceSequence, motif, options, context)
    : (sourceSequence) => findPatternMatches(sourceSequence, motif.pattern, patternOptions, context);

  try {
    rows.push(
      ...matchFinder(sequence).map((match) =>
        makeMatchRow(recordTitle, sequence, motif, match, "+")
      )
    );
  } catch (error) {
    warnings.push(`${motif.id}: ${error.message}`);
  }

  if (shouldScanReverse(motif, options)) {
    const reverseSequence = reverseComplement(sequence);
    try {
      rows.push(
        ...matchFinder(reverseSequence).map((match) =>
          makeMatchRow(
            recordTitle,
            sequence,
            motif,
            {
              start: sequence.length - match.end + 1,
              end: sequence.length - match.start + 1,
              length: match.length,
              matchedText: match.matchedText,
              score: match.score
            },
            "-"
          )
        )
      );
    } catch (error) {
      warnings.push(`${motif.id} reverse strand: ${error.message}`);
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

export function scanMotifRecords(record, motifs, options = {}) {
  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  const title = record.title ?? "sequence";
  const cleaned = cleanSequence(record.sequence ?? "", {
    alphabet,
    preserveCase: false,
    keepGaps: false
  });
  const warnings = [];

  if (cleaned.removedCount > 0) {
    warnings.push(`${title}: removed ${cleaned.removedCount} non-${alphabet === "protein" ? "protein" : "DNA/RNA"} character(s).`);
  }

  if (cleaned.sequence.length === 0) {
    warnings.push(`${title}: no ${alphabet === "protein" ? "protein" : "DNA/RNA"} sequence characters were found.`);
    return {
      rows: [],
      warnings,
      charactersRemoved: cleaned.removedCount,
      sequenceLength: 0
    };
  }

  const rows = [];
  for (const motif of motifs) {
    if (motif.alphabet !== alphabet) {
      continue;
    }
    if (options.classes?.length > 0 && !options.classes.includes(motif.class)) {
      continue;
    }
    if (options.motifIds?.length > 0 && !options.motifIds.includes(motif.id)) {
      continue;
    }

    const result = scanMotif(title, cleaned.sequence, motif, options);
    rows.push(...result.rows);
    warnings.push(...result.warnings);
  }

  return {
    rows,
    warnings,
    charactersRemoved: cleaned.removedCount,
    sequenceLength: cleaned.sequence.length,
    sequence: cleaned.sequence
  };
}

export async function scanMotifRecordsWithContext(record, motifs, options = {}, context = {}) {
  const alphabet = options.alphabet === "protein" ? "protein" : "dna-rna";
  const title = record.title ?? "sequence";
  const cleaned = cleanSequence(record.sequence ?? "", {
    alphabet,
    preserveCase: false,
    keepGaps: false
  });
  const warnings = [];

  if (cleaned.removedCount > 0) {
    warnings.push(`${title}: removed ${cleaned.removedCount} non-${alphabet === "protein" ? "protein" : "DNA/RNA"} character(s).`);
  }

  if (cleaned.sequence.length === 0) {
    warnings.push(`${title}: no ${alphabet === "protein" ? "protein" : "DNA/RNA"} sequence characters were found.`);
    return {
      rows: [],
      warnings,
      charactersRemoved: cleaned.removedCount,
      sequenceLength: 0
    };
  }

  const rows = [];
  let motifsScanned = 0;
  for (const motif of motifs) {
    if (motifsScanned > 0 && motifsScanned % 25 === 0) {
      await context.yieldIfNeeded?.();
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

    const result = scanMotif(title, cleaned.sequence, motif, options, context);
    rows.push(...result.rows);
    warnings.push(...result.warnings);
  }

  return {
    rows,
    warnings,
    charactersRemoved: cleaned.removedCount,
    sequenceLength: cleaned.sequence.length,
    sequence: cleaned.sequence
  };
}
