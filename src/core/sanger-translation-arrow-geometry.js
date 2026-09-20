function clipPolygonAtX(points, edge, keepRight) {
  const inside = ([x]) => keepRight ? x >= edge : x <= edge;
  const clipped = [];
  for (let index = 0; index < points.length; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const fromInside = inside(from);
    const toInside = inside(to);
    if (fromInside !== toInside) {
      const fraction = (edge - from[0]) / (to[0] - from[0]);
      clipped.push([edge, from[1] + fraction * (to[1] - from[1])]);
    }
    if (toInside) clipped.push(to);
  }
  return clipped;
}

// Sanger translation tiles leave a narrow paper-colored seam along the arrow
// slope. A complete codon at the row's directional end keeps its tip inside
// the row; a continuing codon is clipped from its full-size shape, never
// squeezed into a tiny arrow.
export function sangerTranslationArrowPoints(left, right, top, height, strand, clipLeft, clipRight, terminal = false, exposedTail = false) {
  const bottom = top + height;
  const middle = top + height / 2;
  const span = right - left;
  const head = Math.min(6, height * 0.38, Math.max(0, span - 12) * 0.4);
  let points;
  if (head < 1) {
    points = [[left, top], [right, top], [right, bottom], [left, bottom]];
  } else if (strand === "-") {
    const tip = terminal ? left : left - head;
    const shoulder = terminal ? left + head : left;
    points = [[shoulder, top], [right, top],
      ...(exposedTail ? [] : [[right - head, middle]]),
      [right, bottom], [shoulder, bottom], [tip, middle]];
  } else {
    const tip = terminal ? right : right + head;
    const shoulder = terminal ? right - head : right;
    points = [[left, top], [shoulder, top], [tip, middle],
      [shoulder, bottom], [left, bottom],
      ...(exposedTail ? [] : [[left + head, middle]])];
  }
  const center = (left + right) / 2;
  const seamInset = Math.min(2, span / 4);
  const separated = points.map(([x, y]) => [
    x < center ? x + seamInset : x > center ? x - seamInset : x,
    y
  ]);
  return clipPolygonAtX(clipPolygonAtX(separated, clipLeft, true), clipRight, false);
}

export function sangerTranslationArrowSvgPath(...args) {
  const points = sangerTranslationArrowPoints(...args);
  if (points.length < 3) return "";
  return `${points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")} Z`;
}
