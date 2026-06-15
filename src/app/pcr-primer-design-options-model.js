export const PCR_PRIMER_DESIGN_PRESETS = {
  "standard-pcr": {
    label: "Standard PCR",
    values: {
      minProductLength: 200,
      maxProductLength: 800,
      primerMinLength: 18,
      primerOptLength: 20,
      primerMaxLength: 24,
      primerMinTm: 57,
      primerOptTm: 60,
      primerMaxTm: 63,
      primerMinGc: 40,
      primerMaxGc: 60,
      gcClampMin: 1,
      gcClampMax: 4,
      maxThreePrimeComplementRun: 5,
      maxSelfComplementRun: 8,
      maxHairpinStem: 5
    }
  },
  "qpcr-short": {
    label: "qPCR / short amplicon",
    values: {
      minProductLength: 70,
      maxProductLength: 180,
      primerMinLength: 18,
      primerOptLength: 20,
      primerMaxLength: 24,
      primerMinTm: 58,
      primerOptTm: 60,
      primerMaxTm: 62,
      primerMinGc: 40,
      primerMaxGc: 60,
      gcClampMin: 1,
      gcClampMax: 3,
      maxThreePrimeComplementRun: 4,
      maxSelfComplementRun: 7,
      maxHairpinStem: 4
    }
  },
  "colony-screening": {
    label: "Colony PCR / screening",
    values: {
      minProductLength: 300,
      maxProductLength: 2500,
      primerMinLength: 18,
      primerOptLength: 22,
      primerMaxLength: 25,
      primerMinTm: 55,
      primerOptTm: 59,
      primerMaxTm: 64,
      primerMinGc: 35,
      primerMaxGc: 65,
      gcClampMin: 0,
      gcClampMax: 4,
      maxThreePrimeComplementRun: 6,
      maxSelfComplementRun: 9,
      maxHairpinStem: 6
    }
  },
  "sequencing-amplicon": {
    label: "Sequencing amplicon",
    values: {
      minProductLength: 500,
      maxProductLength: 1200,
      primerMinLength: 20,
      primerOptLength: 22,
      primerMaxLength: 24,
      primerMinTm: 58,
      primerOptTm: 62,
      primerMaxTm: 66,
      primerMinGc: 40,
      primerMaxGc: 65,
      gcClampMin: 1,
      gcClampMax: 4,
      maxThreePrimeComplementRun: 5,
      maxSelfComplementRun: 8,
      maxHairpinStem: 5
    }
  }
};

export const PCR_PRIMER_CONSTRAINT_DETAIL_IDS = [
  "templateRegions",
  "primerLength",
  "tmAndGc",
  "threePrimeAndClamp",
  "secondaryStructure",
  "advancedLimits"
];

export function formatPcrPrimerDesignSummary(values = {}) {
  const presetId = values.designPreset ?? "custom";
  const presetLabel = PCR_PRIMER_DESIGN_PRESETS[presetId]?.label ?? "Custom";
  const productMin = values.minProductLength ?? "200";
  const productMax = values.maxProductLength ?? "800";
  const primerMin = values.primerMinLength ?? "18";
  const primerMax = values.primerMaxLength ?? "24";
  const optTm = values.primerOptTm ?? "60";
  const gcMin = values.primerMinGc ?? "40";
  const gcMax = values.primerMaxGc ?? "60";
  const target = String(values.targetRegion ?? "").trim();
  const excluded = String(values.excludedRegions ?? "")
    .trim()
    .replace(/\s*[\r\n]+\s*/g, ", ");
  const regionText = [
    target ? `target ${target}` : "",
    excluded ? `excluded ${excluded}` : ""
  ].filter(Boolean);
  return `${presetLabel}: ${productMin}-${productMax} bp products, ${primerMin}-${primerMax} nt primers, Tm around ${optTm} C, GC ${gcMin}-${gcMax}%${regionText.length ? `; ${regionText.join("; ")}` : ""}.`;
}
