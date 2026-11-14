import { normalizeDisabledToolLimitIds } from "./tool-limit-policy.js";
export const PROTEIN_STATS_LIMITS = Object.freeze({ inputCharacters: 10_000_000, records: 10_000, headerCharacters: 1000, outputCharacters: 26_214_400 });

export const PROTEIN_STATS_DEFAULTS = Object.freeze({ chargePh: 7, outputFormat: "tsv" });

export function normalizeProteinStatsOptions(options = {}) {
  options ??= {};
  const rawPh = options.chargePh;
  const chargePh = rawPh == null || String(rawPh).trim() === "" ? PROTEIN_STATS_DEFAULTS.chargePh : Number(rawPh);
  if (!Number.isFinite(chargePh)) throw new Error("Enter a finite pH for the net-charge estimate.");
  const outputFormat = options.outputFormat == null || options.outputFormat === "" ? PROTEIN_STATS_DEFAULTS.outputFormat : options.outputFormat;
  if (!["report", "tsv", "stats-records"].includes(outputFormat)) throw new Error("Choose a supported protein statistics output format.");
  return { chargePh: Math.max(0, Math.min(14, chargePh)), outputFormat, disabledToolLimitIds: normalizeDisabledToolLimitIds("sequence-stats-protein", options.disabledToolLimitIds) };
}
