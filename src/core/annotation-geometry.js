// Geometry shared by the image editors and Text to Image and Table to Image. Coordinates
// here are image units, so non-square images and preview zoom do not distort snaps.
export const isConnector = type => ['line', 'arrow', 'pointer'].includes(type);

export function connectorGeometry(a) {
  const start = { x: a.x + (a.flipX ? a.w : 0), y: a.y + (a.flipY ? a.h : 0) };
  const end = { x: a.x + (a.flipX ? 0 : a.w), y: a.y + (a.flipY ? 0 : a.h) };
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const middle = { x: center.x + (a.bendX ?? 0), y: center.y + (a.bendY ?? 0) };
  const control = { x: center.x + 2 * (a.bendX ?? 0), y: center.y + 2 * (a.bendY ?? 0) };
  const bent = !!(a.bendX || a.bendY);
  const path = `M${start.x},${start.y} ${bent ? `Q${control.x},${control.y} ` : 'L'}${end.x},${end.y}`;
  const tangent = Math.hypot(end.x - control.x, end.y - control.y) > 0.001 ? control : start;
  return { start, end, middle, center, control, path, angle: Math.atan2(end.y - tangent.y, end.x - tangent.x) };
}

export const strokeDash = (pattern, width) => pattern === 'dashed' ? `${width * 4} ${width * 3}` : pattern === 'dotted' ? `0 ${width * 2.5}` : 'none';
export const annotationFillStyle = a => a.fillStyle ?? (a.filled ? 'solid' : 'none');

export function validateAnnotationAppearance(a) {
  if (a.fillOpacity !== undefined && (typeof a.fillOpacity !== 'number' || !Number.isFinite(a.fillOpacity) || a.fillOpacity < 0 || a.fillOpacity > 1)) throw new Error('Invalid fill opacity.');
  for (const [key, choices] of Object.entries({ strokePattern: ['solid', 'dashed', 'dotted'], headStyle: ['open', 'filled', 'outline'], endPlacement: ['end', 'both'], fillStyle: ['none', 'soft', 'hatched', 'solid'] })) {
    if (a[key] !== undefined && !choices.includes(a[key])) throw new Error(`Invalid annotation ${key}.`);
  }
  if (a.headScale !== undefined && (typeof a.headScale !== 'number' || !Number.isFinite(a.headScale) || a.headScale < .5 || a.headScale > 3)) throw new Error('Arrowhead size must be between 0.5 and 3.');
}

export function annotationShapeSvg(a) {
  const x = Math.min(a.x, a.x + a.w), y = Math.min(a.y, a.y + a.h), w = Math.abs(a.w), h = Math.abs(a.h);
  const type = a.type, mode = annotationFillStyle(a), color = a.fill ?? a.color, width = a.strokeWidth ?? 2;
  const shape = type === 'ellipse' ? 'ellipse' : 'rect';
  const geometry = shape === 'ellipse' ? `cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"` : `x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(a.cornerRadius ?? 0, w / 2, h / 2)}"`;
  const patternId = `sms3-hatch-${a.id}`;
  const defs = mode === 'hatched' ? `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="8" height="8"><path d="M-2,2 L2,-2 M0,8 L8,0 M6,10 L10,6" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="none" opacity="${a.fillOpacity ?? .55}"/></pattern></defs>` : '';
  const fill = mode === 'none' ? 'none' : mode === 'hatched' ? `url(#${patternId})` : color;
  return `${defs}<${shape} ${geometry} fill="${fill}" fill-opacity="${mode === 'soft' ? .25 : 1}" stroke="${a.color}" stroke-width="${width}" stroke-dasharray="${strokeDash(a.strokePattern, width)}" stroke-linecap="round" stroke-linejoin="round" opacity="${a.opacity ?? 1}"/>`;
}

