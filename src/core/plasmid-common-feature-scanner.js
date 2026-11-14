import { normalizePlasmidFeatureOptions } from "./plasmid-common-feature-options.js";
import { complementDnaRnaSequence } from "./sequence.js";

export const plasmidCommonFeatureMatchColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "record_index", label: "Record number", type: "number" },
  { id: "feature_id", label: "Feature ID", type: "string" },
  { id: "feature_name", label: "Feature", type: "string" },
  { id: "feature_type", label: "Type", type: "string" },
  { id: "strand", label: "Strand", type: "string" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "mismatches", label: "Mismatches", type: "number" },
  { id: "identity_percent", label: "Identity %", type: "number" },
  { id: "score", label: "Score", type: "number" },
  { id: "reference_length", label: "Reference length", type: "number" },
  { id: "reference_source", label: "Reference source", type: "string" },
  { id: "matched_sequence", label: "Matched sequence", type: "string" }
];

function normalizeDna(sequence) {
  return String(sequence ?? "").toUpperCase().replace(/U/g, "T").replace(/[^ACGTRYSWKMBDHVNX]/g, "");
}

export const PLASMID_FEATURE_LIMITS = Object.freeze({
  maxInputCharacters: 5_000_000,
  maxComparisons: 500_000_000,
  maxHits: 100_000,
  maxRetainedCharacters: 26_214_400,
  maxOutputCharacters: 26_214_400
});

// Full-length ungapped Hamming comparison: identity = equal positions / length * 100.
// Reference sequences/provenance: https://www.addgene.org/mol-bio-reference/sequencing-primers/
// Score is an SMS3 ordering heuristic (identity minus mismatches), not a calibrated probability.
function hammingMismatches(sequence, offset, pattern, maximum, budget) {
  let mismatches = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    if (++budget.comparisons > PLASMID_FEATURE_LIMITS.maxComparisons) {
      throw new Error("Plasmid scan exceeds the 500,000,000-symbol comparison limit. Use fewer sequences or signatures.");
    }
    if (sequence[offset + index] !== pattern[index] && ++mismatches > maximum) break;
  }
  return mismatches;
}

function candidateOrientations(reference) {
  const sequence = normalizeDna(reference.sequence);
  const reverse = Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
  return [
    { strand: "+", sequence },
    ...(reverse !== sequence ? [{ strand: "-", sequence: reverse }] : [])
  ];
}

export async function scanPlasmidCommonFeatures(records, references, options = {}, context = {}) {
  const { maxMismatches, minIdentityPercent: minIdentity } = normalizePlasmidFeatureOptions(options);
  const rows = [];
  const budget = { comparisons: 0, retained: 0 };
  for (const [recordIndex, record] of records.entries()) {
    context.throwIfCancelled?.();
    const sequence = normalizeDna(record.sequence);
    if (!sequence) {
      continue;
    }
    for (const reference of references) {
      const orientations = candidateOrientations(reference);
      for (const oriented of orientations) {
        const pattern = oriented.sequence;
        if (!pattern || pattern.length > sequence.length) {
          continue;
        }
        for (let start = 0; start <= sequence.length - pattern.length; start += 1) {
          if ((start & 8191) === 0) {
            context.throwIfCancelled?.();
            await context.yieldIfNeeded?.();
          }
          const mismatches = hammingMismatches(sequence, start, pattern, maxMismatches, budget);
          if (mismatches > maxMismatches) {
            continue;
          }
          const identity = ((pattern.length - mismatches) / pattern.length) * 100;
          if (identity < minIdentity) {
            continue;
          }
          if (rows.length >= PLASMID_FEATURE_LIMITS.maxHits) {
            throw new Error("Plasmid scan exceeds the 100,000-hit limit. Use fewer sequences or stricter matching options.");
          }
          // Bound retained labels and sequence before allocating the next row.
          budget.retained += String(record.title ?? "").length + pattern.length +
            String(reference.id ?? "").length + String(reference.name ?? "").length +
            String(reference.type ?? "").length + String(reference.source?.name ?? "").length + 256;
          if (budget.retained > PLASMID_FEATURE_LIMITS.maxRetainedCharacters) {
            throw new Error("Plasmid hits exceed the 26,214,400-character retention limit. Use fewer hits or shorter record titles.");
          }
          const observed = sequence.slice(start, start + pattern.length);
          rows.push({
            record: record.title || `Record ${recordIndex + 1}`,
            record_index: recordIndex + 1,
            feature_id: reference.id,
            feature_name: reference.name,
            feature_type: reference.type,
            strand: oriented.strand,
            start: start + 1,
            end: start + pattern.length,
            mismatches,
            identity_percent: identity,
            score: identity - mismatches,
            reference_length: pattern.length,
            reference_source: reference.source?.name || reference.provenance?.dataset || "",
            matched_sequence: observed
          });
        }
      }
      await context.yieldIfNeeded?.();
    }
  }
  return rows.sort((left, right) =>
    left.record_index - right.record_index ||
    left.start - right.start ||
    right.score - left.score ||
    left.feature_name.localeCompare(right.feature_name)
  );
}
