import { parseSequenceInput } from "./fasta.js";
import {
  BIOWASM_SEQ_ALIGN_VERSION,
  createPairwiseAlignmentRunner,
  PAIRWISE_ALIGNMENT_ENGINES
} from "./pairwise-alignment.js";
import { normalizeSequenceSetReciprocalBestMatchOptions, RECIPROCAL_RESOURCE_LIMITS as LIMITS } from "./reciprocal-best-match-options.js";
export { normalizeSequenceSetReciprocalBestMatchOptions } from "./reciprocal-best-match-options.js";
import { makeHeatmapPlotSpec, renderHeatmapPlotSvg } from "./plot-renderer.js";
import { cleanDnaRnaSequence, cleanProteinSequence } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";

const STANDARD_AA_PATTERN = /^[ACDEFGHIKLMNPQRSTVWY]+$/;
const STANDARD_DNA_RNA_PATTERN = /^[ACGT]+$/;
export const MAX_HEATMAP_RECORDS = 30;

export const proteomeReciprocalBestMatchColumns = [
  { id: "a_record", label: "Protein set A record", type: "string" },
  { id: "b_record", label: "Protein set B record", type: "string" },
  { id: "a_source_index", label: "A source record", type: "number" },
  { id: "b_source_index", label: "B source record", type: "number" },
  { id: "a_length", label: "A length", type: "number" },
  { id: "b_length", label: "B length", type: "number" },
  { id: "shared_kmers", label: "Shared k-mers", type: "number" },
  { id: "alignment_score", label: "Alignment score", type: "number" },
  { id: "identity_percent", label: "Identity %", type: "number" },
  { id: "similarity_percent", label: "Similarity %", type: "number" },
  { id: "coverage_a_percent", label: "A coverage %", type: "number" },
  { id: "coverage_b_percent", label: "B coverage %", type: "number" },
  { id: "aligned_length", label: "Aligned length", type: "number" },
  { id: "a_best_rank", label: "A best rank", type: "number" },
  { id: "b_best_rank", label: "B best rank", type: "number" },
  { id: "classification", label: "Classification", type: "string" },
  { id: "notes", label: "Notes", type: "string" }
];

export const dnaRnaSequenceSetReciprocalBestMatchColumns = [
  { id: "a_record", label: "DNA/RNA set A record", type: "string" },
  { id: "b_record", label: "DNA/RNA set B record", type: "string" },
  { id: "a_source_index", label: "A source record", type: "number" },
  { id: "b_source_index", label: "B source record", type: "number" },
  { id: "a_length", label: "A length", type: "number" },
  { id: "b_length", label: "B length", type: "number" },
  { id: "shared_kmers", label: "Shared k-mers", type: "number" },
  { id: "alignment_score", label: "Alignment score", type: "number" },
  { id: "identity_percent", label: "Identity %", type: "number" },
  { id: "similarity_percent", label: "Similarity %", type: "number" },
  { id: "coverage_a_percent", label: "A coverage %", type: "number" },
  { id: "coverage_b_percent", label: "B coverage %", type: "number" },
  { id: "aligned_length", label: "Aligned length", type: "number" },
  { id: "a_best_rank", label: "A best rank", type: "number" },
  { id: "b_best_rank", label: "B best rank", type: "number" },
  { id: "classification", label: "Classification", type: "string" },
  { id: "notes", label: "Notes", type: "string" }
];

export const proteomeUnmatchedColumns = [
  { id: "proteome", label: "Protein set", type: "string" },
  { id: "record", label: "Record", type: "string" },
  { id: "source_index", label: "Source record", type: "number" },
  { id: "best_match_source_index", label: "Best candidate source record", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "best_match", label: "Best verified candidate", type: "string" },
  { id: "best_score", label: "Best score", type: "number" },
  { id: "reason", label: "Why not reciprocal", type: "string" }
];

export const dnaRnaSequenceSetUnmatchedColumns = [
  { id: "proteome", label: "DNA/RNA set", type: "string" },
  { id: "record", label: "Record", type: "string" },
  { id: "source_index", label: "Source record", type: "number" },
  { id: "best_match_source_index", label: "Best candidate source record", type: "number" },
  { id: "length", label: "Length", type: "number" },
  { id: "best_match", label: "Best verified candidate", type: "string" },
  { id: "best_score", label: "Best score", type: "number" },
  { id: "reason", label: "Why not reciprocal", type: "string" }
];

