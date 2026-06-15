import "../vendor/d3/d3.min.js";
import { HEATMAP_LEGEND_LABEL_GAP, escapeXml, makeHeatmapPlotSpec, renderHeatmapPlotSvg } from "./plot-renderer.js";
import { findColumn, parseDelimitedTable } from "./table.js";

export const scatterPlotColumns = [
  { id: "label", label: "Label", type: "string" },
  { id: "x", label: "X", type: "number" },
  { id: "y", label: "Y", type: "number" },
  { id: "group", label: "Group", type: "string" }
];

export const histogramColumns = [
  { id: "bin_start", label: "Bin start", type: "number" },
  { id: "bin_end", label: "Bin end", type: "number" },
  { id: "count", label: "Count", type: "number" }
];

export const linePlotColumns = [
  { id: "label", label: "Label", type: "string" },
  { id: "x", label: "X", type: "number" },
  { id: "y", label: "Y", type: "number" },
  { id: "series", label: "Series", type: "string" }
];

export const barPlotColumns = [
  { id: "category", label: "Category", type: "string" },
  { id: "value", label: "Value", type: "number" },
  { id: "group", label: "Group", type: "string" }
];

export const boxPlotColumns = [
  { id: "group", label: "Group", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "min", label: "Min", type: "number" },
  { id: "q1", label: "Q1", type: "number" },
  { id: "median", label: "Median", type: "number" },
  { id: "q3", label: "Q3", type: "number" },
  { id: "max", label: "Max", type: "number" },
  { id: "whisker_low", label: "Whisker low", type: "number" },
  { id: "whisker_high", label: "Whisker high", type: "number" },
  { id: "outlier_count", label: "Outliers", type: "number" }
];

export const violinSummaryColumns = [
  { id: "group", label: "Group", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "min", label: "Min", type: "number" },
  { id: "q1", label: "Q1", type: "number" },
  { id: "median", label: "Median", type: "number" },
  { id: "mean", label: "Mean", type: "number" },
  { id: "q3", label: "Q3", type: "number" },
  { id: "max", label: "Max", type: "number" },
  { id: "bandwidth", label: "KDE bandwidth", type: "number" }
];

export const violinDensityColumns = [
  { id: "group", label: "Group", type: "string" },
  { id: "value", label: "Value", type: "number" },
  { id: "density", label: "Density", type: "number" },
  { id: "scaled_width", label: "Scaled width", type: "number" }
];

export const heatmapColumns = [
  { id: "x", label: "X", type: "string" },
  { id: "y", label: "Y", type: "string" },
  { id: "value", label: "Value", type: "number" },
  { id: "count", label: "Merged cells", type: "number" }
];

export const volcanoPlotColumns = [
  { id: "label", label: "Label", type: "string" },
  { id: "log2_fold_change", label: "log2 fold change", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "neg_log10_p", label: "-log10 p", type: "number" },
  { id: "class", label: "Class", type: "string" }
];

export const manhattanPlotColumns = [
  { id: "marker", label: "Marker", type: "string" },
  { id: "chromosome", label: "Chromosome", type: "string" },
  { id: "position", label: "Position", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "neg_log10_p", label: "-log10 p", type: "number" },
  { id: "plot_position", label: "Plot position", type: "number" },
  { id: "chromosome_center", label: "Chromosome label center", type: "number" },
  { id: "top_marker", label: "Top marker", type: "string" }
];

export const qqPlotColumns = [
  { id: "rank", label: "Rank", type: "number" },
  { id: "label", label: "Label", type: "string" },
  { id: "probability", label: "Plotting probability", type: "number" },
  { id: "theoretical_quantile", label: "Theoretical normal quantile", type: "number" },
  { id: "sample_quantile", label: "Sample quantile", type: "number" }
];

const COLORS = ["#2563eb", "#0f766e", "#a33a3a", "#7c3aed", "#d97706", "#0369a1", "#be123c", "#4b5563"];
const HEATMAP_VISUAL_CELL_LIMIT = 900;
const HEATMAP_CATEGORY_LIMIT = 80;
const DEFAULT_SCATTER_POINT_LIMIT = 5000;
const DEFAULT_LINE_POINT_LIMIT = 10000;
const DEFAULT_BOX_DOT_LIMIT = 1000;
const DEFAULT_VIOLIN_DOT_LIMIT = 1000;
const DEFAULT_VIOLIN_GRID_POINTS = 80;
const DEFAULT_BAR_LIMIT = 300;
const DEFAULT_VOLCANO_POINT_LIMIT = 10000;
const DEFAULT_MANHATTAN_POINT_LIMIT = 50000;
const DEFAULT_QQ_POINT_LIMIT = 10000;
const MANHATTAN_DEFAULT_COLORS = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#8B4513",
  "#4682B4",
  "#6A5ACD",
  "#FF6347",
  "#3CB371",
  "#87CEEB",
  "#D2691E",
  "#FF69B4"
];

export const GENERAL_PLOT_FOUNDATION = {
  name: "D3",
  packageName: "d3",
  version: "7.9.0",
  license: "ISC",
  browserAsset: "src/vendor/d3/d3.min.js"
};

function getD3() {
  return globalThis.d3 ?? null;
}

