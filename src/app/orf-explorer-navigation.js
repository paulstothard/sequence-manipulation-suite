import { computeLinearZoomState } from './dna-viewer-canvas.js';
import { installCanvasPinchZoom } from './viewer-pinch-zoom.js';
import { viewerWheelZoomFactor } from './viewer-wheel-zoom.js';
import { viewerSurfaceTouches } from './viewer-surface-touches.js';
import { createFeatureZoomController } from './viewer-feature-focus.js';
import { allowsViewerInertia, createInertiaVelocityTracker, shouldStartViewerInertia, startViewerInertia } from './viewer-inertia.js';

// Move quickly through genome scales, then return to the viewers' fine control
// near readable bases. Apply the same scale response to buttons and gestures.
export function orfExplorerZoomFactor(factor, view, layout) {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return 1;
  const readableSpan = Math.max(10, (layout.plotRight-layout.plotLeft)/10);
  const span = view.viewEnd-view.viewStart, boundary = readableSpan*4;
  const distance = Math.log(span/boundary);
  // Integrate in logarithmic space so one wheel event and many small events
  // with the same total delta produce the same span, even across the boundary.
  const next = (distance>0?distance/3:distance)-Math.log(factor);
  if (distance<=0 && next<=0) return factor;
  return span/(boundary*Math.exp(next>0?next*3:next));
}

