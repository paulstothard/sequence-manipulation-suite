import "../vendor/d3/d3.min.js";
import { convertTableDataFormat } from "./table-data-format-converter.js";
import { exportDelimitedTable, findColumn, parseDelimitedTable } from "./table.js";
import {
  isStatisticsMissingValue,
  parseStatisticsNumber,
  normalizeStatisticsCell
} from "./statistics-utils.js";
import { escapeXml, makePlaceholderSvg } from "./plot-renderer.js";

const OUTPUT_FORMATS = new Set(["plot", "compact-heatmap", "comparison-table", "pair-table", "report"]);
const COMPARISON_TYPES = new Set(["auto", "numeric-numeric", "numeric-category", "category-category"]);
const PLOT_STYLES = new Set(["violin", "box"]);
const COLORS = ["#2563eb", "#0f766e", "#7c3aed", "#d97706", "#be123c", "#0369a1", "#4b5563", "#a33a3a"];

export const tableColumnComparisonColumns = [
  { id: "analysis", label: "Analysis", type: "string" },
  { id: "level_a", label: "Column A value", type: "string" },
  { id: "level_b", label: "Column B value", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "percent", label: "Percent", type: "number" },
  { id: "statistic", label: "Statistic", type: "string" },
  { id: "value", label: "Value", type: "number" },
  { id: "mean", label: "Mean", type: "number" },
  { id: "sd", label: "SD", type: "number" },
  { id: "min", label: "Min", type: "number" },
  { id: "q1", label: "Q1", type: "number" },
  { id: "median", label: "Median", type: "number" },
  { id: "q3", label: "Q3", type: "number" },
  { id: "max", label: "Max", type: "number" }
];

export const tableColumnComparisonPairColumns = [
  { id: "row_number", label: "Row", type: "number" },
  { id: "column_a", label: "Column A", type: "string" },
  { id: "column_b", label: "Column B", type: "string" },
  { id: "column_a_missing", label: "Column A missing", type: "string" },
  { id: "column_b_missing", label: "Column B missing", type: "string" },
  { id: "column_a_numeric", label: "Column A numeric", type: "number" },
  { id: "column_b_numeric", label: "Column B numeric", type: "number" }
];

function getD3() {
  return globalThis.d3 ?? null;
}

