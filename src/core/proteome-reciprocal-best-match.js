import { parseSequenceInput } from "./fasta.js";
import {
  BIOWASM_SEQ_ALIGN_VERSION,
  createPairwiseAlignmentRunner,
  PAIRWISE_ALIGNMENT_ENGINES
} from "./pairwise-alignment.js";
import { makeHeatmapPlotSpec, renderHeatmapPlotSvg } from "./plot-renderer.js";
import { cleanDnaRnaSequence, cleanProteinSequence } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";

const DEFAULT_SEPARATOR = "---";
const STANDARD_AA_PATTERN = /^[ACDEFGHIKLMNPQRSTVWY]+$/;
const STANDARD_DNA_RNA_PATTERN = /^[ACGT]+$/;
const MAX_HEATMAP_RECORDS = 30;

export const proteomeReciprocalBestMatchColumns = [
  { id: "a_record", label: "Protein set A record", type: "string" },
  { id: "b_record", label: "Protein set B record", type: "string" },
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
  { id: "length", label: "Length", type: "number" },
  { id: "best_match", label: "Best verified candidate", type: "string" },
  { id: "best_score", label: "Best score", type: "number" },
  { id: "reason", label: "Why not reciprocal", type: "string" }
];

export const dnaRnaSequenceSetUnmatchedColumns = [
  { id: "proteome", label: "DNA/RNA set", type: "string" },
  { id: "record", label: "Record", type: "string" },
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
    defaultKmerSize: 4,
    minKmerSize: 2,
    maxKmerSize: 8,
    defaultMaxSequenceLength: 1500,
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
        alignmentEngine: options.verificationEngine
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
    defaultKmerSize: 11,
    minKmerSize: 4,
    maxKmerSize: 100,
    defaultMaxSequenceLength: 10000,
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
        alignmentEngine: options.verificationEngine
      };
    },
    describeGapLine(options) {
      return `DNA/RNA affine scores: match ${options.matchScore}, ambiguous overlap ${options.similarScore}, mismatch ${options.mismatchScore}, gap open ${options.gapOpen}, gap extend ${options.gapExtend}`;
    },
    scopeNote: "Shared k-mers are used only as a candidate filter. Reported reciprocal matches are based on verified affine pairwise alignments among the selected candidates, not on k-mer counts alone."
  }
};

