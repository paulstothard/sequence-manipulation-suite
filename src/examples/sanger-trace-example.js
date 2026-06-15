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

function makeSyntheticMeasuredTrace({ name, source, bases, mixedPeaks = {}, qualityOverrides = {}, baseEffects = {} }) {
  const basePositions = bases.split("").map((_, index) => 24 + index * 16);
  const sampleCount = basePositions[basePositions.length - 1] + 28;
  const traces = Object.fromEntries(syntheticChannels.map((channel) => [channel, new Array(sampleCount).fill(0)]));
  const qualities = bases.split("").map((_, index) =>
    qualityOverrides[index + 1] ?? (mixedPeaks[index + 1] ? 24 : 38 + (index % 7))
  );

  bases.split("").forEach((base, baseIndex) => {
    const center = basePositions[baseIndex];
    const mixed = mixedPeaks[baseIndex + 1] ?? {};
    const effect = typeof baseEffects === "function"
      ? baseEffects(baseIndex + 1, bases.length, base)
      : baseEffects[baseIndex + 1] ?? {};
    const quality = qualities[baseIndex];
    const primaryAmplitude = (760 + (quality * 7) + ((baseIndex % 5) * 18)) * (effect.amplitudeScale ?? 1);
    const sigma = effect.sigma ?? (mixed.secondary ? 3.1 : 2.45);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const x = sampleIndex + 1;
      const distance = x - center;
      const peak = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      syntheticChannels.forEach((channel) => {
        const secondaryFraction = mixed.secondary?.[channel] ?? effect.secondary?.[channel] ?? 0;
        const backgroundFraction = effect.noiseFraction ?? 0.04;
        const channelAmplitude = channel === base
          ? primaryAmplitude
          : Math.max(26, primaryAmplitude * (secondaryFraction || backgroundFraction));
        traces[channel][sampleIndex] += channelAmplitude * peak;
      });
    }
  });

  syntheticChannels.forEach((channel) => {
    traces[channel] = traces[channel].map((value, sampleIndex) =>
      Math.round(value + 7 + ((sampleIndex + channel.charCodeAt(0)) % 9))
    );
  });

  return {
    format: "sms3-sanger-trace-v1",
    traceMode: "measured-channels",
    name,
    source,
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
  const assemblyForwardRead = makeSyntheticMeasuredTrace({
    name: "synthetic_pcr_forward_read",
    source: "Synthetic measured-channel trace from a 125 bp amplicon; overlaps the middle and reverse reads.",
    bases: syntheticAmplicon.slice(0, 76),
    mixedPeaks: {
      64: { secondary: { T: 0.54 } }
    }
  });

  const assemblyMiddleRead = makeSyntheticMeasuredTrace({
    name: "synthetic_pcr_middle_read",
    source: "Synthetic measured-channel trace from the same amplicon; includes a visible C/T mixed peak in the overlap.",
    bases: syntheticAmplicon.slice(44, 110),
    mixedPeaks: {
      20: { secondary: { T: 0.58 } }
    }
  });

  const assemblyReverseRead = makeSyntheticMeasuredTrace({
    name: "synthetic_pcr_reverse_read",
    source: "Synthetic reverse-orientation measured-channel trace from the same amplicon.",
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

  const comparisonForwardRead = makeSyntheticMeasuredTrace({
    name: "amplicon_forward_dirty_ends",
    source: "Synthetic forward trace with low-quality terminal bases, one mismatch, and one inserted base relative to the reference.",
    bases: comparisonForwardBases,
    mixedPeaks: {
      [comparisonForwardSnpBase]: { secondary: { C: 0.38 } },
      [comparisonForwardInsertedBase]: { secondary: { G: 0.26, T: 0.18 } }
    },
    qualityOverrides: lowQualityEnds(comparisonForwardBases.length, comparisonForwardPrefix.length, comparisonForwardSuffix.length)
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

  const comparisonReverseRead = makeSyntheticMeasuredTrace({
    name: "amplicon_reverse_dirty_ends",
    source: "Synthetic opposite-strand trace with low-quality terminal bases, one mismatch, and one deleted base relative to the reference.",
    bases: comparisonReverseBases,
    mixedPeaks: {
      [comparisonReverseSnpBase]: { secondary: { G: 0.35 } }
    },
    qualityOverrides: lowQualityEnds(comparisonReverseBases.length, comparisonReversePrefix.length, comparisonReverseSuffix.length)
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

  const reviewTraceRead = makeSyntheticMeasuredTrace({
    name: "synthetic_800bp_sanger_read",
    source: "Synthetic 800 bp measured-channel trace with noisy early peaks and low-signal tail for testing wrapped Sanger chromatogram output and clipping.",
    bases: reviewTraceSequence,
    mixedPeaks: {
      165: { secondary: { T: 0.46 } },
      412: { secondary: { A: 0.42 } },
      646: { secondary: { C: 0.44 } }
    },
    qualityOverrides: {
      ...lowQualityEnds(800, 36, 54, 12),
      165: 18,
      412: 19,
      646: 17
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
