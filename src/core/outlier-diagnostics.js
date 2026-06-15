import "../vendor/d3/d3.min.js";
import { escapeXml } from "./plot-renderer.js";
import { findColumn, parseDelimitedTable } from "./table.js";
import {
  isNumericStatisticsColumn,
  parseStatisticsNumber
} from "./statistics-utils.js";

export const outlierDiagnosticsColumns = [
  { id: "label", label: "Label", type: "string" },
  { id: "group", label: "Group", type: "string" },
  { id: "value", label: "Value", type: "number" },
  { id: "z_score", label: "Z-score", type: "number" },
  { id: "modified_z_score", label: "Modified Z-score", type: "number" },
  { id: "lower_fence", label: "Lower IQR fence", type: "number" },
  { id: "upper_fence", label: "Upper IQR fence", type: "number" },
  { id: "iqr_outlier", label: "IQR outlier", type: "string" },
  { id: "z_outlier", label: "Z-score outlier", type: "string" },
  { id: "modified_z_outlier", label: "Modified Z outlier", type: "string" },
  { id: "methods_flagged", label: "Methods flagged", type: "string" }
];

export const outlierGroupSummaryColumns = [
  { id: "group", label: "Group", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "missing", label: "Missing", type: "number" },
  { id: "mean", label: "Mean", type: "number" },
  { id: "sd", label: "SD", type: "number" },
  { id: "median", label: "Median", type: "number" },
  { id: "mad", label: "MAD", type: "number" },
  { id: "q1", label: "Q1", type: "number" },
  { id: "q3", label: "Q3", type: "number" },
  { id: "iqr", label: "IQR", type: "number" },
  { id: "lower_fence", label: "Lower IQR fence", type: "number" },
  { id: "upper_fence", label: "Upper IQR fence", type: "number" },
  { id: "iqr_outliers", label: "IQR outliers", type: "number" },
  { id: "z_outliers", label: "Z-score outliers", type: "number" },
  { id: "modified_z_outliers", label: "Modified Z outliers", type: "number" },
  { id: "any_outliers", label: "Any-method outliers", type: "number" }
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

function sampleSd(values, valueMean = mean(values)) {
  if (values.length < 2) return Number.NaN;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1));
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function groupColor(group, groups) {
  return COLORS[Math.max(0, groups.indexOf(group)) % COLORS.length];
}

function asYesNo(value) {
  return value ? "yes" : "no";
}

function tableRowsToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function outlierRowsToTsv(columns, rows) {
  return tableRowsToTsv(columns, rows);
}

