import { screenSirnaSeeds, sirnaSeedColumns } from "./sirna-seed-screen.js";
export { sirnaSeedColumns };
import { referenceCoverageColumns, finalizeReferenceCoverage, referenceCoverageText, designSearchColumns, finalizeDesignSearch, designSearchText } from "./design-analysis.js";
import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { parseFlatfileRecords } from "./flatfile-records.js";
import {
  makeIndexedFastaReader,
  parseFaiIndex,
  resolveIndexedFastaRegionInput
} from "./indexed-genomics/indexed-fasta-reader.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence, makeSequenceContext } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";
import { SIRNA_DESIGN_DEFAULTS, normalizeSirnaDesignOptions, getIndexedReferenceFiles, hasIndexedReferenceOptions } from "./sirna-design-options.js";
export { normalizeSirnaDesignOptions } from "./sirna-design-options.js";

export const sirnaDesignTableColumns = [
  { id: "rank", label: "Rank", type: "number" },
  { id: "record", label: "Record", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "total_score", label: "Total score", type: "number" },
  { id: "reynolds_score", label: "Reynolds-derived sequence rules (0–7)", type: "number" },
  { id: "ui_tei_score", label: "Ui-Tei-derived rules (0–4)", type: "number" },
  { id: "gc_percent", label: "GC percent", type: "number" },
  { id: "sense_target_rna", label: "Sense target RNA", type: "string" },
  { id: "guide_antisense_rna", label: "Guide antisense RNA", type: "string" },
  { id: "passenger_sense_rna", label: "Passenger sense RNA", type: "string" },
  { id: "flags", label: "Flags", type: "string" },
  ...["candidate_id", "score_status", "hairpin_status", "guide_seed_rna", "seed_search_status", "seed_search_model", "seed_count_interpretation"].map(id => ({ id, label: id.replaceAll("_", " "), type: "string" })),
  ...["seed_match_count", "seed_transcript_count", "seed_intended_matches", "seed_other_matches", "seed_unclassified_matches"].map(id => ({ id, label: id.replaceAll("_", " "), type: "number" })),
  ...designSearchColumns,
  ...referenceCoverageColumns,
  { id: "reference_match_count", label: "Reference matches", type: "number" },
  { id: "exact_reference_match_count", label: "Exact reference matches", type: "number" },
  { id: "near_reference_match_count", label: "Near reference matches", type: "number" },
  { id: "best_reference_mismatches", label: "Best reference mismatches", type: "number" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched target", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];

export const sirnaReferenceMatchColumns = [
  { id: "candidate_rank", label: "Candidate rank", type: "number" },
  { id: "candidate_record", label: "Candidate record", type: "string" },
  { id: "candidate_start", label: "Candidate start", type: "number" },
  { id: "candidate_end", label: "Candidate end", type: "number" },
  { id: "reference_record", label: "Reference record", type: "string" },
  { id: "reference_strand", label: "Reference strand", type: "string" },
  { id: "reference_start", label: "Reference start", type: "number" },
  { id: "reference_end", label: "Reference end", type: "number" },
  { id: "mismatch_count", label: "Mismatch count", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "string" },
  { id: "relation", label: "Relation", type: "string" },
  { id: "sense_target_rna", label: "Sense target RNA", type: "string" },
  { id: "reference_target_rna", label: "Reference target RNA", type: "string" },
  { id: "guide_antisense_rna", label: "Guide antisense RNA", type: "string" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched reference", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" },
  ...referenceCoverageColumns
];

export const SIRNA_REFERENCE_SEPARATOR = "##REFERENCE";

const EXACT_DNA = /^[ACGT]+$/;
function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function reverseComplementRna(sequence) {
  return Array.from(complementDnaRnaSequence(sequence.replaceAll("U", "T"), { preserveCase: false }))
    .reverse()
    .join("")
    .replaceAll("T", "U");
}

function reverseComplementDna(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false }))
    .reverse()
    .join("")
    .replaceAll("U", "T");
}

function countBases(sequence, bases) {
  let count = 0;
  for (const base of sequence) {
    if (bases.has(base)) {
      count += 1;
    }
  }
  return count;
}