const SEQUENCE_SET_CONFIGS = {
  protein: {
    alphabet: "protein",
    setLabel: "Protein set",
    recordNoun: "protein",
    recordPlural: "proteins",
    unitLabel: "residue",
    cleanLabel: "protein",
    kmerPattern: STANDARD_AA_PATTERN,
    tableColumns: proteomeReciprocalBestMatchColumns,
    unmatchedColumns: proteomeUnmatchedColumns,
    reportTitle: "Protein set reciprocal best match",
    heatmapTitle: "Protein set best-match identity heatmap",
    xLabel: "Protein set B",
    yLabel: "Protein set A",
    alignmentOptions(options) {
      return {
        alphabet: "protein",
        scoringMatrix: "blosum62",
        mode: options.alignmentMode,
        gapOpen: options.gapOpen,
        gapExtend: options.gapExtend,
        alignmentEngine: options.verificationEngine,
        maxAlignmentCells: LIMITS.pairCells
      };
    },
    describeGapLine(options) {
      return `BLOSUM62 affine gap penalties: open ${options.gapOpen}, extend ${options.gapExtend}`;
    },
    scopeNote: "Shared k-mers are used only as a candidate filter. Reported reciprocal matches are based on verified BLOSUM62 affine pairwise alignments among the selected candidates, not on k-mer counts alone."
  },
  "dna-rna": {
    alphabet: "dna-rna",
    setLabel: "DNA/RNA set",
    recordNoun: "DNA/RNA sequence",
    recordPlural: "DNA/RNA sequences",
    unitLabel: "base",
    cleanLabel: "DNA/RNA",
    kmerPattern: STANDARD_DNA_RNA_PATTERN,
    tableColumns: dnaRnaSequenceSetReciprocalBestMatchColumns,
    unmatchedColumns: dnaRnaSequenceSetUnmatchedColumns,
    reportTitle: "DNA/RNA set reciprocal best match",
    heatmapTitle: "DNA/RNA set best-match identity heatmap",
    xLabel: "DNA/RNA set B",
    yLabel: "DNA/RNA set A",
    normalizeSequence(sequence) {
      return sequence.replaceAll("U", "T");
    },
    alignmentOptions(options) {
      return {
        alphabet: "dna-rna",
        mode: options.alignmentMode,
        matchScore: options.matchScore,
        similarScore: options.similarScore,
        mismatchScore: options.mismatchScore,
        gapOpen: options.gapOpen,
        gapExtend: options.gapExtend,
        alignmentEngine: options.verificationEngine,
        maxAlignmentCells: LIMITS.pairCells
      };
    },
    describeGapLine(options) {
      return `DNA/RNA affine scores: match ${options.matchScore}, ${options.verificationEngine === PAIRWISE_ALIGNMENT_ENGINES.sms3 ? `ambiguous overlap ${options.similarScore}, ` : ""}mismatch ${options.mismatchScore}, gap open ${options.gapOpen}, gap extend ${options.gapExtend}`;
    },
    scopeNote: "Shared k-mers are used only as a candidate filter. Reported reciprocal matches are based on verified affine pairwise alignments among the selected candidates, not on k-mer counts alone."
  }
};

function getSequenceSetConfig(alphabet = "protein") {
  return SEQUENCE_SET_CONFIGS[alphabet] ?? SEQUENCE_SET_CONFIGS.protein;
}

function splitSequenceSetInput(input, separator, config = getSequenceSetConfig()) {
  const text = String(input ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) {
    return { parts: ["", ""], warnings: [`No ${config.cleanLabel} FASTA input was provided.`] };
  }
  const lines = text.split("\n");
  const separatorIndex = lines.findIndex((line) => line.trim() === separator);
  if (separatorIndex === -1) {
    return {
      parts: [text, ""],
      warnings: [`Separator line "${separator}" was not found; paste ${config.setLabel} A above the separator and ${config.setLabel} B below it.`]
    };
  }
  if (lines.slice(separatorIndex + 1).some((line) => line.trim() === separator)) {
    throw new Error(`Provide exactly two sequence sets separated by one "${separator}" line.`);
  }
  return {
    parts: [lines.slice(0, separatorIndex).join("\n").trim(), lines.slice(separatorIndex + 1).join("\n").trim()],
    warnings: []
  };
}

