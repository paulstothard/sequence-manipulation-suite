import { PROTEIN_STATS_DEFAULTS } from "./protein-stats-options.js";
import { normalizeProteinHydropathyOptions } from "./protein-hydropathy-options.js";
import { normalizeGroupNumberOptions } from "./group-number-options.js";

const DNA_RNA_IUPAC = /[ACGTURYSWKMBDHVNX]/i;
const DNA_RNA_GAP = /[.-]/;
const PROTEIN_IUPAC = /[ABCDEFGHIKLMNPQRSTUVWYZXJO*]/i;
const PROTEIN_GAP = /[.-]/;
export const STANDARD_AMINO_ACIDS = ["A", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W", "Y"];
export const AMBIGUOUS_AMINO_ACIDS = ["B", "J", "X", "Z"];
export const UNCOMMON_AMINO_ACIDS = ["O", "U"];
export const PROTEIN_MASS_WATER = 18.01528;
// Average residue masses in daltons. These are peptide-residue masses; a
// complete protein mass adds one H2O for the termini. Source: ExPASy
// ProtParam/Compute pI/Mw documentation, also exposed through EMBOSS pepstats
// molecular-weight data files.
export const PROTEIN_AVERAGE_RESIDUE_MASSES = {
  A: 71.0788,
  C: 103.1388,
  D: 115.0886,
  E: 129.1155,
  F: 147.1766,
  G: 57.0519,
  H: 137.1411,
  I: 113.1594,
  K: 128.1741,
  L: 113.1594,
  M: 131.1926,
  N: 114.1038,
  P: 97.1167,
  Q: 128.1307,
  R: 156.1875,
  S: 87.0782,
  T: 101.1051,
  V: 99.1326,
  W: 186.2132,
  Y: 163.176
};
// EMBOSS Epk.dat defaults used by pepstats/iep:
// Amino 8.6, Carboxyl 3.6, C 8.5, D 3.9, E 4.1, H 6.5,
// K 10.8, R 12.5, Y 10.1.
export const EMBOSS_PROTEIN_PKA = {
  nTerminus: 8.6,
  cTerminus: 3.6,
  C: 8.5,
  D: 3.9,
  E: 4.1,
  H: 6.5,
  K: 10.8,
  R: 12.5,
  Y: 10.1
};
// Kyte-Doolittle hydropathy scale. Source: Kyte J, Doolittle RF,
// J Mol Biol. 1982;157:105-132; values as listed by ExPASy ProtScale.
export const KYTE_DOOLITTLE_HYDROPATHY = {
  A: 1.8,
  C: 2.5,
  D: -3.5,
  E: -3.5,
  F: 2.8,
  G: -0.4,
  H: -3.2,
  I: 4.5,
  K: -3.9,
  L: 3.8,
  M: 1.9,
  N: -3.5,
  P: -1.6,
  Q: -3.5,
  R: -4.5,
  S: -0.8,
  T: -0.7,
  V: 4.2,
  W: -0.9,
  Y: -1.3
};
const DNA_RNA_COMPLEMENT = new Map(
  Object.entries({
    A: "T",
    C: "G",
    G: "C",
    T: "A",
    U: "A",
    R: "Y",
    Y: "R",
    S: "S",
    W: "W",
    K: "M",
    M: "K",
    B: "V",
    D: "H",
    H: "D",
    V: "B",
    N: "N",
    X: "X"
  })
);

export function cleanDnaRnaSequence(sequence, options = {}) {
  let removedCount = 0;
  let cleaned = "";
  const keepGaps = options.keepGaps === true;
  const preserveCase = options.preserveCase !== false;

  for (const character of String(sequence ?? "")) {
    if (DNA_RNA_IUPAC.test(character) || (keepGaps && DNA_RNA_GAP.test(character))) {
      cleaned += preserveCase ? character : character.toUpperCase();
    } else {
      removedCount += 1;
    }
  }

  return { sequence: cleaned, removedCount };
}

export function cleanProteinSequence(sequence, options = {}) {
  let removedCount = 0;
  let cleaned = "";
  const keepGaps = options.keepGaps === true;
  const preserveCase = options.preserveCase !== false;

  for (const character of String(sequence ?? "")) {
    if (PROTEIN_IUPAC.test(character) || (keepGaps && PROTEIN_GAP.test(character))) {
      cleaned += preserveCase ? character : character.toUpperCase();
    } else {
      removedCount += 1;
    }
  }

  return { sequence: cleaned, removedCount };
}

export function cleanSequence(sequence, options = {}) {
  if (options.alphabet === "protein") {
    return cleanProteinSequence(sequence, options);
  }

  return cleanDnaRnaSequence(sequence, options);
}

export function makeSequenceContext(sequence, start, end, flankLength = 10) {
  const source = String(sequence ?? "");
  const normalizedStart = Math.max(1, Number.parseInt(start, 10) || 1);
  const normalizedEnd = Math.max(normalizedStart, Number.parseInt(end, 10) || normalizedStart);
  const leftStart = Math.max(0, normalizedStart - flankLength - 1);
  const leftContext = source.slice(leftStart, normalizedStart - 1);
  const matchedText = source.slice(normalizedStart - 1, normalizedEnd);
  const rightContext = source.slice(normalizedEnd, normalizedEnd + flankLength);
  return {
    left_context: leftContext.toLowerCase(),
    matched_text: matchedText.toUpperCase(),
    right_context: rightContext.toLowerCase(),
    context_sequence: `${leftContext.toLowerCase()}${matchedText.toUpperCase()}${rightContext.toLowerCase()}`
  };
}

export function complementDnaRnaSequence(sequence, options = {}) {
  const preserveCase = options.preserveCase !== false;

  return Array.from(String(sequence ?? ""), (character) => {
    const upper = character.toUpperCase();
    const replacement = DNA_RNA_COMPLEMENT.get(upper);

    if (!replacement) {
      return character;
    }

    if (preserveCase && character === character.toLowerCase()) {
      return replacement.toLowerCase();
    }

    return replacement;
  }).join("");
}

export function getGroupedSequenceNumberWidth(sequence, options = {}) {
  options = normalizeGroupNumberOptions(options);
  const sourceLength = String(sequence ?? "").length;
  const { groupSize, groupsPerLine } = options;
  const { startPosition } = options;
  const lineSize = groupSize * groupsPerLine;
  const lastLineStart = sourceLength > 0
    ? startPosition + Math.floor((sourceLength - 1) / lineSize) * lineSize
    : startPosition;
  if (options.showPositionNumbers && !Number.isSafeInteger(lastLineStart)) {
    throw new Error("Displayed coordinates exceed the largest exact integer position.");
  }
  return Math.max(8, String(startPosition).length, String(lastLineStart).length);
}

export function* groupSequenceLines(sequence, options = {}) {
  options = normalizeGroupNumberOptions(options);
  const source = String(sequence ?? "");
  const { groupSize, groupsPerLine } = options;
  const showPositionNumbers = options.showPositionNumbers === true;
  const { startPosition } = options;
  const lineSize = groupSize * groupsPerLine;
  const numberWidth = getGroupedSequenceNumberWidth(source, options);

  for (let index = 0; index < source.length; index += lineSize) {
    const chunk = source.slice(index, index + lineSize);
    const groups = [];

    for (let groupIndex = 0; groupIndex < chunk.length; groupIndex += groupSize) {
      groups.push(chunk.slice(groupIndex, groupIndex + groupSize));
    }

    const grouped = groups.join(" ");
    if (showPositionNumbers) {
      const position = startPosition + index;
      yield { text: `${String(position).padStart(numberWidth, " ")} ${grouped}`, grouped, numberWidth };
    } else {
      yield { text: grouped, grouped, numberWidth };
    }
  }

}

export function groupSequence(sequence, options = {}) {
  return Array.from(groupSequenceLines(sequence, options), line => line.text).join("\n");
}

export function getDnaRnaStats(sequence) {
  const counts = {
    A: 0,
    C: 0,
    G: 0,
    T: 0,
    U: 0,
    R: 0,
    Y: 0,
    S: 0,
    W: 0,
    K: 0,
    M: 0,
    B: 0,
    D: 0,
    H: 0,
    V: 0,
    N: 0,
    X: 0,
    gaps: 0
  };

  for (const character of String(sequence ?? "").toUpperCase()) {
    if (character === "." || character === "-") {
      counts.gaps += 1;
    } else if (Object.hasOwn(counts, character)) {
      counts[character] += 1;
    }
  }

  const unambiguousBases = counts.A + counts.C + counts.G + counts.T + counts.U;
  const gcCount = counts.G + counts.C;
  const ambiguityCount =
    counts.R +
    counts.Y +
    counts.S +
    counts.W +
    counts.K +
    counts.M +
    counts.B +
    counts.D +
    counts.H +
    counts.V +
    counts.N +
    counts.X;

  return {
    length: String(sequence ?? "").length,
    counts,
    gcCount,
    gcPercent: unambiguousBases > 0 ? (gcCount / unambiguousBases) * 100 : null,
    unambiguousBases,
    ambiguityCount,
    nCount: counts.N,
    xCount: counts.X,
    gapCount: counts.gaps
  };
}

export function getProteinChargeAtPh(counts, ph = 7, options = {}) {
  const pH = Number.isFinite(Number(ph)) ? Number(ph) : 7;
  const includeTermini = options.includeTermini !== false;
  const pka = options.pka ?? EMBOSS_PROTEIN_PKA;
  const count = (residue) => counts?.[residue] ?? 0;
  let positiveCharge = 0;
  let negativeCharge = 0;

  if (includeTermini) {
    positiveCharge += 1 / (1 + 10 ** (pH - pka.nTerminus));
    negativeCharge += 1 / (1 + 10 ** (pka.cTerminus - pH));
  }

  positiveCharge += count("H") / (1 + 10 ** (pH - pka.H));
  positiveCharge += count("K") / (1 + 10 ** (pH - pka.K));
  positiveCharge += count("R") / (1 + 10 ** (pH - pka.R));

  negativeCharge += count("D") / (1 + 10 ** (pka.D - pH));
  negativeCharge += count("E") / (1 + 10 ** (pka.E - pH));
  negativeCharge += count("C") / (1 + 10 ** (pka.C - pH));
  negativeCharge += count("Y") / (1 + 10 ** (pka.Y - pH));

  return positiveCharge - negativeCharge;
}

export function getProteinIsoelectricPoint(counts, options = {}) {
  const residueCount = STANDARD_AMINO_ACIDS.reduce((sum, residue) => sum + (counts?.[residue] ?? 0), 0);

  if (residueCount === 0) {
    return null;
  }

  let low = 0;
  let high = 14;
  const lowCharge = getProteinChargeAtPh(counts, low, options);
  const highCharge = getProteinChargeAtPh(counts, high, options);
  // Bisection requires a finite bracket with a sign change. Zero charge at
  // every pH (no ionizable groups) does not define a unique isoelectric point.
  if (!Number.isFinite(lowCharge) || !Number.isFinite(highCharge)
      || !(lowCharge > highCharge) || lowCharge < 0 || highCharge > 0) return null;
  if (lowCharge === 0) return low;
  if (highCharge === 0) return high;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    const charge = getProteinChargeAtPh(counts, mid, options);

    if (charge > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

export function countProteinSymbols(sequence, counts = null) {
  counts ??= Object.fromEntries(
    [...STANDARD_AMINO_ACIDS, ...AMBIGUOUS_AMINO_ACIDS, ...UNCOMMON_AMINO_ACIDS, "stop", "gaps"].map((residue) => [residue, 0])
  );

  for (const character of String(sequence ?? "").toUpperCase()) {
    if (character === "." || character === "-") {
      counts.gaps += 1;
    } else if (character === "*") {
      counts.stop += 1;
    } else if (Object.hasOwn(counts, character)) {
      counts[character] += 1;
    }
  }

  return counts;
}

export function getProteinStats(sequence, options = {}) {
  return { ...getProteinStatsFromCounts(countProteinSymbols(sequence), options), length: String(sequence ?? "").length };
}

export function getProteinStatsFromCounts(counts, options = {}) {
  const standardResidues = STANDARD_AMINO_ACIDS.reduce((sum, residue) => sum + counts[residue], 0);
  const ambiguousResidues = AMBIGUOUS_AMINO_ACIDS.reduce((sum, residue) => sum + counts[residue], 0);
  const uncommonResidues = UNCOMMON_AMINO_ACIDS.reduce((sum, residue) => sum + counts[residue], 0);
  const residueMass = STANDARD_AMINO_ACIDS.reduce(
    (sum, residue) => sum + counts[residue] * PROTEIN_AVERAGE_RESIDUE_MASSES[residue],
    0
  );
  const molecularWeight = standardResidues > 0 ? residueMass + PROTEIN_MASS_WATER : 0;
  const chargePh = Number.isFinite(Number(options.chargePh)) ? Number(options.chargePh) : PROTEIN_STATS_DEFAULTS.chargePh;
  const charge = standardResidues > 0
    ? getProteinChargeAtPh(counts, chargePh, { includeTermini: options.includeTermini })
    : null;
  const isoelectricPoint = getProteinIsoelectricPoint(counts, {
    includeTermini: options.includeTermini
  });

  return {
    length: standardResidues + ambiguousResidues + uncommonResidues + counts.stop + counts.gaps,
    counts,
    standardResidues,
    ambiguousResidues,
    uncommonResidues,
    stopCount: counts.stop,
    gapCount: counts.gaps,
    molecularWeight,
    averageResidueWeight: standardResidues > 0 ? molecularWeight / standardResidues : 0,
    chargePh,
    charge,
    isoelectricPoint
  };
}

export function getProteinGravy(sequence, scale = KYTE_DOOLITTLE_HYDROPATHY) {
  let total = 0;
  let residueCount = 0;

  for (const character of String(sequence ?? "").toUpperCase()) {
    if (Object.hasOwn(scale, character)) {
      total += scale[character];
      residueCount += 1;
    }
  }

  return {
    value: residueCount > 0 ? total / residueCount : null,
    residueCount
  };
}

export function* proteinHydropathyProfileSteps(sequence, options = {}, context = {}) {
  const source = String(sequence ?? "").toUpperCase();
  const scale = options.scale ?? KYTE_DOOLITTLE_HYDROPATHY;
  // The published Kyte-Doolittle constants have one decimal place. Integer
  // tenths prevent rolling-add/subtract drift without rounding output means.
  const factor = scale === KYTE_DOOLITTLE_HYDROPATHY ? 10 : 1;
  const weight = character => Object.hasOwn(scale, character) ? scale[character] * factor : null;
  const requestedWindowSize = normalizeProteinHydropathyOptions(options).windowSize;
  const windowSize = source.length > 0 ? Math.min(requestedWindowSize, source.length) : requestedWindowSize;
  const rows = [];
  let windowCount = 0;
  const summary = { min: null, max: null };
  const maxRetainedRows = options.retainRows === false ? 0 : (options.maxRetainedRows ?? Infinity);
  let total = 0, standardResidues = 0, globalTotal = 0, globalCount = 0;
  for (let index = 0; index < source.length; index += 1) {
    if ((index & 0x3fff) === 0) { context.throwIfCancelled?.(); yield; }
    const incoming = weight(source[index]);
    if (incoming !== null) { total += incoming; standardResidues += 1; globalTotal += incoming; globalCount += 1; }
    if (index >= windowSize) {
      const outgoing = weight(source[index - windowSize]);
      if (outgoing !== null) { total -= outgoing; standardResidues -= 1; }
    }
    if (index + 1 < windowSize) continue;
    const end = index + 1, start = end - windowSize;
    const row = {
      position: (start + 1 + end) / 2,
      windowStart: start + 1, windowEnd: end, windowSize, standardResidues,
      excludedSymbols: windowSize - standardResidues,
      hydropathy: standardResidues > 0 ? total / (factor * standardResidues) : null
    };
    windowCount += 1;
    if (windowCount <= maxRetainedRows) rows.push(row);
    else if (rows.length) rows.length = 0;
    if (row.hydropathy !== null) {
      if (!summary.min || row.hydropathy < summary.min.hydropathy) summary.min = row;
      if (!summary.max || row.hydropathy > summary.max.hydropathy) summary.max = row;
    }
  }
  return { requestedWindowSize, windowSize, rows, windowCount, summary,
    gravy: { value: globalCount ? globalTotal / (factor * globalCount) : null, residueCount: globalCount } };
}

// Synchronous core callers drain the same computation used by worker scheduling.
export function getProteinHydropathyProfile(sequence, options = {}) {
  const steps = proteinHydropathyProfileSteps(sequence, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
