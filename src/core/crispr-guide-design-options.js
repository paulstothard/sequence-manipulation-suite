import { effectiveToolLimit, normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

// Shared by metadata and computation. Capacity disclosures retain their normal
// ceilings; only allowlisted disabled IDs remove a resource limit.
export const CRISPR_GUIDE_DESIGN_NUMERIC_OPTIONS = Object.freeze({
  guideLength: { defaultValue: 20, min: 16, max: 30, step: 1 },
  minGcPercent: { defaultValue: 35, min: 0, max: 100, step: 1, fractional: true },
  maxGcPercent: { defaultValue: 75, min: 0, max: 100, step: 1, fractional: true },
  maxCandidatesPerRecord: { defaultValue: 50, min: 1, max: 2000, step: 1, resourceLimit: true },
  maxRecordLength: { defaultValue: 500000, min: 100, max: 10000000, step: 1 },
  maxOffTargetMismatches: { defaultValue: 2, min: 0, max: 5, step: 1 },
  maxReferenceRecordLength: { defaultValue: 500000, min: 100, max: 10000000, step: 100, resourceLimit: true },
  maxIndexedReferenceBases: { defaultValue: 5000000, min: 1000, max: 50000000, step: 100000, resourceLimit: true },
  indexedReferenceChunkSize: { defaultValue: 200000, min: 10000, max: 1000000, step: 1 },
  maxOffTargetMatchesPerGuide: { defaultValue: 25, min: 1, max: 500, step: 1, resourceLimit: true },
  maxOffTargetRows: { defaultValue: 1000, min: 1, max: 10000, step: 100, resourceLimit: true },
  contextBases: { defaultValue: 20, min: 0, max: 200, step: 1 },
  lineWidth: { defaultValue: 60, min: 10, max: 200, step: 1 },
  mapMaxCandidatesPerRecord: { defaultValue: 80, min: 1, max: 500, step: 1, fixedLimit: true }
});
for (const specification of Object.values(CRISPR_GUIDE_DESIGN_NUMERIC_OPTIONS)) Object.freeze(specification);
export const CRISPR_GUIDE_DESIGN_DEFAULTS = Object.freeze({
  ...Object.fromEntries(Object.entries(CRISPR_GUIDE_DESIGN_NUMERIC_OPTIONS).map(([id, spec]) => [id, spec.defaultValue])),
  pamPreset: 'spcas9-ngg', customPamPattern: 'NGG', fivePrimeGPolicy: 'flag',
  allowAmbiguousCandidates: false, targetFeature: '', referencePamPolicy: 'expanded',
  searchReferenceOffTargets: false, referenceInputMode: 'pasted', outputFormat: 'tsv'
});
export const CRISPR_GUIDE_DESIGN_OUTPUT_FORMATS = Object.freeze(['analysis-json', 'bed', 'gff3', 'report', 'tsv', 'offtarget-tsv', 'guide-fasta', 'context-text', 'text-map', 'svg-map', 'interactive-viewer']);

export function applyCrisprGuideDesignOptionDefinitions(options) {
  return options.map(option => {
    const { fractional, resourceLimit, fixedLimit, ...control } = CRISPR_GUIDE_DESIGN_NUMERIC_OPTIONS[option.id] ?? {};
    return {
      ...option, ...control,
      ...(Object.hasOwn(CRISPR_GUIDE_DESIGN_DEFAULTS, option.id) ? { defaultValue: CRISPR_GUIDE_DESIGN_DEFAULTS[option.id] } : {}),
      ...(option.options ? { options: applyCrisprGuideDesignOptionDefinitions(option.options) } : {})
    };
  });
}

// Scope/citation note:
// This first production pass implements transparent local sequence review for
// CRISPR guide candidates. SpCas9 NGG-style PAM handling and the approximate
// cut-site convention follow the commonly used Streptococcus pyogenes Cas9
// model described in Jinek et al., Science 2012 and early genome-editing
// applications such as Cong et al., Science 2013 and Mali et al., Science 2013.
// Optional reference hit counting is implemented as an ungapped local guide+PAM
// mismatch comparison against user-supplied FASTA/reference text. It deliberately
// does not implement genome-wide activity or chromatin-aware specificity scoring.
const PAM_PRESETS = {
  "spcas9-ngg": {
    label: "SpCas9 NGG",
    nuclease: "SpCas9",
    pamPattern: "NGG",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: -3,
    description: "SpCas9-style 20 nt guide with a 3' NGG PAM."
  },
  "spcas9-ngn": {
    label: "SpG NGN",
    nuclease: "SpG",
    pamPattern: "NGN",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: -3,
    description: "Engineered SpG NGN PAM model (Walton et al. 2020); requires SpG protein, not wild-type SpCas9."
  },
  "spcas9-nag": {
    label: "SpCas9 NAG alternate",
    nuclease: "SpCas9 alternate PAM",
    pamPattern: "NAG",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: -3,
    description: "Alternate 3' NAG PAM review mode. Treat hits as lower-efficiency candidates unless externally validated."
  },
  "custom-3prime": {
    label: "Custom 3' PAM",
    nuclease: "Custom 3' PAM",
    pamPattern: "NGG",
    pamSide: "3prime",
    guideLength: 20,
    cutOffsetFromPamStart: null,
    description: "Custom 3' PAM scan. Cut position is not estimated."
  },
  "custom-5prime": {
    label: "Custom 5' PAM",
    nuclease: "Custom 5' PAM",
    pamPattern: "TTTV",
    pamSide: "5prime",
    guideLength: 23,
    cutOffsetFromPamStart: null,
    description: "Custom 5' PAM scan. Cut position is not estimated."
  }
};


function normalizeNumber(value, specification, fallback = specification.defaultValue) {
  // Missing/empty/non-numeric values inherit defaults; zero is a real value.
  const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  const bounded = Math.max(specification.min, Math.min(specification.max, Number.isFinite(number) ? number : fallback));
  return specification.fractional ? bounded : Math.round(bounded);
}

function getPamModel(options) {
  const presetId = Object.hasOwn(PAM_PRESETS, options.pamPreset) ? options.pamPreset : CRISPR_GUIDE_DESIGN_DEFAULTS.pamPreset;
  const preset = PAM_PRESETS[presetId];
  if (presetId === 'custom-3prime' || presetId === 'custom-5prime') {
    // Preserve the existing preset-specific fallback for old partial callers:
    // custom 5-prime without explicit custom fields means TTTV / 23 nt.
    const pattern = typeof options.customPamPattern === 'string' ? options.customPamPattern.toUpperCase().replace(/[^ACGTRYSWKMBDHVN]/g, '').slice(0, 12) : '';
    return { ...preset, pamPattern: pattern || preset.pamPattern, guideLength: normalizeNumber(options.guideLength, CRISPR_GUIDE_DESIGN_NUMERIC_OPTIONS.guideLength, preset.guideLength) };
  }
  return { ...preset };
}

export function getIndexedReferenceFiles(options = {}) {
  const preferBgzf = options.referenceInputMode === "indexed-bgzf";
  return {
    fastaFile: preferBgzf
      ? (options.indexedReferenceBgzfFile ?? options.indexedReferenceFastaFile)
      : (options.indexedReferenceFastaFile ?? options.indexedReferenceBgzfFile),
    faiFile: preferBgzf
      ? (options.indexedReferenceBgzfFaiFile ?? options.indexedReferenceFaiFile)
      : (options.indexedReferenceFaiFile ?? options.indexedReferenceBgzfFaiFile),
    gziFile: options.indexedReferenceGziFile
  };
}

export function hasIndexedReferenceOptions(options = {}) {
  const { fastaFile, faiFile } = getIndexedReferenceFiles(options);
  return Boolean(fastaFile?.slice && faiFile?.text);
}

export function normalizeCrisprGuideDesignOptions(options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const disabledToolLimitIds = normalizeDisabledToolLimitIds('crispr-guide-design', options.disabledToolLimitIds);
  const normalized = {};
  for (const [id, specification] of Object.entries(CRISPR_GUIDE_DESIGN_NUMERIC_OPTIONS)) {
    if (id === 'guideLength') continue; // Effective length belongs to the PAM model.
    normalized[id] = specification.resourceLimit
      ? effectiveToolLimit({ disabledToolLimitIds }, id, specification.defaultValue)
      : specification.fixedLimit ? specification.defaultValue : normalizeNumber(options[id], specification);
  }
  normalized.maxGcPercent = Math.max(normalized.minGcPercent, normalized.maxGcPercent);
  // An explicit modern policy wins. Legacy booleans are meaningful only when
  // no valid modern policy exists; false must keep its original off behavior.
  const fivePrimeGPolicy = ['off', 'flag', 'require'].includes(options.fivePrimeGPolicy) ? options.fivePrimeGPolicy
    : typeof options.preferFivePrimeG === 'boolean' ? (options.preferFivePrimeG ? 'flag' : 'off')
      : CRISPR_GUIDE_DESIGN_DEFAULTS.fivePrimeGPolicy;
  const referenceInputMode = ['indexed', 'indexed-bgzf'].includes(options.referenceInputMode) ? 'indexed'
    : options.referenceInputMode === 'pasted' ? 'pasted'
      : hasIndexedReferenceOptions(options) ? 'indexed' : CRISPR_GUIDE_DESIGN_DEFAULTS.referenceInputMode;
  const pamModel = getPamModel(options);
  const referencePamPolicy = options.referencePamPolicy === 'selected' ? 'selected' : CRISPR_GUIDE_DESIGN_DEFAULTS.referencePamPolicy;
  // SpCas9 tolerates NAG: Hsu et al. 2013, doi:10.1038/nbt.2647.
  const referencePamModel = { ...pamModel, pamPattern: referencePamPolicy === 'expanded' && ['SpCas9', 'SpCas9 alternate PAM'].includes(pamModel.nuclease) ? 'NRG' : pamModel.pamPattern };
  return {
    ...normalized, disabledToolLimitIds, pamModel, referencePamModel, referencePamPolicy, referenceInputMode,
    pamPreset: Object.hasOwn(PAM_PRESETS, options.pamPreset) ? options.pamPreset : CRISPR_GUIDE_DESIGN_DEFAULTS.pamPreset,
    customPamPattern: pamModel.pamPattern, guideLength: pamModel.guideLength,
    targetFeature: String(options.targetFeature ?? CRISPR_GUIDE_DESIGN_DEFAULTS.targetFeature),
    fivePrimeGPolicy, preferFivePrimeG: fivePrimeGPolicy === 'flag', requireFivePrimeG: fivePrimeGPolicy === 'require',
    allowAmbiguousCandidates: typeof options.allowAmbiguousCandidates === 'boolean' ? options.allowAmbiguousCandidates : CRISPR_GUIDE_DESIGN_DEFAULTS.allowAmbiguousCandidates,
    searchReferenceOffTargets: typeof options.searchReferenceOffTargets === 'boolean' ? options.searchReferenceOffTargets : CRISPR_GUIDE_DESIGN_DEFAULTS.searchReferenceOffTargets,
    outputFormat: CRISPR_GUIDE_DESIGN_OUTPUT_FORMATS.includes(options.outputFormat) ? options.outputFormat : CRISPR_GUIDE_DESIGN_DEFAULTS.outputFormat
  };
}