async function normalizeSetRecords(input, setLabel, options, warnings, config, context, notes) {
  const parsed = parseSequenceInput(input, `${setLabel} ${config.cleanLabel}`, { strictHeaders: true });
  if (parsed.some((record) => record.sequence.includes(">"))) {
    throw new Error("FASTA headers must start at the beginning of a line, with no sequence text before the first header.");
  }
  const records = [];
  let charactersRemoved = 0;
  let terminalStopsRemoved = 0, gapsRemoved = 0, unsupportedRemoved = 0, uracilsNormalized = 0;
  let internalStopsReplaced = 0;
  const maxSequenceLength = options.maxSequenceLength;

  if (parsed.length > LIMITS.inputRecords) throw new Error(`Each sequence set is limited to ${LIMITS.inputRecords.toLocaleString()} input records.`);
  for (const [index, record] of parsed.entries()) {
    if (index % 32 === 0) { context.throwIfCancelled?.(); await context.yieldIfNeeded?.(); }
    if (record.title.length > LIMITS.titleCharacters) throw new Error(`Sequence titles are limited to ${LIMITS.titleCharacters} characters.`);
    const cleaner = config.alphabet === "protein" ? cleanProteinSequence : cleanDnaRnaSequence;
    const cleaned = cleaner(record.sequence, { keepGaps: false, preserveCase: false });
    charactersRemoved += cleaned.removedCount;
    const gaps = (record.sequence.match(/[.-]/g) ?? []).length;
    gapsRemoved += gaps;
    unsupportedRemoved += cleaned.removedCount - gaps;
    if (config.alphabet === "dna-rna") uracilsNormalized += (cleaned.sequence.match(/U/g) ?? []).length;
    let sequence = config.normalizeSequence
      ? config.normalizeSequence(cleaned.sequence)
      : cleaned.sequence;
    if (config.alphabet === "protein" && sequence.endsWith("*")) {
      sequence = sequence.slice(0, -1);
      terminalStopsRemoved += 1;
      charactersRemoved += 1;
    }
    const internalStops = config.alphabet === "protein" ? (sequence.match(/\*/g) ?? []).length : 0;
    if (internalStops > 0) {
      sequence = sequence.replaceAll("*", "X");
      internalStopsReplaced += internalStops;
    }
    if (!sequence) {
      warnings.push(`${setLabel} ${record.title || `record ${index + 1}`}: no ${config.cleanLabel} symbols remained after cleaning.`);
      continue;
    }
    if (sequence.length > maxSequenceLength) {
      warnings.push(`${setLabel} ${record.title || `record ${index + 1}`}: skipped length ${sequence.length}; limit is ${maxSequenceLength}.`);
      continue;
    }
    records.push({
      proteome: setLabel,
      index: records.length,
      sourceIndex: index + 1,
      title: record.title || `${setLabel} ${config.recordNoun} ${index + 1}`,
      sequence,
      length: sequence.length
    });
  }

  if (unsupportedRemoved > 0) warnings.push(`${setLabel}: removed ${unsupportedRemoved} unsupported character(s) outside the ${config.cleanLabel} alphabet.`);
  if (gapsRemoved > 0) notes.push(`${setLabel}: removed ${gapsRemoved} gap character(s); lengths and coverage use cleaned sequences.`);
  if (uracilsNormalized > 0) notes.push(`${setLabel}: compared ${uracilsNormalized} U symbol(s) as T.`);
  if (terminalStopsRemoved > 0) {
    notes.push(`${setLabel}: trimmed ${terminalStopsRemoved} terminal stop marker(s) from protein records.`);
  }
  if (internalStopsReplaced > 0) {
    warnings.push(`${setLabel}: replaced ${internalStopsReplaced} internal stop marker(s) with X for screening/alignment.`);
  }

  return { records, charactersRemoved };
}

async function makeKmers(sequence, kmerSize, config, context) {
  const kmers = new Set();
  const source = String(sequence ?? "");
  if (source.length === 0) {
    return kmers;
  }
  if (source.length < kmerSize) {
    if (config.kmerPattern.test(source)) {
      kmers.add(source);
    }
    return kmers;
  }
  for (let index = 0; index <= source.length - kmerSize; index += 1) {
    if (index % 4096 === 0) { context.throwIfCancelled?.(); await context.yieldIfNeeded?.(); }
    const kmer = source.slice(index, index + kmerSize);
    if (config.kmerPattern.test(kmer)) {
      kmers.add(kmer);
    }
  }
  return kmers;
}

async function buildKmerIndex(records, kmerSize, context, config) {
  const index = new Map(), recordKmers = [];
  for (const [recordIndex, record] of records.entries()) {
    context.throwIfCancelled?.();
    const kmers = await makeKmers(record.sequence, kmerSize, config, context);
    for (const kmer of kmers) {
      if (!index.has(kmer)) index.set(kmer, new Set());
      index.get(kmer).add(recordIndex);
    }
    recordKmers.push(kmers);
    await context.yieldIfNeeded?.();
  }
  return { index, recordKmers };
}

