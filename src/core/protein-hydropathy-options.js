import { normalizeDisabledToolLimitIds } from "./tool-limit-policy.js";
export const PROTEIN_HYDROPATHY_LIMITS = Object.freeze({ inputCharacters: 2_000_000, records: 10_000, tableWindows: 50_000, outputCharacters: 26_214_400, headerCharacters: 1000 });

// Shared defaults for controls, direct calls, workers and workflows.
export const PROTEIN_HYDROPATHY_DEFAULTS = Object.freeze({ windowSize: 19, yStartAtZero: false, xMin: "", xMax: "", yMin: "", yMax: "", outputFormat: "svg-plot" });
export function normalizeProteinHydropathyOptions(options = {}) {
  options ??= {};
  const parsed = Number.parseInt(options.windowSize, 10);
  return {
    yStartAtZero: options.yStartAtZero === true,
    ...Object.fromEntries(["xMin", "xMax", "yMin", "yMax"].map(id => [id, String(options[id] ?? "").trim()])),
    windowSize: Number.isFinite(parsed) ? Math.min(1001, Math.max(1, parsed)) : PROTEIN_HYDROPATHY_DEFAULTS.windowSize,
    disabledToolLimitIds: normalizeDisabledToolLimitIds("protein-hydropathy", options.disabledToolLimitIds),
    outputFormat: ["report", "tsv", "svg-plot"].includes(options.outputFormat) ? options.outputFormat : PROTEIN_HYDROPATHY_DEFAULTS.outputFormat
  };
}
