export const textSearchMatchColumns = [
  { id: "match", label: "Match", type: "number" },
  { id: "line", label: "Line", type: "number" },
  { id: "start", label: "Start", type: "number" },
  { id: "end", label: "End", type: "number" },
  { id: "matched_text", label: "Matched text", type: "string" },
  { id: "replacement", label: "Replacement", type: "string" }
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineInfoForIndex(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let position = 0; position < index; position += 1) {
    if (text[position] === "\n") {
      line += 1;
      lineStart = position + 1;
    }
  }
  return {
    line,
    start: index - lineStart + 1
  };
}

function makeRegex(pattern, options, warnings) {
  if (!pattern) {
    warnings.push("No search pattern was provided.");
    return null;
  }
  const flags = `g${options.caseSensitive === true ? "" : "i"}${options.multiline === true ? "m" : ""}`;
  try {
    return new RegExp(options.searchMode === "regex" ? pattern : escapeRegExp(pattern), flags);
  } catch (error) {
    warnings.push(`Invalid regular expression: ${error.message}`);
    return null;
  }
}

function collectMatches(text, regex, replacementText, searchMode) {
  const rows = [];
  let matchIndex = 0;
  let ignoredZeroLength = 0;
  for (const match of text.matchAll(regex)) {
    if (match[0] === "") {
      ignoredZeroLength += 1;
      continue;
    }
    const info = lineInfoForIndex(text, match.index ?? 0);
    const replacement = searchMode === "regex"
      ? match[0].replace(regexWithoutGlobal(regex), replacementText)
      : replacementText;
    rows.push({
      match: matchIndex + 1,
      line: info.line,
      start: info.start,
      end: info.start + match[0].length - 1,
      matched_text: match[0],
      replacement
    });
    matchIndex += 1;
  }
  return { rows, ignoredZeroLength };
}

function regexWithoutGlobal(regex) {
  return new RegExp(regex.source, regex.flags.replace("g", ""));
}

function replaceMatches(text, regex, replacementText) {
  return text.replace(regex, replacementText);
}

function extractMatches(rows, joinMode) {
  const delimiter = joinMode === "comma" ? ", " : joinMode === "tab" ? "\t" : "\n";
  return rows.map((row) => row.matched_text).join(delimiter);
}

function removeMatchingLines(text, regex) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !regexWithoutGlobal(regex).test(line))
    .join("\n");
}

export function runTextSearchReplaceCore(input, options = {}) {
  const text = String(input ?? "");
  const warnings = [];
  const pattern = String(options.pattern ?? "");
  const replacementText = String(options.replacement ?? "");
  const searchMode = options.searchMode === "regex" ? "regex" : "plain";
  const operation = options.operation ?? "replace";
  const regex = makeRegex(pattern, { ...options, searchMode }, warnings);

  if (text.length === 0) {
    warnings.push("No text input was provided.");
  }
  if (!regex) {
    return {
      output: "",
      rows: [],
      warnings,
      stats: { inputCharacters: text.length, matches: 0, outputCharacters: 0 },
      operation
    };
  }

  const { rows, ignoredZeroLength } = collectMatches(text, regex, replacementText, searchMode);
  let output = text;
  if (operation === "replace") {
    output = replaceMatches(text, regex, replacementText);
  } else if (operation === "extract") {
    output = extractMatches(rows, options.joinMode ?? "lines");
  } else if (operation === "remove-lines") {
    output = removeMatchingLines(text, regex);
  }

  if (ignoredZeroLength > 0) {
    warnings.push(`${ignoredZeroLength} zero-length match${ignoredZeroLength === 1 ? "" : "es"} ignored in the match table.`);
  }
  if (rows.length === 0 && ignoredZeroLength === 0) {
    warnings.push("No matches were found.");
  }

  return {
    output,
    rows,
    warnings,
    stats: {
      inputCharacters: text.length,
      matches: rows.length,
      outputCharacters: output.length
    },
    operation
  };
}

export function summarizeTextSearchReplace(result, operationLabel, searchMode) {
  return [
    "Text Search / Replace",
    "",
    `Operation: ${operationLabel}`,
    `Search mode: ${searchMode === "regex" ? "JavaScript regex" : "Plain text"}`,
    `Input characters: ${result.stats.inputCharacters}`,
    `Matches: ${result.stats.matches}`,
    `Output characters: ${result.stats.outputCharacters}`
  ].join("\n");
}