async function makeCandidatePairs(recordsA, recordsB, options, context = {}, config = getSequenceSetConfig()) {
  const { index: indexB, recordKmers: kmersB } = await buildKmerIndex(recordsB, options.kmerSize, context, config);
  const kmersA = [];
  for (const record of recordsA) kmersA.push(await makeKmers(record.sequence, options.kmerSize, config, context));
  const byA = Array.from({ length: recordsA.length }, () => []);
  const byB = Array.from({ length: recordsB.length }, () => []);
  let allCandidateCount = 0, screeningVisits = 0;
  let screenedPairs = 0;

  for (let aIndex = 0; aIndex < recordsA.length; aIndex += 1) {
    context.throwIfCancelled?.();
    const counts = new Map();
    for (const kmer of kmersA[aIndex]) {
      const bIndexes = indexB.get(kmer);
      if (!bIndexes) continue;
      for (const bIndex of bIndexes) {
        screeningVisits += 1;
        if (screeningVisits > LIMITS.screeningVisits) throw new Error(`Candidate screening exceeds ${LIMITS.screeningVisits.toLocaleString()} word-to-record visits. Reduce the sets or choose a larger k-mer size.`);
        if (screeningVisits % 8192 === 0) { context.throwIfCancelled?.(); await context.yieldIfNeeded?.(); }
        counts.set(bIndex, (counts.get(bIndex) ?? 0) + 1);
      }
    }
    // Zero explicitly disables the shared-word requirement; retain zero-hit pairs.
    if (options.minSharedKmers === 0) {
      for (let bIndex = 0; bIndex < recordsB.length; bIndex += 1) {
        if (!counts.has(bIndex)) counts.set(bIndex, 0);
      }
    }
    for (const [bIndex, sharedKmers] of counts) {
      screenedPairs += 1;
      if (sharedKmers < options.minSharedKmers) continue;
      const lengthRatio = Math.min(recordsA[aIndex].length, recordsB[bIndex].length) / Math.max(recordsA[aIndex].length, recordsB[bIndex].length);
      const candidate = {
        aIndex,
        bIndex,
        sharedKmers,
        aKmers: kmersA[aIndex].size,
        bKmers: kmersB[bIndex].size,
        lengthRatio
      };
      allCandidateCount += 1;
      if (allCandidateCount > LIMITS.candidatePairs) throw new Error(`Candidate screening exceeds ${LIMITS.candidatePairs.toLocaleString()} eligible pairs. Reduce the sets or increase the shared k-mer minimum.`);
      byA[aIndex].push(candidate);
      byB[bIndex].push(candidate);
    }
    await context.yieldIfNeeded?.();
    if (aIndex % 10 === 0) {
      context.reportProgress?.({
        phase: "screening-candidates",
        progress: 0.15 + (0.25 * (aIndex + 1)) / Math.max(1, recordsA.length),
        recordsProcessed: aIndex + 1,
        totalRecords: recordsA.length
      });
    }
  }

  const rankCandidates = (items) => [...items].sort((left, right) =>
    right.sharedKmers - left.sharedKmers ||
    right.lengthRatio - left.lengthRatio ||
    recordsB[left.bIndex]?.title?.localeCompare(recordsB[right.bIndex]?.title ?? "") ||
    left.aIndex - right.aIndex
  );
  const selected = new Map();
  for (const candidates of byA) {
    for (const candidate of rankCandidates(candidates).slice(0, options.topCandidatesPerProtein)) {
      selected.set(`${candidate.aIndex}:${candidate.bIndex}`, candidate);
    }
  }
  for (const candidates of byB) {
    const ranked = [...candidates].sort((left, right) =>
      right.sharedKmers - left.sharedKmers ||
      right.lengthRatio - left.lengthRatio ||
      recordsA[left.aIndex]?.title?.localeCompare(recordsA[right.aIndex]?.title ?? "") ||
      left.bIndex - right.bIndex
    );
    for (const candidate of ranked.slice(0, options.topCandidatesPerProtein)) {
      selected.set(`${candidate.aIndex}:${candidate.bIndex}`, candidate);
    }
  }

  return {
    selectedCandidates: [...selected.values()].sort((left, right) =>
      right.sharedKmers - left.sharedKmers ||
      right.lengthRatio - left.lengthRatio ||
      left.aIndex - right.aIndex ||
      left.bIndex - right.bIndex
    ),
    allCandidateCount,
    screenedPairs
  };
}

function assignRanks(rows, keyField, scoreField, rankField) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row[keyField];
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  for (const group of grouped.values()) {
    group.sort((left, right) =>
      right[scoreField] - left[scoreField] ||
      right.shared_kmers - left.shared_kmers ||
      left.a_record.localeCompare(right.a_record) ||
      left.b_record.localeCompare(right.b_record)
    );
    group.forEach((row, index) => {
      row[rankField] = index + 1;
    });
  }
}

function classifyRows(rows, options) {
  const alignedRows = rows.filter((row) => row.aligned_length > 0);
  assignRanks(alignedRows, "a_source_index", "alignment_score", "a_best_rank");
  assignRanks(alignedRows, "b_source_index", "alignment_score", "b_best_rank");
  const reciprocalRows = [];
  for (const row of rows) {
    const notes = [];
    if (row.aligned_length === 0) {
      row.classification = "no_alignment";
      row.notes = "No positive-scoring local alignment";
      continue;
    }
    if (row.a_best_rank === 1 && row.b_best_rank === 1) {
      row.classification = "reciprocal_best";
      reciprocalRows.push(row);
    } else if (row.a_best_rank === 1) {
      row.classification = "a_best_only";
    } else if (row.b_best_rank === 1) {
      row.classification = "b_best_only";
    } else {
      row.classification = "candidate";
    }
    if (row.coverage_a_percent < options.minCoveragePercent || row.coverage_b_percent < options.minCoveragePercent) {
      notes.push("low coverage");
    }
    if (row.identity_percent < options.minIdentityPercent) {
      notes.push("low identity");
    }
    row.notes = notes.join("; ");
  }
  return reciprocalRows;
}

