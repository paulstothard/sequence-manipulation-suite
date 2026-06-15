import {
  addTimestampToFilename,
  getPngExportScale,
  makeSafeFileStem
} from "./canvas-export.js";
import { defaultGenomeFigurePlotWindowSize, makeGcPlot, makeGcSkewPlot } from "../core/genome-figure-data.js";
import { createStackedIntervalLayout } from "../core/viewer-track-layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;

const LINEAR_LABEL_LANES = [74, 52, 30, 8, -14, -30];
const DEFAULT_PLOT_BAND_WIDTH = 56;
const MAX_PLOT_BAND_WIDTH = 120;
const LINEAR_PLOT_GAP = 12;
const LINEAR_PLOT_AMPLITUDE_FRACTION = 0.48;
const LINEAR_ROW_MIN_HEIGHT = 300;
const LINEAR_ROW_BOTTOM_PADDING = 82;
const LINEAR_AXIS_Y = 130;
const LINEAR_FEATURE_TOP_OFFSET = 36;
const LINEAR_RULER_LABEL_OFFSET = 17;
const LINEAR_WRAP_EDGE_LABEL_ZONE = 72;
const LINEAR_WRAP_EDGE_LABEL_BLEED = 48;
const MAX_PLOT_WINDOW_SIZE = 10000;
const LABEL_SNAP_TOLERANCE = 14;
const LABEL_FONT_SIZE = 12;
const LABEL_MIN_WIDTH = 56;
const LABEL_MAX_WIDTH = 170;
const LABEL_BOX_HEIGHT = 18;
const LABEL_VERTICAL_GAP = 20;
const LABEL_HORIZONTAL_PADDING = 7;
const LABEL_VISUAL_PADDING = 2;
const CIRCULAR_LABEL_LEADER_GAP = 28;
const CIRCULAR_LABEL_MARGIN = 16;
const INSIDE_FEATURE_LABEL_FONT_SIZE = 9.5;
const INSIDE_FEATURE_LABEL_HEIGHT = 11;
const INSIDE_FEATURE_LABEL_PADDING = 18;
const CIRCULAR_INNER_PLOT_RADIUS = 168;
const CIRCULAR_PLOT_GAP = 16;
const CIRCULAR_RULER_LABEL_CLASS = "genome-figure-axis-label genome-figure-axis-label-curved";
const DEFAULT_TICK_DENSITY = 6;
const DEFAULT_PLOT_SCALE_MODE = "fit";
const DEFAULT_FEATURE_SLOT_GROUPING = "types";
const DEFAULT_FEATURE_OPACITY = 76;
const FEATURE_FAMILY_SLOT_ORDER = ["gene", "CDS", "RNA", "repeat", "mobile", "misc"];
const COMMON_PLOT_WINDOW_SIZES = [
  24, 50, 100, 200, 500, 1000, 2000, 5000, 10000
];
const STICKY_PLOT_WINDOW_SIZES = [100, 500, 1000, 5000];
const LABEL_FONT = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
let textMeasureContext = null;

const ICONS = {
  pngFile: '<span class="dna-viewer-export-label">PNG</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8"/><path d="m6.9 8.55 3.1 3.1 3.1-3.1"/><path d="M4.25 15.75h11.5"/></svg>',
  svgFile: '<span class="dna-viewer-export-label">SVG</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8"/><path d="m6.9 8.55 3.1 3.1 3.1-3.1"/><path d="M4.25 15.75h11.5"/></svg>'
};

const PLOT_STYLES = {
  gc: {
    stroke: "#0f766e",
    fill: "rgba(15, 118, 110, 0.28)",
    label: "GC fraction",
    baseline: 0.5,
    scale: "0 to 1 GC fraction; dashed line marks 0.50"
  },
  "gc-skew": {
    stroke: "#b91c1c",
    fill: "rgba(185, 28, 28, 0.40)",
    label: "GC skew",
    baseline: 0,
    scale: "-1 to +1 as (G-C)/(G+C); dashed line marks 0"
  }
};

const PALETTES = {
  classic: {
    paper: "#fbfdff",
    panel: "#f1f5f9",
    ink: "#111827",
    muted: "#64748b",
    axis: "#263241",
    grid: "#cbd5e1",
    plotFill: "rgba(14, 116, 144, 0.14)",
    plotLine: "#0e7490",
    connector: "#8b98a8",
    features: {
      CDS: "#2563eb",
      gene: "#94a3b8",
      RNA: "#7e22ce",
      tRNA: "#7e22ce",
      rRNA: "#be185d",
      ncRNA: "#0891b2",
      tmRNA: "#9333ea",
      repeat: "#f59e0b",
      mobile: "#dc2626",
      misc: "#059669",
      custom: "#111827"
    }
  },
  marine: {
    paper: "#f8ffff",
    panel: "#e7f5f3",
    ink: "#17252b",
    muted: "#58737a",
    axis: "#315b66",
    grid: "#c7dfdc",
    plotFill: "rgba(13, 148, 136, 0.16)",
    plotLine: "#0f766e",
    connector: "#7ea09c",
    features: {
      CDS: "#0369a1",
      gene: "#86a8b8",
      RNA: "#9333ea",
      tRNA: "#9333ea",
      rRNA: "#be123c",
      ncRNA: "#0284c7",
      tmRNA: "#7c3aed",
      repeat: "#d97706",
      mobile: "#e11d48",
      misc: "#15803d",
      custom: "#111827"
    }
  },
  orchard: {
    paper: "#fffdf7",
    panel: "#f0f5df",
    ink: "#24261f",
    muted: "#677052",
    axis: "#56633f",
    grid: "#d6dfbf",
    plotFill: "rgba(91, 132, 75, 0.16)",
    plotLine: "#5b844b",
    connector: "#8d9771",
    features: {
      CDS: "#3f7f2f",
      gene: "#9ca36b",
      RNA: "#8b5cf6",
      tRNA: "#8b5cf6",
      rRNA: "#be185d",
      ncRNA: "#0f766e",
      tmRNA: "#7c3aed",
      repeat: "#d97706",
      mobile: "#c2410c",
      misc: "#0f766e",
      custom: "#111827"
    }
  },
  mono: {
    paper: "#ffffff",
    panel: "#f4f4f5",
    ink: "#18181b",
    muted: "#52525b",
    axis: "#27272a",
    grid: "#d4d4d8",
    plotFill: "rgba(0, 0, 0, 0.08)",
    plotLine: "#3f3f46",
    connector: "#71717a",
    features: {
      CDS: "#27272a",
      gene: "#52525b",
      RNA: "#71717a",
      repeat: "#a1a1aa",
      mobile: "#3f3f46",
      misc: "#737373",
      custom: "#111827"
    }
  },
  aurora: {
    paper: "#f8fbff",
    panel: "#eef7fb",
    rowPanel: "#eef7fb",
    legendPanel: "#ffffff",
    plotPanel: "rgba(217, 232, 240, 0.56)",
    ink: "#10202f",
    muted: "#526577",
    axis: "#1e3a4a",
    grid: "#c8d7e1",
    plotFill: "rgba(20, 184, 166, 0.18)",
    plotLine: "#0f766e",
    connector: "#6b8ea4",
    labelHalo: "#f8fbff",
    features: {
      CDS: "#2f6fed",
      gene: "#7b8fa8",
      RNA: "#b44bd8",
      tRNA: "#8b5cf6",
      rRNA: "#e23b7a",
      ncRNA: "#0891b2",
      tmRNA: "#6d5dfc",
      repeat: "#f59e0b",
      mobile: "#ef4444",
      misc: "#0ea66d",
      custom: "#10202f"
    }
  },
  midnight: {
    paper: "#07111f",
    panel: "#0d1b2a",
    rowPanel: "#0d1b2a",
    legendPanel: "#0a1624",
    plotPanel: "rgba(47, 69, 92, 0.42)",
    ink: "#f5f7fb",
    muted: "#a8b6c7",
    axis: "#dbeafe",
    grid: "#31445d",
    plotFill: "rgba(45, 212, 191, 0.24)",
    plotLine: "#2dd4bf",
    connector: "#7ea6d8",
    labelHalo: "#07111f",
    plots: {
      gc: { stroke: "#5eead4", fill: "rgba(94, 234, 212, 0.26)" },
      "gc-skew": { stroke: "#fb7185", fill: "rgba(251, 113, 133, 0.32)" }
    },
    features: {
      CDS: "#60a5fa",
      gene: "#94a3b8",
      RNA: "#c084fc",
      tRNA: "#a78bfa",
      rRNA: "#fb7185",
      ncRNA: "#22d3ee",
      tmRNA: "#818cf8",
      repeat: "#fbbf24",
      mobile: "#f97316",
      misc: "#34d399",
      custom: "#f8fafc"
    }
  },
  ember: {
    paper: "#11100f",
    panel: "#1d1b18",
    rowPanel: "#1d1b18",
    legendPanel: "#171512",
    plotPanel: "rgba(68, 55, 44, 0.48)",
    ink: "#fff7ed",
    muted: "#d6c4ad",
    axis: "#fed7aa",
    grid: "#4b3a2b",
    plotFill: "rgba(20, 184, 166, 0.20)",
    plotLine: "#5eead4",
    connector: "#f0b779",
    labelHalo: "#11100f",
    plots: {
      gc: { stroke: "#5eead4", fill: "rgba(94, 234, 212, 0.24)" },
      "gc-skew": { stroke: "#fb7185", fill: "rgba(251, 113, 133, 0.30)" }
    },
    features: {
      CDS: "#38bdf8",
      gene: "#a8a29e",
      RNA: "#d8b4fe",
      tRNA: "#c084fc",
      rRNA: "#fb7185",
      ncRNA: "#2dd4bf",
      tmRNA: "#818cf8",
      repeat: "#facc15",
      mobile: "#fb923c",
      misc: "#86efac",
      custom: "#fff7ed"
    }
  },
  blueprint: {
    paper: "#06142e",
    panel: "#0c2145",
    rowPanel: "#0c2145",
    legendPanel: "#081a36",
    plotPanel: "rgba(56, 189, 248, 0.11)",
    ink: "#eff6ff",
    muted: "#b6c8df",
    axis: "#bfdbfe",
    grid: "#2c4d7e",
    plotFill: "rgba(52, 211, 153, 0.18)",
    plotLine: "#34d399",
    connector: "#93c5fd",
    labelHalo: "#06142e",
    plots: {
      gc: { stroke: "#34d399", fill: "rgba(52, 211, 153, 0.22)" },
      "gc-skew": { stroke: "#f472b6", fill: "rgba(244, 114, 182, 0.28)" }
    },
    features: {
      CDS: "#38bdf8",
      gene: "#8aa5c4",
      RNA: "#f472b6",
      tRNA: "#c084fc",
      rRNA: "#fb7185",
      ncRNA: "#5eead4",
      tmRNA: "#a78bfa",
      repeat: "#fde047",
      mobile: "#fb923c",
      misc: "#86efac",
      custom: "#eff6ff"
    }
  }
};

function svgEl(tag, attrs = {}, children = []) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) element.setAttribute(key, String(value));
  }
  for (const child of children) {
    element.append(child);
  }
  return element;
}

function textEl(text, attrs = {}) {
  const element = svgEl("text", attrs);
  element.textContent = text;
  return element;
}

function pathEl(d, attrs = {}) {
  return svgEl("path", { d, ...attrs });
}

function parseHexColor(value) {
  const text = String(value || "").trim();
  const short = text.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    return short[1].split("").map((part) => Number.parseInt(`${part}${part}`, 16));
  }
  const full = text.match(/^#([0-9a-f]{6})$/i);
  if (!full) return null;
  return [
    Number.parseInt(full[1].slice(0, 2), 16),
    Number.parseInt(full[1].slice(2, 4), 16),
    Number.parseInt(full[1].slice(4, 6), 16)
  ];
}

function parseRgbColor(value) {
  const match = String(value || "").trim().match(/^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)/i);
  if (!match) return null;
  return [1, 2, 3].map((index) => clamp(Math.round(Number(match[index])), 0, 255));
}

function hueToRgb(p, q, t) {
  let adjusted = t;
  if (adjusted < 0) adjusted += 1;
  if (adjusted > 1) adjusted -= 1;
  if (adjusted < 1 / 6) return p + (q - p) * 6 * adjusted;
  if (adjusted < 1 / 2) return q;
  if (adjusted < 2 / 3) return p + (q - p) * (2 / 3 - adjusted) * 6;
  return p;
}

function parseHslColor(value) {
  const match = String(value || "").trim().match(/^hsla?\(\s*([-0-9.]+)(?:deg)?[,\s]+([0-9.]+)%[,\s]+([0-9.]+)%/i);
  if (!match) return null;
  const h = (((Number(match[1]) % 360) + 360) % 360) / 360;
  const s = clamp(Number(match[2]) / 100, 0, 1);
  const l = clamp(Number(match[3]) / 100, 0, 1);
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255)
  ];
}

function parseColor(value) {
  return parseHexColor(value) || parseRgbColor(value) || parseHslColor(value);
}

function channelToLinear(value) {
  const normalized = clamp(Number(value) || 0, 0, 255) / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb) {
  if (!rgb) return 0.5;
  return 0.2126 * channelToLinear(rgb[0])
    + 0.7152 * channelToLinear(rgb[1])
    + 0.0722 * channelToLinear(rgb[2]);
}

