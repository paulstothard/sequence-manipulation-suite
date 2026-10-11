// Match d3-zoom's input normalization (also used by the Tree Viewer).
// https://d3js.org/d3-zoom#zoom_wheelDelta
// Trackpads emit many small pixel deltas; pinch is delivered as Ctrl-wheel.
export function viewerWheelZoomFactor(event) {
  const deltaY = event?.deltaY;
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const units = event.deltaMode === 1 ? 0.05 : event.deltaMode === 2 ? 1 : 0.002;
  const exponent = -deltaY * units * (event.ctrlKey ? 10 : 1);
  // Keep malformed/extreme input finite; viewers enforce their own zoom limits.
  return 2 ** Math.max(-20, Math.min(20, exponent));
}