function asNumber(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function firstNumericColumns(columns, count) {
  return columns.filter((column) => column.type === "number").slice(0, count);
}

function firstStringColumns(columns, count) {
  return columns.filter((column) => column.type !== "number").slice(0, count);
}

function extent(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [0, 1];
  const d3Extent = getD3()?.extent?.(finite);
  let min = Number.isFinite(d3Extent?.[0]) ? d3Extent[0] : Math.min(...finite);
  let max = Number.isFinite(d3Extent?.[1]) ? d3Extent[1] : Math.max(...finite);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

function hasAxisLimitValue(value) {
  return String(value ?? "").trim() !== "";
}

function parseAxisLimit(value) {
  if (!hasAxisLimitValue(value)) return { provided: false, value: null };
  const number = Number(String(value).trim());
  return Number.isFinite(number)
    ? { provided: true, value: number }
    : { provided: true, value: null };
}

function applyAxisLimits(domain, options = {}, axis = "y") {
  const warnings = options.warnings;
  const axisLabel = axis.toUpperCase();
  const startAtZero = axis === "y" && options.yStartAtZero === true;
  const autoDomain = [
    startAtZero ? Math.min(0, domain[0]) : domain[0],
    startAtZero ? Math.max(0, domain[1]) : domain[1]
  ];
  const minOption = parseAxisLimit(options[`${axis}Min`]);
  const maxOption = parseAxisLimit(options[`${axis}Max`]);
  if (minOption.provided && minOption.value === null) {
    warnings?.push(`${axisLabel} minimum was ignored because it is not a finite number.`);
  }
  if (maxOption.provided && maxOption.value === null) {
    warnings?.push(`${axisLabel} maximum was ignored because it is not a finite number.`);
  }
  let min = minOption.value ?? autoDomain[0];
  let max = maxOption.value ?? autoDomain[1];
  if (min >= max) {
    if (minOption.value !== null && maxOption.value !== null) {
      warnings?.push(`${axisLabel} axis limits were ignored because the minimum is not less than the maximum.`);
      return autoDomain;
    }
    const span = Math.max(1, Math.abs(min || max || 1) * 0.05);
    if (minOption.value !== null) {
      max = min + span;
    } else {
      min = max - span;
    }
  }
  return [min, max];
}

export function axisRenderOptions(options = {}, warnings) {
  return {
    xMin: options.xMin,
    xMax: options.xMax,
    yMin: options.yMin,
    yMax: options.yMax,
    yStartAtZero: options.yStartAtZero === true,
    warnings
  };
}

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  const d3 = getD3();
  if (d3?.scaleLinear) {
    return d3.scaleLinear().domain([domainMin, domainMax]).range([rangeMin, rangeMax])(value);
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
  return Number(value.toFixed(3)).toString();
}

function makeAxisTicks(min, max, count = 5) {
  const d3 = getD3();
  if (d3?.ticks) {
    const ticks = d3.ticks(min, max, count);
    if (ticks.length > 0) {
      return ticks;
    }
  }
  if (d3?.scaleLinear) {
    const ticks = d3.scaleLinear().domain([min, max]).ticks(count);
    if (ticks.length > 0) {
      return ticks;
    }
  }
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function makeCountAxisTicks(max) {
  if (max <= 10) {
    return Array.from({ length: Math.floor(max) + 1 }, (_, index) => index);
  }
  return makeAxisTicks(0, max);
}

function clampBinCount(value) {
  return Math.max(1, Math.min(80, Math.round(value) || 1));
}

function autoHistogramBinCount(values, min, max) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finite.length <= 1 || min === max) {
    return 1;
  }
  const d3 = getD3();
  const d3Freedman = d3?.thresholdFreedmanDiaconis?.(finite, min, max);
  if (Number.isFinite(d3Freedman) && d3Freedman > 0) {
    return clampBinCount(d3Freedman);
  }
  const q1 = quantile(finite, 0.25);
  const q3 = quantile(finite, 0.75);
  const iqr = q3 - q1;
  if (Number.isFinite(iqr) && iqr > 0) {
    const binWidth = (2 * iqr) / Math.cbrt(finite.length);
    if (Number.isFinite(binWidth) && binWidth > 0) {
      return clampBinCount(Math.ceil((max - min) / binWidth));
    }
  }
  const d3Sturges = d3?.thresholdSturges?.(finite);
  if (Number.isFinite(d3Sturges) && d3Sturges > 0) {
    return clampBinCount(d3Sturges);
  }
  return clampBinCount(Math.ceil(Math.log2(finite.length) + 1));
}

function histogramBinCount(values, min, max, options = {}) {
  const binCountText = String(options.binCount ?? "").trim().toLowerCase();
  const shouldAuto = options.binMode === "auto" || binCountText === "auto" || binCountText === "";
  if (shouldAuto) {
    return autoHistogramBinCount(values, min, max);
  }
  return clampBinCount(Number.parseInt(options.binCount, 10) || 12);
}

function groupColor(group, groups) {
  return COLORS[Math.max(0, groups.indexOf(group)) % COLORS.length];
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) return Number.NaN;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function sampleStandardDeviation(values) {
  if (values.length < 2) return 0;
  const valueMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function defaultBandwidth(values, valueRange) {
  // Robust Silverman-style rule of thumb for Gaussian KDE bandwidth:
  // 0.9 * min(sample SD, IQR / 1.34) * n^(-1/5). See Silverman BW, 1986.
  if (values.length < 2) return Math.max(valueRange / 12, 1);
  const sorted = values.slice().sort((a, b) => a - b);
  const sd = sampleStandardDeviation(values);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const robustScale = iqr > 0 ? Math.min(sd || iqr / 1.34, iqr / 1.34) : sd;
  const scaleValue = robustScale > 0 ? robustScale : Math.max(valueRange / 8, 1);
  return Math.max(1e-9, 0.9 * scaleValue * values.length ** (-1 / 5));
}

function gaussianKernelDensity(values, grid, bandwidth) {
  const normalizer = values.length * bandwidth * Math.sqrt(2 * Math.PI);
  if (values.length === 0 || normalizer <= 0) {
    return grid.map((value) => ({ value, density: 0 }));
  }
  return grid.map((value) => {
    const total = values.reduce((sum, observed) => {
      const z = (value - observed) / bandwidth;
      return sum + Math.exp(-0.5 * z * z);
    }, 0);
    return { value, density: total / normalizer };
  });
}

function interpolateHex(a, b, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const parse = (value) => [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16)
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (start, end) => Math.round(start + (end - start) * clamped).toString(16).padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

function interpolateStops(stops, t) {
  const clamped = clamp(t, 0, 1);
  if (stops.length <= 1) return stops[0] ?? "#2563eb";
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return interpolateHex(stops[index], stops[index + 1], scaled - index);
}

function normalizeHeatmapColorScale(value) {
  return ["light-viridis", "viridis", "blue", "red-blue"].includes(value) ? value : "light-viridis";
}

function colorForValue(value, min, max, { colorScale = "light-viridis" } = {}) {
  if (!Number.isFinite(value)) return "#f1f5f9";
  const span = max - min || 1;
  const fraction = (value - min) / span;
  if (colorScale === "light-viridis") {
    return interpolateStops(["#f1f5f9", "#bbdbe0", "#48bb8f", "#fde725"], fraction);
  }
  if (colorScale === "red-blue") {
    const limit = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    if (value < 0) return interpolateHex("#b91c1c", "#f8fafc", (value + limit) / limit);
    return interpolateHex("#f8fafc", "#2563eb", value / limit);
  }
  if (colorScale === "blue") {
    return interpolateHex("#eff6ff", "#1d4ed8", fraction);
  }
  const d3 = getD3();
  if (d3?.scaleSequential) {
    const interpolator = colorScale === "blue"
      ? d3.interpolateBlues
      : colorScale === "red-blue"
        ? d3.interpolateRdBu
        : d3.interpolateViridis;
    if (interpolator) {
      if (colorScale === "red-blue") {
        const limit = Math.max(Math.abs(min), Math.abs(max), 1e-9);
        return interpolator(0.5 + clamp(value / (2 * limit), -0.5, 0.5));
      }
      return d3.scaleSequential(interpolator).domain([min, max])(value);
    }
  }
  return interpolateStops(["#440154", "#31688e", "#35b779", "#fde725"], fraction);
}

function orderValues(values, mode = "input") {
  const unique = [...new Set(values)];
  if (mode === "alphabetical") {
    return unique.sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
  }
  return unique;
}

function parsePositiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  const numeric = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function limitedRowsForSvg(rows, limit, warnings, label) {
  if (rows.length <= limit) {
    return rows;
  }
  warnings.push(`${label} SVG draws the first ${limit.toLocaleString()} row(s); the table output contains all ${rows.length.toLocaleString()} parsed row(s).`);
  return rows.slice(0, limit);
}

function evenlyLimitedRowsForSvg(rows, limit, warnings, label) {
  if (rows.length <= limit) {
    return rows;
  }
  warnings.push(`${label} SVG draws ${limit.toLocaleString()} evenly sampled point(s); the table output contains all ${rows.length.toLocaleString()} parsed row(s).`);
  if (limit <= 1) return rows.slice(0, 1);
  const sampled = [];
  for (let index = 0; index < limit; index += 1) {
    sampled.push(rows[Math.round((index * (rows.length - 1)) / (limit - 1))]);
  }
  return sampled;
}

function limitedManhattanRowsForSvg(rows, limit, warnings) {
  if (rows.length <= limit) {
    return rows;
  }
  warnings.push(`Manhattan plot SVG draws ${limit.toLocaleString()} evenly sampled point(s), plus top-marker labels when enabled; the point table contains all ${rows.length.toLocaleString()} parsed row(s).`);
  const sampled = evenlyLimitedRowsForSvg(rows, limit, [], "Manhattan plot");
  const byPosition = new Map(sampled.map((row) => [row.plot_position, row]));
  for (const row of rows) {
    if (row.top_marker === "yes") {
      byPosition.set(row.plot_position, row);
    }
  }
  return [...byPosition.values()].sort((left, right) => left.plot_position - right.plot_position);
}

function chromosomeSortKey(value) {
  const chromosome = String(value ?? "").trim();
  const match = /^(?:chr)?(\d+|x|y|mt)$/iu.exec(chromosome);
  if (!match) {
    return [4, chromosome.toLowerCase()];
  }
  const identifier = match[1].toUpperCase();
  if (/^\d+$/u.test(identifier)) {
    return [0, Number(identifier)];
  }
  if (identifier === "X") return [1, 23];
  if (identifier === "Y") return [2, 24];
  return [3, 25];
}

function compareChromosomes(left, right) {
  const leftKey = chromosomeSortKey(left);
  const rightKey = chromosomeSortKey(right);
  if (leftKey[0] !== rightKey[0]) return leftKey[0] - rightKey[0];
  if (typeof leftKey[1] === "number" && typeof rightKey[1] === "number") {
    return leftKey[1] - rightKey[1];
  }
  return String(leftKey[1]).localeCompare(String(rightKey[1]), undefined, { numeric: true });
}

function parseTextList(value) {
  return String(value ?? "")
    .split(/[\n,;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseColorList(value, fallback = MANHATTAN_DEFAULT_COLORS) {
  const colors = parseTextList(value)
    .filter((color) => /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu.test(color) || /^[a-z]+$/iu.test(color));
  return colors.length > 0 ? colors : fallback;
}

function parseSignificanceLines(value, warnings = []) {
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text.split(/[;\n]+/u).map((part) => part.trim()).filter(Boolean).map((part) => {
    const pieces = part.split(/[:,]/u).map((piece) => piece.trim()).filter(Boolean);
    const threshold = Number(pieces[0]);
    if (!Number.isFinite(threshold)) {
      warnings.push(`Ignored significance line "${part}" because the threshold is not numeric.`);
      return null;
    }
    return {
      threshold,
      color: pieces[1] || "#dc2626"
    };
  }).filter(Boolean);
}

function parseManhattanThresholdOption(value, fallback, label, color, warnings = []) {
  const candidate = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(candidate)) {
    warnings.push(`Ignored ${label} threshold because it is not numeric.`);
    return null;
  }
  if (candidate <= 0) {
    return null;
  }
  return { threshold: candidate, color };
}

function manhattanSignificanceLines(options, warnings = []) {
  if (options.significanceLines !== undefined) {
    return parseSignificanceLines(options.significanceLines, warnings);
  }
  return [
    parseManhattanThresholdOption(options.suggestiveThreshold, 5, "suggestive", "#16a34a", warnings),
    parseManhattanThresholdOption(options.genomeWideThreshold, 7.3, "genome-wide", "#dc2626", warnings)
  ].filter(Boolean);
}

export function inverseNormalCdf(probability) {
  const p = Number(probability);
  if (!(p > 0 && p < 1)) {
    return Number.NaN;
  }
  // Rational approximation by Peter J. Acklam, used here only to place
  // deterministic standard-normal reference quantiles for Q-Q plots.
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];
  const low = 0.02425;
  const high = 1 - low;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > high) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function makeScatterPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numeric = firstNumericColumns(table.columns, 2);
  const xColumn = findColumn(table.columns, options.xColumn) ?? numeric[0];
  const yColumn = findColumn(table.columns, options.yColumn) ?? numeric.find((column) => column.id !== xColumn?.id);
  const groupColumn = findColumn(table.columns, options.groupColumn);
  const labelColumn = findColumn(table.columns, options.labelColumn) ?? table.columns[0];
  const warnings = [...table.warnings];
  if (!xColumn || !yColumn) {
    warnings.push("Two numeric columns are required for a scatter plot.");
    return { table, rows: [], warnings, svg: renderEmptyPlot("Scatter plot", warnings) };
  }
  let skipped = 0;
  const rows = table.rows.map((row, index) => ({
    label: String(row[labelColumn?.id] ?? `Row ${index + 1}`),
    x: asNumber(row[xColumn.id]),
    y: asNumber(row[yColumn.id]),
    group: groupColumn ? String(row[groupColumn.id] ?? "") : "Data"
  })).filter((row) => {
    const keep = row.x !== null && row.y !== null;
    if (!keep) skipped += 1;
    return keep;
  });
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for both selected scatter axes.`);
  }
  if (rows.length === 0) {
    warnings.push("No rows had numeric values for both selected axes.");
  }
  const svgRows = limitedRowsForSvg(
    rows,
    parsePositiveInteger(options.maxPointsDrawn, DEFAULT_SCATTER_POINT_LIMIT, 100, 50000),
    warnings,
    "Scatter plot"
  );
  return {
    table,
    rows,
    warnings,
    svg: renderScatterSvg(svgRows, {
      title: options.title || "Scatter plot",
      xLabel: xColumn.label,
      yLabel: yColumn.label,
      showLegend: groupColumn !== null,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeVolcanoPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numeric = firstNumericColumns(table.columns, 2);
  const foldChangeColumn =
    findColumn(table.columns, options.foldChangeColumn) ??
    findColumn(table.columns, "log2_fold_change") ??
    findColumn(table.columns, "log2fc") ??
    numeric[0];
  const pValueColumn =
    findColumn(table.columns, options.pValueColumn) ??
    findColumn(table.columns, "adjusted_p_value") ??
    findColumn(table.columns, "padj") ??
    findColumn(table.columns, "p_value") ??
    numeric.find((column) => column.id !== foldChangeColumn?.id);
  const labelColumn =
    findColumn(table.columns, options.labelColumn) ??
    findColumn(table.columns, "gene_id") ??
    findColumn(table.columns, "gene") ??
    table.columns[0];
  const warnings = [...table.warnings];
  if (!foldChangeColumn || !pValueColumn) {
    warnings.push("A log2 fold-change column and a p-value column are required for a volcano plot.");
    return { table, rows: [], warnings, svg: renderEmptyPlot("Volcano plot", warnings) };
  }
  const foldChangeCutoff = Math.max(0, Number(options.foldChangeCutoff) || 1);
  const pValueCutoff = Math.min(1, Math.max(Number(options.pValueCutoff) || 0.05, Number.MIN_VALUE));
  let skipped = 0;
  const rows = table.rows.map((row, index) => {
    const log2FoldChange = asNumber(row[foldChangeColumn.id]);
    const pValue = asNumber(row[pValueColumn.id]);
    const label = String(row[labelColumn?.id] ?? `Row ${index + 1}`).trim() || `Row ${index + 1}`;
    if (log2FoldChange === null || pValue === null || pValue <= 0 || pValue > 1) {
      skipped += 1;
      return null;
    }
    const significant = pValue <= pValueCutoff && Math.abs(log2FoldChange) >= foldChangeCutoff;
    const direction = log2FoldChange >= foldChangeCutoff ? "up" : log2FoldChange <= -foldChangeCutoff ? "down" : "not significant";
    return {
      label,
      log2_fold_change: round(log2FoldChange),
      p_value: round(pValue, 10),
      neg_log10_p: round(-Math.log10(Math.max(pValue, Number.MIN_VALUE))),
      class: significant ? direction : "not significant"
    };
  }).filter(Boolean);
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without valid numeric log2 fold change and p value between 0 and 1.`);
  }
  if (rows.length === 0) {
    warnings.push("No rows had valid values for the selected volcano plot columns.");
  }
  const svgRows = limitedRowsForSvg(
    rows,
    parsePositiveInteger(options.maxPointsDrawn, DEFAULT_VOLCANO_POINT_LIMIT, 100, 100000),
    warnings,
    "Volcano plot"
  );
  return {
    table,
    rows,
    warnings,
    svg: renderVolcanoSvg(svgRows, {
      title: options.title || "Volcano plot",
      xLabel: foldChangeColumn.label,
      yLabel: `-log10(${pValueColumn.label})`,
      foldChangeCutoff,
      pValueCutoff,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeManhattanPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const chromosomeColumn =
    findColumn(table.columns, options.chromosomeColumn) ??
    findColumn(table.columns, "CHR") ??
    findColumn(table.columns, "chromosome") ??
    findColumn(table.columns, "chrom");
  const pValueColumn =
    findColumn(table.columns, options.pValueColumn) ??
    findColumn(table.columns, "P") ??
    findColumn(table.columns, "p_value") ??
    findColumn(table.columns, "pvalue");
  const markerColumn =
    findColumn(table.columns, options.markerColumn) ??
    findColumn(table.columns, "SNP") ??
    findColumn(table.columns, "marker") ??
    findColumn(table.columns, "id") ??
    table.columns[0];
  const requestedPosition = String(options.positionColumn ?? "BP").trim();
  const positionColumn = requestedPosition
    ? (findColumn(table.columns, requestedPosition) ?? findColumn(table.columns, "BP") ?? findColumn(table.columns, "position") ?? findColumn(table.columns, "pos"))
    : null;
  const warnings = [...table.warnings];
  if (!chromosomeColumn || !pValueColumn || !markerColumn) {
    warnings.push("Chromosome, p-value, and marker columns are required for a Manhattan plot.");
    return { table, rows: [], warnings, svg: renderEmptyPlot("Manhattan plot", warnings) };
  }
  if (requestedPosition && !positionColumn) {
    warnings.push(`Position column "${requestedPosition}" was not found; sequential positions were assigned within each chromosome.`);
  }

  const chromosomeFilter = parseTextList(options.plotChromosomes);
  const chromosomeFilterSet = chromosomeFilter.length > 0 ? new Set(chromosomeFilter.map(String)) : null;
  let skipped = 0;
  const rawRows = table.rows.map((row, index) => {
    const chromosome = String(row[chromosomeColumn.id] ?? "").trim();
    const pValue = asNumber(row[pValueColumn.id]);
    const position = positionColumn ? asNumber(row[positionColumn.id]) : null;
    const marker = String(row[markerColumn.id] ?? `Row ${index + 1}`).trim() || `Row ${index + 1}`;
    if (!chromosome || pValue === null || pValue <= 0 || pValue > 1) {
      skipped += 1;
      return null;
    }
    if (positionColumn && (position === null || position < 0 || !Number.isInteger(position))) {
      skipped += 1;
      return null;
    }
    return {
      marker,
      chromosome,
      inputPosition: position,
      pValue,
      inputIndex: index
    };
  }).filter(Boolean).filter((row) => !chromosomeFilterSet || chromosomeFilterSet.has(row.chromosome));

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without a chromosome, a p value in (0, 1], or a valid integer position when a position column was used.`);
  }
  if (chromosomeFilterSet && rawRows.length === 0) {
    warnings.push("No rows remained after applying the chromosome filter.");
  }
  if (rawRows.length === 0) {
    warnings.push("No rows had valid values for the selected Manhattan plot columns.");
  }

  const chromosomeOrder = chromosomeFilter.length > 0
    ? chromosomeFilter
    : [...new Set(rawRows.map((row) => row.chromosome))].sort(compareChromosomes);
  const orderRank = new Map(chromosomeOrder.map((chromosome, index) => [chromosome, index]));
  const withinChromosomeCount = new Map();
  const rowsWithPositions = rawRows.map((row) => {
    const next = (withinChromosomeCount.get(row.chromosome) ?? 0) + 1;
    withinChromosomeCount.set(row.chromosome, next);
    return {
      ...row,
      position: positionColumn ? row.inputPosition : next
    };
  }).sort((left, right) =>
    (orderRank.get(left.chromosome) ?? Number.MAX_SAFE_INTEGER) - (orderRank.get(right.chromosome) ?? Number.MAX_SAFE_INTEGER) ||
    left.position - right.position ||
    left.inputIndex - right.inputIndex
  );

  const chromosomeLengths = new Map();
  for (const row of rowsWithPositions) {
    chromosomeLengths.set(row.chromosome, Math.max(chromosomeLengths.get(row.chromosome) ?? 1, row.position));
  }
  const chromosomeOffsets = new Map();
  let cumulativePosition = 0;
  for (const chromosome of chromosomeOrder) {
    const length = chromosomeLengths.get(chromosome);
    if (!length) continue;
    chromosomeOffsets.set(chromosome, cumulativePosition);
    cumulativePosition += length;
  }

  const chromosomeStats = new Map();
  const rows = rowsWithPositions.map((row, index) => {
    const chromosomeLength = chromosomeLengths.get(row.chromosome) ?? 1;
    const chromosomeOffset = chromosomeOffsets.get(row.chromosome) ?? 0;
    const plotPosition = chromosomeOffset + row.position;
    const chromosomeCenter = chromosomeOffset + chromosomeLength / 2;
    const stats = chromosomeStats.get(row.chromosome) ?? {
      first: index,
      last: index,
      startPlot: chromosomeOffset,
      endPlot: chromosomeOffset + chromosomeLength,
      centerPlot: chromosomeCenter,
      maxRow: null
    };
    stats.last = index;
    const negLog = -Math.log10(Math.max(row.pValue, Number.MIN_VALUE));
    const tableRow = {
      marker: row.marker,
      chromosome: row.chromosome,
      position: row.position,
      p_value: round(row.pValue, 12),
      neg_log10_p: round(negLog),
      plot_position: round(plotPosition),
      chromosome_center: 0,
      top_marker: "no"
    };
    if (!stats.maxRow || tableRow.neg_log10_p > stats.maxRow.neg_log10_p) {
      stats.maxRow = tableRow;
    }
    chromosomeStats.set(row.chromosome, stats);
    return tableRow;
  });

  for (const stats of chromosomeStats.values()) {
    for (let index = stats.first; index <= stats.last; index += 1) {
      rows[index].chromosome_center = round(stats.centerPlot);
    }
    if (options.labelTopMarkers === true && stats.maxRow) {
      stats.maxRow.top_marker = "yes";
    }
  }

  const svgRows = limitedManhattanRowsForSvg(
    rows,
    parsePositiveInteger(options.maxPointsDrawn, DEFAULT_MANHATTAN_POINT_LIMIT, 1000, 500000),
    warnings
  );
  const significanceLines = manhattanSignificanceLines(options, warnings);
  return {
    table,
    rows,
    warnings,
    svg: renderManhattanSvg(svgRows, {
      title: options.title || "Manhattan Plot",
      xLabel: options.xLabel || "Chromosome",
      yLabel: options.yLabel || "-log10(p-value)",
      width: parsePositiveInteger(options.plotWidth, 1100, 640, 2400),
      height: parsePositiveInteger(options.plotHeight, 620, 420, 1600),
      pointRadius: Math.max(1, Math.min(12, Number(options.pointSize) || 4)),
      colors: parseColorList(options.colors),
      chromosomeStats,
      chromosomeOrder,
      significanceLines,
      labelTopMarkers: options.labelTopMarkers === true,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeQqPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numeric = firstNumericColumns(table.columns, 1);
  const valueColumn = findColumn(table.columns, options.valueColumn) ?? numeric[0];
  const labelColumn =
    findColumn(table.columns, options.labelColumn) ??
    findColumn(table.columns, "sample_id") ??
    findColumn(table.columns, "read_id") ??
    findColumn(table.columns, "id") ??
    table.columns[0];
  const warnings = [...table.warnings];
  if (!valueColumn) {
    warnings.push("A numeric value column is required for a Q-Q plot.");
    return { table, rows: [], warnings, svg: renderEmptyPlot("Q-Q plot", warnings) };
  }
  let skipped = 0;
  const values = table.rows.map((row, index) => {
    const value = asNumber(row[valueColumn.id]);
    if (value === null) {
      skipped += 1;
      return null;
    }
    const label = String(row[labelColumn?.id] ?? `Row ${index + 1}`).trim() || `Row ${index + 1}`;
    return { label, value };
  }).filter(Boolean)
    .sort((left, right) => left.value - right.value || String(left.label).localeCompare(String(right.label)));

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for the selected Q-Q plot column.`);
  }
  if (values.length === 0) {
    warnings.push("No numeric values were available for the selected Q-Q plot column.");
  } else if (values.length < 3) {
    warnings.push("Fewer than 3 numeric values were available; the Q-Q plot is only a rough visual check.");
  }

  const rows = values.map((row, index) => {
    const probability = (index + 0.5) / values.length;
    return {
      rank: index + 1,
      label: row.label,
      probability: round(probability, 8),
      theoretical_quantile: round(inverseNormalCdf(probability)),
      sample_quantile: round(row.value)
    };
  });
  const svgRows = evenlyLimitedRowsForSvg(
    rows,
    parsePositiveInteger(options.maxPointsDrawn, DEFAULT_QQ_POINT_LIMIT, 100, 100000),
    warnings,
    "Q-Q plot"
  );
  return {
    table,
    rows,
    warnings,
    svg: renderQqPlotSvg(svgRows, {
      title: options.title || "Normal Q-Q plot",
      xLabel: "Theoretical normal quantile",
      yLabel: valueColumn.label,
      valueLabel: valueColumn.label,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeLinePlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numeric = firstNumericColumns(table.columns, 2);
  const xColumn = findColumn(table.columns, options.xColumn) ?? numeric[0];
  const yColumn = findColumn(table.columns, options.yColumn) ?? numeric.find((column) => column.id !== xColumn?.id);
  const seriesColumn =
    findColumn(table.columns, options.seriesColumn) ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "treatment") ??
    findColumn(table.columns, "group");
  const labelColumn = findColumn(table.columns, options.labelColumn) ?? table.columns[0];
  const warnings = [...table.warnings];
  if (!xColumn || !yColumn) {
    warnings.push("Two numeric columns are required for a line plot.");
    return { table, rows: [], warnings, svg: renderEmptyPlot("Line plot", warnings) };
  }
  let skipped = 0;
  const rows = table.rows.map((row, index) => ({
    label: String(row[labelColumn?.id] ?? `Row ${index + 1}`),
    x: asNumber(row[xColumn.id]),
    y: asNumber(row[yColumn.id]),
    series: seriesColumn ? String(row[seriesColumn.id] ?? "") : "Data"
  })).filter((row) => {
    const keep = row.x !== null && row.y !== null;
    if (!keep) skipped += 1;
    return keep;
  })
    .sort((a, b) => String(a.series).localeCompare(String(b.series)) || a.x - b.x);
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for both selected line-plot axes.`);
  }
  if (rows.length === 0) {
    warnings.push("No rows had numeric values for both selected axes.");
  }
  const svgRows = limitedRowsForSvg(
    rows,
    parsePositiveInteger(options.maxPointsDrawn, DEFAULT_LINE_POINT_LIMIT, 100, 100000),
    warnings,
    "Line plot"
  );
  return {
    table,
    rows,
    warnings,
    svg: renderLineSvg(svgRows, {
      title: options.title || "Line plot",
      xLabel: xColumn.label,
      yLabel: yColumn.label,
      showLegend: seriesColumn !== null,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeBarPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const stringColumns = firstStringColumns(table.columns, 2);
  const numeric = firstNumericColumns(table.columns, 1);
  const categoryColumn = findColumn(table.columns, options.categoryColumn) ?? findColumn(table.columns, "gene_id") ?? stringColumns[0] ?? table.columns[0];
  const valueColumn = findColumn(table.columns, options.valueColumn) ?? numeric[0];
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "treatment") ??
    findColumn(table.columns, "group") ??
    (stringColumns[1]?.id !== categoryColumn?.id ? stringColumns[1] : null);
  const warnings = [...table.warnings];
  if (!categoryColumn || !valueColumn) {
    warnings.push("A category column and a numeric value column are required for a bar plot.");
    return { table, rows: [], warnings, svg: renderEmptyPlot("Bar plot", warnings) };
  }
  let skipped = 0;
  const rows = table.rows.map((row) => ({
    category: String(row[categoryColumn.id] ?? "").trim() || "(blank)",
    value: asNumber(row[valueColumn.id]),
    group: groupColumn ? String(row[groupColumn.id] ?? "").trim() || "Data" : "Data"
  })).filter((row) => {
    const keep = row.value !== null;
    if (!keep) skipped += 1;
    return keep;
  });
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for the selected bar value column.`);
  }
  if (rows.length === 0) {
    warnings.push("No rows had numeric values for the selected value column.");
  }
  const svgRows = limitedRowsForSvg(
    rows,
    parsePositiveInteger(options.maxBarsDrawn, DEFAULT_BAR_LIMIT, 10, 2000),
    warnings,
    "Bar plot"
  );
  return {
    table,
    rows,
    warnings,
    svg: renderBarSvg(svgRows, {
      title: options.title || "Bar plot",
      xLabel: categoryColumn.label,
      yLabel: valueColumn.label,
      showLegend: groupColumn !== null,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeBoxPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numeric = firstNumericColumns(table.columns, 1);
  const stringColumns = firstStringColumns(table.columns, 1);
  const valueColumn = findColumn(table.columns, options.valueColumn) ?? numeric[0];
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "treatment") ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "group") ??
    stringColumns[0];
  const warnings = [...table.warnings];
  if (!valueColumn) {
    warnings.push("A numeric value column is required for a box plot.");
    return { table, rows: [], outliers: [], warnings, svg: renderEmptyPlot("Box plot", warnings) };
  }
  const grouped = new Map();
  let skipped = 0;
  for (const row of table.rows) {
    const group = groupColumn ? String(row[groupColumn.id] ?? "").trim() || "(blank)" : "All rows";
    const value = asNumber(row[valueColumn.id]);
    if (value === null) {
      skipped += 1;
      continue;
    }
    grouped.set(group, [...(grouped.get(group) ?? []), value]);
  }
  const rows = [];
  const outliers = [];
  const points = [];
  for (const [group, values] of grouped.entries()) {
    const sorted = values.slice().sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const inlierValues = sorted.filter((value) => value >= lowerFence && value <= upperFence);
    const groupOutliers = sorted.filter((value) => value < lowerFence || value > upperFence);
    outliers.push(...groupOutliers.map((value) => ({ group, value: round(value) })));
    points.push(...values.map((value, index) => ({ group, value: round(value), index: index + 1 })));
    rows.push({
      group,
      count: sorted.length,
      min: round(sorted[0]),
      q1: round(q1),
      median: round(median),
      q3: round(q3),
      max: round(sorted[sorted.length - 1]),
      whisker_low: round(inlierValues[0] ?? sorted[0]),
      whisker_high: round(inlierValues[inlierValues.length - 1] ?? sorted[sorted.length - 1]),
      outlier_count: groupOutliers.length
    });
  }
  if (rows.length === 0) {
    warnings.push("No numeric values were available for the selected box plot column.");
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for the selected box plot column.`);
  }
  const dotLimit = parsePositiveInteger(options.maxDotsDrawn, DEFAULT_BOX_DOT_LIMIT, 0, 10000);
  const plottedPoints = dotLimit === 0 ? [] : points.slice(0, dotLimit);
  if (points.length > plottedPoints.length) {
    warnings.push(`Box plot SVG draws ${plottedPoints.length.toLocaleString()} individual measurement dot(s); quartiles and the table use all ${points.length.toLocaleString()} numeric value(s).`);
  }
  return {
    table,
    rows,
    outliers,
    points,
    warnings,
    svg: renderBoxSvg(rows, outliers, {
      title: options.title || "Box plot",
      xLabel: groupColumn?.label ?? "Group",
      yLabel: valueColumn.label,
      points: plottedPoints,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeViolinPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numeric = firstNumericColumns(table.columns, 1);
  const stringColumns = firstStringColumns(table.columns, 1);
  const valueColumn = findColumn(table.columns, options.valueColumn) ?? numeric[0];
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "treatment") ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "group") ??
    stringColumns[0];
  const warnings = [...table.warnings];
  if (!valueColumn) {
    warnings.push("A numeric value column is required for a violin plot.");
    return {
      table,
      summaries: [],
      densityRows: [],
      points: [],
      warnings,
      svg: renderEmptyPlot("Violin plot", warnings)
    };
  }
  const grouped = new Map();
  let skipped = 0;
  for (const row of table.rows) {
    const group = groupColumn ? String(row[groupColumn.id] ?? "").trim() || "(blank)" : "All rows";
    const value = asNumber(row[valueColumn.id]);
    if (value === null) {
      skipped += 1;
      continue;
    }
    grouped.set(group, [...(grouped.get(group) ?? []), value]);
  }
  const allValues = [...grouped.values()].flat();
  if (allValues.length === 0) {
    warnings.push("No numeric values were available for the selected violin plot column.");
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for the selected violin plot column.`);
  }
  if ([...grouped.values()].some((values) => values.length > 0 && values.length < 3)) {
    warnings.push("One or more groups have fewer than 3 numeric values; density shape is shown only as a rough guide.");
  }
  const [domainMin, domainMax] = extent(allValues);
  const gridPoints = parsePositiveInteger(options.gridPoints, DEFAULT_VIOLIN_GRID_POINTS, 24, 200);
  const grid = Array.from({ length: gridPoints }, (_, index) => domainMin + ((domainMax - domainMin) * index) / Math.max(1, gridPoints - 1));
  const fixedBandwidth = Number(options.bandwidth);
  const hasFixedBandwidth = Number.isFinite(fixedBandwidth) && fixedBandwidth > 0;
  const summaries = [];
  const rawDensityRows = [];
  const points = [];
  for (const [group, values] of grouped.entries()) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (sorted.length === 0) continue;
    const bandwidth = hasFixedBandwidth ? fixedBandwidth : defaultBandwidth(sorted, domainMax - domainMin);
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    summaries.push({
      group,
      count: sorted.length,
      min: round(sorted[0]),
      q1: round(q1),
      median: round(median),
      mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
      q3: round(q3),
      max: round(sorted[sorted.length - 1]),
      bandwidth: round(bandwidth)
    });
    rawDensityRows.push(...gaussianKernelDensity(sorted, grid, bandwidth).map((row) => ({
      group,
      value: row.value,
      density: row.density
    })));
    points.push(...values.map((value, index) => ({ group, value: round(value), index: index + 1 })));
  }
  const maxDensity = Math.max(0, ...rawDensityRows.map((row) => row.density));
  const densityRows = rawDensityRows.map((row) => ({
    group: row.group,
    value: round(row.value),
    density: round(row.density, 9),
    scaled_width: maxDensity > 0 ? round(row.density / maxDensity) : 0
  }));
  const dotLimit = parsePositiveInteger(options.maxDotsDrawn, DEFAULT_VIOLIN_DOT_LIMIT, 0, 10000);
  const plottedPoints = dotLimit === 0 ? [] : points.slice(0, dotLimit);
  if (points.length > plottedPoints.length) {
    warnings.push(`Violin plot SVG draws ${plottedPoints.length.toLocaleString()} individual measurement dot(s); density and summary tables use all ${points.length.toLocaleString()} numeric value(s).`);
  }
  return {
    table,
    summaries,
    densityRows,
    points,
    warnings,
    svg: renderViolinSvg(summaries, densityRows, {
      title: options.title || "Violin plot",
      xLabel: groupColumn?.label ?? "Group",
      yLabel: valueColumn.label,
      points: plottedPoints,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makeHeatmapPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const stringColumns = firstStringColumns(table.columns, 2);
  const numeric = firstNumericColumns(table.columns, 1);
  const xColumn = findColumn(table.columns, options.xColumn) ?? findColumn(table.columns, "sample_id") ?? stringColumns[0] ?? table.columns[0];
  const yColumn = findColumn(table.columns, options.yColumn) ?? findColumn(table.columns, "gene_id") ?? stringColumns.find((column) => column.id !== xColumn?.id) ?? table.columns.find((column) => column.id !== xColumn?.id);
  const valueColumn = findColumn(table.columns, options.valueColumn) ?? findColumn(table.columns, "tpm") ?? numeric[0];
  const warnings = [...table.warnings];
  if (!xColumn || !yColumn || !valueColumn) {
    warnings.push("X, Y, and numeric value columns are required for a heatmap.");
    return { table, rows: [], warnings, svg: renderEmptyPlot("Heatmap", warnings) };
  }
  const merged = new Map();
  let skipped = 0;
  for (const row of table.rows) {
    const x = String(row[xColumn.id] ?? "").trim() || "(blank)";
    const y = String(row[yColumn.id] ?? "").trim() || "(blank)";
    const value = asNumber(row[valueColumn.id]);
    if (value === null) {
      skipped += 1;
      continue;
    }
    const key = `${x}\u0000${y}`;
    const current = merged.get(key) ?? { x, y, total: 0, count: 0 };
    current.total += value;
    current.count += 1;
    merged.set(key, current);
  }
  const rows = [...merged.values()].map((row) => ({
    x: row.x,
    y: row.y,
    value: round(row.total / row.count),
    count: row.count
  }));
  if (rows.some((row) => row.count > 1)) {
    warnings.push("Duplicate X/Y cells were averaged for the heatmap.");
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for the selected heatmap value column.`);
  }
  if (rows.length === 0) {
    warnings.push("No numeric heatmap values were available for the selected columns.");
  }
  const categoryOrder = options.categoryOrder === "alphabetical" ? "alphabetical" : "input";
  const xValues = orderValues(rows.map((row) => row.x), categoryOrder);
  const yValues = orderValues(rows.map((row) => row.y), categoryOrder);
  const rowByCell = new Map(rows.map((row) => [`${row.x}\u0000${row.y}`, row]));
  const missingCells = [];
  if (options.showMissingCells !== false) {
    for (const y of yValues) {
      for (const x of xValues) {
        if (!rowByCell.has(`${x}\u0000${y}`)) {
          missingCells.push({ x, y, title: `${y} / ${x}: missing` });
        }
      }
    }
    if (missingCells.length > 0) {
      warnings.push(`${missingCells.length.toLocaleString()} missing X/Y cell combination(s) are shown as pale blank cells in the SVG.`);
    }
  }
  const visualCellCount = xValues.length * yValues.length;
  if (xValues.length > HEATMAP_CATEGORY_LIMIT || yValues.length > HEATMAP_CATEGORY_LIMIT) {
    warnings.push(`Heatmap has ${xValues.length} X categories and ${yValues.length} Y categories; category labels may be hard to read.`);
  }
  if (visualCellCount > HEATMAP_VISUAL_CELL_LIMIT) {
    warnings.push(`Heatmap visual output is not drawn because ${visualCellCount.toLocaleString()} possible cells exceed the ${HEATMAP_VISUAL_CELL_LIMIT.toLocaleString()}-cell visual preview limit. Use the Cell TSV output for the full table.`);
    return {
      table,
      rows,
      warnings,
      plotSpec: null,
      svg: renderEmptyPlot(options.title || "Heatmap", warnings)
    };
  }
  const values = rows.map((row) => row.value).filter((value) => Number.isFinite(value));
  const valueDomain = values.length > 0 ? [Math.min(...values), Math.max(...values)] : [0, 1];
  const plotSpec = makeHeatmapPlotSpec({
    title: options.title || "Heatmap",
    xLabel: xColumn.label,
    yLabel: yColumn.label,
    valueLabel: valueColumn.label,
    colorScheme: normalizeHeatmapColorScale(options.colorScale),
    xCategories: xValues.map((value) => ({ id: value, label: value })),
    yCategories: yValues.map((value) => ({ id: value, label: value })),
    cells: rows.map((row) => ({
      x: row.x,
      y: row.y,
      value: row.value,
      title: `${row.y} / ${row.x}: ${row.value}`
    })),
    missingCells,
    valueDomain
  });
  return {
    table,
    rows,
    warnings,
    plotSpec,
    svg: renderHeatmapPlotSvg(plotSpec)
  };
}

export function makeHistogramPlot(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numeric = firstNumericColumns(table.columns, 1);
  const valueColumn = findColumn(table.columns, options.valueColumn) ?? numeric[0];
  const warnings = [...table.warnings];
  if (!valueColumn) {
    warnings.push("A numeric column is required for a histogram.");
    return { table, rows: [], sourceRows: [], warnings, svg: renderEmptyPlot("Histogram", warnings) };
  }
  let skipped = 0;
  const values = table.rows.map((row) => asNumber(row[valueColumn.id])).filter((value) => {
    const keep = value !== null;
    if (!keep) skipped += 1;
    return keep;
  });
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for the selected histogram column.`);
  }
  if (values.length === 0) {
    warnings.push("No numeric values were available for the selected histogram column.");
  }
  let min = values.length > 0 ? Math.min(...values) : 0;
  let max = values.length > 0 ? Math.max(...values) : 1;
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const binCount = histogramBinCount(values, min, max, options);
  const width = (max - min) / binCount || 1;
  const rows = Array.from({ length: binCount }, (_, index) => ({
    bin_start: min + index * width,
    bin_end: min + (index + 1) * width,
    count: 0
  }));
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - min) / width)));
    rows[index].count += 1;
  }
  return {
    table,
    rows: rows.map((row) => ({
      bin_start: Number(row.bin_start.toFixed(6)),
      bin_end: Number(row.bin_end.toFixed(6)),
      count: row.count
    })),
    sourceRows: values.map((value, index) => ({ label: `Value ${index + 1}`, value })),
    warnings,
    svg: renderHistogramSvg(rows, {
      title: options.title || "Histogram",
      xLabel: valueColumn.label,
      yLabel: "Count",
      ...axisRenderOptions(options, warnings)
    })
  };
}