function contrastRatio(leftRgb, rightRgb) {
  const left = relativeLuminance(leftRgb);
  const right = relativeLuminance(rightRgb);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

export function insideFeatureLabelContrastStyle(featureFill) {
  const fillRgb = parseColor(featureFill);
  if (!fillRgb) return "";
  const darkText = "#020617";
  const lightText = "#f8fafc";
  const darkRgb = parseColor(darkText);
  const lightRgb = parseColor(lightText);
  const greenDominant = fillRgb[1] > fillRgb[0] * 1.08 && fillRgb[1] > fillRgb[2] * 1.08;
  const useLightText = greenDominant || contrastRatio(lightRgb, fillRgb) > contrastRatio(darkRgb, fillRgb);
  const textFill = useLightText ? lightText : darkText;
  const stroke = useLightText ? "#0f172a" : "#ffffff";
  const strokeOpacity = useLightText ? "0.9" : "0.88";
  const strokeWidth = useLightText ? "1.45px" : "1.25px";
  return `fill:${textFill};stroke:${stroke};stroke-opacity:${strokeOpacity};stroke-width:${strokeWidth}`;
}

function appendFigureStyles(svg, palette) {
  const halo = palette.labelHalo || palette.paper;
  const style = svgEl("style");
  style.textContent = `
    .genome-figure-title {
      fill: ${palette.ink};
      font: 700 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    .genome-figure-subtitle {
      fill: ${palette.muted};
      font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .genome-figure-subtitle,
    .genome-figure-axis-label,
    .genome-figure-legend-text,
    .genome-figure-contig-label { fill: ${palette.muted}; }
    .genome-figure-axis-label,
    .genome-figure-legend-text {
      font: 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .genome-figure-axis-label-curved {
      pointer-events: none;
    }
    .genome-figure-legend-title,
    .genome-figure-plot-note,
    .genome-figure-label-text { fill: ${palette.ink}; }
    .genome-figure-plot-note {
      font: 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .genome-figure-contig-label {
      font: 700 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .genome-figure-legend-title {
      font: 700 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .genome-figure-label rect[fill="transparent"],
    .genome-figure-label-text {
      cursor: grab;
    }
    .genome-figure-label rect[fill="transparent"]:active,
    .genome-figure-label-text:active {
      cursor: grabbing;
    }
    .genome-figure-label-text {
      font: 12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
    }
    .genome-figure-inside-label {
      fill: ${palette.ink};
      font: 500 ${INSIDE_FEATURE_LABEL_FONT_SIZE}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      paint-order: stroke;
      pointer-events: none;
      stroke: ${halo};
      stroke-linejoin: round;
      stroke-opacity: 0.68;
      stroke-width: 1px;
    }
    .genome-figure-label-text-bare {
      paint-order: stroke;
      stroke: ${halo};
      stroke-linejoin: round;
      stroke-opacity: 0.94;
      stroke-width: 2.4px;
    }
    .genome-figure-label.selected .genome-figure-label-text {
      font-weight: 700;
    }
  `;
  svg.append(style);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function featureFamily(type) {
  if (type === "CDS") return "CDS";
  if (/RNA/i.test(type)) return "RNA";
  if (/repeat/i.test(type)) return "repeat";
  if (/mobile|prophage|island|transpos/i.test(type)) return "mobile";
  if (type === "gene") return "gene";
  return "misc";
}

function featureFamilyLabel(family) {
  if (family === "RNA") return "RNA types";
  if (family === "CDS") return "CDS";
  if (family === "mobile") return "Mobile elements";
  if (family === "repeat") return "Repeats";
  if (family === "gene") return "Genes";
  return "Misc features";
}

function slotGroupForFeature(feature, grouping = DEFAULT_FEATURE_SLOT_GROUPING) {
  const type = String(feature?.type || "misc");
  if (grouping === "families") {
    const family = featureFamily(type);
    const sortOrder = FEATURE_FAMILY_SLOT_ORDER.includes(family)
      ? FEATURE_FAMILY_SLOT_ORDER.indexOf(family)
      : FEATURE_FAMILY_SLOT_ORDER.length;
    return {
      key: `family:${family}`,
      label: featureFamilyLabel(family),
      colorType: family,
      sortOrder
    };
  }
  if (grouping === "rna" && /RNA/i.test(type)) {
    return {
      key: "group:RNA",
      label: "RNA types",
      colorType: "RNA",
      sortOrder: Number.POSITIVE_INFINITY
    };
  }
  return {
    key: `type:${type}`,
    label: type,
    colorType: type,
    sortOrder: Number.POSITIVE_INFINITY
  };
}

function featureSlotGroups(features, grouping = DEFAULT_FEATURE_SLOT_GROUPING) {
  const groupsByKey = new Map();
  for (const [index, feature] of (features ?? []).entries()) {
    const group = slotGroupForFeature(feature, grouping);
    if (!groupsByKey.has(group.key)) {
      groupsByKey.set(group.key, {
        ...group,
        firstIndex: index,
        types: []
      });
    }
    const existing = groupsByKey.get(group.key);
    if (!existing.types.includes(feature.type)) existing.types.push(feature.type);
  }
  const groups = [...groupsByKey.values()];
  return groups.sort((left, right) => {
    if (grouping === "families" && left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.firstIndex - right.firstIndex || left.label.localeCompare(right.label);
  });
}

function slotIndexForFeature(feature, slotGroups, grouping = DEFAULT_FEATURE_SLOT_GROUPING) {
  const key = slotGroupForFeature(feature, grouping).key;
  const index = slotGroups.findIndex((group) => group.key === key);
  return Math.max(0, index);
}

function generatedTypeColor(type, paletteName) {
  if (paletteName === "mono") {
    return `hsl(0 0% ${30 + (hashString(type) % 48)}%)`;
  }
  if (["midnight", "ember", "blueprint"].includes(paletteName)) {
    return `hsl(${hashString(type) % 360} ${64 + (hashString(`${type}:s`) % 20)}% ${62 + (hashString(`${type}:l`) % 14)}%)`;
  }
  const base = { classic: 215, marine: 185, orchard: 100 }[paletteName] ?? 210;
  const hue = (base + (hashString(type) % 190)) % 360;
  return `hsl(${hue} ${42 + (hashString(`${type}:s`) % 22)}% ${38 + (hashString(`${type}:l`) % 16)}%)`;
}

function colorForFeature(type, palette, paletteName) {
  if (palette.features[type]) return palette.features[type];
  const family = featureFamily(type);
  return palette.features[family] || generatedTypeColor(type, paletteName);
}

function featureColorKey(type, colorMode = "type") {
  return colorMode === "family" ? featureFamily(type) : type;
}

function colorForFeatureDisplay(feature, palette, paletteName, colorMode = "type") {
  return colorForFeature(featureColorKey(feature?.type || "misc", colorMode), palette, paletteName);
}

function featureLegendEntries(features, colorMode = "type") {
  const entriesByKey = new Map();
  for (const feature of features ?? []) {
    const key = featureColorKey(feature.type || "misc", colorMode);
    if (!entriesByKey.has(key)) {
      entriesByKey.set(key, {
        label: colorMode === "family" ? featureFamilyLabel(key) : key,
        colorType: key,
        types: []
      });
    }
    const entry = entriesByKey.get(key);
    if (feature.type && !entry.types.includes(feature.type)) entry.types.push(feature.type);
  }
  return [...entriesByKey.values()];
}

function angleFor(position, length) {
  return -Math.PI / 2 + ((position - 1) / Math.max(1, length)) * TAU;
}

function point(cx, cy, radius, angle) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius
  };
}

function polarPath(cx, cy, radius, startAngle, endAngle) {
  let adjustedEnd = endAngle;
  while (adjustedEnd < startAngle) adjustedEnd += TAU;
  const start = point(cx, cy, radius, startAngle);
  const end = point(cx, cy, radius, adjustedEnd);
  const largeArc = adjustedEnd - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function shortArcPath(cx, cy, radius, startAngle, endAngle, sweep = 1) {
  const start = point(cx, cy, radius, startAngle);
  const end = point(cx, cy, radius, endAngle);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function annularPath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  let adjustedEnd = endAngle;
  while (adjustedEnd < startAngle) adjustedEnd += TAU;
  const largeArc = adjustedEnd - startAngle > Math.PI ? 1 : 0;
  const p1 = point(cx, cy, outerRadius, startAngle);
  const p2 = point(cx, cy, outerRadius, adjustedEnd);
  const p3 = point(cx, cy, innerRadius, adjustedEnd);
  const p4 = point(cx, cy, innerRadius, startAngle);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    "Z"
  ].join(" ");
}

function niceStep(span, target = 8) {
  const rough = Math.max(1, span / target);
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

function minorStepForMajor(majorStep) {
  if (!Number.isFinite(majorStep) || majorStep <= 1) return 0;
  const power = Math.pow(10, Math.floor(Math.log10(majorStep)));
  const scaled = Math.round(majorStep / power);
  const divisor = scaled === 2 ? 4 : 5;
  return Math.max(1, Math.round(majorStep / divisor));
}

function tickTarget(state, layout) {
  const density = Math.max(3, Math.min(12, Number.parseInt(state.tickDensity ?? DEFAULT_TICK_DENSITY, 10) || DEFAULT_TICK_DENSITY));
  return layout === "circular" ? density + 4 : density;
}

function rulerSteps(span, target) {
  const majorStep = niceStep(Math.max(1, span), target);
  const minorStep = minorStepForMajor(majorStep);
  return { majorStep, minorStep };
}

function tickPositions(start, end, step, { includeOrigin = false } = {}) {
  if (!Number.isFinite(step) || step <= 0 || end < start) return [];
  const positions = [];
  const seen = new Set();
  const add = (position) => {
    const rounded = Math.max(1, Math.min(end, Math.round(position)));
    if (rounded < start || seen.has(rounded)) return;
    seen.add(rounded);
    positions.push(rounded);
  };
  if (includeOrigin && start <= 1 && end >= 1) add(1);
  const first = Math.max(step, Math.ceil(start / step) * step);
  for (let position = first; position <= end; position += step) add(position);
  return positions.sort((left, right) => left - right);
}

function positionUnit(recordLength) {
  if (recordLength >= 1000000000) return { unit: "Gb", scale: 1000000000 };
  if (recordLength >= 1000000) return { unit: "Mb", scale: 1000000 };
  if (recordLength >= 10000) return { unit: "kb", scale: 1000 };
  return { unit: "bp", scale: 1 };
}

function formatPositionLabel(position, recordLength) {
  if (position <= 1) return recordLength < 10000 ? "1 bp" : "1";
  const { unit, scale } = positionUnit(recordLength);
  if (scale === 1) return `${position.toLocaleString()} bp`;
  const value = position / scale;
  const decimals = position % scale === 0 ? 0 : value < 10 ? 1 : 0;
  return `${Number(value.toFixed(decimals)).toLocaleString()} ${unit}`;
}

function visiblePlots(record, state) {
  let sourcePlots = record.plotSummaries?.[String(state.plotWindowSize)] ?? record.plots ?? [];
  if (record.sequence && state.plotWindowSize) {
    const hasPreparedWindow = sourcePlots.length > 0
      && sourcePlots.every((plot) => Number(plot.windowSize) === Number(state.plotWindowSize));
    const circular = state.figure?.layout === "circular";
    const cacheKey = `${record.id || record.title || "record"}:${record.length}:${state.plotWindowSize}:circular:${circular}`;
    if (!hasPreparedWindow) {
      sourcePlots = state.plotCache?.get(cacheKey);
    }
    if (!sourcePlots || !hasPreparedWindow && sourcePlots.length === 0) {
      sourcePlots = [
        {
          id: "gc",
          label: "GC fraction",
          baseline: 0.5,
          windowSize: state.plotWindowSize,
          values: makeGcPlot(record.sequence, { windowSize: state.plotWindowSize, circular })
        },
        {
          id: "gc-skew",
          label: "GC skew",
          baseline: 0,
          windowSize: state.plotWindowSize,
          values: makeGcSkewPlot(record.sequence, { windowSize: state.plotWindowSize, circular })
        }
      ];
      state.plotCache?.set(cacheKey, sourcePlots);
    }
  }
  return sourcePlots.filter((plot) => state.visiblePlots?.has(plot.id));
}

function plotBaselineValue(plot, state) {
  if (plot.id === "gc") {
    if (state.gcBaselineMode === "average") {
      const values = plot.values ?? [];
      if (values.length) {
        return values.reduce((sum, item) => sum + Number(item.value || 0), 0) / values.length;
      }
    }
    return 0.5;
  }
  return 0;
}

function fixedPlotScaleSpan(plot) {
  if (plot.id === "gc-skew") return 1;
  return 0.5;
}

function plotValues(plot) {
  return (plot.values ?? [])
    .map((item) => Number(item.value))
    .filter((value) => Number.isFinite(value));
}

function plotScaleInfo(plot, state = {}) {
  const values = plotValues(plot);
  const baseline = plotBaselineValue(plot, state);
  const min = values.length ? Math.min(...values) : baseline;
  const max = values.length ? Math.max(...values) : baseline;
  const fixedSpan = fixedPlotScaleSpan(plot);
  const observedSpan = Math.max(Math.abs(max - baseline), Math.abs(min - baseline));
  const fit = state.plotScaleMode === "fit" && observedSpan > 0;
  const span = fit ? observedSpan : fixedSpan;
  return {
    baseline,
    fit,
    mode: fit ? "fit" : "fixed",
    min,
    max,
    span,
    maxRatio: span > 0 ? observedSpan / span : 0
  };
}

function formatPlotValue(value) {
  if (!Number.isFinite(Number(value))) return "n/a";
  return Number(value).toFixed(3).replace(/\.?0+$/, "");
}

function plotBaselineDescription(plot, state) {
  if (plot.id === "gc") {
    return state.gcBaselineMode === "average"
      ? "filled deviation from sequence-average GC"
      : "filled deviation from 0.50 GC";
  }
  if (plot.id === "gc-skew") return "filled deviation from zero";
  return "filled deviation from baseline";
}

function plotScaleDescription(plot, scale) {
  if (!scale?.fit) return "";
  const baselineLabel = plot.id === "gc"
    ? `baseline ${formatPlotValue(scale.baseline)}`
    : "baseline 0";
  return `min ${formatPlotValue(scale.min)}; max ${formatPlotValue(scale.max)}; ${baselineLabel}; scale ±${formatPlotValue(scale.span)}`;
}

function getVisibleFeatures(record, state) {
  return (record.features ?? []).filter((feature) => state.visibleFeatureTypes?.has(feature.type));
}

function scaledPlotDelta(value, scale) {
  const span = Number(scale?.span) || 1;
  return Math.max(-1, Math.min(1, (Number(value) - Number(scale?.baseline ?? 0)) / span));
}

function plotStyleFor(plot, state = {}) {
  const base = PLOT_STYLES[plot.id] ?? { stroke: "#334155", fill: "rgba(51, 65, 85, 0.12)", label: plot.label, scale: "" };
  return {
    ...base,
    ...(state.palette?.plots?.[plot.id] ?? {})
  };
}

function nearestCommonPlotWindowSize(value, sequenceLength = Number.POSITIVE_INFINITY) {
  const maxAllowed = Math.min(MAX_PLOT_WINDOW_SIZE, Math.max(24, Number(sequenceLength) || 24));
  const candidates = COMMON_PLOT_WINDOW_SIZES.filter((size) => size <= maxAllowed);
  if (!candidates.length) return Math.max(1, Math.round(value));
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ), candidates[0]);
}

function defaultPlotWindowSize(sequenceLength) {
  return defaultGenomeFigurePlotWindowSize(sequenceLength);
}

function snapPlotWindowSize(value, min, max) {
  const numeric = Math.max(min, Math.min(max, Math.round(Number(value) || min)));
  const candidates = STICKY_PLOT_WINDOW_SIZES.filter((size) => size >= min && size <= max);
  let snapped = numeric;
  for (const candidate of candidates) {
    const tolerance = Math.max(10, candidate * 0.06);
    if (Math.abs(numeric - candidate) <= tolerance) {
      snapped = candidate;
      break;
    }
  }
  return snapped;
}

function formatWindowSize(value) {
  return Number(value).toLocaleString();
}

function featureMidpoint(feature) {
  const parts = feature.parts?.length ? feature.parts : [{ start: feature.start, end: feature.end }];
  return (parts[0].start + parts[parts.length - 1].end) / 2;
}

function estimateTextWidth(text, fontSize = 11) {
  return String(text ?? "").length * fontSize * 0.58 + 10;
}

function measuredTextWidth(text, font = LABEL_FONT) {
  const value = String(text ?? "");
  if (typeof document !== "undefined") {
    try {
      if (!textMeasureContext) textMeasureContext = document.createElement("canvas").getContext("2d");
      if (textMeasureContext) {
        textMeasureContext.font = font;
        return textMeasureContext.measureText(value).width;
      }
    } catch {
      // Fall back to a deterministic estimate when canvas text metrics are unavailable.
    }
  }
  return estimateTextWidth(value, LABEL_FONT_SIZE);
}

function labelInkWidth(text) {
  return Math.max(6, Math.min(LABEL_MAX_WIDTH, measuredTextWidth(text)));
}

function labelTextWidth(text) {
  return Math.max(LABEL_MIN_WIDTH, Math.min(LABEL_MAX_WIDTH, labelInkWidth(text) + 14));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function aggregateRecords(records) {
  if (records.length <= 1) return records[0] ?? null;
  let offset = 0;
  const contigs = [];
  const features = [];
  const plotsById = new Map();
  const plotSummariesByWindow = new Map();
  const sequence = [];

  for (const [recordIndex, record] of records.entries()) {
    const start = offset + 1;
    const end = offset + record.length;
    contigs.push({
      id: record.id || `contig-${recordIndex + 1}`,
      title: record.title || `Contig ${recordIndex + 1}`,
      start,
      end,
      length: record.length
    });
    sequence.push(record.sequence || "");

    for (const feature of record.features ?? []) {
      features.push({
        ...feature,
        id: `${record.id || recordIndex}:${feature.id}`,
        contigTitle: record.title,
        start: feature.start + offset,
        end: feature.end + offset,
        parts: (feature.parts?.length ? feature.parts : [{ start: feature.start, end: feature.end, strand: feature.strand }])
          .map((part) => ({
            ...part,
            start: part.start + offset,
            end: part.end + offset
          }))
      });
    }

    for (const plot of record.plots ?? []) {
      const aggregatePlot = plotsById.get(plot.id) || {
        ...plot,
        values: []
      };
      aggregatePlot.values.push(...(plot.values ?? []).map((value) => ({
        ...value,
        position: value.position + offset
      })));
      plotsById.set(plot.id, aggregatePlot);
    }
    for (const [windowSize, plots] of Object.entries(record.plotSummaries ?? {})) {
      if (!plotSummariesByWindow.has(windowSize)) plotSummariesByWindow.set(windowSize, new Map());
      const summaryById = plotSummariesByWindow.get(windowSize);
      for (const plot of plots ?? []) {
        const aggregatePlot = summaryById.get(plot.id) || {
          ...plot,
          values: []
        };
        aggregatePlot.values.push(...(plot.values ?? []).map((value) => ({
          ...value,
          position: value.position + offset
        })));
        summaryById.set(plot.id, aggregatePlot);
      }
    }
    offset = end;
  }

  return {
    id: "combined-genome",
    title: `${records.length} contig genome figure`,
    accession: "combined",
    sequence: sequence.join(""),
    length: offset,
    topology: "linear",
    contigs,
    features,
    plots: Array.from(plotsById.values()),
    plotSummaries: Object.fromEntries([...plotSummariesByWindow.entries()]
      .map(([windowSize, plots]) => [windowSize, Array.from(plots.values())]))
  };
}

function normalizeViewRange(record, start, end) {
  const length = Math.max(1, Number(record?.length) || 1);
  let rangeStart = Math.round(Number(start) || 1);
  let rangeEnd = Math.round(Number(end) || length);
  rangeStart = Math.max(1, Math.min(length, rangeStart));
  rangeEnd = Math.max(1, Math.min(length, rangeEnd));
  if (rangeStart > rangeEnd) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
  return { start: rangeStart, end: rangeEnd, length: rangeEnd - rangeStart + 1 };
}

function clipFeatureToViewRange(feature, range) {
  const parts = (feature.parts?.length ? feature.parts : [{ start: feature.start, end: feature.end, strand: feature.strand }])
    .map((part) => ({
      ...part,
      sourceStart: part.start,
      sourceEnd: part.end,
      start: Math.max(part.start, range.start) - range.start + 1,
      end: Math.min(part.end, range.end) - range.start + 1
    }))
    .filter((part) => part.end >= part.start);
  if (!parts.length) return null;
  return {
    ...feature,
    sourceStart: feature.start,
    sourceEnd: feature.end,
    start: Math.min(...parts.map((part) => part.start)),
    end: Math.max(...parts.map((part) => part.end)),
    parts
  };
}

function clipPlotToViewRange(plot, range) {
  return {
    ...plot,
    values: (plot.values ?? [])
      .filter((value) => value.position >= range.start && value.position <= range.end)
      .map((value) => ({
        ...value,
        sourcePosition: value.position,
        position: value.position - range.start + 1
      }))
  };
}

function clipPlotSummariesToViewRange(plotSummaries, range) {
  return Object.fromEntries(Object.entries(plotSummaries ?? {})
    .map(([windowSize, plots]) => [windowSize, (plots ?? []).map((plot) => clipPlotToViewRange(plot, range))]));
}

function clipContigToViewRange(contig, range) {
  const start = Math.max(contig.start, range.start);
  const end = Math.min(contig.end, range.end);
  if (end < start) return null;
  return {
    ...contig,
    sourceStart: contig.start,
    sourceEnd: contig.end,
    start: start - range.start + 1,
    end: end - range.start + 1,
    length: end - start + 1
  };
}

function displayRecordForState(record, state) {
  if (state.figure?.layout !== "linear") return record;
  const range = normalizeViewRange(record, state.viewRangeStart, state.viewRangeEnd);
  state.viewRangeStart = range.start;
  state.viewRangeEnd = range.end;
  if (range.start === 1 && range.end === record.length) return record;
  const sequence = record.sequence ? record.sequence.slice(range.start - 1, range.end) : record.sequence;
  return {
    ...record,
    id: `${record.id || record.title || "record"}:range:${range.start}-${range.end}`,
    sequence,
    length: range.length,
    sourceLength: record.length,
    coordinateOffset: range.start - 1,
    shownRangeStart: range.start,
    shownRangeEnd: range.end,
    contigs: (record.contigs ?? [])
      .map((contig) => clipContigToViewRange(contig, range))
      .filter(Boolean),
    features: (record.features ?? [])
      .filter((feature) => feature.end >= range.start && feature.start <= range.end)
      .map((feature) => clipFeatureToViewRange(feature, range))
      .filter(Boolean),
    plots: (record.plots ?? []).map((plot) => clipPlotToViewRange(plot, range)),
    plotSummaries: clipPlotSummariesToViewRange(record.plotSummaries, range)
  };
}

function labelLimit(density) {
  return density === "low" ? 24 : density === "high" ? 160 : 72;
}

function chooseLabelFeatures(record, density, excludeIds = new Set(), forceIds = new Set()) {
  const seenGenericLabels = new Set();
  const labels = [];
  const limit = labelLimit(density);
  const allCandidates = [...(record.features ?? [])]
    .filter((feature) => !excludeIds.has(feature.id) && String(feature.label || feature.type || "").trim())
    .sort((left, right) => (right.priority ?? 1) - (left.priority ?? 1) || (right.end - right.start) - (left.end - left.start));
  const forced = allCandidates.filter((feature) => forceIds.has(feature.id));
  const candidates = allCandidates.filter((feature) => !forceIds.has(feature.id));
  const maxLabels = Math.max(limit, forced.length);

  for (const feature of forced) {
    labels.push(feature);
  }

  if (record.length > 0 && candidates.length > Math.max(1, maxLabels - labels.length)) {
    const bins = Array.from({ length: limit }, () => []);
    for (const feature of candidates) {
      const midpoint = featureMidpoint(feature);
      const binIndex = Math.min(limit - 1, Math.max(0, Math.floor(((midpoint - 1) / record.length) * limit)));
      bins[binIndex].push(feature);
    }
    const distributed = bins
      .map((bin) => bin[0])
      .filter(Boolean)
      .sort((left, right) => featureMidpoint(left) - featureMidpoint(right));
    candidates.splice(0, candidates.length, ...distributed, ...candidates.filter((feature) => !distributed.includes(feature)));
  }

  for (const feature of candidates) {
    if (labels.length >= maxLabels) break;
    if (excludeIds.has(feature.id)) continue;
    const key = String(feature.label || feature.type || "").toLowerCase();
    if (/^(hypothetical protein|unknown|unnamed|CDS|gene|misc_feature)$/i.test(key)) {
      if (seenGenericLabels.has(key)) continue;
      seenGenericLabels.add(key);
    }
    labels.push(feature);
  }
  return labels;
}

function makeLinearRows(record, width, rowHeight = 420) {
  const plotWidth = width - 130;
  const contigs = Array.isArray(record.contigs) && record.contigs.length > 1 ? record.contigs : null;
  const rowCount = contigs
    ? Math.min(14, contigs.length)
    : Math.max(4, Math.min(12, Math.ceil(record.length / 700000) || 4));
  const rowSpan = contigs ? null : Math.ceil(record.length / rowCount);
  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    const contig = contigs?.[index];
    const start = contig ? contig.start : index * rowSpan + 1;
    const end = contig ? contig.end : Math.min(record.length, (index + 1) * rowSpan);
    rows.push({
      index,
      start,
      end,
      contig,
      y: 215 + index * rowHeight,
      x: 65,
      width: plotWidth,
      height: rowHeight - 24
    });
  }
  return rows;
}

