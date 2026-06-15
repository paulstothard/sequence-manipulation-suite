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
    if (match.end <= start || match.start >= end) {
      continue;
    }
    const safeStart = Math.max(match.start, start);
    const safeEnd = Math.min(match.end, end);
    const before = makeTextSegment(text.slice(cursor, Math.max(cursor, safeStart)));
    if (before) {
      segments.push(before);
    }
    segments.push({
      type: "match",
      text: text.slice(safeStart, safeEnd),
      current: index === currentIndex
    });
    cursor = safeEnd;
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
  const windowStart = Math.max(0, currentMatch.start - halfWindow);
  const windowEnd = Math.min(source.length, currentMatch.end + halfWindow);
  const windowMatches = matches.filter((match) => match.end > windowStart && match.start < windowEnd);
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
