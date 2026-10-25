// Navigation changes only the preview. A second touch cancels an in-progress
// artwork edit before taking ownership of the remaining contacts.
export function createImageEditorNavigation(viewport, { image, width, zoom, redraw, editable, clearSelection, cancelEdit }) {
  const controller = new AbortController(), contacts = new Map();
  const listen = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: controller.signal });
  let navigation = null, safari = null;
  const ignore = e => e.composedPath().some(n => n instanceof Element && n.matches('input,textarea,select,button,[contenteditable="true"],.image-color-sampler'));
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const capture = id => { try { viewport.setPointerCapture(id); } catch { /* A cancelled contact may already be gone. */ } };
  const scale = () => image().getBoundingClientRect().width / width();
  const position = e => ({ x: e.clientX, y: e.clientY });
  const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = (a, b) => Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  function anchor(p) {
    const r = image().getBoundingClientRect(), s = scale();
    return { x: (p.x - r.left) / s, y: (p.y - r.top) / s };
  }
  function zoomAt(value, p, fixed = anchor(p)) {
    const next = Math.max(.1, Math.min(4, value));
    const key = String(Math.round(next * 10000) / 10000);
    if (![...zoom.options].some(option => option.value === key)) {
      let option = zoom.querySelector('[data-gesture-zoom]');
      if (!option) { option = document.createElement('option'); option.dataset.gestureZoom = ''; zoom.append(option); }
      option.value = key; option.textContent = `${Math.round(next * 100)}%`;
    }
    zoom.value = key;
    redraw();
    const r = image().getBoundingClientRect(), actual = scale();
    viewport.scrollLeft += r.left + fixed.x * actual - p.x;
    viewport.scrollTop += r.top + fixed.y * actual - p.y;
  }
  function beginNavigation() {
    const points = [...contacts.values()];
    if (points.length >= 2) {
      const center = middle(points[0], points[1]);
      navigation = { type: 'pinch', scale: scale(), distance: distance(points[0], points[1]), anchor: anchor(center) };
    } else if (points.length === 1) {
      navigation = { type: 'pan', point: points[0], left: viewport.scrollLeft, top: viewport.scrollTop };
    } else navigation = null;
    for (const id of contacts.keys()) capture(id);
  }
  function cancel() {
    const ids = [...contacts.keys()];
    contacts.clear(); navigation = safari = null;
    cancelEdit();
    for (const id of ids) if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  }
  listen(viewport, 'pointerdown', e => {
    if (e.button !== 0 || ignore(e) || !image()) return;
    contacts.set(e.pointerId, position(e));
    if (contacts.size > 1 || navigation) {
      cancelEdit(); beginNavigation(); stop(e);
    } else if (!editable(e)) {
      clearSelection();
      beginNavigation(); viewport.focus({ preventScroll: true }); stop(e);
    }
  }, { capture: true });
  listen(viewport, 'pointermove', e => {
    if (!contacts.has(e.pointerId)) return;
    contacts.set(e.pointerId, position(e));
    if (!navigation) return;
    stop(e);
    const points = [...contacts.values()];
    if (navigation.type === 'pinch' && points.length >= 2) {
      zoomAt(navigation.scale * distance(points[0], points[1]) / navigation.distance, middle(points[0], points[1]), navigation.anchor);
    } else {
      viewport.scrollLeft = navigation.left - (points[0].x - navigation.point.x);
      viewport.scrollTop = navigation.top - (points[0].y - navigation.point.y);
    }
  }, { capture: true });
  listen(viewport, 'pointerup', e => {
    if (!contacts.has(e.pointerId)) return;
    contacts.delete(e.pointerId);
    if (navigation) { stop(e); beginNavigation(); }
  }, { capture: true });
  for (const type of ['pointercancel', 'lostpointercapture']) listen(viewport, type, e => {
    if (!contacts.has(e.pointerId)) return;
    cancel(); stop(e);
  }, { capture: true });
  listen(window, 'blur', cancel);
  listen(viewport, 'mousedown', e => { if (e.button === 0 && !ignore(e)) e.preventDefault(); });
  listen(viewport, 'wheel', e => {
    if (!(e.ctrlKey || e.metaKey) || ignore(e) || !image()) return;
    e.preventDefault();
    cancel();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1;
    zoomAt(scale() * Math.exp(-e.deltaY * unit * .002), position(e));
  }, { passive: false });
  listen(viewport, 'gesturestart', e => {
    if (ignore(e) || !image()) return;
    e.preventDefault();
    if (contacts.size >= 2) return;
    cancelEdit();
    const r = viewport.getBoundingClientRect();
    const p = { x: e.clientX || r.left + r.width / 2, y: e.clientY || r.top + r.height / 2 };
    safari = { scale: scale(), point: p, anchor: anchor(p) };
  }, { passive: false });
  listen(viewport, 'gesturechange', e => {
    if (!safari) return;
    e.preventDefault(); zoomAt(safari.scale * e.scale, safari.point, safari.anchor);
  }, { passive: false });
  listen(viewport, 'gestureend', e => { if (safari) e.preventDefault(); safari = null; }, { passive: false });
  listen(zoom, 'change', cancel);
  return { dispose() { cancel(); controller.abort(); } };
}

export const imageEditorHandleSize = () => matchMedia('(any-pointer: coarse)').matches ? 44 : 24;