function formatClassification(value) {
  return String(value ?? "").replaceAll("_", " ");
}

function describeNonReciprocalReason(best) {
  if (!best) {
    return "No verified candidate";
  }
  if (best.classification === "reciprocal_best") {
    return best.notes
      ? `Reciprocal best match failed reporting filters: ${best.notes}`
      : "Reciprocal best match failed reporting filters";
  }
  return `Best verified candidate is not reciprocal (${formatClassification(best.classification)})`;
}

function makeUnmatchedRows(recordsA, recordsB, rows, reciprocalRows) {
  const bestByA = new Map();
  const bestByB = new Map();
  const reciprocalA = new Set(reciprocalRows.map((row) => row.a_source_index));
  const reciprocalB = new Set(reciprocalRows.map((row) => row.b_source_index));
  for (const row of rows) {
    if (row.a_best_rank === 1) {
      bestByA.set(row.a_source_index, row);
    }
    if (row.b_best_rank === 1) {
      bestByB.set(row.b_source_index, row);
    }
  }
  return [
    ...recordsA.filter((record) => !reciprocalA.has(record.sourceIndex)).map((record) => {
      const best = bestByA.get(record.sourceIndex);
      return {
        proteome: "A",
        record: record.title,
        source_index: record.sourceIndex,
        best_match_source_index: best?.b_source_index ?? "",
        length: record.length,
        best_match: best?.b_record ?? "",
        best_score: best?.alignment_score ?? "",
        reason: describeNonReciprocalReason(best)
      };
    }),
    ...recordsB.filter((record) => !reciprocalB.has(record.sourceIndex)).map((record) => {
      const best = bestByB.get(record.sourceIndex);
      return {
        proteome: "B",
        record: record.title,
        source_index: record.sourceIndex,
        best_match_source_index: best?.a_source_index ?? "",
        length: record.length,
        best_match: best?.a_record ?? "",
        best_score: best?.alignment_score ?? "",
        reason: describeNonReciprocalReason(best)
      };
    })
  ];
}

function makeNearTieWarnings(rows, options, config = getSequenceSetConfig()) {
  const warnings = [];
  const thresholdFraction = options.nearTiePercent / 100;
  for (const [field, label] of [["a_source_index", `${config.setLabel} A`], ["b_source_index", `${config.setLabel} B`]]) {
    const grouped = new Map();
    for (const row of rows) {
      if (row.aligned_length === 0) continue;
      if (!grouped.has(row[field])) grouped.set(row[field], []);
      grouped.get(row[field]).push(row);
    }
    for (const [record, group] of grouped.entries()) {
      const ranked = [...group].sort((left, right) => right.alignment_score - left.alignment_score);
      if (ranked.length < 2) continue;
      const bestScore = ranked[0].alignment_score;
      const cutoff = bestScore - Math.abs(bestScore) * thresholdFraction;
      const closeAlternatives = ranked.slice(1).filter((row) => row.alignment_score >= cutoff);
      if (closeAlternatives.length > 0) {
        warnings.push(`${label} record ${record} (${ranked[0][field === "a_source_index" ? "a_record" : "b_record"]}): ${closeAlternatives.length} alternative verified hit(s) are within ${options.nearTiePercent}% of the best score; inspect tied or closely scoring alternatives.`);
      }
    }
  }
  return warnings;
}

export function normalizeProteomeReciprocalBestMatchOptions(options = {}) {
  return normalizeSequenceSetReciprocalBestMatchOptions(options, "protein");
}

export function normalizeDnaRnaSequenceSetReciprocalBestMatchOptions(options = {}) {
  return normalizeSequenceSetReciprocalBestMatchOptions(options, "dna-rna");
}

