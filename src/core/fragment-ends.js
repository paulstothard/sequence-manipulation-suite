import { complementDnaRnaSequence } from "./sequence.js";

const END_CHEMISTRY_VALUES = new Set(["present", "absent", "blocked", "unknown"]);

function reverseComplement(sequence) {
  return Array.from(complementDnaRnaSequence(sequence, { preserveCase: false })).reverse().join("");
}

export function normalizeEndChemistryValue(value, fallback = "unknown") {
  const normalized = String(value || "").toLowerCase();
  return END_CHEMISTRY_VALUES.has(normalized) ? normalized : fallback;
}

function defaultEndChemistry(source) {
  if (source === "restriction") {
    return { fivePrimePhosphate: "present", threePrimeHydroxyl: "present" };
  }
  if (source === "primer") {
    return { fivePrimePhosphate: "absent", threePrimeHydroxyl: "present" };
  }
  return { fivePrimePhosphate: "unknown", threePrimeHydroxyl: "present" };
}

export function withDefaultEndChemistry(end, source = end?.kind) {
  const defaults = defaultEndChemistry(source);
  return {
    ...end,
    fivePrimePhosphate: normalizeEndChemistryValue(end?.fivePrimePhosphate, defaults.fivePrimePhosphate),
    threePrimeHydroxyl: normalizeEndChemistryValue(end?.threePrimeHydroxyl, defaults.threePrimeHydroxyl)
  };
}

export function endStrandPolarities(side) {
  return side === "right"
    ? { top: "3 prime", bottom: "5 prime" }
    : { top: "5 prime", bottom: "3 prime" };
}

export function protrudingStrandForGeometry(overhang, side) {
  if (overhang === "5 prime") return side === "right" ? "bottom" : "top";
  if (overhang === "3 prime") return side === "right" ? "top" : "bottom";
  return "";
}

function physicalSequenceFromLegacy(end, side) {
  const sequence = String(end?.overhangSequence || "").toUpperCase();
  return protrudingStrandForGeometry(String(end?.overhang || "").toLowerCase(), side) === "bottom"
    ? reverseComplement(sequence)
    : sequence;
}

function endTerminusChemistry(end, polarity) {
  return polarity === "5 prime"
    ? { fivePrimePhosphate: normalizeEndChemistryValue(end?.fivePrimePhosphate) }
    : { threePrimeHydroxyl: normalizeEndChemistryValue(end?.threePrimeHydroxyl) };
}

function legacyGeometryFromTermini(termini) {
  const protruding = [termini?.top, termini?.bottom].filter((terminus) => terminus?.protruding);
  if (protruding.length === 0) return { overhang: "blunt", overhangSequence: "", protrudingStrand: "" };
  if (protruding.length !== 1) return { overhang: "unknown", overhangSequence: "", protrudingStrand: "" };
  const terminus = protruding[0];
  const physicalSequence = String(terminus.overhangSequence || "").toUpperCase();
  return {
    overhang: terminus.polarity,
    overhangSequence: terminus.strand === "bottom" ? reverseComplement(physicalSequence) : physicalSequence,
    protrudingStrand: terminus.strand
  };
}

function makePhysicalTermini(end, side) {
  const safeSide = side === "right" ? "right" : "left";
  const polarities = endStrandPolarities(safeSide);
  const overhang = String(end?.overhang || "unknown").toLowerCase();
  const protrudingStrand = protrudingStrandForGeometry(overhang, safeSide);
  const physicalSequence = physicalSequenceFromLegacy(end, safeSide);
  const candidate = end?.termini?.version === 1 && end.termini.side === safeSide ? end.termini : null;
  const candidateGeometry = candidate ? legacyGeometryFromTermini(candidate) : null;
  const existing = candidateGeometry &&
    candidateGeometry.overhang === overhang &&
    candidateGeometry.overhangSequence === String(end?.overhangSequence || "").toUpperCase()
    ? candidate
    : null;
  const makeTerminus = (strand) => {
    const polarity = polarities[strand];
    const current = existing?.[strand] || {};
    const protruding = existing ? Boolean(current.protruding) : strand === protrudingStrand;
    return {
      ...current,
      strand,
      polarity,
      protruding,
      overhangSequence: protruding
        ? String(existing ? current.overhangSequence || "" : physicalSequence).toUpperCase()
        : "",
      ...endTerminusChemistry(end, polarity)
    };
  };
  return {
    version: 1,
    side: safeSide,
    top: makeTerminus("top"),
    bottom: makeTerminus("bottom")
  };
}

