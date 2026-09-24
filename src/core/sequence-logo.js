import { parseSequenceInput } from "./fasta.js";
import { effectiveToolLimit } from "./tool-limit-policy.js";

export const DNA_LOGO_SYMBOLS = Object.freeze(["A", "C", "G", "T"]);
export const RNA_LOGO_SYMBOLS = Object.freeze(["A", "C", "G", "U"]);
export const PROTEIN_LOGO_SYMBOLS = Object.freeze([
  "A", "C", "D", "E", "F", "G", "H", "I", "K", "L",
  "M", "N", "P", "Q", "R", "S", "T", "V", "W", "Y"
]);

export const SEQUENCE_LOGO_LIMITS = Object.freeze({
  inputCells: 5_000_000,
  bootstrapObservations: 25_000_000,
  visibleColumns: 500
});

export const sequenceLogoTableColumns = Object.freeze([
  { id: "position", label: "Position", type: "number" },
  { id: "effective_sample_size", label: "Effective sample size", type: "number" },
  { id: "gap_count", label: "Gap count", type: "number" },
  { id: "ambiguous_count", label: "Ambiguous count", type: "number" },
  { id: "entropy_bits", label: "Entropy (bits)", type: "number" },
  { id: "information_bits", label: "Information (bits)", type: "number" },
  { id: "information_ci_low", label: "Information CI low", type: "number" },
  { id: "information_ci_high", label: "Information CI high", type: "number" },
  { id: "frequency_confidence_intervals", label: "Residue frequency CIs", type: "string" },
  { id: "counts", label: "Residue counts", type: "string" },
  { id: "frequencies", label: "Residue frequencies", type: "string" }
]);

const DNA_AMBIGUITY = Object.freeze({
  R: "AG", Y: "CT", S: "CG", W: "AT", K: "GT", M: "AC",
  B: "CGT", D: "AGT", H: "ACT", V: "ACG", N: "ACGT", X: "ACGT"
});
const RNA_AMBIGUITY = Object.freeze(Object.fromEntries(
  Object.entries(DNA_AMBIGUITY).map(([symbol, members]) => [symbol, members.replaceAll("T", "U")])
));
const PROTEIN_AMBIGUITY = Object.freeze({
  B: "DN", Z: "EQ", J: "IL", X: PROTEIN_LOGO_SYMBOLS.join("")
});
const GAP_SYMBOLS = new Set(["-", "."]);

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerOption(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizeAlphabet(value) {
  const alphabet = String(value ?? "auto").toLowerCase();
  if (["dna", "rna", "protein"].includes(alphabet)) return alphabet;
  return "auto";
}

function normalizeOptions(raw = {}) {
  return {
    inputFormat: ["auto", "alignment", "counts", "frequencies"].includes(raw.inputFormat)
      ? raw.inputFormat
      : "auto",
    alphabet: normalizeAlphabet(raw.alphabet),
    ambiguousPolicy: raw.ambiguousPolicy === "fractional" ? "fractional" : "exclude",
    sequenceWeighting: raw.sequenceWeighting === "henikoff" ? "henikoff" : "none",
    correction: raw.correction === "schneider" ? "schneider" : "none",
    bootstrapReplicates: integerOption(raw.bootstrapReplicates, 0, 0, 2000),
    confidenceLevel: Math.max(0.5, Math.min(0.999, finiteNumber(raw.confidenceLevel, 0.95))),
    randomSeed: String(raw.randomSeed ?? "").trim(),
    firstPosition: integerOption(raw.firstPosition, 1, -1_000_000_000, 1_000_000_000),
    title: String(raw.title ?? "").trim(),
    maxInputCells: effectiveToolLimit(raw, "logoInputCells", SEQUENCE_LOGO_LIMITS.inputCells),
    maxBootstrapObservations: effectiveToolLimit(
      raw,
      "logoBootstrapObservations",
      SEQUENCE_LOGO_LIMITS.bootstrapObservations
    )
  };
}

function alphabetSymbols(alphabet) {
  if (alphabet === "protein") return PROTEIN_LOGO_SYMBOLS;
  return alphabet === "rna" ? RNA_LOGO_SYMBOLS : DNA_LOGO_SYMBOLS;
}

function ambiguityMap(alphabet) {
  if (alphabet === "protein") return PROTEIN_AMBIGUITY;
  return alphabet === "rna" ? RNA_AMBIGUITY : DNA_AMBIGUITY;
}

function detectAlphabetFromSymbols(symbols) {
  const nucleotide = new Set("ACGTURYSWKMBDHVNX-.");
  let sawU = false;
  let sawT = false;
  for (const rawSymbol of symbols) {
    const symbol = String(rawSymbol ?? "").toUpperCase();
    if (!symbol) continue;
    if (!nucleotide.has(symbol)) return "protein";
    if (symbol === "U") sawU = true;
    if (symbol === "T") sawT = true;
  }
  return sawU && !sawT ? "rna" : "dna";
}

function* alignmentSymbols(records) {
  for (const record of records) yield* record.sequence;
}

function* positionTableSymbols(rows) {
  for (const row of rows) yield* Object.keys(row.values);
}

function parseClustal(text) {
  const rows = new Map();
  for (const rawLine of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim() || /^CLUSTAL\b/i.test(line) || /^MUSCLE\b/i.test(line)) continue;
    if (/^\s/.test(rawLine) && /^[\s*:.]+$/.test(rawLine)) continue;
    const match = line.match(/^\s*(\S+)\s+([A-Za-z*?.-]+)(?:\s+\d+)?\s*$/);
    if (!match || /^[*:.]+$/.test(match[1])) continue;
    rows.set(match[1], `${rows.get(match[1]) ?? ""}${match[2]}`);
  }
  return [...rows].map(([title, sequence]) => ({ title, sequence }));
}

