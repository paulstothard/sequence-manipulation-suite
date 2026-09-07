// One categorical color policy for editing controls, figures and legends.
export const TRACK_PALETTE = Object.freeze([
  "#0072b2", "#e69f00", "#009e73", "#cc79a7",
  "#d55e00", "#56b4e9", "#f0e442", "#555555",
]);
export function trackCategories(rows, field) {
  return [...new Set(rows.map((row) => row.values[field])
    .filter((value) => value !== undefined && value !== null).map(String))].sort();
}
export function categoryColor(track, category, categories) {
  return track.colors?.[category] ?? TRACK_PALETTE[Math.max(0, categories.indexOf(category)) % TRACK_PALETTE.length];
}
