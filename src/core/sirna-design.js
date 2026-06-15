import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { parseFlatfileRecords } from "./flatfile-records.js";
import {
  makeIndexedFastaReader,
  parseFaiIndex,
  resolveIndexedFastaRegionInput
} from "./indexed-genomics/indexed-fasta-reader.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence, makeSequenceContext } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";

export const sirnaDesignTableColumns = [
  { id: "rank", label: "Rank", type: "number" },
  { id: "record", label: "Record", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "total_score", label: "Total score", type: "number" },
  { id: "reynolds_score", label: "Reynolds-style score", type: "number" },
  { id: "ui_tei_score", label: "Ui-Tei-style score", type: "number" },
  { id: "gc_percent", label: "GC percent", type: "number" },
  { id: "sense_target_rna", label: "Sense target RNA", type: "string" },
  { id: "guide_antisense_rna", label: "Guide antisense RNA", type: "string" },
  { id: "passenger_sense_rna", label: "Passenger sense RNA", type: "string" },
  { id: "flags", label: "Flags", type: "string" },
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
  { id: "context_sequence", label: "Context sequence", type: "string" }
];

export const SIRNA_REFERENCE_SEPARATOR = "##REFERENCE";

const EXACT_DNA = /^[ACGT]+$/;
function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}

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