export async function compareSequenceSetReciprocalBestMatches(input, rawOptions = {}, context = {}, alphabet = "protein") {
  const originalContext = context;
  let lastYield = -Infinity;
  context = { ...context, yieldIfNeeded: async () => {
    originalContext.throwIfCancelled?.();
    if (performance.now() - lastYield >= 8) {
      await originalContext.yieldIfNeeded?.();
      lastYield = performance.now();
    }
    originalContext.throwIfCancelled?.();
  } };
  if (String(input ?? "").length > LIMITS.inputCharacters) throw new Error(`Sequence-set input exceeds ${LIMITS.inputCharacters.toLocaleString()} characters.`);
  const config = getSequenceSetConfig(alphabet);
  const options = normalizeSequenceSetReciprocalBestMatchOptions(rawOptions, config.alphabet);
  const warnings = [], notes = [];

  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const split = splitSequenceSetInput(input, options.separator, config);
  warnings.push(...split.warnings);
  const setA = await normalizeSetRecords(split.parts[0], "A", options, warnings, config, context, notes);
  const setB = await normalizeSetRecords(split.parts[1], "B", options, warnings, config, context, notes);
  let recordsA = setA.records;
  let recordsB = setB.records;
  const charactersRemoved = setA.charactersRemoved + setB.charactersRemoved;

  if (recordsA.length > options.maxProteinsPerProteome) {
    warnings.push(`${config.setLabel} A contains ${recordsA.length} usable records; only the first ${options.maxProteinsPerProteome} were used.`);
    recordsA = recordsA.slice(0, options.maxProteinsPerProteome);
  }
  if (recordsB.length > options.maxProteinsPerProteome) {
    warnings.push(`${config.setLabel} B contains ${recordsB.length} usable records; only the first ${options.maxProteinsPerProteome} were used.`);
    recordsB = recordsB.slice(0, options.maxProteinsPerProteome);
  }

  if (recordsA.length === 0 || recordsB.length === 0) {
    return {
      options,
      recordsA,
      recordsB,
      rows: [],
      reciprocalRows: [],
      unmatchedRows: [],
      notes,
      warnings: [...warnings, `Both ${config.setLabel.toLowerCase()} panels must contain at least one usable ${config.cleanLabel} FASTA record.`],
      charactersRemoved,
      candidateCount: 0,
      verifiedCount: 0,
      screenedPairs: 0,
      verificationEngineCounts: {}
    };
  }

  context.reportProgress?.({ phase: "screening-candidates", progress: 0.12 });
  await context.yieldIfNeeded?.();
  if (recordsA.length * recordsB.length > LIMITS.recordPairs) throw new Error(`Screening is limited to ${LIMITS.recordPairs.toLocaleString()} possible record pairs.`);
  const kmerSymbols = [...recordsA, ...recordsB].reduce((sum, record) => sum + Math.max(1, record.length - options.kmerSize + 1) * Math.min(record.length, options.kmerSize), 0);
  if (kmerSymbols > LIMITS.kmerSymbols) throw new Error(`K-mer construction exceeds ${LIMITS.kmerSymbols.toLocaleString()} inspected symbols. Reduce sequence length or set size.`);
  const candidates = await makeCandidatePairs(recordsA, recordsB, options, context, config);
  let selectedCandidates = candidates.selectedCandidates;
  if (selectedCandidates.length > options.maxPairwiseAlignments) {
    warnings.push(`Candidate screening selected ${selectedCandidates.length} pair(s); only the top ${options.maxPairwiseAlignments} by shared k-mers were aligned.`);
    selectedCandidates = selectedCandidates.slice(0, options.maxPairwiseAlignments);
  }
  if (selectedCandidates.length === 0) {
    notes.push("No candidate pairs passed the shared k-mer filter. Try a smaller k-mer size or lower minimum shared k-mers.");
  }

  if (selectedCandidates.length > LIMITS.verifiedPairs) throw new Error(`A run is limited to ${LIMITS.verifiedPairs.toLocaleString()} verified pairs.`);
  let totalCells = 0;
  for (const pair of selectedCandidates) {
    const cells = (recordsA[pair.aIndex].length + 1) * (recordsB[pair.bIndex].length + 1);
    if (cells > LIMITS.pairCells) throw new Error(`Each alignment is limited to ${LIMITS.pairCells.toLocaleString()} matrix cells for either engine. Reduce sequence length.`);
    totalCells += cells;
    if (totalCells > LIMITS.totalCells) throw new Error(`Selected alignments exceed ${LIMITS.totalCells.toLocaleString()} total matrix cells. Reduce candidate count or sequence length.`);
  }
  const rows = [];
  const verificationEngineCounts = {};
  const alignmentRunner = createPairwiseAlignmentRunner(config.alignmentOptions(options), config.alphabet, warnings, context);
  for (const [candidateIndex, candidate] of selectedCandidates.entries()) {
    context.throwIfCancelled?.();
    const recordA = recordsA[candidate.aIndex];
    const recordB = recordsB[candidate.bIndex];
    const alignment = await alignmentRunner.align(recordA.sequence, recordB.sequence);
    verificationEngineCounts[alignment.engine] = (verificationEngineCounts[alignment.engine] ?? 0) + 1;
    const coveredA = Math.max(0, alignment.endA - alignment.startA + 1);
    const coveredB = Math.max(0, alignment.endB - alignment.startB + 1);
    rows.push({
      a_record: recordA.title,
      b_record: recordB.title,
      a_source_index: recordA.sourceIndex,
      b_source_index: recordB.sourceIndex,
      a_length: recordA.length,
      b_length: recordB.length,
      shared_kmers: candidate.sharedKmers,
      alignment_score: alignment.score,
      identity_percent: alignment.identityPercent,
      similarity_percent: alignment.similarityPercent,
      coverage_a_percent: (coveredA / recordA.length) * 100,
      coverage_b_percent: (coveredB / recordB.length) * 100,
      aligned_length: alignment.alignedLength,
      a_best_rank: "",
      b_best_rank: "",
      classification: "candidate",
      notes: ""
    });
    if (candidateIndex % 5 === 0) {
      context.reportProgress?.({
        phase: "verifying-alignments",
        progress: 0.42 + (0.45 * (candidateIndex + 1)) / Math.max(1, selectedCandidates.length),
        recordsProcessed: candidateIndex + 1,
        totalRecords: selectedCandidates.length
      });
      await context.yieldIfNeeded?.();
    }
  }

  const reciprocalRows = classifyRows(rows, options)
    .filter((row) =>
      row.identity_percent >= options.minIdentityPercent &&
      row.coverage_a_percent >= options.minCoveragePercent &&
      row.coverage_b_percent >= options.minCoveragePercent
    );
  const unmatchedRows = makeUnmatchedRows(recordsA, recordsB, rows, reciprocalRows);
  warnings.push(...makeNearTieWarnings(rows, options, config));

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return {
    options,
    recordsA,
    recordsB,
    rows,
    reciprocalRows,
    unmatchedRows,
    warnings,
    notes,
    charactersRemoved,
    candidateCount: candidates.allCandidateCount,
    verifiedCount: rows.length,
    screenedPairs: candidates.screenedPairs,
    verificationEngineCounts
  };
}

