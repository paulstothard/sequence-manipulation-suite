import { plasmidCommonFeatureRecords } from "../reference-data/plasmid-common-features/records.js";

export const PLASMID_FEATURE_LIMITS = Object.freeze({
  maxInputCharacters: 5_000_000, maxComparisons: 500_000_000, maxHits: 100_000,
  maxRetainedCharacters: 26_214_400, maxOutputCharacters: 26_214_400,
  textMapBases: 1_000_000, textMapHits: 10_000,
  mapRecords: 12, mapTotalHits: 240, mapRecordHits: 80
});

export const PLASMID_FEATURE_DEFAULTS = Object.freeze({
  featureType: "all", featureId: "all", maxMismatches: 1,
  minIdentityPercent: 95, outputFormat: "svg-map"
});

export function normalizePlasmidFeatureOptions(options = {}) {
  options ??= {};
  const choice = (id, values) => values.includes(options[id]) ? options[id] : PLASMID_FEATURE_DEFAULTS[id];
  const numeric = (id, min, max, integer = false) => {
    const value = options[id] == null || String(options[id]).trim() === "" ? NaN : Number(options[id]);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, integer ? Math.trunc(value) : value)) : PLASMID_FEATURE_DEFAULTS[id];
  };
  return {
    featureType: choice("featureType", ["all", ...plasmidCommonFeatureRecords.map(r => r.type)]),
    featureId: choice("featureId", ["all", ...plasmidCommonFeatureRecords.map(r => r.id)]),
    maxMismatches: numeric("maxMismatches", 0, 10, true),
    minIdentityPercent: numeric("minIdentityPercent", 50, 100),
    outputFormat: choice("outputFormat", ["report", "tsv", "text-map", "svg-map", "interactive-viewer", "interactive-circular-viewer"])
  };
}