function clipFeatureToRow(feature, row) {
  return (feature.parts?.length ? feature.parts : [{ start: feature.start, end: feature.end }])
    .map((part) => ({
      start: Math.max(part.start, row.start),
      end: Math.min(part.end, row.end)
    }))
    .filter((part) => part.end >= part.start);
}

function rowX(row, position) {
  return row.x + ((position - row.start) / Math.max(1, row.end - row.start + 1)) * row.width;
}

function makeStackedFeatureLayout(record, features, maxSlots = 12) {
  return createStackedIntervalLayout(features ?? [], {
    length: record.length,
    maxSlots,
    minGapUnits: Math.max(12, Math.round(record.length / 700))
  });
}

function stackedLayoutCacheKey(record, maxSlots, state) {
  return [
    record.id || record.title || "record",
    record.length,
    maxSlots,
    state.featureLayoutVersion || 0
  ].join(":");
}

function getStackedFeatureLayout(record, features, maxSlots, state) {
  const key = stackedLayoutCacheKey(record, maxSlots, state);
  const cached = state.stackedLayoutCache?.get(key);
  if (cached) return cached;
  const layout = makeStackedFeatureLayout(record, features, maxSlots);
  state.stackedLayoutCache?.set(key, layout);
  return layout;
}

function slotForFeature(layout, feature) {
  const placement = layout?.placements?.find((item) => item.item === feature || item.item?.id === feature.id);
  return placement?.slot ?? 0;
}

function defaultFeatureTypeVisibility(type) {
  return !/^(gene|source|origin|rep_origin)$/i.test(type);
}

function packHorizontalLabelLane(items, leftBound, rightBound, padding = LABEL_HORIZONTAL_PADDING) {
  if (!items.length) return { items: [], totalShift: 0, maxShift: 0 };
  const sorted = [...items].sort((left, right) => left.desiredX - right.desiredX || left.id.localeCompare(right.id));
  const span = rightBound - leftBound;
  const required = sorted.reduce((sum, item) => sum + item.width, 0) + Math.max(0, sorted.length - 1) * padding;
  if (required > span) return null;
  const packed = sorted.map((item) => ({
    ...item,
    x: clamp(item.desiredX, leftBound + item.width / 2, rightBound - item.width / 2)
  }));

  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 1; index < packed.length; index += 1) {
      const previousRight = packed[index - 1].x + packed[index - 1].width / 2;
      packed[index].x = Math.max(packed[index].x, previousRight + padding + packed[index].width / 2);
    }
    const last = packed.at(-1);
    if (last && last.x + last.width / 2 > rightBound) {
      last.x = rightBound - last.width / 2;
    }
    for (let index = packed.length - 2; index >= 0; index -= 1) {
      const nextLeft = packed[index + 1].x - packed[index + 1].width / 2;
      packed[index].x = Math.min(packed[index].x, nextLeft - padding - packed[index].width / 2);
    }
    const first = packed[0];
    if (first && first.x - first.width / 2 < leftBound) {
      const shift = leftBound - (first.x - first.width / 2);
      for (const item of packed) item.x += shift;
    }
  }

  let totalShift = 0;
  let maxShift = 0;
  for (const item of packed) {
    const shift = Math.abs(item.x - item.desiredX);
    totalShift += shift;
    maxShift = Math.max(maxShift, shift);
  }
  return { items: packed, totalShift, maxShift };
}

function labelBoxesOverlap(left, right, padding = 0) {
  return !(
    left.right + padding <= right.left
    || right.right + padding <= left.left
    || left.bottom + padding <= right.top
    || right.bottom + padding <= left.top
  );
}

function makeCenteredLabelBox(x, y, width) {
  return {
    left: x - width / 2,
    right: x + width / 2,
    top: y - LABEL_BOX_HEIGHT / 2,
    bottom: y + LABEL_BOX_HEIGHT / 2
  };
}

function lineRectIntersection(x1, y1, x2, y2, box) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const candidates = [];
  const addCandidate = (t, x, y) => {
    if (
      t >= 0
      && t <= 1
      && x >= box.left - 0.1
      && x <= box.right + 0.1
      && y >= box.top - 0.1
      && y <= box.bottom + 0.1
    ) {
      candidates.push({ t, x, y });
    }
  };
  if (Math.abs(dx) > 0.001) {
    for (const x of [box.left, box.right]) {
      const t = (x - x1) / dx;
      addCandidate(t, x, y1 + t * dy);
    }
  }
  if (Math.abs(dy) > 0.001) {
    for (const y of [box.top, box.bottom]) {
      const t = (y - y1) / dy;
      addCandidate(t, x1 + t * dx, y);
    }
  }
  candidates.sort((left, right) => left.t - right.t);
  const first = candidates[0];
  return first ? { x: first.x, y: first.y } : null;
}

function connectorSideForPackedLabel(anchorX, centerX, width, preferredSide = "") {
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const edgeTolerance = 10;
  if (preferredSide === "left" && anchorX <= left + edgeTolerance) return "left";
  if (preferredSide === "right" && anchorX >= right - edgeTolerance) return "right";
  if (anchorX < left) return "left";
  if (anchorX > right) return "right";
  return "";
}

function connectorTargetXForLabel(label, connectorBox) {
  const edgeTolerance = 10;
  if (label.anchorX >= connectorBox.left && label.anchorX <= connectorBox.right) return label.anchorX;
  if (label.connectorSide === "left" && label.anchorX <= connectorBox.left + edgeTolerance) return connectorBox.left;
  if (label.connectorSide === "right" && label.anchorX >= connectorBox.right - edgeTolerance) return connectorBox.right;
  return clamp(label.anchorX, connectorBox.left, connectorBox.right);
}

function radialConnectorForLabel(label, x, y, visualBox) {
  const connector = lineRectIntersection(label.anchorX, label.anchorY, x, y, visualBox);
  if (connector) return connector;
  return {
    x: clamp(x, visualBox.left, visualBox.right),
    y: clamp(y, visualBox.top, visualBox.bottom)
  };
}

function labelGeometry(label, x = label.x, y = label.y) {
  const hitWidth = labelTextWidth(label.text);
  const visualWidth = Math.max(12, Math.min(hitWidth, Number(label.visualWidth) || labelInkWidth(label.text) + LABEL_VISUAL_PADDING * 2));
  const align = label.align || "middle";
  const hitLeft = align === "end" ? x - hitWidth : align === "middle" ? x - hitWidth / 2 : x;
  const textX = align === "end" ? x - 9 : align === "middle" ? x : x + 9;
  const visualLeft = align === "end"
    ? textX + LABEL_VISUAL_PADDING - visualWidth
    : align === "middle"
      ? x - visualWidth / 2
      : textX - LABEL_VISUAL_PADDING;
  const visualBox = {
    left: visualLeft,
    right: visualLeft + visualWidth,
    top: y - LABEL_BOX_HEIGHT / 2,
    bottom: y + LABEL_BOX_HEIGHT / 2
  };
  const hitBox = {
    left: Math.min(hitLeft - 4, visualBox.left),
    right: Math.max(hitLeft + hitWidth + 4, visualBox.right),
    top: visualBox.top,
    bottom: visualBox.bottom
  };
  if (label.connectorMode === "radial") {
    const connector = radialConnectorForLabel(label, x, y, visualBox);
    return { hitBox, visualBox, connector, textX, visualWidth };
  }
  const connectorTargetX = connectorTargetXForLabel(label, visualBox);
  const connector = lineRectIntersection(label.anchorX, label.anchorY, connectorTargetX, y, visualBox) ?? {
    x: clamp(label.anchorX, visualBox.left, visualBox.right),
    y: clamp(label.anchorY, visualBox.top, visualBox.bottom)
  };
  return { hitBox, visualBox, connector, textX, visualWidth };
}

function buildLinearLabels(record, rows, palette, paletteName, density, excludeIds = new Set(), colorMode = "type") {
  const labels = [];
  const features = chooseLabelFeatures(record, density, excludeIds, record.forceLabelIds);
  const laneCount = density === "low" ? 2 : density === "high" ? LINEAR_LABEL_LANES.length : 4;
  const padding = density === "high" ? 5 : 8;
  const maxShift = density === "low" ? 48 : density === "high" ? 180 : 110;
  for (const row of rows) {
    const rowFeatures = features.filter((feature) => feature.end >= row.start && feature.start <= row.end);
    const laneLeftBound = row.x - LINEAR_WRAP_EDGE_LABEL_BLEED;
    const laneRightBound = row.x + row.width + LINEAR_WRAP_EDGE_LABEL_BLEED;
    const lanes = LINEAR_LABEL_LANES.slice(0, laneCount).map((offset) => ({
      y: row.y + offset,
      items: []
    }));
    const sorted = [...rowFeatures].sort((left, right) => {
      const leftForced = record.forceLabelIds?.has(left.id) ? 1 : 0;
      const rightForced = record.forceLabelIds?.has(right.id) ? 1 : 0;
      return (rightForced - leftForced)
        || ((right.priority ?? 1) - (left.priority ?? 1))
        || (featureMidpoint(left) - featureMidpoint(right));
    });
    for (const feature of sorted) {
      const mid = Math.max(row.start, Math.min(row.end, featureMidpoint(feature)));
      const anchorX = rowX(row, mid);
      const anchorY = row.y + LINEAR_AXIS_Y;
      const text = feature.label || feature.type;
      const width = labelTextWidth(text) + 8;
      const visualWidth = labelInkWidth(text) + LABEL_VISUAL_PADDING * 2;
      const forced = record.forceLabelIds?.has(feature.id);
      const nearLeftEdge = anchorX < row.x + LINEAR_WRAP_EDGE_LABEL_ZONE;
      const nearRightEdge = anchorX > row.x + row.width - LINEAR_WRAP_EDGE_LABEL_ZONE;
      const edgeSide = nearLeftEdge ? "left" : nearRightEdge ? "right" : "";
      const desiredX = nearLeftEdge
        ? anchorX + visualWidth / 2
        : nearRightEdge
          ? anchorX - visualWidth / 2
          : anchorX;
      const candidate = {
        id: `auto:${feature.id}:${row.index}`,
        text,
        feature,
        desiredX: clamp(desiredX, laneLeftBound + width / 2, laneRightBound - width / 2),
        anchorX,
        anchorY,
        width,
        visualWidth,
        forced,
        priority: feature.priority ?? 1,
        color: colorForFeatureDisplay(feature, palette, paletteName, colorMode),
        edgeSide
      };
      let best = null;
      for (const [laneIndex, lane] of lanes.entries()) {
        const packed = packHorizontalLabelLane([...lane.items, candidate], laneLeftBound, laneRightBound, padding);
        if (!packed) continue;
        const packedCandidate = packed.items.find((item) => item.id === candidate.id);
        const packedX = packedCandidate?.x ?? candidate.desiredX;
        const shiftFromDesired = Math.abs(packedX - candidate.desiredX);
        const connectorDrift = Math.max(0, Math.abs(packedX - anchorX) - candidate.width / 2);
        if (!candidate.forced && shiftFromDesired > maxShift) continue;
        const cost = shiftFromDesired * 3 + connectorDrift * 4 + packed.totalShift + laneIndex * 24 + lane.items.length * 5;
        if (!best || cost < best.cost) {
          best = { lane, packed, cost };
        }
      }
      if (best) {
        best.lane.items = best.packed.items;
      }
    }
    for (const lane of lanes) {
      for (const item of lane.items) {
        labels.push({
          id: item.id,
          featureId: item.feature.id,
          kind: "suggested",
          text: item.text,
          anchorX: item.anchorX,
          anchorY: item.anchorY,
          x: item.x,
          y: lane.y,
          align: "middle",
          color: item.color,
          width: item.width,
          visualWidth: item.visualWidth,
          connectorSide: connectorSideForPackedLabel(item.anchorX, item.x, item.visualWidth, item.edgeSide)
        });
      }
    }
  }
  return labels.sort((left, right) => left.anchorY - right.anchorY || left.y - right.y || left.x - right.x);
}

function buildInsideLabelCandidates(record, density) {
  return new Set(chooseLabelFeatures(record, density, new Set(), record.forceLabelIds).map((feature) => feature.id));
}

