import { normalizeCleanFilterOptions } from "./clean-filter-options.js";

export const proteinFilterOptions = [
  {
    id: "filterPreset",
    type: "select",
    label: "Filter",
    defaultValue: "standard-protein",
    help: "Choose characters to remove or replace. Whitespace includes sequence-body spaces and line breaks; replacing them adds characters. Case-selective filters retain letters of that case and remove stop symbols.",
    choices: [
      { value: "standard-protein", label: "Keep standard amino acids" },
      { value: "standard-protein-stop", label: "Keep standard amino acids and *" },
      { value: "valid-protein-iupac", label: "Keep protein IUPAC symbols" },
      { value: "whitespace", label: "Remove whitespace" },
      { value: "digits", label: "Remove digits" },
      { value: "digits-whitespace", label: "Remove digits and whitespace" },
      { value: "keep-lowercase-protein", label: "Keep lowercase protein symbols" },
      { value: "keep-uppercase-protein", label: "Keep uppercase protein symbols" }
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
      { value: "x", label: "x" },
      { value: "X", label: "X" },
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

export const proteinOutputOption = {
  id: "outputFormat", type: "select", label: "Output format", defaultValue: "fasta",
  choices: [{ value: "fasta", label: "FASTA" }, { value: "text", label: "Filtered text" }],
  help: "FASTA requires amino acid letters, stop symbols, whitespace or alignment gaps. Choose Filtered text to retain other characters; records are separated by a blank line."
};

export const CLEAN_FILTER_PROTEIN_DEFAULTS = Object.freeze({
  ...Object.fromEntries(proteinFilterOptions.map(option => [option.id, option.defaultValue])),
  keepGaps: false,
  formatFasta: true,
  outputFormat: proteinOutputOption.defaultValue,
  lineWidth: 60,
  preserveFilterWhitespace: true,
  warnOnFilteredCharacters: false
});

export function normalizeCleanFilterProteinOptions(options = {}) {
  return normalizeCleanFilterOptions(options, proteinFilterOptions, CLEAN_FILTER_PROTEIN_DEFAULTS);
}