function coerceTableInput(input, options = {}) {
  if (input?.kind === "table" && Array.isArray(input.columns) && Array.isArray(input.rows)) {
    return {
      inputFormat: "structured table",
      columns: input.columns,
      rows: input.rows,
      warnings: []
    };
  }
  const inputFormat = String(options.inputFormat ?? "auto");
  const trimmed = String(input ?? "").trim();
  if (inputFormat === "json" || (inputFormat === "auto" && (trimmed.startsWith("[") || trimmed.startsWith("{")))) {
    const converted = convertTableDataFormat(input, { inputFormat: "json" });
    return {
      inputFormat: "json",
      columns: converted.columns,
      rows: converted.rows,
      warnings: converted.warnings
    };
  }
  const table = parseDelimitedTable(String(input ?? ""), {
    delimiter: inputFormat === "csv" ? "comma" : inputFormat === "tsv" ? "tab" : options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  return {
    inputFormat: inputFormat === "auto" ? table.delimiterId : inputFormat,
    columns: table.columns,
    rows: table.rows,
    warnings: table.warnings
  };
}

function normalizePositiveInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const numeric = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleSd(values, valueMean = mean(values)) {
  if (values.length < 2) return "";
  const variance = values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sampleCovariance(xValues, yValues, xMean = mean(xValues), yMean = mean(yValues)) {
  if (xValues.length < 2 || xValues.length !== yValues.length) return Number.NaN;
  let total = 0;
  for (let index = 0; index < xValues.length; index += 1) {
    total += (xValues[index] - xMean) * (yValues[index] - yMean);
  }
  return total / (xValues.length - 1);
}

function pearsonCorrelation(xValues, yValues) {
  if (xValues.length < 2 || xValues.length !== yValues.length) return Number.NaN;
  const xMean = mean(xValues);
  const yMean = mean(yValues);
  const denominator = Math.sqrt(sampleSd(xValues, xMean) ** 2 * sampleSd(yValues, yMean) ** 2);
  return denominator > 0 ? sampleCovariance(xValues, yValues, xMean, yMean) / denominator : Number.NaN;
}

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) return "";
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
}

function summarizeValues(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const valueMean = values.length > 0 ? mean(values) : Number.NaN;
  return {
    count: values.length,
    mean: round(valueMean),
    sd: round(sampleSd(values, valueMean)),
    min: round(sorted[0]),
    q1: round(quantile(sorted, 0.25)),
    median: round(quantile(sorted, 0.5)),
    q3: round(quantile(sorted, 0.75)),
    max: round(sorted[sorted.length - 1])
  };
}

function isMissing(value) {
  return isStatisticsMissingValue(value);
}

function isNumericColumn(rows, column) {
  let numericCount = 0;
  for (const row of rows) {
    const value = normalizeStatisticsCell(row[column.id]);
    if (isMissing(value)) continue;
    if (parseStatisticsNumber(value) === null) return false;
    numericCount += 1;
  }
  return numericCount > 0;
}

function resolveColumns(table, options, warnings) {
  const columnA = findColumn(table.columns, options.columnA) ?? table.columns[0];
  const columnB = findColumn(table.columns, options.columnB) ?? table.columns.find((column) => column.id !== columnA?.id);
  if (options.columnA && !findColumn(table.columns, options.columnA)) {
    warnings.push(`Column A "${options.columnA}" was not found; using "${columnA?.label ?? "none"}".`);
  }
  if (options.columnB && !findColumn(table.columns, options.columnB)) {
    warnings.push(`Column B "${options.columnB}" was not found; using "${columnB?.label ?? "none"}".`);
  }
  if (!columnA || !columnB) {
    warnings.push("At least two columns are required for a column comparison.");
  } else if (columnA.id === columnB.id) {
    warnings.push("Choose two different columns for comparison.");
  }
  return { columnA, columnB };
}

function comparisonTypeFor({ requestedType, aNumeric, bNumeric, warnings }) {
  if (requestedType !== "auto") {
    if (requestedType === "numeric-numeric" && (!aNumeric || !bNumeric)) {
      warnings.push("Numeric-vs-numeric was requested, but one selected column is not fully numeric; using category-vs-category.");
      return "category-category";
    }
    if (requestedType === "numeric-category" && aNumeric === bNumeric) {
      warnings.push("Numeric-vs-category was requested, but the selected columns are not one numeric and one categorical; using automatic comparison.");
    } else if (requestedType === "numeric-category") {
      return requestedType;
    } else if (requestedType === "category-category") {
      return requestedType;
    } else if (requestedType === "numeric-numeric") {
      return requestedType;
    }
  }
  if (aNumeric && bNumeric) return "numeric-numeric";
  if (aNumeric || bNumeric) return "numeric-category";
  return "category-category";
}

function makePairRows(rows, columnA, columnB, maxRows, warnings) {
  if (rows.length > maxRows) {
    warnings.push(`Row comparison table was limited to the first ${maxRows.toLocaleString()} row(s).`);
  }
  return rows.slice(0, maxRows).map((row, index) => {
    const aValue = normalizeStatisticsCell(row[columnA.id]);
    const bValue = normalizeStatisticsCell(row[columnB.id]);
    return {
      row_number: index + 1,
      column_a: aValue,
      column_b: bValue,
      column_a_missing: isMissing(aValue) ? "yes" : "no",
      column_b_missing: isMissing(bValue) ? "yes" : "no",
      column_a_numeric: parseStatisticsNumber(aValue) ?? "",
      column_b_numeric: parseStatisticsNumber(bValue) ?? ""
    };
  });
}

function missingnessRows(rows, columnA, columnB) {
  const counts = {
    complete_pair: 0,
    column_a_missing: 0,
    column_b_missing: 0,
    both_missing: 0
  };
  for (const row of rows) {
    const aMissing = isMissing(row[columnA.id]);
    const bMissing = isMissing(row[columnB.id]);
    if (aMissing && bMissing) counts.both_missing += 1;
    else if (aMissing) counts.column_a_missing += 1;
    else if (bMissing) counts.column_b_missing += 1;
    else counts.complete_pair += 1;
  }
  return Object.entries(counts).map(([key, count]) => ({
    analysis: "missingness",
    level_a: key.replaceAll("_", " "),
    level_b: "",
    count,
    percent: rows.length > 0 ? round((count / rows.length) * 100, 2) : 0,
    statistic: "",
    value: "",
    mean: "",
    sd: "",
    min: "",
    q1: "",
    median: "",
    q3: "",
    max: ""
  }));
}

function completeValues(rows, columnA, columnB) {
  return rows.map((row, index) => {
    const aRaw = normalizeStatisticsCell(row[columnA.id]);
    const bRaw = normalizeStatisticsCell(row[columnB.id]);
    return {
      index,
      aRaw,
      bRaw,
      aNumber: parseStatisticsNumber(aRaw),
      bNumber: parseStatisticsNumber(bRaw),
      complete: !isMissing(aRaw) && !isMissing(bRaw)
    };
  }).filter((row) => row.complete);
}

function numericNumericRows(complete) {
  const numericRows = complete
    .filter((row) => row.aNumber !== null && row.bNumber !== null)
    .map((row) => ({ x: row.aNumber, y: row.bNumber, index: row.index }));
  const xValues = numericRows.map((row) => row.x);
  const yValues = numericRows.map((row) => row.y);
  const xMean = xValues.length > 0 ? mean(xValues) : Number.NaN;
  const yMean = yValues.length > 0 ? mean(yValues) : Number.NaN;
  const xSd = sampleSd(xValues, xMean);
  const ySd = sampleSd(yValues, yMean);
  const r = pearsonCorrelation(xValues, yValues);
  const covariance = sampleCovariance(xValues, yValues, xMean, yMean);
  const slope = Number.isFinite(covariance) && Number.isFinite(xSd) && xSd > 0
    ? covariance / (xSd ** 2)
    : Number.NaN;
  const intercept = Number.isFinite(slope) ? yMean - slope * xMean : Number.NaN;
  const stats = [
    ["paired_n", numericRows.length],
    ["pearson_r", round(r)],
    ["r_squared", round(Number.isFinite(r) ? r ** 2 : Number.NaN)],
    ["sample_covariance", round(covariance)],
    ["linear_slope", round(slope)],
    ["linear_intercept", round(intercept)],
    ["column_a_mean", round(xMean)],
    ["column_a_sd", round(xSd)],
    ["column_b_mean", round(yMean)],
    ["column_b_sd", round(ySd)]
  ];
  return {
    points: numericRows,
    rows: stats.map(([statistic, value]) => ({
      analysis: "numeric vs numeric",
      level_a: "",
      level_b: "",
      count: statistic === "paired_n" ? value : "",
      percent: "",
      statistic,
      value: statistic === "paired_n" ? "" : value,
      mean: "",
      sd: "",
      min: "",
      q1: "",
      median: "",
      q3: "",
      max: ""
    }))
  };
}

function categoryLimitMap(values, maxCategories, warnings, label) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], undefined, { numeric: true }));
  const keep = new Set(ordered.slice(0, maxCategories).map(([value]) => value));
  if (ordered.length > maxCategories) {
    warnings.push(`${label} had ${ordered.length.toLocaleString()} category value(s); values outside the top ${maxCategories.toLocaleString()} were grouped as Other.`);
  }
  return (value) => keep.has(value) ? value : "Other";
}