export function connectorSvg(a) {
  const { start, end, control, path, angle } = connectorGeometry(a);
  const width = a.strokeWidth ?? 2, opacity = a.opacity ?? 1;
  const style = `stroke="${a.color}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"`;
  const both = a.endPlacement === 'both', headStyle = a.headStyle ?? 'open';
  const length = Math.min(Math.hypot(end.x - start.x, end.y - start.y) / 3, Math.max(10, width * 4) * (a.headScale ?? 1));
  const startAngle = Math.atan2(start.y - control.y, start.x - control.x);
  const headEnds = [{ point: end, angle, end: true }, ...(both ? [{ point: start, angle: startAngle, end: false }] : [])];
  let shaft = path;
  // Cut a triangular head's shaft at its base plane, keeping outlined heads hollow.
  if (a.type === 'arrow' && headStyle !== 'open' && length > 0) {
    const at = t => ({ x: (1-t)**2*start.x + 2*(1-t)*t*control.x + t*t*end.x, y: (1-t)**2*start.y + 2*(1-t)*t*control.y + t*t*end.y });
    const cut = ({ point, angle, end: isEnd }) => {
      const ux = Math.cos(angle), uy = Math.sin(angle);
      const c = (start.x-point.x)*ux + (start.y-point.y)*uy + length;
      const b = 2*((control.x-start.x)*ux + (control.y-start.y)*uy);
      const q = (start.x-2*control.x+end.x)*ux + (start.y-2*control.y+end.y)*uy;
      const roots = Math.abs(q) < 1e-9 ? (Math.abs(b) < 1e-9 ? [] : [-c/b]) : b*b-4*q*c < 0 ? [] : [(-b-Math.sqrt(b*b-4*q*c))/(2*q), (-b+Math.sqrt(b*b-4*q*c))/(2*q)];
      const valid = roots.filter(t => t >= 0 && t <= 1);
      return valid.length ? (isEnd ? Math.max(...valid) : Math.min(...valid)) : isEnd ? 1 : 0;
    };
    const t1 = cut(headEnds[0]), t0 = both ? cut(headEnds[1]) : 0;
    if (t0 < t1) {
      const first = at(t0), last = at(t1);
      const middle = { x: first.x + (t1-t0)*((1-t0)*(control.x-start.x)+t0*(end.x-control.x)), y: first.y + (t1-t0)*((1-t0)*(control.y-start.y)+t0*(end.y-control.y)) };
      shaft = `M${first.x},${first.y} Q${middle.x},${middle.y} ${last.x},${last.y}`;
    }
  }
  let result = `<path d="${shaft}" ${style} stroke-dasharray="${strokeDash(a.strokePattern, width)}"/>`;
  for (const head of headEnds) {
    const { point: p, angle: direction } = head;
    if (a.type === 'arrow') {
      const halfWidth = length * .5;
      const bx = p.x - length * Math.cos(direction), by = p.y - length * Math.sin(direction);
      const left = [bx + halfWidth * Math.sin(direction), by - halfWidth * Math.cos(direction)], right = [bx - halfWidth * Math.sin(direction), by + halfWidth * Math.cos(direction)];
      const d = headStyle === 'open' ? `M${p.x-length*Math.cos(direction-.5)},${p.y-length*Math.sin(direction-.5)} L${p.x},${p.y} L${p.x-length*Math.cos(direction+.5)},${p.y-length*Math.sin(direction+.5)}` : `M${left} L${p.x},${p.y} L${right} Z`;
      result += `<path d="${d}" stroke="${a.color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="none" fill="${headStyle === 'filled' ? a.color : 'none'}" opacity="${opacity}"/>`;
    } else if (a.type === 'pointer') result += `<circle cx="${p.x}" cy="${p.y}" r="${Math.max(2.5, width * 1.5)}" fill="${a.color}" stroke="none" opacity="${opacity}"/>`;
  }
  return result;
}

export function snapEndpoint(origin, point, { scale = 1, force = false, disabled = false, previous } = {}) {
  if (disabled) return { point };
  const dx = point.x - origin.x, dy = point.y - origin.y, length = Math.hypot(dx, dy);
  if (length * scale < 8) return { point };
  const raw = Math.atan2(dy, dx), angle = Math.round(raw / (Math.PI / 4)) * Math.PI / 4;
  const held = previous?.kind === 'angle' && Math.abs(previous.angle - angle) < .001;
  if (!force && (Math.abs(raw - angle) > (held ? 8 : 5) * Math.PI / 180 || Math.abs(Math.sin(raw - angle) * length * scale) > (held ? 12 : 8))) return { point };
  const result = { x: origin.x + length * Math.cos(angle), y: origin.y + length * Math.sin(angle) };
  return { point: result, guide: { kind: 'angle', origin, point: result, angle, label: `${Math.round(angle * 180 / Math.PI + 360) % 360}°` } };
}

// Derive the cue from the final shape, including after resize bounds are applied.
export function equalDimensionGuide(origin, point, type = 'box') {
  if (!['box', 'rect', 'ellipse', 'circle'].includes(type)) return;
  const w = Math.abs(point.x - origin.x), h = Math.abs(point.y - origin.y);
  if (!(w > 0 && h > 0) || !Number.isFinite(w + h) || Math.abs(w - h) > Math.max(1, w, h) * 1e-6) return;
  const shape = type === 'ellipse' || type === 'circle' ? 'circle' : 'square';
  return { kind: 'square', shape, origin, point, label: shape === 'circle' ? 'Circle' : 'Square' };
}

export function snapSquare(origin, point, { scale = 1, force = false, disabled = false, previous, type = 'box' } = {}) {
  if (disabled) return { point };
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  if (!force && (side * scale < 12 || Math.abs(Math.abs(dx) - Math.abs(dy)) * scale > (previous?.kind === 'square' ? 12 : 8))) return { point };
  const result = { x: origin.x + (dx < 0 ? -side : side), y: origin.y + (dy < 0 ? -side : side) };
  return { point: result, guide: equalDimensionGuide(origin, result, type) };
}