// The SVG is retained during navigation. Reuse the sequence viewers' input
// controllers, coordinate math, small-feature anchors and motion policy.
export function installOrfExplorerNavigation(svg, {
  surface, getRecord, getView, setView, getLayout, onNavigate, onTap, onIdle = () => {}
}) {
  const controller = new AbortController();
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: controller.signal });
  const velocity = createInertiaVelocityTracker();
  let drag = null, pinching = false, touching = false, suppressClick = false, stopInertia = null;
  let anchorRecord, featureZoom;
  function anchors() {
    const record = getRecord();
    if (anchorRecord !== record) {
      anchorRecord = record;
      featureZoom = createFeatureZoomController({ length: record.length, tracks: [{ id: 'orfs', type: 'interval' }] });
    }
    return featureZoom;
  }
  const span = view => view.viewEnd - view.viewStart;
  const clamp = view => computeLinearZoomState(view, getRecord().length, .5, 1);
  function stopMotion() { stopInertia?.(); stopInertia = null; }
  function navigating() {
    onNavigate();
    const active = Boolean(drag || pinching || touching || stopInertia);
    surface.classList.toggle('is-navigating', active);
    if (!active) onIdle();
  }
  function point(clientX, clientY) {
    const rect = svg.getBoundingClientRect(), layout = getLayout();
    const scale = layout.width / rect.width;
    const x = (clientX - rect.left) * scale, y = (clientY - rect.top) * scale;
    return { x, y, fraction: Math.max(0, Math.min(1, (x - layout.plotLeft) / (layout.plotRight - layout.plotLeft))),
      pixels: (layout.plotRight - layout.plotLeft) / scale };
  }
  function apply(next) { setView(clamp(next)); }
  function zoom(factor) {
    reset();
    apply(computeLinearZoomState(getView(), getRecord().length, .5, orfExplorerZoomFactor(factor,getView(),getLayout())));
  }
  function pan(fraction) {
    reset();
    const current = getView(), offset = span(current) * fraction;
    apply({ viewStart: current.viewStart + offset, viewEnd: current.viewEnd + offset });
  }
  function startPan(event) {
    if (event.button !== 0) return;
    stopMotion(); anchors().release();
    if (event.type === 'mousedown') {
      // Cancel selection on the real mouse event, preserving pointer events and
      // any unrelated native selection outside this figure.
      event.preventDefault();
      (event.target.closest?.('[data-orf-id]') ?? svg).focus({ preventScroll: true });
    }
    suppressClick = false;
    drag = { x: event.clientX, y: event.clientY, view: getView(), pixels: point(event.clientX, event.clientY).pixels, distance: 0 };
    velocity.reset(); velocity.add(drag.view.viewStart, performance.now());
    navigating();
  }
  function movePan(event) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    drag.distance = Math.max(drag.distance, Math.hypot(dx, event.clientY - drag.y));
    if (drag.distance <= 4) return;
    suppressClick = true;
    surface.classList.add('is-dragging');
    const offset = -dx / drag.pixels * span(drag.view);
    apply({ viewStart: drag.view.viewStart + offset, viewEnd: drag.view.viewEnd + offset });
    velocity.add(getView().viewStart, performance.now());
  }
  function endPan({ cancelled = false } = {}) {
    if (!drag) return;
    const distance = drag.distance, speed = velocity.velocity(performance.now());
    drag = null; surface.classList.remove('is-dragging');
    if (!cancelled && allowsViewerInertia() && shouldStartViewerInertia({ dragDistancePx: distance, velocity: speed })) {
      stopInertia = startViewerInertia({ initialVelocity: speed,
        step: offset => {
          const current = getView();
          apply({ viewStart: current.viewStart + offset, viewEnd: current.viewEnd + offset });
          return Math.abs(current.viewStart - getView().viewStart) > 1e-9;
        }, onStop: () => { stopInertia = null; navigating(); }
      });
    }
    navigating();
  }
  listen(svg, 'mousedown', startPan);
  listen(window, 'mousemove', movePan);
  listen(window, 'mouseup', () => endPan());
  listen(svg, 'click', event => {
    if (event.detail && suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
  }, { capture: true });
  listen(svg, 'pointermove', event => {
    if (event.pointerType !== 'touch' && !drag && !pinching) {
      const p = point(event.clientX, event.clientY); anchors().move(p.x, p.y);
    }
  });
  listen(svg, 'wheel', event => {
    // Dense maps retain native vertical scrolling; Ctrl/Command-wheel always
    // zooms. Showcase's explicit Scroll zoom mode sets defaultPrevented first.
    if (!event.ctrlKey && !event.metaKey && !event.defaultPrevented && surface.scrollHeight > surface.clientHeight + 1) return;
    const factor = orfExplorerZoomFactor(viewerWheelZoomFactor(event),getView(),getLayout());
    if (factor === 1) return;
    event.preventDefault(); stopMotion(); onNavigate();
    const p = point(event.clientX, event.clientY), current = getView(), layout = getLayout();
    const focus = anchors().wheel({ ...p, ...current, ...layout, now: performance.now(), atZoomLimit: span(current) <= Math.min(getRecord().length, 10) + 1e-9 });
    apply(computeLinearZoomState(current, getRecord().length, p.fraction, factor, focus, { panAtLimit: anchors().panAtLimit() }));
  }, { passive: false });
  listen(svg, 'touchstart', () => { touching = true; navigating(); }, { passive: true, capture: true });
  function touchEnded(event) {
    if (touching && !viewerSurfaceTouches(event, svg).length) { touching = false; navigating(); }
  }
  listen(document, 'touchend', touchEnded, { passive: true });
  listen(document, 'touchcancel', touchEnded, { passive: true });
  const installTouch = () => installCanvasPinchZoom(svg, {
    onContact: () => { stopMotion(); onNavigate(); },
    onPanStart: startPan, onPanMove: movePan, onPanEnd: endPan,
    onTap: event => { stopMotion(); onTap(event); },
    onStart: () => { stopMotion(); endPan({ cancelled: true }); anchors().endGesture(); pinching = true; suppressClick = true; navigating(); },
    onChange: ({ previous, current, factor }) => {
      const p = point(previous.x, previous.y), nextPoint = point(current.x, current.y);
      const next = computeLinearZoomState(getView(), getRecord().length, p.fraction, orfExplorerZoomFactor(factor,getView(),getLayout()));
      const offset = (current.x - previous.x) / nextPoint.pixels * span(next);
      apply({ viewStart: next.viewStart - offset, viewEnd: next.viewEnd - offset });
    },
    onEnd: () => { pinching = false; navigating(); }
  });
  const cleanupTouch = installTouch();
  function reset() {
    stopMotion(); endPan({ cancelled: true }); anchors().release(); onNavigate();
  }
  listen(window, 'blur', () => {
    reset(); touching = false; pinching = false; suppressClick = false; navigating();
  });
  return {
    zoom, pan, reset,
    isInteracting: () => Boolean(drag || pinching || touching || stopInertia),
    cleanup() { reset(); controller.abort(); cleanupTouch(); surface.classList.remove('is-navigating', 'is-dragging'); }
  };
}