function buildCircularLabels(record, geometry, palette, paletteName, density, excludeIds = new Set(), colorMode = "type") {
  const selected = chooseLabelFeatures(record, density, excludeIds, record.forceLabelIds)
    .map((feature) => {
      const angle = angleFor(featureMidpoint(feature), record.length);
      const anchor = point(geometry.cx, geometry.cy, geometry.anchorRadius, angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const text = feature.label || feature.type;
      return {
        id: `auto:${feature.id}`,
        featureId: feature.id,
        text,
        angle,
        anchorX: anchor.x,
        anchorY: anchor.y,
        ux: cos,
        uy: sin,
        priority: feature.priority ?? 1,
        forced: record.forceLabelIds?.has(feature.id),
        labelLength: String(text).length,
        color: colorForFeatureDisplay(feature, palette, paletteName, colorMode),
        width: labelTextWidth(text) + 8,
        visualWidth: labelInkWidth(text) + LABEL_VISUAL_PADDING * 2,
        connectorMode: "radial"
      };
    });
  const labels = [];
  const placedBoxes = [];
  const minCenterX = CIRCULAR_LABEL_MARGIN;
  const maxCenterX = geometry.width - CIRCULAR_LABEL_MARGIN;
  const minCenterY = geometry.top + LABEL_BOX_HEIGHT / 2;
  const maxCenterY = geometry.height - LABEL_BOX_HEIGHT / 2 - 18;
  const baseRadius = geometry.axisRadius + CIRCULAR_LABEL_LEADER_GAP;
  const radiusStep = density === "high" ? 12 : 16;
  const padding = density === "high" ? 4 : 6;
  const candidates = [...selected].sort((left, right) => {
    const leftForced = left.forced ? 1 : 0;
    const rightForced = right.forced ? 1 : 0;
    return (rightForced - leftForced)
      || ((right.priority ?? 1) - (left.priority ?? 1))
      || (left.angle - right.angle);
  });

  for (const item of candidates) {
    let maxRadius = Number.POSITIVE_INFINITY;
    const halfWidth = item.width / 2;
    if (item.ux > 0.001) maxRadius = Math.min(maxRadius, (maxCenterX - halfWidth - geometry.cx) / item.ux);
    if (item.ux < -0.001) maxRadius = Math.min(maxRadius, (minCenterX + halfWidth - geometry.cx) / item.ux);
    if (item.uy > 0.001) maxRadius = Math.min(maxRadius, (maxCenterY - geometry.cy) / item.uy);
    if (item.uy < -0.001) maxRadius = Math.min(maxRadius, (minCenterY - geometry.cy) / item.uy);
    if (!Number.isFinite(maxRadius) || maxRadius < baseRadius) continue;

    let placed = null;
    const radialBoxHalfExtent = Math.abs(item.ux) * item.width / 2 + Math.abs(item.uy) * LABEL_BOX_HEIGHT / 2;
    const itemBaseRadius = Math.max(baseRadius, geometry.axisRadius + radialBoxHalfExtent + 10);
    for (let radius = itemBaseRadius; radius <= maxRadius + 0.1; radius += radiusStep) {
      const x = geometry.cx + item.ux * radius;
      const y = geometry.cy + item.uy * radius;
      const box = makeCenteredLabelBox(x, y, item.width);
      if (placedBoxes.some((existing) => labelBoxesOverlap(box, existing, padding))) continue;
      placed = { x, y, box, radius };
      break;
    }
    if (!placed) continue;
    placedBoxes.push(placed.box);
    labels.push({
      ...item,
      kind: "suggested",
      x: placed.x,
      y: placed.y,
      align: "middle"
    });
  }
  return labels.sort((left, right) => left.angle - right.angle);
}

function drawLabel(svg, label, state) {
  const group = svgEl("g", {
    class: `genome-figure-label${state.selectedLabelId === label.id ? " selected" : ""}`,
    "data-label-id": label.id
  });
  const { hitBox, visualBox, connector, textX, visualWidth } = labelGeometry(label);
  let connectorLayer = svg.querySelector("[data-label-connector-layer='true']");
  if (!connectorLayer) {
    connectorLayer = svgEl("g", {
      class: "genome-figure-label-connectors",
      "data-label-connector-layer": "true",
      "pointer-events": "none"
    });
    svg.append(connectorLayer);
  }
  group.append(svgEl("rect", {
    x: hitBox.left.toFixed(1),
    y: hitBox.top.toFixed(1),
    width: (hitBox.right - hitBox.left).toFixed(1),
    height: LABEL_BOX_HEIGHT,
    fill: "transparent",
    "pointer-events": "all"
  }));
  const connectorAttrs = {
    x1: label.anchorX.toFixed(1),
    y1: label.anchorY.toFixed(1),
    x2: connector.x.toFixed(1),
    y2: connector.y.toFixed(1),
    stroke: label.color,
    "stroke-width": 1.25,
    "stroke-linecap": "round",
    "pointer-events": "none",
    "data-label-connector": "true",
    "data-label-connector-mode": label.connectorMode || "direct",
    opacity: 0.78
  };
  connectorLayer.append(svgEl("line", {
    ...connectorAttrs,
    "data-label-connector-visible": "true"
  }));
  group.append(svgEl("line", {
    ...connectorAttrs,
    opacity: 0
  }));
  if (state.labelBoxes) {
    group.append(svgEl("rect", {
      x: visualBox.left.toFixed(1),
      y: (label.y - LABEL_BOX_HEIGHT / 2).toFixed(1),
      width: visualWidth.toFixed(1),
      height: LABEL_BOX_HEIGHT,
      fill: state.palette.legendPanel || state.palette.paper,
      stroke: state.selectedLabelId === label.id ? (state.palette.selection || "#60a5fa") : state.palette.grid
    }));
  }
  group.append(textEl(label.text, {
    x: textX.toFixed(1),
    y: (label.y + 4).toFixed(1),
    "text-anchor": label.align,
    class: `genome-figure-label-text${state.labelBoxes ? "" : " genome-figure-label-text-bare"}`
  }));
  svg.append(group);
}

function isSuggestedLabel(label) {
  return label.kind === "suggested" || (!label.kind && String(label.id || "").startsWith("auto:"));
}

function isAddedLabel(label) {
  return !isSuggestedLabel(label);
}

function isLabelVisible(label, state) {
  return isSuggestedLabel(label)
    ? state.showSuggestedLabels !== false
    : state.showAddedLabels !== false;
}

function isLabelInCurrentFeatureSet(label, state) {
  const featureId = autoLabelFeatureId(label);
  return !featureId || !state.currentVisibleFeatureIds || state.currentVisibleFeatureIds.has(featureId);
}

function autoLabelFeatureId(label) {
  if (label?.featureId) return String(label.featureId);
  const id = String(label.id || "");
  if (!id.startsWith("auto:")) return "";
  const rest = id.slice(5);
  const rowSuffix = rest.match(/^(.*):\d+$/);
  return rowSuffix ? rowSuffix[1] : rest;
}

function manuallyPlacedFeatureLabelIds(labels) {
  return new Set((labels ?? [])
    .filter(isAddedLabel)
    .map(autoLabelFeatureId)
    .filter(Boolean));
}

function refreshFeatureLabelAnchors(labels, anchorsByLabelId, anchorsByFeatureId = new Map()) {
  for (const label of labels ?? []) {
    const featureId = autoLabelFeatureId(label);
    if (!featureId) continue;
    const anchor = anchorsByLabelId.get(label.id) ?? anchorsByFeatureId.get(featureId);
    if (!anchor) continue;
    const oldAnchorX = Number.isFinite(Number(label.anchorX)) ? Number(label.anchorX) : anchor.x;
    const oldAnchorY = Number.isFinite(Number(label.anchorY)) ? Number(label.anchorY) : anchor.y;
    const dx = anchor.x - oldAnchorX;
    const dy = anchor.y - oldAnchorY;
    label.anchorX = anchor.x;
    label.anchorY = anchor.y;
    if (isAddedLabel(label) && Math.hypot(dx, dy) > 0.001) {
      label.x = Number(label.x ?? anchor.x) + dx;
      label.y = Number(label.y ?? anchor.y) + dy;
    }
  }
}

function shouldUseInsideLabel(feature, labelCandidateIds, insideLabelIds) {
  return labelCandidateIds.has(feature.id) && !insideLabelIds.has(feature.id) && String(feature.label || "").trim().length > 0;
}

function normalizeRotationDegrees(value) {
  let degrees = Number(value) || 0;
  while (degrees > 180) degrees -= 360;
  while (degrees <= -180) degrees += 360;
  return degrees;
}

function safeSvgIdPart(value) {
  const safe = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "item";
}

export function getCircularInsideFeatureLabelPlacement({ cx, cy, radius, slotWidth, startAngle, endAngle, text }) {
  const label = String(text || "").trim();
  if (!label) return null;
  const bandHeight = Math.max(0, Number(slotWidth) || 0);
  if (bandHeight < INSIDE_FEATURE_LABEL_HEIGHT + 2) return null;
  const adjustedStart = Number(startAngle);
  let adjustedEnd = Number(endAngle);
  const centerRadius = Number(radius);
  if (!Number.isFinite(adjustedStart) || !Number.isFinite(adjustedEnd) || !Number.isFinite(centerRadius) || centerRadius <= 0) return null;
  while (adjustedEnd < adjustedStart) adjustedEnd += TAU;
  const arcWidth = Math.abs(adjustedEnd - adjustedStart) * centerRadius;
  const requiredWidth = estimateTextWidth(label, INSIDE_FEATURE_LABEL_FONT_SIZE) + INSIDE_FEATURE_LABEL_PADDING;
  if (arcWidth <= requiredWidth) return null;
  const midAngle = (adjustedStart + adjustedEnd) / 2;
  const labelPoint = point(cx, cy, centerRadius, midAngle);
  const availableHalfPathSpan = Math.max(0.001, (adjustedEnd - adjustedStart) / 2 - 0.006);
  const halfPathSpan = Math.min(
    Math.max(0.035, (requiredWidth / Math.max(1, centerRadius)) / 2),
    availableHalfPathSpan
  );
  const reverse = Math.sin(midAngle) > 0;
  const pathStartAngle = reverse ? midAngle + halfPathSpan : midAngle - halfPathSpan;
  const pathEndAngle = reverse ? midAngle - halfPathSpan : midAngle + halfPathSpan;
  return {
    cx,
    cy,
    x: labelPoint.x,
    y: labelPoint.y,
    angle: midAngle,
    rotation: normalizeRotationDegrees((midAngle * 180 / Math.PI) + 90),
    reverse,
    pathStartAngle,
    pathEndAngle,
    pathSweep: reverse ? 0 : 1,
    pathSpan: halfPathSpan * 2,
    arcWidth,
    requiredWidth,
    radius: centerRadius,
    innerRadius: centerRadius - bandHeight / 2,
    outerRadius: centerRadius + bandHeight / 2
  };
}

export function makeInsideFeatureLabelAttrs(x, y, options = {}) {
  const attrs = {
    x: Number(x).toFixed(1),
    y: Number(y).toFixed(1),
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "alignment-baseline": "middle",
    class: "genome-figure-inside-label"
  };
  if (options.transform) attrs.transform = options.transform;
  const contrastStyle = insideFeatureLabelContrastStyle(options.featureFill);
  if (contrastStyle) {
    attrs.style = contrastStyle;
    attrs["data-feature-fill"] = options.featureFill;
  }
  return attrs;
}

function drawInsideFeatureLabel(svg, text, x, y, options = {}) {
  svg.append(textEl(text, makeInsideFeatureLabelAttrs(x, y, options)));
}

function drawCircularInsideFeatureLabel(svg, text, placement, pathId, options = {}) {
  const labelPathId = `${pathId}-inside-label`;
  svg.append(pathEl(shortArcPath(
    placement.cx,
    placement.cy,
    placement.radius,
    placement.pathStartAngle,
    placement.pathEndAngle,
    placement.pathSweep
  ), {
    id: labelPathId,
    "data-inside-feature-label-path": "true",
    "data-radius": placement.radius.toFixed(2),
    "data-reversed": placement.reverse ? "true" : "false",
    fill: "none",
    stroke: "none",
    "pointer-events": "none"
  }));
  const textNode = textEl("", makeInsideFeatureLabelAttrs(placement.x, placement.y, options));
  textNode.setAttribute("data-inside-feature-label", "true");
  textNode.setAttribute("data-reversed", placement.reverse ? "true" : "false");
  textNode.removeAttribute("x");
  textNode.removeAttribute("y");
  textNode.removeAttribute("alignment-baseline");
  const textPath = svgEl("textPath", {
    href: `#${labelPathId}`,
    startOffset: "50%",
    "text-anchor": "middle"
  });
  textPath.textContent = text;
  textNode.append(textPath);
  svg.append(textNode);
}

function drawLinearFeatureGlyph(svg, feature, left, y, widthPx, height, color, state) {
  const opacity = clamp(Number(state.featureOpacity ?? DEFAULT_FEATURE_OPACITY) / 100, 0.2, 1);
  const common = {
    class: "genome-figure-feature-glyph",
    fill: color,
    stroke: "rgba(15, 23, 42, 0.28)",
    opacity
  };
  if (state.featureGlyph !== "directional" || !["+", "-"].includes(feature.strand) || widthPx < 13) {
    svg.append(svgEl("rect", {
      x: left,
      y: y - height / 2,
      width: Math.max(1.5, widthPx),
      height,
      ...common
    }));
    return;
  }
  const right = left + widthPx;
  const head = Math.min(15, Math.max(7, widthPx * 0.32));
  const top = y - height / 2;
  const bottom = y + height / 2;
  const mid = y;
  const points = feature.strand === "+"
    ? [[left, top], [right - head, top], [right, mid], [right - head, bottom], [left, bottom]]
    : [[right, top], [left + head, top], [left, mid], [left + head, bottom], [right, bottom]];
  svg.append(pathEl(`M ${points.map((point) => `${point[0].toFixed(1)} ${point[1].toFixed(1)}`).join(" L ")} Z`, common));
}

function drawCircularFeatureGlyph(svg, feature, cx, cy, radius, slotWidth, startAngle, endAngle, color, state) {
  const opacity = clamp(Number(state.featureOpacity ?? DEFAULT_FEATURE_OPACITY) / 100, 0.2, 1);
  svg.append(pathEl(annularPath(cx, cy, radius + slotWidth / 2, radius - slotWidth / 2, startAngle, endAngle), {
    class: "genome-figure-feature-glyph",
    fill: color,
    stroke: "rgba(15, 23, 42, 0.28)",
    "stroke-width": 0.8,
    opacity
  }));
  if (state.featureGlyph !== "directional" || !["+", "-"].includes(feature.strand)) return;
  let adjustedEnd = endAngle;
  while (adjustedEnd < startAngle) adjustedEnd += TAU;
  const arcWidth = Math.abs(adjustedEnd - startAngle) * radius;
  if (arcWidth < 16) return;
  const sign = feature.strand === "+" ? 1 : -1;
  const tipAngle = feature.strand === "+" ? adjustedEnd : startAngle;
  const baseAngle = tipAngle - sign * Math.min(0.05, Math.max(0.012, slotWidth / Math.max(1, radius) * 1.6));
  const tip = point(cx, cy, radius, tipAngle);
  const outerBase = point(cx, cy, radius + slotWidth / 2, baseAngle);
  const innerBase = point(cx, cy, radius - slotWidth / 2, baseAngle);
  svg.append(pathEl(`M ${outerBase.x.toFixed(1)} ${outerBase.y.toFixed(1)} L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L ${innerBase.x.toFixed(1)} ${innerBase.y.toFixed(1)} Z`, {
    fill: color,
    stroke: "rgba(15, 23, 42, 0.25)",
    "stroke-width": 0.6,
    opacity: Math.min(0.95, opacity + 0.08)
  }));
}

function circularPlotRadii(plots, plotBandHalfHeight) {
  const preferredOrder = new Map([
    ["gc-skew", 0],
    ["gc", 1]
  ]);
  return [...plots]
    .sort((left, right) => (preferredOrder.get(left.id) ?? 99) - (preferredOrder.get(right.id) ?? 99))
    .reduce((radii, plot, index) => ({
      ...radii,
      [plot.id]: CIRCULAR_INNER_PLOT_RADIUS + index * (plotBandHalfHeight * 2 + CIRCULAR_PLOT_GAP)
    }), {});
}

function drawCircularSlotDividers(svg, cx, cy, plotRadii, plotBandHalfHeight, featureBaseRadius, slotWidth, slotGap, slotCount, axisRadius, palette) {
  const plotDividerRadii = Object.values(plotRadii)
    .flatMap((radius) => [radius - plotBandHalfHeight - 8, radius + plotBandHalfHeight + 8])
    .filter((radius) => Number.isFinite(radius) && radius > 0);
  for (const radius of [...plotDividerRadii, featureBaseRadius - slotGap]) {
    svg.append(svgEl("circle", {
      cx,
      cy,
      r: radius,
      fill: "none",
      stroke: palette.grid,
      "stroke-width": 0.9,
      "stroke-dasharray": "3 5",
      opacity: 0.82
    }));
  }
  for (let slot = 0; slot <= slotCount; slot += 1) {
    const radius = featureBaseRadius - slotWidth / 2 - slotGap / 2 + slot * (slotWidth + slotGap);
    svg.append(svgEl("circle", {
      cx,
      cy,
      r: radius,
      fill: "none",
      stroke: palette.grid,
      "stroke-width": 0.9,
      opacity: 0.76
    }));
  }
}

function drawLinearSlotDividers(svg, row, axisY, plotTop, plots, slotWidth, slotStep, slotCount, palette) {
  for (let slot = 0; slot <= slotCount; slot += 1) {
    const y = axisY + LINEAR_FEATURE_TOP_OFFSET - slotStep / 2 + slot * slotStep;
    svg.append(svgEl("line", {
      x1: row.x,
      y1: y.toFixed(1),
      x2: row.x + row.width,
      y2: y.toFixed(1),
      stroke: palette.grid,
      "stroke-width": 0.9,
      opacity: 0.78
    }));
  }
  for (let index = 0; index <= plots.length; index += 1) {
    const plotStep = (row.plotBandWidth ?? DEFAULT_PLOT_BAND_WIDTH) + LINEAR_PLOT_GAP;
    const y = plotTop - 8 + index * plotStep;
    svg.append(svgEl("line", {
      x1: row.x,
      y1: y.toFixed(1),
      x2: row.x + row.width,
      y2: y.toFixed(1),
      stroke: palette.grid,
      "stroke-width": 0.9,
      "stroke-dasharray": "3 5",
      opacity: 0.74
    }));
  }
}

function circularPlotBandPath(cx, cy, baselineRadius, amplitude, startAngle, endAngle) {
  const outer = baselineRadius + Math.max(0, amplitude);
  const inner = baselineRadius + Math.min(0, amplitude);
  return annularPath(cx, cy, Math.max(outer, inner), Math.min(outer, inner), startAngle, endAngle);
}

function renderCircularPlotBand(svg, record, plot, radius, bandHalfHeight, state) {
  const values = plot.values ?? [];
  if (values.length < 2) return;
  const style = plotStyleFor(plot, state);
  const scale = plotScaleInfo(plot, state);
  svg.append(svgEl("circle", {
    cx: state.cx,
    cy: state.cy,
    r: radius,
    fill: "none",
    stroke: style.stroke,
    "stroke-width": 1,
    "stroke-dasharray": "4 5",
    opacity: 0.45,
    "data-plot-id": plot.id,
    "data-plot-scale-mode": scale.mode,
    "data-plot-min": formatPlotValue(scale.min),
    "data-plot-max": formatPlotValue(scale.max),
    "data-plot-baseline": formatPlotValue(scale.baseline),
    "data-plot-scale-span": formatPlotValue(scale.span),
    "data-plot-max-ratio": scale.maxRatio.toFixed(3),
    "data-plot-window-size": plot.windowSize ?? state.plotWindowSize
  }));
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    const next = values[index + 1];
    const previous = values[index - 1];
    const left = previous ? (previous.position + current.position) / 2 : 1;
    const right = next ? (current.position + next.position) / 2 : record.length;
    const delta = scaledPlotDelta(current.value, scale);
    const amplitude = delta * bandHalfHeight;
    if (Math.abs(amplitude) < 0.5) continue;
    svg.append(pathEl(circularPlotBandPath(state.cx, state.cy, radius, amplitude, angleFor(left, record.length), angleFor(right, record.length)), {
      fill: style.fill || style.stroke,
      opacity: 1,
      stroke: "none"
    }));
  }
  const labelPoint = point(state.cx, state.cy, radius, -Math.PI / 2);
}

