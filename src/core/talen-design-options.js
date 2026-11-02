import { effectiveToolLimit, normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

// One definition for controls, computation and exports. Disclosed ceilings use
// their normal values unless an audited disabled-limit ID removes enforcement.
export const TALEN_DESIGN_NUMERIC_OPTIONS = Object.freeze({
  minHalfSiteLength: { defaultValue: 15, min: 10, max: 25, step: 1 },
  maxHalfSiteLength: { defaultValue: 18, min: 10, max: 25, step: 1 },
  minSpacerLength: { defaultValue: 14, min: 5, max: 40, step: 1 },
  maxSpacerLength: { defaultValue: 20, min: 5, max: 40, step: 1 },
  contextBases: { defaultValue: 20, min: 0, max: 200, step: 1 },
  lineWidth: { defaultValue: 60, min: 1, max: Infinity, step: 1 },
  maxPairsPerRecord: { defaultValue: 100, min: 1, max: 2000, step: 1, resourceLimit: true },
  mapMaxPairsPerRecord: { defaultValue: 30, min: 1, max: 500, step: 1, fixedLimit: true },
  maxRecordLength: { defaultValue: 200000, min: 100, max: 10000000, step: 100, resourceLimit: true },
  maxCandidateWindows: { defaultValue: 2000000, min: 1000, max: 50000000, step: 1000, resourceLimit: true },
  maxReferenceRecordLength: { defaultValue: 500000, min: 100, step: 100, resourceLimit: true },
  maxIndexedReferenceBases: { defaultValue: 5000000, min: 1000, max: 50000000, step: 100000, resourceLimit: true }
});
for (const specification of Object.values(TALEN_DESIGN_NUMERIC_OPTIONS)) Object.freeze(specification);
export const TALEN_DESIGN_DEFAULTS = Object.freeze({
  ...Object.fromEntries(Object.entries(TALEN_DESIGN_NUMERIC_OPTIONS).map(([id, spec]) => [id, spec.defaultValue])),
  targetFeature: '', requireFivePrimeT: true, allowAmbiguousTargets: false,
  guanineRvd: 'NN', referenceGenomeMode: 'none', outputFormat: 'tsv'
});
export const TALEN_DESIGN_OUTPUT_FORMATS = Object.freeze(['reference-tsv', 'analysis-json', 'report', 'tsv', 'rvd-tsv', 'context-text', 'halfsite-fasta', 'text-map', 'svg-map', 'interactive-viewer']);

export function applyTalenDesignOptionDefinitions(options) {
  return options.map(option => {
    const { resourceLimit, fixedLimit, ...control } = TALEN_DESIGN_NUMERIC_OPTIONS[option.id] ?? {};
    return {
      ...option, ...control,
      ...(Object.hasOwn(TALEN_DESIGN_DEFAULTS, option.id) ? { defaultValue: TALEN_DESIGN_DEFAULTS[option.id] } : {}),
      ...(option.options ? { options: applyTalenDesignOptionDefinitions(option.options) } : {})
    };
  });
}

export function normalizeTalenDesignOptions(options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const disabledToolLimitIds = normalizeDisabledToolLimitIds('talen-target-finder', options.disabledToolLimitIds);
  const normalized = {};
  for (const [id, spec] of Object.entries(TALEN_DESIGN_NUMERIC_OPTIONS)) {
    // Empty/invalid values inherit defaults; zero remains a real value.
    const value = options[id];
    const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
    normalized[id] = spec.resourceLimit ? effectiveToolLimit({ disabledToolLimitIds }, id, spec.defaultValue)
      : spec.fixedLimit ? spec.defaultValue
        : Math.round(Math.max(spec.min, Math.min(spec.max, Number.isFinite(number) ? number : spec.defaultValue)));
  }
  normalized.maxHalfSiteLength = Math.max(normalized.minHalfSiteLength, normalized.maxHalfSiteLength);
  normalized.maxSpacerLength = Math.max(normalized.minSpacerLength, normalized.maxSpacerLength);
  return {
    ...normalized, disabledToolLimitIds,
    targetFeature: String(options.targetFeature ?? TALEN_DESIGN_DEFAULTS.targetFeature),
    requireFivePrimeT: typeof options.requireFivePrimeT === 'boolean' ? options.requireFivePrimeT : TALEN_DESIGN_DEFAULTS.requireFivePrimeT,
    allowAmbiguousTargets: typeof options.allowAmbiguousTargets === 'boolean' ? options.allowAmbiguousTargets : TALEN_DESIGN_DEFAULTS.allowAmbiguousTargets,
    guanineRvd: ['NN', 'NH'].includes(options.guanineRvd) ? options.guanineRvd : TALEN_DESIGN_DEFAULTS.guanineRvd,
    referenceGenomeMode: ['none', 'loaded', 'indexed', 'bgzf'].includes(options.referenceGenomeMode) ? options.referenceGenomeMode : TALEN_DESIGN_DEFAULTS.referenceGenomeMode,
    outputFormat: TALEN_DESIGN_OUTPUT_FORMATS.includes(options.outputFormat) ? options.outputFormat : TALEN_DESIGN_DEFAULTS.outputFormat
  };
}