function renderEmptyPlot(title, warnings) {
  const lines = warnings.length > 0 ? warnings : ["No plot data were available."];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 160" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3" data-plot-renderer="sms3-d3">`,
    `<rect width="760" height="160" fill="white"/>`,
    `<text x="28" y="42" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#263238">${escapeXml(title)}</text>`,
    ...lines.map((line, index) => `<text x="28" y="${78 + index * 20}" font-family="system-ui, sans-serif" font-size="13" fill="#5c6b75">${escapeXml(line)}</text>`),
    "</svg>"
  ].join("");
}

const PLOT_TITLE_Y = 44;
const PLOT_SUBTITLE_FIRST_Y = 72;
const PLOT_TEXT_LINE_HEIGHT = 17;
const PLOT_HEADER_GAP = 42;

function wrapPlotText(text, width, maxCharacters = Math.max(52, Math.floor((width - 120) / 8))) {
  const words = String(text ?? "").split(/\s+/u).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function plotTextWidthEstimate(text, fontSize = 11) {
  return String(text ?? "").length * fontSize * 0.58;
}

function plotHeaderLayout(width, subtitle = "") {
  const subtitleLines = subtitle ? wrapPlotText(subtitle, width) : [];
  const lastHeaderBaseline = subtitleLines.length > 0
    ? PLOT_SUBTITLE_FIRST_Y + (subtitleLines.length - 1) * PLOT_TEXT_LINE_HEIGHT
    : PLOT_TITLE_Y;
  return {
    subtitleLines,
    plotTop: lastHeaderBaseline + PLOT_HEADER_GAP
  };
}

function applyPlotHeaderLayout({ width, height, margin, subtitle = "" }) {
  const { plotTop } = plotHeaderLayout(width, subtitle);
  const top = Math.max(margin.top, plotTop);
  return {
    height: height + Math.max(0, top - margin.top),
    margin: { ...margin, top }
  };
}

function renderBaseSvg({ title, width = 900, height = 560, xLabel, yLabel, plot, subtitle = "", notes = [] }) {
  const { subtitleLines } = plotHeaderLayout(width, subtitle);
  const noteLines = notes.flatMap((note) => wrapPlotText(note, width));
  const scope = '[data-plot-renderer="sms3-d3"]';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3" data-plot-renderer="sms3-d3">`,
    "<style>",
    `${scope} .title{font:700 20px system-ui,sans-serif;fill:#263238;stroke:none;stroke-width:0;paint-order:normal}`,
    `${scope} .axis{stroke:#455a64;stroke-width:1.2}`,
    `${scope} .grid{stroke:#d9e2e8;stroke-width:1}`,
    `${scope} .tick{font:11px system-ui,sans-serif;fill:#455a64;stroke:none;stroke-width:0;paint-order:normal}`,
    `${scope} .label{font:13px system-ui,sans-serif;fill:#263238;stroke:none;stroke-width:0;paint-order:normal}`,
    `${scope} .legend{font:12px system-ui,sans-serif;fill:#263238;stroke:none;stroke-width:0;paint-order:normal}`,
    "</style>",
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="34" y="${PLOT_TITLE_Y}">${escapeXml(title)}</text>`,
    ...subtitleLines.map((line, index) => `<text class="legend" x="34" y="${PLOT_SUBTITLE_FIRST_Y + index * PLOT_TEXT_LINE_HEIGHT}" data-plot-subtitle="true">${escapeXml(line)}</text>`),
    plot,
    ...noteLines.map((line, index) => `<text class="legend" x="34" y="${height - 48 + index * 14}">${escapeXml(line)}</text>`),
    `<text class="label" x="${width / 2}" y="${height - 18}" text-anchor="middle">${escapeXml(xLabel)}</text>`,
    `<text class="label" transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle">${escapeXml(yLabel)}</text>`,
    "</svg>"
  ].join("");
}