function renderLinearPlotBand(svg, row, record, plot, y, height, state) {
  const values = plot.values ?? [];
  const rowPlot = values
    .map((value, index) => {
      const previous = values[index - 1];
      const next = values[index + 1];
      const left = previous ? Math.floor((previous.position + value.position) / 2) : 1;
      const right = next ? Math.floor((value.position + next.position) / 2) : record.length;
      return {
        ...value,
        left: Math.max(row.start, left),
        right: Math.min(row.end, right)
      };
    })
    .filter((value) => value.right >= row.start && value.left <= row.end && value.right >= value.left);
  if (rowPlot.length <= 1) return;
  const style = plotStyleFor(plot, state);
  const scale = plotScaleInfo(plot, state);
  const baselineY = y + height / 2;
  svg.append(svgEl("rect", { x: row.x, y, width: row.width, height, rx: 7, fill: state.palette.plotPanel || "rgba(226, 232, 240, 0.36)" }));
  svg.append(svgEl("line", {
    x1: row.x,
    y1: baselineY,
    x2: row.x + row.width,
    y2: baselineY,
    stroke: style.stroke,
    "stroke-width": 1,
    "stroke-dasharray": "4 5",
    opacity: 0.42,
    "data-plot-id": plot.id,
    "data-plot-scale-mode": scale.mode,
    "data-plot-min": formatPlotValue(scale.min),
    "data-plot-max": formatPlotValue(scale.max),
    "data-plot-baseline": formatPlotValue(scale.baseline),
    "data-plot-scale-span": formatPlotValue(scale.span),
    "data-plot-max-ratio": scale.maxRatio.toFixed(3),
    "data-plot-window-size": plot.windowSize ?? state.plotWindowSize
  }));
  const topPoints = [];
  for (const value of rowPlot) {
    const yValue = baselineY - scaledPlotDelta(value.value, scale) * (height * LINEAR_PLOT_AMPLITUDE_FRACTION);
    topPoints.push({ x: rowX(row, value.left), y: yValue });
    topPoints.push({ x: rowX(row, value.right), y: yValue });
  }
  const area = [
    `M ${row.x.toFixed(1)} ${baselineY.toFixed(1)}`,
    ...topPoints.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
    `L ${(row.x + row.width).toFixed(1)} ${baselineY.toFixed(1)}`,
    "Z"
  ].join(" ");
  svg.append(pathEl(area, { fill: style.fill || style.stroke, opacity: 1, stroke: "none" }));
  const line = topPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  svg.append(pathEl(line, { fill: "none", stroke: style.stroke, "stroke-width": 1.8 }));
}

function renderLegend(svg, types, palette, paletteName, x, y, options = {}) {
  const columns = options.columns ?? 1;
  const columnWidth = options.columnWidth ?? 138;
  const rowHeight = options.rowHeight ?? 22;
  const rows = Math.max(1, Math.ceil(types.length / columns));
  svg.append(svgEl("rect", {
    x: x - 14,
    y: y - 24,
    width: Math.min(columns, Math.max(1, types.length)) * columnWidth + 6,
    height: rows * rowHeight + 42,
    rx: 8,
    fill: palette.legendPanel || palette.paper,
    opacity: 1
  }));
  svg.append(textEl("Legend", { x, y, class: "genome-figure-legend-title" }));
  for (const [index, entry] of types.entries()) {
    const legendEntry = normalizeSlotLegendEntry(entry);
    const cursorX = x + (index % columns) * columnWidth;
    const cursorY = y + 23 + Math.floor(index / columns) * rowHeight;
    const color = colorForFeature(legendEntry.colorType, palette, paletteName);
    svg.append(svgEl("rect", { x: cursorX, y: cursorY - 11, width: 25, height: 12, rx: 3, fill: color }));
    svg.append(textEl(legendEntry.label, { x: cursorX + 34, y: cursorY, class: "genome-figure-legend-text" }));
  }
}

function normalizeSlotLegendEntry(entry) {
  if (typeof entry === "string") return { label: entry, colorType: entry, types: [entry] };
  return {
    label: entry.label,
    colorType: entry.colorType || entry.label,
    types: entry.types ?? [entry.label]
  };
}

function renderSlotLegend(svg, entries, palette, paletteName, x, y, options = {}) {
  const slots = entries.map(normalizeSlotLegendEntry);
  if (!slots.length) return;
  const title = options.title || "Feature slots";
  const width = options.width || 220;
  const colorMode = options.colorMode || "type";
  svg.append(svgEl("rect", {
    x: x - 14,
    y: y - 24,
    width,
    height: slots.length * 20 + 42,
    rx: 8,
    fill: palette.legendPanel || palette.paper,
    opacity: 1
  }));
  svg.append(textEl(title, { x, y, class: "genome-figure-legend-title" }));
  for (const [index, slot] of slots.entries()) {
    const cursorY = y + 23 + index * 20;
    svg.append(textEl(`Slot ${index + 1}`, { x, y: cursorY, class: "genome-figure-legend-text" }));
    svg.append(svgEl("rect", {
      x: x + 52,
      y: cursorY - 11,
      width: 25,
      height: 12,
      rx: 3,
      fill: colorForFeature(featureColorKey(slot.colorType, colorMode), palette, paletteName),
      "data-slot-legend-types": slot.types.join(",")
    }));
    svg.append(textEl(slot.label, {
      x: x + 86,
      y: cursorY,
      class: "genome-figure-legend-text",
      "data-slot-legend-label": slot.label,
      "data-slot-legend-types": slot.types.join(",")
    }));
  }
}

function renderPlotLegend(svg, plots, x, y, state = {}) {
  if (!plots.length) return;
  const rowHeight = state.plotScaleMode === "fit" ? 48 : 34;
  const rows = plots.length;
  const palette = state.palette || PALETTES.classic;
  svg.append(svgEl("rect", {
    x: x - 14,
    y: y - 24,
    width: 330,
    height: rows * rowHeight + 44,
    rx: 8,
    fill: palette.legendPanel || palette.paper || "#fbfdff",
    opacity: 1
  }));
  svg.append(textEl("Plots", { x, y, class: "genome-figure-legend-title" }));
  for (const [index, plot] of plots.entries()) {
    const style = plotStyleFor(plot, state);
    const scale = plotScaleInfo(plot, state);
    const cursorY = y + 24 + index * rowHeight;
    svg.append(svgEl("line", {
      x1: x,
      y1: cursorY - 4,
      x2: x + 34,
      y2: cursorY - 4,
      stroke: style.stroke,
      "stroke-width": 3,
      "stroke-linecap": "round"
    }));
    svg.append(svgEl("line", {
      x1: x,
      y1: cursorY + 4,
      x2: x + 34,
      y2: cursorY + 4,
      stroke: style.stroke,
      "stroke-width": 1,
      "stroke-dasharray": "4 4",
      opacity: 0.55
    }));
    svg.append(textEl(style.label, { x: x + 46, y: cursorY - 6, class: "genome-figure-legend-text" }));
    svg.append(textEl(plotBaselineDescription(plot, state), { x: x + 46, y: cursorY + 9, class: "genome-figure-legend-text genome-figure-legend-note" }));
    const scaleDescription = plotScaleDescription(plot, scale);
    if (scaleDescription) {
      svg.append(textEl(scaleDescription, {
        x: x + 46,
        y: cursorY + 24,
        class: "genome-figure-legend-text genome-figure-legend-note genome-figure-plot-scale-note",
        "data-plot-scale-note": plot.id
      }));
    }
  }
}

function drawContigBreaks(svg, record, row, palette, axisY) {
  if (!Array.isArray(record.contigs) || record.contigs.length <= 1) return;
  if (row.contig) {
    svg.append(textEl(row.contig.title, {
      x: row.x,
      y: axisY + 49,
      "text-anchor": "start",
      class: "genome-figure-contig-label"
    }));
    return;
  }
  for (const contig of record.contigs) {
    if (contig.end < row.start || contig.start > row.end) continue;
    const start = rowX(row, Math.max(row.start, contig.start));
    const end = rowX(row, Math.min(row.end, contig.end));
    svg.append(svgEl("line", {
      x1: start,
      y1: axisY + 15,
      x2: end,
      y2: axisY + 15,
      stroke: palette.axis,
      "stroke-width": 1.4,
      opacity: 0.72
    }));
    if (end - start > 130) {
      svg.append(textEl(contig.title, {
        x: (start + end) / 2,
        y: axisY + 52,
        "text-anchor": "middle",
        class: "genome-figure-contig-label"
      }));
    }
    if (contig.start > row.start && contig.start <= row.end) {
      const x = rowX(row, contig.start);
      svg.append(pathEl(`M ${x - 6} ${axisY - 14} L ${x - 1} ${axisY - 4} L ${x - 6} ${axisY + 6} M ${x + 1} ${axisY - 14} L ${x + 6} ${axisY - 4} L ${x + 1} ${axisY + 6}`, {
        fill: "none",
        stroke: palette.axis,
        "stroke-width": 1.5,
        "stroke-linecap": "round",
        opacity: 0.8
      }));
    }
  }
}

function drawCircularContigBoundaries(svg, record, geometry, palette) {
  if (!Array.isArray(record.contigs) || record.contigs.length <= 1) return;
  for (const contig of record.contigs) {
    const boundary = angleFor(contig.start, record.length);
    const p1 = point(geometry.cx, geometry.cy, geometry.radii.axis - 26, boundary);
    const p2 = point(geometry.cx, geometry.cy, geometry.radii.axis + 26, boundary);
    svg.append(svgEl("line", {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      stroke: palette.axis,
      "stroke-width": 2,
      "stroke-linecap": "round",
      opacity: 0.78
    }));
    const mid = angleFor((contig.start + contig.end) / 2, record.length);
    const labelPoint = point(geometry.cx, geometry.cy, geometry.radii.axis - 34, mid);
    if ((contig.end - contig.start + 1) / record.length > 0.035) {
      svg.append(textEl(contig.title, {
        x: labelPoint.x,
        y: labelPoint.y + 4,
        "text-anchor": "middle",
        class: "genome-figure-contig-label"
      }));
    }
  }
}

function drawCircularRulerLabel(svg, text, geometry, angle, radius, id) {
  const textWidth = estimateTextWidth(text, 12) + 8;
  const halfSpan = Math.max(0.035, Math.min(0.18, (textWidth / Math.max(1, radius)) / 2));
  const reverse = Math.sin(angle) > 0;
  const startAngle = reverse ? angle + halfSpan : angle - halfSpan;
  const endAngle = reverse ? angle - halfSpan : angle + halfSpan;
  const pathId = `${id}-axis-label`;
  svg.append(pathEl(shortArcPath(geometry.cx, geometry.cy, radius, startAngle, endAngle, reverse ? 0 : 1), {
    id: pathId,
    "data-ruler-label-path": "true",
    "data-radius": radius.toFixed(2),
    fill: "none",
    stroke: "none",
    "pointer-events": "none"
  }));
  const textNode = textEl("", {
    class: CIRCULAR_RULER_LABEL_CLASS,
    "data-ruler-label": "true",
    "dominant-baseline": "middle"
  });
  const textPath = svgEl("textPath", {
    href: `#${pathId}`,
    startOffset: "50%",
    "text-anchor": "middle"
  });
  textPath.textContent = text;
  textNode.append(textPath);
  svg.append(textNode);
}

function renderCircularRecord(record, state) {
  const width = state.figure.width || 1400;
  const height = width;
  const palette = state.palette;
  const cx = width / 2;
  const cy = height / 2 + 18;
  state.circularLabelSnapCenter = { x: cx, y: cy };
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": `${record.title} genome figure`,
    class: "genome-figure-svg"
  });
  appendFigureStyles(svg, palette);
  svg.append(svgEl("rect", { class: "genome-figure-paper", width, height, fill: palette.paper }));
  svg.append(textEl(record.title, { x: cx, y: 58, "text-anchor": "middle", class: "genome-figure-title" }));
  const features = getVisibleFeatures(record, state);
  state.currentVisibleFeatureIds = new Set(features.map((feature) => feature.id));
  const visibleTypes = Array.from(new Set(features.map((feature) => feature.type)));
  const slotGroups = featureSlotGroups(features, state.featureSlotGrouping);
  svg.append(textEl(`${record.length.toLocaleString()} bp · circular figure · ${features.length.toLocaleString()} shown features`, {
    x: cx,
    y: 88,
    "text-anchor": "middle",
    class: "genome-figure-subtitle"
  }));

  const plots = visiblePlots(record, state);
  const requestedSlotWidth = state.slotWidth ?? 17;
  const slotGap = 5;
  const stackedLayout = state.featureLayout === "non-overlap" ? getStackedFeatureLayout(record, features, 14, state) : null;
  const layoutSlotCount = state.featureLayout === "type-slots"
    ? Math.max(1, slotGroups.length)
    : Math.max(1, Math.min(14, stackedLayout?.slotCount ?? 1));
  const plotBandHalfHeight = Math.max(10, (state.plotBandWidth ?? DEFAULT_PLOT_BAND_WIDTH) / 2);
  const plotRadii = circularPlotRadii(plots, plotBandHalfHeight);
  const outerVisiblePlotRadius = plots.length
    ? Math.max(...plots.map((plot) => plotRadii[plot.id] ?? CIRCULAR_INNER_PLOT_RADIUS))
    : CIRCULAR_INNER_PLOT_RADIUS;
  const minFeatureBaseRadius = outerVisiblePlotRadius + (plots.length ? plotBandHalfHeight : 0) + 44;
  const desiredFeatureBaseRadius = 318 + Math.max(0, plotBandHalfHeight - DEFAULT_PLOT_BAND_WIDTH / 2);
  const maxAxisRadius = Math.min(560, width / 2 - LABEL_MAX_WIDTH - CIRCULAR_LABEL_LEADER_GAP - CIRCULAR_LABEL_MARGIN);
  const provisionalRulerBand = Math.max(30, Math.min(requestedSlotWidth, 24) + 14);
  const provisionalAxisFeatureGap = provisionalRulerBand + 12;
  const availableSlotWidth = (
    maxAxisRadius
    - provisionalAxisFeatureGap
    - minFeatureBaseRadius
    - Math.max(0, layoutSlotCount - 1) * slotGap
  ) / Math.max(1, layoutSlotCount - 0.5);
  const slotWidth = Math.max(4, Math.min(requestedSlotWidth, availableSlotWidth));
  const slotStep = slotWidth + slotGap;
  const circularRulerBand = Math.max(30, slotWidth + 14);
  const axisFeatureGap = circularRulerBand + 12;
  const featureBaseRadius = Math.max(minFeatureBaseRadius, Math.min(desiredFeatureBaseRadius, maxAxisRadius - axisFeatureGap - Math.max(0, layoutSlotCount - 1) * slotStep - slotWidth / 2));
  const featureOuterRadius = featureBaseRadius + Math.max(0, layoutSlotCount - 1) * slotStep + slotWidth / 2;
  const axisRadius = Math.min(maxAxisRadius, featureOuterRadius + axisFeatureGap);
  const rulerLabelRadius = featureOuterRadius + circularRulerBand * 0.62;
  const labelRadius = axisRadius + 82;
  const radii = { plot: outerVisiblePlotRadius, reverse: featureBaseRadius, axis: axisRadius };
  state.currentAnchorGeometry = { layout: "circular", cx, cy, axisRadius };
  const labelAnchorsById = new Map();
  const labelAnchorsByFeatureId = new Map();
  for (const feature of features) {
    const anchor = point(cx, cy, axisRadius, angleFor(featureMidpoint(feature), record.length));
    labelAnchorsById.set(`auto:${feature.id}`, anchor);
    labelAnchorsByFeatureId.set(feature.id, anchor);
  }
  refreshFeatureLabelAnchors(state.labels, labelAnchorsById, labelAnchorsByFeatureId);
  for (const plot of plots) {
    renderCircularPlotBand(svg, record, plot, plotRadii[plot.id] ?? 220, plotBandHalfHeight, { ...state, cx, cy });
  }
  if (state.showSlotDividers) {
    drawCircularSlotDividers(svg, cx, cy, plotRadii, plotBandHalfHeight, featureBaseRadius, slotWidth, slotGap, layoutSlotCount, axisRadius, palette);
  }
  svg.append(svgEl("circle", { cx, cy, r: radii.axis, fill: "none", stroke: palette.axis, "stroke-width": 2.4 }));
  const { majorStep, minorStep } = rulerSteps(record.length, tickTarget(state, "circular"));
  const majorTicks = tickPositions(1, record.length, majorStep, { includeOrigin: true });
  const majorTickSet = new Set(majorTicks);
  if (minorStep > 0) {
    for (const position of tickPositions(1, record.length, minorStep, { includeOrigin: false })) {
      if (majorTickSet.has(position)) continue;
      const angle = angleFor(position, record.length);
      const p1 = point(cx, cy, radii.axis - 4, angle);
      const p2 = point(cx, cy, radii.axis + 4, angle);
      svg.append(svgEl("line", {
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        stroke: palette.axis,
        "stroke-width": 0.8,
        "stroke-linecap": "round",
        opacity: 0.58,
        "data-ruler-tick": "minor",
        "data-ruler-layout": "circular"
      }));
    }
  }
  for (const position of majorTicks) {
    const angle = angleFor(position, record.length);
    const p1 = point(cx, cy, radii.axis - 8, angle);
    const p2 = point(cx, cy, radii.axis + 8, angle);
    svg.append(svgEl("line", {
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      stroke: palette.axis,
      "stroke-width": 1.2,
      "data-ruler-tick": "major",
      "data-ruler-layout": "circular"
    }));
    drawCircularRulerLabel(
      svg,
      formatPositionLabel(position, record.length),
      { cx, cy },
      angle,
      rulerLabelRadius,
      `${state.svgIdPrefix || "genome-figure"}-${position}`
    );
  }
  drawCircularContigBoundaries(svg, record, { cx, cy, radii }, palette);

  const labelCandidateIds = buildInsideLabelCandidates({ ...record, features, forceLabelIds: state.forceLabelIds }, state.labelDensity);
  const insideLabelIds = new Set();
  const insideLabelDraws = [];
  const ringFor = (feature) => {
    if (stackedLayout) return featureBaseRadius + slotForFeature(stackedLayout, feature) * slotStep;
    return featureBaseRadius + slotIndexForFeature(feature, slotGroups, state.featureSlotGrouping) * slotStep;
  };
  for (const feature of features) {
    const radius = ringFor(feature);
    const color = colorForFeatureDisplay(feature, palette, state.paletteName, state.featureColorMode);
    for (const [partIndex, part] of (feature.parts?.length ? feature.parts : [{ start: feature.start, end: feature.end }]).entries()) {
      const startAngle = angleFor(part.start, record.length);
      const endAngle = angleFor(part.end, record.length);
      drawCircularFeatureGlyph(svg, feature, cx, cy, radius, slotWidth, startAngle, endAngle, color, state);
      const labelPlacement = getCircularInsideFeatureLabelPlacement({
        cx,
        cy,
        radius,
        slotWidth,
        startAngle,
        endAngle,
        text: feature.label
      });
      if (shouldUseInsideLabel(feature, labelCandidateIds, insideLabelIds) && labelPlacement) {
        insideLabelDraws.push({
          label: feature.label,
          placement: labelPlacement,
          pathId: `${state.svgIdPrefix || "genome-figure"}-${safeSvgIdPart(feature.id)}-${partIndex}`,
          options: { featureFill: color }
        });
        insideLabelIds.add(feature.id);
      }
    }
  }
  for (const label of insideLabelDraws) {
    drawCircularInsideFeatureLabel(svg, label.label, label.placement, label.pathId, label.options);
  }

  if (state.showSuggestedLabels !== false && !state.labels.some(isSuggestedLabel)) {
    const externalLabelExcludes = new Set([...insideLabelIds, ...manuallyPlacedFeatureLabelIds(state.labels)]);
    state.labels = [
      ...state.labels,
      ...buildCircularLabels({ ...record, features, forceLabelIds: state.forceLabelIds }, {
        width,
        height,
        cx,
        cy,
        anchorRadius: axisRadius,
        labelRadius,
        axisRadius,
        top: 132
      }, palette, state.paletteName, state.labelDensity, externalLabelExcludes, state.featureColorMode)
    ];
  }
  for (const label of state.labels.filter((item) => isLabelVisible(item, state) && isLabelInCurrentFeatureSet(item, state))) drawLabel(svg, label, state);
  if (state.showLegend) {
    const legendY = 122;
    if (state.featureLayout === "type-slots") {
      renderSlotLegend(svg, slotGroups.slice(0, 14), palette, state.paletteName, 88, legendY, {
        title: "Feature slots (inner to outer)",
        width: 250,
        colorMode: state.featureColorMode
      });
    } else {
      renderLegend(svg, featureLegendEntries(features, state.featureColorMode).slice(0, 18), palette, state.paletteName, 88, legendY, { columns: 1, columnWidth: 130 });
    }
    renderPlotLegend(svg, plots, width - 400, legendY, state);
  }
  return svg;
}