export function calculateOutlierDiagnostics(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const numericColumns = table.columns.filter((column) => isNumericStatisticsColumn(table.rows, column.id));
  const valueColumn = findColumn(table.columns, options.valueColumn) ?? numericColumns[0];
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "treatment") ??
    findColumn(table.columns, "group");
  const labelColumn =
    findColumn(table.columns, options.labelColumn) ??
    findColumn(table.columns, "sample_id") ??
    findColumn(table.columns, "sample") ??
    table.columns[0];
  const iqrMultiplier = Math.max(0, Number(options.iqrMultiplier) || 1.5);
  const zCutoff = Math.max(0, Number(options.zCutoff) || 3);
  const modifiedZCutoff = Math.max(0, Number(options.modifiedZCutoff) || 3.5);
  const warnings = [...table.warnings];
  if (!valueColumn) {
    warnings.push("A numeric value column is required for outlier diagnostics.");
    return { table, rows: [], summaries: [], warnings, valueColumn: null, groupColumn, labelColumn };
  }

  const grouped = new Map();
  let missing = 0;
  for (const [rowIndex, row] of table.rows.entries()) {
    const label = String(row[labelColumn?.id] ?? `Row ${rowIndex + 1}`).trim() || `Row ${rowIndex + 1}`;
    const group = groupColumn ? String(row[groupColumn.id] ?? "").trim() || "(blank)" : "All rows";
    const rawValue = row[valueColumn.id];
    const value = parseStatisticsNumber(rawValue);
    if (value === null) {
      missing += 1;
      if (!grouped.has(group)) grouped.set(group, { values: [], missing: 0, entries: [] });
      grouped.get(group).missing += 1;
      continue;
    }
    if (!grouped.has(group)) grouped.set(group, { values: [], missing: 0, entries: [] });
    const groupData = grouped.get(group);
    groupData.values.push(value);
    groupData.entries.push({ label, group, value, rowIndex });
  }
  if (missing > 0) {
    warnings.push(`Skipped ${missing} row(s) with missing or nonnumeric values in "${valueColumn.label}".`);
  }
  if (grouped.size === 0 || [...grouped.values()].every((group) => group.values.length === 0)) {
    warnings.push(`No numeric values were available in "${valueColumn.label}".`);
  }

  const rows = [];
  const summaries = [];
  for (const [group, groupData] of grouped.entries()) {
    const sorted = groupData.values.slice().sort((a, b) => a - b);
    if (sorted.length === 0) {
      summaries.push({
        group,
        count: 0,
        missing: groupData.missing,
        mean: "",
        sd: "",
        median: "",
        mad: "",
        q1: "",
        q3: "",
        iqr: "",
        lower_fence: "",
        upper_fence: "",
        iqr_outliers: 0,
        z_outliers: 0,
        modified_z_outliers: 0,
        any_outliers: 0
      });
      continue;
    }
    const valueMean = mean(sorted);
    const sd = sampleSd(sorted, valueMean);
    const median = quantile(sorted, 0.5);
    const absoluteDeviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
    const mad = quantile(absoluteDeviations, 0.5);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - iqrMultiplier * iqr;
    const upperFence = q3 + iqrMultiplier * iqr;
    let iqrOutliers = 0;
    let zOutliers = 0;
    let modifiedZOutliers = 0;
    let anyOutliers = 0;
    if (sorted.length < 3) {
      warnings.push(`${group}: fewer than 3 numeric values; outlier diagnostics are shown but may not be reliable.`);
    }
    if (!Number.isFinite(sd) || sd === 0) {
      warnings.push(`${group}: zero or undefined sample SD; z-score outlier flags are reported as no for this group.`);
    }
    if (!Number.isFinite(mad) || mad === 0) {
      warnings.push(`${group}: zero or undefined MAD; modified Z-score outlier flags are reported as no for this group.`);
    }
    for (const entry of groupData.entries) {
      const zScore = sd > 0 ? (entry.value - valueMean) / sd : Number.NaN;
      // Iglewicz and Hoaglin's modified Z-score uses 0.6745 * (x - median) / MAD.
      const modifiedZScore = mad > 0 ? 0.6745 * (entry.value - median) / mad : Number.NaN;
      const iqrOutlier = entry.value < lowerFence || entry.value > upperFence;
      const zOutlier = Number.isFinite(zScore) && Math.abs(zScore) >= zCutoff;
      const modifiedZOutlier = Number.isFinite(modifiedZScore) && Math.abs(modifiedZScore) >= modifiedZCutoff;
      const flagged = [
        iqrOutlier ? "IQR" : "",
        zOutlier ? "z-score" : "",
        modifiedZOutlier ? "modified-z" : ""
      ].filter(Boolean);
      iqrOutliers += iqrOutlier ? 1 : 0;
      zOutliers += zOutlier ? 1 : 0;
      modifiedZOutliers += modifiedZOutlier ? 1 : 0;
      anyOutliers += flagged.length > 0 ? 1 : 0;
      rows.push({
        label: entry.label,
        group,
        value: round(entry.value),
        z_score: round(zScore),
        modified_z_score: round(modifiedZScore),
        lower_fence: round(lowerFence),
        upper_fence: round(upperFence),
        iqr_outlier: asYesNo(iqrOutlier),
        z_outlier: asYesNo(zOutlier),
        modified_z_outlier: asYesNo(modifiedZOutlier),
        methods_flagged: flagged.join(",")
      });
    }
    summaries.push({
      group,
      count: sorted.length,
      missing: groupData.missing,
      mean: round(valueMean),
      sd: round(sd),
      median: round(median),
      mad: round(mad),
      q1: round(q1),
      q3: round(q3),
      iqr: round(iqr),
      lower_fence: round(lowerFence),
      upper_fence: round(upperFence),
      iqr_outliers: iqrOutliers,
      z_outliers: zOutliers,
      modified_z_outliers: modifiedZOutliers,
      any_outliers: anyOutliers
    });
  }
  return {
    table,
    rows,
    summaries,
    warnings,
    valueColumn,
    groupColumn,
    labelColumn,
    options: { iqrMultiplier, zCutoff, modifiedZCutoff }
  };
}

