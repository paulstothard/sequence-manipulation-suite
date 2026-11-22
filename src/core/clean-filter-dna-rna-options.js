import { normalizeCleanFilterOptions } from "./clean-filter-options.js";

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
  choices: [{ showcase: false, value: "fasta", label: "FASTA" }, { showcase: false, value: "text", label: "Filtered text" }],
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
  return normalizeCleanFilterOptions(options, dnaRnaFilterOptions, CLEAN_FILTER_DNA_RNA_DEFAULTS);
}
