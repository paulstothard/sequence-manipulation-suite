import { complementDnaRnaSequence } from "./sequence.js";

export const plasmidCommonFeatureMatchColumns = [
  { id: "record", label: "Record", type: "string" },
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
  return String(sequence ?? "").toUpperCase().replace(/U/g, "T").replace(/[^ACGTRYSWKMBDHVN]/g, "");
}

function hammingMismatches(left, right) {
  let mismatches = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      mismatches += 1;
    }
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

export function scanPlasmidCommonFeatures(records, references, options = {}, context = {}) {
  const maxMismatches = Math.max(0, Number.parseInt(options.maxMismatches ?? 0, 10) || 0);
  const minIdentity = Math.max(0, Math.min(100, Number(options.minIdentityPercent ?? 90) || 90));
  const rows = [];
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
          if ((start & 511) === 0) {
            context.throwIfCancelled?.();
          }
          const observed = sequence.slice(start, start + pattern.length);
          const mismatches = hammingMismatches(observed, pattern);
          if (mismatches > maxMismatches) {
            continue;
          }
          const identity = ((pattern.length - mismatches) / pattern.length) * 100;
          if (identity < minIdentity) {
            continue;
          }
          rows.push({
            record: record.title || `Record ${recordIndex + 1}`,
            feature_id: reference.id,
            feature_name: reference.name,
            feature_type: reference.type,
            strand: oriented.strand,
            start: start + 1,
            end: start + pattern.length,
            mismatches,
            identity_percent: Number(identity.toFixed(3)),
            score: Number((identity - mismatches).toFixed(3)),
            reference_length: pattern.length,
            reference_source: reference.source?.name || reference.provenance?.dataset || "",
            matched_sequence: observed
          });
        }
      }
      context.yieldIfNeeded?.();
    }
  }
  return rows.sort((left, right) =>
    left.record.localeCompare(right.record) ||
    left.start - right.start ||
    right.score - left.score ||
    left.feature_name.localeCompare(right.feature_name)
  );
}
