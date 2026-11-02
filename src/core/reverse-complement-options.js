// One definition for the controls, public helpers and shared production runner.
// lineWidth and keepGaps retain the existing non-UI caller options.
export const REVERSE_COMPLEMENT_DEFAULTS = Object.freeze({
  operation: "reverse-complement",
  preserveCase: true,
  keepGaps: false,
  lineWidth: 60
});

export function normalizeReverseComplementOptions(options = {}) {
  const source = options ?? {};
  const defaults = REVERSE_COMPLEMENT_DEFAULTS;
  const width = Number.parseInt(source.lineWidth, 10);
  return {
    // Unknown/blank operations already ran reverse complement; record the
    // effective operation instead of retaining an unexecuted input value.
    operation: source.operation === "reverse" || source.operation === "complement"
      ? source.operation : defaults.operation,
    // Preserve the existing strict boolean contract (e.g. "false" is not false).
    preserveCase: typeof source.preserveCase === "boolean" ? source.preserveCase : defaults.preserveCase,
    keepGaps: typeof source.keepGaps === "boolean" ? source.keepGaps : defaults.keepGaps,
    // Match the established FASTA formatter: parse integer strings, use the
    // default for zero/blank/invalid values, and clamp negative widths to one.
    lineWidth: Math.max(1, Number.isFinite(width) && width !== 0 ? width : defaults.lineWidth)
  };
}