export function syncEndFromTermini(end, termini) {
  const geometry = legacyGeometryFromTermini(termini);
  const fivePrimeTerminus = [termini?.top, termini?.bottom].find((terminus) => terminus?.polarity === "5 prime");
  const threePrimeTerminus = [termini?.top, termini?.bottom].find((terminus) => terminus?.polarity === "3 prime");
  return {
    ...end,
    termini,
    overhang: geometry.overhang,
    overhangSequence: geometry.overhangSequence,
    fivePrimePhosphate: normalizeEndChemistryValue(fivePrimeTerminus?.fivePrimePhosphate),
    threePrimeHydroxyl: normalizeEndChemistryValue(threePrimeTerminus?.threePrimeHydroxyl),
    compatibilityKey: geometry.overhang === "blunt"
      ? "blunt"
      : `${geometry.overhang}:${geometry.overhangSequence}`
  };
}

export function withPhysicalEndModel(end, side) {
  if (!end) return end;
  const chemistry = withDefaultEndChemistry(end, end.kind);
  if (Array.isArray(chemistry.alternatives) && chemistry.alternatives.length > 0) {
    return {
      ...chemistry,
      alternatives: chemistry.alternatives.map((alternative) => withPhysicalEndModel(alternative, side))
    };
  }
  return syncEndFromTermini(chemistry, makePhysicalTermini(chemistry, side));
}

export function fragmentEndGeometry(end, side = end?.termini?.side || "left") {
  const physical = withPhysicalEndModel(end, side);
  const termini = physical?.termini;
  const protruding = [termini?.top, termini?.bottom].find((terminus) => terminus?.protruding);
  const overhang = protruding?.polarity || (physical?.overhang === "blunt" ? "blunt" : "unknown");
  return {
    overhang,
    sequence: String(protruding?.overhangSequence || "").toUpperCase(),
    protrudingStrand: protruding?.strand || "",
    termini
  };
}

export function fragmentDuplexMetrics(product = {}) {
  const topLength = Array.from(String(product.sequence || "")).length;
  const left = fragmentEndGeometry(product.ends?.left, "left");
  const right = fragmentEndGeometry(product.ends?.right, "right");
  const leftBottomExtension = left.protrudingStrand === "bottom" ? Array.from(left.sequence).length : 0;
  const rightBottomExtension = right.protrudingStrand === "bottom" ? Array.from(right.sequence).length : 0;
  const leftTopExtension = left.protrudingStrand === "top" ? Array.from(left.sequence).length : 0;
  const rightTopExtension = right.protrudingStrand === "top" ? Array.from(right.sequence).length : 0;
  const span = topLength + leftBottomExtension + rightBottomExtension;
  return {
    duplexSpan: span,
    strandLengths: {
      top: topLength,
      bottom: Math.max(0, span - leftTopExtension - rightTopExtension)
    }
  };
}

export function reverseComplementFragmentEnd(end, fromSide, toSide) {
  if (!end) return end;
  if (Array.isArray(end.alternatives) && end.alternatives.length > 0) {
    return {
      ...end,
      alternatives: end.alternatives.map((alternative) => reverseComplementFragmentEnd(alternative, fromSide, toSide))
    };
  }
  const physical = withPhysicalEndModel(end, fromSide);
  const polarities = endStrandPolarities(toSide);
  const swapTerminus = (terminus, strand) => ({
    ...terminus,
    strand,
    polarity: polarities[strand]
  });
  return syncEndFromTermini(physical, {
    version: 1,
    side: toSide,
    top: swapTerminus(physical.termini.bottom, "top"),
    bottom: swapTerminus(physical.termini.top, "bottom")
  });
}
