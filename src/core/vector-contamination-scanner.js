import { cleanSequence, complementDnaRnaSequence, makeSequenceContext } from "./sequence.js";

export const vectorContaminationTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "query_start", label: "Query start", type: "number" },
  { id: "query_end", label: "Query end", type: "number" },
  { id: "reference_id", label: "Reference id", type: "string" },
  { id: "reference_name", label: "Reference name", type: "string" },
  { id: "reference_start", label: "Reference start", type: "number" },
  { id: "reference_end", label: "Reference end", type: "number" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "aligned_length", label: "Aligned length", type: "number" },
  { id: "percent_identity", label: "Percent identity", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "gaps", label: "Gaps", type: "number" },
  { id: "score", label: "Score", type: "number" },
  { id: "confidence", label: "Confidence", type: "string" },
  { id: "source_database", label: "Source database", type: "string" },
  { id: "source_accession", label: "Source accession", type: "string" },
  { id: "left_context", label: "Left context", type: "string" },
  { id: "matched_text", label: "Matched text", type: "string" },
  { id: "right_context", label: "Right context", type: "string" },
  { id: "context_sequence", label: "Context sequence", type: "string" }
];

const sensitivityDefaults = {
  "high-confidence": {
    minimumAlignedLength: 30,
    minimumPercentIdentity: 95
  },
  balanced: {
    minimumAlignedLength: 30,
    minimumPercentIdentity: 90
  },
  sensitive: {
    minimumAlignedLength: 16,
    minimumPercentIdentity: 85
  }
};
const matchScore = 1;
const mismatchPenalty = -5;
const xDrop = 12;
const runtimeKmerMaps = new WeakMap();

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

function getThresholds(options = {}) {
  const preset = sensitivityDefaults[options.sensitivity] ?? sensitivityDefaults.balanced;
  return {
    minimumAlignedLength: Math.max(1, Number(options.minimumAlignedLength) || preset.minimumAlignedLength),
    minimumPercentIdentity: Math.max(0, Math.min(100, Number(options.minimumPercentIdentity) || preset.minimumPercentIdentity)),
    maxHitsPerRecord: Math.max(1, Number(options.maxHitsPerRecord) || 50)
  };
}

function makeReferenceLookup(records = []) {
  return new Map(records.map((record) => [record.id, record]));
}

export function buildVectorContaminationKmerMap(records = [], kmerLength = 11) {
  const kmers = {};
  for (const record of records) {
    for (let index = 0; index <= record.sequence.length - kmerLength; index += 1) {
      const kmer = record.sequence.slice(index, index + kmerLength);
      if (!/^[ACGT]+$/.test(kmer)) {
        continue;
      }
      kmers[kmer] ??= [];
      kmers[kmer].push({
        recordId: record.id,
        position: index + 1
      });
    }
  }
  return kmers;
}

function baseScore(left, right) {
  return left === right ? matchScore : mismatchPenalty;
}

function extendLeft(querySequence, queryIndex, referenceSequence, referenceIndex) {
  let queryStart = queryIndex;
  let referenceStart = referenceIndex;
  let currentScore = 0;
  let bestScore = 0;
  let bestQueryStart = queryStart;
  let bestReferenceStart = referenceStart;

  while (queryStart > 0 && referenceStart > 0) {
    queryStart -= 1;
    referenceStart -= 1;
    currentScore += baseScore(querySequence[queryStart], referenceSequence[referenceStart]);
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestQueryStart = queryStart;
      bestReferenceStart = referenceStart;
    }
    if (bestScore - currentScore > xDrop) {
      break;
    }
  }

  return {
    queryStart: bestQueryStart,
    referenceStart: bestReferenceStart
  };
}

function extendRight(querySequence, queryEnd, referenceSequence, referenceEnd) {
  let nextQuery = queryEnd + 1;
  let nextReference = referenceEnd + 1;
  let currentScore = 0;
  let bestScore = 0;
  let bestQueryEnd = queryEnd;
  let bestReferenceEnd = referenceEnd;

  while (nextQuery < querySequence.length && nextReference < referenceSequence.length) {
    currentScore += baseScore(querySequence[nextQuery], referenceSequence[nextReference]);
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestQueryEnd = nextQuery;
      bestReferenceEnd = nextReference;
    }
    if (bestScore - currentScore > xDrop) {
      break;
    }
    nextQuery += 1;
    nextReference += 1;
  }

  return {
    queryEnd: bestQueryEnd,
    referenceEnd: bestReferenceEnd
  };
}

