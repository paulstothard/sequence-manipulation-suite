const AXIS_DEFAULTS = Object.freeze({ xMin: '', xMax: '', yMin: '', yMax: '', yStartAtZero: false });

// One options contract for metadata, direct calls, workers and saved workflows.
export const DOT_PLOT_DEFAULTS = Object.freeze({
  'dna-rna': Object.freeze({ ...AXIS_DEFAULTS, wordSize: 11, maxMatches: 25000, includeReverseComplement: true, outputFormat: 'svg' }),
  protein: Object.freeze({ ...AXIS_DEFAULTS, wordSize: 3, maxMatches: 25000, includeReverseComplement: false, outputFormat: 'svg' })
});
export const DOT_PLOT_WORD_RANGES = Object.freeze({ 'dna-rna': [4,100], protein: [1,30] });
export const DOT_PLOT_MATCH_RANGE = Object.freeze([100,500000]);
export function normalizeDotPlotOptions(options = {}, alphabet = 'dna-rna') {
  if (!Object.hasOwn(DOT_PLOT_DEFAULTS, alphabet)) throw new Error('Choose a supported dot-plot alphabet.');
  const settings = { alphabet, ...DOT_PLOT_DEFAULTS[alphabet] };
  for (const key of Object.keys(DOT_PLOT_DEFAULTS[alphabet])) {
    const value = options?.[key];
    if (value != null && value !== '') settings[key] = value;
  }
  for (const [key,[min,max]] of [['wordSize',DOT_PLOT_WORD_RANGES[alphabet]],['maxMatches',DOT_PLOT_MATCH_RANGE]]) {
    const value = Number(settings[key]);
    if (typeof settings[key] === 'boolean' || !Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
    settings[key] = value;
  }
  for (const key of ['xMin','xMax','yMin','yMax']) {
    settings[key] = String(settings[key]).trim();
    const value = Number(settings[key]);
    if (Number.isFinite(value) && Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error(`${key} exceeds the supported coordinate range.`);
  }
  if (typeof settings.yStartAtZero !== 'boolean') throw new Error('yStartAtZero must be true or false.');
  if (alphabet === 'protein') settings.includeReverseComplement = false;
  else if (typeof settings.includeReverseComplement !== 'boolean') throw new Error('includeReverseComplement must be true or false.');
  if (!['svg','tsv','report','matches'].includes(settings.outputFormat)) throw new Error('Choose a supported dot-plot output format.');
  return settings;
}

export const DOT_PLOT_LIMITS = Object.freeze({ inputCharacters: 2_000_000, sequenceLength: 250_000, titleCharacters: 500, svgPoints: 10_000, outputCharacters: 16_000_000 });
