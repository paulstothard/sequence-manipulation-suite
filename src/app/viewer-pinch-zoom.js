function pinchPosition(touches) {
  if (touches.length !== 2) return null;
  const [first, second] = touches;
  const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  if (!Number.isFinite(distance) || distance < 1) return null;
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
    distance
  };
}

export function installCanvasPinchZoom(canvas, { onStart, onChange, onEnd }) {
  let previous = null;
  let suppressClickUntil = 0;
  const finish = () => {
    if (previous) {
      onEnd?.();
      suppressClickUntil = Date.now() + 500;
    }
    previous = null;
  };
  const start = (event) => {
    const current = pinchPosition(event.targetTouches);
    if (!current) { finish(); return; }
    event.preventDefault();
    if (!previous) onStart?.();
    previous = current;
  };
  const move = (event) => {
    const current = pinchPosition(event.targetTouches);
    if (!current) { finish(); return; }
    event.preventDefault();
    if (!previous) {
      onStart?.();
    } else {
      onChange?.({ previous, current, factor: current.distance / previous.distance });
    }
    previous = current;
  };
  const end = (event) => {
    if (event.type !== "touchcancel" && event.targetTouches.length === 2) return;
    finish();
  };
  // A compatibility click after a pinch must not select a base or feature.
  // A fresh pointer action (or keyboard activation) is still an intentional click.
  const click = (event) => {
    if (event.detail === 0 || (!previous && Date.now() >= suppressClickUntil)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const pointerDown = () => { if (!previous) suppressClickUntil = 0; };
  canvas.addEventListener("click", click, true);
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("touchcancel", end);
  return () => {
    canvas.removeEventListener("click", click, true);
    canvas.removeEventListener("pointerdown", pointerDown);
    canvas.removeEventListener("touchstart", start);
    canvas.removeEventListener("touchmove", move);
    canvas.removeEventListener("touchend", end);
    canvas.removeEventListener("touchcancel", end);
  };
}
