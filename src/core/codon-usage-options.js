import {getGeneticCode} from './genetic-code.js';

export const CODON_USAGE_LIMITS = Object.freeze({ maxMaterializedOutputCharacters: 25 * 1024 * 1024, maxPlotRecords: 20, maxRecords: 1_000 });


export const CODON_USAGE_DEFAULTS = Object.freeze({
  geneticCode: '1',
  plotValue: 'count',
  showLegend: true,
  outputFormat: 'plot'
});

export function normalizeCodonUsageOptions(options = {}) {
  options ??= {};
  const aliases = {tsv: 'table', 'svg-plot': 'plot', 'sms3-svg': 'plot', 'observable-svg': 'plot'};
  const outputFormat = Object.hasOwn(aliases, options.outputFormat) ? aliases[options.outputFormat] : options.outputFormat;
  return {
    geneticCode: getGeneticCode(options.geneticCode ?? CODON_USAGE_DEFAULTS.geneticCode).id,
    plotValue: ['count', 'per_1000', 'fraction'].includes(options.plotValue) ? options.plotValue : CODON_USAGE_DEFAULTS.plotValue,
    showLegend: typeof options.showLegend === 'boolean' ? options.showLegend : CODON_USAGE_DEFAULTS.showLegend,
    outputFormat: ['table', 'plot', 'report'].includes(outputFormat) ? outputFormat : CODON_USAGE_DEFAULTS.outputFormat
  };
}
