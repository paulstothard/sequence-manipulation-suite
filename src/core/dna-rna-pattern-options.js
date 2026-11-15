export const DNA_RNA_PATTERN_LIMITS = Object.freeze({ patternCharacters: 1000, inputCharacters: 50_000_000, work: 500_000_000, hits: 100_000, outputCharacters: 25 * 1024 * 1024, regionRecords: 5000, mapMatches: 5000 });

export const DNA_RNA_PATTERN_DEFAULTS = Object.freeze({
  pattern: "ATGN",
  patternMode: "iupac",
  strand: "forward",
  caseInsensitive: true,
  allowOverlaps: true,
  outputFormat: "svg-map"
});

export function normalizeDnaRnaPatternOptions(options = {}) {
  options ??= {};
  const defaults = DNA_RNA_PATTERN_DEFAULTS;
  return {
    // An explicitly empty pattern must remain empty for validation.
    pattern: options.pattern == null ? defaults.pattern : String(options.pattern).trim(),
    patternMode: ["plain", "iupac", "regex"].includes(options.patternMode) ? options.patternMode : defaults.patternMode,
    strand: ["forward", "both"].includes(options.strand) ? options.strand : defaults.strand,
    caseInsensitive: typeof options.caseInsensitive === "boolean" ? options.caseInsensitive : defaults.caseInsensitive,
    allowOverlaps: typeof options.allowOverlaps === "boolean" ? options.allowOverlaps : defaults.allowOverlaps,
    outputFormat: ["report", "tsv", "text-map", "svg-map", "interactive-viewer", "interactive-circular-viewer", "matched-regions"].includes(options.outputFormat) ? options.outputFormat : defaults.outputFormat
  };
}
