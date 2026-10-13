import { viewerWheelZoomFactor } from './viewer-wheel-zoom.js';

// Camera-only input for the pinned 3Dmol viewer. zoom() already calls show();
// render() would also revisit models, surfaces and pickable atoms on every tick.
export function installStructureZoomInput(host, viewer, onZoom) {
  const document = host.ownerDocument, window = document.defaultView;
  const controller = new window.AbortController();
  const options = { capture: true, passive: false, signal: controller.signal };
  let gestureScale = null, touching = false;
  const resetGesture = () => { gestureScale = null; };
  const zoom = factor => {
    if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return;
    onZoom();
    viewer.zoom(factor);
  };
  host.addEventListener('wheel', event => {
    // Block 3Dmol's second interpretation, including horizontal-only input.
    // The outer Showcase guard still owns whether scroll zoom is enabled.
    event.stopImmediatePropagation();
    const factor = viewerWheelZoomFactor(event);
    if (factor === 1) return;
    event.preventDefault();
    if (gestureScale === null && !touching) zoom(factor);
  }, options);

  // Safari trackpads use cumulative GestureEvent.scale. Touchscreens also emit
  // these events alongside TouchEvents; keep those with 3Dmol's working handler.
  host.addEventListener('touchstart', () => {
    touching = true;
    resetGesture();
  }, { ...options, passive: true });
  const endTouch = event => { if (touching) touching = event.touches.length > 0; };
  document.addEventListener('touchend', endTouch, { ...options, passive: true });
  document.addEventListener('touchcancel', endTouch, { ...options, passive: true });
  host.addEventListener('gesturestart', event => {
    if (touching) return;
    event.preventDefault();
    gestureScale = Number.isFinite(event.scale) && event.scale > 0 ? event.scale : 1;
    onZoom();
  }, options);
  host.addEventListener('gesturechange', event => {
    if (gestureScale === null || touching) return;
    event.preventDefault();
    if (!Number.isFinite(event.scale) || event.scale <= 0) return;
    zoom(event.scale / gestureScale);
    gestureScale = event.scale;
  }, options);
  document.addEventListener('gestureend', event => {
    if (gestureScale !== null) event.preventDefault();
    resetGesture();
  }, options);
  window.addEventListener('blur', () => { touching = false; resetGesture(); }, { signal: controller.signal });
  return () => { controller.abort(); resetGesture(); };
}