function renderLinearRecord(record, state) {
  const width = state.figure.width || 1400;
  const palette = state.palette;
  const features = getVisibleFeatures(record, state);
  state.currentVisibleFeatureIds = new Set(features.map((feature) => feature.id));
  const visibleTypes = Array.from(new Set(features.map((feature) => feature.type)));
  const slotGroups = featureSlotGroups(features, state.featureSlotGrouping);
  const plots = visiblePlots(record, state);
  const plotBandWidth = state.plotBandWidth ?? DEFAULT_PLOT_BAND_WIDTH;
  const stackedLayout = state.featureLayout === "non-overlap" ? getStackedFeatureLayout(record, features, 8, state) : null;
  const linearSlotCount = state.featureLayout === "type-slots"
    ? Math.max(1, slotGroups.length)
    : Math.max(1, Math.min(8, stackedLayout?.slotCount ?? 1));
  const slotStep = Math.max(13, Math.min(22, (state.slotWidth ?? 17) + 4));
  const featureTrackBottomOffset = LINEAR_FEATURE_TOP_OFFSET + Math.max(0, linearSlotCount - 1) * slotStep + (state.slotWidth ?? 17) / 2;
  const plotTopOffset = LINEAR_AXIS_Y + featureTrackBottomOffset + 34;
  const plotStackHeight = plots.length ? plots.length * plotBandWidth + Math.max(0, plots.length - 1) * LINEAR_PLOT_GAP : 0;
  const rowHeight = Math.max(LINEAR_ROW_MIN_HEIGHT, plotTopOffset + plotStackHeight + LINEAR_ROW_BOTTOM_PADDING);
  const rows = makeLinearRows(record, width, rowHeight);
  state.currentAnchorGeometry = {
    layout: "linear",
    rows: rows.map((row) => ({
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      axisY: row.y + LINEAR_AXIS_Y
    }))
  };
  const height = rows.at(-1).y + rows.at(-1).height + 90;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": `${record.title} genome figure`,
    class: "genome-figure-svg"
  });
  appendFigureStyles(svg, palette);
  svg.append(svgEl("rect", { class: "genome-figure-paper", width, height, fill: palette.paper }));
  svg.append(textEl(record.title, { x: 82, y: 58, class: "genome-figure-title" }));
  const originalLength = record.sourceLength || record.length;
  const originalStart = (record.coordinateOffset || 0) + 1;
  const originalEnd = (record.coordinateOffset || 0) + record.length;
  const rangeSummary = record.coordinateOffset
    ? `${originalStart.toLocaleString()}-${originalEnd.toLocaleString()} bp shown of ${originalLength.toLocaleString()} bp`
    : `${record.length.toLocaleString()} bp`;
  svg.append(textEl(`${rangeSummary} · wrapped linear figure · ${features.length.toLocaleString()} shown features`, {
    x: 82,
    y: 88,
    class: "genome-figure-subtitle"
  }));
  const labelCandidateIds = buildInsideLabelCandidates({ ...record, features, forceLabelIds: state.forceLabelIds }, state.labelDensity);
  const insideLabelIds = new Set();
  const insideLabelDraws = [];
  const labelAnchorsById = new Map();
  const labelAnchorsByFeatureId = new Map();
  for (const row of rows) {
    svg.append(svgEl("rect", { class: "genome-figure-row-panel", x: row.x - 36, y: row.y - 38, width: row.width + 72, height: row.height, rx: 10, fill: palette.rowPanel || palette.panel, opacity: 0.82 }));
    const plotTop = row.y + plotTopOffset;
    row.plotBandWidth = plotBandWidth;
    const axisY = row.y + LINEAR_AXIS_Y;
    svg.append(svgEl("line", {
      x1: row.x,
      y1: axisY,
      x2: row.x + row.width,
      y2: axisY,
      stroke: palette.axis,
      "stroke-width": 2.2,
      "data-axis-line": "linear"
    }));
    const { majorStep, minorStep } = rulerSteps(row.end - row.start + 1, tickTarget(state, "linear"));
    const majorTicks = tickPositions(row.start, row.end, majorStep, { includeOrigin: row.start <= 1 });
    const majorTickSet = new Set(majorTicks);
    if (minorStep > 0) {
      for (const tick of tickPositions(row.start, row.end, minorStep, { includeOrigin: false })) {
        if (majorTickSet.has(tick)) continue;
        const x = rowX(row, tick);
        svg.append(svgEl("line", {
          x1: x,
          y1: axisY - 5,
          x2: x,
          y2: axisY + 5,
          stroke: palette.axis,
          "stroke-width": 0.75,
          "stroke-linecap": "round",
          opacity: 0.56,
          "data-ruler-tick": "minor",
          "data-ruler-layout": "linear"
        }));
      }
    }
    for (const tick of majorTicks) {
      const x = rowX(row, tick);
      svg.append(svgEl("line", {
        x1: x,
        y1: axisY - 8,
        x2: x,
        y2: axisY + 8,
        stroke: palette.axis,
        "stroke-width": 1,
        "data-ruler-tick": "major",
        "data-ruler-layout": "linear"
      }));
      svg.append(textEl(formatPositionLabel(tick + (record.coordinateOffset || 0), originalLength), {
        x,
        y: axisY + LINEAR_RULER_LABEL_OFFSET,
        "text-anchor": "middle",
        class: "genome-figure-axis-label",
        "data-ruler-label": "major",
        "data-ruler-layout": "linear"
      }));
      svg.append(svgEl("line", { x1: x, y1: row.y - 20, x2: x, y2: row.y + row.height - 42, stroke: palette.grid, "stroke-width": 0.8, opacity: 0.55 }));
    }
    for (const [plotIndex, plot] of plots.entries()) {
      renderLinearPlotBand(svg, row, record, plot, plotTop + plotIndex * (plotBandWidth + LINEAR_PLOT_GAP), plotBandWidth, state);
    }
    if (state.showSlotDividers) {
      const slotStep = Math.max(13, Math.min(22, (state.slotWidth ?? 17) + 4));
      drawLinearSlotDividers(svg, row, axisY, plotTop, plots, state.slotWidth ?? 17, slotStep, linearSlotCount, palette);
    }
    drawContigBreaks(svg, record, row, palette, axisY);
    for (const feature of features) {
      const parts = clipFeatureToRow(feature, row);
      if (!parts.length) continue;
      const labelMidpoint = Math.max(row.start, Math.min(row.end, featureMidpoint(feature)));
      const labelAnchor = { x: rowX(row, labelMidpoint), y: axisY };
      labelAnchorsById.set(`auto:${feature.id}:${row.index}`, labelAnchor);
      if (!labelAnchorsByFeatureId.has(feature.id)) labelAnchorsByFeatureId.set(feature.id, labelAnchor);
      const slot = stackedLayout ? slotForFeature(stackedLayout, feature) : slotIndexForFeature(feature, slotGroups, state.featureSlotGrouping);
      const y = stackedLayout
        ? axisY + LINEAR_FEATURE_TOP_OFFSET + slot * slotStep
        : axisY + LINEAR_FEATURE_TOP_OFFSET + slot * slotStep;
      const color = colorForFeatureDisplay(feature, palette, state.paletteName, state.featureColorMode);
      for (const part of parts) {
        const x1 = rowX(row, part.start);
        const x2 = rowX(row, part.end);
        const left = Math.min(x1, x2);
        const widthPx = Math.abs(x2 - x1);
        const featureSlotWidth = state.slotWidth ?? 17;
        drawLinearFeatureGlyph(svg, feature, left, y, Math.max(1.5, widthPx), featureSlotWidth, color, state);
        if (shouldUseInsideLabel(feature, labelCandidateIds, insideLabelIds) && featureSlotWidth >= INSIDE_FEATURE_LABEL_HEIGHT + 2 && widthPx > estimateTextWidth(feature.label, INSIDE_FEATURE_LABEL_FONT_SIZE) + INSIDE_FEATURE_LABEL_PADDING) {
          insideLabelDraws.push({ label: feature.label, x: left + widthPx / 2, y, options: { featureFill: color } });
          insideLabelIds.add(feature.id);
        }
      }
    }
  }
  for (const label of insideLabelDraws) {
    drawInsideFeatureLabel(svg, label.label, label.x, label.y, label.options);
  }
  refreshFeatureLabelAnchors(state.labels, labelAnchorsById, labelAnchorsByFeatureId);
  if (state.showSuggestedLabels !== false && !state.labels.some(isSuggestedLabel)) {
    const externalLabelExcludes = new Set([...insideLabelIds, ...manuallyPlacedFeatureLabelIds(state.labels)]);
    state.labels = [
      ...state.labels,
      ...buildLinearLabels({ ...record, features, forceLabelIds: state.forceLabelIds }, rows, palette, state.paletteName, state.labelDensity, externalLabelExcludes, state.featureColorMode)
    ];
  }
  for (const label of state.labels.filter((item) => isLabelVisible(item, state) && isLabelInCurrentFeatureSet(item, state))) drawLabel(svg, label, state);
  if (state.showLegend) {
    const legendY = 52;
    if (state.featureLayout === "type-slots") {
      renderSlotLegend(svg, slotGroups.slice(0, 14), palette, state.paletteName, width - 720, legendY, {
        title: "Feature slots (lower to upper)",
        width: 250,
        colorMode: state.featureColorMode
      });
    } else {
      renderLegend(svg, featureLegendEntries(features, state.featureColorMode).slice(0, 18), palette, state.paletteName, width - 720, legendY, { columns: 2, columnWidth: 118, rowHeight: 22 });
    }
    renderPlotLegend(svg, plots, width - 405, legendY, state);
  }
  return svg;
}

function serializeSvg(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  return new XMLSerializer().serializeToString(clone);
}