function getSequenceSetConfig(alphabet = "protein") {
  return SEQUENCE_SET_CONFIGS[alphabet] ?? SEQUENCE_SET_CONFIGS.protein;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function splitSequenceSetInput(input, separator = DEFAULT_SEPARATOR, config = getSequenceSetConfig()) {
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
  return {
    parts: [lines.slice(0, separatorIndex).join("\n").trim(), lines.slice(separatorIndex + 1).join("\n").trim()],
    warnings: []
  };
}

function normalizeSetRecords(input, setLabel, options, warnings, config) {
  const parsed = parseSequenceInput(input, `${setLabel} ${config.cleanLabel}`);
  const records = [];
  let charactersRemoved = 0;
  let terminalStopsRemoved = 0;
  let internalStopsReplaced = 0;
  const maxSequenceLength = options.maxSequenceLength;

  parsed.forEach((record, index) => {
    const cleaner = config.alphabet === "protein" ? cleanProteinSequence : cleanDnaRnaSequence;
    const cleaned = cleaner(record.sequence, { keepGaps: false, preserveCase: false });
    charactersRemoved += cleaned.removedCount;
    let sequence = config.normalizeSequence
      ? config.normalizeSequence(cleaned.sequence)
      : cleaned.sequence;
    if (config.alphabet === "protein" && sequence.endsWith("*")) {
      sequence = sequence.slice(0, -1);
      terminalStopsRemoved += 1;
    }
    const internalStops = config.alphabet === "protein" ? (sequence.match(/\*/g) ?? []).length : 0;
    if (internalStops > 0) {
      sequence = sequence.replaceAll("*", "X");
      internalStopsReplaced += internalStops;
    }
    if (!sequence) {
      warnings.push(`${setLabel} ${record.title || `record ${index + 1}`}: no ${config.cleanLabel} symbols remained after cleaning.`);
      return;
    }
    if (sequence.length > maxSequenceLength) {
      warnings.push(`${setLabel} ${record.title || `record ${index + 1}`}: skipped length ${sequence.length}; limit is ${maxSequenceLength}.`);
      return;
    }
    records.push({
      proteome: setLabel,
      index: records.length,
      title: record.title || `${setLabel} ${config.recordNoun} ${index + 1}`,
      sequence,
      length: sequence.length
    });
  });

  if (cleanedWarningCount(parsed, charactersRemoved) > 0) {
    warnings.push(`${setLabel}: removed ${charactersRemoved} character(s) outside the ${config.cleanLabel} alphabet.`);
  }
  if (terminalStopsRemoved > 0) {
    warnings.push(`${setLabel}: trimmed ${terminalStopsRemoved} terminal stop marker(s) from protein records.`);
  }
  if (internalStopsReplaced > 0) {
    warnings.push(`${setLabel}: replaced ${internalStopsReplaced} internal stop marker(s) with X for screening/alignment.`);
  }

  return { records, charactersRemoved };
}

function cleanedWarningCount(parsed, charactersRemoved) {
  return parsed.length > 0 && charactersRemoved > 0 ? charactersRemoved : 0;
}

function makeKmers(sequence, kmerSize, config = getSequenceSetConfig()) {
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
    const kmer = source.slice(index, index + kmerSize);
    if (config.kmerPattern.test(kmer)) {
      kmers.add(kmer);
    }
  }
  return kmers;
}

function buildKmerIndex(records, kmerSize, context = {}, config = getSequenceSetConfig()) {
  const index = new Map();
  const recordKmers = records.map((record, recordIndex) => {
    context.throwIfCancelled?.();
    const kmers = makeKmers(record.sequence, kmerSize, config);
    for (const kmer of kmers) {
      if (!index.has(kmer)) {
        index.set(kmer, new Set());
      }
      index.get(kmer).add(recordIndex);
    }
    return kmers;
  });
  return { index, recordKmers };
}

