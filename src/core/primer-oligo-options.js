// One definition for the input controls and every calculation/export caller.
export const OLIGO_NUMERIC_OPTIONS = Object.freeze({
  sodiumMm: Object.freeze({ defaultValue: 50, min: 0, max: 2000, step: 1 }),
  magnesiumMm: Object.freeze({ defaultValue: 0, min: 0, max: 100, step: 0.1 }),
  dntpMm: Object.freeze({ defaultValue: 0, min: 0, max: 100, step: 0.1 }),
  // Keep the existing UI minimum and the legacy API's strictly positive range.
  oligoNm: Object.freeze({ defaultValue: 250, min: 0.001, max: 1000000, step: 1, exclusiveMinimum: 0 })
});
export const OLIGO_DEFAULTS = Object.freeze({
  moleculeType: "auto", tmModel: "basic",
  ...Object.fromEntries(Object.entries(OLIGO_NUMERIC_OPTIONS).map(([id, spec]) => [id, spec.defaultValue])),
  outputFormat: "tsv"
});
export const OLIGO_OUTPUT_FORMATS = Object.freeze(["report", "tsv", "reverse-complement-fasta", "analysis-json", "pair-tsv"]);

export function applyOligoOptionDefinitions(options) {
  return options.map(option => {
    const { exclusiveMinimum, ...control } = OLIGO_NUMERIC_OPTIONS[option.id] ?? {};
    return {
      ...option, ...control,
      ...(Object.hasOwn(OLIGO_DEFAULTS, option.id) ? { defaultValue: OLIGO_DEFAULTS[option.id] } : {}),
      ...(option.options ? { options: applyOligoOptionDefinitions(option.options) } : {})
    };
  });
}

export function normalizeOligoOptions(options = {}) {
  options = options && typeof options === "object" ? options : {};
  const normalized = {
    moleculeType: ["auto", "dna", "rna"].includes(options.moleculeType) ? options.moleculeType : OLIGO_DEFAULTS.moleculeType,
    tmModel: ["basic", "nearest-neighbor"].includes(options.tmModel) ? options.tmModel : OLIGO_DEFAULTS.tmModel
  };
  for (const [id, spec] of Object.entries(OLIGO_NUMERIC_OPTIONS)) {
    const supplied = options[id];
    const missing = supplied == null || (typeof supplied === "string" && supplied.trim() === "");
    const value = missing ? spec.defaultValue : typeof supplied === "number" || typeof supplied === "string" ? Number(supplied) : NaN;
    const tooLow = spec.exclusiveMinimum === undefined ? value < spec.min : value <= spec.exclusiveMinimum;
    if (!Number.isFinite(value) || tooLow || value > spec.max) throw new Error(`Invalid ${id}: enter a ${spec.exclusiveMinimum === undefined ? "nonnegative" : "positive"} concentration no greater than ${spec.max}.`);
    normalized[id] = value;
  }
  if (normalized.tmModel === "nearest-neighbor" && normalized.sodiumMm === 0 && normalized.magnesiumMm <= normalized.dntpMm) throw new Error("Nearest-neighbor Tm needs a positive effective salt concentration.");
  normalized.outputFormat = OLIGO_OUTPUT_FORMATS.includes(options.outputFormat) ? options.outputFormat : OLIGO_DEFAULTS.outputFormat;
  return normalized;
}
