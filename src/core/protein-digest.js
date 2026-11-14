import { parseSequenceInput } from "./fasta.js";
import { PROTEIN_AVERAGE_RESIDUE_MASSES, PROTEIN_MASS_WATER } from "./sequence.js";
import proteases from "../reference-data/protein-digest/records.js";
import { effectiveToolLimit } from "./tool-limit-policy.js";

import { normalizeDigestOptions, PROTEIN_DIGEST_LIMITS } from "./protein-digest-options.js";
export { normalizeDigestOptions, PROTEIN_DIGEST_LIMITS } from "./protein-digest-options.js";
export { proteases };
// Neutral monoisotopic residue masses (residue formula = free amino acid minus H2O).
// C=12, H=1.00782503223, N=14.00307400443, O=15.99491461957, S=31.9720711744.
// Independently calculated from elemental compositions; verified against Pyteomics.
const atoms = [12, 1.00782503223, 14.00307400443, 15.99491461957, 31.9720711744];
const formulas = {
  A: [3,5,1,1,0], C: [3,5,1,1,1], D: [4,5,1,3,0], E: [5,7,1,3,0],
  F: [9,9,1,1,0], G: [2,3,1,1,0], H: [6,7,3,1,0], I: [6,11,1,1,0],
  K: [6,12,2,1,0], L: [6,11,1,1,0], M: [5,9,1,1,1], N: [4,6,2,2,0],
  P: [5,7,1,1,0], Q: [5,8,2,2,0], R: [6,12,4,1,0], S: [3,5,1,2,0],
  T: [4,7,1,2,0], V: [5,9,1,1,0], W: [11,10,2,1,0], Y: [9,9,1,2,0]
};
export const PROTEIN_MONOISOTOPIC_RESIDUE_MASSES = Object.freeze(Object.fromEntries(
  Object.entries(formulas).map(([residue, counts]) => [residue, counts.reduce((sum, count, i) => sum + count * atoms[i], 0)])
));
const monoWater = 2 * atoms[1] + atoms[3];

// Boundary b is between sequence[b - 1] and sequence[b]. Termini are handled separately.
export function isProteinCleavageBoundary(sequence, b, enzyme) {
  if (b <= 0 || b >= sequence.length) return false;
  const left = sequence[b - 1], right = sequence[b], previous = sequence[b - 2];
  switch (enzyme) {
    case "trypsin": {
      if (left !== "K" && left !== "R") return false;
      if (right === "P" && !(left === "K" && previous === "W") && !(left === "R" && previous === "M")) return false;
      if (left === "K" && ((["C", "D"].includes(previous) && right === "D") || (previous === "C" && ["H", "Y"].includes(right)))) return false;
      if (left === "R" && ((previous === "C" && right === "K") || (previous === "R" && ["H", "R"].includes(right)))) return false;
      return true;
    }
    case "chymotrypsin": return (["F", "Y"].includes(left) && right !== "P") || (left === "W" && !["M", "P"].includes(right));
    case "lys-c": return left === "K";
    case "arg-c": return left === "R";
    case "asp-n": return right === "D";
    case "glu-c": return left === "E";
    default: throw new Error("Unknown protease.");
  }
}

