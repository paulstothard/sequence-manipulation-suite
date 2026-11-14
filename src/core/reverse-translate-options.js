import { geneticCodes } from './genetic-code.js';
import { codonUsageReferences } from '../reference-data/codon-usage/references.js';

export const REVERSE_TRANSLATE_DEFAULTS = Object.freeze({
  mode: 'most-likely', referenceId: 'ecoli-k12-mg1655-refseq', geneticCode: '1',
  outputFormat: 'fasta', lineWidth: 60, plotResiduesPerRow: 30, plotMaxResidues: 1000
});
const missing = value => value == null || value === '';
export function normalizeReverseTranslateOptions(options = {}) {
  options ??= {};
  const settings = Object.fromEntries(Object.entries(REVERSE_TRANSLATE_DEFAULTS).map(([key,value]) => [key, missing(options[key]) ? value : options[key]]));
  if (!['most-likely','degenerate'].includes(settings.mode)) throw new Error('Choose a supported codon choice method.');
  if (!['fasta','tsv','report','plot'].includes(settings.outputFormat)) throw new Error('Choose a supported reverse translation output format.');
  settings.geneticCode = String(settings.geneticCode);
  if (settings.mode === 'degenerate' && !geneticCodes.some(code => code.id === settings.geneticCode)) throw new Error('Choose a supported genetic code.');
  if (settings.mode === 'most-likely' && !codonUsageReferences.some(reference => reference.id === settings.referenceId)) throw new Error('Choose a supported codon usage reference.');
  for (const [key,min,max] of [['lineWidth',1,1000],['plotResiduesPerRow',20,40],['plotMaxResidues',10,5000]]) {
    const value = Number(settings[key]);
    if (!Number.isInteger(value)) throw new Error(`${key} must be a whole number.`);
    // Preserve the established bounded handling of saved plot settings.
    settings[key] = Math.max(min,Math.min(max,value));
  }
  return settings;
}

export const REVERSE_TRANSLATE_LIMITS = Object.freeze({ inputCharacters: 2_000_000, records: 1000, residues: 1_000_000, tableRows: 20_000, plotRecords: 12, plotResidues: 5000, titleCharacters: 500, outputCharacters: 16_000_000 });
