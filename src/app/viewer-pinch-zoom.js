import { installCanvasTrackpadZoom } from './viewer-trackpad-zoom.js';
import { viewerSurfaceTouches } from './viewer-surface-touches.js';

function pinchPosition(touches) {
  if (touches.length !== 2) return null;
  const [first, second] = touches;
  const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  if (!Number.isFinite(distance) || distance < 1) return null;
  return { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2, distance };
}

// Touch dragging must not depend on compatibility mouse events: browsers emit
// those for taps, but do not provide a mouse drag stream for a finger swipe.
export function installCanvasPinchZoom(canvas, {
  onStart, onChange, onEnd, onContact, onTap,
  onPanStart, onPanMove, onPanEnd, panAxis = "x"
}) {
  const document = canvas.ownerDocument ?? canvas;
  const window = document.defaultView;
  let previous = null, single = null, suppressClickUntil = 0, suspended = false;
  const suppressClick = () => { suppressClickUntil = Date.now() + 500; };
  const point = touch => ({ clientX: touch.clientX, clientY: touch.clientY, button: 0, target: canvas });
  const finishPinch = () => {
    if (previous) { onEnd?.(); suppressClick(); }
    previous = null;
  };
  const finishPan = (cancelled) => {
    if (single?.active) { onPanEnd?.({ ...single.last, cancelled }); suppressClick(); }
    single = null;
  };
  const beginSingle = (touch, tapAllowed = false) => {
    single = { id: touch.identifier, start: point(touch), last: point(touch), active: false, scrolling: false, tapAllowed };
    onContact?.();
  };
  const start = event => {
    suspended = false;
    const touches = viewerSurfaceTouches(event, canvas);
    if (!previous && !single) suppressClickUntil = 0;
    if (touches.length === 1 && onPanStart) {
      finishPinch();
      if (!single || single.id !== touches[0].identifier) { finishPan(true); beginSingle(touches[0], true); }
      return;
    }
    finishPan(true);
    const current = pinchPosition(touches);
    if (!current) { finishPinch(); return; }
    event.preventDefault();
    if (!previous) onStart?.();
    previous = current;
  };
  const move = event => {
    if (suspended) return;
    const touches = viewerSurfaceTouches(event, canvas);
    if (touches.length === 1 && onPanStart) {
      finishPinch();
      const touch = touches[0];
      if (!single || single.id !== touch.identifier) { finishPan(true); beginSingle(touch); return; }
      single.last = point(touch);
      if (single.scrolling) return;
      if (!single.active) {
        const dx = touch.clientX - single.start.clientX, dy = touch.clientY - single.start.clientY;
        if (Math.hypot(dx, dy) <= 4) return;
        // Linear plots reserve vertical swipes for native page scrolling.
        if (panAxis === "x" && Math.abs(dy) > Math.abs(dx)) { single.scrolling = true; return; }
        single.active = true;
        onPanStart(single.start);
      }
      event.preventDefault();
      suppressClick();
      onPanMove?.(single.last);
      return;
    }
    finishPan(true);
    const current = pinchPosition(touches);
    if (!current) { finishPinch(); return; }
    event.preventDefault();
    if (!previous) onStart?.();
    else onChange?.({ previous, current, factor: current.distance / previous.distance });
    previous = current;
  };
  const end = event => {
    if (!previous && !single) return;
    const touches = viewerSurfaceTouches(event, canvas);
    if (event.type === "touchcancel") {
      if (event.changedTouches && !viewerSurfaceTouches({ touches: event.changedTouches }, canvas).length) return;
      finishPan(true); finishPinch(); return;
    }
    if (touches.length === 2) return;
    finishPinch();
    if (touches.length === 1 && onPanStart) {
      const remaining = touches[0];
      if (!single || single.id !== remaining.identifier) { finishPan(true); beginSingle(remaining); }
    } else {
      if (!touches.length && single && !single.active && !single.scrolling && single.tapAllowed && onTap) {
        event.preventDefault();
        onTap(single.last);
      }
      finishPan(touches.length > 0);
    }
  };
  const click = event => {
    if (event.detail === 0 || (!previous && !single?.active && Date.now() >= suppressClickUntil)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const pointerDown = () => { if (!previous && !single) suppressClickUntil = 0; };
  const blur = () => { suspended = true; finishPan(true); finishPinch(); };
  const cleanupTrackpad = installCanvasTrackpadZoom(canvas, {
    onStart: () => { finishPan(true); finishPinch(); onContact?.(); onStart?.(); },
    onChange,
    onEnd: () => { onEnd?.(); suppressClick(); }
  });
  canvas.addEventListener("click", click, true);
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  document.addEventListener("touchend", end, { passive: false });
  document.addEventListener("touchcancel", end);
  window?.addEventListener("blur", blur);
  return () => {
    cleanupTrackpad();
    finishPan(true);
    finishPinch();
    canvas.removeEventListener("click", click, true);
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("touchstart", start);
    canvas.removeEventListener("touchmove", move);
    document.removeEventListener("touchend", end);
    document.removeEventListener("touchcancel", end);
    window?.removeEventListener("blur", blur);
  };
}