const ANGLED_X_TICK_GAP = 28;

function renderAngledCategoryTick({ x, plotHeight, label, title, angle = -28 }) {
  const y = plotHeight + ANGLED_X_TICK_GAP;
  return `<text class="tick x-category-tick" data-axis-label="x" x="${x}" y="${y}" text-anchor="middle" transform="rotate(${angle} ${x} ${y})">${escapeXml(label)}<title>${escapeXml(title ?? label)}</title></text>`;
}

export function renderScatterSvg(rows, options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Scatter plot", ["No scatter plot data were available."]);
  const width = 900;
  const layout = applyPlotHeaderLayout({
    width,
    height: 560,
    margin: { top: 68, right: options.showLegend ? 150 : 34, bottom: 70, left: 78 }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const [xMin, xMax] = applyAxisLimits(extent(rows.map((row) => row.x)), options, "x");
  const [yMin, yMax] = applyAxisLimits(extent(rows.map((row) => row.y)), options, "y");
  const groups = [...new Set(rows.map((row) => row.group || "Data"))];
  const xTicks = makeAxisTicks(xMin, xMax);
  const yTicks = makeAxisTicks(yMin, yMax);
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...xTicks.map((tick) => {
      const x = scale(tick, xMin, xMax, 0, plotWidth);
      return `<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/><text class="tick" x="${x}" y="${plotHeight + 20}" text-anchor="middle">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...rows.map((row) => {
      const x = scale(row.x, xMin, xMax, 0, plotWidth);
      const y = scale(row.y, yMin, yMax, plotHeight, 0);
      const color = groupColor(row.group || "Data", groups);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.5" fill="${color}" fill-opacity="0.78"><title>${escapeXml(`${row.label}: ${row.x}, ${row.y}`)}</title></circle>`;
    }),
    "</g>"
  ];
  if (options.showLegend) {
    parts.push(...groups.slice(0, 16).map((group, index) => {
      const y = 76 + index * 20;
      return `<rect x="${width - 128}" y="${y - 10}" width="10" height="10" fill="${groupColor(group, groups)}"/><text class="legend" x="${width - 112}" y="${y}">${escapeXml(group)}</text>`;
    }));
  }
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function renderVolcanoSvg(rows, options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Volcano plot", ["No volcano plot data were available."]);
  const width = 940;
  const layout = applyPlotHeaderLayout({
    width,
    height: 600,
    margin: { top: 72, right: 164, bottom: 78, left: 86 }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxAbsX = Math.max(1, ...rows.map((row) => Math.abs(row.log2_fold_change)));
  const foldChangeThreshold = Math.max(0, Number(options.foldChangeCutoff) || 1);
  const xExtent = Math.max(maxAbsX * 1.08, foldChangeThreshold * 1.12);
  const [xMin, xMax] = applyAxisLimits([-xExtent, xExtent], options, "x");
  const [yMinRaw, yMax] = extent(rows.map((row) => row.neg_log10_p));
  const pValueThreshold = options.pValueCutoff ?? 0.05;
  const thresholdY = -Math.log10(pValueThreshold);
  const [yMin, yUpper] = applyAxisLimits([Math.min(0, yMinRaw), Math.max(yMax, thresholdY)], options, "y");
  const xTicks = makeAxisTicks(xMin, xMax);
  const yTicks = makeAxisTicks(yMin, yUpper);
  const colorByClass = {
    up: "#b91c1c",
    down: "#2563eb",
    "not significant": "#64748b"
  };
  const pointRadius = 4.2;
  const pointOpacity = 0.78;
  const classLabels = ["up", "down", "not significant"];
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...xTicks.map((tick) => {
      const x = scale(tick, xMin, xMax, 0, plotWidth);
      return `<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/><text class="tick" x="${x}" y="${plotHeight + 20}" text-anchor="middle">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yUpper, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="${scale(0, xMin, xMax, 0, plotWidth)}" x2="${scale(0, xMin, xMax, 0, plotWidth)}" y1="0" y2="${plotHeight}" stroke="#94a3b8" stroke-width="1.2"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...[-foldChangeThreshold, foldChangeThreshold].map((cutoff) => {
      const x = scale(cutoff, xMin, xMax, 0, plotWidth);
      return `<g><line x1="${x}" x2="${x}" y1="0" y2="${plotHeight}" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="5 5"><title>${escapeXml(`log2 fold-change threshold ${niceNumber(cutoff)}`)}</title></line><text x="${x + (cutoff < 0 ? -6 : 6)}" y="-10" text-anchor="${cutoff < 0 ? "end" : "start"}" font-size="11" fill="#b45309" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-opacity="0.88" stroke-linejoin="round">log₂FC ${cutoff < 0 ? "≤" : "≥"} ${escapeXml(niceNumber(cutoff))}</text></g>`;
    }),
    `<g><line x1="0" x2="${plotWidth}" y1="${scale(thresholdY, yMin, yUpper, plotHeight, 0)}" y2="${scale(thresholdY, yMin, yUpper, plotHeight, 0)}" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="5 5"><title>${escapeXml(`p-value threshold ${niceNumber(pValueThreshold)}`)}</title></line><text x="${plotWidth - 4}" y="${scale(thresholdY, yMin, yUpper, plotHeight, 0) - 7}" text-anchor="end" font-size="11" fill="#b45309" paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-opacity="0.88" stroke-linejoin="round">p ≤ ${escapeXml(niceNumber(pValueThreshold))}</text></g>`,
    ...rows.map((row) => {
      const x = scale(row.log2_fold_change, xMin, xMax, 0, plotWidth);
      const y = scale(row.neg_log10_p, yMin, yUpper, plotHeight, 0);
      const color = colorByClass[row.class] ?? colorByClass["not significant"];
      return `<circle data-volcano-point="true" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${pointRadius}" fill="${color}" fill-opacity="${pointOpacity}"><title>${escapeXml(`${row.label}: log2FC=${row.log2_fold_change}, p=${row.p_value}, ${row.class}`)}</title></circle>`;
    }),
    "</g>",
    ...classLabels.map((label, index) => {
      const y = margin.top + 8 + index * 22;
      return `<circle cx="${width - 136}" cy="${y}" r="${pointRadius}" fill="${colorByClass[label]}" fill-opacity="${pointOpacity}"/><text class="legend" x="${width - 124}" y="${y + 4}">${escapeXml(label)}</text>`;
    })
  ];
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function renderManhattanSvg(rows, options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Manhattan Plot", ["No Manhattan plot data were available."]);
  const width = options.width ?? 1100;
  const heightOption = options.height ?? 620;
  const chromosomeOrder = options.chromosomeOrder ?? [...new Set(rows.map((row) => row.chromosome))];
  const chromosomeStats = options.chromosomeStats ?? new Map();
  const showLabels = options.labelTopMarkers === true;
  const layout = applyPlotHeaderLayout({
    width,
    height: heightOption,
    margin: { top: showLabels ? 98 : 76, right: 34, bottom: chromosomeOrder.length > 18 ? 96 : 76, left: 86 }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxPlotPosition = Math.max(
    1,
    ...[...chromosomeStats.values()].map((stats) => stats.endPlot ?? stats.last + 1),
    ...rows.map((row) => row.plot_position)
  );
  const maxObserved = Math.max(1, ...rows.map((row) => row.neg_log10_p));
  const maxThreshold = Math.max(0, ...(options.significanceLines ?? []).map((line) => line.threshold));
  const [yMin, yMax] = applyAxisLimits([0, Math.max(maxObserved, maxThreshold) + 0.6], options, "y");
  const yTicks = makeAxisTicks(yMin, yMax, 6).filter((tick) => tick >= yMin && tick <= yMax);
  const colorByChromosome = new Map(chromosomeOrder.map((chromosome, index) => [
    chromosome,
    options.colors[index % options.colors.length]
  ]));
  const xForPlotPosition = (position) => scale(position, 0, maxPlotPosition, 0, plotWidth);
  const yForValue = (value) => scale(value, yMin, yMax, plotHeight, 0);
  const pointRadius = options.pointRadius ?? 4;
  const chromosomeLabelGeometry = chromosomeOrder.map((chromosome) => {
    const stats = chromosomeStats.get(chromosome);
    if (!stats) return null;
    const label = String(chromosome);
    return {
      label,
      center: xForPlotPosition(stats.centerPlot ?? (stats.first + stats.last + 2) / 2),
      width: plotTextWidthEstimate(label, 11)
    };
  }).filter(Boolean);
  const labelsOverlap = chromosomeLabelGeometry.some((item, index) => {
    const next = chromosomeLabelGeometry[index + 1];
    if (!next) return false;
    return next.center - item.center < (item.width + next.width) / 2 + 8;
  });
  const xTickAngle = chromosomeOrder.length > 18 || labelsOverlap ? -36 : 0;
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...yTicks.map((tick) => {
      const y = yForValue(tick);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...chromosomeOrder.flatMap((chromosome) => {
      const stats = chromosomeStats.get(chromosome);
      if (!stats) return [];
      const center = xForPlotPosition(stats.centerPlot ?? (stats.first + stats.last + 2) / 2);
      const labelY = plotHeight + 24;
      const label = String(chromosome);
      return [
        `<text class="tick" x="${center.toFixed(2)}" y="${labelY}" text-anchor="${xTickAngle === 0 ? "middle" : "end"}" transform="rotate(${xTickAngle} ${center.toFixed(2)} ${labelY})">${escapeXml(label)}<title>${escapeXml(label)}</title></text>`
      ];
    }),
    ...(options.significanceLines ?? []).map((line) => {
      const y = yForValue(line.threshold);
      return `<line x1="0" x2="${plotWidth}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${escapeXml(line.color)}" stroke-width="1.6" stroke-dasharray="6 5"><title>${escapeXml(`Threshold ${line.threshold}`)}</title></line>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...rows.map((row) => {
      const x = xForPlotPosition(row.plot_position);
      const y = yForValue(row.neg_log10_p);
      const color = colorByChromosome.get(row.chromosome) ?? "#2563eb";
      const stroke = row.top_marker === "yes" ? "#263238" : "none";
      const strokeWidth = row.top_marker === "yes" ? "0.8" : "0";
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${pointRadius}" fill="${color}" fill-opacity="0.78" stroke="${stroke}" stroke-width="${strokeWidth}"><title>${escapeXml(`${row.marker}; ${row.chromosome}:${row.position}; p=${row.p_value}; -log10(p)=${row.neg_log10_p}`)}</title></circle>`;
    }),
    ...rows.filter((row) => row.top_marker === "yes").map((row) => {
      const x = xForPlotPosition(row.plot_position);
      const y = Math.max(14, yForValue(row.neg_log10_p) - pointRadius - 6);
      const color = colorByChromosome.get(row.chromosome) ?? "#2563eb";
      const label = String(row.marker).length > 24 ? `${String(row.marker).slice(0, 23)}...` : String(row.marker);
      return `<text class="legend" x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="start" transform="rotate(-70 ${x.toFixed(2)} ${y.toFixed(2)})" fill="${escapeXml(color)}">${escapeXml(label)}<title>${escapeXml(row.marker)}</title></text>`;
    }),
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function renderQqPlotSvg(rows, options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Q-Q plot", ["No Q-Q plot data were available."]);
  const width = 900;
  const subtitle = "Reference line: sample mean + sample SD x theoretical normal quantile.";
  const layout = applyPlotHeaderLayout({
    width,
    height: 560,
    margin: { top: 82, right: 46, bottom: 76, left: 86 },
    subtitle
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const theoretical = rows.map((row) => row.theoretical_quantile).filter((value) => Number.isFinite(value));
  const observed = rows.map((row) => row.sample_quantile).filter((value) => Number.isFinite(value));
  const [xMin, xMax] = applyAxisLimits(extent(theoretical), options, "x");
  const mean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
  const sd = sampleStandardDeviation(observed);
  const lineValues = sd > 0 ? [mean + sd * xMin, mean + sd * xMax] : [mean, mean];
  const [yMin, yMax] = applyAxisLimits(extent([...observed, ...lineValues]), options, "y");
  const xTicks = makeAxisTicks(xMin, xMax);
  const yTicks = makeAxisTicks(yMin, yMax);
  const refStartY = scale(lineValues[0], yMin, yMax, plotHeight, 0);
  const refEndY = scale(lineValues[1], yMin, yMax, plotHeight, 0);
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...xTicks.map((tick) => {
      const x = scale(tick, xMin, xMax, 0, plotWidth);
      return `<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/><text class="tick" x="${x}" y="${plotHeight + 20}" text-anchor="middle">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    `<line x1="0" x2="${plotWidth}" y1="${refStartY.toFixed(2)}" y2="${refEndY.toFixed(2)}" stroke="#64748b" stroke-width="2" stroke-dasharray="6 5"><title>${escapeXml("Reference line based on sample mean and sample standard deviation")}</title></line>`,
    ...rows.map((row) => {
      const x = scale(row.theoretical_quantile, xMin, xMax, 0, plotWidth);
      const y = scale(row.sample_quantile, yMin, yMax, plotHeight, 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.2" fill="#2563eb" fill-opacity="0.76" stroke="#ffffff" stroke-width="0.8"><title>${escapeXml(`${row.label}: normal=${row.theoretical_quantile}, ${options.valueLabel || "value"}=${row.sample_quantile}`)}</title></circle>`;
    }),
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    subtitle,
    plot: parts.join("")
  });
}

export function renderHistogramSvg(rows, options = {}) {
  const width = 900;
  const layout = applyPlotHeaderLayout({
    width,
    height: 520,
    margin: { top: 68, right: 34, bottom: 78, left: 78 }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const [xMin, xMax] = applyAxisLimits([
    Math.min(...rows.map((row) => row.bin_start)),
    Math.max(...rows.map((row) => row.bin_end))
  ], options, "x");
  const [yMin, yMax] = applyAxisLimits([0, Math.max(...rows.map((row) => row.count), 1)], options, "y");
  const xTicks = makeAxisTicks(xMin, xMax);
  const yTicks = yMin === 0 ? makeCountAxisTicks(yMax) : makeAxisTicks(yMin, yMax);
  const barGap = rows.length > 30 ? 1 : 2;
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...xTicks.map((tick) => {
      const x = scale(tick, xMin, xMax, 0, plotWidth);
      return `<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/><text class="tick" x="${x}" y="${plotHeight + 20}" text-anchor="middle">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...rows.map((row) => {
      const x1 = scale(row.bin_start, xMin, xMax, 0, plotWidth);
      const x2 = scale(row.bin_end, xMin, xMax, 0, plotWidth);
      const y = scale(row.count, yMin, yMax, plotHeight, 0);
      const zeroY = scale(0, yMin, yMax, plotHeight, 0);
      const barWidth = Math.max(1, x2 - x1 - barGap);
      return `<rect x="${(x1 + barGap / 2).toFixed(2)}" y="${Math.min(y, zeroY).toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.abs(zeroY - y).toFixed(2)}" fill="#2563eb" fill-opacity="0.78"><title>${escapeXml(`${niceNumber(row.bin_start)} to ${niceNumber(row.bin_end)}: ${row.count}`)}</title></rect>`;
    }),
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function renderLineSvg(rows, options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Line plot", ["No line plot data were available."]);
  const width = 900;
  const layout = applyPlotHeaderLayout({
    width,
    height: 560,
    margin: { top: 68, right: options.showLegend ? 150 : 34, bottom: 70, left: 78 }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const [xMin, xMax] = applyAxisLimits(extent(rows.map((row) => row.x)), options, "x");
  const [yMin, yMax] = applyAxisLimits(extent(rows.map((row) => row.y)), options, "y");
  const groups = [...new Set(rows.map((row) => row.series || "Data"))];
  const xTicks = makeAxisTicks(xMin, xMax);
  const yTicks = makeAxisTicks(yMin, yMax);
  const groupedRows = groups.map((group) => rows.filter((row) => row.series === group).sort((a, b) => a.x - b.x));
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...xTicks.map((tick) => {
      const x = scale(tick, xMin, xMax, 0, plotWidth);
      return `<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/><text class="tick" x="${x}" y="${plotHeight + 20}" text-anchor="middle">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...groupedRows.map((seriesRows, index) => {
      const color = COLORS[index % COLORS.length];
      const line = getD3()?.line?.()
        .x((row) => scale(row.x, xMin, xMax, 0, plotWidth))
        .y((row) => scale(row.y, yMin, yMax, plotHeight, 0));
      const path = line
        ? line(seriesRows)
        : seriesRows.map((row, pointIndex) => {
            const x = scale(row.x, xMin, xMax, 0, plotWidth).toFixed(2);
            const y = scale(row.y, yMin, yMax, plotHeight, 0).toFixed(2);
            return `${pointIndex === 0 ? "M" : "L"}${x},${y}`;
          }).join(" ");
      const points = seriesRows.map((row) => {
        const x = scale(row.x, xMin, xMax, 0, plotWidth);
        const y = scale(row.y, yMin, yMax, plotHeight, 0);
        return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.2" fill="${color}"><title>${escapeXml(`${row.label}: ${row.x}, ${row.y}`)}</title></circle>`;
      }).join("");
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${points}`;
    }),
    "</g>"
  ];
  if (options.showLegend) {
    parts.push(...groups.slice(0, 16).map((group, index) => {
      const y = 76 + index * 20;
      return `<line x1="${width - 130}" x2="${width - 116}" y1="${y - 4}" y2="${y - 4}" stroke="${COLORS[index % COLORS.length]}" stroke-width="3"/><text class="legend" x="${width - 108}" y="${y}">${escapeXml(group)}</text>`;
    }));
  }
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function renderBarSvg(rows, options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Bar plot", ["No bar plot data were available."]);
  const width = 940;
  const layout = applyPlotHeaderLayout({
    width,
    height: 560,
    margin: { top: 68, right: options.showLegend ? 150 : 34, bottom: 96, left: 78 }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const categories = [...new Set(rows.map((row) => row.category))];
  const groups = [...new Set(rows.map((row) => row.group || "Data"))];
  const [yMin, yMax] = applyAxisLimits([
    Math.min(0, ...rows.map((row) => row.value)),
    Math.max(0, ...rows.map((row) => row.value), 1)
  ], options, "y");
  const yTicks = makeAxisTicks(yMin, yMax);
  const zeroY = scale(0, yMin, yMax, plotHeight, 0);
  const categoryWidth = plotWidth / Math.max(1, categories.length);
  const groupWidth = categoryWidth * 0.78;
  const barWidth = Math.max(2, groupWidth / Math.max(1, groups.length));
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${zeroY}" y2="${zeroY}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...categories.map((category, categoryIndex) => {
      const x = categoryIndex * categoryWidth + categoryWidth / 2;
      const label = category.length > 14 ? `${category.slice(0, 13)}...` : category;
      return renderAngledCategoryTick({ x, plotHeight, label, title: category });
    }),
    ...rows.map((row) => {
      const categoryIndex = categories.indexOf(row.category);
      const groupIndex = groups.indexOf(row.group || "Data");
      const x = categoryIndex * categoryWidth + (categoryWidth - groupWidth) / 2 + groupIndex * barWidth;
      const y = scale(row.value, yMin, yMax, plotHeight, 0);
      const color = groupColor(row.group || "Data", groups);
      return `<rect x="${x.toFixed(2)}" y="${Math.min(y, zeroY).toFixed(2)}" width="${Math.max(1, barWidth - 2).toFixed(2)}" height="${Math.max(1, Math.abs(zeroY - y)).toFixed(2)}" fill="${color}" fill-opacity="0.82"><title>${escapeXml(`${row.category}${row.group ? ` / ${row.group}` : ""}: ${row.value}`)}</title></rect>`;
    }),
    "</g>"
  ];
  if (options.showLegend) {
    parts.push(...groups.slice(0, 16).map((group, index) => {
      const y = 76 + index * 20;
      return `<rect x="${width - 128}" y="${y - 10}" width="10" height="10" fill="${groupColor(group, groups)}"/><text class="legend" x="${width - 112}" y="${y}">${escapeXml(group)}</text>`;
    }));
  }
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function renderBoxSvg(rows, outliers = [], options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Box plot", ["No box plot data were available."]);
  const width = 900;
  const layout = applyPlotHeaderLayout({
    width,
    height: 560,
    margin: { top: 68, right: 34, bottom: 94, left: 78 }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.flatMap((row) => [row.min, row.max, row.whisker_low, row.whisker_high]).filter((value) => Number.isFinite(value));
  const [yMin, yMax] = applyAxisLimits(extent(values), options, "y");
  const yTicks = makeAxisTicks(yMin, yMax);
  const groupWidth = plotWidth / Math.max(1, rows.length);
  const boxWidth = Math.min(56, groupWidth * 0.48);
  const points = options.points ?? [];
  const pointJitter = Math.min(24, boxWidth * 0.42, groupWidth * 0.18);
  const jitterOffset = (point) => {
    const seed = `${point.group}:${point.index}:${point.value}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return ((hash % 1000) / 999 - 0.5) * 2 * pointJitter;
  };
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...rows.map((row, index) => {
      const x = index * groupWidth + groupWidth / 2;
      const q1 = scale(row.q1, yMin, yMax, plotHeight, 0);
      const q3 = scale(row.q3, yMin, yMax, plotHeight, 0);
      const median = scale(row.median, yMin, yMax, plotHeight, 0);
      const whiskerLow = scale(row.whisker_low, yMin, yMax, plotHeight, 0);
      const whiskerHigh = scale(row.whisker_high, yMin, yMax, plotHeight, 0);
      const label = row.group.length > 14 ? `${row.group.slice(0, 13)}...` : row.group;
      return [
        `<line x1="${x}" x2="${x}" y1="${whiskerHigh}" y2="${whiskerLow}" stroke="#455a64" stroke-width="1.4"/>`,
        `<line x1="${x - boxWidth / 3}" x2="${x + boxWidth / 3}" y1="${whiskerHigh}" y2="${whiskerHigh}" stroke="#455a64" stroke-width="1.4"/>`,
        `<line x1="${x - boxWidth / 3}" x2="${x + boxWidth / 3}" y1="${whiskerLow}" y2="${whiskerLow}" stroke="#455a64" stroke-width="1.4"/>`,
        `<rect x="${x - boxWidth / 2}" y="${Math.min(q1, q3)}" width="${boxWidth}" height="${Math.max(1, Math.abs(q3 - q1))}" fill="#2563eb" fill-opacity="0.22" stroke="#2563eb" stroke-width="1.6"><title>${escapeXml(`${row.group}: n=${row.count}, median=${row.median}`)}</title></rect>`,
        `<line x1="${x - boxWidth / 2}" x2="${x + boxWidth / 2}" y1="${median}" y2="${median}" stroke="#1d4ed8" stroke-width="2.2"/>`,
        renderAngledCategoryTick({ x, plotHeight, label, title: row.group })
      ].join("");
    }),
    ...points.map((point) => {
      const index = rows.findIndex((row) => row.group === point.group);
      if (index < 0) return "";
      const x = index * groupWidth + groupWidth / 2 + jitterOffset(point);
      const y = scale(point.value, yMin, yMax, plotHeight, 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.5" fill="#0f172a" fill-opacity="0.42" stroke="#ffffff" stroke-opacity="0.75" stroke-width="0.8"><title>${escapeXml(`${point.group} measurement ${point.index}: ${point.value}`)}</title></circle>`;
    }),
    ...outliers.map((outlier) => {
      const index = rows.findIndex((row) => row.group === outlier.group);
      if (index < 0) return "";
      const x = index * groupWidth + groupWidth / 2;
      const y = scale(outlier.value, yMin, yMax, plotHeight, 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.8" fill="#be123c" fill-opacity="0.78"><title>${escapeXml(`${outlier.group} outlier: ${outlier.value}`)}</title></circle>`;
    }),
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function renderViolinSvg(summaryRows, densityRows = [], options = {}) {
  if (summaryRows.length === 0) return renderEmptyPlot(options.title || "Violin plot", ["No violin plot data were available."]);
  const width = 940;
  const subtitle = "Width shows kernel density; vertical bar shows IQR; horizontal mark shows median; dots show individual measurements.";
  const layout = applyPlotHeaderLayout({
    width,
    height: 600,
    margin: { top: 86, right: 36, bottom: 104, left: 86 },
    subtitle
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = [
    ...summaryRows.flatMap((row) => [row.min, row.max]),
    ...densityRows.map((row) => row.value)
  ].filter((value) => Number.isFinite(value));
  const [yMin, yMax] = applyAxisLimits(extent(values), options, "y");
  const yTicks = makeAxisTicks(yMin, yMax);
  const groupWidth = plotWidth / Math.max(1, summaryRows.length);
  const maxHalfWidth = Math.min(70, groupWidth * 0.36);
  const points = options.points ?? [];
  const densityByGroup = new Map();
  for (const row of densityRows) {
    densityByGroup.set(row.group, [...(densityByGroup.get(row.group) ?? []), row]);
  }
  const jitterOffset = (point, limit) => {
    const seed = `${point.group}:${point.index}:${point.value}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    }
    return ((hash % 1000) / 999 - 0.5) * 2 * limit;
  };
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...summaryRows.map((row, index) => {
      const centerX = index * groupWidth + groupWidth / 2;
      const color = COLORS[index % COLORS.length];
      const allDensity = (densityByGroup.get(row.group) ?? [])
        .slice()
        .sort((left, right) => left.value - right.value);
      const groupMaxWidth = Math.max(0, ...allDensity.map((densityRow) => densityRow.scaled_width));
      const minimumVisibleWidth = Math.max(0.012, groupMaxWidth * 0.012);
      const density = allDensity.filter((densityRow) => densityRow.scaled_width >= minimumVisibleWidth);
      const leftSide = density.map((densityRow) => {
        const y = scale(densityRow.value, yMin, yMax, plotHeight, 0);
        const halfWidth = Math.max(0, densityRow.scaled_width) * maxHalfWidth;
        return `${centerX - halfWidth},${y}`;
      });
      const rightSide = density.slice().reverse().map((densityRow) => {
        const y = scale(densityRow.value, yMin, yMax, plotHeight, 0);
        const halfWidth = Math.max(0, densityRow.scaled_width) * maxHalfWidth;
        return `${centerX + halfWidth},${y}`;
      });
      const path = leftSide.length > 0
        ? `M${leftSide.join(" L")} L${rightSide.join(" L")} Z`
        : "";
      const q1 = scale(row.q1, yMin, yMax, plotHeight, 0);
      const q3 = scale(row.q3, yMin, yMax, plotHeight, 0);
      const median = scale(row.median, yMin, yMax, plotHeight, 0);
      const mean = scale(row.mean, yMin, yMax, plotHeight, 0);
      const label = row.group.length > 14 ? `${row.group.slice(0, 13)}...` : row.group;
      return [
        path ? `<path d="${path}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"><title>${escapeXml(`${row.group}: n=${row.count}, median=${row.median}, bandwidth=${row.bandwidth}`)}</title></path>` : "",
        `<line x1="${centerX}" x2="${centerX}" y1="${q3}" y2="${q1}" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-opacity="0.72"/>`,
        `<line x1="${centerX - maxHalfWidth * 0.42}" x2="${centerX + maxHalfWidth * 0.42}" y1="${median}" y2="${median}" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round"/>`,
        `<path d="M${centerX},${mean - 5} L${centerX + 5},${mean} L${centerX},${mean + 5} L${centerX - 5},${mean} Z" fill="#ffffff" stroke="${color}" stroke-width="1.4"><title>${escapeXml(`${row.group} mean: ${row.mean}`)}</title></path>`,
        renderAngledCategoryTick({ x: centerX, plotHeight, label, title: row.group })
      ].join("");
    }),
    ...points.map((point) => {
      const index = summaryRows.findIndex((row) => row.group === point.group);
      if (index < 0) return "";
      const centerX = index * groupWidth + groupWidth / 2;
      const x = centerX + jitterOffset(point, Math.min(24, maxHalfWidth * 0.38));
      const y = scale(point.value, yMin, yMax, plotHeight, 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.4" fill="#0f172a" fill-opacity="0.42" stroke="#ffffff" stroke-opacity="0.75" stroke-width="0.8"><title>${escapeXml(`${point.group} measurement ${point.index}: ${point.value}`)}</title></circle>`;
    }),
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    subtitle,
    plot: parts.join("")
  });
}

export function renderHeatmapSvg(rows, options = {}) {
  if (rows.length === 0) return renderEmptyPlot(options.title || "Heatmap", ["No heatmap data were available."]);
  const xValues = [...new Set(rows.map((row) => row.x))];
  const yValues = [...new Set(rows.map((row) => row.y))];
  const maxXLabelWidth = Math.max(...xValues.map((value) => plotTextWidthEstimate(value, 11)), 40);
  const maxYLabelWidth = Math.max(...yValues.map((value) => plotTextWidthEstimate(value, 11)), 48);
  const values = rows.map((row) => row.value).filter((value) => Number.isFinite(value));
  const min = options.colorDomain ? options.colorDomain[0] : Math.min(...values);
  const max = options.colorDomain ? options.colorDomain[1] : Math.max(...values);
  const marginLeft = Math.min(260, Math.max(148, Math.ceil(maxYLabelWidth + 46)));
  const marginBottom = Math.min(150, Math.max(104, Math.ceil(maxXLabelWidth * 0.64 + 58)));
  const rawLegendTitle = String(options.valueLabel || "Value");
  const legendTitle = rawLegendTitle.length > 18
    ? `${rawLegendTitle.slice(0, 17)}...`
    : rawLegendTitle;
  const legendBarWidth = 18;
  const legendLabelGap = HEATMAP_LEGEND_LABEL_GAP;
  const legendLabelWidth = Math.max(plotTextWidthEstimate(niceNumber(min), 11), plotTextWidthEstimate(niceNumber(max), 11), 24);
  const legendTitleWidth = Math.max(plotTextWidthEstimate(legendTitle, 12), legendBarWidth + legendLabelGap + legendLabelWidth);
  const legendGutter = 46;
  const marginRight = Math.max(160, Math.ceil(legendGutter + legendTitleWidth + 16));
  const width = 920;
  const layout = applyPlotHeaderLayout({
    width,
    height: 600,
    margin: { top: 68, right: marginRight, bottom: marginBottom, left: marginLeft }
  });
  const { height, margin } = layout;
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const colorScale = normalizeHeatmapColorScale(options.colorScale);
  const cellWidth = plotWidth / Math.max(1, xValues.length);
  const cellHeight = plotHeight / Math.max(1, yValues.length);
  const legendHeight = 162;
  const legendX = margin.left + plotWidth + legendGutter;
  const rowByCell = new Map(rows.map((row) => [`${row.x}\u0000${row.y}`, row]));
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    `<rect data-heatmap-matrix="true" x="0" y="0" width="${plotWidth}" height="${plotHeight}" fill="#f8fafc" stroke="#cbd5e1"/>`,
    ...yValues.flatMap((yValue, yIndex) => xValues.map((xValue, xIndex) => {
      const row = rowByCell.get(`${xValue}\u0000${yValue}`);
      const x = xIndex * cellWidth;
      const y = yIndex * cellHeight;
      const color = row ? colorForValue(row.value, min, max, { colorScale }) : "#f1f5f9";
      const title = row ? `${row.x} / ${row.y}: ${niceNumber(row.value)}` : `${xValue} / ${yValue}: missing`;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, cellWidth).toFixed(2)}" height="${Math.max(1, cellHeight).toFixed(2)}" fill="${color}" stroke="#ffffff" stroke-width="1"><title>${escapeXml(title)}</title></rect>`;
    })),
    ...xValues.map((value, index) => {
      const x = index * cellWidth + cellWidth / 2;
      const label = value.length > 14 ? `${value.slice(0, 13)}...` : value;
      return renderAngledCategoryTick({ x, plotHeight, label, title: value, angle: -34 });
    }),
    ...yValues.map((value, index) => {
      const y = index * cellHeight + cellHeight / 2 + 4;
      const label = value.length > 18 ? `${value.slice(0, 17)}...` : value;
      return `<text class="tick" x="-10" y="${y}" text-anchor="end">${escapeXml(label)}<title>${escapeXml(value)}</title></text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    "</g>",
    `<g data-heatmap-legend="true" transform="translate(${legendX.toFixed(2)} ${margin.top + 18})">`,
    ...Array.from({ length: legendHeight }, (_, index) => {
      const value = max - ((max - min) * index) / Math.max(1, legendHeight - 1);
      return `<rect data-heatmap-legend-bar="true" x="0" y="${index}" width="${legendBarWidth}" height="1" fill="${colorForValue(value, min, max, { colorScale })}"/>`;
    }),
    `<text class="legend" data-heatmap-legend-title="true" x="0" y="-18" text-anchor="start">${escapeXml(legendTitle)}</text>`,
    `<text class="tick" data-heatmap-legend-label="max" x="${legendBarWidth + legendLabelGap}" y="0" dominant-baseline="middle">${escapeXml(niceNumber(max))}</text>`,
    `<text class="tick" data-heatmap-legend-label="min" x="${legendBarWidth + legendLabelGap}" y="${legendHeight}" dominant-baseline="middle">${escapeXml(niceNumber(min))}</text>`,
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title,
    width,
    height,
    xLabel: options.xLabel,
    yLabel: options.yLabel,
    plot: parts.join("")
  });
}

export function plotRowsToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}