function countMismatches(querySequence, referenceSequence, queryStart, referenceStart, length) {
  let mismatches = 0;
  for (let index = 0; index < length; index += 1) {
    if (querySequence[queryStart + index] !== referenceSequence[referenceStart + index]) {
      mismatches += 1;
    }
  }
  return mismatches;
}

function extendUngappedSeed(querySequence, queryIndex, referenceSequence, referenceIndex, seedLength) {
  const left = extendLeft(querySequence, queryIndex, referenceSequence, referenceIndex);
  const right = extendRight(
    querySequence,
    queryIndex + seedLength - 1,
    referenceSequence,
    referenceIndex + seedLength - 1
  );
  const alignedLength = right.queryEnd - left.queryStart + 1;
  const mismatches = countMismatches(
    querySequence,
    referenceSequence,
    left.queryStart,
    left.referenceStart,
    alignedLength
  );

  return {
    queryStart: left.queryStart,
    queryEnd: right.queryEnd,
    referenceStart: left.referenceStart,
    referenceEnd: right.referenceEnd,
    alignedLength,
    mismatches,
    gaps: 0,
    percentIdentity: Number((((alignedLength - mismatches) / alignedLength) * 100).toFixed(2))
  };
}

function classifyConfidence(length, percentIdentity) {
  if (length >= 30 && percentIdentity >= 95) {
    return "strong";
  }
  if (length >= 16 && percentIdentity >= 90) {
    return "moderate";
  }
  return "low";
}

function makeRow(recordTitle, queryLength, originalSequence, orientedHit, strand, referenceRecord) {
  const queryStart = orientedHit.queryStart + 1;
  const queryEnd = orientedHit.queryEnd + 1;
  const originalStart = strand === "+" ? queryStart : queryLength - queryEnd + 1;
  const originalEnd = strand === "+" ? queryEnd : queryLength - queryStart + 1;
  const context = makeSequenceContext(originalSequence, originalStart, originalEnd);

  return {
    record: recordTitle,
    query_start: originalStart,
    query_end: originalEnd,
    reference_id: referenceRecord.id,
    reference_name: referenceRecord.name ?? referenceRecord.id,
    reference_start: orientedHit.referenceStart + 1,
    reference_end: orientedHit.referenceEnd + 1,
    strand,
    aligned_length: orientedHit.alignedLength,
    percent_identity: orientedHit.percentIdentity,
    mismatches: orientedHit.mismatches,
    gaps: orientedHit.gaps,
    score: orientedHit.alignedLength - orientedHit.mismatches * 5 - orientedHit.gaps,
    confidence: classifyConfidence(orientedHit.alignedLength, orientedHit.percentIdentity),
    source_database: referenceRecord.sourceDatabase ?? "",
    source_accession: referenceRecord.sourceAccession ?? "",
    ...context
  };
}

function rowKey(row) {
  return [
    row.record,
    row.reference_id,
    row.strand,
    row.query_start,
    row.query_end,
    row.reference_start,
    row.reference_end
  ].join("\t");
}

function rowOverlap(left, right) {
  return Math.max(0, Math.min(left.query_end, right.query_end) - Math.max(left.query_start, right.query_start) + 1);
}

function rowsRepresentSameHit(left, right) {
  if (left.record !== right.record || left.reference_id !== right.reference_id || left.strand !== right.strand) {
    return false;
  }
  const overlap = rowOverlap(left, right);
  if (overlap <= 0) {
    return false;
  }
  const shorterLength = Math.min(left.aligned_length, right.aligned_length);
  return overlap / Math.max(1, shorterLength) >= 0.8;
}

function deduplicateMergeAndSortRows(rows, maxHitsPerRecord) {
  const byKey = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    const current = byKey.get(key);
    if (!current || row.score > current.score) {
      byKey.set(key, row);
    }
  }

  const sortedCandidates = [...byKey.values()].sort(
    (left, right) =>
      right.score - left.score ||
      right.aligned_length - left.aligned_length ||
      left.record.localeCompare(right.record) ||
      left.query_start - right.query_start ||
      left.reference_id.localeCompare(right.reference_id)
  );
  const merged = [];
  for (const row of sortedCandidates) {
    if (merged.some((kept) => rowsRepresentSameHit(kept, row))) {
      continue;
    }
    merged.push(row);
  }

  const sorted = merged
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.record.localeCompare(right.record) ||
        left.query_start - right.query_start ||
        left.reference_id.localeCompare(right.reference_id)
    );

  return {
    rows: sorted.slice(0, maxHitsPerRecord),
    totalCandidateRows: rows.length,
    totalMergedRows: sorted.length,
    hitsOmitted: Math.max(0, sorted.length - maxHitsPerRecord)
  };
}

