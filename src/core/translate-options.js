import { geneticCodes } from './genetic-code.js';

export const TRANSLATE_DEFAULTS = Object.freeze({
  frame: '1', geneticCode: '1', outputFormat: 'fasta', lineWidth: 60, textMapWidth: 60
});
export function normalizeTranslateOptions(options = {}) {
  options ??= {};
  const missing = value => value == null || value === '';
  const settings = Object.fromEntries(Object.entries(TRANSLATE_DEFAULTS).map(([key,value]) => [key, missing(options[key]) ? value : options[key]]));
  if (missing(options.outputFormat) && options.formatFasta === false) settings.outputFormat = 'plain';
  settings.frame = String(settings.frame);
  settings.geneticCode = String(settings.geneticCode);
  if (!['1','2','3','uppercase','all-forward','all-reverse','all-six'].includes(settings.frame)) throw new Error('Choose a supported reading frame.');
  if (!geneticCodes.some(code => code.id === settings.geneticCode)) throw new Error('Choose a supported genetic code.');
  if (!['fasta','plain','tsv','text-map'].includes(settings.outputFormat)) throw new Error('Choose a supported translation output format.');
  for (const [key,min,max] of [['lineWidth',1,1000],['textMapWidth',30,1000]]) {
    const value = Number(settings[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
    settings[key] = value;
  }
  return settings;
}

export const TRANSLATE_LIMITS = Object.freeze({
  inputCharacters: 5_000_000, records: 10_000, bases: 2_000_000,
  titleCharacters: 500, tableRows: 60_000, mapBases: 300_000, outputCharacters: 16_000_000
});