function numericCategoryRows(complete, columnA, columnB, aNumeric, maxCategories, warnings) {
  const numericColumn = aNumeric ? columnA : columnB;
  const categoryColumn = aNumeric ? columnB : columnA;
  const valueKey = aNumeric ? "aNumber" : "bNumber";
  const categoryKey = aNumeric ? "bRaw" : "aRaw";
  const numericRows = complete.filter((row) => row[valueKey] !== null);
  const mapCategory = categoryLimitMap(numericRows.map((row) => row[categoryKey]), maxCategories, warnings, categoryColumn.label);
  const groups = new Map();
  for (const row of numericRows) {
    const group = mapCategory(row[categoryKey]);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row[valueKey]);
  }
  const summaries = [...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
    .map(([group, values]) => ({
      analysis: "numeric vs category",
      level_a: group,
      level_b: "",
      count: values.length,
      percent: numericRows.length > 0 ? round((values.length / numericRows.length) * 100, 2) : 0,
      statistic: "",
      value: "",
      ...summarizeValues(values)
    }));
  return {
    numericColumn,
    categoryColumn,
    values: numericRows.map((row) => ({
      group: mapCategory(row[categoryKey]),
      value: row[valueKey],
      index: row.index
    })),
    rows: summaries
  };
}

function categoryCategoryRows(complete, columnA, columnB, maxCategories, warnings) {
  const mapA = categoryLimitMap(complete.map((row) => row.aRaw), maxCategories, warnings, columnA.label);
  const mapB = categoryLimitMap(complete.map((row) => row.bRaw), maxCategories, warnings, columnB.label);
  const counts = new Map();
  const rowTotals = new Map();
  const columnTotals = new Map();
  for (const row of complete) {
    const a = mapA(row.aRaw);
    const b = mapB(row.bRaw);
    const key = `${a}\u0000${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    rowTotals.set(a, (rowTotals.get(a) ?? 0) + 1);
    columnTotals.set(b, (columnTotals.get(b) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("\u0000");
      return {
        analysis: "category vs category",
        level_a: a,
        level_b: b,
        count,
        percent: complete.length > 0 ? round((count / complete.length) * 100, 2) : 0,
        statistic: "cell_count",
        value: count,
        mean: "",
        sd: "",
        min: "",
        q1: "",
        median: "",
        q3: "",
        max: "",
        row_percent: rowTotals.get(a) > 0 ? round((count / rowTotals.get(a)) * 100, 2) : 0,
        column_percent: columnTotals.get(b) > 0 ? round((count / columnTotals.get(b)) * 100, 2) : 0
      };
    })
    .sort((left, right) => left.level_a.localeCompare(right.level_a, undefined, { numeric: true }) || left.level_b.localeCompare(right.level_b, undefined, { numeric: true }));
  return { rows };
}

function scale(value, min, max, rangeMin, rangeMax) {
  if (max === min) return (rangeMin + rangeMax) / 2;
  return rangeMin + ((value - min) / (max - min)) * (rangeMax - rangeMin);
}

function extent(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [0, 1];
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

function ticks(min, max, count = 5) {
  const d3Ticks = getD3()?.ticks?.(min, max, count);
  return d3Ticks?.length ? d3Ticks : Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
  return Number(value.toFixed(3)).toString();
}

function histogram(values, domain, binCount = 12) {
  const [min, max] = domain;
  const width = (max - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: min + index * width,
    end: index === binCount - 1 ? max : min + (index + 1) * width,
    count: 0
  }));
  for (const value of values) {
    const index = Math.max(0, Math.min(binCount - 1, Math.floor((value - min) / width)));
    bins[index].count += 1;
  }
  return bins;
}

function renderBaseSvg({ title, width = 980, height = 640, plot, xLabel, yLabel, subtitle = "" }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3" data-plot-renderer="sms3-d3">`,
    "<style>",
    ".title{font:700 21px system-ui,sans-serif;fill:#263238}",
    ".subtitle,.legend{font:12px system-ui,sans-serif;fill:#455a64}",
    ".axis{stroke:#455a64;stroke-width:1.2}",
    ".grid{stroke:#dbe4ea;stroke-width:1}",
    ".tick{font:11px system-ui,sans-serif;fill:#455a64}",
    ".label{font:13px system-ui,sans-serif;fill:#263238}",
    "</style>",
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="34" y="42">${escapeXml(title)}</text>`,
    subtitle ? `<text class="subtitle" x="34" y="68">${escapeXml(subtitle)}</text>` : "",
    plot,
    `<text class="label" x="${width / 2}" y="${height - 20}" text-anchor="middle">${escapeXml(xLabel)}</text>`,
    `<text class="label" transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle">${escapeXml(yLabel)}</text>`,
    "</svg>"
  ].join("");
}

