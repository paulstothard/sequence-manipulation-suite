import "../vendor/d3/d3.min.js";

export const PLOT_FOUNDATION = {
  name: "Observable Plot",
  packageName: "@observablehq/plot",
  version: "0.6.17",
  license: "ISC",
  browserAsset: "src/vendor/observablehq-plot/plot.umd.min.js",
  browserDependencies: ["src/vendor/d3/d3.min.js"],
  baseLibrary: {
    name: "D3",
    packageName: "d3",
    version: "7.9.0",
    license: "ISC",
    browserAsset: "src/vendor/d3/d3.min.js"
  }
};

const DEFAULT_COLORS = ["#0f766e", "#2563eb", "#a33a3a", "#7c3aed", "#64748b", "#d97706", "#0369a1", "#be123c"];
const FIGURE_TEXT_X = 28;
const FIGURE_TEXT_PADDING = FIGURE_TEXT_X * 2;
const FIGURE_TITLE_Y = 42;
const FIGURE_SUBTITLE_FIRST_Y = 68;
const FIGURE_TEXT_LINE_HEIGHT = 16;
const FIGURE_HEADER_GAP = 36;
export const HEATMAP_LEGEND_LABEL_GAP = 12;

function getD3() {
  return globalThis.d3 ?? null;
}

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function makePlaceholderSvg(title, lines, options = {}) {
  const width = options.width ?? 760;
  const safeLines = lines.map((line) => escapeXml(line));
  const height = 120 + safeLines.length * 20;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3" data-plot-backend="d3" data-plot-renderer="sms3-d3">`,
    "<style>",
    ".title{font:700 18px system-ui,sans-serif;fill:#263238}",
    ".note{font:12px system-ui,sans-serif;fill:#5c6b75}",
    "</style>",
    `<rect x="0" y="0" width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="24" y="34">${escapeXml(title)}</text>`,
    ...safeLines.map((line, index) => `<text class="note" x="24" y="${66 + index * 20}">${line}</text>`),
    "</svg>"
  ].join("");
}

export function makeLinePlotSpec({
  title,
  xLabel,
  yLabel,
  series,
  yDomain,
  width = 920,
  height,
  colors = DEFAULT_COLORS,
  showLegend = true,
  pointMarkers = "auto",
  pointMarkerThreshold = 120,
  bands = [],
  notes = []
}) {
  return {
    kind: "line-plot",
    foundation: PLOT_FOUNDATION,
    title,
    xLabel,
    yLabel,
    width,
    height,
    yDomain,
    colors,
    showLegend,
    pointMarkers,
    pointMarkerThreshold,
    bands: bands.map((item, index) => ({
      id: item.id ?? `band-${index + 1}`,
      label: item.label ?? item.id ?? `Band ${index + 1}`,
      color: item.color ?? colors[index % colors.length],
      opacity: item.opacity ?? 0.22,
      points: item.points ?? []
    })),
    series: series.map((item, index) => ({
      id: item.id ?? `series-${index + 1}`,
      label: item.label ?? item.id ?? `Series ${index + 1}`,
      color: item.color ?? colors[index % colors.length],
      strokeWidth: item.strokeWidth,
      strokeDasharray: item.strokeDasharray,
      points: item.points ?? []
    })),
    notes
  };
}

export function makeCategoricalBarPlotSpec({
  title,
  xLabel,
  yLabel,
  categories,
  series,
  bars,
  yDomain,
  width = 1120,
  height,
  colors = DEFAULT_COLORS,
  showLegend = true,
  xTickLabelMode = "split-codon",
  barWidthMode = "compact",
  barFillOpacity = 1,
  notes = []
}) {
  return {
    kind: "categorical-bar-plot",
    foundation: PLOT_FOUNDATION,
    title,
    xLabel,
    yLabel,
    width,
    height,
    yDomain,
    colors,
    showLegend,
    xTickLabelMode,
    barWidthMode,
    barFillOpacity,
    categories: categories.map((item, index) => ({
      id: item.id ?? item.label ?? `category-${index + 1}`,
      label: item.label ?? item.id ?? `Category ${index + 1}`,
      group: item.group ?? ""
    })),
    series: series.map((item, index) => ({
      id: item.id ?? `series-${index + 1}`,
      label: item.label ?? item.id ?? `Series ${index + 1}`,
      color: item.color ?? colors[index % colors.length]
    })),
    bars: bars.map((item) => ({
      category: item.category,
      series: item.series,
      value: item.value,
      title: item.title
    })),
    notes
  };
}

