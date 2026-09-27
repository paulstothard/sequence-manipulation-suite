// Use Canvas glyph bounds so selection follows the letter, not its hit area.
export function calculateBaseSelectionMarker(x, baselineY, metrics, baseSpacing = Infinity) {
  const glyphWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
  const paddingX = Math.max(0, Math.min(2.5, (baseSpacing - glyphWidth - 1) / 2));
  const paddingY = 2.5;
  return {
    left: x - metrics.actualBoundingBoxLeft - paddingX,
    top: baselineY - metrics.actualBoundingBoxAscent - paddingY,
    width: glyphWidth + paddingX * 2,
    height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + paddingY * 2,
    radius: 2
  };
}