function makeCandidatePairs(recordsA, recordsB, options, context = {}, config = getSequenceSetConfig()) {
  const { index: indexB, recordKmers: kmersB } = buildKmerIndex(recordsB, options.kmerSize, context, config);
  const kmersA = recordsA.map((record) => makeKmers(record.sequence, options.kmerSize, config));
  const byA = Array.from({ length: recordsA.length }, () => []);
  const byB = Array.from({ length: recordsB.length }, () => []);
  const pairMap = new Map();
  let screenedPairs = 0;

  for (let aIndex = 0; aIndex < recordsA.length; aIndex += 1) {
    context.throwIfCancelled?.();
    const counts = new Map();
    for (const kmer of kmersA[aIndex]) {
      const bIndexes = indexB.get(kmer);
      if (!bIndexes) continue;
      for (const bIndex of bIndexes) {
        counts.set(bIndex, (counts.get(bIndex) ?? 0) + 1);
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
      const key = `${aIndex}:${bIndex}`;
      pairMap.set(key, candidate);
      byA[aIndex].push(candidate);
      byB[bIndex].push(candidate);
    }
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
    allCandidateCount: pairMap.size,
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
  assignRanks(rows, "a_record", "alignment_score", "a_best_rank");
  assignRanks(rows, "b_record", "alignment_score", "b_best_rank");
  const reciprocalRows = [];
  for (const row of rows) {
    const notes = [];
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
  const reciprocalA = new Set(reciprocalRows.map((row) => row.a_record));
  const reciprocalB = new Set(reciprocalRows.map((row) => row.b_record));
  for (const row of rows) {
    if (!bestByA.has(row.a_record) || row.alignment_score > bestByA.get(row.a_record).alignment_score) {
      bestByA.set(row.a_record, row);
    }
    if (!bestByB.has(row.b_record) || row.alignment_score > bestByB.get(row.b_record).alignment_score) {
      bestByB.set(row.b_record, row);
    }
  }
  return [
    ...recordsA.filter((record) => !reciprocalA.has(record.title)).map((record) => {
      const best = bestByA.get(record.title);
      return {
        proteome: "A",
        record: record.title,
        length: record.length,
        best_match: best?.b_record ?? "",
        best_score: best?.alignment_score ?? "",
        reason: describeNonReciprocalReason(best)
      };
    }),
    ...recordsB.filter((record) => !reciprocalB.has(record.title)).map((record) => {
      const best = bestByB.get(record.title);
      return {
        proteome: "B",
        record: record.title,
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
  for (const [field, label] of [["a_record", `${config.setLabel} A`], ["b_record", `${config.setLabel} B`]]) {
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row[field])) grouped.set(row[field], []);
      grouped.get(row[field]).push(row);
    }
    for (const [record, group] of grouped.entries()) {
      const ranked = [...group].sort((left, right) => right.alignment_score - left.alignment_score);
      if (ranked.length < 2 || ranked[0].alignment_score <= 0) continue;
      const cutoff = ranked[0].alignment_score * (1 - thresholdFraction);
      const closeAlternatives = ranked.slice(1).filter((row) => row.alignment_score >= cutoff);
      if (closeAlternatives.length > 0) {
        warnings.push(`${label} ${record}: ${closeAlternatives.length} alternative verified hit(s) are within ${options.nearTiePercent}% of the best score; inspect possible paralogs.`);
      }
    }
  }
  return warnings;
}

export function normalizeSequenceSetReciprocalBestMatchOptions(options = {}, alphabet = "protein") {
  const config = getSequenceSetConfig(alphabet);
  const alignmentMode = options.alignmentMode === "global" ? "global" : "local";
  const verificationEngine = options.verificationEngine === PAIRWISE_ALIGNMENT_ENGINES.sms3
    ? PAIRWISE_ALIGNMENT_ENGINES.sms3
    : PAIRWISE_ALIGNMENT_ENGINES.seqAlign;
  return {
    alphabet: config.alphabet,
    separator: String(options.separator ?? DEFAULT_SEPARATOR).trim() || DEFAULT_SEPARATOR,
    kmerSize: Math.trunc(clampNumber(options.kmerSize, config.defaultKmerSize, config.minKmerSize, config.maxKmerSize)),
    minSharedKmers: Math.trunc(clampNumber(options.minSharedKmers, 1, 0, 10000)),
    topCandidatesPerProtein: Math.trunc(clampNumber(options.topCandidatesPerProtein, 5, 1, 50)),
    maxPairwiseAlignments: Math.trunc(clampNumber(options.maxPairwiseAlignments, 500, 1, 10000)),
    maxProteinsPerProteome: Math.trunc(clampNumber(options.maxProteinsPerProteome, 500, 1, 5000)),
    maxSequenceLength: Math.trunc(clampNumber(options.maxSequenceLength, config.defaultMaxSequenceLength, 10, 20000)),
    minIdentityPercent: clampNumber(options.minIdentityPercent, 0, 0, 100),
    minCoveragePercent: clampNumber(options.minCoveragePercent, 0, 0, 100),
    nearTiePercent: clampNumber(options.nearTiePercent, 5, 0, 100),
    verificationEngine,
    alignmentMode,
    matchScore: clampNumber(options.matchScore, 5, -100, 100),
    similarScore: clampNumber(options.similarScore, 1, -100, 100),
    mismatchScore: clampNumber(options.mismatchScore, -4, -100, 100),
    gapOpen: Math.abs(clampNumber(options.gapOpen, 10, 0.1, 100)),
    gapExtend: Math.abs(clampNumber(options.gapExtend, 1, 0.01, 50))
  };
}

export function normalizeProteomeReciprocalBestMatchOptions(options = {}) {
  return normalizeSequenceSetReciprocalBestMatchOptions(options, "protein");
}

export function normalizeDnaRnaSequenceSetReciprocalBestMatchOptions(options = {}) {
  return normalizeSequenceSetReciprocalBestMatchOptions(options, "dna-rna");
}

export async function compareSequenceSetReciprocalBestMatches(input, rawOptions = {}, context = {}, alphabet = "protein") {
  const config = getSequenceSetConfig(alphabet);
  const options = normalizeSequenceSetReciprocalBestMatchOptions(rawOptions, config.alphabet);
  const warnings = [];

  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const split = splitSequenceSetInput(input, options.separator, config);
  warnings.push(...split.warnings);
  const setA = normalizeSetRecords(split.parts[0], "A", options, warnings, config);
  const setB = normalizeSetRecords(split.parts[1], "B", options, warnings, config);
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
  const candidates = makeCandidatePairs(recordsA, recordsB, options, context, config);
  let selectedCandidates = candidates.selectedCandidates;
  if (selectedCandidates.length > options.maxPairwiseAlignments) {
    warnings.push(`Candidate screening selected ${selectedCandidates.length} pair(s); only the top ${options.maxPairwiseAlignments} by shared k-mers were aligned.`);
    selectedCandidates = selectedCandidates.slice(0, options.maxPairwiseAlignments);
  }
  if (selectedCandidates.length === 0) {
    warnings.push("No candidate pairs passed the shared k-mer filter. Try a smaller k-mer size or lower minimum shared k-mers.");
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
      a_length: recordA.length,
      b_length: recordB.length,
      shared_kmers: candidate.sharedKmers,
      alignment_score: round(alignment.score, 3),
      identity_percent: round(alignment.identityPercent, 3),
      similarity_percent: round(alignment.similarityPercent, 3),
      coverage_a_percent: round((coveredA / recordA.length) * 100, 3),
      coverage_b_percent: round((coveredB / recordB.length) * 100, 3),
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
    `Candidate pairs with shared k-mers: ${result.candidateCount}`,
    `Pairwise alignments verified: ${result.verifiedCount}`,
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
    "",
    "Scope note:",
    config.scopeNote
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
  return exportDelimitedTable(config.tableColumns, rows, "\t") + "\n";
}

export function makeProteomeBestMatchTsv(rows) {
  return makeSequenceSetBestMatchTsv(rows, "protein");
}

export function makeDnaRnaSequenceSetBestMatchTsv(rows) {
  return makeSequenceSetBestMatchTsv(rows, "dna-rna");
}

export function makeSequenceSetUnmatchedTsv(rows, alphabet = "protein") {
  const config = getSequenceSetConfig(alphabet);
  return exportDelimitedTable(config.unmatchedColumns, rows, "\t") + "\n";
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
  const rowSetA = new Set(rowsA.map((record) => record.title));
  const rowSetB = new Set(rowsB.map((record) => record.title));
  const notes = [
    "Corner markers show reciprocal best matches."
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
    colorScheme: "light-viridis",
    xCategories: rowsB.map((record) => ({ id: record.title, label: record.title })),
    yCategories: rowsA.map((record) => ({ id: record.title, label: record.title })),
    cells: result.rows
      .filter((row) => rowSetA.has(row.a_record) && rowSetB.has(row.b_record))
      .map((row) => {
        const identity = Number(row.identity_percent);
        return {
          x: row.b_record,
          y: row.a_record,
          value: identity,
          displayValue: Number.isFinite(identity) ? String(Math.round(identity)) : "",
          title: `${row.a_record} vs ${row.b_record}: ${Number.isFinite(identity) ? `${identity}% identity` : "identity not available"} (${row.classification})`,
          highlight: row.classification === "reciprocal_best"
        };
      }),
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