// One generator owns the algorithm for both direct calls and cooperative worker runs.
function* digestSteps(input, options) {
  const settings = normalizeDigestOptions(options);
  const maxInputCharacters = effectiveToolLimit(settings, "maxInputCharacters", PROTEIN_DIGEST_LIMITS.inputCharacters);
  const maxProteinRecords = effectiveToolLimit(settings, "maxProteinRecords", PROTEIN_DIGEST_LIMITS.records);
  const maxInputResidues = effectiveToolLimit(settings, "maxInputResidues", PROTEIN_DIGEST_LIMITS.residues);
  const maxPeptides = effectiveToolLimit(settings, "maxPeptides", PROTEIN_DIGEST_LIMITS.peptides);
  const maxExportedResidues = effectiveToolLimit(settings, "maxExportedResidues", PROTEIN_DIGEST_LIMITS.exportedResidues);
  const source = String(input ?? "");
  if (source.length > maxInputCharacters) throw new Error(`Input exceeds ${maxInputCharacters.toLocaleString()} characters. Digest a smaller batch of proteins.`);
  const parsed = parseSequenceInput(source, "protein");
  if (!parsed.length) throw new Error("Enter a protein sequence or FASTA records to digest.");
  if (parsed.length > maxProteinRecords) throw new Error(`Digest at most ${maxProteinRecords.toLocaleString()} protein records per run.`);
  const massTable = settings.massType === "average" ? PROTEIN_AVERAGE_RESIDUE_MASSES : PROTEIN_MONOISOTOPIC_RESIDUE_MASSES;
  const water = settings.massType === "average" ? PROTEIN_MASS_WATER : monoWater;
  const records = [], warnings = [], notes = [];
  let totalResidues = 0, peptideCount = 0, exportedResidues = 0, charactersRemoved = 0;
  for (const [recordIndex, record] of parsed.entries()) {
    yield { phase: "digesting-proteins", progress: 0.05 + 0.8 * recordIndex / parsed.length };
    if (record.title.length > 500) throw new Error(`Record ${recordIndex + 1}: use a FASTA header of at most 500 characters for peptide output.`);
    // Validate the original symbols before case conversion: Unicode uppercasing
    // can expand an unsupported character into valid residues (e.g. ß -> SS).
    let sequence = record.sequence;
    if (sequence.endsWith("*")) {
      sequence = sequence.slice(0, -1);
      charactersRemoved++;
      notes.push(`Record ${recordIndex + 1} (${record.title}): removed one terminal stop symbol; residue coordinates are unchanged.`);
    }
    if (!sequence.length) throw new Error(`Record ${recordIndex + 1} (${record.title}) has no protein residues.`);
    const invalidIndex = sequence.search(/[^ACDEFGHIKLMNPQRSTVWYBJXZUOacdefghiklmnpqrstvwybjxzuo]/);
    if (invalidIndex >= 0) throw new Error(`Record ${recordIndex + 1} (${record.title}): unsupported symbol ${JSON.stringify(sequence[invalidIndex])} at position ${invalidIndex + 1}. Remove gaps, internal stops, or non-protein symbols explicitly before digesting; coordinates are never silently shifted.`);
    sequence = sequence.toUpperCase();
    totalResidues += sequence.length;
    if (totalResidues > maxInputResidues) throw new Error(`Digest at most ${maxInputResidues.toLocaleString()} residues per run. Split the input into smaller batches.`);
    const prefixMass = new Float64Array(sequence.length + 1);
    const prefixUnknown = new Uint32Array(sequence.length + 1);
    const boundaries = [0];
    for (let i = 0; i < sequence.length; i++) {
      if (i % 4096 === 0) yield { phase: "finding-cleavage-sites" };
      const mass = massTable[sequence[i]];
      prefixMass[i + 1] = prefixMass[i] + (mass ?? 0);
      prefixUnknown[i + 1] = prefixUnknown[i] + (mass === undefined ? 1 : 0);
      if (isProteinCleavageBoundary(sequence, i + 1, settings.enzyme)) boundaries.push(i + 1);
    }
    boundaries.push(sequence.length);
    if (prefixUnknown[sequence.length]) warnings.push(`Record ${recordIndex + 1} (${record.title}): ambiguous or uncommon residues are retained. Peptides containing them have no calculated mass; cleavage near these residues may be uncertain.`);
    const peptides = [];
    let candidates = 0;
    for (let startBoundary = 0; startBoundary < boundaries.length - 1; startBoundary++) {
      for (let missed = 0; missed <= settings.missedCleavages && startBoundary + missed + 1 < boundaries.length; missed++) {
        if (++candidates % 4096 === 0) yield { phase: "enumerating-peptides" };
        const start0 = boundaries[startBoundary], end = boundaries[startBoundary + missed + 1], length = end - start0;
        if (length < settings.minLength || length > settings.maxLength) continue;
        if (++peptideCount > maxPeptides) throw new Error(`Digest exceeds ${maxPeptides.toLocaleString()} peptides. Reduce missed cleavages, narrow the length range, or digest fewer proteins.`);
        exportedResidues += length;
        if (settings.outputFormat !== "svg-map" && exportedResidues > maxExportedResidues) throw new Error(`Peptide output exceeds ${maxExportedResidues === PROTEIN_DIGEST_LIMITS.exportedResidues ? "2 million" : maxExportedResidues.toLocaleString()} residues. Reduce missed cleavages, narrow the length range, or digest fewer proteins.`);
        peptides.push({
          peptide_id: `R${recordIndex + 1}-P${peptides.length + 1}`, start: start0 + 1, end, length,
          missed_cleavages: missed,
          mass_da: prefixUnknown[end] !== prefixUnknown[start0] ? null : prefixMass[end] - prefixMass[start0] + water
        });
      }
    }
    records.push({ record_index: recordIndex + 1, title: record.title, sequence, cuts: boundaries.slice(1, -1), peptides });
  }
  if (!peptideCount) notes.push("No peptides match the selected length range. Widen the range to include more peptides.");
  if (settings.outputFormat === "svg-map" && (records.length > PROTEIN_DIGEST_LIMITS.mapRecords || peptideCount > PROTEIN_DIGEST_LIMITS.mapPeptides || totalResidues > PROTEIN_DIGEST_LIMITS.mapResidues)) {
    throw new Error("Peptide maps support at most 12 proteins, 300 peptides, and 10,000 input residues. Use peptide table or FASTA output for larger digests, or narrow the input and length range.");
  }
  return { settings, records, warnings, notes, totalResidues, peptideCount, charactersRemoved };
}

export function digestProteins(input, options = {}) {
  const steps = digestSteps(input, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export async function digestProteinsWithContext(input, options = {}, context = {}) {
  const steps = digestSteps(input, options);
  let step = steps.next();
  while (!step.done) {
    context.throwIfCancelled?.();
    context.reportProgress?.(step.value);
    await context.yieldIfNeeded?.();
    context.throwIfCancelled?.();
    step = steps.next();
  }
  return step.value;
}
