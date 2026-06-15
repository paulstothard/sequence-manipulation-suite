import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { parseFlatfileRecords } from "./flatfile-records.js";
import {
  makeIndexedFastaReader,
  parseFaiIndex,
  resolveIndexedFastaRegionInput
} from "./indexed-genomics/indexed-fasta-reader.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence, makeSequenceContext } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";

export const crisprGuideDesignColumns = [
  { id: "rank", label: "Rank", type: "number" },
  { id: "candidate_id", label: "Candidate ID", type: "string" },
  { id: "record", label: "Record", type: "string" },
  { id: "nuclease", label: "Nuclease / PAM model", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "guide_start", label: "Guide start", type: "number" },
  { id: "guide_end", label: "Guide end", type: "number" },
  { id: "pam_start", label: "PAM start", type: "number" },
  { id: "pam_end", label: "PAM end", type: "number" },
  { id: "cut_position", label: "Cut position estimate", type: "number" },
  { id: "guide_dna", label: "Guide DNA", type: "string" },
  { id: "guide_rna", label: "Guide RNA", type: "string" },
  { id: "pam_sequence", label: "PAM sequence", type: "string" },
  { id: "gc_percent", label: "GC percent", type: "number" },
  { id: "review_score", label: "Review score", type: "number" },
  { id: "flags", label: "Flags", type: "string" },
  { id: "guide_feature_count", label: "Guide feature count", type: "number" },
  { id: "guide_features", label: "Guide features", type: "string" },
  { id: "cut_features", label: "Cut features", type: "string" },
  { id: "nearest_feature", label: "Nearest feature", type: "string" },
  { id: "reference_match_count", label: "Reference matches", type: "number" },
  { id: "exact_reference_match_count", label: "Exact reference matches", type: "number" },
  { id: "near_reference_match_count", label: "Near reference matches", type: "number" },
  { id: "reference_matches_beyond_first_exact", label: "Reference matches beyond first exact", type: "number" },
  { id: "best_reference_mismatches", label: "Best reference mismatches", type: "number" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched guide region", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];

export const crisprReferenceMatchColumns = [
  { id: "guide_id", label: "Guide ID", type: "string" },
  { id: "guide_record", label: "Guide record", type: "string" },
  { id: "guide_strand", label: "Guide strand", type: "string" },
  { id: "guide_start", label: "Guide start", type: "number" },
  { id: "guide_end", label: "Guide end", type: "number" },
  { id: "reference_record", label: "Reference record", type: "string" },
  { id: "reference_strand", label: "Reference strand", type: "string" },
  { id: "reference_guide_start", label: "Reference guide start", type: "number" },
  { id: "reference_guide_end", label: "Reference guide end", type: "number" },
  { id: "reference_pam_start", label: "Reference PAM start", type: "number" },
  { id: "reference_pam_end", label: "Reference PAM end", type: "number" },
  { id: "mismatch_count", label: "Mismatch count", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "string" },
  { id: "relation", label: "Relation", type: "string" },
  { id: "guide_dna", label: "Guide DNA", type: "string" },
  { id: "reference_guide_dna", label: "Reference guide DNA", type: "string" },
  { id: "reference_pam_sequence", label: "Reference PAM", type: "string" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched reference region", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];

export const CRISPR_REFERENCE_SEPARATOR = "##REFERENCE";

const EXACT_DNA = /^[ACGT]+$/;
const IUPAC_SETS = {
  A: new Set(["A"]),
  C: new Set(["C"]),
  G: new Set(["G"]),
  T: new Set(["T"]),
  U: new Set(["T"]),
  R: new Set(["A", "G"]),
  Y: new Set(["C", "T"]),
  S: new Set(["G", "C"]),
  W: new Set(["A", "T"]),
  K: new Set(["G", "T"]),
  M: new Set(["A", "C"]),
  B: new Set(["C", "G", "T"]),
  D: new Set(["A", "G", "T"]),
  H: new Set(["A", "C", "T"]),
  V: new Set(["A", "C", "G"]),
  N: new Set(["A", "C", "G", "T"])
};

// Scope/citation note:
// This first production pass implements transparent local sequence review for
// CRISPR guide candidates. SpCas9 NGG-style PAM handling and the approximate
// cut-site convention follow the commonly used Streptococcus pyogenes Cas9
// model described in Jinek et al., Science 2012 and early genome-editing
// applications such as Cong et al., Science 2013 and Mali et al., Science 2013.
// Optional reference hit counting is implemented as an ungapped local guide+PAM
// mismatch comparison against user-supplied FASTA/reference text. It deliberately
// does not implement genome-wide activity or chromatin-aware specificity scoring.
const PAM_PRESETS = {
  "spcas9-ngg": {
    label: "SpCas9 NGG",
    nuclease: "SpCas9",
    pamPattern: "NGG",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: -3,
    description: "SpCas9-style 20 nt guide with a 3' NGG PAM."
  },
  "spcas9-ngn": {
    label: "SpCas9 NGN relaxed",
    nuclease: "SpCas9 relaxed PAM",
    pamPattern: "NGN",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: -3,
    description: "Broad 3' NGN PAM review mode. Treat hits as lower-specificity candidates."
  },
  "spcas9-nag": {
    label: "SpCas9 NAG alternate",
    nuclease: "SpCas9 alternate PAM",
    pamPattern: "NAG",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: -3,
    description: "Alternate 3' NAG PAM review mode. Treat hits as lower-efficiency candidates unless externally validated."
  },
  "custom-3prime": {
    label: "Custom 3' PAM",
    nuclease: "Custom 3' PAM",
    pamPattern: "NGG",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: null,
    description: "Custom 3' PAM scan. Cut position is not estimated."
  },
  "custom-5prime": {
    label: "Custom 5' PAM",
    nuclease: "Custom 5' PAM",
    pamPattern: "TTTV",
    pamSide: "5prime",
    guideLength: 23,
    cutOffsetFromPamStart: null,
    description: "Custom 5' PAM scan. Cut position is not estimated."
  }
};

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

function reverseComplementDna(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("").replaceAll("U", "T");
}

function normalizePamPattern(value, fallback) {
  const normalized = String(value ?? fallback).toUpperCase().replace(/[^ACGTRYSWKMBDHVN]/g, "");
  return normalized.slice(0, 12) || fallback;
}

function getPamModel(options = {}) {
  const presetId = PAM_PRESETS[options.pamPreset] ? options.pamPreset : "spcas9-ngg";
  const preset = PAM_PRESETS[presetId];
  if (presetId === "custom-3prime" || presetId === "custom-5prime") {
    return {
      ...preset,
      pamPattern: normalizePamPattern(options.customPamPattern, preset.pamPattern),
      guideLength: clampInteger(options.guideLength, preset.guideLength, 16, 30)
    };
  }
  return preset;
}

export function normalizeCrisprGuideDesignOptions(options = {}) {
  const minGcPercent = clampNumber(options.minGcPercent, 35, 0, 100);
  const maxGcPercent = Math.max(minGcPercent, clampNumber(options.maxGcPercent, 75, 0, 100));
  const fivePrimeGPolicy = ["off", "flag", "require"].includes(options.fivePrimeGPolicy)
    ? options.fivePrimeGPolicy
    : options.preferFivePrimeG === true
      ? "flag"
      : "off";
  const referenceInputMode = ["indexed", "indexed-bgzf"].includes(options.referenceInputMode)
    ? "indexed"
    : options.referenceInputMode === "pasted"
      ? "pasted"
      : hasIndexedReferenceOptions(options)
        ? "indexed"
        : "pasted";
  return {
    pamModel: getPamModel(options),
    minGcPercent,
    maxGcPercent,
    fivePrimeGPolicy,
    preferFivePrimeG: fivePrimeGPolicy === "flag",
    requireFivePrimeG: fivePrimeGPolicy === "require",
    allowAmbiguousCandidates: options.allowAmbiguousCandidates === true,
    maxCandidatesPerRecord: clampInteger(options.maxCandidatesPerRecord, 50, 1, 2000),
    maxRecordLength: clampInteger(options.maxRecordLength, 500000, 100, 10000000),
    searchReferenceOffTargets: options.searchReferenceOffTargets === true,
    referenceInputMode,
    maxOffTargetMismatches: clampInteger(options.maxOffTargetMismatches, 2, 0, 5),
    maxReferenceRecordLength: clampInteger(options.maxReferenceRecordLength, 500000, 100, 10000000),
    maxIndexedReferenceBases: clampInteger(options.maxIndexedReferenceBases, 5000000, 1000, 50000000),
    indexedReferenceChunkSize: clampInteger(options.indexedReferenceChunkSize, 200000, 10000, 1000000),
    maxOffTargetMatchesPerGuide: clampInteger(options.maxOffTargetMatchesPerGuide, 25, 1, 500),
    maxOffTargetRows: clampInteger(options.maxOffTargetRows, 1000, 1, 10000),
    contextBases: clampInteger(options.contextBases, 20, 0, 200),
    lineWidth: clampInteger(options.lineWidth, 60, 10, 200),
    mapMaxCandidatesPerRecord: clampInteger(options.mapMaxCandidatesPerRecord, 80, 1, 500)
  };
}

function setIntersects(left, right) {
  for (const item of left) {
    if (right.has(item)) {
      return true;
    }
  }
  return false;
}

function matchesPam(baseText, pamPattern, allowAmbiguous) {
  if (baseText.length !== pamPattern.length) {
    return false;
  }
  for (let index = 0; index < pamPattern.length; index += 1) {
    const patternSet = IUPAC_SETS[pamPattern[index]];
    const targetSet = IUPAC_SETS[baseText[index]];
    if (!patternSet || !targetSet) {
      return false;
    }
    if (!allowAmbiguous && !EXACT_DNA.test(baseText[index])) {
      return false;
    }
    if (allowAmbiguous ? !setIntersects(patternSet, targetSet) : !patternSet.has(baseText[index])) {
      return false;
    }
  }
  return true;
}

function gcPercent(sequence) {
  const gc = Array.from(sequence).filter((base) => base === "G" || base === "C").length;
  return (gc / Math.max(1, sequence.length)) * 100;
}

function longestHomopolymer(sequence) {
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

function scoreGuide(guideDna, gc, options) {
  const flags = [];
  let score = 100;
  if (gc < 40 || gc > 60) {
    flags.push("GC outside preferred 40-60%");
    score -= Math.min(35, Math.abs(gc - 50) * 1.2);
  }
  const homopolymer = longestHomopolymer(guideDna);
  if (homopolymer >= 4) {
    flags.push(`homopolymer run ${homopolymer}`);
    score -= (homopolymer - 3) * 8;
  }
  if (/T{4,}/.test(guideDna)) {
    flags.push("contains TTTT run");
    score -= 18;
  }
  if (!EXACT_DNA.test(guideDna)) {
    flags.push("ambiguous guide bases");
    score -= 30;
  }
  if (options.preferFivePrimeG && guideDna[0] !== "G") {
    flags.push("does not start with G for U6-style expression");
    score -= 6;
  }
  return {
    score: round(Math.max(0, Math.min(100, score)), 1),
    flags
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

function mapWorkingPositionToOriginal(strand, sequenceLength, position) {
  if (!Number.isFinite(position)) {
    return "";
  }
  return strand === "+" ? position : sequenceLength - position + 1;
}

function makeEmptyReferenceStats() {
  return {
    reference_match_count: "",
    exact_reference_match_count: "",
    near_reference_match_count: "",
    reference_matches_beyond_first_exact: "",
    best_reference_mismatches: ""
  };
}

function makeRawCandidate(record, workingSequence, strand, workingGuideStart, options, skipped) {
  const model = options.pamModel;
  const pamLength = model.pamPattern.length;
  const guideLength = model.guideLength;
  const guideStart = model.pamSide === "5prime" ? workingGuideStart + pamLength : workingGuideStart;
  const guideEnd = guideStart + guideLength - 1;
  const pamStart = model.pamSide === "5prime" ? workingGuideStart : guideEnd + 1;
  const pamEnd = pamStart + pamLength - 1;
  const guideDna = workingSequence.slice(guideStart - 1, guideEnd);
  const pamSequence = workingSequence.slice(pamStart - 1, pamEnd);
  if (guideDna.length !== guideLength || pamSequence.length !== pamLength) {
    return null;
  }
  if (!options.allowAmbiguousCandidates && (!EXACT_DNA.test(guideDna) || !EXACT_DNA.test(pamSequence))) {
    skipped.ambiguous += 1;
    return null;
  }
  if (!matchesPam(pamSequence, model.pamPattern, options.allowAmbiguousCandidates)) {
    return null;
  }
  const gc = gcPercent(guideDna);
  if (gc < options.minGcPercent || gc > options.maxGcPercent) {
    skipped.gc += 1;
    return null;
  }
  if (options.requireFivePrimeG && guideDna[0] !== "G") {
    skipped.fivePrimeG += 1;
    return null;
  }
  const originalGuide = mapWorkingRangeToOriginal(strand, record.sequence.length, guideStart, guideEnd);
  const originalPam = mapWorkingRangeToOriginal(strand, record.sequence.length, pamStart, pamEnd);
  const cutWorking = Number.isFinite(model.cutOffsetFromPamStart)
    ? pamStart + model.cutOffsetFromPamStart
    : NaN;
  const review = scoreGuide(guideDna, gc, options);
  if (model.label.includes("relaxed") || model.label.includes("alternate")) {
    review.flags.push("non-canonical or relaxed PAM mode");
    review.score = round(Math.max(0, review.score - 8), 1);
  }
  const context = makeSequenceContext(record.sequence, originalGuide.start, originalGuide.end, options.contextBases);
  return {
    rank: 0,
    candidate_id: "",
    record: record.title,
    nuclease: model.label,
    strand,
    guide_start: originalGuide.start,
    guide_end: originalGuide.end,
    pam_start: originalPam.start,
    pam_end: originalPam.end,
    cut_position: mapWorkingPositionToOriginal(strand, record.sequence.length, cutWorking),
    guide_dna: guideDna,
    guide_rna: guideDna.replaceAll("T", "U"),
    pam_sequence: pamSequence,
    gc_percent: round(gc),
    review_score: review.score,
    flags: review.flags.join("; "),
    guide_feature_count: "",
    guide_features: "",
    cut_features: "",
    nearest_feature: "",
    ...makeEmptyReferenceStats(),
    left_context: context.left_context,
    matched_text: context.matched_text,
    right_context: context.right_context,
    context_sequence: context.context_sequence
  };
}

function splitCrisprInput(input, separator = CRISPR_REFERENCE_SEPARATOR) {
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

function normalizeRecords(input, warnings, label = "Input") {
  if (/^(LOCUS|ID)\s/m.test(String(input ?? "")) || /\nFEATURES\s+Location\/Qualifiers\n/.test(String(input ?? ""))) {
    const flatfile = parseFlatfileRecords(input);
    const flatfileRecords = flatfile.records
      .filter((record) => record.sequence && record.molecule !== "protein")
      .map((record, index) => {
        const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
        if (cleaned.removedCount > 0) {
          warnings.push(`${label} ${record.accession || `Record ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
        }
        return {
          title: record.accession || record.title || `Record ${index + 1}`,
          sequence: cleaned.sequence.replaceAll("U", "T"),
          topology: record.topology || "",
          sourceFormat: record.format,
          features: normalizeCrisprFeatureContext(record)
        };
      })
      .filter((record) => record.sequence.length > 0);
    if (flatfileRecords.length > 0) {
      warnings.push(...flatfile.warnings);
      const featureCount = flatfileRecords.reduce((sum, record) => sum + record.features.length, 0);
      if (featureCount > 0) {
        warnings.push(`${label}: parsed ${featureCount.toLocaleString()} annotated feature(s) from flatfile target record(s) for guide context.`);
      }
      return {
        records: flatfileRecords,
        charactersRemoved: 0
      };
    }
  }
  let charactersRemoved = 0;
  const records = parseSequenceInput(input, "dna-rna").map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    charactersRemoved += cleaned.removedCount;
    if (cleaned.removedCount > 0) {
      warnings.push(`${label} ${record.title || `Record ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    return {
      title: record.title || `Record ${index + 1}`,
      sequence: cleaned.sequence.replaceAll("U", "T"),
      features: []
    };
  }).filter((record) => record.sequence.length > 0);
  return { records, charactersRemoved };
}

function compactFeatureText(text, maxLength = 48) {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 3)}...` : cleaned;
}

function crisprFeatureLabel(feature) {
  const primary = feature.gene || feature.locus_tag || feature.protein_id || "";
  const product = compactFeatureText(feature.product || "");
  if (primary && product && primary !== product) {
    return `${feature.feature} ${primary} (${product})`;
  }
  if (primary) {
    return `${feature.feature} ${primary}`;
  }
  if (product) {
    return `${feature.feature} ${product}`;
  }
  return feature.feature || "feature";
}

function normalizeCrisprFeatureContext(record) {
  return (record.features ?? [])
    .filter((feature) => feature.feature !== "source" && feature.parsedLocation?.supported && feature.parsedLocation.ranges?.length)
    .map((feature) => ({
      id: feature.id,
      type: feature.feature,
      label: crisprFeatureLabel(feature),
      gene: feature.gene,
      locus_tag: feature.locus_tag,
      product: feature.product,
      strand: feature.parsedLocation.strand,
      ranges: feature.parsedLocation.ranges.map((range) => ({
        start: Math.min(range.start, range.end),
        end: Math.max(range.start, range.end),
        strand: range.strand
      }))
    }));
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function featureOverlapsInterval(feature, start, end) {
  return feature.ranges.some((range) => rangesOverlap(start, end, range.start, range.end));
}

function featureContainsPosition(feature, position) {
  return Number.isFinite(position) && feature.ranges.some((range) => position >= range.start && position <= range.end);
}

function featureDistanceToInterval(feature, start, end) {
  let best = Infinity;
  for (const range of feature.ranges) {
    if (rangesOverlap(start, end, range.start, range.end)) {
      return 0;
    }
    best = Math.min(best, Math.abs(range.start - end), Math.abs(start - range.end));
  }
  return best;
}

function formatFeatureList(features) {
  return features.length ? features.map((feature) => feature.label).join("; ") : "";
}

function annotateGuideFeatureContext(row, record) {
  const features = record.features ?? [];
  if (features.length === 0) {
    row.guide_feature_count = "";
    row.guide_features = "";
    row.cut_features = "";
    row.nearest_feature = "";
    return;
  }
  const guideStart = Math.min(row.guide_start, row.guide_end);
  const guideEnd = Math.max(row.guide_start, row.guide_end);
  const cutPosition = Number(row.cut_position);
  const guideFeatures = features.filter((feature) => featureOverlapsInterval(feature, guideStart, guideEnd));
  const cutFeatures = Number.isFinite(cutPosition)
    ? features.filter((feature) => featureContainsPosition(feature, cutPosition))
    : [];
  const nearest = [...features].sort((left, right) =>
    featureDistanceToInterval(left, guideStart, guideEnd) - featureDistanceToInterval(right, guideStart, guideEnd) ||
    left.label.localeCompare(right.label)
  )[0];
  const nearestDistance = nearest ? featureDistanceToInterval(nearest, guideStart, guideEnd) : Infinity;
  row.guide_feature_count = guideFeatures.length;
  row.guide_features = formatFeatureList(guideFeatures);
  row.cut_features = formatFeatureList(cutFeatures);
  row.nearest_feature = nearest ? `${nearest.label}${nearestDistance > 0 ? ` (${nearestDistance} bp away)` : " (overlaps guide)"}` : "";
}

function makeReferenceSite(record, workingSequence, strand, workingGuideStart, options, skipped) {
  const recordLength = record.length ?? record.sequence.length;
  const workingOffset = record.workingStartOffset ?? 0;
  const model = options.pamModel;
  const pamLength = model.pamPattern.length;
  const guideLength = model.guideLength;
  const guideStart = model.pamSide === "5prime" ? workingGuideStart + pamLength : workingGuideStart;
  const guideEnd = guideStart + guideLength - 1;
  const pamStart = model.pamSide === "5prime" ? workingGuideStart : guideEnd + 1;
  const pamEnd = pamStart + pamLength - 1;
  const guideDna = workingSequence.slice(guideStart - 1, guideEnd);
  const pamSequence = workingSequence.slice(pamStart - 1, pamEnd);
  if (guideDna.length !== guideLength || pamSequence.length !== pamLength) {
    return null;
  }
  if (!options.allowAmbiguousCandidates && (!EXACT_DNA.test(guideDna) || !EXACT_DNA.test(pamSequence))) {
    skipped.ambiguous += 1;
    return null;
  }
  if (!matchesPam(pamSequence, model.pamPattern, options.allowAmbiguousCandidates)) {
    return null;
  }
  const originalGuide = mapWorkingRangeToOriginal(strand, recordLength, workingOffset + guideStart, workingOffset + guideEnd);
  const originalPam = mapWorkingRangeToOriginal(strand, recordLength, workingOffset + pamStart, workingOffset + pamEnd);
  const context = typeof record.makeContext === "function"
    ? record.makeContext(originalGuide.start, originalGuide.end, options.contextBases)
    : makeSequenceContext(record.sequence, originalGuide.start, originalGuide.end, options.contextBases);
  return {
    record: record.title,
    strand,
    guide_start: originalGuide.start,
    guide_end: originalGuide.end,
    pam_start: originalPam.start,
    pam_end: originalPam.end,
    guide_dna: guideDna,
    pam_sequence: pamSequence,
    left_context: context.left_context,
    matched_text: context.matched_text,
    right_context: context.right_context,
    context_sequence: context.context_sequence
  };
}

async function collectReferenceSites(referenceRecords, options, warnings, context) {
  const sites = [];
  let basesProcessed = 0;
  for (const [recordIndex, record] of referenceRecords.entries()) {
    context.reportProgress?.({ phase: "scanning-reference", detail: record.title, progress: 0.75 + (recordIndex / Math.max(1, referenceRecords.length)) * 0.1 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    basesProcessed += record.sequence.length;
    if (record.sequence.length > options.maxReferenceRecordLength) {
      warnings.push(`${record.title}: skipped as reference because ${record.sequence.length} nt exceeds the current reference-hit counting limit of ${options.maxReferenceRecordLength} nt.`);
      continue;
    }
    const skipped = { ambiguous: 0 };
    for (const strand of ["+", "-"]) {
      const workingSequence = strand === "+" ? record.sequence : reverseComplementDna(record.sequence);
      const totalLength = options.pamModel.guideLength + options.pamModel.pamPattern.length;
      for (let workingStart = 1; workingStart <= workingSequence.length - totalLength + 1; workingStart += 1) {
        if (workingStart % 1000 === 0) {
          context.throwIfCancelled?.();
          await context.yieldIfNeeded?.();
        }
        const site = makeReferenceSite(record, workingSequence, strand, workingStart, options, skipped);
        if (site) {
          sites.push(site);
        }
      }
    }
    if (skipped.ambiguous > 0) {
      warnings.push(`${record.title}: skipped ${skipped.ambiguous} reference guide/PAM window(s) with ambiguous bases.`);
    }
  }
  return { sites, basesProcessed };
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

function makeFetchedSequenceContext(sequence, fetchedStart, start, end, contextBases) {
  const normalizedStart = Math.min(start, end);
  const normalizedEnd = Math.max(start, end);
  const contextStart = Math.max(1, normalizedStart - contextBases);
  const contextEnd = normalizedEnd + contextBases;
  const sliceStart = Math.max(0, contextStart - fetchedStart);
  const sliceEnd = Math.min(sequence.length, contextEnd - fetchedStart + 1);
  const contextSequence = sequence.slice(sliceStart, sliceEnd);
  const leftLength = Math.max(0, normalizedStart - contextStart);
  const matchedLength = Math.max(0, normalizedEnd - normalizedStart + 1);
  return {
    left_context: contextSequence.slice(0, leftLength).toLowerCase(),
    matched_text: contextSequence.slice(leftLength, leftLength + matchedLength).toUpperCase(),
    right_context: contextSequence.slice(leftLength + matchedLength).toLowerCase(),
    context_sequence: contextSequence.slice(0, leftLength).toLowerCase() +
      contextSequence.slice(leftLength, leftLength + matchedLength).toUpperCase() +
      contextSequence.slice(leftLength + matchedLength).toLowerCase()
  };
}

function makeIndexedReferenceChunkRecord({ title, length, directSequence, fetchedStart, workingStartOffset }) {
  return {
    title,
    sequence: directSequence,
    length,
    workingStartOffset,
    makeContext: (start, end, contextBases) =>
      makeFetchedSequenceContext(directSequence, fetchedStart, start, end, contextBases)
  };
}

async function scanIndexedReferenceChunk({
  sites,
  reader,
  seqid,
  length,
  segmentStart,
  segmentEnd,
  strand,
  totalWindowLength,
  options,
  skipped,
  context
}) {
  const contextBases = options.contextBases;
  let fetchedStart;
  let fetchedEnd;
  let workingStartOffset;
  let workingSequence;
  let directSequence;
  let localScanStart;
  let localScanEnd;

  if (strand === "+") {
    fetchedStart = Math.max(1, segmentStart - contextBases);
    fetchedEnd = Math.min(length, segmentEnd + totalWindowLength - 1 + contextBases);
    directSequence = (await reader.getSequence(seqid, fetchedStart - 1, fetchedEnd, {
      signal: context.signal
    }) || "").toUpperCase();
    workingSequence = directSequence;
    workingStartOffset = fetchedStart - 1;
    localScanStart = segmentStart - fetchedStart + 1;
    localScanEnd = segmentEnd - fetchedStart + 1;
  } else {
    const fetchedWorkStart = Math.max(1, segmentStart - contextBases);
    const fetchedWorkEnd = Math.min(length, segmentEnd + totalWindowLength - 1 + contextBases);
    fetchedStart = length - fetchedWorkEnd + 1;
    fetchedEnd = length - fetchedWorkStart + 1;
    directSequence = (await reader.getSequence(seqid, fetchedStart - 1, fetchedEnd, {
      signal: context.signal
    }) || "").toUpperCase();
    workingSequence = reverseComplementDna(directSequence);
    workingStartOffset = fetchedWorkStart - 1;
    localScanStart = segmentStart - fetchedWorkStart + 1;
    localScanEnd = segmentEnd - fetchedWorkStart + 1;
  }

  const record = makeIndexedReferenceChunkRecord({
    title: seqid,
    length,
    directSequence,
    fetchedStart,
    workingStartOffset
  });
  const maxLocalStart = Math.min(localScanEnd, workingSequence.length - totalWindowLength + 1);
  for (let workingStart = localScanStart; workingStart <= maxLocalStart; workingStart += 1) {
    if (workingStart % 1000 === 0) {
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
    }
    const site = makeReferenceSite(record, workingSequence, strand, workingStart, options, skipped);
    if (site) {
      sites.push(site);
    }
  }
}

async function collectIndexedReferenceSites(options, warnings, context) {
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
    warnings.push(`Indexed reference hit counting was skipped because the indexed FASTA contains ${totalIndexedBases.toLocaleString()} bp, above the current limit of ${options.maxIndexedReferenceBases.toLocaleString()} bp. Raise the indexed reference limit only after confirming the run is appropriate.`);
    return {
      sites: [],
      basesProcessed: 0,
      indexedSequences,
      skipped: true,
      skipReason: "indexed reference exceeds limit"
    };
  }

  const sites = [];
  let basesProcessed = 0;
  const reader = makeIndexedFastaReader(indexedInput);
  const readerWarningStart = reader.warnings?.length ?? 0;
  if (readerWarningStart > 0) {
    warnings.push(...reader.warnings);
  }
  const chunkSize = options.indexedReferenceChunkSize;
  const totalWindowLength = options.pamModel.guideLength + options.pamModel.pamPattern.length;
  for (const [recordIndex, record] of indexedSequences.entries()) {
    basesProcessed += record.length;
    const skipped = { ambiguous: 0 };
    for (let segmentStart = 1; segmentStart <= record.length; segmentStart += chunkSize) {
      const segmentEnd = Math.min(record.length, segmentStart + chunkSize - 1);
      const progress = 0.72 + ((recordIndex + (segmentEnd / Math.max(1, record.length))) / Math.max(1, indexedSequences.length)) * 0.13;
      context.reportProgress?.({
        phase: "scanning-indexed-reference",
        detail: `${record.name}:${segmentStart}-${segmentEnd}`,
        progress
      });
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
      for (const strand of ["+", "-"]) {
        await scanIndexedReferenceChunk({
          sites,
          reader,
          seqid: record.name,
          length: record.length,
          segmentStart,
          segmentEnd,
          strand,
          totalWindowLength,
          options,
          skipped,
          context
        });
      }
    }
    if (skipped.ambiguous > 0) {
      warnings.push(`${record.name}: skipped ${skipped.ambiguous} indexed reference guide/PAM window(s) with ambiguous bases.`);
    }
  }
  if ((reader.warnings?.length ?? 0) > readerWarningStart) {
    warnings.push(...reader.warnings.slice(readerWarningStart));
  }
  return {
    sites,
    basesProcessed,
    indexedSequences,
    skipped: false,
    isBgzip: indexedInput.isBgzip
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

function buildReferenceSiteSeedIndex(referenceSites, options) {
  const guideLength = options.pamModel.guideLength;
  if (options.allowAmbiguousCandidates || options.maxOffTargetMismatches >= guideLength) {
    return null;
  }
  const segments = makeMismatchSeedSegments(guideLength, options.maxOffTargetMismatches);
  if (segments.length === 0) {
    return null;
  }
  const index = new Map();
  for (const site of referenceSites) {
    if (!EXACT_DNA.test(site.guide_dna)) {
      return null;
    }
    for (const segment of segments) {
      const seed = site.guide_dna.slice(segment.start, segment.end);
      const key = `${segment.index}:${seed}`;
      const bucket = index.get(key) ?? [];
      bucket.push(site);
      index.set(key, bucket);
    }
  }
  return { segments, index };
}

function getIndexedCandidateReferenceSites(row, referenceSites, siteIndex) {
  if (!siteIndex || !EXACT_DNA.test(row.guide_dna)) {
    return referenceSites;
  }
  const candidates = [];
  const seen = new Set();
  for (const segment of siteIndex.segments) {
    const seed = row.guide_dna.slice(segment.start, segment.end);
    const bucket = siteIndex.index.get(`${segment.index}:${seed}`) ?? [];
    for (const site of bucket) {
      const key = `${site.record}\t${site.strand}\t${site.guide_start}\t${site.guide_end}\t${site.pam_start}\t${site.pam_end}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(site);
      }
    }
  }
  return candidates;
}

function countGuideMismatches(guideDna, referenceGuideDna, allowAmbiguous) {
  if (guideDna.length !== referenceGuideDna.length) {
    return null;
  }
  let count = 0;
  const mismatches = [];
  for (let index = 0; index < guideDna.length; index += 1) {
    const guideBase = guideDna[index];
    const referenceBase = referenceGuideDna[index];
    const guideSet = IUPAC_SETS[guideBase];
    const referenceSet = IUPAC_SETS[referenceBase];
    if (!guideSet || !referenceSet) {
      return null;
    }
    if (!allowAmbiguous && (!EXACT_DNA.test(guideBase) || !EXACT_DNA.test(referenceBase))) {
      return null;
    }
    const matches = allowAmbiguous ? setIntersects(guideSet, referenceSet) : guideBase === referenceBase;
    if (!matches) {
      count += 1;
      mismatches.push(`${index + 1}:${guideBase}>${referenceBase}`);
    }
  }
  return {
    count,
    mismatches: mismatches.join(", ") || "none"
  };
}

async function screenReferenceMatches(guideRows, referenceSites, options, context) {
  const statsByRow = new Map();
  const matchesByRow = new Map();
  const siteIndex = buildReferenceSiteSeedIndex(referenceSites, options);
  let candidateComparisons = 0;
  for (const row of guideRows) {
    statsByRow.set(row, {
      total: 0,
      exact: 0,
      near: 0,
      best: ""
    });
    matchesByRow.set(row, []);
  }
  for (const [rowIndex, row] of guideRows.entries()) {
    context.reportProgress?.({ phase: "checking-reference-matches", detail: row.candidate_id || `candidate ${rowIndex + 1}`, progress: 0.85 + (rowIndex / Math.max(1, guideRows.length)) * 0.05 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    const candidateSites = getIndexedCandidateReferenceSites(row, referenceSites, siteIndex);
    for (const [candidateIndex, site] of candidateSites.entries()) {
      if (candidateIndex % 2000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      candidateComparisons += 1;
      const mismatch = countGuideMismatches(row.guide_dna, site.guide_dna, options.allowAmbiguousCandidates);
      if (!mismatch || mismatch.count > options.maxOffTargetMismatches) {
        continue;
      }
      const stats = statsByRow.get(row);
      stats.total += 1;
      if (mismatch.count === 0) {
        stats.exact += 1;
      } else {
        stats.near += 1;
      }
      stats.best = stats.best === "" ? mismatch.count : Math.min(stats.best, mismatch.count);
      const matches = matchesByRow.get(row);
      if (matches.length < options.maxOffTargetMatchesPerGuide) {
        matches.push({
          site,
          mismatch_count: mismatch.count,
          mismatches: mismatch.mismatches
        });
      }
    }
  }
  for (const row of guideRows) {
    const stats = statsByRow.get(row);
    row.reference_match_count = stats.total;
    row.exact_reference_match_count = stats.exact;
    row.near_reference_match_count = stats.near;
    row.reference_matches_beyond_first_exact = stats.exact > 0 ? Math.max(0, stats.total - 1) : stats.total;
    row.best_reference_mismatches = stats.best;
  }
  return {
    statsByRow,
    matchesByRow,
    candidateComparisons,
    indexStrategy: siteIndex ? `seed-index ${siteIndex.segments.length} seed(s)` : "full reference-site scan"
  };
}

function materializeReferenceMatchRows(guideRows, referenceScreen, options) {
  const rows = [];
  let omitted = 0;
  for (const guideRow of guideRows) {
    const matches = [...(referenceScreen.matchesByRow.get(guideRow) ?? [])].sort((left, right) =>
      left.mismatch_count - right.mismatch_count ||
      left.site.record.localeCompare(right.site.record) ||
      left.site.guide_start - right.site.guide_start ||
      left.site.strand.localeCompare(right.site.strand)
    );
    for (const match of matches) {
      if (rows.length >= options.maxOffTargetRows) {
        omitted += 1;
        continue;
      }
      rows.push({
        guide_id: guideRow.candidate_id,
        guide_record: guideRow.record,
        guide_strand: guideRow.strand,
        guide_start: guideRow.guide_start,
        guide_end: guideRow.guide_end,
        reference_record: match.site.record,
        reference_strand: match.site.strand,
        reference_guide_start: match.site.guide_start,
        reference_guide_end: match.site.guide_end,
        reference_pam_start: match.site.pam_start,
        reference_pam_end: match.site.pam_end,
        mismatch_count: match.mismatch_count,
        mismatches: match.mismatches,
        relation: match.mismatch_count === 0 ? "exact reference match" : "near reference match",
        guide_dna: guideRow.guide_dna,
        reference_guide_dna: match.site.guide_dna,
        reference_pam_sequence: match.site.pam_sequence,
        left_context: match.site.left_context,
        matched_text: match.site.matched_text,
        right_context: match.site.right_context,
        context_sequence: match.site.context_sequence
      });
    }
    const stats = referenceScreen.statsByRow.get(guideRow);
    omitted += Math.max(0, (stats?.total ?? 0) - matches.length);
  }
  return { rows, omitted };
}

export async function designCrisprGuides(input, options = {}, context = {}) {
  const normalized = normalizeCrisprGuideDesignOptions(options);
  const warnings = [];
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const split = splitCrisprInput(input);
  const { records, charactersRemoved } = normalizeRecords(split.targetText, warnings, "Target");
  const useIndexedReference = normalized.referenceInputMode === "indexed" && hasIndexedReferenceOptions(options);
  const referenceWarnings = [];
  let { records: referenceRecords, charactersRemoved: referenceCharactersRemoved } = normalized.referenceInputMode === "pasted" && !useIndexedReference && split.referenceText
    ? normalizeRecords(split.referenceText, referenceWarnings, "Reference")
    : { records: [], charactersRemoved: 0 };
  warnings.push(...referenceWarnings);
  if (useIndexedReference && split.referenceText.trim()) {
    warnings.push("Indexed reference FASTA files were provided, so the optional pasted reference pane was ignored for reference hit counting.");
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
      referenceScreen: { status: "not run", referenceSites: 0, omittedRows: 0, basesProcessed: 0 },
      warnings: ["No DNA/RNA sequence input was provided."],
      charactersRemoved,
      referenceCharactersRemoved,
      annotatedFeatureCount: 0,
      options: normalized,
      basesProcessed: 0
    };
  }

  const rows = [];
  let basesProcessed = 0;
  for (const [recordIndex, record] of records.entries()) {
    context.reportProgress?.({ phase: "scanning-guides", detail: record.title, progress: 0.1 + (recordIndex / records.length) * 0.75 });
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    basesProcessed += record.sequence.length;
    if (record.sequence.length > normalized.maxRecordLength) {
      warnings.push(`${record.title}: skipped because ${record.sequence.length} nt exceeds the current CRISPR guide-design limit of ${normalized.maxRecordLength} nt.`);
      continue;
    }
    const recordRows = [];
    const skipped = { ambiguous: 0, gc: 0, fivePrimeG: 0 };
    for (const strand of ["+", "-"]) {
      const workingSequence = strand === "+" ? record.sequence : reverseComplementDna(record.sequence);
      const totalLength = normalized.pamModel.guideLength + normalized.pamModel.pamPattern.length;
      for (let workingStart = 1; workingStart <= workingSequence.length - totalLength + 1; workingStart += 1) {
        if (workingStart % 1000 === 0) {
          context.throwIfCancelled?.();
          await context.yieldIfNeeded?.();
        }
        const candidate = makeRawCandidate(record, workingSequence, strand, workingStart, normalized, skipped);
        if (candidate) {
          annotateGuideFeatureContext(candidate, record);
          recordRows.push(candidate);
        }
      }
    }
    if (skipped.ambiguous > 0) {
      warnings.push(`${record.title}: skipped ${skipped.ambiguous} candidate window(s) with ambiguous guide or PAM bases. Enable ambiguous candidates to review possible hits.`);
    }
    if (skipped.gc > 0) {
      warnings.push(`${record.title}: skipped ${skipped.gc} candidate window(s) outside the selected GC range.`);
    }
    if (skipped.fivePrimeG > 0) {
      warnings.push(`${record.title}: skipped ${skipped.fivePrimeG} candidate window(s) lacking a 5' G.`);
    }
    recordRows.sort((left, right) =>
      right.review_score - left.review_score ||
      left.record.localeCompare(right.record) ||
      left.guide_start - right.guide_start ||
      left.strand.localeCompare(right.strand)
    );
    rows.push(...recordRows.slice(0, normalized.maxCandidatesPerRecord));
  }

  rows.sort((left, right) =>
    right.review_score - left.review_score ||
    left.record.localeCompare(right.record) ||
    left.guide_start - right.guide_start ||
    left.strand.localeCompare(right.strand)
  );
  rows.forEach((row, index) => {
    row.rank = index + 1;
    row.candidate_id = `g${index + 1}`;
  });

  let referenceMatchRows = [];
  let referenceScreen = {
    status: referenceRecords.length > 0 && normalized.searchReferenceOffTargets ? "run" : "not run",
    referenceSites: 0,
    omittedRows: 0,
    basesProcessed: 0
  };
  if (referenceRecords.length > 0 && normalized.searchReferenceOffTargets && rows.length > 0) {
    const referenceScan = await collectReferenceSites(referenceRecords, normalized, warnings, context);
    referenceScreen = {
      status: "run",
      referenceSites: referenceScan.sites.length,
      omittedRows: 0,
      basesProcessed: referenceScan.basesProcessed
    };
    const referenceMatches = await screenReferenceMatches(rows, referenceScan.sites, normalized, context);
    const materialized = materializeReferenceMatchRows(rows, referenceMatches, normalized);
    referenceMatchRows = materialized.rows;
    referenceScreen.omittedRows = materialized.omitted;
    referenceScreen.indexStrategy = referenceMatches.indexStrategy;
    referenceScreen.candidateComparisons = referenceMatches.candidateComparisons;
    if (materialized.omitted > 0) {
      warnings.push(`Reference match TSV was capped; ${materialized.omitted} reference match row(s) were omitted from the materialized table. Candidate match counts still include the full reference hit count.`);
    }
  } else if (referenceRecords.length > 0 && !normalized.searchReferenceOffTargets) {
    warnings.push("Reference sequence was provided, but reference hit counting is turned off.");
  }
  if (useIndexedReference && normalized.searchReferenceOffTargets && rows.length > 0) {
    const indexedReferenceScan = await collectIndexedReferenceSites(
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
    referenceRecords = indexedReferenceScan.indexedSequences.map((record) => ({
      title: record.name,
      sequence: "",
      length: record.length,
      indexed: true
    }));
    referenceScreen = {
      status: indexedReferenceScan.skipped ? "skipped" : "run",
      referenceSites: indexedReferenceScan.sites.length,
      omittedRows: 0,
      basesProcessed: indexedReferenceScan.basesProcessed,
      source: indexedReferenceScan.isBgzip ? "indexed BGZF FASTA" : "indexed FASTA",
      skipReason: indexedReferenceScan.skipReason
    };
    if (!indexedReferenceScan.skipped) {
      const referenceMatches = await screenReferenceMatches(rows, indexedReferenceScan.sites, normalized, context);
      const materialized = materializeReferenceMatchRows(rows, referenceMatches, normalized);
      referenceMatchRows = materialized.rows;
      referenceScreen.omittedRows = materialized.omitted;
      referenceScreen.indexStrategy = `indexed ${referenceMatches.indexStrategy}`;
      referenceScreen.candidateComparisons = referenceMatches.candidateComparisons;
      if (materialized.omitted > 0) {
        warnings.push(`Indexed reference match TSV was capped; ${materialized.omitted} reference match row(s) were omitted from the materialized table. Candidate match counts still include the full indexed reference hit count.`);
      }
    }
  } else if (useIndexedReference && !normalized.searchReferenceOffTargets) {
    warnings.push("Indexed reference FASTA files were provided, but reference hit counting is turned off.");
  }

  if (rows.length === 0) {
    warnings.push("No CRISPR guide candidates matched the selected PAM, GC, ambiguity, and length settings.");
  }
  if (normalized.pamModel.label.includes("relaxed") || normalized.pamModel.label.includes("alternate")) {
    warnings.push("Relaxed or alternate PAM candidates can have lower or context-dependent activity; review externally before ordering guides.");
  }

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
    annotatedFeatureCount: records.reduce((sum, record) => sum + (record.features?.length ?? 0), 0),
    options: normalized
  };
}

function countBy(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const key = row[field] || "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

function formatCounts(counts) {
  return counts.length === 0 ? "none" : counts.map(([label, count]) => `${label}: ${count}`).join("; ");
}

export function makeCrisprGuideDesignReport(result) {
  const model = result.options.pamModel;
  const screen = result.referenceScreen ?? { status: "not run", referenceSites: 0, omittedRows: 0, basesProcessed: 0 };
  const referenceScreenText = screen.status === "run"
    ? `run against ${result.referenceRecords?.length ?? 0} reference record(s), ${screen.basesProcessed ?? 0} reference bp, ${screen.referenceSites ?? 0} PAM-compatible reference site(s)${screen.source ? ` from ${screen.source}` : ""}`
    : screen.status === "skipped"
      ? `skipped${screen.skipReason ? `: ${screen.skipReason}` : ""}`
      : "not run";
  const lines = [
    "CRISPR guide design / review",
    `Records scanned: ${result.records.length}`,
    `Bases scanned: ${result.basesProcessed ?? 0}`,
    `PAM model: ${model.label} (${model.pamPattern}; ${model.pamSide === "5prime" ? "5' PAM" : "3' PAM"})`,
    `Guide length: ${model.guideLength} nt`,
    `Candidates reported: ${result.rows.length}`,
    `Annotated target features parsed: ${(result.annotatedFeatureCount ?? 0).toLocaleString()}`,
    `Candidates by strand: ${formatCounts(countBy(result.rows, "strand"))}`,
    `Reference hit count: ${referenceScreenText}`,
    ...(screen.status === "run" ? [`Reference comparison strategy: ${screen.indexStrategy ?? "full reference-site scan"}; guide/site comparisons: ${(screen.candidateComparisons ?? 0).toLocaleString()}`] : []),
    `Reference match rows: ${result.referenceMatchRows?.length ?? 0}${screen.omittedRows ? ` shown; ${screen.omittedRows} omitted by row limits` : ""}`,
    "",
    "Top candidates"
  ];
  for (const row of result.rows.slice(0, 10)) {
    const referenceText = screen.status === "run"
      ? `; reference matches ${row.reference_match_count}; exact ${row.exact_reference_match_count}; near ${row.near_reference_match_count}`
      : "";
    const featureText = row.cut_features || row.guide_features
      ? `; features: ${row.cut_features || row.guide_features}`
      : "";
    lines.push(`- ${row.candidate_id} ${row.record} ${row.strand} ${row.guide_start}-${row.guide_end} PAM ${row.pam_sequence} score ${row.review_score}; guide ${row.guide_rna}${featureText}${referenceText}${row.flags ? `; flags: ${row.flags}` : ""}`);
  }
  if (result.rows.length === 0) {
    lines.push("- none");
  }
  lines.push(
    "",
    "Scope note:",
    "This tool performs local PAM/guide sequence review and, when a reference is supplied, counts ungapped guide+PAM matches against that reference. It does not model chromatin, delivery, guide activity beyond transparent sequence flags, or whole-genome specificity unless the user supplies the relevant local reference sequence."
  );
  return lines.join("\n") + "\n";
}

export function makeCrisprGuideDesignTsv(rows) {
  return `${exportDelimitedTable(crisprGuideDesignColumns, rows, "\t")}\n`;
}

export function makeCrisprReferenceMatchTsv(rows) {
  return `${exportDelimitedTable(crisprReferenceMatchColumns, rows, "\t")}\n`;
}

export function makeCrisprGuideFasta(rows, lineWidth = 60) {
  if (rows.length === 0) {
    return "";
  }
  return rows.map((row) =>
    formatFastaRecord(
      `${row.candidate_id}_${row.record}_${row.strand}_${row.guide_start}_${row.guide_end}_${row.nuclease.replace(/\s+/g, "_")}`,
      row.guide_rna,
      lineWidth
    ).trimEnd()
  ).join("\n") + "\n";
}

export function makeCrisprGuideContextText(rows) {
  if (rows.length === 0) {
    return "No CRISPR guide candidates matched the selected settings.\n";
  }
  return rows.map((row) => [
    `${row.candidate_id} ${row.record} ${row.strand} ${row.guide_start}-${row.guide_end}`,
    `guide RNA: ${row.guide_rna}`,
    `PAM: ${row.pam_sequence} (${row.pam_start}-${row.pam_end})`,
    `features: ${row.cut_features || row.guide_features || "none"}`,
    `nearest feature: ${row.nearest_feature || "none"}`,
    `context: ${row.context_sequence}`,
    `flags: ${row.flags || "none"}`
  ].join("\n")).join("\n\n") + "\n";
}