function longestRun(sequence, pattern) {
  let best = 0;
  let run = 0;
  for (const base of sequence) {
    if (pattern(base)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

function longestIdenticalRun(sequence) {
  let best = 0;
  let run = 0;
  let previous = "";
  for (const base of sequence) {
    if (base === previous) {
      run += 1;
    } else {
      previous = base;
      run = 1;
    }
    best = Math.max(best, run);
  }
  return best;
}

function reynoldsScore(senseRna, gcPercent) {
  let score = 0;
  const flags = [];
  if (gcPercent >= 30 && gcPercent <= 52) {
    score += 1;
  } else {
    flags.push("Reynolds GC outside 30-52%");
  }
  if (countBases(senseRna.slice(14, 19), new Set(["A", "U"])) >= 3) {
    score += 1;
  } else {
    flags.push("fewer than 3 A/U in sense positions 15-19");
  }
  // Reynolds 2004 includes an inverted-repeat/hairpin Tm criterion.
  // Omit it without a validated RNA folding model; direct repeats are not a substitute.
  if (senseRna[2] === "A") {
    score += 1;
  }
  if (senseRna[9] === "U") {
    score += 1;
  }
  if (senseRna[18] === "A") {
    score += 1;
  }
  if (senseRna[18] !== "G" && senseRna[18] !== "C") {
    score += 1;
  }
  if (senseRna[12] !== "G") {
    score += 1;
  }
  return { score, flags };
}

function uiTeiScore(senseRna) {
  let score = 0;
  const flags = [];
  const antisense = reverseComplementRna(senseRna);
  if (antisense[0] === "A" || antisense[0] === "U") {
    score += 1;
  } else {
    flags.push("antisense 5' end is not A/U");
  }
  if (senseRna[0] === "G" || senseRna[0] === "C") {
    score += 1;
  } else {
    flags.push("sense 5' end is not G/C");
  }
  if (countBases(antisense.slice(0, 7), new Set(["A", "U"])) >= 5) {
    score += 1;
  } else {
    flags.push("antisense 5' one-third is not A/U rich");
  }
  if (longestRun(senseRna, (base) => base === "G" || base === "C") <= 9) {
    score += 1;
  } else {
    flags.push("GC stretch longer than 9");
  }
  return { score, flags };
}

function splitSirnaInput(input, separator = SIRNA_REFERENCE_SEPARATOR) {
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  const splitIndex = lines.findIndex((line) => line.trim() === separator);
  if (splitIndex === -1) {
    return {
      targetText: lines.join("\n").trim(),
      referenceText: ""
    };
  }
  return {
    targetText: lines.slice(0, splitIndex).join("\n").trim(),
    referenceText: lines.slice(splitIndex + 1).join("\n").trim()
  };
}

function normalizeInputRecords(input, warnings, label = "Transcript") {
  const text = String(input ?? "");
  if (/^(LOCUS|ID)\s/m.test(text) || /\nFEATURES\s+Location\/Qualifiers\n/.test(text)) {
    const flatfile = parseFlatfileRecords(text);
    let removedTotal = 0;
    const flatfileRecords = flatfile.records
      .filter((record) => record.sequence && record.molecule !== "protein")
      .map((record, index) => {
        const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
        removedTotal += cleaned.removedCount;
        if (cleaned.removedCount > 0) {
          warnings.push(`${label} ${record.accession || `Record ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
        }
        return {
          title: record.accession || record.title || `${label} ${index + 1}`,
          sequence: cleaned.sequence.replaceAll("U", "T"),
          sourceFormat: record.format
        };
      })
      .filter((record) => record.sequence.length > 0);
    if (flatfileRecords.length > 0) {
      warnings.push(...flatfile.warnings);
      return { records: flatfileRecords, charactersRemoved: removedTotal };
    }
  }
  let charactersRemoved = 0;
  const records = parseSequenceInput(text, "transcript").map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${label} ${record.title || `Record ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    return {
      title: record.title || `${label} ${index + 1}`,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((record) => record.sequence.length > 0);
  return { records, charactersRemoved };
}

function makeEmptyReferenceStats() {
  return {
    reference_match_count: "",
    exact_reference_match_count: "",
    near_reference_match_count: "",
    best_reference_mismatches: ""
  };
}

function makeRnaContext(sequence, start, end, flank) {
  // Convert only the bounded context, not the entire transcript per window.
  return Object.fromEntries(Object.entries(makeSequenceContext(sequence, start, end, flank))
    .map(([key, value]) => [key, value.replaceAll("T", "U").replaceAll("t", "u")]));
}

function makeCandidate(record, startIndex, options) {
  const targetDna = record.sequence.slice(startIndex, startIndex + options.targetLength);
  if (targetDna.length !== options.targetLength || !EXACT_DNA.test(targetDna)) {
    return null;
  }
  const senseRna = targetDna.replaceAll("T", "U");
  const gcPercent = (countBases(senseRna, new Set(["G", "C"])) / senseRna.length) * 100;
  if (gcPercent < options.minGcPercent || gcPercent > options.maxGcPercent) {
    return null;
  }
  const scoreValid = senseRna.length === 19;
  const reynolds = scoreValid ? reynoldsScore(senseRna, gcPercent) : { score: "", flags: ["sequence-rule scores unavailable outside 19-nt targets"] };
  const uiTei = scoreValid ? uiTeiScore(senseRna) : { score: "", flags: [] };
  const flags = [...reynolds.flags, ...uiTei.flags];
  const auFivePrimeAntisense = countBases(reverseComplementRna(senseRna).slice(0, 7), new Set(["A", "U"]));
  const homopolymer = longestIdenticalRun(senseRna);
  if (homopolymer >= 5) {
    flags.push(`homopolymer run ${homopolymer}`);
  }
  const totalScore = reynolds.score + uiTei.score - Math.max(0, homopolymer - 5) * 0.5;
  const context = makeRnaContext(record.sequence, startIndex + 1, startIndex + options.targetLength, options.contextBases);
  const overhang = options.includeOverhangs ? options.overhang : "";
  return {
    rank: 0,
    record: record.title,
    start: startIndex + 1,
    end: startIndex + options.targetLength,
    total_score: scoreValid ? round(totalScore, 2) : "",
    score_status: scoreValid ? "uncalibrated 19-nt sequence-rule subtotal; hairpin criterion omitted" : "unavailable: rules restricted to 19-nt targets",
    hairpin_status: "not assessed",
    reynolds_score: reynolds.score,
    ui_tei_score: uiTei.score,
    gc_percent: round(gcPercent),
    sense_target_rna: senseRna,
    guide_antisense_rna: `${reverseComplementRna(senseRna)}${overhang}`,
    passenger_sense_rna: `${senseRna}${overhang}`,
    flags: flags.join("; "),
    target_dna: targetDna,
    ...makeEmptyReferenceStats(),
    left_context: context.left_context,
    matched_text: context.matched_text,
    right_context: context.right_context,
    context_sequence: context.context_sequence,
    au_five_prime_antisense: auFivePrimeAntisense
  };
}

function mapWorkingRangeToOriginal(strand, sequenceLength, start, end) {
  if (strand === "+") {
    return { start, end };
  }
  return {
    start: sequenceLength - end + 1,
    end: sequenceLength - start + 1
  };
}

function makeMismatchSeedSegments(length, maxMismatches) {
  const segmentCount = Math.min(length, Math.max(1, maxMismatches + 1));
  const baseSize = Math.floor(length / segmentCount);
  const extra = length % segmentCount;
  const segments = [];
  let start = 0;
  for (let index = 0; index < segmentCount; index += 1) {
    const size = baseSize + (index < extra ? 1 : 0);
    segments.push({ index, start, end: start + size });
    start += size;
  }
  return segments.filter((segment) => segment.end > segment.start);
}

function buildCandidateSeedIndex(rows, options) {
  if (options.maxOffTargetMismatches >= options.targetLength) {
    return null;
  }
  const segments = makeMismatchSeedSegments(options.targetLength, options.maxOffTargetMismatches);
  if (segments.length === 0) {
    return null;
  }
  const index = new Map();
  for (const row of rows) {
    const targetDna = row.target_dna ?? row.sense_target_rna.replaceAll("U", "T");
    if (!EXACT_DNA.test(targetDna)) {
      return null;
    }
    for (const segment of segments) {
      const seed = targetDna.slice(segment.start, segment.end);
      const key = `${segment.index}:${seed}`;
      const bucket = index.get(key) ?? [];
      bucket.push(row);
      index.set(key, bucket);
    }
  }
  return { segments, index };
}

function getIndexedCandidateRows(windowDna, rows, rowIndex) {
  if (!rowIndex || !EXACT_DNA.test(windowDna)) {
    return rows;
  }
  const candidates = [];
  const seen = new Set();
  for (const segment of rowIndex.segments) {
    const seed = windowDna.slice(segment.start, segment.end);
    const bucket = rowIndex.index.get(`${segment.index}:${seed}`) ?? [];
    for (const row of bucket) {
      if (!seen.has(row)) {
        seen.add(row);
        candidates.push(row);
      }
    }
  }
  return candidates;
}

function countMismatches(left, right) {
  if (left.length !== right.length) {
    return null;
  }
  let count = 0;
  const mismatches = [];
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      count += 1;
      mismatches.push(`${index + 1}:${left[index].replaceAll("T", "U")}>${right[index].replaceAll("T", "U")}`);
    }
  }
  return {
    count,
    mismatches: mismatches.join(", ") || "none"
  };
}

function makeReferenceWindow(record, workingSequence, strand, workingStart, options) {
  const targetLength = options.targetLength;
  const windowDna = workingSequence.slice(workingStart - 1, workingStart - 1 + targetLength);
  if (windowDna.length !== targetLength || !EXACT_DNA.test(windowDna)) {
    return null;
  }
  const range = mapWorkingRangeToOriginal(strand, record.sequence.length, workingStart, workingStart + targetLength - 1);
  const context = makeRnaContext(workingSequence, workingStart, workingStart + targetLength - 1, options.contextBases);
  return {
    record: record.title,
    strand,
    start: range.start,
    end: range.end,
    target_dna: windowDna,
    target_rna: windowDna.replaceAll("T", "U"),
    left_context: context.left_context,
    matched_text: context.matched_text,
    right_context: context.right_context,
    context_sequence: context.context_sequence
  };
}

function updateReferenceMatchStats(row, site, mismatch, statsByRow, matchesByRow, options) {
  const stats = statsByRow.get(row);
  stats.total += 1;
  if (mismatch.count === 0) {
    stats.exact += 1;
  } else {
    stats.near += 1;
  }
  stats.best = stats.best === "" ? mismatch.count : Math.min(stats.best, mismatch.count);
  const matches = matchesByRow.get(row);
  if (matches.length < options.maxOffTargetMatchesPerCandidate) {
    matches.push({
      site,
      mismatch_count: mismatch.count,
      mismatches: mismatch.mismatches
    });
  }
}

async function scanReferenceRecords(rows, referenceRecords, options, warnings, context, { source = "reference sequence", recordLengthLimit = options.maxReferenceRecordLength } = {}) {
  const statsByRow = new Map();
  const matchesByRow = new Map();
  for (const row of rows) {
    statsByRow.set(row, { total: 0, exact: 0, near: 0, best: "" });
    matchesByRow.set(row, []);
  }
  const rowIndex = buildCandidateSeedIndex(rows, options);
  let basesProcessed = 0;
  let recordsScanned = 0;
  let recordsSkipped = 0;
  let referenceWindows = 0;
  let candidateComparisons = 0;
  let skippedAmbiguous = 0;

  for (const [recordIndex, record] of referenceRecords.entries()) {
    context.reportProgress?.({ phase: "scanning-reference", detail: record.title, progress: 0.72 + (recordIndex / Math.max(1, referenceRecords.length)) * 0.16 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    if (record.sequence.length > recordLengthLimit) {
      recordsSkipped += 1;
      warnings.push(`${record.title}: skipped as reference because ${record.sequence.length} nt exceeds the current reference-hit counting limit of ${recordLengthLimit} nt.`);
      continue;
    }
    basesProcessed += record.sequence.length;
    recordsScanned += 1;
    for (const strand of options.referenceSequenceType === "transcripts" ? ["+"] : ["+", "-"]) {
      const workingSequence = strand === "+" ? record.sequence : reverseComplementDna(record.sequence);
      const lastStart = workingSequence.length - options.targetLength + 1;
      for (let workingStart = 1; workingStart <= lastStart; workingStart += 1) {
        if (workingStart % 2000 === 0) {
          context.throwIfCancelled?.();
          await context.yieldIfNeeded?.();
        }
        const site = makeReferenceWindow(record, workingSequence, strand, workingStart, options);
        if (!site) {
          skippedAmbiguous += 1;
          continue;
        }
        referenceWindows += 1;
        const candidateRows = getIndexedCandidateRows(site.target_dna, rows, rowIndex);
        for (const row of candidateRows) {
          candidateComparisons += 1;
          const mismatch = countMismatches(row.target_dna ?? row.sense_target_rna.replaceAll("U", "T"), site.target_dna);
          if (!mismatch || mismatch.count > options.maxOffTargetMismatches) {
            continue;
          }
          updateReferenceMatchStats(row, site, mismatch, statsByRow, matchesByRow, options);
        }
      }
    }
  }

  if (skippedAmbiguous > 0) {
    warnings.push(`Reference hit counting skipped ${skippedAmbiguous.toLocaleString()} reference window(s) containing ambiguous bases.`);
  }
  for (const row of rows) {
    const stats = statsByRow.get(row);
    row.reference_match_count = stats.total;
    row.exact_reference_match_count = stats.exact;
    row.near_reference_match_count = stats.near;
    row.best_reference_mismatches = stats.best;
  }
  return {
    status: "run",
    source,
    referenceWindows,
    basesProcessed,
    recordsScanned,
    recordsSkipped,
    skippedAmbiguousWindows: skippedAmbiguous,
    candidateComparisons,
    indexStrategy: rowIndex ? `seed-index ${rowIndex.segments.length} seed(s)` : "full reference-window scan",
    statsByRow,
    matchesByRow
  };
}

function materializeReferenceMatchRows(rows, referenceScreen, options) {
  const matchRows = [];
  let omitted = 0;
  for (const row of rows) {
    const matches = [...(referenceScreen.matchesByRow?.get(row) ?? [])].sort((left, right) =>
      left.mismatch_count - right.mismatch_count ||
      left.site.record.localeCompare(right.site.record) ||
      left.site.start - right.site.start ||
      left.site.strand.localeCompare(right.site.strand)
    );
    for (const match of matches) {
      if (matchRows.length >= options.maxOffTargetRows) {
        omitted += 1;
        continue;
      }
      matchRows.push({
        candidate_rank: row.rank,
        candidate_record: row.record,
        candidate_start: row.start,
        candidate_end: row.end,
        reference_record: match.site.record,
        reference_strand: match.site.strand,
        reference_start: match.site.start,
        reference_end: match.site.end,
        mismatch_count: match.mismatch_count,
        mismatches: match.mismatches,
        relation: match.mismatch_count === 0 ? "exact reference match" : "near reference match",
        sense_target_rna: row.sense_target_rna,
        reference_target_rna: match.site.target_rna,
        guide_antisense_rna: row.guide_antisense_rna,
        left_context: match.site.left_context,
        matched_text: match.site.matched_text,
        right_context: match.site.right_context,
        context_sequence: match.site.context_sequence
      });
    }
    const stats = referenceScreen.statsByRow?.get(row);
    omitted += Math.max(0, (stats?.total ?? 0) - matches.length);
  }
  return { rows: matchRows, omitted };
}

async function loadIndexedReferenceRecords(options, warnings, context) {
  const { fastaFile, faiFile, gziFile } = getIndexedReferenceFiles(options);
  const indexedInput = await resolveIndexedFastaRegionInput("", {
    fastaFile,
    faiFile,
    gziFile
  });
  const fai = parseFaiIndex(indexedInput.faiText);
  warnings.push(...fai.warnings);
  const indexedSequences = [...fai.records.values()].map(({ name, length }) => ({ name, length }));
  const totalIndexedBases = indexedSequences.reduce((sum, record) => sum + record.length, 0);
  if (totalIndexedBases > options.maxIndexedReferenceBases) {
    warnings.push(`Indexed reference hit counting was skipped because the indexed FASTA contains ${totalIndexedBases.toLocaleString()} bp, above the current limit of ${options.maxIndexedReferenceBases.toLocaleString()} bp.`);
    return {
      records: indexedSequences.map((record) => ({ title: record.name, sequence: "", length: record.length, indexed: true })),
      skipped: true,
      skipReason: "indexed reference exceeds limit",
      isBgzip: indexedInput.isBgzip
    };
  }

  const reader = makeIndexedFastaReader(indexedInput);
  const readerWarningStart = reader.warnings?.length ?? 0;
  if (readerWarningStart > 0) {
    warnings.push(...reader.warnings);
  }
  const records = [];
  for (const [recordIndex, record] of indexedSequences.entries()) {
    context.reportProgress?.({ phase: "loading-indexed-reference", detail: record.name, progress: 0.68 + (recordIndex / Math.max(1, indexedSequences.length)) * 0.04 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    const sequence = (await reader.getSequence(record.name, 0, record.length, { signal: context.signal }) || "").toUpperCase().replaceAll("U", "T");
    records.push({
      title: record.name,
      sequence,
      length: record.length,
      indexed: true
    });
  }
  if ((reader.warnings?.length ?? 0) > readerWarningStart) {
    warnings.push(...reader.warnings.slice(readerWarningStart));
  }
  return {
    records,
    skipped: false,
    isBgzip: indexedInput.isBgzip
  };
}

export async function designSirna(input, options = {}, context = {}) {
  const normalized = normalizeSirnaDesignOptions(options);
  const warnings = [];
  const notes = [];
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const split = splitSirnaInput(input);
  const { records, charactersRemoved } = normalizeInputRecords(split.targetText, warnings, "Transcript");
  const useIndexedReference = normalized.referenceInputMode === "indexed" && hasIndexedReferenceOptions(options);
  const referenceWarnings = [];
  let { records: referenceRecords, charactersRemoved: referenceCharactersRemoved } = normalized.referenceInputMode === "pasted" && !useIndexedReference && split.referenceText
    ? normalizeInputRecords(split.referenceText, referenceWarnings, "Reference")
    : { records: [], charactersRemoved: 0 };
  warnings.push(...referenceWarnings);
  if (useIndexedReference && split.referenceText.trim()) {
    warnings.push("Indexed reference FASTA files were provided, so the optional pasted reference sequence was ignored for reference hit counting.");
  } else if (normalized.searchReferenceOffTargets && normalized.referenceInputMode === "pasted" && !split.referenceText.trim()) {
    warnings.push("Reference hit counting is enabled, but no pasted or uploaded reference sequence was provided.");
  } else if (normalized.searchReferenceOffTargets && normalized.referenceInputMode === "indexed" && !useIndexedReference) {
    warnings.push("Reference hit counting is enabled for an indexed genome reference, but matching FASTA and FAI files were not provided.");
  }
  if (records.length === 0) {
    return {
      records,
      referenceRecords,
      rows: [],
      referenceMatchRows: [],
      referenceScreen: { status: "not run", referenceWindows: 0, omittedRows: 0, basesProcessed: 0 },
      warnings: ["No DNA/RNA transcript sequence was provided."],
      charactersRemoved,
      referenceCharactersRemoved,
      options: normalized
    };
  }

  const rows = [];
  const candidateSearch = { recordsScanned: 0, recordsSkipped: 0, candidatesMatched: 0, ambiguousWindowsExcluded: 0 };
  let basesProcessed = 0;
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    context.reportProgress?.({ phase: "scanning-transcript", detail: record.title, progress: 0.1 + (recordIndex / records.length) * 0.75 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();

    if (record.sequence.length > normalized.maxRecordLength) {
      candidateSearch.recordsSkipped++;
      warnings.push(`${record.title}: skipped because ${record.sequence.length} nt exceeds the current siRNA design limit of ${normalized.maxRecordLength} nt.`);
      continue;
    }
    candidateSearch.recordsScanned++;
    basesProcessed += record.sequence.length;
    let ambiguousWindows = 0;
    const candidates = [];
    const lastStart = record.sequence.length - normalized.targetLength;
    for (let start = normalized.skipFirstBases; start <= lastStart; start += 1) {
      const window = record.sequence.slice(start, start + normalized.targetLength);
      if (!EXACT_DNA.test(window)) {
        ambiguousWindows += 1;
        continue;
      }
      const candidate = makeCandidate(record, start, normalized);
      if (candidate) {
        candidate.recordIndex = recordIndex;
        candidates.push(candidate);
      }
      if (start % 2000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
    }
    if (ambiguousWindows > 0) {
      warnings.push(`${record.title}: skipped ${ambiguousWindows} candidate window(s) containing ambiguous bases.`);
    }
    candidates.sort((left, right) => normalized.targetLength !== 19 ? left.start - right.start :
      right.total_score - left.total_score ||
      Math.abs(45 - left.gc_percent) - Math.abs(45 - right.gc_percent) ||
      right.au_five_prime_antisense - left.au_five_prime_antisense ||
      left.start - right.start
    );
    candidateSearch.candidatesMatched += candidates.length;
    candidateSearch.ambiguousWindowsExcluded += ambiguousWindows;
    rows.push(...candidates.slice(0, normalized.maxCandidatesPerRecord));
  }
  rows.sort((left, right) => normalized.targetLength !== 19 ? left.recordIndex - right.recordIndex || left.start - right.start :
    right.total_score - left.total_score ||
    left.record.localeCompare(right.record) ||
    left.start - right.start
  );
  rows.forEach((row, index) => {
    row.rank = index + 1;
    row.candidate_id = `sirna_${index + 1}`;
  });

  let referenceMatchRows = [];
  let referenceScreen = {
    status: "not run",
    referenceWindows: 0,
    omittedRows: 0,
    basesProcessed: 0
  };
  if (referenceRecords.length > 0 && normalized.searchReferenceOffTargets && rows.length > 0) {
    referenceScreen = await scanReferenceRecords(rows, referenceRecords, normalized, warnings, context, {
      source: "pasted/uploaded reference sequence"
    });
  } else if (referenceRecords.length > 0 && !normalized.searchReferenceOffTargets) {
    warnings.push("Reference sequence was provided, but reference hit counting is turned off.");
  }

  if (useIndexedReference && normalized.searchReferenceOffTargets && rows.length > 0) {
    const indexedReference = await loadIndexedReferenceRecords(
      {
        ...normalized,
        referenceInputMode: options.referenceInputMode,
        indexedReferenceFastaFile: options.indexedReferenceFastaFile,
        indexedReferenceFaiFile: options.indexedReferenceFaiFile,
        indexedReferenceBgzfFile: options.indexedReferenceBgzfFile,
        indexedReferenceBgzfFaiFile: options.indexedReferenceBgzfFaiFile,
        indexedReferenceGziFile: options.indexedReferenceGziFile
      },
      warnings,
      context
    );
    referenceRecords = indexedReference.records;
    referenceScreen = {
      status: indexedReference.skipped ? "skipped" : "run",
      recordsScanned: 0,
      recordsSkipped: indexedReference.skipped ? referenceRecords.length : 0,
      source: indexedReference.isBgzip ? "indexed BGZF FASTA" : "indexed FASTA",
      referenceWindows: 0,
      omittedRows: 0,
      basesProcessed: 0,
      skipReason: indexedReference.skipReason
    };
    if (!indexedReference.skipped) {
      referenceScreen = await scanReferenceRecords(rows, indexedReference.records, normalized, warnings, context, {
        source: indexedReference.isBgzip ? "indexed BGZF FASTA" : "indexed FASTA",
        recordLengthLimit: Number.POSITIVE_INFINITY
      });
    }
  } else if (useIndexedReference && !normalized.searchReferenceOffTargets) {
    warnings.push("Indexed reference FASTA files were provided, but reference hit counting is turned off.");
  }

  finalizeReferenceCoverage(rows, referenceScreen);

  if (["complete", "partial"].includes(referenceScreen.status)) {
    const materialized = materializeReferenceMatchRows(rows, referenceScreen, normalized);
    referenceMatchRows = materialized.rows;
    referenceScreen.omittedRows = materialized.omitted;
    if (materialized.omitted > 0) {
      warnings.push(`Reference match TSV was capped; ${materialized.omitted} reference match row(s) were omitted from the materialized table. Candidate match counts still include the full reference hit count.`);
    }
  }

  if (rows.length === 0 && warnings.length === 0) {
    notes.push("No siRNA candidates passed the current sequence and GC filters.");
  }
  referenceScreen.searchModel = `full target; up to ${normalized.maxOffTargetMismatches} ungapped mismatches; ${normalized.referenceSequenceType === "transcripts" ? "sense transcripts" : "both reference strands"}`;
  finalizeReferenceCoverage(rows, referenceScreen);
  finalizeReferenceCoverage(referenceMatchRows, referenceScreen);
  finalizeDesignSearch(rows, candidateSearch);
  const seedSearch = await screenSirnaSeeds(rows, referenceRecords, normalized, referenceScreen, context, warnings);
  notes.push("Scores count selected sequence rules for 19-nt targets only; Reynolds hairpin stability is omitted. Combined scores are uncalibrated. Longer targets are returned in input coordinate order with unavailable scores.");
  if (normalized.referenceSequenceType !== "transcripts") notes.push("Seed screening requires a sense transcript reference. Genomic reference hits do not cover spliced transcript sequences.");
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return {
    candidateSearch,
    seedScreen: seedSearch.screen,
    seedMatchRows: seedSearch.hits,
    records,
    referenceRecords,
    rows,
    referenceMatchRows,
    referenceScreen,
    warnings,
    notes,
    charactersRemoved,
    referenceCharactersRemoved,
    basesProcessed,
    options: normalized
  };
}

export function makeSirnaDesignTsv(rows) {
  return exportDelimitedTable(sirnaDesignTableColumns, rows, "\t");
}

export function makeSirnaReferenceMatchTsv(rows) {
  return exportDelimitedTable(sirnaReferenceMatchColumns, rows, "\t");
}

export function makeSirnaDesignReport(result) {
  const screen = result.referenceScreen ?? { status: "not run", referenceWindows: 0, omittedRows: 0, basesProcessed: 0 };
  const referenceScreenText = referenceCoverageText(screen);
  const lines = [
    "siRNA Design",
    "",
    `Records: ${result.records.length}`,
    `Candidates returned: ${result.rows.length}`,
    designSearchText(result.candidateSearch),
    `Target length: ${result.options.targetLength} nt`,
    `GC range: ${result.options.minGcPercent}-${result.options.maxGcPercent}%`,
    `3' overhang: ${result.options.includeOverhangs ? result.options.overhang : "none"}`,
    `Reference hit count: ${referenceScreenText}`,
    `Reference match rows: ${result.referenceMatchRows?.length ?? 0}${screen.omittedRows ? ` shown; ${screen.omittedRows} omitted by row limits` : ""}`,
    "",
    "Assumption: input is the direct/sense transcript sequence. DNA input is treated as the coding-equivalent sequence and converted to RNA by replacing T with U. Coordinates are 1-based on the submitted direct sequence.",
    "Method: 19-nt targets use seven Reynolds-derived sequence rules (hairpin criterion omitted) and four Ui-Tei-derived rules, with an SMS3 homopolymer penalty. The combined score is uncalibrated. Longer targets have no rule scores and are ordered by input coordinates.",
    `Reference type: ${result.options.referenceSequenceType}; full-length search allows ${result.options.maxOffTargetMismatches} ungapped mismatches. Transcript references are searched in the sense orientation only. Genomes do not represent spliced transcripts.`,
    `Seed screen: ${result.seedScreen?.status ?? "not run"}; ${result.seedScreen?.model ?? "unavailable"}. Seed counts include intended sites and are not silencing probabilities or UTR/isoform classifications.`,
    "",
    "References:",
    "",
    "siRNA design rules: Reynolds et al. 2004, https://doi.org/10.1038/nbt936; Ui-Tei et al. 2004, https://doi.org/10.1093/nar/gkh247. Seed complementarity: Jackson et al. 2006, https://doi.org/10.1261/rna.25706.",
    "", "Warnings:", ...(result.warnings.length ? result.warnings.map(w => `- ${w}`) : ["none"]),
    ""
  ];
  if (result.rows.length === 0) {
    lines.push("No candidates passed the current settings.");
    return lines.join("\n");
  }
  lines.push("rank\trecord\tstart\tend\ttotal_score\tgc_percent\treference_matches\tguide_antisense_rna\tflags");
  for (const row of result.rows) {
    lines.push([
      row.rank,
      row.record,
      row.start,
      row.end,
      row.total_score,
      row.gc_percent,
      row.reference_match_count,
      row.guide_antisense_rna,
      row.flags
    ].join("\t"));
  }
  return lines.join("\n");
}

export function makeSirnaGuideFasta(rows, lineWidth = SIRNA_DESIGN_DEFAULTS.lineWidth) {
  return rows.map((row) =>
    formatFastaRecord(`${row.record}_sirna_${row.rank}_${row.start}_${row.end}_guide`, row.guide_antisense_rna, lineWidth)
  ).join("");
}

export function makeSirnaContextText(rows) {
  if (rows.length === 0) {
    return "";
  }
  return rows.map((row) => [
    `${row.record} candidate ${row.rank} (${row.start}-${row.end})`,
    `guide antisense: ${row.guide_antisense_rna}`,
    `sense target:    ${row.sense_target_rna}`,
    `context:         ${row.context_sequence}`
  ].join("\n")).join("\n\n");
}

export function makeSirnaDuplexFasta(rows, lineWidth = SIRNA_DESIGN_DEFAULTS.lineWidth) {
  return rows.flatMap(row => [
    formatFastaRecord(`${row.candidate_id}_guide record=${encodeURIComponent(row.record)} coordinates=${row.start}-${row.end} orientation=5to3`, row.guide_antisense_rna, lineWidth),
    formatFastaRecord(`${row.candidate_id}_passenger record=${encodeURIComponent(row.record)} coordinates=${row.start}-${row.end} orientation=5to3`, row.passenger_sense_rna, lineWidth)
  ]).join("");
}
export function makeSirnaDuplexText(rows) {
  return "Antiparallel duplexes; both synthesized strands are 5-prime to 3-prime in paired FASTA. Bars show the target duplex; terminal additions are unpaired 3-prime overhangs. No folding/equilibrium prediction.\n\n" + rows.map(row => {
    const n=row.sense_target_rna.length, o=row.guide_antisense_rna.length-n;
    return [row.candidate_id,
      `passenger 5' ${" ".repeat(o)}${row.passenger_sense_rna} 3'`,
      `             ${" ".repeat(o)}${"|".repeat(n)}`,
      `guide     3' ${[...row.guide_antisense_rna].reverse().join("")}${" ".repeat(o)} 5'`
    ].join("\n");
  }).join("\n\n")+"\n";
}
