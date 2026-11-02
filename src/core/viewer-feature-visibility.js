// Reserved in every view so disclosure changes cannot move rows or rings.
export const VIEWER_VISIBILITY_FOOTER_HEIGHT = 48;

export function viewerFeatureVisibility(record, state) {
  const entries = state.trackOverflows ?? [];
  const hiddenCount = entries.reduce((total, entry) => total + (entry.summary ? 0 : entry.count || 0), 0);
  const density = entries.some(entry => entry.summary);
  const filtered = (record.tracks ?? []).some((track, index) => {
    // Optional GC/composition plots are not feature annotations.
    if (track.type === 'quantitative') return false;
    const key = String(track.id || track.type || `track-${index + 1}`);
    return state.hiddenTrackIds?.has(key) || Boolean(state.hiddenTrackItemTypes?.get(key)?.size);
  });
  const lines = [];
  if (density) lines.push('Density overview: individual features summarized.');
  if (hiddenCount) lines.push(`${hiddenCount.toLocaleString()} features hidden in this view (display limit).`);
  if (filtered) lines.push('Filters active: some annotations excluded.');
  return { density, hiddenCount, filtered, lines };
}