function hasInternalRepeat(sequence, repeatLength = 4) {
  const seen = new Set();
  for (let index = 0; index <= sequence.length - repeatLength; index += 1) {
    const word = sequence.slice(index, index + repeatLength);
    if (seen.has(word)) {
      return true;
    }
    seen.add(word);
  }
  return false;
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
  if (!hasInternalRepeat(senseRna)) {
    score += 1;
  } else {
    flags.push("internal 4-mer repeat");
  }
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
      warnings.push(`${label}: parsed ${flatfileRecords.length.toLocaleString()} GenBank/DDBJ/EMBL transcript record(s).`);
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

function getIndexedReferenceFiles(options = {}) {
  const preferBgzf = options.referenceInputMode === "indexed-bgzf";
  return {
    fastaFile: preferBgzf
      ? (options.indexedReferenceBgzfFile ?? options.indexedReferenceFastaFile)
      : (options.indexedReferenceFastaFile ?? options.indexedReferenceBgzfFile),
    faiFile: preferBgzf
      ? (options.indexedReferenceBgzfFaiFile ?? options.indexedReferenceFaiFile)
      : (options.indexedReferenceFaiFile ?? options.indexedReferenceBgzfFaiFile),
    gziFile: options.indexedReferenceGziFile
  };
}

function hasIndexedReferenceOptions(options = {}) {
  const { fastaFile, faiFile } = getIndexedReferenceFiles(options);
  return Boolean(fastaFile?.slice && faiFile?.text);
}

export function normalizeSirnaDesignOptions(options = {}) {
  const targetLength = clampInteger(options.targetLength, 19, 19, 23);
  const minGcPercent = clampNumber(options.minGcPercent, 30, 0, 100);
  const maxGcPercent = Math.max(minGcPercent, clampNumber(options.maxGcPercent, 52, 0, 100));
  const referenceInputMode = ["indexed", "indexed-bgzf"].includes(options.referenceInputMode)
    ? "indexed"
    : options.referenceInputMode === "pasted"
      ? "pasted"
      : hasIndexedReferenceOptions(options)
        ? "indexed"
        : "pasted";
  return {
    targetLength,
    minGcPercent,
    maxGcPercent,
    skipFirstBases: clampInteger(options.skipFirstBases, 0, 0, 1000000),
    maxCandidatesPerRecord: clampInteger(options.maxCandidatesPerRecord, 25, 1, 1000),
    maxRecordLength: clampInteger(options.maxRecordLength, 200000, 100, 5000000),
    includeOverhangs: options.includeOverhangs !== false,
    overhang: String(options.overhang ?? "UU").toUpperCase().replace(/[^ACGU]/g, "").slice(0, 4) || "UU",
    searchReferenceOffTargets: options.searchReferenceOffTargets === true,
    referenceInputMode,
    maxOffTargetMismatches: clampInteger(options.maxOffTargetMismatches, 2, 0, 5),
    maxReferenceRecordLength: clampInteger(options.maxReferenceRecordLength, 200000, 100, 5000000),
    maxIndexedReferenceBases: clampInteger(options.maxIndexedReferenceBases, 1000000, 1000, 10000000),
    maxOffTargetMatchesPerCandidate: clampInteger(options.maxOffTargetMatchesPerCandidate, 25, 1, 500),
    maxOffTargetRows: clampInteger(options.maxOffTargetRows, 1000, 1, 10000),
    contextBases: clampInteger(options.contextBases, 20, 0, 100),
    lineWidth: clampInteger(options.lineWidth, 60, 10, 200)
  };
}

function makeEmptyReferenceStats() {
  return {
    reference_match_count: "",
    exact_reference_match_count: "",
    near_reference_match_count: "",
    best_reference_mismatches: ""
  };
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
  const reynolds = reynoldsScore(senseRna, gcPercent);
  const uiTei = uiTeiScore(senseRna);
  const flags = [...reynolds.flags, ...uiTei.flags];
  const auFivePrimeAntisense = countBases(reverseComplementRna(senseRna).slice(0, 7), new Set(["A", "U"]));
  const homopolymer = longestIdenticalRun(senseRna);
  if (homopolymer >= 5) {
    flags.push(`homopolymer run ${homopolymer}`);
  }
  const totalScore = reynolds.score + uiTei.score - Math.max(0, homopolymer - 5) * 0.5;
  const context = makeSequenceContext(record.sequence.replaceAll("T", "U"), startIndex + 1, startIndex + options.targetLength, options.contextBases);
  const overhang = options.includeOverhangs ? options.overhang : "";
  return {
    rank: 0,
    record: record.title,
    start: startIndex + 1,
    end: startIndex + options.targetLength,
    total_score: round(totalScore, 2),
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
  const workingRna = workingSequence.replaceAll("T", "U");
  const context = makeSequenceContext(workingRna, workingStart, workingStart + targetLength - 1, options.contextBases);
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
  let referenceWindows = 0;
  let candidateComparisons = 0;
  let skippedAmbiguous = 0;

  for (const [recordIndex, record] of referenceRecords.entries()) {
    context.reportProgress?.({ phase: "scanning-reference", detail: record.title, progress: 0.72 + (recordIndex / Math.max(1, referenceRecords.length)) * 0.16 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    basesProcessed += record.sequence.length;
    if (record.sequence.length > recordLengthLimit) {
      warnings.push(`${record.title}: skipped as reference because ${record.sequence.length} nt exceeds the current reference-hit counting limit of ${recordLengthLimit} nt.`);
      continue;
    }
    for (const strand of ["+", "-"]) {
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
  let basesProcessed = 0;
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    basesProcessed += record.sequence.length;
    context.reportProgress?.({ phase: "scanning-transcript", detail: record.title, progress: 0.1 + (recordIndex / records.length) * 0.75 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();

    if (record.sequence.length > normalized.maxRecordLength) {
      warnings.push(`${record.title}: skipped because ${record.sequence.length} nt exceeds the current siRNA design limit of ${normalized.maxRecordLength} nt.`);
      continue;
    }
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
    candidates.sort((left, right) =>
      right.total_score - left.total_score ||
      Math.abs(45 - left.gc_percent) - Math.abs(45 - right.gc_percent) ||
      right.au_five_prime_antisense - left.au_five_prime_antisense ||
      left.start - right.start
    );
    rows.push(...candidates.slice(0, normalized.maxCandidatesPerRecord));
  }
  rows.sort((left, right) =>
    right.total_score - left.total_score ||
    left.record.localeCompare(right.record) ||
    left.start - right.start
  );
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  let referenceMatchRows = [];
  let referenceScreen = {
    status: referenceRecords.length > 0 && normalized.searchReferenceOffTargets ? "run" : "not run",
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

  if (referenceScreen.status === "run") {
    const materialized = materializeReferenceMatchRows(rows, referenceScreen, normalized);
    referenceMatchRows = materialized.rows;
    referenceScreen.omittedRows = materialized.omitted;
    if (materialized.omitted > 0) {
      warnings.push(`Reference match TSV was capped; ${materialized.omitted} reference match row(s) were omitted from the materialized table. Candidate match counts still include the full reference hit count.`);
    }
  }

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push("No siRNA candidates passed the current sequence and GC filters.");
  }
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return {
    records,
    referenceRecords,
    rows,
    referenceMatchRows,
    referenceScreen,
    warnings,
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
  const referenceScreenText = screen.status === "run"
    ? `run against ${result.referenceRecords?.length ?? 0} reference record(s), ${screen.basesProcessed ?? 0} reference bp, ${screen.referenceWindows ?? 0} reference window(s)${screen.source ? ` from ${screen.source}` : ""}`
    : screen.status === "skipped"
      ? `skipped${screen.skipReason ? ` (${screen.skipReason})` : ""}`
      : "not run";
  const lines = [
    "siRNA Design",
    "",
    `Records: ${result.records.length}`,
    `Candidates returned: ${result.rows.length}`,
    `Target length: ${result.options.targetLength} nt`,
    `GC range: ${result.options.minGcPercent}-${result.options.maxGcPercent}%`,
    `3' overhang: ${result.options.includeOverhangs ? result.options.overhang : "none"}`,
    `Reference hit count: ${referenceScreenText}`,
    `Reference match rows: ${result.referenceMatchRows?.length ?? 0}${screen.omittedRows ? ` shown; ${screen.omittedRows} omitted by row limits` : ""}`,
    "",
    "Assumption: input is the direct/sense transcript sequence. DNA input is treated as the coding-equivalent sequence and converted to RNA by replacing T with U. Coordinates are 1-based on the submitted direct sequence.",
    "Method: candidates are ranked with transparent Reynolds-style and Ui-Tei-style rule scores. Optional reference hit counting is an ungapped local mismatch comparison of candidate target windows against the reference sequence provided.",
    "Citations: Reynolds et al. Nat Biotechnol. 2004; Ui-Tei et al. Nucleic Acids Res. 2004.",
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

export function makeSirnaGuideFasta(rows, lineWidth = 60) {
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