export function makeHeatmapPlotSpec({
  title,
  subtitle,
  xLabel,
  yLabel,
  xCategories,
  yCategories,
  cells,
  valueLabel = "Value",
  valueDomain = [0, 100],
  colorScheme = "light-viridis",
  missingCells = [],
  width,
  height,
  notes = []
}) {
  return {
    kind: "heatmap",
    foundation: PLOT_FOUNDATION,
    title,
    subtitle,
    xLabel,
    yLabel,
    valueLabel,
    valueDomain,
    colorScheme,
    width,
    height,
    xCategories: xCategories.map((item, index) => ({
      id: item.id ?? item.label ?? `x-${index + 1}`,
      label: item.label ?? item.id ?? `X ${index + 1}`
    })),
    yCategories: yCategories.map((item, index) => ({
      id: item.id ?? item.label ?? `y-${index + 1}`,
      label: item.label ?? item.id ?? `Y ${index + 1}`
    })),
    cells: cells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      value: cell.value,
      title: cell.title,
      displayValue: cell.displayValue,
      highlight: Boolean(cell.highlight)
    })),
    missingCells: missingCells.map((cell) => ({
      x: cell.x,
      y: cell.y,
      title: cell.title
    })),
    notes
  };
}

export function makeObservablePlotConfig(spec) {
  if (spec.kind === "heatmap") {
    const xLabels = new Map(spec.xCategories.map((item) => [item.id, item.label]));
    const yLabels = new Map(spec.yCategories.map((item) => [item.id, item.label]));
    const rows = spec.cells.map((cell) => ({
      x: xLabels.get(cell.x) ?? cell.x,
      y: yLabels.get(cell.y) ?? cell.y,
      value: cell.value,
      title: cell.title
    }));
    return {
      title: spec.title,
      x: { label: spec.xLabel },
      y: { label: spec.yLabel },
      color: { label: spec.valueLabel, domain: spec.valueDomain, legend: true },
      marks: [
        {
          type: "cell",
          data: rows,
          options: { x: "x", y: "y", fill: "value", title: "title" }
        }
      ]
    };
  }

  if (spec.kind === "categorical-bar-plot") {
    const rows = spec.bars.map((bar) => {
      const category = spec.categories.find((item) => item.id === bar.category);
      const series = spec.series.find((item) => item.id === bar.series);
      return {
        category: category?.label ?? bar.category,
        series: series?.label ?? bar.series,
        value: bar.value,
        title: bar.title
      };
    });
    return {
      title: spec.title,
      x: { label: spec.xLabel },
      y: { label: spec.yLabel, domain: spec.yDomain },
      color: { legend: Boolean(spec.showLegend) },
      marks: [
        {
          type: "barY",
          data: rows,
          options: { x: "category", y: "value", fill: "series", title: "title" }
        }
      ]
    };
  }

  const rows = spec.series.flatMap((series) =>
    series.points.map((point) => ({
      series: series.label,
      x: point.x,
      y: point.y,
      title: point.title
    }))
  );
  const bandRows = (spec.bands ?? []).flatMap((band) =>
    band.points.map((point) => ({
      band: band.label,
      x: point.x,
      y1: point.y0,
      y2: point.y1,
      title: point.title
    }))
  );
  const markerRows = rows.filter((row) =>
    shouldShowPointMarkersForSeries(spec, spec.series.find((series) => series.label === row.series))
  );
  return {
    title: spec.title,
    x: { label: spec.xLabel },
    y: { label: spec.yLabel, domain: spec.yDomain },
    color: { legend: Boolean(spec.showLegend) },
    marks: [
      ...(bandRows.length > 0
        ? [{
            type: "areaY",
            data: bandRows,
            options: { x: "x", y1: "y1", y2: "y2", fill: "band", title: "title" }
          }]
        : []),
      {
        type: "line",
        data: rows,
        options: { x: "x", y: "y", stroke: "series" }
      },
      ...(markerRows.length > 0
        ? [{
            type: "dot",
            data: markerRows,
            options: { x: "x", y: "y", fill: "series", title: "title", r: 2.5 }
          }]
        : [])
    ],
    showPointMarkers: markerRows.length > 0
  };
}

