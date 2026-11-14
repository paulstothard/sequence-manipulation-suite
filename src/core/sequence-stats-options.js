import { normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

export const SEQUENCE_STATS_DEFAULTS = Object.freeze({ outputFormat: 'tsv', sourceMode: 'loaded' });
export const SEQUENCE_STATS_OUTPUT_CHARACTERS = 25 * 1024 * 1024;

export function normalizeSequenceStatsOptions(options = {}) {
  options ??= {};
  const settings = Object.fromEntries(Object.entries(SEQUENCE_STATS_DEFAULTS).map(([key, value]) =>
    [key, options[key] == null || options[key] === '' ? value : options[key]]));
  if (!['report', 'tsv', 'stats-records'].includes(settings.outputFormat)) throw new Error('Choose a supported sequence statistics output format.');
  if (!['loaded', 'indexed', 'bgzf'].includes(settings.sourceMode)) throw new Error('Choose a supported FASTA source mode.');
  return { ...settings, disabledToolLimitIds: normalizeDisabledToolLimitIds('sequence-stats-dna-rna', options.disabledToolLimitIds) };
}