function renderNumericNumericPlot(points, columnA, columnB, options = {}) {
  if (points.length === 0) {
    return makePlaceholderSvg("Column comparison plot", ["No complete numeric pairs were available."]);
  }
  const maxPointsDrawn = normalizePositiveInteger(options.maxPointsDrawn, 5000, 100, 50000);
  const drawnPoints = points.length > maxPointsDrawn ? points.slice(0, maxPointsDrawn) : points;
  const width = 980;
  const height = 680;
  const margin = { top: 102, right: 126, bottom: 78, left: 86 };
  const plotWidth = width - margin.left - margin.right - 90;
  const plotHeight = height - margin.top - margin.bottom - 80;
  const histSize = 72;
  const gap = 14;
  const xDomain = extent(points.map((point) => point.x));
  const yDomain = extent(points.map((point) => point.y));
  const xTicks = ticks(xDomain[0], xDomain[1]);
  const yTicks = ticks(yDomain[0], yDomain[1]);
  const xBins = histogram(points.map((point) => point.x), xDomain, 14);
  const yBins = histogram(points.map((point) => point.y), yDomain, 14);
  const maxXBin = Math.max(1, ...xBins.map((bin) => bin.count));
  const maxYBin = Math.max(1, ...yBins.map((bin) => bin.count));
  const plotX = margin.left;
  const plotY = margin.top + histSize + gap;
  const histTopY = margin.top;
  const histRightX = plotX + plotWidth + gap;
  const parts = [
    `<g>`,
    ...xBins.map((bin) => {
      const x1 = scale(bin.start, xDomain[0], xDomain[1], plotX, plotX + plotWidth);
      const x2 = scale(bin.end, xDomain[0], xDomain[1], plotX, plotX + plotWidth);
      const h = scale(bin.count, 0, maxXBin, 0, histSize);
      return `<rect x="${x1.toFixed(2)}" y="${(histTopY + histSize - h).toFixed(2)}" width="${Math.max(1, x2 - x1 - 1).toFixed(2)}" height="${h.toFixed(2)}" fill="#2563eb" fill-opacity="0.36"><title>${escapeXml(`${niceNumber(bin.start)} to ${niceNumber(bin.end)}: ${bin.count}`)}</title></rect>`;
    }),
    ...yBins.map((bin) => {
      const y1 = scale(bin.start, yDomain[0], yDomain[1], plotY + plotHeight, plotY);
      const y2 = scale(bin.end, yDomain[0], yDomain[1], plotY + plotHeight, plotY);
      const w = scale(bin.count, 0, maxYBin, 0, histSize);
      return `<rect x="${histRightX}" y="${Math.min(y1, y2).toFixed(2)}" width="${w.toFixed(2)}" height="${Math.max(1, Math.abs(y2 - y1) - 1).toFixed(2)}" fill="#0f766e" fill-opacity="0.36"><title>${escapeXml(`${niceNumber(bin.start)} to ${niceNumber(bin.end)}: ${bin.count}`)}</title></rect>`;
    }),
    `<g transform="translate(${plotX} ${plotY})">`,
    ...xTicks.map((tick) => {
      const x = scale(tick, xDomain[0], xDomain[1], 0, plotWidth);
      return `<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/><text class="tick" x="${x}" y="${plotHeight + 20}" text-anchor="middle">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = scale(tick, yDomain[0], yDomain[1], plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...drawnPoints.map((point) => {
      const x = scale(point.x, xDomain[0], xDomain[1], 0, plotWidth);
      const y = scale(point.y, yDomain[0], yDomain[1], plotHeight, 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="#2563eb" fill-opacity="0.72" stroke="#ffffff" stroke-width="0.7"><title>${escapeXml(`Row ${point.index + 1}: ${point.x}, ${point.y}`)}</title></circle>`;
    }),
    "</g>",
    `<text class="legend" x="${plotX}" y="${histTopY - 10}">${escapeXml(columnA.label)} marginal distribution</text>`,
    `<text class="legend" x="${histRightX}" y="${plotY - 10}">${escapeXml(columnB.label)} distribution</text>`,
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title || "Column comparison",
    subtitle: `${points.length.toLocaleString()} complete numeric pair(s); top and right histograms show marginal distributions.`,
    width,
    height,
    xLabel: columnA.label,
    yLabel: columnB.label,
    plot: parts.join("")
  });
}

