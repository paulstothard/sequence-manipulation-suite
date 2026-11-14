import { normalizeDisabledToolLimitIds } from "./tool-limit-policy.js";
export const TECHNICAL_SEQUENCE_DEFAULTS = Object.freeze({
  sequenceClass: 'all', sequenceId: 'all', strand: 'both', matchMode: 'full',
  maxMismatches: 1, requireExactThreePrime: false, exactThreePrimeBases: 3,
  minimumPartialLength: 12, customSequences: '', allowOverlaps: true, outputFormat: 'svg-map'
});
export function normalizeTechnicalSequenceOptions(options = {}) {
  const result = {...TECHNICAL_SEQUENCE_DEFAULTS};
  for (const key of Object.keys(result)) {
    if (options?.[key] != null && options[key] !== '') result[key] = options[key];
  }
  for (const [key, choices] of Object.entries({strand:['both','forward'],matchMode:['full','mismatch-tolerant','partial-ends','full-or-partial'],outputFormat:['report','tsv','text-map','svg-map','interactive-viewer','interactive-circular-viewer']})) {
    if (!choices.includes(result[key])) throw new Error(`Invalid ${key} option.`);
  }
  for (const [key,min,max] of [['maxMismatches',0,10],['exactThreePrimeBases',1,20],['minimumPartialLength',4,100]]) {
    const value=Number(result[key]); if (!Number.isFinite(value)) throw new Error(`Invalid ${key} option.`);
    result[key]=Math.max(min,Math.min(max,Math.floor(value)));
  }
  for (const key of ['requireExactThreePrime','allowOverlaps']) if(typeof result[key]!=='boolean') throw new Error(`Invalid ${key} option.`);
  for (const key of ['sequenceClass','sequenceId','customSequences']) result[key]=String(result[key]);
  const disabled = normalizeDisabledToolLimitIds("technical-sequence-scanner", options?.disabledToolLimitIds);
  if (disabled.length) result.disabledToolLimitIds = disabled;
  return result;
}