export function renderCategoricalBarPlotSvg(spec) {
  const d3 = getD3();
  const width = spec.width ?? 1120;
  const noteLines = (spec.notes ?? []).flatMap((note) => wrapText(note, figureWrapCharacters(width)));
  const header = figureHeaderLayout(width, spec.subtitle);
  const series = spec.series ?? [];
  const categories = spec.categories ?? [];
  const showLegend = spec.showLegend !== false;
  const legendColumns = series.length > 4 ? 2 : 1;
  const legendRows = showLegend ? Math.ceil(series.length / legendColumns) : 0;
  const legendHeight = showLegend && series.length > 0 ? 12 + legendRows * 20 : 0;
  const legendTop = header.contentTop;
  const splitCodonLabels = spec.xTickLabelMode !== "horizontal";
  const margin = {
    top: header.contentTop + (legendHeight > 0 ? legendHeight + 18 : 0),
    right: 28,
    bottom: splitCodonLabels ? 138 : 96,
    left: 78
  };
  const height = spec.height ?? Math.max(520, margin.top + 330 + margin.bottom + Math.max(0, noteLines.length - 1) * 14);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = spec.bars.map((bar) => Number(bar.value)).filter((value) => Number.isFinite(value));
  const yMax = Math.max(1, spec.yDomain?.[1] ?? Math.max(...values, 1));
  const yMin = spec.yDomain?.[0] ?? 0;
  const yScale = d3?.scaleLinear
    ? d3.scaleLinear().domain([yMin, yMax]).range([height - margin.bottom, margin.top])
    : null;
  const scaleY = (value) => yScale
    ? yScale(value)
    : margin.top + ((yMax - value) / Math.max(1, yMax - yMin)) * plotHeight;
  const categoryWidth = plotWidth / Math.max(1, categories.length);
  const wideBars = spec.barWidthMode === "histogram" && series.length === 1;
  const barGap = wideBars ? Math.min(4, Math.max(1, categoryWidth * 0.06)) : series.length > 1 ? 1 : 2;
  const innerWidth = Math.max(1, categoryWidth - 4);
  const compactBarWidth = Math.min(13, (innerWidth - barGap * Math.max(0, series.length - 1)) / Math.max(1, series.length));
  const histogramBarWidth = Math.max(1, categoryWidth - barGap);
  const barWidth = wideBars ? histogramBarWidth : Math.max(1, compactBarWidth);
  const barGroupWidth = barWidth * Math.max(1, series.length) + barGap * Math.max(0, series.length - 1);
  const barFillOpacity = Number.isFinite(Number(spec.barFillOpacity)) ? Number(spec.barFillOpacity) : 1;
  const barsByKey = new Map(spec.bars.map((bar) => [`${bar.category}\t${bar.series}`, bar]));
  const yTicks = yScale
    ? yScale.ticks(4)
    : [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}" data-plot-foundation="observable-plot" data-plot-backend="d3" data-plot-renderer="sms3">`,
    "<style>text{font-family:Inter,Arial,sans-serif;font-size:12px;fill:#172026}.title{font-size:18px;font-weight:700}.axis{stroke:#5c6b75;stroke-width:1}.grid{stroke:#dfe7ec;stroke-width:1}.bar{shape-rendering:crispEdges}.histogram-bar{shape-rendering:auto;stroke:#ffffff;stroke-width:1}.codon-label{font-size:10px;text-anchor:middle}.x-tick{font-size:11px;text-anchor:middle;fill:#334155}.aa-label{font-size:10px;text-anchor:middle;fill:#64748b}.legend-label{font-size:11px}.note{font-size:11px;fill:#64748b}</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"></rect>`,
    `<text class="title" x="${FIGURE_TEXT_X}" y="${FIGURE_TITLE_Y}">${escapeXml(spec.title)}</text>`,
    ...header.subtitleLines.map((line, index) =>
      `<text class="note" x="${FIGURE_TEXT_X}" y="${FIGURE_SUBTITLE_FIRST_Y + index * FIGURE_TEXT_LINE_HEIGHT}" data-plot-subtitle="true">${escapeXml(line)}</text>`
    )
  ];

  if (showLegend && series.length > 0) {
    const legendWidth = width - margin.left - margin.right;
    const columnWidth = legendWidth / legendColumns;
    parts.push(`<g aria-label="Legend">`);
    parts.push(`<rect x="${margin.left}" y="${legendTop}" width="${legendWidth}" height="${Math.max(30, legendHeight)}" rx="4" fill="#f8fafc" stroke="#dfe7ec"></rect>`);
    series.forEach((item, index) => {
      const column = Math.floor(index / legendRows);
      const row = index % legendRows;
      const x = margin.left + 12 + column * columnWidth;
      const y = legendTop + 16 + row * 20;
      parts.push(`<rect x="${x}" y="${y - 8}" width="24" height="10" fill="${item.color}"></rect>`);
      parts.push(`<text class="legend-label" x="${x + 32}" y="${y + 1}">${escapeXml(truncateLabel(item.label))}</text>`);
    });
    parts.push(`</g>`);
  }

  for (const tick of yTicks) {
    const y = scaleY(tick);
    parts.push(`<line class="grid" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>`);
    parts.push(`<text x="${margin.left - 14}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeXml(formatTick(tick))}</text>`);
  }
  parts.push(`<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`);
  parts.push(`<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`);

  categories.forEach((category, categoryIndex) => {
    const categoryLeft = margin.left + categoryIndex * categoryWidth;
    const center = categoryLeft + categoryWidth / 2;
    series.forEach((item, seriesIndex) => {
      const bar = barsByKey.get(`${category.id}\t${item.id}`);
      const value = Number(bar?.value ?? 0);
      const y = scaleY(value);
      const x = categoryLeft + (categoryWidth - barGroupWidth) / 2 + seriesIndex * (barWidth + barGap);
      const barHeight = height - margin.bottom - y;
      const barClass = wideBars ? "bar histogram-bar" : "bar";
      const radius = wideBars ? 3 : 0;
      parts.push(
        `<rect class="${barClass}" data-codon="${escapeXml(category.id)}" data-series="${escapeXml(item.id)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${Math.max(0, barHeight).toFixed(2)}" rx="${radius}" fill="${item.color}" fill-opacity="${barFillOpacity}"><title>${escapeXml(bar?.title ?? `${category.label}: ${value}`)}</title></rect>`
      );
    });
    if (splitCodonLabels) {
      parts.push(`<text class="codon-label" x="${center.toFixed(2)}" y="${height - margin.bottom + 14}"><tspan x="${center.toFixed(2)}">${escapeXml(category.label[0] ?? "")}</tspan><tspan x="${center.toFixed(2)}" dy="10">${escapeXml(category.label[1] ?? "")}</tspan><tspan x="${center.toFixed(2)}" dy="10">${escapeXml(category.label[2] ?? "")}</tspan></text>`);
    } else {
      parts.push(`<text class="x-tick" x="${center.toFixed(2)}" y="${height - margin.bottom + 18}">${escapeXml(truncateLabel(category.label, 16))}</text>`);
    }
    if (splitCodonLabels && category.group) {
      parts.push(`<text class="aa-label" x="${center.toFixed(2)}" y="${height - margin.bottom + 52}">${escapeXml(category.group)}</text>`);
    }
  });

  for (const [index, note] of noteLines.entries()) {
    parts.push(`<text x="${FIGURE_TEXT_X}" y="${height - 56 + index * 14}" style="font-size:11px;fill:#64748b">${escapeXml(note)}</text>`);
  }
  parts.push(`<text x="${margin.left + plotWidth / 2}" y="${height - 18}" text-anchor="middle">${escapeXml(spec.xLabel)}</text>`);
  parts.push(`<text transform="translate(18 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeXml(spec.yLabel)}</text>`);
  parts.push("</svg>");
  return parts.join("\n");
}

