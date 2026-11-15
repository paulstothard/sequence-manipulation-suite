import { SMS3_PLOT_THEME } from "./publication-plot-style.js";

export const DEFAULT_PLOT_COLOR_SCALE = "cividis";

export function normalizePlotColorScale(value) {
  return ["cividis", "viridis", "blue", "blue-orange"].includes(value) ? value : DEFAULT_PLOT_COLOR_SCALE;
}

export function plotColorStops(scheme) {
  const key = normalizePlotColorScale(scheme);
  return SMS3_PLOT_THEME.heatmapScales[key === "blue-orange" ? "blueOrange" : key];
}

export function plotColorDomain(domain, scheme) {
  const values = domain.filter(Number.isFinite);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  if (scheme === "blue-orange") {
    const limit = Math.max(Math.abs(low), Math.abs(high)) || 1;
    return [-limit, limit];
  }
  return [low, high];
}

export function interpolateColorStops(stops, fraction) {
  const scaled = Math.max(0, Math.min(1, fraction)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const t = scaled - index;
  return "#" + [1, 3, 5].map(offset => {
    const a = parseInt(stops[index].slice(offset, offset + 2), 16);
    const b = parseInt(stops[index + 1].slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  }).join("");
}

// One mapping for marks, legends, browser previews, workers and exports.
export function plotValueColor(value, domain, scheme = DEFAULT_PLOT_COLOR_SCALE) {
  if (!Number.isFinite(value)) return SMS3_PLOT_THEME.missing;
  const [low, high] = plotColorDomain(domain, scheme);
  const t = high === low ? 0.5 : (value - low) / (high - low);
  return interpolateColorStops(plotColorStops(scheme), t);
}

export function colorLuminance(hex) {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

export function plotCellTextColor(fill) {
  const luminance = colorLuminance(fill);
  const darkContrast = (luminance + 0.05) / 0.05;
  const lightContrast = 1.05 / (luminance + 0.05);
  return lightContrast > darkContrast ? "#ffffff" : "#000000";
}
