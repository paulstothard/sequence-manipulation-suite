import { normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

export const VECTOR_SCAN_LIMITS = Object.freeze({ inputCharacters: 10_000_000, queryWindows: 5_000_000, seedExtensions: 100_000, candidateRows: 20_000, outputCharacters: 25 * 1024 * 1024, mapHits: 5000 });
export const VECTOR_MATCH_MODEL = Object.freeze({
  matchScore: 1, mismatchPenalty: -5, xDrop: 12, mergeOverlap: 0.8,
  strong: Object.freeze({ length: 30, identity: 95 }),
  moderate: Object.freeze({ length: 16, identity: 90 })
});

export const VECTOR_SENSITIVITY_PRESETS = Object.freeze({
  'high-confidence': Object.freeze({ minimumAlignedLength: 30, minimumPercentIdentity: 95 }),
  balanced: Object.freeze({ minimumAlignedLength: 30, minimumPercentIdentity: 90 }),
  sensitive: Object.freeze({ minimumAlignedLength: 16, minimumPercentIdentity: 85 })
});
// Empty numeric controls select the sensitivity preset; explicit saved values override it.
export const VECTOR_INPUT_DEFAULTS = Object.freeze({ sensitivity: 'balanced', strand: 'both', minimumAlignedLength: '', minimumPercentIdentity: '', maxHitsPerRecord: 50, outputFormat: 'svg-map' });
export function normalizeVectorOptions(options = {}) {
  const result = { ...VECTOR_INPUT_DEFAULTS };
  for (const key of Object.keys(result)) if (options?.[key] != null && options[key] !== '') result[key] = options[key];
  for (const [key, choices] of Object.entries({ sensitivity: Object.keys(VECTOR_SENSITIVITY_PRESETS), strand: ['both','forward'], outputFormat: ['report','tsv','text-map','svg-map','interactive-viewer','interactive-circular-viewer'] })) {
    if (!choices.includes(result[key])) throw new Error(`Invalid ${key} option.`);
  }
  const preset = VECTOR_SENSITIVITY_PRESETS[result.sensitivity];
  for (const [key, min, max, integer] of [['minimumAlignedLength',8,500,true],['minimumPercentIdentity',70,100,false],['maxHitsPerRecord',1,1000,true]]) {
    const raw = result[key] === '' ? preset[key] : result[key];
    const value = Number(raw);
    if (!Number.isFinite(value) || typeof raw === 'boolean') throw new Error(`Invalid ${key} option.`);
    result[key] = Math.max(min, Math.min(max, integer ? Math.floor(value) : value));
  }
  const disabled = normalizeDisabledToolLimitIds('vector-contamination-scanner', options?.disabledToolLimitIds);
  if (disabled.length) result.disabledToolLimitIds = disabled;
  return result;
}
export const VECTOR_DEFAULTS = Object.freeze(normalizeVectorOptions());