function parseAlignment(text) {
  const source = String(text ?? "").trim();
  const records = /^(CLUSTAL|MUSCLE)\b/i.test(source)
    ? parseClustal(source)
    : parseSequenceInput(source, "sequence");
  if (records.length < 2) {
    throw new Error("Sequence logos from alignments require at least two aligned sequences.");
  }
  const normalized = records.map((record, index) => ({
    title: record.title || `Sequence ${index + 1}`,
    sequence: String(record.sequence ?? "").replace(/\s+/g, "").toUpperCase()
  }));
  const alignmentLength = normalized[0]?.sequence.length ?? 0;
  if (alignmentLength === 0) throw new Error("The alignment does not contain any columns.");
  const mismatch = normalized.find((record) => record.sequence.length !== alignmentLength);
  if (mismatch) {
    throw new Error(`All aligned sequences must have the same length; "${mismatch.title}" has ${mismatch.sequence.length.toLocaleString()} symbols instead of ${alignmentLength.toLocaleString()}.`);
  }
  return { records: normalized, alignmentLength };
}

function splitTableLine(line) {
  return String(line).includes("\t")
    ? String(line).split("\t").map((value) => value.trim())
    : String(line).trim().split(/\s*,\s*|\s+/);
}

function tableNumber(value, context) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${context} must be a non-negative number.`);
  }
  return number;
}

function parsePositionTable(text, inputFormat) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n")
    .map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (lines.length < 2) throw new Error("The position table needs a header and at least one data row.");
  const rawHeaders = splitTableLine(lines[0]);
  const headers = rawHeaders.map((header) => header.toLowerCase());
  const positionIndex = headers.findIndex((header) => ["position", "pos", "site", "column"].includes(header));
  const symbolIndex = headers.findIndex((header) => ["symbol", "residue", "letter", "base", "amino_acid"].includes(header));
  const valueHeader = inputFormat === "frequencies" ? "frequency" : "count";
  const valueIndex = headers.findIndex((header) => inputFormat === "frequencies"
    ? ["frequency", "freq", "proportion", "probability"].includes(header)
    : ["count", "counts", "weight"].includes(header));
  // Preserve the conventional distinction between an uppercase nucleotide N
  // column and a lowercase sample-size n column in wide tables.
  const totalIndex = headers.findIndex((header, index) =>
    ["total", "sample_size", "effective_sample_size"].includes(header)
      || (header === "n" && rawHeaders[index] === "n")
  );
  const longFormat = positionIndex >= 0 && symbolIndex >= 0 && valueIndex >= 0;
  const symbolHeaders = headers
    .map((header, index) => ({ header: header.toUpperCase(), index }))
    .filter(({ index }) => index !== positionIndex && index !== totalIndex);
  if (!longFormat && positionIndex < 0) {
    throw new Error(`The ${valueHeader} table needs a position column.`);
  }

  const byPosition = new Map();
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitTableLine(lines[lineIndex]);
    const position = Number.parseInt(cells[positionIndex], 10);
    if (!Number.isFinite(position)) throw new Error(`Table row ${lineIndex + 1} has an invalid position.`);
    const entry = byPosition.get(position) ?? { position, values: {}, total: null };
    if (longFormat) {
      const symbol = String(cells[symbolIndex] ?? "").toUpperCase();
      if (!symbol) throw new Error(`Table row ${lineIndex + 1} has no symbol.`);
      entry.values[symbol] = (entry.values[symbol] ?? 0) + tableNumber(cells[valueIndex], `Table row ${lineIndex + 1} ${valueHeader}`);
    } else {
      for (const { header, index } of symbolHeaders) {
        if (cells[index] === undefined || cells[index] === "") continue;
        entry.values[header] = tableNumber(cells[index], `Table row ${lineIndex + 1} ${header}`);
      }
    }
    if (totalIndex >= 0 && cells[totalIndex] !== undefined && cells[totalIndex] !== "") {
      entry.total = tableNumber(cells[totalIndex], `Table row ${lineIndex + 1} sample size`);
    }
    byPosition.set(position, entry);
  }
  const rows = [...byPosition.values()].sort((left, right) => left.position - right.position);
  if (rows.length === 0) throw new Error(`The ${valueHeader} table does not contain data rows.`);
  return rows;
}

function inferInputFormat(input, configured) {
  if (configured !== "auto") return configured;
  const source = String(input ?? "").trim();
  if (source.startsWith(">") || /^(CLUSTAL|MUSCLE)\b/i.test(source)) return "alignment";
  const header = splitTableLine(source.split(/\r?\n/, 1)[0]).map((value) => value.toLowerCase());
  if (header.some((value) => ["frequency", "freq", "proportion", "probability"].includes(value))) return "frequencies";
  return "counts";
}

function normalizeNucleotideSymbol(symbol, alphabet) {
  if (alphabet === "rna" && symbol === "T") return "U";
  if (alphabet === "dna" && symbol === "U") return "T";
  return symbol;
}

function symbolFractions(rawSymbol, alphabet, policy) {
  const symbol = normalizeNucleotideSymbol(String(rawSymbol ?? "").toUpperCase(), alphabet);
  if (GAP_SYMBOLS.has(symbol)) return { kind: "gap", values: [] };
  const symbols = alphabetSymbols(alphabet);
  if (symbols.includes(symbol)) return { kind: "valid", values: [[symbol, 1]] };
  const members = ambiguityMap(alphabet)[symbol];
  if (members && policy === "fractional") {
    return { kind: "ambiguous", values: [...members].map((member) => [member, 1 / members.length]) };
  }
  return { kind: "ambiguous", values: [] };
}

function isUnsupportedSymbol(rawSymbol, alphabet) {
  const symbol = normalizeNucleotideSymbol(String(rawSymbol ?? "").toUpperCase(), alphabet);
  return Boolean(symbol)
    && !GAP_SYMBOLS.has(symbol)
    && !alphabetSymbols(alphabet).includes(symbol)
    && !Object.hasOwn(ambiguityMap(alphabet), symbol);
}

async function calculateHenikoffWeights(records, alphabet, ambiguousPolicy, context = {}) {
  const sequenceCount = records.length;
  const alignmentLength = records[0]?.sequence.length ?? 0;
  const weights = new Array(sequenceCount).fill(0);
  for (let column = 0; column < alignmentLength; column += 1) {
    if (column % 250 === 0) {
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
    }
    const memberships = records.map((record) => symbolFractions(record.sequence[column], alphabet, ambiguousPolicy));
    const exactCounts = new Map();
    for (const membership of memberships) {
      if (membership.values.length !== 1 || membership.values[0][1] !== 1) continue;
      const symbol = membership.values[0][0];
      exactCounts.set(symbol, (exactCounts.get(symbol) ?? 0) + 1);
    }
    const distinct = exactCounts.size;
    if (distinct === 0) continue;
    memberships.forEach((membership, rowIndex) => {
      if (membership.values.length !== 1 || membership.values[0][1] !== 1) return;
      const symbol = membership.values[0][0];
      weights[rowIndex] += 1 / (distinct * exactCounts.get(symbol));
    });
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return new Array(sequenceCount).fill(1);
  return weights.map((value) => value * sequenceCount / total);
}

function shannonEntropy(frequencies) {
  let entropy = 0;
  for (const frequency of Object.values(frequencies)) {
    if (frequency > 0) entropy -= frequency * Math.log2(frequency);
  }
  return entropy;
}

function kishEffectiveSampleSize(weights) {
  const sum = weights.reduce((total, value) => total + value, 0);
  const squareSum = weights.reduce((total, value) => total + value * value, 0);
  return squareSum > 0 ? (sum * sum) / squareSum : 0;
}

function informationForFrequencies(frequencies, maxBits, effectiveSampleSize, correction) {
  const entropy = shannonEntropy(frequencies);
  const raw = Math.max(0, maxBits - entropy);
  const correctionBits = correction === "schneider" && effectiveSampleSize > 0
    ? (Object.keys(frequencies).length - 1) / (2 * Math.log(2) * effectiveSampleSize)
    : 0;
  return {
    entropy,
    rawInformation: raw,
    correctionBits,
    information: Math.max(0, raw - correctionBits)
  };
}

function summarizeColumnFromRows(records, columnIndex, weights, alphabet, options) {
  const symbols = alphabetSymbols(alphabet);
  const counts = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
  const contributingWeights = [];
  let gapCount = 0;
  let ambiguousCount = 0;
  records.forEach((record, rowIndex) => {
    const membership = symbolFractions(record.sequence[columnIndex], alphabet, options.ambiguousPolicy);
    if (membership.kind === "gap") {
      gapCount += 1;
      return;
    }
    if (membership.kind === "ambiguous") ambiguousCount += 1;
    if (membership.values.length === 0) return;
    const weight = weights[rowIndex] ?? 1;
    for (const [symbol, fraction] of membership.values) counts[symbol] += weight * fraction;
    contributingWeights.push(weight);
  });
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const frequencies = Object.fromEntries(symbols.map((symbol) => [symbol, total > 0 ? counts[symbol] / total : 0]));
  const effectiveSampleSize = options.sequenceWeighting === "henikoff"
    ? kishEffectiveSampleSize(contributingWeights)
    : contributingWeights.length;
  return makeColumnSummary({
    position: options.firstPosition + columnIndex,
    counts,
    frequencies,
    total,
    effectiveSampleSize,
    gapCount,
    ambiguousCount,
    maxBits: Math.log2(symbols.length),
    correction: options.correction
  });
}

function makeColumnSummary({ position, counts, frequencies, total, effectiveSampleSize, gapCount = 0, ambiguousCount = 0, maxBits, correction }) {
  const frequencyTotal = Object.values(frequencies).reduce((sum, value) => sum + value, 0);
  const info = frequencyTotal > 0
    ? informationForFrequencies(frequencies, maxBits, effectiveSampleSize, correction)
    : { entropy: 0, rawInformation: 0, correctionBits: 0, information: 0 };
  const symbols = Object.keys(frequencies);
  return {
    position,
    counts: Object.fromEntries(symbols.map((symbol) => [symbol, counts[symbol] == null ? null : counts[symbol]])),
    frequencies: Object.fromEntries(symbols.map((symbol) => [symbol, frequencies[symbol] ?? 0])),
    letterHeightsBits: Object.fromEntries(symbols.map((symbol) => [symbol, (frequencies[symbol] ?? 0) * info.information])),
    contributingWeight: Number.isFinite(total) ? total : null,
    effectiveSampleSize: Number.isFinite(effectiveSampleSize) ? effectiveSampleSize : null,
    gapCount: Number.isFinite(gapCount) ? gapCount : null,
    ambiguousCount: Number.isFinite(ambiguousCount) ? ambiguousCount : null,
    entropyBits: info.entropy,
    rawInformationBits: info.rawInformation,
    smallSampleCorrectionBits: info.correctionBits,
    informationBits: info.information,
    maxInformationBits: maxBits,
    confidenceInterval: null,
    localComplexity: null,
    localRelativeConservation: null
  };
}

function columnsFromPositionTable(rows, alphabet, inputFormat, options) {
  const symbols = alphabetSymbols(alphabet);
  const maxBits = Math.log2(symbols.length);
  return rows.map((row) => {
    const counts = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
    let inputMass = 0;
    let gapInput = 0;
    let ambiguousInput = 0;
    for (const [rawSymbol, rawValue] of Object.entries(row.values)) {
      inputMass += rawValue;
      const membership = symbolFractions(rawSymbol, alphabet, options.ambiguousPolicy);
      if (membership.kind === "gap") {
        gapInput += rawValue;
        continue;
      }
      if (membership.kind === "ambiguous") ambiguousInput += rawValue;
      for (const [symbol, fraction] of membership.values) counts[symbol] += rawValue * fraction;
    }
    const sum = Object.values(counts).reduce((total, value) => total + value, 0);
    let frequencies;
    let total;
    let effectiveSampleSize;
    let gapCount;
    let ambiguousCount;
    if (inputFormat === "frequencies") {
      if (sum <= 0) frequencies = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
      else frequencies = Object.fromEntries(symbols.map((symbol) => [symbol, counts[symbol] / sum]));
      if (row.total == null) {
        total = null;
        effectiveSampleSize = null;
        gapCount = null;
        ambiguousCount = null;
        for (const symbol of symbols) counts[symbol] = null;
      } else {
        const mass = inputMass > 0 ? inputMass : sum;
        effectiveSampleSize = mass > 0 ? row.total * sum / mass : 0;
        total = effectiveSampleSize;
        gapCount = mass > 0 ? row.total * gapInput / mass : 0;
        ambiguousCount = mass > 0 ? row.total * ambiguousInput / mass : 0;
        for (const symbol of symbols) counts[symbol] = frequencies[symbol] * effectiveSampleSize;
      }
    } else {
      total = sum;
      effectiveSampleSize = sum;
      gapCount = gapInput;
      ambiguousCount = ambiguousInput;
      frequencies = Object.fromEntries(symbols.map((symbol) => [symbol, sum > 0 ? counts[symbol] / sum : 0]));
    }
    return makeColumnSummary({
      position: row.position,
      counts,
      frequencies,
      total,
      effectiveSampleSize,
      gapCount,
      ambiguousCount,
      maxBits,
      correction: effectiveSampleSize == null ? "none" : options.correction
    });
  });
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const character of String(text)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(values, probability) {
  const sorted = Array.from(values).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

async function addBootstrapIntervals(columns, records, alphabet, options, context) {
  const replicates = options.bootstrapReplicates;
  if (replicates <= 0) return null;
  const observations = records.length * columns.length * replicates;
  if (observations > options.maxBootstrapObservations) {
    throw new Error(`Bootstrap resampling would evaluate ${observations.toLocaleString()} sequence-column observations, above the ${options.maxBootstrapObservations.toLocaleString()} limit. Reduce the alignment or bootstrap replicates, or turn off this limit if your computer can handle the work.`);
  }
  const symbols = alphabetSymbols(alphabet);
  const informationSamples = columns.map(() => new Float64Array(replicates));
  const frequencySamples = columns.map(() => Object.fromEntries(symbols.map((symbol) => [symbol, new Float64Array(replicates)])));
  const seedText = options.randomSeed || `${records.map((record) => `${record.title}:${record.sequence}`).join("|")}::${replicates}`;
  const random = mulberry32(hashSeed(seedText));
  for (let replicate = 0; replicate < replicates; replicate += 1) {
    context.throwIfCancelled?.();
    if (replicate % 10 === 0) {
      context.reportProgress?.({ phase: "bootstrapping", progress: 0.35 + 0.55 * (replicate / replicates) });
      await context.yieldIfNeeded?.();
    }
    const sampled = Array.from({ length: records.length }, () => records[Math.floor(random() * records.length)]);
    const weights = options.sequenceWeighting === "henikoff"
      ? await calculateHenikoffWeights(sampled, alphabet, options.ambiguousPolicy, context)
      : new Array(sampled.length).fill(1);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const summary = summarizeColumnFromRows(sampled, columnIndex, weights, alphabet, options);
      informationSamples[columnIndex][replicate] = summary.informationBits;
      for (const symbol of symbols) frequencySamples[columnIndex][symbol][replicate] = summary.frequencies[symbol];
    }
  }
  const tail = (1 - options.confidenceLevel) / 2;
  columns.forEach((column, columnIndex) => {
    column.confidenceInterval = {
      level: options.confidenceLevel,
      informationBits: [
        quantile(informationSamples[columnIndex], tail),
        quantile(informationSamples[columnIndex], 1 - tail)
      ],
      frequencies: Object.fromEntries(symbols.map((symbol) => [symbol, [
        quantile(frequencySamples[columnIndex][symbol], tail),
        quantile(frequencySamples[columnIndex][symbol], 1 - tail)
      ]]))
    };
  });
  return { method: "whole-sequence-bootstrap", replicates, confidenceLevel: options.confidenceLevel, seed: seedText };
}

function addLocalRelativeConservation(columns, radius = 5) {
  columns.forEach((column, index) => {
    let sum = 0;
    let count = 0;
    for (let neighbor = Math.max(0, index - radius); neighbor <= Math.min(columns.length - 1, index + radius); neighbor += 1) {
      if (neighbor === index) continue;
      sum += columns[neighbor].informationBits;
      count += 1;
    }
    column.localRelativeConservation = column.informationBits - (count > 0 ? sum / count : column.informationBits);
  });
}

async function addAlignmentLocalComplexity(columns, records, alphabet, weights, context = {}, radius = null) {
  const symbols = alphabetSymbols(alphabet);
  const symbolIndexes = new Map(symbols.map((symbol, index) => [symbol, index]));
  const windowRadius = radius ?? (alphabet === "protein" ? 10 : 6);
  const sums = new Array(columns.length).fill(0);
  const weightSums = new Array(columns.length).fill(0);
  for (let rowIndex = 0; rowIndex < records.length; rowIndex += 1) {
    const record = records[rowIndex];
    const memberships = Array.from(record.sequence, (symbol) => symbolFractions(symbol, alphabet, "fractional"));
    const windowCounts = new Float64Array(symbols.length);
    let windowTotal = 0;
    const updateWindow = (membership, direction) => {
      for (const [symbol, fraction] of membership.values) {
        windowCounts[symbolIndexes.get(symbol)] += direction * fraction;
        windowTotal += direction * fraction;
      }
    };
    for (let index = 0; index <= Math.min(columns.length - 1, windowRadius); index += 1) {
      updateWindow(memberships[index], 1);
    }
    for (let center = 0; center < columns.length; center += 1) {
      if (center % 1000 === 0) {
        context.throwIfCancelled?.();
        await context.yieldIfNeeded?.();
      }
      if (memberships[center].kind === "valid" && windowTotal > 0) {
        let entropy = 0;
        for (const count of windowCounts) {
          const frequency = count / windowTotal;
          if (frequency > 0) entropy -= frequency * Math.log2(frequency);
        }
        const normalized = entropy / Math.log2(symbols.length);
        const weight = weights[rowIndex] ?? 1;
        sums[center] += normalized * weight;
        weightSums[center] += weight;
      }
      const leaving = center - windowRadius;
      const entering = center + windowRadius + 1;
      if (leaving >= 0) updateWindow(memberships[leaving], -1);
      if (entering < columns.length) updateWindow(memberships[entering], 1);
    }
  }
  columns.forEach((column, index) => {
    column.localComplexity = weightSums[index] > 0 ? sums[index] / weightSums[index] : null;
  });
}

export function makeSequenceLogoRows(logo) {
  const { columns, symbols } = logo;
  return columns.map((column) => ({
    position: column.position,
    effective_sample_size: column.effectiveSampleSize,
    gap_count: column.gapCount,
    ambiguous_count: column.ambiguousCount,
    entropy_bits: column.entropyBits,
    information_bits: column.informationBits,
    information_ci_low: column.confidenceInterval?.informationBits?.[0] ?? "",
    information_ci_high: column.confidenceInterval?.informationBits?.[1] ?? "",
    frequency_confidence_intervals: column.confidenceInterval
      ? symbols.map((symbol) => `${symbol}:${column.confidenceInterval.frequencies[symbol][0]}-${column.confidenceInterval.frequencies[symbol][1]}`).join(" ")
      : "",
    counts: symbols.map((symbol) => `${symbol}:${column.counts[symbol] ?? "n/a"}`).join(" "),
    frequencies: symbols.map((symbol) => `${symbol}:${column.frequencies[symbol]}`).join(" ")
  }));
}

export function makeSequenceLogoTsv(logo) {
  const headers = sequenceLogoTableColumns.map((column) => column.id);
  const rows = makeSequenceLogoRows(logo);
  return [
    headers.join("\t"),
    ...rows.map((row) => headers.map((header) => row[header]).join("\t"))
  ].join("\n");
}

export async function calculateSequenceLogo(input, rawOptions = {}, context = {}) {
  const options = normalizeOptions(rawOptions);
  const inputFormat = inferInputFormat(input, options.inputFormat);
  context.reportProgress?.({ phase: "parsing-input", progress: 0.08 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  let records = null;
  let tableRows = null;
  let alphabet = options.alphabet;
  if (inputFormat === "alignment") {
    const parsed = parseAlignment(input);
    records = parsed.records;
    if (records.length * parsed.alignmentLength > options.maxInputCells) {
      throw new Error(`The alignment contains ${(records.length * parsed.alignmentLength).toLocaleString()} cells, above the ${options.maxInputCells.toLocaleString()} sequence-logo input limit. Reduce the alignment, or turn off this limit if your computer can handle the work.`);
    }
    if (alphabet === "auto") alphabet = detectAlphabetFromSymbols(alignmentSymbols(records));
  } else {
    tableRows = parsePositionTable(input, inputFormat);
    if (alphabet === "auto") alphabet = detectAlphabetFromSymbols(positionTableSymbols(tableRows));
    const tableCells = tableRows.length * alphabetSymbols(alphabet).length;
    if (tableCells > options.maxInputCells) {
      throw new Error(`The position table contains ${tableCells.toLocaleString()} position-symbol cells, above the ${options.maxInputCells.toLocaleString()} sequence-logo input limit. Reduce the table, or turn off this limit if your computer can handle the work.`);
    }
  }
  const symbols = alphabetSymbols(alphabet);
  const warnings = [];
  let unsupportedSymbolCount = 0;
  if (records) {
    for (const record of records) {
      for (const symbol of record.sequence) {
        if (isUnsupportedSymbol(symbol, alphabet)) unsupportedSymbolCount += 1;
      }
    }
  } else {
    for (const row of tableRows) {
      for (const [symbol, value] of Object.entries(row.values)) {
        if (isUnsupportedSymbol(symbol, alphabet)) unsupportedSymbolCount += value;
      }
    }
  }
  if (unsupportedSymbolCount > 0) {
    warnings.push(`${unsupportedSymbolCount.toLocaleString()} unsupported input symbol${unsupportedSymbolCount === 1 ? " was" : "s were"} excluded from logo frequencies.`);
  }
  if (inputFormat !== "alignment" && options.bootstrapReplicates > 0) {
    warnings.push("Bootstrap confidence intervals require individual aligned sequences and were not calculated from the position table.");
  }
  if (inputFormat === "frequencies" && tableRows.some((row) => row.total == null) && options.correction !== "none") {
    warnings.push("Small-sample correction was not applied to frequency rows without a sample-size column.");
  }
  if (inputFormat === "frequencies" && tableRows.some((row) => row.total == null)) {
    warnings.push("Frequency rows without an n/sample-size column have unknown residue counts and effective sample size.");
  }

  let weights = null;
  let columns;
  if (records) {
    context.reportProgress?.({ phase: "calculating-columns", progress: 0.12 });
    weights = options.sequenceWeighting === "henikoff"
      ? await calculateHenikoffWeights(records, alphabet, options.ambiguousPolicy, context)
      : new Array(records.length).fill(1);
    columns = [];
    for (let columnIndex = 0; columnIndex < records[0].sequence.length; columnIndex += 1) {
      if (columnIndex % 250 === 0) {
        context.throwIfCancelled?.();
        context.reportProgress?.({ phase: "calculating-columns", progress: 0.12 + 0.1 * (columnIndex / records[0].sequence.length) });
        await context.yieldIfNeeded?.();
      }
      columns.push(summarizeColumnFromRows(records, columnIndex, weights, alphabet, options));
    }
    context.reportProgress?.({ phase: "calculating-context", progress: 0.24 });
    await addAlignmentLocalComplexity(columns, records, alphabet, weights, context);
  } else {
    columns = columnsFromPositionTable(tableRows, alphabet, inputFormat, options);
  }
  addLocalRelativeConservation(columns);

  context.reportProgress?.({ phase: "calculating-columns", progress: 0.32 });
  const bootstrap = records
    ? await addBootstrapIntervals(columns, records, alphabet, options, context)
    : null;
  context.throwIfCancelled?.();
  const sequenceCount = records?.length ?? null;
  const logo = {
    figureType: "sequence-logo",
    version: 1,
    title: options.title || (alphabet === "protein" ? "Protein sequence logo" : `${alphabet.toUpperCase()} sequence logo`),
    sourceType: inputFormat,
    alphabet,
    symbols,
    sequenceCount,
    alignmentLength: columns.length,
    firstPosition: columns[0]?.position ?? options.firstPosition,
    weighting: records ? options.sequenceWeighting : "none",
    ambiguousPolicy: options.ambiguousPolicy,
    correction: options.correction,
    bootstrap,
    columns,
    appearance: {
      mode: "information",
      colorScheme: alphabet === "protein" ? "chemistry" : "classic",
      wrapColumns: alphabet === "protein" ? 30 : 40,
      showAxis: true,
      showTitle: true,
      showEffectiveSampleSize: false,
      showConfidenceInterval: Boolean(bootstrap),
      showLocalComplexity: false,
      showLocalRelativeConservation: false,
      scaleWidthByCoverage: false
    }
  };
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return {
    logo,
    warnings,
    recordsProcessed: sequenceCount ?? columns.length,
    symbolsProcessed: records ? records.length * records[0].sequence.length : columns.length * symbols.length
  };
}
