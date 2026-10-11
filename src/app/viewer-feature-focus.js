// Adapted from Assembly Variant Finder v3.0.1's opt-in feature zoom. Targets
// use local one-based inclusive intervals; anchors use zero-based coordinates.
const POINTER_RELEASE_DISTANCE = 24;
const SMALL_FEATURE_WIDTH = 24;
const WHEEL_GESTURE_GAP_MS = 350;

function featureInterval(record, target) {
  if (!Number.isInteger(target?.itemIndex) && !target?.featureId) return null;
  const start = Number(target.start) - 1, end = Number(target.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= record.length || end < 1 || end > record.length) return null;
  const span = end > start ? end - start : record.topology === 'circular' ? record.length - start + end : 0;
  if (span <= 0) return null;
  return { center: (start + span / 2) % record.length, span };
}

function measureLinearFeature(region, focus, { x, y, viewStart, viewEnd, plotLeft, plotRight }) {
  if (region.shape !== 'rect' || focus.center < viewStart || focus.center > viewEnd) return null;
  const fraction = (focus.center - viewStart) / (viewEnd - viewStart);
  return {
    fraction,
    width: focus.span * (plotRight - plotLeft) / (viewEnd - viewStart),
    dx: Math.abs(x - (plotLeft + fraction * (plotRight - plotLeft))),
    dy: Math.max(region.y1 - y, y - region.y2, 0)
  };
}

export function featureFocus(record, target) {
  const track = record.tracks?.find(track => (track.id || track.type) === target?.trackId);
  const interval = featureInterval(record, target);
  if (track?.focusOnSelect !== true || !interval) return null;
  const flank = Number(track.focusFlankBp ?? 150);
  return { ...interval, flank: Number.isFinite(flank) && flank >= 0 ? Math.min(flank, record.length) : 150 };
}

export function createFeatureZoomController(record) {
  let selected = null, gesture = null, pointer = null;
  function release() { selected = null; gesture = null; pointer = null; }
  function move(x, y) {
    if (pointer && Math.hypot(x - pointer.x, y - pointer.y) > POINTER_RELEASE_DISTANCE) release();
    if (selected || gesture) pointer ??= { x, y };
  }
  return {
    release, move,
    select(target, position = null) {
      release();
      const focus = featureFocus(record, target);
      selected = focus ? { center: focus.center, fraction: 0.5, span: focus.span } : null;
      pointer = selected ? position : null;
      return focus;
    },
    anchor: () => selected,
    panAtLimit: () => !selected && !gesture?.anchor && gesture?.startedAtZoomLimit === true,
    endGesture() { gesture = null; pointer = null; },
    wheel({ x, y, now, regions, viewStart, viewEnd, plotLeft, plotRight, atZoomLimit = false, measureRegion = measureLinearFeature }) {
      move(x, y);
      const pxPerBase = (plotRight - plotLeft) / (viewEnd - viewStart);
      // A selected long deletion/interval must not force wheel zoom to its centre.
      // Single-base markers retain their precise anchor even at base resolution.
      if (!gesture && selected?.span > 1 && selected.span * pxPerBase > SMALL_FEATURE_WIDTH) selected = null;
      if (selected) {
        gesture = { anchor: selected, time: now, startedAtZoomLimit: atZoomLimit };
        return selected;
      }
      // Keep an acquired small feature through pauses and enlargement, until the
      // pointer deliberately moves. Null anchors last only for this scroll burst.
      if (gesture && (gesture.anchor || now - gesture.time < WHEEL_GESTURE_GAP_MS)) {
        gesture.time = now;
        return gesture.anchor;
      }
      const candidates = new Map();
      for (const region of regions) {
        const track = record.tracks?.find(track => (track.id || track.type) === region.target?.trackId);
        const variant = track?.focusOnSelect === true;
        if (!track || (!variant && (region.target?.kind !== 'interval' || track.type === 'aligned-reads' || region.target.featureType === 'source'))) continue;
        const focus = featureInterval(record, region.target);
        if (!focus) continue;
        // Renderers supply screen geometry; acquisition, ambiguity and gesture
        // retention remain identical for linear and circular viewers.
        const measured = measureRegion(region, focus, { x, y, viewStart, viewEnd, plotLeft, plotRight });
        if (!measured) continue;
        // Use the full biological interval, not a clipped exon or hit rectangle.
        if (!(variant && focus.span === 1) && measured.width > SMALL_FEATURE_WIDTH) continue;
        const { fraction, dx, dy } = measured;
        if (dx > (variant ? 32 : 12) || dy > (variant ? 14 : 6)) continue;
        const distance = Math.hypot(dx, dy);
        // Multiple hit regions can describe the same compound feature.
        const key = JSON.stringify([region.target.trackId, region.target.itemIndex ?? region.target.featureId]);
        if (!candidates.has(key) || distance < candidates.get(key).distance) candidates.set(key, { focus, fraction, distance });
      }
      const sorted = [...candidates.values()].sort((a, b) => a.distance - b.distance);
      const candidate = sorted[0] && (!sorted[1] || sorted[1].distance - sorted[0].distance >= 8) ? sorted[0] : null;
      const anchor = candidate ? { center: candidate.focus.center, fraction: candidate.fraction } : null;
      // Retain even an ambiguous (null) anchor for this gesture, so a redraw
      // cannot suddenly snap an ordinary pointer zoom to a different variant.
      gesture = { anchor, time: now, startedAtZoomLimit: atZoomLimit };
      pointer = { x, y };
      return anchor;
    }
  };
}
