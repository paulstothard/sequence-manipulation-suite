export const dnaRnaFilterOptions = [
  {
    id: "filterPreset",
    type: "select",
    label: "Filter",
    defaultValue: "valid-dna-rna-iupac",
    help: "Choose characters to remove or replace. Whitespace includes sequence-body spaces and line breaks; replacing them adds characters. T and U are preserved unless explicitly removed or replaced.",
    choices: [
      { value: "valid-basic-dna-rna", label: "Keep A, C, G, T, U, N only" },
      { value: "valid-dna-rna-iupac", label: "Keep IUPAC symbols and X" },
      { value: "remove-t", label: "Remove T/t" },
      { value: "remove-u", label: "Remove U/u" },
      { value: "whitespace", label: "Remove whitespace" },
      { value: "digits", label: "Remove digits" },
      { value: "digits-whitespace", label: "Remove digits and whitespace" },
      { value: "keep-lowercase-dna-rna", label: "Keep lowercase symbols" },
      { value: "keep-uppercase-dna-rna", label: "Keep uppercase symbols" }
    ]
  },
  {
    id: "replacement",
    type: "select",
    label: "Replace filtered characters with",
    defaultValue: "",
    choices: [
      { value: "", label: "Nothing" },
      { value: "n", label: "n" },
      { value: "N", label: "N" },
      { value: "t", label: "t" },
      { value: "T", label: "T" },
      { value: "u", label: "u" },
      { value: "U", label: "U" },
      { value: "-", label: "-" },
      { value: "?", label: "?" },
      { value: "*", label: "*" }
    ]
  },
  {
    id: "caseMode",
    type: "radio",
    label: "Case",
    defaultValue: "preserve",
    choices: [
      { value: "uppercase", label: "Uppercase" },
      { value: "lowercase", label: "Lowercase" },
      { value: "preserve", label: "Preserve input case" }
    ]
  }
];

export const dnaRnaOutputOption = {
  id: "outputFormat", type: "select", label: "Output format", defaultValue: "fasta",
  choices: [{ value: "fasta", label: "FASTA" }, { value: "text", label: "Filtered text" }],
  help: "FASTA requires nucleotide symbols, X, whitespace or alignment gaps. Choose Filtered text to retain other characters; records are separated by a blank line."
};

// The control definition owns visible defaults; non-UI compatibility options
// live alongside it so every caller records the same effective settings.
export const CLEAN_FILTER_DNA_RNA_DEFAULTS = Object.freeze({
  ...Object.fromEntries(dnaRnaFilterOptions.map(option => [option.id, option.defaultValue])),
  keepGaps: false,
  formatFasta: true,
  outputFormat: dnaRnaOutputOption.defaultValue,
  lineWidth: 60,
  preserveFilterWhitespace: true,
  warnOnFilteredCharacters: false
});

export function normalizeCleanFilterDnaRnaOptions(options = {}) {
  const source = options ?? {};
  const defaults = CLEAN_FILTER_DNA_RNA_DEFAULTS;
  const values = { ...defaults };
  for (const id of ["filterPreset", "caseMode"]) {
    const definition = dnaRnaFilterOptions.find(option => option.id === id);
    if (definition.choices.some(choice => choice.value === source[id])) values[id] = source[id];
  }
  if (!dnaRnaFilterOptions.find(option => option.id === "caseMode").choices.some(choice => choice.value === source.caseMode) && source.preserveCase === false) values.caseMode = "uppercase";
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
