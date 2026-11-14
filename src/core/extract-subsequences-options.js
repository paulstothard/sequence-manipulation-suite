// Shared execution defaults for both molecule-specific extraction tools.
export const EXTRACT_SUBSEQUENCES_DEFAULTS = Object.freeze({
  coordinates: "2-8, 12-18",
  selectionMode: "extract",
  resultGrouping: "separate",
  preserveCase: true,
  keepGaps: true,
  reverseComplement: false,
  outputFormat: "fasta",
  lineWidth: 60
});

export function normalizeExtractSubsequencesOptions(options = {}) {
  const source = options ?? {};
  const settings = { ...EXTRACT_SUBSEQUENCES_DEFAULTS };
  // An explicitly empty coordinate field must stay empty.
  if (source.coordinates != null) settings.coordinates = String(source.coordinates);
  for (const [key, choices] of Object.entries({
    selectionMode: ["extract", "exclude"],
    resultGrouping: ["separate", "joined"],
    outputFormat: ["fasta", "tsv"]
  })) if (choices.includes(source[key])) settings[key] = source[key];
  for (const key of ["preserveCase", "keepGaps", "reverseComplement"]) {
    if (typeof source[key] === "boolean") settings[key] = source[key];
  }
  const width = Number(source.lineWidth);
  if (Number.isSafeInteger(width) && width > 0) settings.lineWidth = width;
  if (Array.isArray(source.disabledToolLimitIds)) {
    settings.disabledToolLimitIds = [...new Set(source.disabledToolLimitIds.filter(id => id === "outputRecordLimitNote"))];
  }
  settings.alphabet = source.alphabet === "protein" ? "protein" : "dna-rna";
  if (settings.alphabet === "protein") settings.reverseComplement = false;
  return settings;
}