export function shouldShowPointMarkers(spec) {
  if (spec.pointMarkers === "show") {
    return true;
  }
  if (spec.pointMarkers === "hide") {
    return false;
  }
  const series = spec.series ?? [];
  const pointCount = series.reduce((sum, item) => sum + (item.points?.length ?? 0), 0);
  return pointCount <= (spec.pointMarkerThreshold ?? 120);
}

export function shouldShowPointMarkersForSeries(spec, series) {
  if (!series) {
    return false;
  }
  if (spec.pointMarkers === "show") {
    return true;
  }
  if (spec.pointMarkers === "hide") {
    return false;
  }
  return shouldShowPointMarkers(spec) || (series.points?.length ?? 0) === 1;
}

function formatTick(value) {
  if (Math.abs(value) >= 1000) {
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return Number(value).toFixed(Number.isInteger(value) ? 0 : 1);
}

function truncateLabel(label, maxLength = 42) {
  const text = String(label ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function interpolateLightViridis(t) {
  return interpolateRgbStops([
    [241, 245, 249],
    [187, 219, 224],
    [72, 187, 143],
    [253, 231, 37]
  ], t);
}

function interpolateRgbStops(stops, t) {
  const clamped = Math.max(0, Math.min(1, Number(t)));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const left = stops[index];
  const right = stops[index + 1];
  const rgb = left.map((channel, channelIndex) => Math.round(channel + (right[channelIndex] - channel) * local));
  return `rgb(${rgb.join(" ")})`;
}

function interpolateColor(value, domain = [0, 100], colorScheme = "light-viridis") {
  const [min, max] = domain;
  const t = Math.max(0, Math.min(1, (Number(value) - min) / Math.max(1e-12, max - min)));
  if (colorScheme === "light-viridis") {
    return interpolateLightViridis(t);
  }
  if (colorScheme === "blue") {
    return interpolateRgbStops([[239, 246, 255], [96, 165, 250], [29, 78, 216]], t);
  }
  if (colorScheme === "red-blue") {
    const limit = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    const centered = 0.5 + Math.max(-0.5, Math.min(0.5, Number(value) / (2 * limit)));
    return interpolateRgbStops([[185, 28, 28], [248, 250, 252], [37, 99, 235]], centered);
  }
  const d3 = getD3();
  if (d3?.scaleSequential) {
    const interpolator = colorScheme === "blue"
      ? d3.interpolateBlues
      : colorScheme === "red-blue"
        ? d3.interpolateRdBu
        : d3.interpolateViridis;
    if (interpolator) {
      if (colorScheme === "red-blue") {
        const limit = Math.max(Math.abs(min), Math.abs(max), 1e-9);
        return interpolator(0.5 + Math.max(-0.5, Math.min(0.5, Number(value) / (2 * limit))));
      }
      return d3.scaleSequential(interpolator).domain([min, max])(value);
    }
  }
  const stopsByScheme = {
    blue: [[239, 246, 255], [96, 165, 250], [29, 78, 216]],
    "light-viridis": [[241, 245, 249], [187, 219, 224], [72, 187, 143], [253, 231, 37]],
    "red-blue": [[185, 28, 28], [248, 250, 252], [37, 99, 235]],
    viridis: [[68, 1, 84], [49, 104, 142], [53, 183, 121], [253, 231, 37]]
  };
  const stops = stopsByScheme[colorScheme] ?? stopsByScheme.viridis;
  return interpolateRgbStops(stops, t);
}

export function renderHeatmapPlotSvg(spec) {
  const xCategories = spec.xCategories ?? [];
  const yCategories = spec.yCategories ?? [];
  const cellCount = xCategories.length * yCategories.length;
  if (cellCount === 0) {
    return makePlaceholderSvg(spec.title ?? "Heatmap", ["No heatmap cells were available to draw."]);
  }
  if (cellCount > 900) {
    return makePlaceholderSvg(spec.title ?? "Heatmap", [
      `The heatmap has ${cellCount.toLocaleString()} cells.`,
      "Use the matrix table output for this many comparisons."
    ]);
  }

  const renderedXLabels = xCategories.map((item) => truncateLabel(item.label, 24));
  const renderedYLabels = yCategories.map((item) => truncateLabel(item.label, 30));
  const maxXLabel = Math.max(...renderedXLabels.map((label) => textWidthEstimate(label, 11)), 40);
  const maxYLabel = Math.max(...yCategories.map((item) => textWidthEstimate(item.label, 11)), 48);
  const cell = Math.max(22, Math.min(84, Math.floor(680 / Math.max(xCategories.length, yCategories.length))));
  const rawNotes = spec.notes ?? [];
  const legendBarWidth = 16;
  const legendLabelGap = HEATMAP_LEGEND_LABEL_GAP;
  const legendTitle = truncateLabel(spec.valueLabel, 18);
  const legendTickLabelWidth = Math.max(
    textWidthEstimate(formatTick(spec.valueDomain[0]), 11),
    textWidthEstimate(formatTick(spec.valueDomain[1]), 11)
  );
  const legendBlockWidth = Math.max(
    legendBarWidth + legendLabelGap + legendTickLabelWidth,
    textWidthEstimate(legendTitle, 12)
  );
  const legendGutter = 42;
  const plotWidth = xCategories.length * cell;
  const plotHeight = yCategories.length * cell;
  const marginRight = Math.max(150, Math.ceil(legendGutter + legendBlockWidth + 18));
  const marginLeft = Math.min(340, Math.max(128, Math.ceil(maxYLabel + 62)));
  const contentWidth = Math.ceil(marginLeft + plotWidth + marginRight);
  const width = spec.width ?? Math.max(1040, contentWidth);
  const extraWidth = Math.max(0, width - contentWidth);
  const header = figureHeaderLayout(width, spec.subtitle);
  const hasSubtitle = header.subtitleLines.length > 0;
  const headerTop = hasSubtitle
    ? header.contentTop
    : Math.max(FIGURE_TITLE_Y + 20, header.contentTop - 18);
  const xLabelBand = Math.min(
    hasSubtitle ? 78 : 60,
    maxXLabel * (hasSubtitle ? 0.5 : 0.4) + (hasSubtitle ? 18 : 8)
  );
  const margin = {
    top: headerTop + xLabelBand,
    right: marginRight,
    bottom: 58,
    left: marginLeft + extraWidth * 0.4
  };
  const noteLines = rawNotes.flatMap((note) => wrapText(note, figureWrapCharacters(width)));
  const plotBottom = margin.top + plotHeight;
  const height = spec.height ?? Math.ceil(plotBottom + margin.bottom + noteLines.length * 14);
  const cellMap = new Map((spec.cells ?? []).map((item) => [`${item.x}\t${item.y}`, item]));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}" data-plot-foundation="observable-plot" data-plot-backend="d3" data-plot-renderer="sms3">`,
    "<style>[data-plot-renderer=\"sms3\"] text{font-family:Inter,Arial,sans-serif;font-size:11px;fill:#172026;stroke:none!important;stroke-width:0!important;text-shadow:none!important;paint-order:normal!important;font-weight:400}[data-plot-renderer=\"sms3\"] .title{font-size:18px;font-weight:700}[data-plot-renderer=\"sms3\"] .axis-label{font-size:12px;fill:#334155;font-weight:500}[data-plot-renderer=\"sms3\"] .tick{font-size:11px;fill:#334155;font-weight:500}[data-plot-renderer=\"sms3\"] .heatmap-cell{shape-rendering:crispEdges;stroke:#ffffff;stroke-width:1}[data-plot-renderer=\"sms3\"] .heatmap-cell-highlight-marker{fill:#0f766e;fill-opacity:.88}[data-plot-renderer=\"sms3\"] .value{font-size:10px;text-anchor:middle;dominant-baseline:central;fill:#111827;font-weight:500}[data-plot-renderer=\"sms3\"] .note{font-size:11px;fill:#64748b}</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"></rect>`,
    `<text class="title" x="${FIGURE_TEXT_X}" y="${FIGURE_TITLE_Y}">${escapeXml(spec.title)}</text>`
  ];
  header.subtitleLines.forEach((line, index) => {
    parts.push(`<text class="note" x="${FIGURE_TEXT_X}" y="${FIGURE_SUBTITLE_FIRST_Y + index * FIGURE_TEXT_LINE_HEIGHT}" data-plot-subtitle="true">${escapeXml(line)}</text>`);
  });

  xCategories.forEach((category, index) => {
    const x = margin.left + index * cell + cell / 2;
    parts.push(`<text class="tick" transform="translate(${x.toFixed(2)} ${margin.top - 10}) rotate(-32)" text-anchor="start">${escapeXml(renderedXLabels[index])}</text>`);
  });
  yCategories.forEach((category, index) => {
    const y = margin.top + index * cell + cell / 2;
    parts.push(`<text class="tick" x="${(margin.left - 8).toFixed(2)}" y="${y.toFixed(2)}" text-anchor="end" dominant-baseline="middle">${escapeXml(renderedYLabels[index])}</text>`);
  });

  parts.push(`<rect data-heatmap-matrix="true" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#f8fafc"></rect>`);
  yCategories.forEach((yCategory, yIndex) => {
    xCategories.forEach((xCategory, xIndex) => {
      const cellRecord = cellMap.get(`${xCategory.id}\t${yCategory.id}`);
      const value = Number(cellRecord?.value ?? NaN);
      const fill = Number.isFinite(value) ? interpolateColor(value, spec.valueDomain, spec.colorScheme) : "#f1f5f9";
      const x = margin.left + xIndex * cell;
      const y = margin.top + yIndex * cell;
      const isHighlighted = cellRecord?.highlight === true;
      parts.push(`<rect class="heatmap-cell" x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"><title>${escapeXml(cellRecord?.title ?? `${xCategory.label} vs ${yCategory.label}`)}</title></rect>`);
      if (cell >= 26 && cellCount <= 100 && Number.isFinite(value)) {
        const displayValue = cellRecord?.displayValue ?? value.toFixed(value >= 99.95 ? 0 : 1);
        parts.push(`<text class="value" x="${(x + cell / 2).toFixed(2)}" y="${(y + cell / 2).toFixed(2)}">${escapeXml(displayValue)}</text>`);
      }
      if (isHighlighted) {
        const markerSize = Math.max(6, Math.min(9, cell * 0.22));
        const markerInset = 1.5;
        const x1 = x + cell - markerInset;
        const y1 = y + markerInset;
        const x2 = x + cell - markerInset - markerSize;
        const y2 = y + markerInset;
        const x3 = x + cell - markerInset;
        const y3 = y + markerInset + markerSize;
        parts.push(`<path class="heatmap-cell-highlight-marker" data-heatmap-cell-highlight="true" d="M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} Z"><title>${escapeXml(`${cellRecord?.title ?? `${xCategory.label} vs ${yCategory.label}`} reciprocal best match`)}</title></path>`);
      }
    });
  });

  const legendX = margin.left + plotWidth + legendGutter;
  const legendY = margin.top + 8;
  const legendHeight = Math.max(80, Math.min(180, plotHeight));
  for (let step = 0; step < legendHeight; step += 1) {
    const value = spec.valueDomain[1] - (step / Math.max(1, legendHeight - 1)) * (spec.valueDomain[1] - spec.valueDomain[0]);
    parts.push(`<rect data-heatmap-legend-bar="true" x="${legendX}" y="${legendY + step}" width="${legendBarWidth}" height="1" fill="${interpolateColor(value, spec.valueDomain, spec.colorScheme)}"></rect>`);
  }
  parts.push(`<text class="axis-label" data-heatmap-legend-title="true" x="${legendX}" y="${legendY - 18}" text-anchor="start">${escapeXml(legendTitle)}</text>`);
  for (const [kind, value, y] of [
    ["max", spec.valueDomain[1], legendY],
    ["min", spec.valueDomain[0], legendY + legendHeight]
  ]) {
    parts.push(`<text class="tick" data-heatmap-legend-label="${kind}" x="${legendX + legendBarWidth + legendLabelGap}" y="${y}" dominant-baseline="middle">${escapeXml(formatTick(value))}</text>`);
  }
  parts.push(`<text class="axis-label" data-heatmap-axis-label="x" x="${margin.left + plotWidth / 2}" y="${plotBottom + 30}" text-anchor="middle">${escapeXml(spec.xLabel)}</text>`);
  const yAxisLabelX = Math.max(22, margin.left - maxYLabel - 36);
  parts.push(`<text class="axis-label" data-heatmap-axis-label="y" transform="translate(${yAxisLabelX.toFixed(2)} ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeXml(spec.yLabel)}</text>`);
  for (const [index, note] of noteLines.entries()) {
    parts.push(`<text class="note" x="${FIGURE_TEXT_X}" y="${plotBottom + 50 + index * 14}">${escapeXml(note)}</text>`);
  }
  parts.push("</svg>");
  return parts.join("\n");
}

function textWidthEstimate(text, fontSize) {
  return String(text ?? "").length * fontSize * 0.58;
}

function wrapText(text, maxCharacters) {
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
  return lines.length ? lines : [""];
}

function figureWrapCharacters(width) {
  return Math.max(52, Math.floor((width - FIGURE_TEXT_PADDING) / 7));
}

function figureHeaderLayout(width, subtitle = "") {
  const subtitleLines = subtitle ? wrapText(subtitle, figureWrapCharacters(width)) : [];
  const lastTextY = subtitleLines.length > 0
    ? FIGURE_SUBTITLE_FIRST_Y + (subtitleLines.length - 1) * FIGURE_TEXT_LINE_HEIGHT
    : FIGURE_TITLE_Y;
  return {
    subtitleLines,
    contentTop: lastTextY + FIGURE_HEADER_GAP
  };
}

export function renderLinePlotSvg(spec) {
  const d3 = getD3();
  const series = spec.series.filter((item) => item.points.some((point) => point.y !== null && point.y !== undefined));
  const bands = (spec.bands ?? []).filter((item) =>
    item.points.some((point) => point.y0 !== null && point.y0 !== undefined && point.y1 !== null && point.y1 !== undefined)
  );
  const width = spec.width ?? 920;
  const noteLines = (spec.notes ?? []).flatMap((note) => wrapText(note, figureWrapCharacters(width)));
  const header = figureHeaderLayout(width, spec.subtitle);
  const showLegend = spec.showLegend !== false;
  const legendItems = [
    ...bands.map((band) => ({ ...band, kind: "band" })),
    ...series.map((item) => ({ ...item, kind: "line" }))
  ];
  const legendRows = showLegend ? Math.max(1, legendItems.length) : 0;
  const legendHeight = showLegend && legendItems.length > 0 ? 12 + legendRows * 20 : 0;
  const legendTop = header.contentTop;
  const margin = {
    top: header.contentTop + (legendHeight > 0 ? legendHeight + 18 : 0),
    right: 34,
    bottom: 84,
    left: 86
  };
  const height = spec.height ?? Math.max(460, margin.top + 310 + Math.max(0, noteLines.length - 1) * 14);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const allPoints = [
    ...series.flatMap((item) => item.points).filter((point) => point.y !== null && point.y !== undefined),
    ...bands.flatMap((item) => item.points.flatMap((point) => [
      { x: point.x, y: point.y0 },
      { x: point.x, y: point.y1 }
    ])).filter((point) => point.y !== null && point.y !== undefined)
  ];
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const xMin = Number.isFinite(minX) ? minX : 1;
  const xMax = Number.isFinite(maxX) ? maxX : 1;
  const [yMin, yMax] = spec.yDomain ?? [
    Math.min(0, ...allPoints.map((point) => point.y)),
    Math.max(1, ...allPoints.map((point) => point.y))
  ];
  const xScale = d3?.scaleLinear
    ? d3.scaleLinear().domain([xMin, xMax === xMin ? xMin + 1 : xMax]).range([margin.left, width - margin.right])
    : null;
  const yScale = d3?.scaleLinear
    ? d3.scaleLinear().domain([yMin, yMax === yMin ? yMin + 1 : yMax]).range([height - margin.bottom, margin.top])
    : null;
  const scaleX = (x) => xScale
    ? xScale(x)
    : margin.left + ((x - xMin) / Math.max(1, xMax - xMin)) * plotWidth;
  const scaleY = (y) => yScale
    ? yScale(y)
    : margin.top + ((yMax - y) / Math.max(1, yMax - yMin)) * plotHeight;
  const yTicks = yScale
    ? yScale.ticks(yMin < 0 && yMax > 0 ? 5 : 4)
    : yMin < 0 ? [yMin, yMin / 2, 0, yMax / 2, yMax] : [yMin, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
  const xTicks = xMax === xMin
    ? [xMin]
    : xScale
      ? xScale.ticks(4).filter((tick) => tick >= xMin && tick <= xMax)
      : [...new Set([
          xMin,
          Math.round(xMin + (xMax - xMin) * 0.25),
          Math.round(xMin + (xMax - xMin) * 0.5),
          Math.round(xMin + (xMax - xMin) * 0.75),
          xMax
        ])].filter((tick) => tick >= xMin && tick <= xMax);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(spec.title)}" data-plot-foundation="observable-plot" data-plot-backend="d3" data-plot-renderer="sms3">`,
    "<style>text{font-family:Inter,Arial,sans-serif;font-size:12px;fill:#172026}.title{font-size:18px;font-weight:700}.axis{stroke:#5c6b75;stroke-width:1}.grid{stroke:#dfe7ec;stroke-width:1}.zero{stroke:#172026;stroke-width:1.2}.line{fill:none;stroke-width:2.2}.band{stroke:none}.dot{stroke:#fff;stroke-width:1}.legend-label{font-size:11px}.note{font-size:11px;fill:#64748b}</style>",
    `<rect width="${width}" height="${height}" fill="#ffffff"></rect>`,
    `<text class="title" x="${FIGURE_TEXT_X}" y="${FIGURE_TITLE_Y}">${escapeXml(spec.title)}</text>`,
    ...header.subtitleLines.map((line, index) =>
      `<text class="note" x="${FIGURE_TEXT_X}" y="${FIGURE_SUBTITLE_FIRST_Y + index * FIGURE_TEXT_LINE_HEIGHT}" data-plot-subtitle="true">${escapeXml(line)}</text>`
    )
  ];

  if (showLegend && legendItems.length > 0) {
    parts.push(`<g aria-label="Legend">`);
    parts.push(`<rect x="${margin.left}" y="${legendTop}" width="${plotWidth}" height="${legendHeight}" rx="4" fill="#f8fafc" stroke="#dfe7ec"></rect>`);
    legendItems.forEach((item, index) => {
      const y = legendTop + 16 + index * 20;
      if (item.kind === "band") {
        parts.push(`<rect x="${margin.left + 12}" y="${y - 5}" width="26" height="9" fill="${item.color}" fill-opacity="${item.opacity ?? 0.22}"></rect>`);
      } else {
        const dash = item.strokeDasharray ? ` stroke-dasharray="${escapeXml(item.strokeDasharray)}"` : "";
        parts.push(`<line stroke="${item.color}" stroke-width="${item.strokeWidth ?? 3}"${dash} x1="${margin.left + 12}" y1="${y}" x2="${margin.left + 38}" y2="${y}"></line>`);
      }
      parts.push(`<text class="legend-label" x="${margin.left + 46}" y="${y + 4}">${escapeXml(truncateLabel(item.label))}</text>`);
    });
    parts.push(`</g>`);
  }

  for (const tick of yTicks) {
    const y = scaleY(tick);
    parts.push(`<line class="grid" x1="${margin.left}" y1="${y.toFixed(2)}" x2="${width - margin.right}" y2="${y.toFixed(2)}"></line>`);
    parts.push(`<text x="${margin.left - 16}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeXml(formatTick(tick))}</text>`);
  }

  for (const tick of xTicks) {
    const x = scaleX(tick);
    parts.push(`<line class="grid" x1="${x.toFixed(2)}" y1="${margin.top}" x2="${x.toFixed(2)}" y2="${height - margin.bottom}"></line>`);
    parts.push(`<text x="${x.toFixed(2)}" y="${height - margin.bottom + 18}" text-anchor="middle">${escapeXml(formatTick(tick))}</text>`);
  }

  parts.push(`<line class="axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`);
  parts.push(`<line class="axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`);
  if (yMin < 0 && yMax > 0) {
    const zeroY = scaleY(0);
    parts.push(`<line class="zero" x1="${margin.left}" y1="${zeroY.toFixed(2)}" x2="${width - margin.right}" y2="${zeroY.toFixed(2)}"></line>`);
  }

  for (const band of bands) {
    const pointRows = band.points
      .filter((point) => point.y0 !== null && point.y0 !== undefined && point.y1 !== null && point.y1 !== undefined)
      .sort((left, right) => left.x - right.x);
    if (pointRows.length < 2) {
      continue;
    }
    const upper = pointRows.map((point) => [scaleX(point.x), scaleY(point.y1)]);
    const lower = [...pointRows].reverse().map((point) => [scaleX(point.x), scaleY(point.y0)]);
    const path = `M${upper.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")} L${lower.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")} Z`;
    parts.push(`<path class="band" fill="${band.color}" fill-opacity="${band.opacity}" d="${path}"><title>${escapeXml(band.label)}</title></path>`);
  }

  for (const item of series) {
    const pointRows = item.points.filter((point) => point.y !== null && point.y !== undefined);
    const points = pointRows.map((point) => `${scaleX(point.x).toFixed(2)},${scaleY(point.y).toFixed(2)}`);
    if (points.length > 1) {
      const linePath = d3?.line
        ? d3.line()
            .x((point) => scaleX(point.x))
            .y((point) => scaleY(point.y))(pointRows)
        : "";
      parts.push(linePath
        ? `<path class="line" stroke="${item.color}" stroke-width="${item.strokeWidth ?? 2.2}"${item.strokeDasharray ? ` stroke-dasharray="${escapeXml(item.strokeDasharray)}"` : ""} d="${linePath}"></path>`
        : `<polyline class="line" stroke="${item.color}" stroke-width="${item.strokeWidth ?? 2.2}"${item.strokeDasharray ? ` stroke-dasharray="${escapeXml(item.strokeDasharray)}"` : ""} points="${points.join(" ")}"></polyline>`
      );
    }
    if (shouldShowPointMarkersForSeries(spec, item)) {
      for (const point of item.points.filter((entry) => entry.y !== null && entry.y !== undefined)) {
        parts.push(
          `<circle class="dot" cx="${scaleX(point.x).toFixed(2)}" cy="${scaleY(point.y).toFixed(2)}" r="2.6" fill="${item.color}"><title>${escapeXml(point.title ?? `${item.label}: ${point.y}`)}</title></circle>`
        );
      }
    }
  }

  if (allPoints.length === 0) {
    parts.push(`<text x="${margin.left}" y="${margin.top + 28}">No plottable windows.</text>`);
  }
  for (const [index, note] of noteLines.entries()) {
    parts.push(`<text x="${FIGURE_TEXT_X}" y="${height - 50 + index * 14}" style="font-size:11px;fill:#64748b">${escapeXml(note)}</text>`);
  }
  parts.push(`<text x="${margin.left + plotWidth / 2}" y="${height - 18}" text-anchor="middle">${escapeXml(spec.xLabel)}</text>`);
  parts.push(`<text transform="translate(18 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeXml(spec.yLabel)}</text>`);
  parts.push("</svg>");
  return parts.join("\n");
}
