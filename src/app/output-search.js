import { findSequenceTextMatches } from "../core/sequence-text-search.js";

export const DEFAULT_OUTPUT_HIGHLIGHT_LIMIT = 300_000;
export const DEFAULT_OUTPUT_HIGHLIGHT_WINDOW = 8_000;

export function findLiteralMatches(text = "", query = "") {
  const needle = String(query ?? "").toLowerCase();
  if (!needle) {
    return [];
  }
  const haystack = String(text ?? "").toLowerCase();
  const matches = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    matches.push({ start: index, end: index + needle.length });
    index = haystack.indexOf(needle, index + needle.length);
  }
  return matches;
}

function matchRanges(match) {
  return Array.isArray(match?.ranges) && match.ranges.length > 0
    ? match.ranges
    : [{ start: match.start, end: match.end }];
}

function literalDuplicatesSequenceMatch(literal, sequenceMatches) {
  return sequenceMatches.some((match) => {
    const ranges = matchRanges(match);
    return literal.start === ranges[0].start && literal.end === ranges.at(-1).end;
  });
}

export function findOutputMatches(text = "", query = "", sequenceDocument = null, mode = "smart") {
  const sequenceMatches = mode === "text" ? [] : findSequenceTextMatches(sequenceDocument, query);
  const literalMatches = mode === "sequence" ? [] : findLiteralMatches(text, query)
    .filter((match) => !literalDuplicatesSequenceMatch(match, sequenceMatches))
    .map((match) => ({ ...match, type: "text" }));
  return [...sequenceMatches, ...literalMatches]
    .sort((left, right) => left.start - right.start || left.end - right.end || (left.type === "sequence" ? -1 : 1));
}

export function getOutputSearchCountText({ query = "", matchCount = 0, currentIndex = -1 } = {}) {
  if (!query) {
    return "No search";
  }
  if (matchCount <= 0 || currentIndex < 0) {
    return "No matches";
  }
  return `${currentIndex + 1} of ${matchCount}`;
}

export function getNextSearchIndex(currentIndex, matchCount, direction) {
  if (matchCount <= 0) {
    return -1;
  }
  return (currentIndex + direction + matchCount) % matchCount;
}

function makeTextSegment(text) {
  return text ? { type: "text", text } : null;
}

function buildHighlightSegments(text, matches, currentIndex, start = 0, end = text.length) {
  const segments = [];
  let cursor = start;
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    for (const range of matchRanges(match)) {
      if (range.end <= start || range.start >= end || range.end <= cursor) {
        continue;
      }
      const safeStart = Math.max(range.start, start, cursor);
      const safeEnd = Math.min(range.end, end);
      const before = makeTextSegment(text.slice(cursor, safeStart));
      if (before) {
        segments.push(before);
      }
      const segment = {
        type: "match",
        text: text.slice(safeStart, safeEnd),
        current: index === currentIndex
      };
      if (match.type) segment.matchType = match.type;
      if (match.trackLabel) segment.trackLabel = match.trackLabel;
      segments.push(segment);
      cursor = safeEnd;
    }
  }
  const after = makeTextSegment(text.slice(cursor, end));
  if (after) {
    segments.push(after);
  }
  return segments;
}

export function getOutputHighlightModel(
  text = "",
  matches = [],
  currentIndex = -1,
  {
    highlightLimit = DEFAULT_OUTPUT_HIGHLIGHT_LIMIT,
    windowSize = DEFAULT_OUTPUT_HIGHLIGHT_WINDOW
  } = {}
) {
  const source = String(text ?? "");
  const currentMatch = matches[currentIndex];
  if (!currentMatch) {
    return { mode: "none", segments: [] };
  }
  if (source.length <= highlightLimit) {
    return {
      mode: "full",
      segments: buildHighlightSegments(source, matches, currentIndex)
    };
  }

  const halfWindow = Math.floor(windowSize / 2);
  const currentRanges = matchRanges(currentMatch);
  const windowStart = Math.max(0, currentRanges[0].start - halfWindow);
  const windowEnd = Math.min(source.length, currentRanges.at(-1).end + halfWindow);
  const windowMatches = matches.filter((match) =>
    matchRanges(match).some((range) => range.end > windowStart && range.start < windowEnd)
  );
  const segments = [];
  if (windowStart > 0) {
    segments.push({
      type: "text",
      text: `... ${windowStart.toLocaleString()} characters before current match ...\n`
    });
  }
  segments.push(...buildHighlightSegments(source, windowMatches, windowMatches.indexOf(currentMatch), windowStart, windowEnd));
  if (windowEnd < source.length) {
    segments.push({
      type: "text",
      text: `\n... ${(source.length - windowEnd).toLocaleString()} characters after current match ...`
    });
  }
  return { mode: "window", segments, windowStart, windowEnd };
}