// Project the resize corner onto the original diagonal so both dimensions
// receive the same scale, even when the drawing's bounds are not square.
export function snapProportions(box, point, { scale = 1, force = false, disabled = false, previous } = {}) {
  if (disabled || !(box.w > 0 && box.h > 0)) return { point };
  const dx = point.x - box.x, dy = point.y - box.y;
  const factor = Math.max(.05, (dx * box.w + dy * box.h) / (box.w ** 2 + box.h ** 2));
  const result = { x: box.x + box.w * factor, y: box.y + box.h * factor };
  const distance = Math.hypot(result.x - point.x, result.y - point.y) * scale;
  if (!force && (Math.max(box.w, box.h) * factor * scale < 12 || distance > (previous?.kind === 'proportional' ? 12 : 8))) return { point };
  return { point: result, scaleFactor: factor, guide: { kind: 'proportional', origin: { x: box.x, y: box.y }, point: result } };
}

// Targets are measured once at pointerdown. Work in image units, but keep the
// capture/release distance constant on screen at every preview zoom.
const alignmentAnchors = [[0, 0], [0, 1], [.5, .5], [1, 0], [1, 1]];
export function snapTranslation(box, delta, targets, { scale = 1, disabled = false, previous, limits = {} } = {}) {
  const moved = { ...delta }, matches = [];
  if (disabled || !box) return { delta: moved };
  for (const [axis, size] of [['x', 'w'], ['y', 'h']]) {
    const cross = axis === 'x' ? 'y' : 'x', crossSize = axis === 'x' ? 'h' : 'w';
    const crossStart = box[cross] + delta[cross];
    const held = previous?.kind === 'alignment' ? previous.matches.find(m => m.axis === axis) : null;
    let best, retained;
    for (const target of targets) {
      // Nearby objects should win over distant labels when their snap positions
      // are almost identical. Keep this preference small and in screen pixels.
      const gap = Math.max(0, target[cross] - crossStart - box[crossSize], crossStart - target[cross] - target[crossSize]);
      const proximity = Math.min(2, gap * scale / 100);
      for (const [sourceAnchor, targetAnchor] of alignmentAnchors) {
        // Edge-to-edge and center-to-center avoid excessive snap stops.
        const value = target[axis] + target[size] * targetAnchor;
        const offset = value - (box[axis] + box[size] * sourceAnchor);
        if (limits[axis] && (offset < limits[axis][0] || offset > limits[axis][1])) continue;
        const distance = Math.abs(offset - delta[axis]) * scale;
        const same = held?.target.id === target.id && held.sourceAnchor === sourceAnchor && held.targetAnchor === targetAnchor;
        if (distance > (same ? 10 : 6)) continue;
        const candidate = { axis, value, sourceAnchor, targetAnchor, target, offset, distance, score:distance + proximity };
        if (same && distance <= 10) retained = candidate;
        if (distance <= 6 && (!best || candidate.score < best.score)) best = candidate;
      }
    }
    // A wide release margin must not hide a nearby alignment. In particular,
    // similarly sized shapes have left/center/right stops only a few pixels
    // apart. Keep a small hysteresis around their midpoint, then let the closer
    // stop take over. Scale that margin down for very tightly spaced stops.
    const switchMargin = retained && best ? Math.min(2, Math.abs(retained.offset - best.offset) * scale / 4) : 0;
    const match = retained && (!best || retained.score <= best.score + switchMargin) ? retained : best;
    if (match) { moved[axis] = match.offset; matches.push(match); }
  }
  return { delta: moved, guide: matches.length ? { kind: 'alignment', matches, box: { ...box, x: box.x + moved.x, y: box.y + moved.y } } : undefined };
}

export function moveConnectorHandle(original, handle, point, options = {}) {
  const g = connectorGeometry(original), result = { ...original };
  if (handle === 'middle') {
    const close = Math.hypot(point.x - g.center.x, point.y - g.center.y) * (options.scale ?? 1) <= (options.previous?.kind === 'straight' ? 12 : 8);
    const straight = !options.disabled && (options.force || close);
    result.bendX = straight ? 0 : point.x - g.center.x;
    result.bendY = straight ? 0 : point.y - g.center.y;
    return { annotation: result, guide: straight ? { kind: 'straight', origin: g.start, point: g.end, label: 'Straight' } : undefined };
  }
  const fixed = handle === 'start' ? g.end : g.start;
  const snap = snapEndpoint(fixed, point, options);
  const start = handle === 'start' ? snap.point : g.start, end = handle === 'end' ? snap.point : g.end;
  // A signed span allows either endpoint to cross the other without flipping a box.
  result.x = start.x; result.y = start.y; result.w = end.x - start.x; result.h = end.y - start.y;
  delete result.flipX; delete result.flipY;
  return { annotation: result, guide: snap.guide };
}
