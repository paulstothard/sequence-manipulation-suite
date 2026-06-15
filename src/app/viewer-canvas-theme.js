const LIGHT_BASE_COLORS = new Map([
  ["A", "#15803d"],
  ["T", "#b91c1c"],
  ["U", "#b91c1c"],
  ["G", "#1d4ed8"],
  ["C", "#a16207"]
]);

const DARK_BASE_COLORS = new Map([
  ["A", "#4ade80"],
  ["T", "#f87171"],
  ["U", "#f87171"],
  ["G", "#60a5fa"],
  ["C", "#fbbf24"]
]);

const LIGHT_RESIDUE_COLORS = new Map([
  ["D", "#b91c1c"], ["E", "#b91c1c"],
  ["K", "#1d4ed8"], ["R", "#1d4ed8"], ["H", "#1d4ed8"],
  ["S", "#15803d"], ["T", "#15803d"], ["N", "#15803d"], ["Q", "#15803d"],
  ["C", "#a16207"], ["M", "#a16207"],
  ["F", "#7c3aed"], ["Y", "#7c3aed"], ["W", "#7c3aed"],
  ["G", "#475569"], ["P", "#475569"], ["A", "#475569"], ["V", "#475569"], ["I", "#475569"], ["L", "#475569"]
]);

const DARK_RESIDUE_COLORS = new Map([
  ["D", "#f87171"], ["E", "#f87171"],
  ["K", "#60a5fa"], ["R", "#60a5fa"], ["H", "#60a5fa"],
  ["S", "#4ade80"], ["T", "#4ade80"], ["N", "#4ade80"], ["Q", "#4ade80"],
  ["C", "#fbbf24"], ["M", "#fbbf24"],
  ["F", "#c084fc"], ["Y", "#c084fc"], ["W", "#c084fc"],
  ["G", "#cbd5e1"], ["P", "#cbd5e1"], ["A", "#cbd5e1"], ["V", "#cbd5e1"], ["I", "#cbd5e1"], ["L", "#cbd5e1"]
]);

const LIGHT_TRACK_COLORS = new Map([
  ["restriction-sites", "#7c3aed"],
  ["digest-fragments", "#0284c7"],
  ["pcr-products", "#dc2626"],
  ["pcr-primer-sites", "#059669"],
  ["features", "#2563eb"],
  ["quantitative", "#0f766e"]
]);

const DARK_TRACK_COLORS = new Map([
  ["restriction-sites", "#a78bfa"],
  ["digest-fragments", "#38bdf8"],
  ["pcr-products", "#f87171"],
  ["pcr-primer-sites", "#34d399"],
  ["features", "#60a5fa"],
  ["quantitative", "#2dd4bf"]
]);

function readCssValue(style, name, fallback) {
  const value = style.getPropertyValue(name).trim();
  return value || fallback;
}

export function getViewerCanvasTheme(element) {
  const style = getComputedStyle(element);
  const colorScheme = style.colorScheme || getComputedStyle(document.documentElement).colorScheme || "";
  const dark = /\bdark\b/.test(colorScheme) || document.documentElement.dataset.theme === "dark";
  const background = readCssValue(style, "--viewer-canvas-bg", dark ? "#111418" : "#ffffff");
  const surface = readCssValue(style, "--viewer-surface", dark ? "#1a2026" : "#ffffff");
  const surfaceSoft = readCssValue(style, "--viewer-surface-soft", dark ? "#202933" : "#f8fafc");
  const surfaceStrong = readCssValue(style, "--viewer-surface-strong", dark ? "#242c34" : "#eef4f8");
  const border = readCssValue(style, "--viewer-border", dark ? "#394550" : "#d6e0ea");
  const borderStrong = readCssValue(style, "--viewer-border-strong", dark ? "#4b5a66" : "#b7c5d4");
  const text = readCssValue(style, "--viewer-text", dark ? "#eef3f6" : "#172026");
  const muted = readCssValue(style, "--viewer-muted", dark ? "#a6b2bb" : "#526173");
  const accent = readCssValue(style, "--viewer-accent", dark ? "#2dd4bf" : "#0f766e");
  const warning = readCssValue(style, "--viewer-warning", dark ? "#f8d477" : "#8a5d00");

  return {
    dark,
    background,
    surface,
    surfaceSoft,
    surfaceStrong,
    border,
    borderStrong,
    text,
    muted,
    accent,
    warning,
    axis: text,
    tick: borderStrong,
    grid: border,
    halo: dark ? "rgb(17 20 24 / 0.92)" : "rgb(255 255 255 / 0.92)",
    label: text,
    sequenceLine: borderStrong,
    selectedFill: dark ? "#5b3415" : "#fed7aa",
    selectedStroke: "#f59e0b",
    restrictionFill: dark ? "#35215e" : "#ede9fe",
    digestFill: dark ? "#123247" : "#dbeafe",
    aminoAcidFill: dark ? surfaceSoft : "#f9fafb",
    aminoAcidStroke: dark ? borderStrong : "#d1d5db",
    aminoAcidText: text,
    alignedReadGapStroke: dark ? "#cbd5e1" : "#475569",
    startFill: dark ? "#123527" : "#dcfce7",
    startStroke: dark ? "#4ade80" : "#16a34a",
    startText: dark ? "#bbf7d0" : "#166534",
    stopFill: dark ? "#4a1d1d" : "#fee2e2",
    stopStroke: dark ? "#f87171" : "#b91c1c",
    stopText: dark ? "#fecaca" : "#b91c1c",
    searchFill: dark ? "rgb(250 204 21 / 0.18)" : "rgb(250 204 21 / 0.22)",
    searchActiveFill: dark ? "rgb(245 158 11 / 0.26)" : "rgb(245 158 11 / 0.32)",
    searchStroke: dark ? "#facc15" : "#eab308",
    searchActiveStroke: "#d97706",
    baseColors: dark ? DARK_BASE_COLORS : LIGHT_BASE_COLORS,
    residueColors: dark ? DARK_RESIDUE_COLORS : LIGHT_RESIDUE_COLORS,
    trackColors: dark ? DARK_TRACK_COLORS : LIGHT_TRACK_COLORS
  };
}

export function getViewerBaseColor(theme, base) {
  return theme.baseColors.get(String(base ?? "").toUpperCase()) || theme.muted;
}

export function getViewerResidueColor(theme, residue) {
  return theme.residueColors.get(String(residue ?? "").toUpperCase()) || theme.muted;
}

export function getViewerTrackColor(theme, track) {
  return theme.trackColors.get(track?.type) || (theme.dark ? "#60a5fa" : "#2563eb");
}
