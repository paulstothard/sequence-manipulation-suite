import { buildTableFromRows, detectDelimiter, parseColumnList, parseDelimitedRows } from "../core/table.js";

const DELIMITER_BY_CHOICE = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
  pipe: "|"
};

export function getTableColumnSuggestionsFromTexts(
  inputTexts,
  { source = "table-columns", delimiterChoice = "auto", hasHeader = true } = {}
) {
  const texts = Array.isArray(inputTexts) ? inputTexts : [inputTexts ?? ""];
  if (!texts.some((text) => String(text ?? "").trim())) {
    return [];
  }
  const suggestions = [];
  for (const text of texts) {
    if (!String(text ?? "").trim()) {
      continue;
    }
    const delimiter = delimiterChoice === "auto"
      ? detectDelimiter(text).delimiter
      : DELIMITER_BY_CHOICE[delimiterChoice] ?? "\t";
    const parsed = parseDelimitedRows(text, delimiter).rows;
    if (parsed.length === 0) {
      continue;
    }
    const table = buildTableFromRows(parsed, { hasHeader });
    const columns = source === "table-numeric-columns"
      ? table.columns.filter((column) => column.type === "number")
      : table.columns;
    suggestions.push(...columns.map((column) => column.label || column.id));
  }
  return [...new Set(suggestions)];
}

export function normalizeSuggestionValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function optionCurrentValueMatchesSuggestion(value, suggestions = []) {
  const normalized = normalizeSuggestionValue(value);
  return suggestions.some((suggestion) => normalizeSuggestionValue(suggestion) === normalized);
}

export function optionValuePartsMatchSuggestions(value, suggestions = []) {
  const parts = parseColumnList(value);
  if (parts.length === 0) {
    return false;
  }
  const normalizedSuggestions = new Set(suggestions.map((suggestion) => normalizeSuggestionValue(suggestion)));
  return parts.every((part) => normalizedSuggestions.has(normalizeSuggestionValue(part)));
}

export function firstMatchingSuggestion(suggestions, patterns = []) {
  for (const pattern of patterns) {
    const match = suggestions.find((suggestion) => pattern.test(String(suggestion)));
    if (match) {
      return match;
    }
  }
  return "";
}

export function suggestionOrdinalForOption(option) {
  const id = String(option.id ?? "").toLowerCase();
  if (id.includes("target") || id === "ycolumn" || id === "pvaluecolumn") {
    return 1;
  }
  if (id.includes("group") || id.includes("series") || id.includes("color")) {
    return 1;
  }
  return 0;
}

export function chooseSuggestedColumnForOption(option, suggestions = []) {
  if (suggestions.length === 0) {
    return "";
  }
  const id = String(option.id ?? "").toLowerCase();
  const defaultValue = String(option.defaultValue ?? "").trim();
  if (defaultValue && optionValuePartsMatchSuggestions(defaultValue, suggestions)) {
    return defaultValue;
  }
  if (id === "numericcolumns") {
    return suggestions.join(",");
  }
  if (id === "predictorcolumns") {
    const responseLike = firstMatchingSuggestion(suggestions, [/response/i, /yield/i, /outcome/i, /^y$/i]);
    const predictorSuggestions = suggestions.filter((suggestion) =>
      normalizeSuggestionValue(suggestion) !== normalizeSuggestionValue(responseLike)
    );
    return predictorSuggestions.slice(0, Math.min(6, predictorSuggestions.length)).join(",");
  }
  const patternMap = [
    [/label|pointlabel/, [/sample/i, /\bid\b/i, /label/i, /name/i]],
    [/group|series|color/, [/condition/i, /treatment/i, /\bgroup\b/i, /class/i, /category/i]],
    [/source/, [/^source$/i, /^from$/i]],
    [/target/, [/^target$/i, /^to$/i]],
    [/responsecolumn/, [/response/i, /yield/i, /outcome/i, /^y$/i]],
    [/foldchange/, [/log2.*fold/i, /log2fc/i, /fold.*change/i]],
    [/pvalue/, [/adjusted.*p/i, /\bpadj\b/i, /\bp[_ -]?value\b/i, /^p$/i]],
    [/category/, [/category/i, /gene/i, /feature/i, /name/i]],
    [/^xcolumn$/, [/^x$/i, /time/i, /position/i, /dose/i, /concentration/i]],
    [/^ycolumn$/, [/^y$/i, /response/i, /value/i, /mean/i, /expression/i, /quality/i]],
    [/valuecolumn/, [/value/i, /count/i, /tpm/i, /expression/i, /reads/i, /score/i]]
  ];
  for (const [idPattern, suggestionPatterns] of patternMap) {
    if (idPattern.test(id)) {
      const match = firstMatchingSuggestion(suggestions, suggestionPatterns);
      if (match) {
        return match;
      }
    }
  }
  const ordinal = suggestionOrdinalForOption(option);
  return suggestions[Math.min(ordinal, suggestions.length - 1)] ?? suggestions[0];
}
