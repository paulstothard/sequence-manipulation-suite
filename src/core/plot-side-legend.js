function estimatedTextWidth(value, fontSize = 11) {
  return [...String(value ?? "")].reduce((width, character) => {
    if (/[MW@#%&]/u.test(character)) return width + fontSize * 0.9;
    if (/[ilI.,:;!'| ]/u.test(character)) return width + fontSize * 0.35;
    return width + fontSize * 0.65;
  }, 0);
}

export function sideLegendLayout(width, labels, { left = 86, gap = 22, rightPadding = 20, fontSize = 11 } = {}) {
  const maxWidth = Math.min(210, Math.max(116, Math.floor(width * 0.25)), Math.max(100, width - left - gap - rightPadding - 220));
  const labelWidth = Math.max(0, ...labels.map((label) => estimatedTextWidth(label, fontSize)));
  const legendWidth = Math.min(maxWidth, Math.max(Math.min(150, maxWidth), Math.ceil(labelWidth + 38)));
  const right = rightPadding + legendWidth + gap;
  return {
    right,
    plotRight: width - right,
    legendX: width - rightPadding - legendWidth,
    labelX: width - rightPadding - legendWidth + 32,
    labelWidth: legendWidth - 38,
    rowHeight: 20
  };
}

export function fitSideLegendLabel(value, maxWidth, fontSize = 11) {
  const text = String(value ?? "");
  if (estimatedTextWidth(text, fontSize) <= maxWidth) return text;
  let fitted = "";
  for (const character of text) {
    if (estimatedTextWidth(`${fitted}${character}…`, fontSize) > maxWidth) break;
    fitted += character;
  }
  return `${fitted.trimEnd()}…`;
}
