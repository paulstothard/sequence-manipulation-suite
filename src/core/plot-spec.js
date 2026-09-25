import { fitSideLegendLabel, sideLegendLayout } from "./plot-side-legend.js";
import {
  makePlotAxisLabel,
  makePublicationPlotStyle,
  publicationPlotCss,
  publicationSvgAttributes,
  SMS3_PLOT_THEME
} from "./publication-plot-style.js";

const DEFAULT_COLORS = SMS3_PLOT_THEME.categorical;

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value ?? "")))];
}

function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [];
  }
  if (min === max) {
    return [min];
  }
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

export function makeLinePlotSpec({
  title,
  rows,
  x,
  y,
  series,
  xLabel,
  yLabel,
  yDomain,
  note
}) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Plot rows must be an array.");
  }
  if (!x || !y) {
    throw new Error("Line plot specs require x and y fields.");
  }

  return {
    kind: "plot-spec",
    mark: "line",
    title: String(title ?? "Line plot"),
    data: rows,
    encoding: {
      x: { field: x, type: "number", label: xLabel ?? x },
      y: { field: y, type: "number", label: yLabel ?? y },
      series: series ? { field: series, type: "string", label: series } : null
    },
    scale: {
      yDomain: Array.isArray(yDomain) && yDomain.length === 2 ? yDomain : null
    },
    note: note ? String(note) : ""
  };
}

export function renderLinePlotSpecToSvg(spec, options = {}) {
  if (spec?.kind !== "plot-spec" || spec.mark !== "line") {
    throw new Error("Only line plot specs are supported by the prototype SVG renderer.");
  }

  const width = options.width ?? 920;
  const xField = spec.encoding.x.field;
  const yField = spec.encoding.y.field;
  const seriesField = spec.encoding.series?.field;
  const validRows = spec.data
    .map((row) => ({
      row,
      x: finiteNumber(row[xField]),
      y: finiteNumber(row[yField]),
      series: seriesField ? String(row[seriesField] ?? "") : "Series"
    }))
    .filter((item) => item.x !== null && item.y !== null);
  const xValues = validRows.map((item) => item.x);
  const yValues = validRows.map((item) => item.y);
  const xMin = Math.min(...xValues, 1);
  const xMax = Math.max(...xValues, 1);
  const yDomain = spec.scale.yDomain ?? [Math.min(...yValues, 0), Math.max(...yValues, 1)];
  const yMin = yDomain[0];
  const yMax = yDomain[1] === yDomain[0] ? yDomain[0] + 1 : yDomain[1];
  const seriesValues = uniqueValues(validRows.map((item) => item.series));
  const legend = seriesValues.length > 0 ? sideLegendLayout(width, seriesValues, { left: 62 }) : null;
  const margin = { top: 66, right: legend?.right ?? 30, bottom: 64, left: 62 };
  const height = Math.max(options.height ?? 0, 420, margin.top + margin.bottom + Math.max(270, 24 + seriesValues.length * 20));
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const style = makePublicationPlotStyle(width, height);
  const scaleX = (value) => margin.left + ((value - xMin) / Math.max(1, xMax - xMin)) * plotWidth;
  const scaleY = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;
  const rowsBySeries = new Map(seriesValues.map((value) => [value, []]));

  for (const item of validRows) {
    rowsBySeries.get(item.series)?.push(item);
  }

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" ${publicationSvgAttributes(style)} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}" data-plot-foundation="d3" data-plot-renderer="sms3-d3" data-sms3-publication-theme="default" data-grid-lines="hidden">`,
    `<style>${publicationPlotCss(style)}.line{fill:none;stroke-width:${style.dataStrokeWidth}}.dot{stroke:${SMS3_PLOT_THEME.surface};stroke-width:${style.axisStrokeWidth}}</style>`,
    `<rect width="${width}" height="${height}" fill="${SMS3_PLOT_THEME.surface}"></rect>`,
    `<text class="title" x="28" y="28">${escapeXml(spec.title)}</text>`,
    `<text class="note" x="28" y="48">${escapeXml(spec.note || `${makePlotAxisLabel(spec.encoding.x.label)} vs ${makePlotAxisLabel(spec.encoding.y.label)}`)}</text>`
  ];

  for (const tick of niceTicks(yMin, yMax)) {
    const y = scaleY(tick);
    parts.push(`<line class="axis-tick" x1="${margin.left - style.tickLength}" y1="${y.toFixed(2)}" x2="${margin.left}" y2="${y.toFixed(2)}"></line>`);
    parts.push(`<text class="tick" x="${margin.left - style.tickLength - 6}" y="${(y + style.bodyFontSize * 0.34).toFixed(2)}" text-anchor="end">${Number(tick.toFixed(3))}</text>`);
  }

  for (const tick of niceTicks(xMin, xMax)) {
    const x = scaleX(tick);
    parts.push(`<line class="axis-tick" x1="${x.toFixed(2)}" y1="${height - margin.bottom}" x2="${x.toFixed(2)}" y2="${height - margin.bottom + style.tickLength}"></line>`);
    parts.push(`<text class="tick" x="${x.toFixed(2)}" y="${height - margin.bottom + style.tickLength + style.bodyFontSize + 4}" text-anchor="middle">${Math.round(tick)}</text>`);
  }

  parts.push(`<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`);
  parts.push(`<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`);

  seriesValues.forEach((seriesName, index) => {
    const color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
    const points = (rowsBySeries.get(seriesName) ?? [])
      .sort((left, right) => left.x - right.x)
      .map((item) => `${scaleX(item.x).toFixed(2)},${scaleY(item.y).toFixed(2)}`);
    if (points.length > 1) {
      parts.push(`<polyline class="line" stroke="${color}" points="${points.join(" ")}"></polyline>`);
    }
    for (const item of rowsBySeries.get(seriesName) ?? []) {
      parts.push(
        `<circle class="dot" data-sms3-nearest-point="true" cx="${scaleX(item.x).toFixed(2)}" cy="${scaleY(item.y).toFixed(2)}" r="3" fill="${color}"><title>${escapeXml(`${seriesName}: ${item.x}, ${item.y}`)}</title></circle>`
      );
    }
  });

  if (legend) {
    parts.push(`<g aria-label="Legend">`);
    seriesValues.forEach((seriesName, index) => {
      const color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const legendY = margin.top + 12 + index * legend.rowHeight;
      parts.push(`<line stroke="${color}" stroke-width="3" x1="${legend.legendX}" y1="${legendY}" x2="${legend.legendX + 26}" y2="${legendY}"></line>`);
      parts.push(`<text class="legend" x="${legend.labelX}" y="${legendY + 4}">${escapeXml(fitSideLegendLabel(seriesName, legend.labelWidth))}<title>${escapeXml(seriesName)}</title></text>`);
    });
    parts.push(`</g>`);
  }

  parts.push(`<text class="label" x="${margin.left + plotWidth / 2}" y="${height - 16}" text-anchor="middle">${escapeXml(makePlotAxisLabel(spec.encoding.x.label))}</text>`);
  parts.push(`<text class="label" transform="translate(18 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeXml(makePlotAxisLabel(spec.encoding.y.label))}</text>`);
  parts.push("</svg>");
  return parts.join("\n");
}

export function makePlotStream(spec, svg) {
  return {
    kind: "plot",
    spec,
    mediaType: "image/svg+xml",
    svg
  };
}
