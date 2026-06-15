import "../vendor/d3/d3.min.js";
import { escapeXml } from "./plot-renderer.js";
import { parseStatisticsNumber } from "./statistics-utils.js";
import { findColumn, parseDelimitedTable } from "./table.js";
import { twoTailedPValue } from "./hypothesis-tests.js";

export const simpleLinearRegressionColumns = [
  { id: "model", label: "Model", type: "string" },
  { id: "x_column", label: "X column", type: "string" },
  { id: "y_column", label: "Y column", type: "string" },
  { id: "n", label: "n", type: "number" },
  { id: "intercept", label: "Intercept", type: "number" },
  { id: "slope", label: "Slope", type: "number" },
  { id: "r", label: "Pearson r", type: "number" },
  { id: "r_squared", label: "R squared", type: "number" },
  { id: "residual_standard_error", label: "Residual standard error", type: "number" },
  { id: "df", label: "df", type: "number" },
  { id: "slope_t", label: "Slope t", type: "number" },
  { id: "slope_p_value", label: "Slope p value", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const simpleLinearRegressionFitColumns = [
  { id: "label", label: "Label", type: "string" },
  { id: "group", label: "Group", type: "string" },
  { id: "x", label: "X", type: "number" },
  { id: "y", label: "Y", type: "number" },
  { id: "fitted", label: "Fitted", type: "number" },
  { id: "residual", label: "Residual", type: "number" }
];

const COLORS = ["#2563eb", "#0f766e", "#a33a3a", "#7c3aed", "#d97706", "#0369a1", "#be123c", "#4b5563"];

function getD3() {
  return globalThis.d3 ?? null;
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  const d3 = getD3();
  if (d3?.scaleLinear) {
    return d3.scaleLinear().domain([domainMin, domainMax]).range([rangeMin, rangeMax])(value);
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
  return Number(value.toFixed(3)).toString();
}

function makeAxisTicks(min, max, count = 5) {
  const d3 = getD3();
  if (d3?.scaleLinear) {
    const ticks = d3.scaleLinear().domain([min, max]).nice(count).ticks(count);
    if (ticks.length > 0) {
      return ticks;
    }
  }
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

function rowsToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function simpleLinearRegressionRowsToTsv(rows) {
  return rowsToTsv(simpleLinearRegressionColumns, rows);
}

export function simpleLinearRegressionFitRowsToTsv(rows) {
  return rowsToTsv(simpleLinearRegressionFitColumns, rows);
}

function groupColor(group, groups) {
  return COLORS[Math.max(0, groups.indexOf(group)) % COLORS.length];
}

function renderRegressionSvg(result, options = {}) {
  const rows = result.fitRows ?? [];
  if (rows.length === 0) {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="360" viewBox="0 0 900 360" role="img" aria-label="Simple linear regression" data-plot-foundation="d3-regression-svg" data-plot-renderer="sms3-d3">',
      '<rect width="900" height="360" fill="white"/>',
      '<text x="34" y="42" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#263238">Simple linear regression</text>',
      '<text x="34" y="88" font-family="system-ui, sans-serif" font-size="14" fill="#455a64">No numeric paired rows were available.</text>',
      "</svg>"
    ].join("");
  }
  const width = 920;
  const height = 560;
  const showLegend = result.groupColumn !== null;
  const margin = { top: 70, right: showLegend ? 150 : 36, bottom: 74, left: 86 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const [xMin, xMax] = extent(rows.map((row) => row.x));
  const predicted = [xMin, xMax].map((x) => result.intercept + result.slope * x);
  const [yMin, yMax] = extent([...rows.map((row) => row.y), ...predicted]);
  const xTicks = makeAxisTicks(xMin, xMax).filter((tick) => tick >= xMin && tick <= xMax);
  const yTicks = makeAxisTicks(yMin, yMax).filter((tick) => tick >= yMin && tick <= yMax);
  const groups = [...new Set(rows.map((row) => row.group || "Data"))];
  const line = {
    x1: scale(xMin, xMin, xMax, 0, plotWidth),
    y1: scale(predicted[0], yMin, yMax, plotHeight, 0),
    x2: scale(xMax, xMin, xMax, 0, plotWidth),
    y2: scale(predicted[1], yMin, yMax, plotHeight, 0)
  };
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(options.title || "Simple linear regression")}" data-plot-foundation="d3-regression-svg" data-plot-renderer="sms3-d3">`,
    "<style>",
    ".title{font:700 20px system-ui,sans-serif;fill:#263238}",
    ".axis{stroke:#455a64;stroke-width:1.2}",
    ".grid{stroke:#d9e2e8;stroke-width:1}",
    ".tick{font:11px system-ui,sans-serif;fill:#455a64}",
    ".label{font:13px system-ui,sans-serif;fill:#263238}",
    ".legend{font:12px system-ui,sans-serif;fill:#263238}",
    "</style>",
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="34" y="34">${escapeXml(options.title || "Simple linear regression")}</text>`,
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
    `<line x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="#111827" stroke-width="2.2"/>`,
    ...rows.map((row) => {
      const x = scale(row.x, xMin, xMax, 0, plotWidth);
      const y = scale(row.y, yMin, yMax, plotHeight, 0);
      const color = groupColor(row.group || "Data", groups);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.6" fill="${color}" fill-opacity="0.8"><title>${escapeXml(`${row.label}: x=${row.x}, y=${row.y}, fitted=${row.fitted}`)}</title></circle>`;
    }),
    "</g>",
    `<text class="label" x="${width / 2}" y="${height - 18}" text-anchor="middle">${escapeXml(result.xColumn?.label ?? "X")}</text>`,
    `<text class="label" transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle">${escapeXml(result.yColumn?.label ?? "Y")}</text>`,
    `<text class="legend" x="34" y="${height - 44}">y = ${escapeXml(niceNumber(result.intercept))} + ${escapeXml(niceNumber(result.slope))}x; R^2 = ${escapeXml(niceNumber(result.rSquared))}</text>`
  ];
  if (showLegend) {
    parts.push(...groups.slice(0, 16).map((group, index) => {
      const y = 76 + index * 20;
      return `<rect x="${width - 128}" y="${y - 10}" width="10" height="10" fill="${groupColor(group, groups)}"/><text class="legend" x="${width - 112}" y="${y}">${escapeXml(group)}</text>`;
    }));
  }
  parts.push("</svg>");
  return parts.join("");
}

