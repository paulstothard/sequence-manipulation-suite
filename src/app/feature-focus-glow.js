import { linearFeaturePolygon } from '../core/directional-feature-geometry.js';

export function traceLinearFeatureShape(ctx, left, top, width, height, strand, headLength = 0) {
  const points = linearFeaturePolygon(left, top, width, height, strand, headLength);
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
}

export function traceCircularFeatureShape(ctx, cx, cy, outerRadius, innerRadius, startAngle, endAngle, strand, headLength = 0) {
  const middleRadius = (outerRadius + innerRadius) / 2;
  const headAngle = headLength / Math.max(1, middleRadius);
  const point = (radius, angle) => [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  if (headLength > 0 && strand === '+') {
    const shoulder = endAngle - headAngle;
    ctx.moveTo(...point(outerRadius, startAngle));
    ctx.arc(cx, cy, outerRadius, startAngle, shoulder);
    ctx.lineTo(...point(middleRadius, endAngle));
    ctx.lineTo(...point(innerRadius, shoulder));
    ctx.arc(cx, cy, innerRadius, shoulder, startAngle, true);
  } else if (headLength > 0 && strand === '-') {
    const shoulder = startAngle + headAngle;
    ctx.moveTo(...point(outerRadius, shoulder));
    ctx.arc(cx, cy, outerRadius, shoulder, endAngle);
    ctx.lineTo(...point(innerRadius, endAngle));
    ctx.arc(cx, cy, innerRadius, endAngle, shoulder, true);
    ctx.lineTo(...point(middleRadius, startAngle));
  } else {
    ctx.moveTo(...point(outerRadius, startAngle));
    ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
    ctx.lineTo(...point(innerRadius, endAngle));
    ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
  }
  ctx.closePath();
}

export function drawFeatureFocusGlow(ctx, traceShape, theme) {
  ctx.save();
  // Keep the glow outside the actual glyph, preserving its category colour,
  // label and CDS amino-acid letters. The same path defines the halo and mask.
  const extent = Math.max(ctx.canvas.width, ctx.canvas.height) + 32;
  ctx.beginPath();
  ctx.rect(-extent, -extent, extent * 3, extent * 3);
  traceShape(ctx);
  ctx.clip('evenodd');
  ctx.beginPath();
  traceShape(ctx);
  ctx.setLineDash([]);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = theme.selectedStroke;
  ctx.lineWidth = 2;
  ctx.shadowColor = theme.selectedStroke;
  ctx.shadowBlur = theme.dark ? 8 : 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.stroke();
  ctx.restore();
}
