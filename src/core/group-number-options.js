// Shared by molecule-specific controls, grouping helpers and the production runner.
export const GROUP_NUMBER_DEFAULTS = Object.freeze({
  groupSize: 10,
  groupsPerLine: 6,
  startPosition: 1,
  showPositionNumbers: true,
  preserveCase: true,
  keepGaps: true,
  showComplement: true,
  outputFormat: "text"
});

export function normalizeGroupNumberOptions(options = {}) {
  const source = options ?? {};
  const settings = { ...GROUP_NUMBER_DEFAULTS };
  for (const [key, minimum] of [["groupSize", 1], ["groupsPerLine", 1], ["startPosition", 0]]) {
    if (source[key] == null || String(source[key]).trim() === "") continue;
    const value = Number(source[key]);
    if (Number.isSafeInteger(value) && value >= minimum) settings[key] = value;
  }
  if (!Number.isSafeInteger(settings.groupSize * settings.groupsPerLine)) {
    throw new Error("Characters per line must be an exact safe integer.");
  }
  for (const key of ["showPositionNumbers", "preserveCase", "keepGaps", "showComplement"]) {
    if (typeof source[key] === "boolean") settings[key] = source[key];
  }
  settings.alphabet = source.alphabet === "protein" ? "protein" : "dna-rna";
  // Compatibility formats requested by typed workflows, absent from the normal UI.
  if (["text-records", "sequence-records"].includes(source.outputFormat)) settings.outputFormat = source.outputFormat;
  if (settings.alphabet === "protein") settings.showComplement = false;
  return settings;
}