function downloadText(text, filename, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = addTimestampToFilename(filename);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSvg(svg, filename) {
  downloadText(serializeSvg(svg), filename, "image/svg+xml;charset=utf-8");
}

function downloadPng(svg, filename, scale) {
  const serialized = serializeSvg(svg);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    const exportScale = getPngExportScale(scale);
    canvas.width = Math.max(1, Math.round(svg.viewBox.baseVal.width * exportScale));
    canvas.height = Math.max(1, Math.round(svg.viewBox.baseVal.height * exportScale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = addTimestampToFilename(filename);
    link.click();
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

function makeButton(html, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = html;
  button.title = label;
  button.setAttribute("aria-label", label);
  return button;
}

function makeInlineHelp(helpText) {
  const text = String(helpText ?? "").trim();
  if (!text) return null;
  const help = document.createElement("span");
  help.className = "option-help genome-figure-option-help";
  help.tabIndex = 0;
  help.setAttribute("role", "button");
  help.setAttribute("aria-label", "Show option help");
  help.textContent = "?";
  const popover = document.createElement("span");
  popover.className = "option-help-popover genome-figure-option-help-popover";
  popover.setAttribute("aria-hidden", "true");
  popover.textContent = text;
  const positionPopover = () => positionInlineHelpPopover(help, popover);
  help.addEventListener("mouseenter", positionPopover);
  help.addEventListener("focus", positionPopover);
  help.addEventListener("click", positionPopover);
  return { help, popover };
}

function positionInlineHelpPopover(help, popover) {
  const margin = 12;
  const maxWidth = Math.min(384, Math.max(160, window.innerWidth - margin * 2));
  popover.style.width = `${maxWidth}px`;
  popover.style.maxWidth = `${maxWidth}px`;
  const helpRect = help.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const width = Math.min(popoverRect.width || maxWidth, maxWidth);
  const height = popoverRect.height || 80;
  const preferredLeft = helpRect.left;
  const preferredTop = helpRect.bottom + 8;
  const left = Math.min(
    Math.max(margin, preferredLeft),
    Math.max(margin, window.innerWidth - width - margin)
  );
  let top = preferredTop;
  if (top + height > window.innerHeight - margin) {
    top = helpRect.top - height - 8;
  }
  top = Math.min(
    Math.max(margin, top),
    Math.max(margin, window.innerHeight - height - margin)
  );
  popover.style.setProperty("--option-help-left", `${left}px`);
  popover.style.setProperty("--option-help-top", `${top}px`);
}

function makeSelect(labelText, choices, value, helpText = "") {
  const label = document.createElement("label");
  label.className = "genome-figure-control";
  const span = document.createElement("span");
  span.className = "genome-figure-control-label";
  span.textContent = labelText;
  const inlineHelp = makeInlineHelp(helpText);
  if (inlineHelp) {
    span.append(" ", inlineHelp.help, inlineHelp.popover);
  }
  const select = document.createElement("select");
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  select.value = value;
  label.append(span, select);
  return { label, select };
}

function makePaletteControl(value) {
  return makeSelect("Theme", [
    { value: "classic", label: "Classic" },
    { value: "aurora", label: "Aurora" },
    { value: "marine", label: "Marine" },
    { value: "orchard", label: "Orchard" },
    { value: "mono", label: "Mono" },
    { value: "midnight", label: "Midnight" },
    { value: "ember", label: "Ember" },
    { value: "blueprint", label: "Blueprint" }
  ], value);
}

function makeCheckboxGroup(labelText, choices, selectedValues) {
  const wrapper = document.createElement("fieldset");
  wrapper.className = "genome-figure-checkbox-group";
  if (labelText) {
    const legend = document.createElement("legend");
    legend.textContent = labelText;
    wrapper.append(legend);
  }
  for (const choice of choices) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = choice.value;
    input.checked = selectedValues.has(choice.value);
    label.append(input, document.createTextNode(` ${choice.label}`));
    wrapper.append(label);
  }
  return wrapper;
}

function makeCheckboxControl(text, checked = false) {
  const label = document.createElement("label");
  label.className = "genome-figure-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  label.append(input, document.createTextNode(` ${text}`));
  return { label, input };
}

function selectedCheckboxValues(group) {
  return new Set([...group.querySelectorAll("input[type='checkbox']")]
    .filter((input) => input.checked)
    .map((input) => input.value));
}

function makeFeatureTypeControl(types, visibleTypes) {
  const wrapper = document.createElement("div");
  wrapper.className = "genome-figure-feature-types";
  const heading = document.createElement("div");
  heading.className = "genome-figure-mini-heading";
  heading.textContent = "Feature types";
  const list = document.createElement("div");
  list.className = "genome-figure-feature-type-list";
  for (const type of types) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = type;
    input.checked = visibleTypes.has(type);
    label.append(input, document.createTextNode(` ${type}`));
    list.append(label);
  }
  wrapper.append(heading, list);
  return wrapper;
}

function makeRangeControl(labelText, min, max, value, unit = "") {
  const label = document.createElement("label");
  label.className = "genome-figure-range-control";
  const span = document.createElement("span");
  const valueLabel = document.createElement("output");
  valueLabel.textContent = `${value}${unit}`;
  span.append(document.createTextNode(labelText), valueLabel);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  label.append(span, input);
  return { label, input, valueLabel, unit };
}

function makeRegionControl(record, state) {
  const wrapper = document.createElement("div");
  wrapper.className = "genome-figure-region-control";
  const heading = document.createElement("div");
  heading.className = "genome-figure-mini-heading";
  heading.textContent = "Shown range";
  const fields = document.createElement("div");
  fields.className = "genome-figure-region-fields";
  const startLabel = document.createElement("label");
  startLabel.textContent = "Start";
  const startInput = document.createElement("input");
  startInput.type = "number";
  startInput.min = "1";
  startInput.max = String(record.length);
  startInput.step = "1";
  startInput.value = String(state.viewRangeStart);
  const endLabel = document.createElement("label");
  endLabel.textContent = "End";
  const endInput = document.createElement("input");
  endInput.type = "number";
  endInput.min = "1";
  endInput.max = String(record.length);
  endInput.step = "1";
  endInput.value = String(state.viewRangeEnd);
  startLabel.append(startInput);
  endLabel.append(endInput);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Whole";
  const summary = document.createElement("span");
  summary.className = "genome-figure-region-summary";
  fields.append(startLabel, endLabel, reset);
  wrapper.append(heading, fields, summary);
  return { wrapper, startInput, endInput, reset, summary };
}

function makeSearchControl(suggestions = []) {
  const wrapper = document.createElement("div");
  wrapper.className = "genome-figure-search-control";
  const label = document.createElement("label");
  label.textContent = "Find feature";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "gene, product, locus";
  const datalistId = `genome-figure-search-${Math.random().toString(36).slice(2)}`;
  input.setAttribute("list", datalistId);
  const datalist = document.createElement("datalist");
  datalist.id = datalistId;
  for (const suggestion of suggestions.slice(0, 400)) {
    const option = document.createElement("option");
    option.value = suggestion;
    datalist.append(option);
  }
  const count = document.createElement("span");
  count.textContent = "No search";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "Prev";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  const labelSelected = document.createElement("button");
  labelSelected.type = "button";
  labelSelected.textContent = "Label selected";
  const labelMatches = document.createElement("button");
  labelMatches.type = "button";
  labelMatches.textContent = "Label matches";
  const resultSelect = document.createElement("select");
  resultSelect.setAttribute("aria-label", "Feature search matches");
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "No matches";
  resultSelect.append(empty);
  label.append(input);
  const actions = document.createElement("div");
  actions.className = "genome-figure-search-actions";
  actions.append(previous, next, labelSelected, labelMatches);
  wrapper.append(label, datalist, resultSelect, actions, count);
  return { wrapper, input, resultSelect, previous, next, labelSelected, labelMatches, count };
}

function makeControlGroup(title, ...nodes) {
  const group = document.createElement("section");
  group.className = "genome-figure-control-group";
  const heading = document.createElement("h6");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "genome-figure-control-group-body";
  body.append(...nodes);
  group.append(heading, body);
  return group;
}

function makeSettingsTabs(tabs, initialId) {
  const wrapper = document.createElement("div");
  wrapper.className = "genome-figure-settings-tabs";
  const tabList = document.createElement("div");
  tabList.className = "genome-figure-tab-list";
  tabList.setAttribute("role", "tablist");
  const panels = document.createElement("div");
  panels.className = "genome-figure-tab-panels";
  const panelById = new Map();
  const buttonById = new Map();
  const tabPrefix = `genome-figure-settings-${Math.random().toString(36).slice(2)}`;

  const setActive = (activeId) => {
    for (const tab of tabs) {
      const active = tab.id === activeId;
      const button = buttonById.get(tab.id);
      const panel = panelById.get(tab.id);
      button?.setAttribute("aria-selected", String(active));
      button?.setAttribute("tabindex", active ? "0" : "-1");
      if (panel) {
        panel.hidden = !active;
      }
    }
  };

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "genome-figure-tab";
    button.id = `${tabPrefix}-${tab.id}-tab`;
    button.textContent = tab.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `${tabPrefix}-${tab.id}-panel`);
    button.addEventListener("click", () => setActive(tab.id));
    const panel = document.createElement("div");
    panel.className = "genome-figure-tab-panel";
    panel.id = `${tabPrefix}-${tab.id}-panel`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.append(tab.content);
    tabList.append(button);
    panels.append(panel);
    buttonById.set(tab.id, button);
    panelById.set(tab.id, panel);
  }

  wrapper.append(tabList, panels);
  setActive(initialId);
  return { wrapper, setActive };
}

