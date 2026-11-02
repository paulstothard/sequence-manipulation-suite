import { effectiveToolLimit, normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

export const IN_SILICO_PCR_NUMERIC_OPTIONS = Object.freeze({
  maxMismatches: { defaultValue: 0, min: 0, max: 6, step: 1 },
  exactThreePrimeBases: { defaultValue: 3, min: 0, max: 12, step: 1 },
  minProductLength: { defaultValue: 20, min: 1, step: 1 },
  maxProductLength: { defaultValue: 5000, min: 1, step: 1 },
  maxBindingSitesPerTemplate: { defaultValue: 5000, min: 1, max: 100000, step: 100, resourceLimit: true },
  maxProducts: { defaultValue: 1000, min: 1, max: 100000, step: 100, resourceLimit: true },
  // Retain legacy export widths without adding ordinary output-width controls.
  lineWidth: { defaultValue: 60, min: 1, step: 1 },
  textMapWidth: { defaultValue: 80, min: 40, max: 140, step: 1 }
});
for (const spec of Object.values(IN_SILICO_PCR_NUMERIC_OPTIONS)) Object.freeze(spec);
export const IN_SILICO_PCR_DEFAULTS = Object.freeze({
  ...Object.fromEntries(Object.entries(IN_SILICO_PCR_NUMERIC_OPTIONS).map(([id, spec]) => [id, spec.defaultValue])),
  topology: 'linear', productSequenceMode: 'primer-incorporated', outputFormat: 'svg-gel'
});
export const IN_SILICO_PCR_OUTPUT_FORMATS = Object.freeze(['amplicon-gff3', 'report', 'tsv', 'binding-sites-tsv', 'fasta', 'alignments', 'analysis-json', 'text-map', 'svg-gel', 'interactive-viewer', 'interactive-circular-viewer']);

export function applyInSilicoPcrOptionDefinitions(options) {
  return options.map(option => {
    const { resourceLimit, ...control } = IN_SILICO_PCR_NUMERIC_OPTIONS[option.id] ?? {};
    return {
      ...option, ...control,
      ...(Object.hasOwn(IN_SILICO_PCR_DEFAULTS, option.id) ? { defaultValue: IN_SILICO_PCR_DEFAULTS[option.id] } : {}),
      ...(option.options ? { options: applyInSilicoPcrOptionDefinitions(option.options) } : {})
    };
  });
}

export function normalizePcrNumber(id, value) {
  const spec = IN_SILICO_PCR_NUMERIC_OPTIONS[id];
  const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  return Math.max(spec.min, Math.min(spec.max ?? Infinity, Number.isFinite(number) ? Math.trunc(number) : spec.defaultValue));
}

export function normalizePcrOptions(options = {}) {
  options = options && typeof options === 'object' ? options : {};
  const disabledToolLimitIds = normalizeDisabledToolLimitIds('in-silico-pcr', options.disabledToolLimitIds);
  const normalized = Object.fromEntries(Object.entries(IN_SILICO_PCR_NUMERIC_OPTIONS).map(([id, spec]) => [id,
    spec.resourceLimit ? effectiveToolLimit({ disabledToolLimitIds }, id, spec.defaultValue) : normalizePcrNumber(id, options[id])
  ]));
  normalized.maxProductLength = Math.max(normalized.minProductLength, normalized.maxProductLength);
  return {
    ...normalized, disabledToolLimitIds,
    topology: ['linear', 'circular'].includes(options.topology) ? options.topology : IN_SILICO_PCR_DEFAULTS.topology,
    productSequenceMode: ['primer-incorporated', 'template'].includes(options.productSequenceMode) ? options.productSequenceMode : IN_SILICO_PCR_DEFAULTS.productSequenceMode,
    outputFormat: IN_SILICO_PCR_OUTPUT_FORMATS.includes(options.outputFormat) ? options.outputFormat : IN_SILICO_PCR_DEFAULTS.outputFormat
  };
}
