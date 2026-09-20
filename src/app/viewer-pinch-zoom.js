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
  const start = (event) => {
    const current = pinchPosition(event.targetTouches);
    if (!current) return;
    event.preventDefault();
    if (!previous) onStart?.();
    previous = current;
  };
  const move = (event) => {
    const current = pinchPosition(event.targetTouches);
    if (!current) return;
    event.preventDefault();
    if (!previous) {
      onStart?.();
    } else {
      onChange?.({ previous, current, factor: current.distance / previous.distance });
    }
    previous = current;
  };
  const end = (event) => {
    if (event.type !== "touchcancel" && event.targetTouches.length >= 2) return;
    if (previous) onEnd?.();
    previous = null;
  };
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  canvas.addEventListener("touchcancel", end);
  return () => {
    canvas.removeEventListener("touchstart", start);
    canvas.removeEventListener("touchmove", move);
    canvas.removeEventListener("touchend", end);
    canvas.removeEventListener("touchcancel", end);
  };
}