function densityRowsForGroups(values, groupSummaries, gridPoints) {
  const rows = [];
  const allValues = values.map((row) => row.value);
  const domain = extent(allValues);
  for (const summary of groupSummaries) {
    const groupValues = values.filter((row) => row.group === summary.level_a).map((row) => row.value);
    const sorted = groupValues.slice().sort((left, right) => left - right);
    const valueRange = Math.max(1e-9, domain[1] - domain[0]);
    const sd = sampleSd(groupValues);
    const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
    const robustScale = iqr > 0 ? Math.min(sd || iqr / 1.34, iqr / 1.34) : sd;
    const bandwidth = Math.max(1e-9, 0.9 * (robustScale || valueRange / 8) * groupValues.length ** (-1 / 5));
    const grid = Array.from({ length: gridPoints }, (_, index) => domain[0] + ((domain[1] - domain[0]) * index) / Math.max(1, gridPoints - 1));
    const densities = grid.map((value) => {
      const total = groupValues.reduce((sum, observed) => {
        const z = (value - observed) / bandwidth;
        return sum + Math.exp(-0.5 * z * z);
      }, 0);
      return { value, density: groupValues.length > 0 ? total / (groupValues.length * bandwidth * Math.sqrt(2 * Math.PI)) : 0 };
    });
    const maxDensity = Math.max(1e-12, ...densities.map((row) => row.density));
    rows.push(...densities.map((row) => ({
      group: summary.level_a,
      value: row.value,
      scaled_width: row.density / maxDensity
    })));
  }
  return rows;
}

