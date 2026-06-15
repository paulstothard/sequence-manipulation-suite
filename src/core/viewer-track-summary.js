export const VIEWER_TRACK_SUMMARY_VERSION = 1;

const DEFAULT_MAX_BINS = 4096;
const DEFAULT_TARGET_BIN_SIZE = 5000;
const DEFAULT_MIN_BINS = 64;

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeLength(value) {
  const length = Number.parseInt(value, 10);
  return Number.isFinite(length) && length > 0 ? length : 0;
}

function chooseBinCount(length, itemCount, options = {}) {
  const maxBins = clampInteger(options.maxBins, DEFAULT_MAX_BINS, 16, 65536);
  const minBins = clampInteger(options.minBins, DEFAULT_MIN_BINS, 1, maxBins);
  if (length <= 0) return minBins;
  const byLength = Math.ceil(length / Math.max(1, Number(options.targetBinSize) || DEFAULT_TARGET_BIN_SIZE));
  const byItems = Math.ceil(Math.sqrt(Math.max(1, itemCount)) * 8);
  return Math.min(maxBins, Math.max(minBins, byLength, byItems));
}

function emptyBins(length, binCount) {
  const binSize = length / binCount;
  return Array.from({ length: binCount }, (_, index) => ({
    start: Math.floor(index * binSize),
    end: index === binCount - 1 ? length : Math.floor((index + 1) * binSize),
    count: 0,
    bases: 0
  }));
}

function binIndexForPosition(positionZeroBased, length, binCount) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(binCount - 1, Math.floor((positionZeroBased / length) * binCount)));
}

function itemParts(item, length) {
  const rawParts = Array.isArray(item.parts) && item.parts.length > 0
    ? item.parts
    : [{ start: item.start, end: item.end }];
  const parts = [];
  for (const part of rawParts) {
    const start = Number(part.start);
    const end = Number(part.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const startZero = Math.max(0, Math.min(length, start - 1));
    const endZeroExclusive = Math.max(0, Math.min(length, end));
    if (start <= end) {
      if (endZeroExclusive > startZero) parts.push({ start: startZero, end: endZeroExclusive });
    } else {
      if (length > startZero) parts.push({ start: startZero, end: length });
      if (endZeroExclusive > 0) parts.push({ start: 0, end: endZeroExclusive });
    }
  }
  return parts;
}

function summarizePoints(items, length, binCount) {
  const bins = emptyBins(length, binCount);
  for (const item of items) {
    const position = Number(item.position ?? item.start);
    if (!Number.isFinite(position)) continue;
    const clamped = Math.max(1, Math.min(length, position));
    const index = binIndexForPosition(clamped - 1, length, binCount);
    bins[index].count += 1;
  }
  return bins;
}

function summarizeIntervals(items, length, binCount) {
  const bins = emptyBins(length, binCount);
  for (const item of items) {
    const parts = itemParts(item, length);
    for (const part of parts) {
      const firstBin = binIndexForPosition(part.start, length, binCount);
      const lastBin = binIndexForPosition(Math.max(part.start, part.end - 1), length, binCount);
      for (let index = firstBin; index <= lastBin; index += 1) {
        const bin = bins[index];
        const overlap = Math.max(0, Math.min(part.end, bin.end) - Math.max(part.start, bin.start));
        if (overlap <= 0) continue;
        bin.count += 1;
        bin.bases += overlap;
      }
    }
  }
  return bins;
}

function compactBins(bins) {
  return bins.filter((bin) => bin.count > 0 || bin.bases > 0);
}

export function makeViewerTrackSummary(track, recordLength, options = {}) {
  const length = normalizeLength(recordLength);
  const items = Array.isArray(track?.items) ? track.items : [];
  const itemCount = items.length;
  const mode = track?.type === "restriction-sites" ? "points" : "intervals";
  const binCount = chooseBinCount(length, itemCount, options);
  const bins = mode === "points"
    ? summarizePoints(items, length, binCount)
    : summarizeIntervals(items, length, binCount);
  const nonEmptyBins = compactBins(bins);
  return {
    version: VIEWER_TRACK_SUMMARY_VERSION,
    mode,
    length,
    itemCount,
    binCount,
    binSize: length > 0 ? length / binCount : 0,
    nonEmptyBinCount: nonEmptyBins.length,
    maxCount: nonEmptyBins.reduce((max, bin) => Math.max(max, bin.count), 0),
    maxBases: nonEmptyBins.reduce((max, bin) => Math.max(max, bin.bases), 0),
    bins: nonEmptyBins
  };
}
