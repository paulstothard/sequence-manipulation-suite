// Adapted from Assembly Variant Finder v3.0.1's opt-in feature zoom. Targets
// use local one-based inclusive intervals; anchors use zero-based coordinates.
export function featureFocus(record, target) {
  const track = record.tracks?.find(track => (track.id || track.type) === target?.trackId);
  if (track?.focusOnSelect !== true || (!Number.isInteger(target?.itemIndex) && !target?.featureId)) return null;
  const start = Number(target.start) - 1, end = Number(target.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > record.length) return null;
  const flank = Number(track.focusFlankBp ?? 150);
  return { center: (start + end) / 2, span: end - start, flank: Number.isFinite(flank) && flank >= 0 ? Math.min(flank, record.length) : 150 };
}

export function createFeatureZoomController(record) {
  let selected = null, gesture = null, pointer = null;
  function release() { selected = null; gesture = null; pointer = null; }
  function move(x, y) {
    if (pointer && Math.hypot(x - pointer.x, y - pointer.y) > 48) release();
    if (selected || gesture) pointer ??= { x, y };
  }
  return {
    release, move,
    select(target, position = null) {
      release();
      const focus = featureFocus(record, target);
      selected = focus ? { center: focus.center, fraction: 0.5 } : null;
      pointer = selected ? position : null;
      return focus;
    },
    anchor: () => selected,
    endGesture() { gesture = null; pointer = null; },
    wheel({ x, y, now, regions, viewStart, viewEnd, plotLeft, plotRight }) {
      move(x, y);
      if (selected) return selected;
      if (gesture && now - gesture.time < 350) {
        gesture.time = now;
        return gesture.anchor;
      }
      const candidates = new Map();
      for (const region of regions) {
        const focus = featureFocus(record, region.target);
        if (!focus || region.shape !== 'rect' || focus.center < viewStart || focus.center > viewEnd) continue;
        const fraction = (focus.center - viewStart) / (viewEnd - viewStart);
        const dx = Math.abs(x - (plotLeft + fraction * (plotRight - plotLeft)));
        const dy = Math.max(region.y1 - y, y - region.y2, 0);
        if (dx > 32 || dy > 14) continue;
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
      gesture = { anchor, time: now };
      pointer = { x, y };
      return anchor;
    }
  };
}
