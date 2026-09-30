import { createSeededRandom } from "../core/random-sequence.js";
import { measuredPeakShape, measuredPeakHeight, makeMeasuredBackground, SANGER_SIGNAL_PROFILE } from "../core/sanger-signal-model.js";

const sangerSessionSeparator = "---SMS3-SANGER-SESSION-PART---";
const syntheticAmplicon = "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGTTCCGATGACCTGCAGGCTTATCACCATTTTCACGCGCACAGGCCGGCCGACTTTCCCATGACCGTTAACGACGCTACGTTGACCTGACTGGA";
const syntheticChannels = ["A", "C", "G", "T"];
const syntheticComplements = { A: "T", C: "G", G: "C", T: "A" };

function reverseComplement(sequence) {
  return sequence
    .split("")
    .reverse()
    .map((base) => syntheticComplements[base] ?? "N")
    .join("");
}

function makeSyntheticTrace({ name, source, bases, mixedPeaks = {}, qualityOverrides = {}, baseEffects = {}, channelFractions }) {
  // Reuse the simulator's public-AB1-informed profile. Fixed seeds keep bundled
  // examples reproducible; calls and illustrative qualities retain the example
  // cases for editing, clipping, overlaps and reference-coordinate checks.
  const seed = `sanger-example-v2:${name}`;
  const random = createSeededRandom(seed);
  const basePositions = bases.split("").map((_, index) => 24 + index * 16);
  const sampleCount = basePositions[basePositions.length - 1] + 28;
  const traces = Object.fromEntries(syntheticChannels.map((channel) => [channel, new Array(sampleCount).fill(0)]));
  const qualities = bases.split("").map((_, index) =>
    qualityOverrides[index + 1] ?? (mixedPeaks[index + 1] ? 24 : 38 + (index % 7))
  );

  bases.split("").forEach((base, baseIndex) => {
    const center = basePositions[baseIndex];
    const mixed = mixedPeaks[baseIndex + 1] ?? {};
    const quality = qualities[baseIndex];
    const suppliedEffect = typeof baseEffects === "function"
      ? baseEffects(baseIndex + 1, bases.length, base)
      : baseEffects[baseIndex + 1] ?? {};
    const effect = { ...(quality <= 12 ? { amplitudeScale: 0.45, sigma: 5, noiseFraction: 0.24 } : {}), ...suppliedEffect };
    const primaryAmplitude = 1000 * (effect.amplitudeScale ?? 1);
    for (const channel of syntheticChannels) {
      const shape = measuredPeakShape(random, 16);
      const widthScale = (effect.sigma ?? 3.6) / 3.6;
      const apex = center + shape.centerOffset;
      const secondaryFraction = mixed.secondary?.[channel] ?? effect.secondary?.[channel] ?? 0;
      const channelAmplitude = (channelFractions
        ? primaryAmplitude * (channelFractions[baseIndex][channel] ?? effect.noiseFraction ?? 0.025)
        : channel === base
        ? primaryAmplitude
        : primaryAmplitude * (base === "N" ? 0.25 : secondaryFraction || effect.noiseFraction || 0.025)) * measuredPeakHeight(random, 0.25);
      for (let sampleIndex = Math.max(0, center - 25); sampleIndex < Math.min(sampleCount, center + 24); sampleIndex += 1) {
        const distance = sampleIndex + 1 - apex;
        const sigma = (distance < 0 ? shape.leftSigma : shape.rightSigma) * widthScale;
        traces[channel][sampleIndex] += channelAmplitude * Math.exp(-(distance * distance) / (2 * sigma * sigma));
      }
    }
  });

  syntheticChannels.forEach((channel) => {
    const background = makeMeasuredBackground(random);
    traces[channel] = traces[channel].map((value, sampleIndex) =>
      Math.round(value + 10 * background(sampleIndex))
    );
  });

  return {
    format: "sms3-sanger-trace-v1",
    traceMode: "simulated-channels",
    name,
    source: `${source} Signal profile: ${SANGER_SIGNAL_PROFILE}; seed: ${seed}. Synthetic quality scores.`,
    bases,
    basePositions,
    qualities,
    traces
  };
}

function lowQualityEnds(baseCount, prefixLength, suffixLength, lowQuality = 9) {
  const overrides = {};
  for (let index = 1; index <= prefixLength; index += 1) {
    overrides[index] = lowQuality;
  }
  for (let index = baseCount - suffixLength + 1; index <= baseCount; index += 1) {
    overrides[index] = lowQuality;
  }
  return overrides;
}

function replaceBaseAtOneBased(sequence, position, base) {
  return `${sequence.slice(0, position - 1)}${base}${sequence.slice(position)}`;
}

