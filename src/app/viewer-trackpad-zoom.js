// Safari trackpads supply cumulative GestureEvent.scale rather than Ctrl-wheel.
// Touchscreens can emit both TouchEvents and GestureEvents: leave their zoom to
// the touch controller and cancel only the duplicate browser default here.
// https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html
import { viewerSurfaceTouches } from './viewer-surface-touches.js';

export function installCanvasTrackpadZoom(canvas, { onStart, onChange, onEnd }) {
  const document = canvas.ownerDocument ?? canvas;
  const window = document.defaultView;
  let gesture = null, touches = 0, pointer = null;
  const listeners = [];
  const listen = (target, type, listener, options = {}) => {
    target?.addEventListener(type, listener, options);
    listeners.push(() => target?.removeEventListener(type, listener, options));
  };
  const finish = () => {
    const wasTrackpad = gesture && !gesture.touch;
    gesture = null;
    if (wasTrackpad) onEnd?.();
  };
  const trackPointer = event => {
    if (!event.pointerType || event.pointerType === 'mouse') {
      pointer = { x: event.clientX, y: event.clientY };
    }
  };
  listen(canvas, 'pointermove', trackPointer);
  listen(canvas, 'mousemove', trackPointer);
  listen(canvas, 'mouseleave', () => { pointer = null; });
  listen(canvas, 'touchstart', event => {
    touches = viewerSurfaceTouches(event, canvas).length;
    if (gesture && !gesture.touch) {
      finish();
      gesture = { touch: true };
    }
  }, { passive: true, capture: true });
  const endTouch = event => {
    if (touches) touches = viewerSurfaceTouches(event, canvas).length;
    if (event.type === 'touchcancel') finish();
  };
  listen(document, 'touchend', endTouch, { passive: true });
  listen(document, 'touchcancel', endTouch, { passive: true });
  listen(canvas, 'gesturestart', event => {
    finish();
    event.preventDefault();
    if (touches) { gesture = { touch: true }; return; }
    const rect = canvas.getBoundingClientRect();
    const inside = point => point && Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    const eventPoint = { x: event.clientX, y: event.clientY };
    const anchor = inside(eventPoint) ? eventPoint : inside(pointer) ? pointer
      : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    gesture = { ...anchor, distance: Number.isFinite(event.scale) && event.scale > 0 ? event.scale : 1 };
    onStart?.();
  }, { passive: false });
  listen(canvas, 'gesturechange', event => {
    if (!gesture) return;
    event.preventDefault();
    if (gesture.touch || touches || !Number.isFinite(event.scale) || event.scale <= 0) return;
    const current = { ...gesture, distance: event.scale };
    onChange?.({ previous: gesture, current, factor: current.distance / gesture.distance });
    gesture = current;
  }, { passive: false });
  // A browser may emit wheel events alongside GestureEvents. The capture phase
  // prevents a second zoom in the canvas's existing wheel handler.
  listen(canvas, 'wheel', event => {
    if (!gesture) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { passive: false, capture: true });
  listen(document, 'gestureend', event => {
    if (!gesture) return;
    event.preventDefault();
    finish();
  }, { passive: false });
  listen(window, 'blur', () => { touches = 0; pointer = null; finish(); });
  return () => {
    for (const remove of listeners) remove();
    touches = 0;
    finish();
  };
}