export async function compareProteomeReciprocalBestMatches(input, rawOptions = {}, context = {}) {
  return compareSequenceSetReciprocalBestMatches(input, rawOptions, context, "protein");
}

export async function compareDnaRnaSequenceSetReciprocalBestMatches(input, rawOptions = {}, context = {}) {
  return compareSequenceSetReciprocalBestMatches(input, rawOptions, context, "dna-rna");
}

function describeVerificationEngine(result) {
  const counts = result.verificationEngineCounts ?? {};
  const seqAlignCount = counts[PAIRWISE_ALIGNMENT_ENGINES.seqAlign] ?? 0;
  const sms3Count = counts[PAIRWISE_ALIGNMENT_ENGINES.sms3] ?? 0;
  if (seqAlignCount > 0 && sms3Count > 0) {
    return `seq-align ${BIOWASM_SEQ_ALIGN_VERSION} via vendored BioWasm/Aioli (${seqAlignCount}); SMS3 affine dynamic programming (${sms3Count})`;
  }
  if (seqAlignCount > 0) {
    return `seq-align ${BIOWASM_SEQ_ALIGN_VERSION} via vendored BioWasm/Aioli`;
  }
  if (sms3Count > 0) {
    return "SMS3 affine dynamic programming";
  }
  return result.options.verificationEngine === PAIRWISE_ALIGNMENT_ENGINES.seqAlign
    ? `seq-align ${BIOWASM_SEQ_ALIGN_VERSION} via vendored BioWasm/Aioli requested; no alignments were run`
    : "SMS3 affine dynamic programming requested; no alignments were run";
}

export function makeSequenceSetBestMatchReport(result) {
  const config = getSequenceSetConfig(result.options?.alphabet);
  const bestOnlyA = result.rows.filter((row) => row.classification === "a_best_only").length;
  const bestOnlyB = result.rows.filter((row) => row.classification === "b_best_only").length;
  return [
    config.reportTitle,
    "",
    `${config.setLabel} A records used: ${result.recordsA.length}`,
    `${config.setLabel} B records used: ${result.recordsB.length}`,
    `Candidate pairs passing k-mer threshold: ${result.candidateCount}`,
    `Pairwise comparisons performed: ${result.verifiedCount}`,
    `Reciprocal best matches: ${result.reciprocalRows.length}`,
    `A-best-only candidate rows: ${bestOnlyA}`,
    `B-best-only candidate rows: ${bestOnlyB}`,
    `${config.recordPlural[0].toUpperCase()}${config.recordPlural.slice(1)} without reciprocal matches: ${result.unmatchedRows.length}`,
    "",
    "Settings:",
    `k-mer size: ${result.options.kmerSize}`,
    `minimum shared k-mers: ${result.options.minSharedKmers}`,
    `top candidates per ${config.alphabet === "protein" ? "protein" : "sequence"}: ${result.options.topCandidatesPerProtein}`,
    `alignment mode: ${result.options.alignmentMode}`,
    `verification engine: ${describeVerificationEngine(result)}`,
    config.describeGapLine(result.options),
    `minimum identity: ${result.options.minIdentityPercent}%`,
    `minimum coverage of each sequence: ${result.options.minCoveragePercent}%`,
    `near-tie threshold: ${result.options.nearTiePercent}%`,
    `maximum records per set: ${result.options.maxProteinsPerProteome === Infinity ? "disabled" : result.options.maxProteinsPerProteome}`,
    `maximum sequence length: ${result.options.maxSequenceLength === Infinity ? "disabled" : result.options.maxSequenceLength}`,
    `maximum pairwise comparisons: ${result.options.maxPairwiseAlignments === Infinity ? "disabled" : result.options.maxPairwiseAlignments}`,
    "",
    "Scope note:",
    config.scopeNote,
    config.alphabet === "dna-rna" ? "Compared as provided; reverse complements are not searched. U is compared as T." : "Protein verification uses BLOSUM62.",
    "Identity is identical columns / all alignment columns. Coverage is the aligned ungapped span / cleaned record length.",
    "Best ranks use alignment score, shared k-mers and title order; remaining ties retain candidate order. Exact ties select one partner; close alternatives are warned.",
    ...(result.notes?.length ? ["", "Run notes:", ...result.notes] : []),
    ...(result.warnings.length ? ["", "Warnings:", ...result.warnings] : [])
  ].join("\n") + "\n";
}

