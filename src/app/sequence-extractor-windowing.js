export const SEQUENCE_EXTRACTOR_FULL_DOCUMENT_LIMIT = 10_000;
export const SEQUENCE_EXTRACTOR_WINDOW_SIZE = 1_000;

function clampInteger(value, minimum, maximum) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return minimum;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function sequenceExtractorUsesWindow(recordLength, limit = SEQUENCE_EXTRACTOR_FULL_DOCUMENT_LIMIT) {
  return Math.max(0, Number(recordLength) || 0) > Math.max(1, Number(limit) || 1);
}

export function clampSequenceExtractorWindowStart(recordLength, requestedStart, windowSize = SEQUENCE_EXTRACTOR_WINDOW_SIZE) {
  const length = Math.max(0, Math.trunc(Number(recordLength) || 0));
  const size = Math.max(1, Math.trunc(Number(windowSize) || 1));
  const lastStart = Math.max(1, length - size + 1);
  return clampInteger(requestedStart, 1, lastStart);
}

export function sequenceExtractorWindowForCoordinate(recordLength, coordinate, windowSize = SEQUENCE_EXTRACTOR_WINDOW_SIZE) {
  const length = Math.max(0, Math.trunc(Number(recordLength) || 0));
  const size = Math.max(1, Math.trunc(Number(windowSize) || 1));
  const position = clampInteger(coordinate, 1, Math.max(1, length));
  const start = clampSequenceExtractorWindowStart(length, position - Math.floor(size / 2), size);
  return {
    start,
    end: Math.min(length, start + size - 1)
  };
}

export function sequenceExtractorVisibleWindow(recordLength, requestedStart = 1, options = {}) {
  const length = Math.max(0, Math.trunc(Number(recordLength) || 0));
  const limit = Math.max(1, Math.trunc(Number(options.fullDocumentLimit) || SEQUENCE_EXTRACTOR_FULL_DOCUMENT_LIMIT));
  const size = Math.max(1, Math.trunc(Number(options.windowSize) || SEQUENCE_EXTRACTOR_WINDOW_SIZE));
  if (!sequenceExtractorUsesWindow(length, limit)) {
    return { start: length > 0 ? 1 : 0, end: length, windowed: false };
  }
  const start = clampSequenceExtractorWindowStart(length, requestedStart, size);
  return { start, end: Math.min(length, start + size - 1), windowed: true };
}

function itemStart(item, type, recordLength) {
  const value = type === "restriction-sites"
    ? item.cutAfter ?? item.cutPosition ?? item.position ?? item.start
    : item.start ?? item.position;
  const position = Number(value);
  if (!Number.isFinite(position)) return Number.NaN;
  return type === "restriction-sites"
    ? Math.max(1, Math.min(Number(recordLength) || position, position))
    : position;
}

function itemEnd(item, type, recordLength) {
  if (type === "restriction-sites") return itemStart(item, type, recordLength);
  const value = Number(item.end ?? item.start ?? item.position);
  return value;
}

function upperBoundByStart(items, end) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (items[middle].start <= end) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function makeSequenceExtractorRecordIndex(record = {}) {
  const recordLength = Math.max(0, Number(record.length) || String(record.sequence ?? "").length);
  const indexedTracks = new Map();
  for (const track of record.tracks ?? []) {
    const type = String(track.type ?? "");
    if (!type) continue;
    const entries = indexedTracks.get(type) ?? [];
    for (const item of track.items ?? []) {
      const start = itemStart(item, type, recordLength);
      const end = itemEnd(item, type, recordLength);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      entries.push({ item, start: Math.min(start, end), end: Math.max(start, end) });
    }
    indexedTracks.set(type, entries);
  }
  for (const entries of indexedTracks.values()) {
    entries.sort((left, right) =>
      left.start - right.start || left.end - right.end
    );
  }

  const restrictionCounts = new Map();
  for (const { item: site } of indexedTracks.get("restriction-sites") ?? []) {
    const key = site.enzymeId || site.enzyme || site.label;
    restrictionCounts.set(key, (restrictionCounts.get(key) ?? 0) + 1);
  }

  return {
    recordLength,
    restrictionCounts,
    items(type) {
      return (indexedTracks.get(type) ?? []).map((entry) => entry.item);
    },
    count(type) {
      return (indexedTracks.get(type) ?? []).length;
    },
    query(type, start, end) {
      const entries = indexedTracks.get(type) ?? [];
      const rangeStart = Math.min(Number(start), Number(end));
      const rangeEnd = Math.max(Number(start), Number(end));
      if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || entries.length === 0) return [];
      const upper = upperBoundByStart(entries, rangeEnd);
      return entries.slice(0, upper)
        .filter((entry) => entry.end >= rangeStart)
        .map((entry) => entry.item);
    }
  };
}

export function bucketSequenceExtractorItems(items, windowStart, windowEnd, lineWidth, options = {}) {
  const buckets = new Map();
  const firstWindowBase = Number(windowStart);
  const lastWindowBase = Number(windowEnd);
  const width = Math.max(1, Math.trunc(Number(lineWidth) || 1));
  for (const item of items ?? []) {
    const itemStartValue = Number(options.getStart?.(item) ?? item.start ?? item.position);
    const itemEndValue = Number(options.getEnd?.(item) ?? item.end ?? itemStartValue);
    if (!Number.isFinite(itemStartValue) || !Number.isFinite(itemEndValue)) continue;
    const visibleStart = Math.max(firstWindowBase, Math.min(itemStartValue, itemEndValue));
    const visibleEnd = Math.min(lastWindowBase, Math.max(itemStartValue, itemEndValue));
    if (visibleStart > visibleEnd) continue;
    const firstBlock = firstWindowBase + Math.floor((visibleStart - firstWindowBase) / width) * width;
    const lastBlock = firstWindowBase + Math.floor((visibleEnd - firstWindowBase) / width) * width;
    for (let blockStart = firstBlock; blockStart <= lastBlock; blockStart += width) {
      const bucket = buckets.get(blockStart) ?? [];
      bucket.push(item);
      buckets.set(blockStart, bucket);
    }
  }
  return buckets;
}