function insertBaseAfterOneBased(sequence, position, base) {
  return `${sequence.slice(0, position)}${base}${sequence.slice(position)}`;
}

function deleteBaseAtOneBased(sequence, position) {
  return `${sequence.slice(0, position - 1)}${sequence.slice(position)}`;
}

let cachedSangerTraceExample = null;
let cachedSangerTraceAssemblyExample = null;
let cachedSangerTraceReferenceComparisonExample = null;

function makeSangerTraceAssemblyExample() {
  const assemblyForwardRead = makeSyntheticTrace({
    name: "synthetic_pcr_forward_read",
    source: "Simulated trace from a 125 bp amplicon; overlaps the middle and reverse reads.",
    bases: syntheticAmplicon.slice(0, 110)
  });

  const middleBases = syntheticAmplicon.slice(44, 110);
  const alternateBase = middleBases[19] === "A" ? "G" : "A";
  const alternate = replaceBaseAtOneBased(middleBases, 20, alternateBase);
  const ambiguity = { AC: "M", AG: "R", AT: "W", CG: "S", CT: "Y", GT: "K" }[[middleBases[19], alternateBase].sort().join("")];
  const assemblyMiddleRead = makeSyntheticTrace({
    name: "synthetic_pcr_middle_read",
    source: "Simulated overlapping read with one mixed SNP, retained as an IUPAC base call.",
    bases: replaceBaseAtOneBased(middleBases, 20, ambiguity),
    channelFractions: [...middleBases].map((base, i) => Object.fromEntries(syntheticChannels.map(channel =>
      [channel, (channel === base ? 0.55 : 0) + (channel === alternate[i] ? 0.45 : 0)]))),
    qualityOverrides: { 20: 18 }
  });

  const assemblyReverseRead = makeSyntheticTrace({
    name: "synthetic_pcr_reverse_read",
    source: "Simulated reverse-orientation trace from the same amplicon.",
    bases: reverseComplement(syntheticAmplicon.slice(78, 125)),
    mixedPeaks: {
      31: { secondary: { A: 0.46 } }
    }
  });

  return [
    JSON.stringify(assemblyForwardRead, null, 2),
    JSON.stringify(assemblyMiddleRead, null, 2),
    JSON.stringify(assemblyReverseRead, null, 2),
    ""
  ].join(`\n${sangerSessionSeparator}\n`);
}

function makeSangerTraceReferenceComparisonExample() {
  const comparisonForwardPrefix = "CCCCCC";
  const comparisonForwardSuffix = "AAAAA";
  const comparisonForwardStart = 9;
  const comparisonForwardSegment = syntheticAmplicon.slice(comparisonForwardStart - 1, 94);
  const comparisonForwardMutatedSegment = replaceBaseAtOneBased(
    comparisonForwardSegment,
    64 - comparisonForwardStart + 1,
    "T"
  );
  const comparisonForwardIndelSegment = insertBaseAfterOneBased(
    comparisonForwardMutatedSegment,
    72 - comparisonForwardStart + 1,
    "A"
  );
  const comparisonForwardBases = `${comparisonForwardPrefix}${comparisonForwardIndelSegment}${comparisonForwardSuffix}`;
  const comparisonForwardSnpBase = comparisonForwardPrefix.length + (64 - comparisonForwardStart + 1);
  const comparisonForwardInsertedBase = comparisonForwardPrefix.length + (72 - comparisonForwardStart + 1) + 1;

  const comparisonForwardRead = makeSyntheticTrace({
    name: "amplicon_forward_dirty_ends",
    source: "Synthetic single-template forward trace with low-quality terminal bases, one mismatch, and one inserted base relative to the reference.",
    bases: comparisonForwardBases,
    qualityOverrides: {
      ...lowQualityEnds(comparisonForwardBases.length, comparisonForwardPrefix.length, comparisonForwardSuffix.length),
      [comparisonForwardSnpBase]: 24,
      [comparisonForwardInsertedBase]: 24
    }
  });

  const comparisonReversePrefix = "TNNGA";
  const comparisonReverseSuffix = "CCNNT";
  const comparisonReverseStart = 48;
  const comparisonReverseSegment = syntheticAmplicon.slice(comparisonReverseStart - 1, 122);
  const comparisonReverseMutatedSegment = replaceBaseAtOneBased(
    comparisonReverseSegment,
    96 - comparisonReverseStart + 1,
    "A"
  );
  const comparisonReverseIndelSegment = deleteBaseAtOneBased(
    comparisonReverseMutatedSegment,
    108 - comparisonReverseStart + 1
  );
  const comparisonReverseCore = reverseComplement(comparisonReverseIndelSegment);
  const comparisonReverseBases = `${comparisonReversePrefix}${comparisonReverseCore}${comparisonReverseSuffix}`;
  const comparisonReverseSnpBase = comparisonReversePrefix.length + comparisonReverseCore.length - (96 - comparisonReverseStart + 1) + 1;

  const comparisonReverseRead = makeSyntheticTrace({
    name: "amplicon_reverse_dirty_ends",
    source: "Synthetic single-template opposite-strand trace with low-quality terminal bases, one mismatch, and one deleted base relative to the reference.",
    bases: comparisonReverseBases,
    qualityOverrides: {
      ...lowQualityEnds(comparisonReverseBases.length, comparisonReversePrefix.length, comparisonReverseSuffix.length),
      [comparisonReverseSnpBase]: 24
    }
  });

  const comparisonReference = `>synthetic_amplicon_reference\n${syntheticAmplicon}`;
  return [
    JSON.stringify(comparisonForwardRead, null, 2),
    JSON.stringify(comparisonReverseRead, null, 2),
    comparisonReference
  ].join(`\n${sangerSessionSeparator}\n`);
}