function renderNumericCategoryPlot(result, options = {}) {
  const summaries = result.rows;
  const values = result.values;
  if (summaries.length === 0) {
    return makePlaceholderSvg("Column comparison plot", ["No complete numeric/category pairs were available."]);
  }
  const style = PLOT_STYLES.has(options.plotStyle) ? options.plotStyle : "violin";
  const maxDotsDrawn = normalizePositiveInteger(options.maxDotsDrawn, 1000, 0, 10000);
  const gridPoints = normalizePositiveInteger(options.gridPoints, 80, 24, 200);
  const width = 940;
  const height = 620;
  const margin = { top: 96, right: 42, bottom: 112, left: 86 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const domain = extent(values.map((row) => row.value));
  const yTicks = ticks(domain[0], domain[1]);
  const groupWidth = plotWidth / Math.max(1, summaries.length);
  const maxHalfWidth = Math.min(68, groupWidth * 0.36);
  const densities = style === "violin" ? densityRowsForGroups(values, summaries, gridPoints) : [];
  const points = maxDotsDrawn === 0 ? [] : values.slice(0, maxDotsDrawn);
  const jitter = (point, limit) => {
    const seed = `${point.group}:${point.index}:${point.value}`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
    return ((hash % 1000) / 999 - 0.5) * 2 * limit;
  };
  const densityByGroup = new Map();
  for (const density of densities) {
    densityByGroup.set(density.group, [...(densityByGroup.get(density.group) ?? []), density]);
  }
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...yTicks.map((tick) => {
      const y = scale(tick, domain[0], domain[1], plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...summaries.map((summary, index) => {
      const centerX = index * groupWidth + groupWidth / 2;
      const color = COLORS[index % COLORS.length];
      const q1 = scale(summary.q1, domain[0], domain[1], plotHeight, 0);
      const q3 = scale(summary.q3, domain[0], domain[1], plotHeight, 0);
      const median = scale(summary.median, domain[0], domain[1], plotHeight, 0);
      const min = scale(summary.min, domain[0], domain[1], plotHeight, 0);
      const max = scale(summary.max, domain[0], domain[1], plotHeight, 0);
      const label = String(summary.level_a).length > 16 ? `${String(summary.level_a).slice(0, 15)}...` : String(summary.level_a);
      const density = (densityByGroup.get(summary.level_a) ?? []).sort((left, right) => left.value - right.value);
      const left = density.map((row) => `${centerX - row.scaled_width * maxHalfWidth},${scale(row.value, domain[0], domain[1], plotHeight, 0)}`);
      const right = density.slice().reverse().map((row) => `${centerX + row.scaled_width * maxHalfWidth},${scale(row.value, domain[0], domain[1], plotHeight, 0)}`);
      const violinPath = style === "violin" && left.length > 0 ? `M${left.join(" L")} L${right.join(" L")} Z` : "";
      return [
        violinPath ? `<path d="${violinPath}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.5"><title>${escapeXml(`${summary.level_a}: n=${summary.count}, median=${summary.median}`)}</title></path>` : "",
        style === "box" ? `<line x1="${centerX}" x2="${centerX}" y1="${max}" y2="${min}" stroke="#455a64" stroke-width="1.4"/>` : "",
        style === "box" ? `<rect x="${centerX - maxHalfWidth * 0.42}" y="${Math.min(q1, q3)}" width="${maxHalfWidth * 0.84}" height="${Math.max(1, Math.abs(q3 - q1))}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.5"/>` : "",
        style === "violin" ? `<line x1="${centerX}" x2="${centerX}" y1="${q3}" y2="${q1}" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-opacity="0.72"/>` : "",
        `<line x1="${centerX - maxHalfWidth * 0.42}" x2="${centerX + maxHalfWidth * 0.42}" y1="${median}" y2="${median}" stroke="#0f172a" stroke-width="2.2"/>`,
        `<text class="tick" x="${centerX}" y="${plotHeight + 30}" text-anchor="middle" transform="rotate(-28 ${centerX} ${plotHeight + 30})">${escapeXml(label)}<title>${escapeXml(summary.level_a)}</title></text>`
      ].join("");
    }),
    ...points.map((point) => {
      const groupIndex = summaries.findIndex((summary) => summary.level_a === point.group);
      if (groupIndex < 0) return "";
      const centerX = groupIndex * groupWidth + groupWidth / 2;
      const x = centerX + jitter(point, Math.min(24, maxHalfWidth * 0.36));
      const y = scale(point.value, domain[0], domain[1], plotHeight, 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.4" fill="#0f172a" fill-opacity="0.42" stroke="#ffffff" stroke-opacity="0.75" stroke-width="0.8"><title>${escapeXml(`${point.group}, row ${point.index + 1}: ${point.value}`)}</title></circle>`;
    }),
    "</g>"
  ];
  return renderBaseSvg({
    title: options.title || "Column comparison",
    subtitle: `${result.numericColumn.label} by ${result.categoryColumn.label}; ${style === "violin" ? "violin widths show density" : "boxes show quartiles"}.`,
    width,
    height,
    xLabel: result.categoryColumn.label,
    yLabel: result.numericColumn.label,
    plot: parts.join("")
  });
}

function renderCategoryCategoryPlot(result, columnA, columnB, options = {}) {
  const rows = result.rows;
  if (rows.length === 0) {
    return makePlaceholderSvg("Column comparison plot", ["No complete category/category pairs were available."]);
  }
  const aValues = [...new Set(rows.map((row) => row.level_a))];
  const bValues = [...new Set(rows.map((row) => row.level_b))];
  const width = 920;
  const height = 600;
  const margin = { top: 92, right: 110, bottom: 110, left: 150 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const cellWidth = plotWidth / Math.max(1, bValues.length);
  const cellHeight = plotHeight / Math.max(1, aValues.length);
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const rowByCell = new Map(rows.map((row) => [`${row.level_a}\u0000${row.level_b}`, row]));
  const colorForCount = (count) => {
    const t = count / maxCount;
    const d3 = getD3();
    return d3?.interpolateBlues ? d3.interpolateBlues(0.12 + t * 0.78) : "#2563eb";
  };
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...aValues.flatMap((aValue, rowIndex) => bValues.map((bValue, columnIndex) => {
      const row = rowByCell.get(`${aValue}\u0000${bValue}`);
      const x = columnIndex * cellWidth;
      const y = rowIndex * cellHeight;
      const count = row?.count ?? 0;
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, cellWidth).toFixed(2)}" height="${Math.max(1, cellHeight).toFixed(2)}" fill="${colorForCount(count)}" stroke="#ffffff" stroke-width="1"><title>${escapeXml(`${aValue} / ${bValue}: ${count}`)}</title></rect>`;
    })),
    ...bValues.map((value, index) => {
      const x = index * cellWidth + cellWidth / 2;
      const label = String(value).length > 14 ? `${String(value).slice(0, 13)}...` : String(value);
      return `<text class="tick" x="${x}" y="${plotHeight + 30}" text-anchor="middle" transform="rotate(-32 ${x} ${plotHeight + 30})">${escapeXml(label)}<title>${escapeXml(value)}</title></text>`;
    }),
    ...aValues.map((value, index) => {
      const y = index * cellHeight + cellHeight / 2 + 4;
      const label = String(value).length > 18 ? `${String(value).slice(0, 17)}...` : String(value);
      return `<text class="tick" x="-10" y="${y}" text-anchor="end">${escapeXml(label)}<title>${escapeXml(value)}</title></text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    "</g>",
    `<text class="legend" x="${width - 92}" y="${margin.top}">Count</text>`,
    ...Array.from({ length: 120 }, (_, index) => {
      const count = maxCount - (maxCount * index) / 119;
      return `<rect x="${width - 88}" y="${margin.top + 18 + index}" width="16" height="1" fill="${colorForCount(count)}"/>`;
    }),
    `<text class="tick" x="${width - 66}" y="${margin.top + 22}">${escapeXml(maxCount)}</text>`,
    `<text class="tick" x="${width - 66}" y="${margin.top + 138}">0</text>`
  ];
  return renderBaseSvg({
    title: options.title || "Column comparison",
    subtitle: "Category-vs-category contingency heatmap.",
    width,
    height,
    xLabel: columnB.label,
    yLabel: columnA.label,
    plot: parts.join("")
  });
}

function truncateLabel(value, maxLength) {
  const label = String(value ?? "");
  return label.length > maxLength ? `${label.slice(0, Math.max(1, maxLength - 1))}...` : label;
}

function compactColor(count, maxCount) {
  if (count <= 0) return "#f8fafc";
  const d3 = getD3();
  const t = Math.max(0, Math.min(1, count / Math.max(1, maxCount)));
  return d3?.interpolateViridis ? d3.interpolateViridis(0.16 + t * 0.78) : d3?.interpolateBlues ? d3.interpolateBlues(0.18 + t * 0.78) : "#2563eb";
}

function renderCompactMatrixSvg({ title, subtitle, xLabel, yLabel, xLabels, yLabels, counts }) {
  const width = 760;
  const height = 520;
  const margin = { top: 82, right: 88, bottom: 92, left: 138 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const cellWidth = plotWidth / Math.max(1, xLabels.length);
  const cellHeight = plotHeight / Math.max(1, yLabels.length);
  const maxCount = Math.max(1, ...counts.flatMap((row) => row));
  const parts = [
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...yLabels.flatMap((yLabelValue, rowIndex) => xLabels.map((xLabelValue, columnIndex) => {
      const count = counts[rowIndex]?.[columnIndex] ?? 0;
      return `<rect x="${(columnIndex * cellWidth).toFixed(2)}" y="${(rowIndex * cellHeight).toFixed(2)}" width="${Math.max(1, cellWidth).toFixed(2)}" height="${Math.max(1, cellHeight).toFixed(2)}" fill="${compactColor(count, maxCount)}" stroke="#ffffff" stroke-width="1"><title>${escapeXml(`${xLabelValue} / ${yLabelValue}: ${count}`)}</title></rect>`;
    })),
    ...xLabels.map((label, index) => {
      const x = index * cellWidth + cellWidth / 2;
      const text = truncateLabel(label, Math.max(6, Math.floor(cellWidth / 7)));
      return `<text class="tick" x="${x.toFixed(2)}" y="${plotHeight + 26}" text-anchor="middle" transform="rotate(-34 ${x.toFixed(2)} ${plotHeight + 26})">${escapeXml(text)}<title>${escapeXml(label)}</title></text>`;
    }),
    ...yLabels.map((label, index) => {
      const y = index * cellHeight + cellHeight / 2 + 4;
      return `<text class="tick" x="-10" y="${y.toFixed(2)}" text-anchor="end">${escapeXml(truncateLabel(label, 18))}<title>${escapeXml(label)}</title></text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    "</g>",
    `<text class="legend" x="${width - 78}" y="${margin.top}">Count</text>`,
    ...Array.from({ length: 116 }, (_, index) => {
      const count = maxCount - (maxCount * index) / 115;
      return `<rect x="${width - 76}" y="${margin.top + 18 + index}" width="16" height="1" fill="${compactColor(count, maxCount)}"/>`;
    }),
    `<text class="tick" x="${width - 54}" y="${margin.top + 23}">${escapeXml(maxCount)}</text>`,
    `<text class="tick" x="${width - 54}" y="${margin.top + 134}">0</text>`
  ];
  return renderBaseSvg({
    title,
    subtitle,
    width,
    height,
    xLabel,
    yLabel,
    plot: parts.join("")
  });
}

function binLabel(start, end) {
  return niceNumber((start + end) / 2);
}

function compactNumericNumericHeatmap(result, options = {}) {
  const points = result.plotData.points ?? [];
  if (points.length === 0) {
    return makePlaceholderSvg("Compact column heat map", ["No complete numeric pairs were available."]);
  }
  const binCount = 12;
  const xDomain = extent(points.map((point) => point.x));
  const yDomain = extent(points.map((point) => point.y));
  const xStep = (xDomain[1] - xDomain[0]) / binCount || 1;
  const yStep = (yDomain[1] - yDomain[0]) / binCount || 1;
  const counts = Array.from({ length: binCount }, () => Array.from({ length: binCount }, () => 0));
  for (const point of points) {
    const xIndex = Math.max(0, Math.min(binCount - 1, Math.floor((point.x - xDomain[0]) / xStep)));
    const yIndex = Math.max(0, Math.min(binCount - 1, Math.floor((point.y - yDomain[0]) / yStep)));
    counts[binCount - 1 - yIndex][xIndex] += 1;
  }
  const xLabels = Array.from({ length: binCount }, (_, index) => binLabel(xDomain[0] + index * xStep, xDomain[0] + (index + 1) * xStep));
  const yLabels = Array.from({ length: binCount }, (_, index) => {
    const reversedIndex = binCount - 1 - index;
    return binLabel(yDomain[0] + reversedIndex * yStep, yDomain[0] + (reversedIndex + 1) * yStep);
  });
  return renderCompactMatrixSvg({
    title: options.title || "Compact column heat map",
    subtitle: `${points.length.toLocaleString()} complete numeric pair(s), binned into a compact density matrix.`,
    xLabel: result.columnA.label,
    yLabel: result.columnB.label,
    xLabels,
    yLabels,
    counts
  });
}

function compactNumericCategoryHeatmap(result, options = {}) {
  const values = result.plotData.values ?? [];
  const summaries = result.plotData.rows ?? [];
  if (values.length === 0 || summaries.length === 0) {
    return makePlaceholderSvg("Compact column heat map", ["No complete numeric/category pairs were available."]);
  }
  const binCount = 12;
  const domain = extent(values.map((row) => row.value));
  const step = (domain[1] - domain[0]) / binCount || 1;
  const groups = summaries.map((summary) => summary.level_a);
  const groupIndex = new Map(groups.map((group, index) => [group, index]));
  const counts = Array.from({ length: groups.length }, () => Array.from({ length: binCount }, () => 0));
  for (const row of values) {
    const yIndex = groupIndex.get(row.group);
    if (yIndex === undefined) continue;
    const xIndex = Math.max(0, Math.min(binCount - 1, Math.floor((row.value - domain[0]) / step)));
    counts[yIndex][xIndex] += 1;
  }
  const xLabels = Array.from({ length: binCount }, (_, index) => binLabel(domain[0] + index * step, domain[0] + (index + 1) * step));
  return renderCompactMatrixSvg({
    title: options.title || "Compact column heat map",
    subtitle: `${values.length.toLocaleString()} complete numeric/category pair(s), binned by ${result.plotData.numericColumn.label}.`,
    xLabel: result.plotData.numericColumn.label,
    yLabel: result.plotData.categoryColumn.label,
    xLabels,
    yLabels: groups,
    counts
  });
}

function compactCategoryCategoryHeatmap(result, options = {}) {
  const rows = result.plotData.rows ?? [];
  if (rows.length === 0) {
    return makePlaceholderSvg("Compact column heat map", ["No complete category/category pairs were available."]);
  }
  const xLabels = [...new Set(rows.map((row) => row.level_b))];
  const yLabels = [...new Set(rows.map((row) => row.level_a))];
  const xIndex = new Map(xLabels.map((label, index) => [label, index]));
  const yIndex = new Map(yLabels.map((label, index) => [label, index]));
  const counts = Array.from({ length: yLabels.length }, () => Array.from({ length: xLabels.length }, () => 0));
  for (const row of rows) {
    counts[yIndex.get(row.level_a)][xIndex.get(row.level_b)] = row.count;
  }
  return renderCompactMatrixSvg({
    title: options.title || "Compact column heat map",
    subtitle: `${rows.length.toLocaleString()} observed category combination(s).`,
    xLabel: result.columnB.label,
    yLabel: result.columnA.label,
    xLabels,
    yLabels,
    counts
  });
}

function renderCompactHeatmap(result, options = {}) {
  if (result.comparisonType === "numeric-numeric") {
    return compactNumericNumericHeatmap(result, options);
  }
  if (result.comparisonType === "numeric-category") {
    return compactNumericCategoryHeatmap(result, options);
  }
  return compactCategoryCategoryHeatmap(result, options);
}

function makeReport(result) {
  const lines = [
    "Table column comparison",
    `Column A: ${result.columnA.label} (${result.aType})`,
    `Column B: ${result.columnB.label} (${result.bType})`,
    `Comparison type: ${result.comparisonType.replace("-", " vs ")}`,
    `Input rows: ${result.table.rows.length}`,
    `Complete pairs: ${result.completeCount}`,
    "",
    "Missingness:",
    ...result.missingRows.map((row) => `- ${row.level_a}: ${row.count} (${row.percent}%)`),
    "",
    "Comparison summary:",
    ...result.comparisonRows.slice(0, 20).map((row) => {
      if (result.comparisonType === "numeric-numeric") {
        return `- ${row.statistic}: ${row.count || row.value}`;
      }
      if (result.comparisonType === "numeric-category") {
        return `- ${row.level_a}: n=${row.count}, median=${row.median}, mean=${row.mean}`;
      }
      return `- ${row.level_a} / ${row.level_b}: ${row.count} (${row.percent}%)`;
    })
  ];
  return lines.join("\n").trimEnd() + "\n";
}

export function analyzeTableColumnComparison(input, options = {}) {
  const warnings = [];
  const table = coerceTableInput(input, options);
  warnings.push(...table.warnings);
  if (table.columns.length < 2) {
    const fallback = {
      table,
      columnA: { id: "column_a", label: "Column A" },
      columnB: { id: "column_b", label: "Column B" },
      aType: "unknown",
      bType: "unknown",
      comparisonType: "category-category",
      completeCount: 0,
      comparisonRows: [],
      missingRows: [],
      pairRows: [],
      svg: makePlaceholderSvg("Column comparison", ["At least two table columns are required."]),
      compactHeatmapSvg: makePlaceholderSvg("Compact column heat map", ["At least two table columns are required."]),
      warnings: warnings.length > 0 ? warnings : ["At least two table columns are required."]
    };
    return { ...fallback, report: makeReport(fallback) };
  }
  const maxPairRows = normalizePositiveInteger(options.maxPairRows, 10000, 1, 1000000);
  const maxCategories = normalizePositiveInteger(options.maxCategories, 20, 2, 100);
  const requestedType = COMPARISON_TYPES.has(options.comparisonType) ? options.comparisonType : "auto";
  const { columnA, columnB } = resolveColumns(table, options, warnings);
  const aNumeric = isNumericColumn(table.rows, columnA);
  const bNumeric = isNumericColumn(table.rows, columnB);
  const comparisonType = comparisonTypeFor({ requestedType, aNumeric, bNumeric, warnings });
  const complete = completeValues(table.rows, columnA, columnB);
  const missingRows = missingnessRows(table.rows, columnA, columnB);
  const pairRows = makePairRows(table.rows, columnA, columnB, maxPairRows, warnings);

  let typedResult;
  let svg;
  if (comparisonType === "numeric-numeric") {
    typedResult = numericNumericRows(complete);
    svg = renderNumericNumericPlot(typedResult.points, columnA, columnB, options);
  } else if (comparisonType === "numeric-category") {
    typedResult = numericCategoryRows(complete, columnA, columnB, aNumeric, maxCategories, warnings);
    svg = renderNumericCategoryPlot(typedResult, options);
  } else {
    typedResult = categoryCategoryRows(complete, columnA, columnB, maxCategories, warnings);
    svg = renderCategoryCategoryPlot(typedResult, columnA, columnB, options);
  }

  const result = {
    table,
    inputFormat: table.inputFormat,
    columnA,
    columnB,
    aType: aNumeric ? "numeric" : "category",
    bType: bNumeric ? "numeric" : "category",
    comparisonType,
    completeCount: complete.length,
    comparisonRows: [...typedResult.rows, ...missingRows],
    missingRows,
    pairRows,
    plotData: typedResult,
    svg,
    warnings
  };
  return { ...result, compactHeatmapSvg: renderCompactHeatmap(result, options), report: makeReport(result) };
}

export function tableColumnComparisonRowsToTsv(rows, columns = tableColumnComparisonColumns) {
  return exportDelimitedTable(columns, rows, "\t");
}

export function normalizeTableColumnComparisonOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "plot";
}