function installFigureEditor(panel, figureRecord, figure) {
  const featureTypes = Array.from(new Set((figureRecord.features ?? []).map((feature) => feature.type)));
  const defaultVisibleTypes = new Set(featureTypes.filter(defaultFeatureTypeVisibility));
  if (defaultVisibleTypes.size === 0) {
    for (const type of featureTypes) defaultVisibleTypes.add(type);
  }
  const initialPlots = new Set(figure.plotMode === "gc"
    ? ["gc"]
    : figure.plotMode === "gc-skew"
      ? ["gc-skew"]
      : figure.plotMode === "none"
        ? []
        : ["gc", "gc-skew"]);
  const defaultPlotWindow = defaultPlotWindowSize(figureRecord.length || 1);
  const state = {
    figure,
    paletteName: figure.palette || "classic",
    palette: PALETTES[figure.palette] || PALETTES.classic,
    visiblePlots: initialPlots,
    gcBaselineMode: "average",
    plotScaleMode: DEFAULT_PLOT_SCALE_MODE,
    featureLayout: figure.featureLayout || "type-slots",
    featureSlotGrouping: figure.featureSlotGrouping || DEFAULT_FEATURE_SLOT_GROUPING,
    featureColorMode: figure.featureColorMode || "type",
    featureOpacity: DEFAULT_FEATURE_OPACITY,
    featureGlyph: "bands",
    labelDensity: figure.labelDensity || "medium",
    tickDensity: DEFAULT_TICK_DENSITY,
    visibleFeatureTypes: defaultVisibleTypes,
    figureWidth: figure.width || 1400,
    slotWidth: 17,
    plotBandWidth: DEFAULT_PLOT_BAND_WIDTH,
    plotWindowSize: defaultPlotWindow,
    viewRangeStart: 1,
    viewRangeEnd: figureRecord.length || 1,
    plotCache: new Map(),
    stackedLayoutCache: new Map(),
    featureLayoutVersion: 0,
    forceLabelIds: new Set(),
    showLegend: figure.showLegend !== false,
    showSlotDividers: false,
    showSuggestedLabels: true,
    showAddedLabels: true,
    labelBoxes: true,
    labels: [],
    labelHistory: [],
    selectedLabelId: "",
    svgIdPrefix: `genome-figure-${Math.random().toString(36).slice(2)}`
  };
  const toolbar = document.createElement("div");
  toolbar.className = "genome-figure-settings-rail";
  const titleBar = document.createElement("div");
  titleBar.className = "genome-figure-editor-titlebar";
  const titleText = document.createElement("div");
  titleText.className = "genome-figure-editor-title";
  titleText.textContent = figureRecord.title;
  const exportButtons = document.createElement("div");
  exportButtons.className = "dna-viewer-buttons genome-figure-export-buttons";
  const png = makeButton(ICONS.pngFile, "Download PNG");
  const svgButton = makeButton(ICONS.svgFile, "Download SVG");
  png.classList.add("dna-viewer-export-button");
  svgButton.classList.add("dna-viewer-export-button");
  exportButtons.append(png, svgButton);
  titleBar.append(titleText, exportButtons);

  const status = document.createElement("div");
  status.className = "dna-viewer-status";
  const figureControls = document.createElement("div");
  figureControls.className = "genome-figure-controls";
  const paletteControl = makePaletteControl(state.paletteName);
  const plotControl = makeCheckboxGroup("", [
    { value: "gc", label: "GC fraction" },
    { value: "gc-skew", label: "GC skew" }
  ], state.visiblePlots);
  const gcBaselineControl = makeSelect("GC fraction baseline", [
    { value: "average", label: "Sequence average" },
    { value: "half", label: "0.50" }
  ], state.gcBaselineMode);
  const plotScaleControl = makeSelect("Plot scale", [
    { value: "fixed", label: "Fixed biological scale" },
    { value: "fit", label: "Fit observed range" }
  ], state.plotScaleMode, "Fixed biological scale keeps GC fraction and GC skew comparable across figures. Fit observed range expands the plotted values to use the available plot band.");
  const featureLayoutControl = makeSelect("Feature layout", [
    { value: "non-overlap", label: "Pack into lanes" },
    { value: "type-slots", label: "Group by type" }
  ], state.featureLayout, "Pack into lanes assigns features to the first available lane so drawn feature glyphs do not collide. Group by type assigns lanes from feature type or slot grouping.");
  const featureSlotGroupingControl = makeSelect("Feature slot grouping", [
    { value: "types", label: "Separate types" },
    { value: "rna", label: "RNA types together" },
    { value: "families", label: "Feature families" }
  ], state.featureSlotGrouping, "Feature families groups related annotation types into broader lanes: CDS, RNA types, mobile elements, repeats, genes, and miscellaneous features.");
  const featureColorControl = makeSelect("Feature colors", [
    { value: "type", label: "By feature type" },
    { value: "family", label: "By feature family" }
  ], state.featureColorMode, "Feature family colors use the same broad buckets as feature-family slot grouping: CDS, RNA types, mobile elements, repeats, genes, and miscellaneous features.");
  const featureGlyphControl = makeSelect("Feature shape", [
    { value: "bands", label: "Bands" },
    { value: "directional", label: "Directional" }
  ], state.featureGlyph);
  const featureOpacityControl = makeRangeControl("Feature opacity", 35, 100, state.featureOpacity, "%");
  const densityControl = makeSelect("Label density", [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" }
  ], state.labelDensity);
  const slotWidthControl = makeRangeControl("Feature track width", 10, 26, state.slotWidth, " px");
  const tickDensityControl = makeRangeControl("Tick density", 3, 12, state.tickDensity, "");
  const regionControl = figure.layout === "linear" ? makeRegionControl(figureRecord, state) : null;
  const plotWindowControl = makeRangeControl(
    "Sliding window size",
    Math.min(24, state.plotWindowSize),
    Math.min(MAX_PLOT_WINDOW_SIZE, Math.max(state.plotWindowSize, nearestCommonPlotWindowSize(Math.ceil((figureRecord.length || 1) / 12), figureRecord.length || 1))),
    state.plotWindowSize,
    " bp"
  );
  plotWindowControl.valueLabel.textContent = `${formatWindowSize(state.plotWindowSize)}${plotWindowControl.unit}`;
  const plotWidthControl = makeRangeControl("Plot width", 24, MAX_PLOT_BAND_WIDTH, state.plotBandWidth, " px");
  const featureTypeControl = makeFeatureTypeControl(featureTypes, state.visibleFeatureTypes);
  const searchSuggestions = Array.from(new Set((figureRecord.features ?? [])
    .flatMap((feature) => [feature.label, feature.type, feature.source, feature.contigTitle])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  const searchControl = makeSearchControl(searchSuggestions);
  const legendToggle = makeCheckboxControl("Legend", state.showLegend);
  const slotDividerToggle = makeCheckboxControl("Slot dividers", state.showSlotDividers);
  const suggestedLabelsToggle = makeCheckboxControl("Suggested feature labels", state.showSuggestedLabels);
  const addedLabelsToggle = makeCheckboxControl("Added labels", state.showAddedLabels);
  const labelBoxToggle = makeCheckboxControl("Label boxes", state.labelBoxes);
  figureControls.append(
    makeControlGroup("Theme", paletteControl.label, legendToggle.label),
    makeControlGroup("Ruler", ...(regionControl ? [regionControl.wrapper] : []), tickDensityControl.label),
    makeControlGroup("Plots", plotControl, gcBaselineControl.label, plotScaleControl.label, plotWindowControl.label, plotWidthControl.label),
    makeControlGroup("Features", featureLayoutControl.label, featureSlotGroupingControl.label, featureColorControl.label, featureGlyphControl.label, featureOpacityControl.label, slotWidthControl.label, slotDividerToggle.label, featureTypeControl)
  );
  const editor = document.createElement("div");
  editor.className = "genome-figure-label-editor";
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.placeholder = "Select a label to edit";
  const applyText = document.createElement("button");
  applyText.type = "button";
  applyText.textContent = "Apply";
  const undoLabel = document.createElement("button");
  undoLabel.type = "button";
  undoLabel.textContent = "Undo";
  undoLabel.disabled = true;
  const deleteLabel = document.createElement("button");
  deleteLabel.type = "button";
  deleteLabel.textContent = "Remove";
  editor.append(textInput, applyText, undoLabel, deleteLabel);
  const labelTools = document.createElement("div");
  labelTools.className = "genome-figure-label-tools";
  labelTools.append(status, suggestedLabelsToggle.label, addedLabelsToggle.label, densityControl.label, labelBoxToggle.label, searchControl.wrapper);
  const selectedLabelGroup = makeControlGroup("Selected label", editor);
  const labelsGroup = makeControlGroup("Labels", labelTools);
  const labelsPanel = document.createElement("div");
  labelsPanel.className = "genome-figure-label-panel";
  labelsPanel.append(labelsGroup, selectedLabelGroup);
  const tabs = makeSettingsTabs([
    { id: "appearance", label: "Appearance", content: figureControls },
    { id: "labels", label: "Labels", content: labelsPanel }
  ], "appearance");
  toolbar.append(tabs.wrapper);

  const figureHost = document.createElement("div");
  figureHost.className = "genome-figure-host";
  const workspace = document.createElement("div");
  workspace.className = "genome-figure-workspace";
  let currentSvg = null;
  let drag = null;
  let currentSearchMatches = [];
  let currentSearchIndex = -1;

  function selectedLabel() {
    return state.labels.find((label) => label.id === state.selectedLabelId);
  }

  function pushLabelHistory() {
    state.labelHistory.push(JSON.stringify({
      labels: state.labels,
      forceLabelIds: [...state.forceLabelIds],
      selectedLabelId: state.selectedLabelId,
      showAddedLabels: state.showAddedLabels,
      showSuggestedLabels: state.showSuggestedLabels
    }));
    if (state.labelHistory.length > 60) {
      state.labelHistory.shift();
    }
    undoLabel.disabled = false;
  }

  function undoLabelChange() {
    const snapshot = state.labelHistory.pop();
    if (!snapshot) {
      return;
    }
    const previous = JSON.parse(snapshot);
    state.labels = previous.labels ?? [];
    state.forceLabelIds = new Set(previous.forceLabelIds ?? []);
    state.selectedLabelId = previous.selectedLabelId ?? "";
    state.showAddedLabels = previous.showAddedLabels !== false;
    state.showSuggestedLabels = previous.showSuggestedLabels !== false;
    addedLabelsToggle.input.checked = state.showAddedLabels;
    suggestedLabelsToggle.input.checked = state.showSuggestedLabels;
    undoLabel.disabled = state.labelHistory.length === 0;
    render();
  }

  function syncEditor() {
    const label = selectedLabel();
    textInput.value = label?.text ?? "";
    textInput.disabled = !label;
    applyText.disabled = !label;
    deleteLabel.disabled = !label;
    undoLabel.disabled = state.labelHistory.length === 0;
    status.textContent = label
      ? "Drag the selected label or edit its text. Right-click the figure to add a label."
      : "Right-click the figure to add a label. Click a label to edit or drag it.";
  }

  function currentDisplayRecord() {
    return displayRecordForState(figureRecord, state);
  }

  function syncRegionControl() {
    if (!regionControl) return;
    regionControl.startInput.value = String(state.viewRangeStart);
    regionControl.endInput.value = String(state.viewRangeEnd);
    const whole = state.viewRangeStart === 1 && state.viewRangeEnd === figureRecord.length;
    regionControl.summary.textContent = whole
      ? `${figureRecord.length.toLocaleString()} bp shown`
      : `${state.viewRangeStart.toLocaleString()}-${state.viewRangeEnd.toLocaleString()} of ${figureRecord.length.toLocaleString()} bp`;
  }

  function render() {
    figureHost.textContent = "";
    state.figure.width = state.figureWidth;
    const displayRecord = currentDisplayRecord();
    syncRegionControl();
    currentSvg = figure.layout === "linear" ? renderLinearRecord(displayRecord, state) : renderCircularRecord(displayRecord, state);
    figureHost.append(currentSvg);
    syncEditor();
  }

  function appendMissingForcedLabels() {
    const forcedIds = new Set([...state.forceLabelIds]);
    const existingFeatureIds = new Set();
    for (const label of state.labels) {
      const featureId = autoLabelFeatureId(label);
      if (forcedIds.has(featureId)) {
        label.kind = "added";
        existingFeatureIds.add(featureId);
      }
    }
    const previousLabels = state.labels;
    const previousShowSuggested = state.showSuggestedLabels;
    const displayRecord = currentDisplayRecord();
    state.labels = [];
    state.showSuggestedLabels = true;
    const generated = figure.layout === "linear" ? renderLinearRecord(displayRecord, state) : renderCircularRecord(displayRecord, state);
    generated.remove();
    const missing = state.labels
      .filter((label) => {
        const featureId = autoLabelFeatureId(label);
        return forcedIds.has(featureId) && !existingFeatureIds.has(featureId);
      })
      .map((label) => ({ ...label, kind: "added" }));
    state.labels = [...previousLabels, ...missing];
    state.showSuggestedLabels = previousShowSuggested;
  }

  function clearSuggestedLabels() {
    state.labels = state.labels.filter((label) => !isSuggestedLabel(label));
    if (state.selectedLabelId && !state.labels.some((label) => label.id === state.selectedLabelId)) {
      state.selectedLabelId = "";
    }
  }

  function invalidateFeatureLayout() {
    state.featureLayoutVersion += 1;
    state.stackedLayoutCache.clear();
  }

  function customAnchorForPoint(clickPoint) {
    const geometry = state.currentAnchorGeometry;
    if (geometry?.layout === "linear" && geometry.rows?.length) {
      const row = geometry.rows.reduce((best, current) => (
        Math.abs(current.axisY - clickPoint.y) < Math.abs(best.axisY - clickPoint.y) ? current : best
      ), geometry.rows[0]);
      return {
        x: clamp(clickPoint.x, row.x, row.x + row.width),
        y: row.axisY,
        layout: "linear"
      };
    }
    if (geometry?.layout === "circular") {
      const angle = Math.atan2(clickPoint.y - geometry.cy, clickPoint.x - geometry.cx);
      return {
        ...point(geometry.cx, geometry.cy, geometry.axisRadius, angle),
        layout: "circular",
        angle
      };
    }
    return { ...clickPoint, layout: figure.layout };
  }

  function initialCustomLabelPosition(clickPoint, anchor) {
    if (anchor.layout === "linear") {
      return {
        x: clamp(clickPoint.x + 72, anchor.x - 34, anchor.x + 120),
        y: clickPoint.y - 34
      };
    }
    const geometry = state.currentAnchorGeometry;
    if (geometry?.layout === "circular") {
      const vx = anchor.x - geometry.cx;
      const vy = anchor.y - geometry.cy;
      const length = Math.max(1, Math.hypot(vx, vy));
      const targetRadius = geometry.axisRadius + 94;
      return {
        x: geometry.cx + (vx / length) * targetRadius,
        y: geometry.cy + (vy / length) * targetRadius
      };
    }
    return { x: clickPoint.x + 90, y: clickPoint.y - 34 };
  }

  function addUserLabelAt(clickPoint) {
    pushLabelHistory();
    const anchor = customAnchorForPoint(clickPoint);
    const labelPoint = initialCustomLabelPosition(clickPoint, anchor);
    const id = `custom:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    state.labels.push({
      id,
      kind: "added",
      text: "Custom label",
      anchorX: anchor.x,
      anchorY: anchor.y,
      x: labelPoint.x,
      y: labelPoint.y,
      align: "middle",
      color: state.palette.features.custom,
      connectorSide: labelPoint.x > anchor.x ? "left" : labelPoint.x < anchor.x ? "right" : ""
    });
    state.selectedLabelId = id;
    state.showAddedLabels = true;
    addedLabelsToggle.input.checked = true;
    tabs.setActive("labels");
    render();
  }

  function promoteLabelToAdded(label) {
    if (!label) return;
    label.kind = "added";
    state.showAddedLabels = true;
    addedLabelsToggle.input.checked = true;
  }

  function pointerPoint(event) {
    const rect = currentSvg.getBoundingClientRect();
    const viewBox = currentSvg.viewBox.baseVal;
    return {
      x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
      y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height
    };
  }

  function snapDraggedLabel(label, x, y) {
    if (figure.layout === "linear") {
      return Math.abs(x - label.anchorX) <= LABEL_SNAP_TOLERANCE
        ? { x: label.anchorX, y }
        : { x, y };
    }
    const center = state.circularLabelSnapCenter;
    if (!center) return { x, y };
    const vx = label.anchorX - center.x;
    const vy = label.anchorY - center.y;
    const length = Math.hypot(vx, vy);
    if (length < 1) return { x, y };
    const ux = vx / length;
    const uy = vy / length;
    const px = x - center.x;
    const py = y - center.y;
    const projection = px * ux + py * uy;
    if (projection <= length) return { x, y };
    const snappedX = center.x + ux * projection;
    const snappedY = center.y + uy * projection;
    const distance = Math.hypot(x - snappedX, y - snappedY);
    return distance <= LABEL_SNAP_TOLERANCE
      ? { x: snappedX, y: snappedY }
      : { x, y };
  }

  figureHost.addEventListener("pointerdown", (event) => {
    const labelGroup = event.target.closest?.(".genome-figure-label");
    if (labelGroup) {
      const id = labelGroup.dataset.labelId;
      const label = state.labels.find((item) => item.id === id);
      if (!label) return;
      pushLabelHistory();
      promoteLabelToAdded(label);
      state.selectedLabelId = id;
      tabs.setActive("labels");
      const point = pointerPoint(event);
      drag = { id, dx: point.x - label.x, dy: point.y - label.y };
      figureHost.setPointerCapture?.(event.pointerId);
      syncEditor();
      event.preventDefault();
      return;
    }
    if (event.button === 0 && state.selectedLabelId && event.target.closest?.("svg")) {
      state.selectedLabelId = "";
      render();
    }
  });
  figureHost.addEventListener("contextmenu", (event) => {
    if (!currentSvg || !event.target.closest?.("svg") || event.target.closest?.(".genome-figure-label")) return;
    event.preventDefault();
    addUserLabelAt(pointerPoint(event));
  });
  figureHost.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const label = state.labels.find((item) => item.id === drag.id);
    if (!label) return;
    const point = pointerPoint(event);
    const snapped = snapDraggedLabel(label, point.x - drag.dx, point.y - drag.dy);
    label.x = snapped.x;
    label.y = snapped.y;
    render();
  });
  window.addEventListener("pointerup", () => {
    drag = null;
  });
  figureHost.addEventListener("dblclick", (event) => {
    const labelGroup = event.target.closest?.(".genome-figure-label");
    if (!labelGroup) return;
    state.selectedLabelId = labelGroup.dataset.labelId;
    tabs.setActive("labels");
    render();
    textInput.focus();
    textInput.select();
  });
  paletteControl.select.addEventListener("change", () => {
    state.paletteName = paletteControl.select.value;
    state.figure.palette = state.paletteName;
    state.palette = PALETTES[state.paletteName] || PALETTES.classic;
    clearSuggestedLabels();
    render();
  });
  plotControl.addEventListener("change", () => {
    state.visiblePlots = selectedCheckboxValues(plotControl);
    const hasGc = state.visiblePlots.has("gc");
    const hasGcSkew = state.visiblePlots.has("gc-skew");
    state.figure.plotMode = hasGc && hasGcSkew
      ? "both"
      : hasGc
        ? "gc"
        : hasGcSkew
          ? "gc-skew"
          : "none";
    clearSuggestedLabels();
    render();
  });
  plotWindowControl.input.addEventListener("input", () => {
    const min = Number.parseInt(plotWindowControl.input.min, 10) || 24;
    const max = Number.parseInt(plotWindowControl.input.max, 10) || Math.max(min, defaultPlotWindow);
    state.plotWindowSize = snapPlotWindowSize(plotWindowControl.input.value, min, max);
    plotWindowControl.input.value = String(state.plotWindowSize);
    plotWindowControl.valueLabel.textContent = `${formatWindowSize(state.plotWindowSize)}${plotWindowControl.unit}`;
    render();
  });
  plotWidthControl.input.addEventListener("input", () => {
    state.plotBandWidth = Number.parseInt(plotWidthControl.input.value, 10) || DEFAULT_PLOT_BAND_WIDTH;
    plotWidthControl.valueLabel.textContent = `${state.plotBandWidth}${plotWidthControl.unit}`;
    clearSuggestedLabels();
    render();
  });
  tickDensityControl.input.addEventListener("input", () => {
    state.tickDensity = Number.parseInt(tickDensityControl.input.value, 10) || DEFAULT_TICK_DENSITY;
    tickDensityControl.valueLabel.textContent = String(state.tickDensity);
    render();
  });
  if (regionControl) {
    const applyRegion = () => {
      const range = normalizeViewRange(figureRecord, regionControl.startInput.value, regionControl.endInput.value);
      state.viewRangeStart = range.start;
      state.viewRangeEnd = range.end;
      invalidateFeatureLayout();
      clearSuggestedLabels();
      updateSearchCount();
      render();
    };
    regionControl.startInput.addEventListener("change", applyRegion);
    regionControl.endInput.addEventListener("change", applyRegion);
    regionControl.reset.addEventListener("click", () => {
      state.viewRangeStart = 1;
      state.viewRangeEnd = figureRecord.length || 1;
      invalidateFeatureLayout();
      clearSuggestedLabels();
      updateSearchCount();
      render();
    });
  }
  gcBaselineControl.select.addEventListener("change", () => {
    state.gcBaselineMode = gcBaselineControl.select.value;
    render();
  });
  plotScaleControl.select.addEventListener("change", () => {
    state.plotScaleMode = plotScaleControl.select.value === "fixed" ? "fixed" : "fit";
    render();
  });
  featureLayoutControl.select.addEventListener("change", () => {
    state.featureLayout = featureLayoutControl.select.value;
    state.figure.featureLayout = state.featureLayout;
    invalidateFeatureLayout();
    clearSuggestedLabels();
    render();
  });
  featureSlotGroupingControl.select.addEventListener("change", () => {
    state.featureSlotGrouping = featureSlotGroupingControl.select.value || DEFAULT_FEATURE_SLOT_GROUPING;
    state.figure.featureSlotGrouping = state.featureSlotGrouping;
    clearSuggestedLabels();
    render();
  });
  featureColorControl.select.addEventListener("change", () => {
    state.featureColorMode = featureColorControl.select.value === "family" ? "family" : "type";
    state.figure.featureColorMode = state.featureColorMode;
    clearSuggestedLabels();
    render();
  });
  featureGlyphControl.select.addEventListener("change", () => {
    state.featureGlyph = featureGlyphControl.select.value;
    render();
  });
  featureOpacityControl.input.addEventListener("input", () => {
    state.featureOpacity = Number.parseInt(featureOpacityControl.input.value, 10) || DEFAULT_FEATURE_OPACITY;
    featureOpacityControl.valueLabel.textContent = `${state.featureOpacity}${featureOpacityControl.unit}`;
    render();
  });
  densityControl.select.addEventListener("change", () => {
    state.labelDensity = densityControl.select.value;
    state.figure.labelDensity = state.labelDensity;
    clearSuggestedLabels();
    render();
  });
  slotWidthControl.input.addEventListener("input", () => {
    state.slotWidth = Number.parseInt(slotWidthControl.input.value, 10) || 17;
    slotWidthControl.valueLabel.textContent = `${state.slotWidth}${slotWidthControl.unit}`;
    clearSuggestedLabels();
    render();
  });
  featureTypeControl.addEventListener("change", () => {
    const selected = selectedCheckboxValues(featureTypeControl);
    state.visibleFeatureTypes = selected.size ? selected : defaultVisibleTypes;
    invalidateFeatureLayout();
    clearSuggestedLabels();
    render();
  });
  function updateSearchCount() {
    const query = searchControl.input.value.trim().toLowerCase();
    searchControl.resultSelect.textContent = "";
    if (!query) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No matches";
      searchControl.resultSelect.append(option);
      searchControl.count.textContent = "No search";
      currentSearchMatches = [];
      currentSearchIndex = -1;
      return [];
    }
    const matches = getVisibleFeatures(currentDisplayRecord(), state)
      .filter((feature) => [feature.label, feature.type, feature.source, feature.contigTitle]
        .some((value) => String(value ?? "").toLowerCase().includes(query)));
    for (const [index, feature] of matches.slice(0, 100).entries()) {
      const option = document.createElement("option");
      option.value = String(index);
      const start = feature.sourceStart ?? feature.start;
      const end = feature.sourceEnd ?? feature.end;
      option.textContent = `${feature.label || feature.type} · ${feature.type} · ${start.toLocaleString()}-${end.toLocaleString()}`;
      searchControl.resultSelect.append(option);
    }
    if (matches.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No matches";
      searchControl.resultSelect.append(option);
    }
    searchControl.count.textContent = `${matches.length.toLocaleString()} match${matches.length === 1 ? "" : "es"}`;
    currentSearchMatches = matches;
    currentSearchIndex = matches.length ? 0 : -1;
    return matches;
  }
  searchControl.input.addEventListener("input", updateSearchCount);
  function labelSearchMatch(index) {
    if (!currentSearchMatches.length) updateSearchCount();
    if (!currentSearchMatches.length) return;
    currentSearchIndex = Math.max(0, Math.min(currentSearchMatches.length - 1, index));
    searchControl.resultSelect.value = String(Math.min(currentSearchIndex, 99));
    state.forceLabelIds.add(currentSearchMatches[currentSearchIndex].id);
    appendMissingForcedLabels();
    tabs.setActive("labels");
    render();
  }
  searchControl.resultSelect.addEventListener("change", () => {
    const index = Number.parseInt(searchControl.resultSelect.value, 10);
    if (Number.isFinite(index)) labelSearchMatch(index);
  });
  searchControl.previous.addEventListener("click", () => {
    if (!currentSearchMatches.length) updateSearchCount();
    if (!currentSearchMatches.length) return;
    labelSearchMatch((currentSearchIndex - 1 + currentSearchMatches.length) % currentSearchMatches.length);
  });
  searchControl.next.addEventListener("click", () => {
    if (!currentSearchMatches.length) updateSearchCount();
    if (!currentSearchMatches.length) return;
    labelSearchMatch((currentSearchIndex + 1) % currentSearchMatches.length);
  });
  searchControl.labelSelected.addEventListener("click", () => {
    const index = Number.parseInt(searchControl.resultSelect.value, 10);
    pushLabelHistory();
    labelSearchMatch(Number.isFinite(index) ? index : currentSearchIndex);
  });
  searchControl.labelMatches.addEventListener("click", () => {
    const matches = updateSearchCount().slice(0, 36);
    pushLabelHistory();
    for (const feature of matches) state.forceLabelIds.add(feature.id);
    appendMissingForcedLabels();
    tabs.setActive("labels");
    render();
  });
  legendToggle.input.addEventListener("change", () => {
    state.showLegend = legendToggle.input.checked;
    state.figure.showLegend = state.showLegend;
    render();
  });
  slotDividerToggle.input.addEventListener("change", () => {
    state.showSlotDividers = slotDividerToggle.input.checked;
    render();
  });
  suggestedLabelsToggle.input.addEventListener("change", () => {
    state.showSuggestedLabels = suggestedLabelsToggle.input.checked;
    render();
  });
  addedLabelsToggle.input.addEventListener("change", () => {
    state.showAddedLabels = addedLabelsToggle.input.checked;
    render();
  });
  labelBoxToggle.input.addEventListener("change", () => {
    state.labelBoxes = labelBoxToggle.input.checked;
    render();
  });
  applyText.addEventListener("click", () => {
    const label = selectedLabel();
    if (!label) return;
    pushLabelHistory();
    promoteLabelToAdded(label);
    label.text = textInput.value.trim() || label.text;
    render();
  });
  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyText.click();
  });
  deleteLabel.addEventListener("click", () => {
    if (!state.selectedLabelId) return;
    pushLabelHistory();
    state.labels = state.labels.filter((label) => label.id !== state.selectedLabelId);
    state.selectedLabelId = "";
    render();
  });
  undoLabel.addEventListener("click", undoLabelChange);
  png.addEventListener("click", () => {
    const stem = makeSafeFileStem(figureRecord.title, "genome-figure");
    downloadPng(currentSvg, `${stem}.png`);
  });
  svgButton.addEventListener("click", () => {
    const stem = makeSafeFileStem(figureRecord.title, "genome-figure");
    downloadSvg(currentSvg, `${stem}.svg`);
  });

  workspace.append(figureHost, toolbar);
  panel.append(titleBar, workspace);
  render();
}

export function renderGenomeFigure(container, figure) {
  container.classList.add("genome-figure-output");
  const records = Array.isArray(figure?.records) ? figure.records : [];
  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "dna-viewer-empty";
    empty.textContent = "No genome figure records were produced.";
    container.append(empty);
    return;
  }
  const figureRecord = aggregateRecords(records);
  const panel = document.createElement("section");
  panel.className = "dna-viewer-panel genome-figure-panel";
  container.append(panel);
  installFigureEditor(panel, figureRecord, figure);
}