function makeSangerTraceReviewExample() {
  const reviewTraceSequence = Array.from({ length: Math.ceil(800 / syntheticAmplicon.length) }, (_, index) => {
    const offset = (index * 17) % syntheticAmplicon.length;
    return `${syntheticAmplicon.slice(offset)}${syntheticAmplicon.slice(0, offset)}`;
  }).join("").slice(0, 800);

  // Apply edits in reference coordinates, then mix by sequencing cycle. The
  // deletion advances the second template by three bases; a nearby three-base
  // insertion restores register at base 151, keeping the mixed region compact.
  let secondTemplate = reviewTraceSequence;
  for (const position of [65, 280, 620]) {
    secondTemplate = replaceBaseAtOneBased(secondTemplate, position,
      secondTemplate[position - 1] === "A" ? "G" : "A");
  }
  secondTemplate = secondTemplate.slice(0, 120) + secondTemplate.slice(123, 150) +
    "TGC" + secondTemplate.slice(150);
  const ambiguityCodes = { AC: "M", AG: "R", AT: "W", CG: "S", CT: "Y", GT: "K" };
  const channelFractions = [];
  const mixedQualities = {};
  const calls = [...reviewTraceSequence].map((base, index) => {
    const second = secondTemplate[index];
    const fractions = { [base]: 0.55 };
    if (second) fractions[second] = (fractions[second] ?? 0) + 0.45;
    channelFractions.push(fractions);
    if (second && second !== base) {
      mixedQualities[index + 1] = 18;
      return ambiguityCodes[[base, second].sort().join("")];
    }
    return base;
  }).join("");

  function reviewTraceBaseEffect(position, total) {
    if (position <= 36) {
      return {
        amplitudeScale: 0.48 + position * 0.012,
        sigma: 5.2 - Math.min(position, 36) * 0.045,
        noiseFraction: Math.max(0.16, 0.42 - position * 0.006)
      };
    }
    if (position > total - 54) {
      const tailDistance = position - (total - 54);
      return {
        amplitudeScale: Math.max(0.16, 0.62 - tailDistance * 0.009),
        sigma: 3.2 + tailDistance * 0.018,
        noiseFraction: Math.min(0.24, 0.09 + tailDistance * 0.003)
      };
    }
    return {};
  }

  const reviewTraceRead = makeSyntheticTrace({
    name: "synthetic_800bp_sanger_read",
    source: "Simulated 800-base read from a 55:45 template mixture. The second template has SNPs at reference bases 65, 280 and 620, deletion 121–123, and a TGC insertion after reference base 150. The templates return to register at base 151. Noisy early peaks and a low-signal tail support clipping practice.",
    bases: calls,
    channelFractions,
    qualityOverrides: {
      ...mixedQualities,
      ...lowQualityEnds(800, 36, 54, 12)
    },
    baseEffects: reviewTraceBaseEffect
  });

  return JSON.stringify(reviewTraceRead, null, 2);
}

export function getSangerTraceExample() {
  cachedSangerTraceExample ??= makeSangerTraceReviewExample();
  return cachedSangerTraceExample;
}

export function getSangerTraceAssemblyExample() {
  cachedSangerTraceAssemblyExample ??= makeSangerTraceAssemblyExample();
  return cachedSangerTraceAssemblyExample;
}

export function getSangerTraceReferenceComparisonExample() {
  cachedSangerTraceReferenceComparisonExample ??= makeSangerTraceReferenceComparisonExample();
  return cachedSangerTraceReferenceComparisonExample;
}
