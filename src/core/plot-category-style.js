import { SMS3_PLOT_THEME } from "./publication-plot-style.js";
import { escapeXml } from "./plot-renderer.js";

const DASHES = ["", "7 3", "2 3", "7 3 2 3", "11 4", "11 3 2 3 2 3"];
const SYMBOLS = ["circle", "square", "triangle", "diamond", "plus", "cross"];

// Keep familiar colors for small group sets. A second visual channel separates
// groups when the short categorical palette cycles, including in grayscale.
export function plotCategoryStyle(index) {
  const slot = Math.max(0, index);
  const cycle = Math.floor(slot / SMS3_PLOT_THEME.categorical.length);
  return {
    color: SMS3_PLOT_THEME.categorical[slot % SMS3_PLOT_THEME.categorical.length],
    symbol: SYMBOLS[cycle % SYMBOLS.length],
    dash: DASHES[cycle % DASHES.length],
    fill: cycle ? `url(#sms3-category-pattern-${slot})` : SMS3_PLOT_THEME.categorical[slot]
  };
}

export function plotCategoryMarker(index, { x, y, radius = 4.5, attributes = "", title = "" }) {
  const { color, symbol } = plotCategoryStyle(index);
  const r = radius;
  const data = `${attributes} data-category-index="${index}" data-category-symbol="${symbol}" data-sms3-point-x="${x}" data-sms3-point-y="${y}"`;
  const content = title ? `<title>${escapeXml(title)}</title>` : "";
  if (symbol === "circle") return `<circle ${data} cx="${x}" cy="${y}" r="${r}" fill="${color}">${content}</circle>`;
  const paths = {
    square: `M${x - r * 0.9},${y - r * 0.9}h${r * 1.8}v${r * 1.8}h${-r * 1.8}Z`,
    triangle: `M${x},${y - r * 1.4}L${x + r * 1.25},${y + r}H${x - r * 1.25}Z`,
    diamond: `M${x},${y - r * 1.25}L${x + r * 1.25},${y}L${x},${y + r * 1.25}L${x - r * 1.25},${y}Z`,
    plus: `M${x - r},${y}H${x + r}M${x},${y - r}V${y + r}`,
    cross: `M${x - r},${y - r}L${x + r},${y + r}M${x - r},${y + r}L${x + r},${y - r}`
  };
  const open = symbol === "plus" || symbol === "cross";
  return `<path ${data} d="${paths[symbol]}" fill="${open ? "none" : color}"${open ? ` stroke="${color}" stroke-width="${r * 0.55}"` : ""}>${content}</path>`;
}

export function plotCategoryPatternDefs(count) {
  const parts = [];
  for (let index = SMS3_PLOT_THEME.categorical.length; index < count; index++) {
    const { color } = plotCategoryStyle(index);
    const cycle = Math.floor(index / SMS3_PLOT_THEME.categorical.length);
    const angle = [45, 135, 0, 90][(cycle - 1) % 4];
    parts.push(`<pattern id="sms3-category-pattern-${index}" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(${angle})"><rect width="8" height="8" fill="${color}"/><path d="M0,0V8" stroke="#ffffff" stroke-opacity=".85" stroke-width="2"/></pattern>`);
  }
  return parts.length ? `<defs>${parts.join("")}</defs>` : "";
}
