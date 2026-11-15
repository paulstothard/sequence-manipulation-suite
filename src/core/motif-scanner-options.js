import { normalizeDisabledToolLimitIds } from "./tool-limit-policy.js";

export const DNA_RNA_MOTIF_LIMITS = Object.freeze({ inputCharacters: 50_000_000, work: 200_000_000, hits: 50_000, outputCharacters: 25 * 1024 * 1024 });

export const PROTEIN_MOTIF_LIMITS = Object.freeze({ inputCharacters: 2_000_000, records: 10_000, work: 50_000_000, hits: 50_000, outputCharacters: 26_214_400, headerCharacters: 1000 });
export const DNA_RNA_MOTIF_DEFAULTS = Object.freeze({
  motifDatabase: 'sms3-curated',
  motifClass: 'all',
  motifId: 'all',
  pwmThresholdPercent: 85,
  strand: 'both',
  allowOverlaps: true,
  outputFormat: 'svg-map'
});
export const PROTEIN_MOTIF_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.entries(DNA_RNA_MOTIF_DEFAULTS).filter(([key]) => !['strand', 'pwmThresholdPercent'].includes(key))
));

export function normalizePwmThreshold(value) {
  const parsed = value == null || value === '' ? NaN : Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : DNA_RNA_MOTIF_DEFAULTS.pwmThresholdPercent;
}

export function normalizeMotifScannerOptions(options = {}, alphabet = 'dna-rna') {
  options ??= {};
  const defaults = alphabet === 'protein' ? PROTEIN_MOTIF_DEFAULTS : DNA_RNA_MOTIF_DEFAULTS;
  const formats = ['report', 'tsv', 'text-map', 'svg-map', 'interactive-viewer', ...(alphabet === 'protein' ? [] : ['interactive-circular-viewer'])];
  // Preserve explicit stale filters: they yield a visible no-selected-motifs warning,
  // rather than silently broadening a saved biological search.
  const filter = key => typeof options[key] === 'string' && options[key].trim() ? options[key] : defaults[key];
  return {
    motifDatabase: filter('motifDatabase'),
    motifClass: filter('motifClass'),
    motifId: filter('motifId'),
    ...(alphabet === 'protein' ? {} : {
      pwmThresholdPercent: normalizePwmThreshold(options.pwmThresholdPercent),
      strand: ['forward', 'both'].includes(options.strand) ? options.strand : defaults.strand
    }),
    allowOverlaps: typeof options.allowOverlaps === 'boolean' ? options.allowOverlaps : defaults.allowOverlaps,
    ...(alphabet === 'protein' && normalizeDisabledToolLimitIds('protein-motif-scanner', options.disabledToolLimitIds).length
      ? { disabledToolLimitIds: normalizeDisabledToolLimitIds('protein-motif-scanner', options.disabledToolLimitIds) } : {}),
    outputFormat: formats.includes(options.outputFormat) ? options.outputFormat : defaults.outputFormat
  };
}
