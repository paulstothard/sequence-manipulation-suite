import { normalizeDisabledToolLimitIds } from "./tool-limit-policy.js";

export const PROTEIN_PATTERN_LIMITS = Object.freeze({
  inputCharacters: 2_000_000, records: 10_000, headerCharacters: 1000,
  patternCharacters: 1000, work: 50_000_000, hits: 50_000,
  outputCharacters: 25 * 1024 * 1024
});

export const PROTEIN_PATTERN_DEFAULTS = Object.freeze({
  pattern: "KDD", patternMode: "plain", caseInsensitive: true,
  allowOverlaps: true, outputFormat: "svg-map"
});

export function normalizeProteinPatternOptions(options = {}) {
  options ??= {};
  const defaults = PROTEIN_PATTERN_DEFAULTS;
  const disabledToolLimitIds = normalizeDisabledToolLimitIds("protein-pattern-finder", options.disabledToolLimitIds);
  return {
    pattern: options.pattern == null ? defaults.pattern : String(options.pattern).trim(),
    patternMode: ["plain", "iupac", "regex"].includes(options.patternMode) ? options.patternMode : defaults.patternMode,
    caseInsensitive: typeof options.caseInsensitive === "boolean" ? options.caseInsensitive : defaults.caseInsensitive,
    allowOverlaps: typeof options.allowOverlaps === "boolean" ? options.allowOverlaps : defaults.allowOverlaps,
    outputFormat: ["report", "tsv", "text-map", "svg-map", "interactive-viewer", "matched-regions"].includes(options.outputFormat) ? options.outputFormat : defaults.outputFormat,
    ...(disabledToolLimitIds.length ? { disabledToolLimitIds } : {})
  };
}
