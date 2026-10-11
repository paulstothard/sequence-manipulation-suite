import { featureChevronSegments } from '../core/feature-chevron-geometry.js';

export function usesFeatureChevrons(track, item) {
  return track.type !== 'digest-fragments' && item.type !== 'source' && !Array.isArray(item.alignedReadBases) && !item.readName;
}

// A connected feature owns one continuous decoration run, including any linked
// CDS on its lane. Use only visible items so hidden CDS blocks cannot tint it.
export function continuousFeatureChevronRows(items) {
  const lanes = new Map();
  for (const item of items) {
    if (!Number.isInteger(item.slot) || item.slot < 0) continue;
    if (!lanes.has(item.slot)) lanes.set(item.slot, { connected: [], coding: [] });
    const lane = lanes.get(item.slot);
    if (item.connectParts) lane.connected.push(item);
    if (item.geneModel?.role === 'CDS') lane.coding.push(item);
  }
  return [...lanes.values()].filter(lane => lane.connected.length === 1).map(lane => {
    const item = lane.connected[0];
    const coding = item.geneModel?.role === 'transcript' ? lane.coding : [];
    return { item, members: [item, ...coding], codingParts: coding.flatMap(cds => cds.parts ?? [{ start: cds.start, end: cds.end }]) };
  });
}

function paint(ctx, segments, point, color, opacity = 1) {
  if (!segments.length) return;
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha *= 0.6 * opacity;
  const colors = new Map();
  for (const segment of segments) {
    const ink = typeof color === 'function' ? color((segment[0][0] + segment[1][0]) / 2) : color;
    if (!colors.has(ink)) colors.set(ink, []);
    colors.get(ink).push(segment);
  }
  for (const [ink, marks] of colors) {
    ctx.strokeStyle = ink;
    ctx.beginPath();
    for (const segment of marks) {
      ctx.moveTo(...point(...segment[0]));
      ctx.lineTo(...point(...segment[1]));
      ctx.lineTo(...point(...segment[2]));
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawLinearFeatureChevrons(ctx, left, right, y, height, strand, color, labelWidth = 0, labelGaps = []) {
  const center = (left + right) / 2;
  const exclusions = labelWidth > 0 ? [{ start: center - labelWidth / 2, end: center + labelWidth / 2 }, ...labelGaps] : labelGaps;
  paint(ctx, featureChevronSegments(left, right, height, strand, exclusions), (x, dy) => [x, y + dy], color);
}