export function calculateSimpleLinearRegression(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const warnings = [...table.warnings];
  const numericColumns = table.columns.filter((column) => column.type === "number");
  const xColumn =
    findColumn(table.columns, options.xColumn) ??
    findColumn(table.columns, "dose_uM") ??
    numericColumns[0];
  const yColumn =
    findColumn(table.columns, options.yColumn) ??
    findColumn(table.columns, "response") ??
    numericColumns.find((column) => column.id !== xColumn?.id);
  const labelColumn = findColumn(table.columns, options.labelColumn) ?? table.columns[0] ?? null;
  const groupColumn = findColumn(table.columns, options.groupColumn);
  if (!xColumn || !yColumn) {
    warnings.push("Two numeric columns are required for simple linear regression.");
    return { table, rows: [], fitRows: [], warnings, report: makeSimpleLinearRegressionReport({ rows: [], fitRows: [], warnings }), svg: renderRegressionSvg({ fitRows: [] }, options) };
  }

  let skipped = 0;
  const fitRows = [];
  for (let index = 0; index < table.rows.length; index += 1) {
    const row = table.rows[index];
    const x = parseStatisticsNumber(row[xColumn.id]);
    const y = parseStatisticsNumber(row[yColumn.id]);
    if (x === null || y === null) {
      skipped += 1;
      continue;
    }
    fitRows.push({
      label: String(row[labelColumn?.id] ?? `Row ${index + 1}`),
      group: groupColumn ? String(row[groupColumn.id] ?? "") : "Data",
      x,
      y,
      fitted: "",
      residual: ""
    });
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without numeric values for both selected regression columns.`);
  }
  if (fitRows.length < 3) {
    warnings.push("At least three complete x/y pairs are required to calculate slope p values and residual standard error.");
    return { table, xColumn, yColumn, groupColumn, rows: [], fitRows, warnings, report: makeSimpleLinearRegressionReport({ rows: [], fitRows, warnings }), svg: renderRegressionSvg({ fitRows: [], xColumn, yColumn, groupColumn }, options) };
  }

  const xValues = fitRows.map((row) => row.x);
  const yValues = fitRows.map((row) => row.y);
  const xMean = mean(xValues);
  const yMean = mean(yValues);
  const sxx = xValues.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const syy = yValues.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const sxy = fitRows.reduce((sum, row) => sum + (row.x - xMean) * (row.y - yMean), 0);
  if (sxx === 0) {
    warnings.push("The selected x column has zero variance; a regression slope cannot be calculated.");
    return { table, xColumn, yColumn, groupColumn, rows: [], fitRows, warnings, report: makeSimpleLinearRegressionReport({ rows: [], fitRows, warnings }), svg: renderRegressionSvg({ fitRows: [], xColumn, yColumn, groupColumn }, options) };
  }
  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;
  let sse = 0;
  for (const row of fitRows) {
    row.fitted = round(intercept + slope * row.x);
    row.residual = round(row.y - row.fitted);
    sse += (row.y - (intercept + slope * row.x)) ** 2;
  }
  const df = fitRows.length - 2;
  const mse = sse / df;
  const residualStandardError = Math.sqrt(mse);
  const slopeSe = Math.sqrt(mse / sxx);
  const slopeT = slopeSe > 0 ? slope / slopeSe : Number.POSITIVE_INFINITY;
  const slopePValue = Number.isFinite(slopeT) ? twoTailedPValue(slopeT, df) : 0;
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : Number.NaN;
  const rSquared = syy > 0 ? 1 - sse / syy : Number.NaN;
  const suitabilityNotes = [
    fitRows.length < 8 ? "Small sample size; inspect residuals and outliers before relying on the p value." : "",
    "The fitted line assumes independent observations, an approximately linear relationship, and roughly constant residual variance."
  ].filter(Boolean).join(" ");
  if (fitRows.length < 8) warnings.push("Small regression sample size; inspect residuals and outliers.");
  const interpretation = slopePValue < 0.05
    ? "The slope p value is below 0.05 for the selected x and y columns."
    : "The slope p value is not below 0.05 for the selected x and y columns.";
  const row = {
    model: "Simple linear regression",
    x_column: xColumn.label,
    y_column: yColumn.label,
    n: fitRows.length,
    intercept: round(intercept),
    slope: round(slope),
    r: round(r),
    r_squared: round(rSquared),
    residual_standard_error: round(residualStandardError),
    df,
    slope_t: round(slopeT),
    slope_p_value: round(slopePValue, 8),
    interpretation,
    suitability_notes: suitabilityNotes
  };
  const result = {
    table,
    xColumn,
    yColumn,
    groupColumn,
    rows: [row],
    fitRows,
    warnings,
    intercept,
    slope,
    r,
    rSquared,
    report: "",
    svg: ""
  };
  result.report = makeSimpleLinearRegressionReport(result);
  result.svg = renderRegressionSvg(result, options);
  return result;
}

export function makeSimpleLinearRegressionReport(result) {
  const row = result.rows?.[0];
  if (!row) {
    return [
      "Simple linear regression",
      "No model was fitted.",
      ...(result.warnings ?? [])
    ].join("\n").trimEnd() + "\n";
  }
  return [
    "Simple linear regression",
    `Model: ${row.y_column} = ${row.intercept} + ${row.slope} * ${row.x_column}`,
    `Rows used: ${row.n}`,
    `R squared: ${row.r_squared}`,
    `Slope t(${row.df}) = ${row.slope_t}, two-sided p = ${row.slope_p_value}`,
    row.interpretation,
    `Suitability notes: ${row.suitability_notes}`,
    "Method note: coefficients are ordinary least squares; the p value tests whether the slope differs from zero under standard simple-regression assumptions."
  ].join("\n") + "\n";
}
