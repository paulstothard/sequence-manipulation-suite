// Keep directional tips proportional to a feature's thickness, and omit them
// when a short visible span would become mostly arrowhead.
export function featureArrowHeadLength(spanPx, thicknessPx, strand, terminalVisible = true) {
  if (!terminalVisible || (strand !== "+" && strand !== "-")) return 0;
  const span = Number(spanPx);
  const thickness = Number(thicknessPx);
  if (!Number.isFinite(span) || !Number.isFinite(thickness) || thickness <= 0) return 0;
  const head = Math.min(9, Math.max(4, thickness * 0.55));
  return span >= head * 2.5 ? head : 0;
}

export function featureArrowTerminalVisible(interval, strand) {
  if (strand !== "+" && strand !== "-") return false;
  const isForward = strand === "+";
  const partCount = Number(interval?.partCount);
  const partIndex = Number(interval?.partIndex);
  if (partCount > 1 && Number.isInteger(partIndex) && partIndex !== (isForward ? partCount - 1 : 0)) return false;
  const visibleEdge = Number(isForward ? interval?.end : interval?.start);
  const fullEdge = Number(isForward
    ? interval?.fullEnd ?? interval?.sourceEnd ?? interval?.end
    : interval?.fullStart ?? interval?.sourceStart ?? interval?.start);
  if (!Number.isFinite(visibleEdge) || !Number.isFinite(fullEdge) || Math.abs(visibleEdge - fullEdge) > 0.001) return false;
  const partEdge = isForward ? interval?.partEnd : interval?.partStart;
  if (partEdge === undefined) return true;
  const sourceEdge = isForward ? interval?.sourceEnd : interval?.sourceStart;
  return Number(sourceEdge) === Number(partEdge);
}

export function linearFeaturePolygon(left, top, width, height, strand, headLength) {
  const right = left + width;
  const bottom = top + height;
  const middle = top + height / 2;
  if (!(headLength > 0) || (strand !== "+" && strand !== "-")) {
    return [[left, top], [right, top], [right, bottom], [left, bottom]];
  }
  return strand === "+"
    ? [[left, top], [right - headLength, top], [right, middle], [right - headLength, bottom], [left, bottom]]
    : [[right, top], [left + headLength, top], [left, middle], [left + headLength, bottom], [right, bottom]];
}
