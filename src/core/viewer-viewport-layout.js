import { fixedSlotForInterval } from './viewer-track-layout.js';
import { LINEAR_VIEWER_ROW_LIMIT } from './viewer-limits.js';
// Geometry depends on the window and track groups, never the genomic interval.
export function viewerViewportHeight(windowHeight = 900) {
  return Math.round(Math.max(480, Math.min(640, windowHeight - 80)));
}

export function allocateViewerLanes(tracks, totalLanes, limit = LINEAR_VIEWER_ROW_LIMIT) {
  const demands = tracks.map(track => Math.max(1, Math.min(limit,
    (track.items ?? []).reduce((demand, item) => Math.max(demand, (fixedSlotForInterval(item, track) ?? -1) + 1),
      new Set((track.items ?? []).map(item => item.layoutGroup ?? item)).size))));
  const lanes = tracks.map(() => 1);
  let remaining = Math.max(0, Math.floor(totalLanes) - lanes.length);
  while (remaining > 0) {
    let allocated = false;
    for (let i = 0; i < lanes.length && remaining; i++) {
      if (lanes[i] >= demands[i]) continue;
      lanes[i]++; remaining--; allocated = true;
    }
    if (!allocated) break;
  }
  return new Map(tracks.map((track, index) => [track, lanes[index]]));
}

// A 20% exit margin prevents density/detail flicker near the threshold.
export function viewerDensityDecision(track, state, score) {
  state.densityMemory ??= new Map();
  const key = track.id || track.type;
  const density = score > (state.densityMemory.get(key) ? 0.8 : 1);
  state.densityMemory.set(key, density);
  return density;
}
