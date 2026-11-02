import { effectiveToolLimit, normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

// Shared control/computation definitions. Only audited disabled-limit IDs can
// remove disclosed ceilings; legacy numeric overrides do not change them.
export const SIRNA_DESIGN_NUMERIC_OPTIONS = Object.freeze({
  targetLength: { defaultValue: 19, min: 19, max: 23, step: 1 },
  minGcPercent: { defaultValue: 30, min: 0, max: 100, step: 1, fractional: true },
  maxGcPercent: { defaultValue: 52, min: 0, max: 100, step: 1, fractional: true },
  skipFirstBases: { defaultValue: 0, min: 0, max: 1000000, step: 1 },
  maxCandidatesPerRecord: { defaultValue: 25, min: 1, max: 1000, step: 1, resourceLimit: true },
  maxRecordLength: { defaultValue: 200000, min: 100, max: 5000000, step: 1 },
  maxOffTargetMismatches: { defaultValue: 2, min: 0, max: 5, step: 1 },
  maxReferenceRecordLength: { defaultValue: 200000, min: 100, max: 5000000, step: 100, resourceLimit: true },
  maxIndexedReferenceBases: { defaultValue: 1000000, min: 1000, max: 10000000, step: 100000, resourceLimit: true },
  maxOffTargetMatchesPerCandidate: { defaultValue: 25, min: 1, max: 500, step: 1, resourceLimit: true },
  maxOffTargetRows: { defaultValue: 1000, min: 1, max: 10000, step: 100, resourceLimit: true },
  contextBases: { defaultValue: 20, min: 0, max: 100, step: 1 },
  lineWidth: { defaultValue: 60, min: 10, max: 200, step: 1 }
});
for (const specification of Object.values(SIRNA_DESIGN_NUMERIC_OPTIONS)) Object.freeze(specification);
export const SIRNA_DESIGN_DEFAULTS = Object.freeze({
  ...Object.fromEntries(Object.entries(SIRNA_DESIGN_NUMERIC_OPTIONS).map(([id, spec]) => [id, spec.defaultValue])),
  referenceSequenceType: 'genomic', seedLength: 7, intendedTranscriptIds: '',
  includeOverhangs: true, overhang: 'UU', searchReferenceOffTargets: false,
  referenceInputMode: 'pasted', outputFormat: 'tsv'
});
export const SIRNA_DESIGN_OUTPUT_FORMATS = Object.freeze(['analysis-json', 'duplex-fasta', 'duplex-text', 'seed-tsv', 'report', 'tsv', 'offtarget-tsv', 'guide-fasta', 'context-text']);

export function applySirnaDesignOptionDefinitions(options) {
  return options.map(option => {
    const { fractional, resourceLimit, ...control } = SIRNA_DESIGN_NUMERIC_OPTIONS[option.id] ?? {};
    return {
      ...option, ...control,
      ...(Object.hasOwn(SIRNA_DESIGN_DEFAULTS, option.id) ? { defaultValue: SIRNA_DESIGN_DEFAULTS[option.id] } : {}),
      ...(option.options ? { options: applySirnaDesignOptionDefinitions(option.options) } : {})
    };
  });
}

export function getIndexedReferenceFiles(options = {}) {
  const preferBgzf = options.referenceInputMode === 'indexed-bgzf';
  return {
    fastaFile: preferBgzf ? (options.indexedReferenceBgzfFile ?? options.indexedReferenceFastaFile) : (options.indexedReferenceFastaFile ?? options.indexedReferenceBgzfFile),
    faiFile: preferBgzf ? (options.indexedReferenceBgzfFaiFile ?? options.indexedReferenceFaiFile) : (options.indexedReferenceFaiFile ?? options.indexedReferenceBgzfFaiFile),
    gziFile: options.indexedReferenceGziFile
  };
}
export function hasIndexedReferenceOptions(options = {}) {
  const { fastaFile, faiFile } = getIndexedReferenceFiles(options);
  return Boolean(fastaFile?.slice && faiFile?.text);
}

export function normalizeSirnaDesignOptions(options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const disabledToolLimitIds = normalizeDisabledToolLimitIds('sirna-design', options.disabledToolLimitIds);
  const normalized = {};
  for (const [id, spec] of Object.entries(SIRNA_DESIGN_NUMERIC_OPTIONS)) {
    // Missing/empty/invalid values inherit defaults; explicit zero survives.
    const value = options[id];
    const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
    const bounded = Math.max(spec.min, Math.min(spec.max, Number.isFinite(number) ? number : spec.defaultValue));
    normalized[id] = spec.resourceLimit ? effectiveToolLimit({ disabledToolLimitIds }, id, spec.defaultValue)
      : spec.fractional ? bounded : Math.round(bounded);
  }
  normalized.maxGcPercent = Math.max(normalized.minGcPercent, normalized.maxGcPercent);
  const referenceInputMode = ['indexed', 'indexed-bgzf'].includes(options.referenceInputMode) ? 'indexed'
    : options.referenceInputMode === 'pasted' ? 'pasted'
      : hasIndexedReferenceOptions(options) ? 'indexed' : SIRNA_DESIGN_DEFAULTS.referenceInputMode;
  const intendedIds = options.intendedTranscriptIds ?? SIRNA_DESIGN_DEFAULTS.intendedTranscriptIds;
  return {
    ...normalized, disabledToolLimitIds, referenceInputMode,
    referenceSequenceType: ['genomic', 'transcripts'].includes(options.referenceSequenceType) ? options.referenceSequenceType : SIRNA_DESIGN_DEFAULTS.referenceSequenceType,
    seedLength: Number(options.seedLength) === 6 ? 6 : SIRNA_DESIGN_DEFAULTS.seedLength,
    intendedTranscriptIds: [...new Set((Array.isArray(intendedIds) ? intendedIds : String(intendedIds).split(/[\s,]+/)).filter(Boolean))],
    includeOverhangs: typeof options.includeOverhangs === 'boolean' ? options.includeOverhangs : SIRNA_DESIGN_DEFAULTS.includeOverhangs,
    overhang: String(options.overhang ?? SIRNA_DESIGN_DEFAULTS.overhang).toUpperCase().replace(/[^ACGU]/g, '').slice(0, 4) || SIRNA_DESIGN_DEFAULTS.overhang,
    searchReferenceOffTargets: typeof options.searchReferenceOffTargets === 'boolean' ? options.searchReferenceOffTargets : SIRNA_DESIGN_DEFAULTS.searchReferenceOffTargets,
    outputFormat: SIRNA_DESIGN_OUTPUT_FORMATS.includes(options.outputFormat) ? options.outputFormat : SIRNA_DESIGN_DEFAULTS.outputFormat
  };
}
