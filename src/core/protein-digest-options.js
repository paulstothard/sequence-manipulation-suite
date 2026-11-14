import proteases from "../reference-data/protein-digest/records.js";
import { effectiveToolLimit, normalizeDisabledToolLimitIds } from "./tool-limit-policy.js";

export const PROTEIN_DIGEST_LIMITS = Object.freeze({
  inputCharacters: 2_000_000, records: 1000, residues: 200_000,
  peptides: 50_000, exportedResidues: 2_000_000,
  mapRecords: 12, mapPeptides: 300, mapResidues: 10_000
});

export const PROTEIN_DIGEST_DEFAULTS = Object.freeze({
  enzyme: "trypsin", missedCleavages: 0, minLength: 1,
  maxLength: PROTEIN_DIGEST_LIMITS.residues, massType: "monoisotopic", outputFormat: "table"
});

function integerOption(value, fallback, min, max, label) {
  const n = value == null || (typeof value === "string" && value.trim() === "") ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

export function normalizeDigestOptions(options = {}) {
  options ??= {};
  const enzyme = options.enzyme == null || options.enzyme === "" ? PROTEIN_DIGEST_DEFAULTS.enzyme : options.enzyme;
  if (!proteases.some(record => record.id === enzyme)) throw new Error("Choose a supported protease.");
  const missedCleavages = integerOption(options.missedCleavages, PROTEIN_DIGEST_DEFAULTS.missedCleavages, 0, 5, "Missed cleavages");
  const maxInputResidues = effectiveToolLimit(options, "maxInputResidues", PROTEIN_DIGEST_LIMITS.residues);
  const minLength = integerOption(options.minLength, PROTEIN_DIGEST_DEFAULTS.minLength, 1, maxInputResidues, "Minimum peptide length");
  const maxLength = integerOption(options.maxLength, PROTEIN_DIGEST_DEFAULTS.maxLength, 1, maxInputResidues, "Maximum peptide length");
  if (maxLength < minLength) throw new Error("Maximum peptide length must be at least the minimum peptide length.");
  const massType = options.massType == null || options.massType === "" ? PROTEIN_DIGEST_DEFAULTS.massType : options.massType;
  if (!["monoisotopic", "average"].includes(massType)) throw new Error("Choose monoisotopic or average peptide mass.");
  const outputFormat = options.outputFormat == null || options.outputFormat === "" ? PROTEIN_DIGEST_DEFAULTS.outputFormat : options.outputFormat;
  if (!["table", "fasta", "svg-map"].includes(outputFormat)) throw new Error("Choose peptide table, peptide FASTA, or peptide map output.");
  return { enzyme, missedCleavages, minLength, maxLength, massType, outputFormat,
    disabledToolLimitIds: normalizeDisabledToolLimitIds("protein-digest", options.disabledToolLimitIds) };
}