export function makeOutlierDiagnosticsReport(result) {
  const valueLabel = result.valueColumn?.label ?? "selected value";
  return [
    "Outlier diagnostics",
    `Value column: ${valueLabel}`,
    `Groups analyzed: ${result.summaries.length}`,
    `Rows with numeric values: ${result.rows.length}`,
    `Method: IQR fences use Q1 - ${result.options?.iqrMultiplier ?? 1.5} * IQR and Q3 + ${result.options?.iqrMultiplier ?? 1.5} * IQR; z-score uses sample SD; modified Z-score uses 0.6745 * (x - median) / MAD.`,
    "",
    ...result.summaries.map((row) => `${row.group}: n=${row.count}, median=${row.median || "n/a"}, IQR outliers=${row.iqr_outliers}, z-score outliers=${row.z_outliers}, modified-Z outliers=${row.modified_z_outliers}, any=${row.any_outliers}`)
  ].join("\n").trimEnd() + "\n";
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
  return Number(value.toFixed(3)).toString();
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
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  const d3 = getD3();
  if (d3?.scaleLinear) {
    return d3.scaleLinear().domain([domainMin, domainMax]).range([rangeMin, rangeMax])(value);
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
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

function jitterOffset(seedText, limit) {
  let hash = 0;
  for (let index = 0; index < seedText.length; index += 1) {
    hash = (hash * 33 + seedText.charCodeAt(index)) >>> 0;
  }
  return ((hash % 1000) / 999 - 0.5) * 2 * limit;
}

export function renderOutlierDiagnosticsSvg(result, options = {}) {
  if (result.rows.length === 0) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 160" role="img" aria-label="Outlier diagnostics" data-plot-foundation="d3-outlier-plot-svg" data-plot-renderer="sms3-d3">`,
      `<rect width="760" height="160" fill="white"/>`,
      `<text x="28" y="42" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#263238">Outlier diagnostics</text>`,
      `<text x="28" y="78" font-family="system-ui, sans-serif" font-size="13" fill="#5c6b75">No numeric outlier data were available.</text>`,
      "</svg>"
    ].join("");
  }
  const width = 940;
  const height = 600;
  const margin = { top: 76, right: 140, bottom: 96, left: 86 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const groups = result.summaries.map((row) => row.group);
  const values = result.rows.map((row) => row.value).filter((value) => Number.isFinite(value));
  const [yMin, yMax] = extent(values);
  const yTicks = makeAxisTicks(yMin, yMax).filter((tick) => tick >= yMin && tick <= yMax);
  const groupWidth = plotWidth / Math.max(1, groups.length);
  const title = options.title || "Outlier diagnostics";
  const yLabel = result.valueColumn?.label ?? "Value";
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-outlier-plot-svg" data-plot-renderer="sms3-d3">`,
    "<style>",
    ".title{font:700 20px system-ui,sans-serif;fill:#263238}",
    ".axis{stroke:#455a64;stroke-width:1.2}",
    ".grid{stroke:#d9e2e8;stroke-width:1}",
    ".tick{font:11px system-ui,sans-serif;fill:#455a64}",
    ".label{font:13px system-ui,sans-serif;fill:#263238}",
    ".legend{font:12px system-ui,sans-serif;fill:#263238}",
    "</style>",
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="34" y="34">${escapeXml(title)}</text>`,
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...result.summaries.map((summary, index) => {
      const centerX = index * groupWidth + groupWidth / 2;
      const color = groupColor(summary.group, groups);
      const q1 = scale(summary.q1, yMin, yMax, plotHeight, 0);
      const q3 = scale(summary.q3, yMin, yMax, plotHeight, 0);
      const lower = scale(summary.lower_fence, yMin, yMax, plotHeight, 0);
      const upper = scale(summary.upper_fence, yMin, yMax, plotHeight, 0);
      const median = scale(summary.median, yMin, yMax, plotHeight, 0);
      const boxWidth = Math.min(62, groupWidth * 0.36);
      const label = summary.group.length > 14 ? `${summary.group.slice(0, 13)}...` : summary.group;
      return [
        `<line x1="${centerX}" x2="${centerX}" y1="${upper}" y2="${lower}" stroke="${color}" stroke-width="1.4" stroke-dasharray="4 4" stroke-opacity="0.7"><title>${escapeXml(`${summary.group} IQR fences`)}</title></line>`,
        `<rect x="${centerX - boxWidth / 2}" y="${Math.min(q1, q3)}" width="${boxWidth}" height="${Math.max(1, Math.abs(q3 - q1))}" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="1.2"/>`,
        `<line x1="${centerX - boxWidth / 2}" x2="${centerX + boxWidth / 2}" y1="${median}" y2="${median}" stroke="${color}" stroke-width="2.2"/>`,
        `<text class="tick" x="${centerX}" y="${plotHeight + 22}" text-anchor="middle" transform="rotate(-28 ${centerX} ${plotHeight + 22})">${escapeXml(label)}<title>${escapeXml(summary.group)}</title></text>`
      ].join("");
    }),
    ...result.rows.map((row) => {
      const groupIndex = groups.indexOf(row.group);
      const centerX = groupIndex * groupWidth + groupWidth / 2;
      const x = centerX + jitterOffset(`${row.group}:${row.label}:${row.value}`, Math.min(32, groupWidth * 0.18));
      const y = scale(row.value, yMin, yMax, plotHeight, 0);
      const flagged = row.methods_flagged !== "";
      const color = flagged ? "#be123c" : "#334155";
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${flagged ? 5.2 : 3.4}" fill="${color}" fill-opacity="${flagged ? "0.88" : "0.5"}" stroke="#ffffff" stroke-width="0.9"><title>${escapeXml(`${row.label}: ${row.value}${flagged ? ` flagged by ${row.methods_flagged}` : ""}`)}</title></circle>`;
    }),
    "</g>",
    `<text class="label" x="${width / 2}" y="${height - 18}" text-anchor="middle">${escapeXml(result.groupColumn?.label ?? "Group")}</text>`,
    `<text class="label" transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle">${escapeXml(yLabel)}</text>`,
    `<circle cx="${width - 118}" cy="82" r="4.2" fill="#334155" fill-opacity="0.5"/><text class="legend" x="${width - 106}" y="86">not flagged</text>`,
    `<circle cx="${width - 118}" cy="108" r="5.2" fill="#be123c" fill-opacity="0.88"/><text class="legend" x="${width - 106}" y="112">flagged</text>`,
    `<rect x="${width - 124}" y="130" width="12" height="12" fill="#2563eb" fill-opacity="0.14" stroke="#2563eb"/><text class="legend" x="${width - 106}" y="141">IQR band</text>`,
    "</svg>"
  ];
  return parts.join("");
}
