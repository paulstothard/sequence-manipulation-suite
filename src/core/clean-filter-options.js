export function normalizeCleanFilterOptions(options, filterOptions, defaults) {
  const source = options ?? {};
  const values = { ...defaults };
  for (const id of ["filterPreset", "caseMode"]) {
    const definition = filterOptions.find(option => option.id === id);
    if (definition.choices.some(choice => choice.value === source[id])) values[id] = source[id];
  }
  if (!filterOptions.find(option => option.id === "caseMode").choices.some(choice => choice.value === source.caseMode) && source.preserveCase === false) values.caseMode = "uppercase";
  // Keep explicit replacement strings, including the legacy custom string API.
  if (source.replacement != null) values.replacement = String(source.replacement);
  for (const id of ["keepGaps", "formatFasta", "preserveFilterWhitespace", "warnOnFilteredCharacters"]) {
    if (typeof source[id] === "boolean") values[id] = source[id];
  }
  values.outputFormat = ["fasta", "text"].includes(source.outputFormat)
    ? source.outputFormat : values.formatFasta ? defaults.outputFormat : "text";
  values.formatFasta = values.outputFormat === "fasta";
  const width = Number.parseInt(source.lineWidth, 10);
  values.lineWidth = Math.max(1, Number.isFinite(width) && width !== 0 ? width : defaults.lineWidth);
  return values;
}
