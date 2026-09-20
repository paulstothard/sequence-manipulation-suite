// Draw each amino acid as a small directional chevron. Keep its tip and notch
// inside the codon bounds so residue positions and hit regions stay exact.
export function translationArrowPoints(left, top, width, height, strand) {
  const right = left + Math.max(1, width);
  const bottom = top + height;
  const middle = top + height / 2;
  const tip = Math.min(8, height * 0.38, Math.max(0, width - 12) * 0.4);
  if (tip < 1) {
    return [[left, top], [right, top], [right, bottom], [left, bottom]];
  }
  return strand === "-"
    ? [[left + tip, top], [right, top], [right - tip, middle], [right, bottom], [left + tip, bottom], [left, middle]]
    : [[left, top], [right - tip, top], [right, middle], [right - tip, bottom], [left, bottom], [left + tip, middle]];
}

export function traceTranslationArrow(ctx, left, top, width, height, strand) {
  const points = translationArrowPoints(left, top, width, height, strand);
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
}

export function translationArrowSvgPath(left, top, width, height, strand) {
  const points = translationArrowPoints(left, top, width, height, strand);
  return `${points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")} Z`;
}
