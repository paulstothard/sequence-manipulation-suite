const DEFAULT_MAX_WINDOWS = 1200;

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function niceWindowSize(length, maxWindows = DEFAULT_MAX_WINDOWS) {
  if (length <= 0) return 1;
  const rough = Math.max(1, Math.ceil(length / maxWindows));
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  if (scaled <= 1) return power;
  if (scaled <= 2) return 2 * power;
  if (scaled <= 5) return 5 * power;
  return 10 * power;
}

export function chooseCompositionWindowSize(length, requestedWindowSize = 0) {
  const safeLength = clampInteger(length, 0, 0, Number.MAX_SAFE_INTEGER);
  if (safeLength <= 0) return 1;
  const requested = Number.parseInt(requestedWindowSize, 10);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.max(1, Math.min(safeLength, requested));
  }
  if (safeLength <= 120) return Math.max(6, Math.ceil(safeLength / 8));
  if (safeLength <= 1000) return 25;
  return Math.max(25, Math.min(safeLength, niceWindowSize(safeLength)));
}

function countWindow(sequence, start, end) {
  const counts = { A: 0, C: 0, G: 0, T: 0, U: 0, ambiguous: 0 };
  for (let index = start; index < end; index += 1) {
    const base = sequence[index];
    if (base === "A" || base === "C" || base === "G" || base === "T" || base === "U") {
      counts[base] += 1;
    } else {
      counts.ambiguous += 1;
    }
  }
  return counts;
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function makeWindowRows(sequence, windowSize) {
  const rows = [];
  for (let start = 0; start < sequence.length; start += windowSize) {
    const end = Math.min(sequence.length, start + windowSize);
    const counts = countWindow(sequence, start, end);
    const unambiguous = counts.A + counts.C + counts.G + counts.T + counts.U;
    const gc = counts.G + counts.C;
    const gcPercent = unambiguous > 0 ? (gc / unambiguous) * 100 : null;
    const gcSkew = gc > 0 ? (counts.G - counts.C) / gc : null;
    rows.push({
      start: start + 1,
      end,
      length: end - start,
      gc_percent: round(gcPercent, 3),
      gc_skew: round(gcSkew, 4),
      ambiguous_bases: counts.ambiguous
    });
  }
  return rows;
}

function normalizeCompositionTrackMode(options = {}) {
  if (typeof options.showGcPercent === "boolean" || typeof options.showGcSkew === "boolean") {
    const showGcPercent = options.showGcPercent !== false;
    const showGcSkew = options.showGcSkew !== false;
    if (showGcPercent && showGcSkew) return "gc-and-skew";
    if (showGcPercent) return "gc";
    if (showGcSkew) return "gc-skew";
    return "none";
  }
  return ["none", "gc", "gc-skew", "gc-and-skew"].includes(options.compositionTracks)
    ? options.compositionTracks
    : "gc-and-skew";
}

function wantsTrack(mode, metric) {
  if (mode === "none") return false;
  if (mode === "gc-and-skew") return true;
  if (mode === "gc") return metric === "gc_percent";
  if (mode === "gc-skew") return metric === "gc_skew";
  return true;
}

function makeCompositionTrackObjects(rows, windowSize, mode, options = {}) {
  const generatedBy = options.generatedBy;
  const tracks = [];
  if (wantsTrack(mode, "gc_percent")) {
    tracks.push({
      id: "gc-percent",
      type: "quantitative",
      label: "GC percent",
      metric: "gc_percent",
      unit: "%",
      yMin: 0,
      yMax: 100,
      baseline: 50,
      color: "#0f766e",
      positiveColor: "#0f766e",
      negativeColor: "#b45309",
      windowSize,
      ...(generatedBy ? { generatedBy } : {}),
      items: rows.map((row) => ({
        start: row.start,
        end: row.end,
        value: row.gc_percent,
        label: row.gc_percent === null ? "GC n/a" : `GC ${row.gc_percent}%`,
        ambiguous_bases: row.ambiguous_bases
      }))
    });
  }
  if (wantsTrack(mode, "gc_skew")) {
    tracks.push({
      id: "gc-skew",
      type: "quantitative",
      label: "GC skew",
      metric: "gc_skew",
      unit: "",
      yMin: -1,
      yMax: 1,
      baseline: 0,
      color: "#7c3aed",
      positiveColor: "#2563eb",
      negativeColor: "#dc2626",
      windowSize,
      ...(generatedBy ? { generatedBy } : {}),
      items: rows.map((row) => ({
        start: row.start,
        end: row.end,
        value: row.gc_skew,
        label: row.gc_skew === null ? "GC skew n/a" : `GC skew ${row.gc_skew}`,
        ambiguous_bases: row.ambiguous_bases
      }))
    });
  }
  return tracks;
}

export function makeDnaCompositionTracksSync(sequence, options = {}) {
  const normalizedSequence = String(sequence ?? "").toUpperCase().replaceAll("U", "T");
  const mode = normalizeCompositionTrackMode(options);
  if (mode === "none" || normalizedSequence.length === 0) return [];
  const windowSize = chooseCompositionWindowSize(normalizedSequence.length, options.compositionWindowSize);
  return makeCompositionTrackObjects(makeWindowRows(normalizedSequence, windowSize), windowSize, mode, options);
}

export async function makeDnaCompositionTracks(sequence, options = {}, context = {}) {
  const normalizedSequence = String(sequence ?? "").toUpperCase().replaceAll("U", "T");
  const mode = normalizeCompositionTrackMode(options);
  if (mode === "none" || normalizedSequence.length === 0) return [];

  const windowSize = chooseCompositionWindowSize(normalizedSequence.length, options.compositionWindowSize);
  const rows = [];
  for (let start = 0; start < normalizedSequence.length; start += windowSize) {
    if (rows.length % 512 === 0) {
      context.throwIfCancelled?.();
      await context.yieldIfNeeded?.();
    }
    const [row] = makeWindowRows(normalizedSequence.slice(start, Math.min(normalizedSequence.length, start + windowSize)), windowSize);
    rows.push({
      ...row,
      start: start + 1,
      end: Math.min(normalizedSequence.length, start + windowSize)
    });
  }

  return makeCompositionTrackObjects(rows, windowSize, mode, options);
}