function getKmerMap(referenceIndex) {
  if (referenceIndex.kmers) {
    return referenceIndex.kmers;
  }
  if (!runtimeKmerMaps.has(referenceIndex)) {
    runtimeKmerMaps.set(
      referenceIndex,
      buildVectorContaminationKmerMap(referenceIndex.records, referenceIndex.kmerLength)
    );
  }
  return runtimeKmerMaps.get(referenceIndex);
}

function scanOrientedSequence(recordTitle, sequence, originalSequence, strand, referenceIndex, referenceLookup, thresholds, context = {}) {
  const rows = [];
  const kmerLength = referenceIndex.kmerLength;
  if (!Number.isInteger(kmerLength) || kmerLength <= 0 || sequence.length < kmerLength) {
    return rows;
  }
  const kmerMap = getKmerMap(referenceIndex);

  for (let queryIndex = 0; queryIndex <= sequence.length - kmerLength; queryIndex += 1) {
    if (queryIndex % 250 === 0) {
      context.throwIfCancelled?.();
    }
    const kmer = sequence.slice(queryIndex, queryIndex + kmerLength);
    if (!/^[ACGT]+$/.test(kmer)) {
      continue;
    }
    const seeds = kmerMap[kmer] ?? [];
    for (const [seedIndex, seed] of seeds.entries()) {
      if (seedIndex > 0 && seedIndex % 500 === 0) {
        context.throwIfCancelled?.();
      }
      const referenceRecord = referenceLookup.get(seed.recordId);
      if (!referenceRecord) {
        continue;
      }
      const hit = extendUngappedSeed(
        sequence,
        queryIndex,
        referenceRecord.sequence,
        Math.max(0, Number(seed.position) - 1),
        kmerLength
      );
      if (
        hit.alignedLength >= thresholds.minimumAlignedLength &&
        hit.percentIdentity >= thresholds.minimumPercentIdentity
      ) {
        rows.push(makeRow(recordTitle, sequence.length, originalSequence, hit, strand, referenceRecord));
      }
    }
  }

  return rows;
}

export function scanVectorContaminationRecord(record, referenceIndex, options = {}, context = {}) {
  const title = record.title ?? "sequence";
  const cleaned = cleanSequence(record.sequence ?? "", {
    alphabet: "dna-rna",
    preserveCase: false,
    keepGaps: false
  });
  const warnings = [];
  if (cleaned.removedCount > 0) {
    warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
  }
  if (cleaned.sequence.length === 0) {
    warnings.push(`${title}: no DNA/RNA sequence characters were found.`);
    return {
      rows: [],
      warnings,
      charactersRemoved: cleaned.removedCount,
      sequenceLength: 0
    };
  }

  const referenceLookup = makeReferenceLookup(referenceIndex.records);
  if (referenceLookup.size === 0) {
    warnings.push("No vector contamination reference records were available.");
    return {
      rows: [],
      warnings,
      charactersRemoved: cleaned.removedCount,
      sequenceLength: cleaned.sequence.length
    };
  }

  const thresholds = getThresholds(options);
  const scanBothStrands = options.strand !== "forward";
  const rows = [
    ...scanOrientedSequence(title, cleaned.sequence, cleaned.sequence, "+", referenceIndex, referenceLookup, thresholds, context),
    ...(scanBothStrands
      ? scanOrientedSequence(title, reverseComplement(cleaned.sequence), cleaned.sequence, "-", referenceIndex, referenceLookup, thresholds, context)
      : [])
  ];

  const summarized = deduplicateMergeAndSortRows(rows, thresholds.maxHitsPerRecord);

  return {
    ...summarized,
    warnings,
    charactersRemoved: cleaned.removedCount,
    sequenceLength: cleaned.sequence.length,
    cleanedSequence: cleaned.sequence
  };
}
