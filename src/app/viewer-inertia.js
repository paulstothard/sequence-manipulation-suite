const DEFAULT_MAX_SAMPLE_AGE_MS = 320;
const DEFAULT_MIN_DRAG_PX = 18;
const DEFAULT_MIN_SPEED = 0.006;
const DEFAULT_STOP_SPEED = 0.0008;
const DEFAULT_DECAY_PER_FRAME = 0.9;
const FRAME_MS = 16.67;

export function allowsViewerInertia(win = globalThis.window) {
  if (!win?.matchMedia) return true;
  return !win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createInertiaVelocityTracker(options = {}) {
  const maxSampleAgeMs = Number(options.maxSampleAgeMs) || DEFAULT_MAX_SAMPLE_AGE_MS;
  const samples = [];
  return {
    reset() {
      samples.length = 0;
    },
    add(value, time) {
      const numericValue = Number(value);
      const numericTime = Number(time);
      if (!Number.isFinite(numericValue) || !Number.isFinite(numericTime)) return;
      samples.push({ value: numericValue, time: numericTime });
      const cutoff = numericTime - maxSampleAgeMs;
      while (samples.length > 2 && samples[0].time < cutoff) {
        samples.shift();
      }
    },
    velocity(now) {
      const numericNow = Number(now);
      const cutoff = Number.isFinite(numericNow) ? numericNow - maxSampleAgeMs : -Infinity;
      const recent = samples.filter((sample) => sample.time >= cutoff);
      if (recent.length < 2) return 0;
      const first = recent[0];
      const last = recent[recent.length - 1];
      const elapsed = last.time - first.time;
      if (elapsed <= 0) return 0;
      return (last.value - first.value) / elapsed;
    }
  };
}

export function shouldStartViewerInertia({ dragDistancePx, velocity, minDragPx = DEFAULT_MIN_DRAG_PX, minSpeed = DEFAULT_MIN_SPEED } = {}) {
  const distance = Math.abs(Number(dragDistancePx) || 0);
  const speed = Math.abs(Number(velocity) || 0);
  return distance >= minDragPx && speed >= minSpeed;
}

export function decayViewerInertiaVelocity(velocity, elapsedMs, decayPerFrame = DEFAULT_DECAY_PER_FRAME) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  return (Number(velocity) || 0) * Math.pow(decayPerFrame, elapsed / FRAME_MS);
}

export function startViewerInertia(options = {}) {
  const initialVelocity = Number(options.initialVelocity) || 0;
  const stopSpeed = Number(options.stopSpeed) || DEFAULT_STOP_SPEED;
  const decayPerFrame = Number(options.decayPerFrame) || DEFAULT_DECAY_PER_FRAME;
  const now = typeof options.now === "function" ? options.now : () => performance.now();
  const requestFrame = typeof options.requestFrame === "function" ? options.requestFrame : (callback) => requestAnimationFrame(callback);
  const cancelFrame = typeof options.cancelFrame === "function" ? options.cancelFrame : (frame) => cancelAnimationFrame(frame);
  const step = typeof options.step === "function" ? options.step : null;
  const onStop = typeof options.onStop === "function" ? options.onStop : null;
  if (!step || Math.abs(initialVelocity) < stopSpeed) {
    return () => {};
  }
  let active = true;
  let velocity = initialVelocity;
  let lastTime = now();
  let frame = 0;
  function stop() {
    if (!active) return;
    active = false;
    if (frame) cancelFrame(frame);
    frame = 0;
    onStop?.();
  }
  function tick(time) {
    if (!active) return;
    const elapsed = Math.min(64, Math.max(0, Number(time) - lastTime));
    lastTime = Number(time);
    if (elapsed <= 0) {
      frame = requestFrame(tick);
      return;
    }
    const keepGoing = step(velocity * elapsed, { velocity, elapsedMs: elapsed });
    velocity = decayViewerInertiaVelocity(velocity, elapsed, decayPerFrame);
    if (keepGoing === false || Math.abs(velocity) < stopSpeed) {
      stop();
      return;
    }
    frame = requestFrame(tick);
  }
  frame = requestFrame(tick);
  return stop;
}
