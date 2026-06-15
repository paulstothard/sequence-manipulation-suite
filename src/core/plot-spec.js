const DEFAULT_COLORS = ["#0f766e", "#2563eb", "#a33a3a", "#7c3aed", "#b7791f", "#64748b"];

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
  const height = options.height ?? 420;
  const margin = { top: 66, right: 30, bottom: 64, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
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
  const scaleX = (value) => margin.left + ((value - xMin) / Math.max(1, xMax - xMin)) * plotWidth;
  const scaleY = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;
  const seriesValues = uniqueValues(validRows.map((item) => item.series));
  const rowsBySeries = new Map(seriesValues.map((value) => [value, []]));

  for (const item of validRows) {
    rowsBySeries.get(item.series)?.push(item);
  }

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}">`,
    "<style>text{font-family:Inter,Arial,sans-serif;font-size:12px;fill:#172026}.title{font-size:18px;font-weight:700}.axis{stroke:#5c6b75;stroke-width:1}.grid{stroke:#dfe7ec;stroke-width:1}.line{fill:none;stroke-width:2.4}.dot{stroke:#fff;stroke-width:1}.label{font-size:11px}</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"></rect>`,
    `<text class="title" x="28" y="28">${escapeXml(spec.title)}</text>`
  ];

  for (const tick of niceTicks(yMin, yMax)) {
    const y = scaleY(tick);
    parts.push(`<line class="grid" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>`);
    parts.push(`<text x="14" y="${(y + 4).toFixed(2)}">${Number(tick.toFixed(3))}</text>`);
  }

  for (const tick of niceTicks(xMin, xMax)) {
    const x = scaleX(tick);
    parts.push(`<line class="grid" x1="${x.toFixed(2)}" y1="${margin.top}" x2="${x.toFixed(2)}" y2="${height - margin.bottom}"></line>`);
    parts.push(`<text x="${(x - 8).toFixed(2)}" y="${height - margin.bottom + 18}">${Math.round(tick)}</text>`);
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
        `<circle class="dot" cx="${scaleX(item.x).toFixed(2)}" cy="${scaleY(item.y).toFixed(2)}" r="3" fill="${color}"><title>${escapeXml(`${seriesName}: ${item.x}, ${item.y}`)}</title></circle>`
      );
    }
  });

  if (seriesValues.length > 0) {
    const legendRows = Math.ceil(Math.min(seriesValues.length, DEFAULT_COLORS.length) / 2);
    parts.push(`<g aria-label="Legend">`);
    parts.push(`<rect x="${margin.left}" y="38" width="${width - margin.left - margin.right}" height="${Math.max(26, legendRows * 20 + 8)}" rx="4" fill="#f8fafc" stroke="#dfe7ec"></rect>`);
    seriesValues.slice(0, DEFAULT_COLORS.length).forEach((seriesName, index) => {
      const color = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      const legendX = margin.left + 14 + (index % 2) * 330;
      const legendY = 55 + Math.floor(index / 2) * 20;
      parts.push(`<line stroke="${color}" stroke-width="3" x1="${legendX}" y1="${legendY}" x2="${legendX + 26}" y2="${legendY}"></line>`);
      parts.push(`<text class="label" x="${legendX + 34}" y="${legendY + 4}">${escapeXml(seriesName)}</text>`);
    });
    parts.push(`</g>`);
  }

  parts.push(`<text x="28" y="${height - 20}">${escapeXml(spec.note || `${spec.encoding.x.label} vs ${spec.encoding.y.label}`)}</text>`);
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
