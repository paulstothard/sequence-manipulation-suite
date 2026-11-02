import { effectiveToolLimit, normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

// One definition for UI controls, presets and every computation entry point.
// Numeric resource ceilings use these defaults even for old saved overrides;
// recognized disabled-limit IDs are the explicit way to remove a ceiling.
export const PCR_PRIMER_DESIGN_NUMERIC_OPTIONS = Object.freeze({
  minProductLength: { defaultValue: 200, min: 40, max: 100000, step: 1 },
  maxProductLength: { defaultValue: 800, min: 40, max: 100000, step: 1 },
  primerMinLength: { defaultValue: 18, min: 12, max: 40, step: 1 },
  primerOptLength: { defaultValue: 20, min: 12, max: 40, step: 1 },
  primerMaxLength: { defaultValue: 24, min: 12, max: 40, step: 1 },
  primerMinTm: { defaultValue: 57, min: 20, max: 95, step: 0.1 },
  primerOptTm: { defaultValue: 60, min: 20, max: 95, step: 0.1 },
  primerMaxTm: { defaultValue: 63, min: 20, max: 95, step: 0.1 },
  primerMinGc: { defaultValue: 40, min: 0, max: 100, step: 1 },
  primerMaxGc: { defaultValue: 60, min: 0, max: 100, step: 1 },
  gcClampMin: { defaultValue: 1, min: 0, max: 5, step: 1 },
  gcClampMax: { defaultValue: 4, min: 0, max: 5, step: 1 },
  maxSelfComplementRun: { defaultValue: 8, min: 2, max: 20, step: 1 },
  maxThreePrimeComplementRun: { defaultValue: 5, min: 1, max: 20, step: 1 },
  maxHairpinStem: { defaultValue: 5, min: 1, max: 20, step: 1 },
  returnCount: { defaultValue: 10, min: 1, max: 5000, step: 1 },
  lineWidth: { defaultValue: 60, min: 10, max: 200, step: 1 },
  maxTemplateLength: { defaultValue: 20000, min: 100, step: 100, resourceLimit: true },
  maxPairsToEvaluate: { defaultValue: 250000, min: 1000, step: 1000, resourceLimit: true },
  maxReferenceRecordLength: { defaultValue: 500000, min: 1000, step: 1000, resourceLimit: true },
  maxIndexedReferenceBases: { defaultValue: 5000000, min: 1000, step: 1000, resourceLimit: true }
});
for (const specification of Object.values(PCR_PRIMER_DESIGN_NUMERIC_OPTIONS)) Object.freeze(specification);

export const PCR_PRIMER_DESIGN_DEFAULTS = Object.freeze({
  ...Object.fromEntries(Object.entries(PCR_PRIMER_DESIGN_NUMERIC_OPTIONS).map(([id, spec]) => [id, spec.defaultValue])),
  targetFeature: '', featureTargetMode: 'flank', targetRegion: '', excludedRegions: '',
  outputFormat: 'tsv', designPreset: 'standard-pcr', referenceGenomeMode: 'none'
});
export const PCR_PRIMER_DESIGN_OUTPUT_FORMATS = Object.freeze(['report', 'analysis-json', 'tsv', 'primer-fasta', 'product-fasta', 'interactive-viewer', 'interactive-circular-viewer']);

export function applyPcrPrimerDesignOptionDefinitions(options) {
  return options.map(option => {
    const specification = PCR_PRIMER_DESIGN_NUMERIC_OPTIONS[option.id];
    const { resourceLimit, ...control } = specification ?? {};
    return {
      ...option, ...control,
      ...(Object.hasOwn(PCR_PRIMER_DESIGN_DEFAULTS, option.id) ? { defaultValue: PCR_PRIMER_DESIGN_DEFAULTS[option.id] } : {}),
      ...(option.options ? { options: applyPcrPrimerDesignOptionDefinitions(option.options) } : {})
    };
  });
}

export function normalizePcrPrimerDesignOptions(options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const disabledToolLimitIds = normalizeDisabledToolLimitIds('pcr-primer-design', options.disabledToolLimitIds);
  const normalized = {};
  for (const [id, specification] of Object.entries(PCR_PRIMER_DESIGN_NUMERIC_OPTIONS)) {
    const { defaultValue, min, max = Infinity, step, resourceLimit } = specification;
    if (resourceLimit) {
      normalized[id] = effectiveToolLimit({ disabledToolLimitIds }, id, defaultValue);
      continue;
    }
    const value = options[id];
    // Missing/empty/invalid values inherit defaults. Preserve numeric zero;
    // booleans/objects are not numeric settings. Fractional GC remains valid.
    const number = (typeof value === 'number' || (typeof value === 'string' && value.trim())) ? Number(value) : NaN;
    const bounded = Math.max(min, Math.min(max, Number.isFinite(number) ? number : defaultValue));
    normalized[id] = step === 1 && !id.endsWith('Gc') ? Math.round(bounded) : bounded;
  }
  for (const [minimum, maximum, optimum] of [
    ['minProductLength', 'maxProductLength'], ['primerMinLength', 'primerMaxLength', 'primerOptLength'],
    ['primerMinTm', 'primerMaxTm', 'primerOptTm'], ['primerMinGc', 'primerMaxGc'], ['gcClampMin', 'gcClampMax']
  ]) {
    normalized[maximum] = Math.max(normalized[minimum], normalized[maximum]);
    if (optimum) normalized[optimum] = Math.max(normalized[minimum], Math.min(normalized[maximum], normalized[optimum]));
  }
  return {
    ...normalized, disabledToolLimitIds,
    targetFeature: String(options.targetFeature ?? PCR_PRIMER_DESIGN_DEFAULTS.targetFeature),
    featureTargetMode: ['flank', 'within'].includes(options.featureTargetMode) ? options.featureTargetMode : PCR_PRIMER_DESIGN_DEFAULTS.featureTargetMode,
    targetRegion: String(options.targetRegion ?? PCR_PRIMER_DESIGN_DEFAULTS.targetRegion).trim(),
    excludedRegions: String(options.excludedRegions ?? PCR_PRIMER_DESIGN_DEFAULTS.excludedRegions).trim(),
    outputFormat: PCR_PRIMER_DESIGN_OUTPUT_FORMATS.includes(options.outputFormat) ? options.outputFormat : PCR_PRIMER_DESIGN_DEFAULTS.outputFormat,
    designPreset: (Object.hasOwn(PCR_PRIMER_DESIGN_PRESETS, options.designPreset) || options.designPreset === 'custom') ? options.designPreset : PCR_PRIMER_DESIGN_DEFAULTS.designPreset,
    referenceGenomeMode: ['none', 'loaded', 'indexed', 'bgzf'].includes(options.referenceGenomeMode) ? options.referenceGenomeMode : PCR_PRIMER_DESIGN_DEFAULTS.referenceGenomeMode
  };
}

const standardPresetValues = Object.freeze(Object.fromEntries([
  "minProductLength", "maxProductLength", "primerMinLength", "primerOptLength", "primerMaxLength",
  "primerMinTm", "primerOptTm", "primerMaxTm", "primerMinGc", "primerMaxGc", "gcClampMin", "gcClampMax",
  "maxThreePrimeComplementRun", "maxSelfComplementRun", "maxHairpinStem"
].map(id => [id, PCR_PRIMER_DESIGN_DEFAULTS[id]])));
function preset(label, overrides = {}) {
  return Object.freeze({ label, values: Object.freeze({ ...standardPresetValues, ...overrides }) });
}
export const PCR_PRIMER_DESIGN_PRESETS = Object.freeze({
  "standard-pcr": preset("Standard PCR"),
  "qpcr-short": preset("qPCR / short amplicon", {
    minProductLength: 70, maxProductLength: 180, primerMinTm: 58, primerMaxTm: 62,
    gcClampMax: 3, maxThreePrimeComplementRun: 4, maxSelfComplementRun: 7, maxHairpinStem: 4
  }),
  "colony-screening": preset("Colony PCR / screening", {
    minProductLength: 300, maxProductLength: 2500, primerOptLength: 22, primerMaxLength: 25,
    primerMinTm: 55, primerOptTm: 59, primerMaxTm: 64, primerMinGc: 35, primerMaxGc: 65,
    gcClampMin: 0, maxThreePrimeComplementRun: 6, maxSelfComplementRun: 9, maxHairpinStem: 6
  }),
  "sequencing-amplicon": preset("Sequencing amplicon", {
    minProductLength: 500, maxProductLength: 1200, primerMinLength: 20, primerOptLength: 22,
    primerMinTm: 58, primerOptTm: 62, primerMaxTm: 66, primerMaxGc: 65
  })
});