export function makeProteomeBestMatchReport(result) {
  return makeSequenceSetBestMatchReport(result);
}

export function makeDnaRnaSequenceSetBestMatchReport(result) {
  return makeSequenceSetBestMatchReport(result);
}

export function makeSequenceSetBestMatchTsv(rows, alphabet = "protein") {
  const config = getSequenceSetConfig(alphabet);
  return exportDelimitedTable(config.tableColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

export function makeProteomeBestMatchTsv(rows) {
  return makeSequenceSetBestMatchTsv(rows, "protein");
}

export function makeDnaRnaSequenceSetBestMatchTsv(rows) {
  return makeSequenceSetBestMatchTsv(rows, "dna-rna");
}

export function makeSequenceSetUnmatchedTsv(rows, alphabet = "protein") {
  const config = getSequenceSetConfig(alphabet);
  return exportDelimitedTable(config.unmatchedColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

export function makeProteomeUnmatchedTsv(rows) {
  return makeSequenceSetUnmatchedTsv(rows, "protein");
}

export function makeDnaRnaSequenceSetUnmatchedTsv(rows) {
  return makeSequenceSetUnmatchedTsv(rows, "dna-rna");
}

export function makeSequenceSetBestMatchHeatmapSvg(result, options = {}) {
  const config = getSequenceSetConfig(result.options?.alphabet);
  const rowsA = result.recordsA.slice(0, MAX_HEATMAP_RECORDS);
  const rowsB = result.recordsB.slice(0, MAX_HEATMAP_RECORDS);
  const title = options.title ?? config.heatmapTitle;
  const rowMap = new Map(result.rows.map(row => [`${row.a_source_index}:${row.b_source_index}`, row]));
  const reportedPairs = new Set(result.reciprocalRows.map(row => `${row.a_source_index}:${row.b_source_index}`));
  const notes = [
    "Corner markers show reported reciprocal best matches. Blank cells have no verified alignment."
  ];
  if (result.recordsA.length > rowsA.length || result.recordsB.length > rowsB.length) {
    notes.push(`Heatmap limited to first ${MAX_HEATMAP_RECORDS} records from each ${config.setLabel.toLowerCase()}; table output contains all verified pairs.`);
  }
  const spec = makeHeatmapPlotSpec({
    title,
    subtitle: "Cell color shows percent identity for verified candidate alignments.",
    xLabel: config.xLabel,
    yLabel: config.yLabel,
    valueLabel: "Identity",
    valueDomain: [0, 100],
    colorScheme: "cividis",
    xCategories: rowsB.map((record) => ({ id: String(record.sourceIndex), label: `${record.sourceIndex}: ${record.title}` })),
    yCategories: rowsA.map((record) => ({ id: String(record.sourceIndex), label: `${record.sourceIndex}: ${record.title}` })),
    cells: rowsA.flatMap(a => rowsB.map(b => {
      const key = `${a.sourceIndex}:${b.sourceIndex}`, row = rowMap.get(key);
      const identity = row?.aligned_length > 0 ? row.identity_percent : undefined;
      const status = !row ? "Pair not verified (screened out or capped)"
        : row.aligned_length === 0 ? "No positive-scoring local alignment"
          : `${formatClassification(row.classification)}${row.notes ? `; excluded by reporting filters: ${row.notes}` : ""}`;
      return {
        x: String(b.sourceIndex), y: String(a.sourceIndex), value: identity,
        displayValue: Number.isFinite(identity) ? String(Math.round(identity)) : "",
        title: `A${a.sourceIndex}: ${a.title} vs B${b.sourceIndex}: ${b.title}: ${Number.isFinite(identity) ? `${identity}% identity; ` : ""}${status}`,
        highlight: reportedPairs.has(key)
      };
    })),
    notes
  });

  return renderHeatmapPlotSvg(spec);
}

export function makeProteomeBestMatchHeatmapSvg(result, options = {}) {
  return makeSequenceSetBestMatchHeatmapSvg(result, options);
}

export function makeDnaRnaSequenceSetBestMatchHeatmapSvg(result, options = {}) {
  return makeSequenceSetBestMatchHeatmapSvg(result, options);
}
