import { connectorGeometry } from '../core/annotation-geometry.js';
import { imageEditorHandleSize } from './image-editor-navigation.js';

const NS = 'http://www.w3.org/2000/svg';
export function annotationControl(tag, attrs, style = '') {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.style.cssText = style;
  return node;
}
const glowStyle = 'fill:none!important;stroke:#2196f3!important;stroke-width:4!important;opacity:.65!important;filter:blur(2px)!important;vector-effect:non-scaling-stroke!important;pointer-events:none!important';

// Ignore the selected subtree and its ancestors: neither is an independent
// alignment reference. Definition-only and hidden SVG content cannot be targets.
export function alignmentTargets(elements, selected, measure) {
  const targets = [];
  for (const element of elements) {
    if (element === selected || element.contains(selected) || selected?.contains(element) || element.closest('defs,clipPath,mask,marker,pattern,symbol,[data-editor-overlay]')) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility !== 'visible' || +style.opacity === 0) continue;
    const box = measure(element);
    if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || (!box.w && !box.h)) continue;
    targets.push({ ...box, id: element.getAttribute('data-object') ?? element.getAttribute('data-annotation') });
  }
  return targets;
}

export function appendConnectorControls(parent, annotation, scale, hitAttributes = {}) {
  const geometry = connectorGeometry(annotation);
  parent.append(annotationControl('path', { d: geometry.path }, glowStyle));
  for (const key of ['start', 'middle', 'end']) {
    const point = geometry[key], r = 5 / Math.max(scale, .01);
    const group = annotationControl('g', { ...hitAttributes, 'data-connector-handle': key }, 'cursor:crosshair!important');
    const title = annotationControl('title', {});
    title.textContent = key === 'middle' ? 'Drag to bend; return to the center to straighten' : `Drag ${key} to aim`;
    group.append(title,
      annotationControl('circle', { cx: point.x, cy: point.y, r: imageEditorHandleSize() / (2 * Math.max(scale, .01)) }, 'fill:transparent!important;stroke:none!important;pointer-events:all!important'),
      annotationControl('rect', { x: point.x - r, y: point.y - r, width: 2 * r, height: 2 * r, rx: r * .45 }, 'fill:white!important;stroke:#007bce!important;stroke-width:1.5!important;vector-effect:non-scaling-stroke!important;pointer-events:none!important'));
    parent.append(group);
  }
}

export function appendSnapGuide(parent, guide, scale) {
  if (!guide) return;
  const unit = 1 / Math.max(scale, .01), { origin: a, point: b } = guide;
  const group = annotationControl('g', { 'data-snap-guide': guide.kind, 'aria-hidden': 'true' }, 'pointer-events:none!important');
  const style = 'fill:none!important;stroke:#007bce!important;stroke-width:1!important;vector-effect:non-scaling-stroke!important';
  // A nonzero dash keeps the blue ink visible in WebKit at one-pixel width.
  const dotted = `${style};stroke-dasharray:1 4!important;stroke-linecap:round!important`;
  const guideLine = attrs => group.append(
    // A fine white halo keeps the dotted guide visible over dark artwork.
    annotationControl('line', attrs, `${dotted};stroke:white!important;stroke-width:3!important;opacity:.7!important`),
    annotationControl('line', attrs, dotted),
  );
  if (guide.kind === 'alignment') {
    for (const { axis, value, target } of guide.matches) {
      const vertical = axis === 'x', cross = vertical ? 'y' : 'x', size = vertical ? 'h' : 'w';
      const from = Math.min(guide.box[cross], target[cross]) - 5 * unit;
      const to = Math.max(guide.box[cross] + guide.box[size], target[cross] + target[size]) + 5 * unit;
      const attrs = vertical ? { x1:value, x2:value, y1:from, y2:to } : { x1:from, x2:to, y1:value, y2:value };
      guideLine(attrs);
      const center = target[cross] + target[size] / 2;
      group.append(annotationControl('path', { d: vertical ? `M${value - 3 * unit},${center}h${6 * unit}` : `M${center},${value - 3 * unit}v${6 * unit}` }, `${style};stroke-dasharray:none!important`));
    }
    parent.append(group); return;
  }
  if (guide.kind === 'square') {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), side = Math.abs(b.x - a.x);
    const inset = Math.min(4 * unit, side / 4);
    group.setAttribute('data-guide-shape', guide.shape);
    if (guide.shape === 'circle') {
      guideLine({ x1:x + inset, y1:y + side / 2, x2:x + side - inset, y2:y + side / 2 });
      guideLine({ x1:x + side / 2, y1:y + inset, x2:x + side / 2, y2:y + side - inset });
    } else {
      // Stay inside even a square with fully rounded corners.
      const margin = Math.max(inset, side * .15);
      guideLine({ x1:x + margin, y1:y + margin, x2:x + side - margin, y2:y + side - margin });
    }
    parent.append(group); return;
  }
  if (guide.kind === 'proportional') {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    const tick = 3 * unit, gap = 2.5 * unit;
    // Matching double ticks mark equal scaling of the two axes when resizing
    // a freehand drawing proportionally.
    // Keep them legible over the artwork and the selection glow at any zoom.
    const d = [-gap, gap].map(offset => `M${x + w / 2 + offset},${y - tick}v${2 * tick} M${x + w - tick},${y + h / 2 + offset}h${2 * tick}`).join(' ');
    group.append(
      annotationControl('path', { d }, `${style};stroke:white!important;stroke-width:3.5!important;opacity:.85!important`),
      annotationControl('path', { d }, `${style};stroke-width:1.5!important`),
    );
    parent.append(group); return;
  } else group.append(annotationControl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y }, style));
  const x = Math.min(a.x, b.x) + 5 * unit, y = Math.max(a.y, b.y) - 10 * unit;
  const label = annotationControl('text', { x, y }, `font:600 ${11 * unit}px Arial,sans-serif!important;fill:#0066aa!important;stroke:white!important;stroke-width:${3 * unit}!important;paint-order:stroke!important`);
  label.textContent = guide.label;
  group.append(label); parent.append(group);
}
