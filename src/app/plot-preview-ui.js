import { shouldShowPointMarkersForSeries } from "../core/plot-renderer.js";

function truncatePlotLabel(label, maxLength = 44) {
  const text = String(label ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function addObservablePlotLegend(svg, plotSpec) {
  const namespace = "http://www.w3.org/2000/svg";
  const width = plotSpec.width ?? 920;
  const height = Number(svg.getAttribute("height")) || plotSpec.height || 460;
  const series = plotSpec.series ?? [];
  const bands = plotSpec.bands ?? [];
  const legendItems = [
    ...bands.map((band) => ({ ...band, legendKind: "band" })),
    ...series.map((item) => ({ ...item, legendKind: "line" }))
  ];
  const showLegend = plotSpec.showLegend !== false;
  const columnCount = legendItems.length > 6 ? 2 : 1;
  const rowCount = showLegend ? Math.ceil(legendItems.length / columnCount) : 0;
  const marginLeft = 70;
  const marginRight = 34;
  const legendWidth = width - marginLeft - marginRight;
  const columnWidth = legendWidth / columnCount;
  const labelGroup = document.createElementNS(namespace, "g");
  labelGroup.setAttribute("text-anchor", "start");

  const title = document.createElementNS(namespace, "text");
  title.setAttribute("x", String(marginLeft));
  title.setAttribute("y", "28");
  title.setAttribute("text-anchor", "start");
  title.setAttribute("font-family", "Inter, Arial, sans-serif");
  title.setAttribute("font-size", "18");
  title.setAttribute("font-weight", "700");
  title.setAttribute("fill", "#172026");
  title.textContent = plotSpec.title ?? "Plot";
  labelGroup.append(title);

  const legendGroup = document.createElementNS(namespace, "g");
  legendGroup.setAttribute("aria-label", "Legend");
  legendGroup.setAttribute("data-plot-legend", "true");
  legendGroup.setAttribute("text-anchor", "start");

  if (showLegend && legendItems.length > 0) {
    const legendBox = document.createElementNS(namespace, "rect");
    legendBox.setAttribute("x", String(marginLeft));
    legendBox.setAttribute("y", "40");
    legendBox.setAttribute("width", String(legendWidth));
    legendBox.setAttribute("height", String(Math.max(30, rowCount * 20 + 12)));
    legendBox.setAttribute("rx", "4");
    legendBox.setAttribute("fill", "#f8fafc");
    legendBox.setAttribute("stroke", "#dfe7ec");
    legendGroup.append(legendBox);
  }

  if (showLegend) {
    legendItems.forEach((item, index) => {
      const column = Math.floor(index / rowCount);
      const row = index % rowCount;
      const x = marginLeft + 12 + column * columnWidth;
      const y = 58 + row * 20;
      if (plotSpec.kind === "categorical-bar-plot" || item.legendKind === "band") {
        const swatch = document.createElementNS(namespace, "rect");
        swatch.setAttribute("x", String(x));
        swatch.setAttribute("y", String(y - 8));
        swatch.setAttribute("width", "24");
        swatch.setAttribute("height", "10");
        swatch.setAttribute("fill", item.color ?? "#2563eb");
        if (item.opacity !== undefined) {
          swatch.setAttribute("fill-opacity", String(item.opacity));
        }
        legendGroup.append(swatch);
      } else {
        const line = document.createElementNS(namespace, "line");
        line.setAttribute("x1", String(x));
        line.setAttribute("x2", String(x + 24));
        line.setAttribute("y1", String(y));
        line.setAttribute("y2", String(y));
        line.setAttribute("stroke", item.color ?? "#2563eb");
        line.setAttribute("stroke-width", "3");
        if (item.strokeDasharray) {
          line.setAttribute("stroke-dasharray", item.strokeDasharray);
        }
        legendGroup.append(line);
      }

      const text = document.createElementNS(namespace, "text");
      text.setAttribute("x", String(x + 32));
      text.setAttribute("y", String(y + 4));
      text.setAttribute("font-family", "Inter, Arial, sans-serif");
      text.setAttribute("font-size", "11");
      text.setAttribute("fill", "#172026");
      text.setAttribute("text-anchor", "start");
      text.textContent = truncatePlotLabel(item.label ?? item.id ?? `Series ${index + 1}`);
      legendGroup.append(text);
    });
  }

  const xLabel = document.createElementNS(namespace, "text");
  xLabel.setAttribute("x", String(width / 2));
  xLabel.setAttribute("y", String(height - 18));
  xLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  xLabel.setAttribute("font-size", "12");
  xLabel.setAttribute("fill", "#172026");
  xLabel.setAttribute("text-anchor", "middle");
  xLabel.textContent = plotSpec.xLabel ?? "";
  labelGroup.append(xLabel);

  const yLabel = document.createElementNS(namespace, "text");
  yLabel.setAttribute("transform", `translate(18 ${height / 2}) rotate(-90)`);
  yLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  yLabel.setAttribute("font-size", "12");
  yLabel.setAttribute("fill", "#172026");
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.textContent = plotSpec.yLabel ?? "";
  labelGroup.append(yLabel);

  svg.append(labelGroup);
  if (showLegend && legendItems.length > 0) {
    svg.append(legendGroup);
  }
}

let observableHeatmapLegendCounter = 0;

function formatPlotNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const absolute = Math.abs(value);
  if ((absolute > 0 && absolute < 0.01) || absolute >= 100000) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(3)));
}

function addObservableHeatmapAnnotations(svg, plotSpec) {
  const namespace = "http://www.w3.org/2000/svg";
  const width = Number(svg.getAttribute("width")) || plotSpec.width || 760;
  const height = Number(svg.getAttribute("height")) || plotSpec.height || 460;
  const cells = plotSpec.cells ?? [];
  const numericValues = cells.map((cell) => Number(cell.value)).filter(Number.isFinite);
  const domain = Array.isArray(plotSpec.valueDomain) && plotSpec.valueDomain.length >= 2
    ? plotSpec.valueDomain.map(Number)
    : [Math.min(...numericValues), Math.max(...numericValues)];
  const min = Number.isFinite(domain[0]) ? domain[0] : 0;
  const max = Number.isFinite(domain[1]) ? domain[1] : min;
  const gradientId = `sms3-heatmap-gradient-${++observableHeatmapLegendCounter}`;
  const group = document.createElementNS(namespace, "g");
  group.setAttribute("aria-label", "Plot title and color scale");
  group.setAttribute("data-plot-legend", "true");

  const title = document.createElementNS(namespace, "text");
  title.setAttribute("x", "24");
  title.setAttribute("y", "28");
  title.setAttribute("text-anchor", "start");
  title.setAttribute("font-family", "Inter, Arial, sans-serif");
  title.setAttribute("font-size", "18");
  title.setAttribute("font-weight", "700");
  title.setAttribute("fill", "#172026");
  title.textContent = plotSpec.title ?? "Heatmap";
  group.append(title);

  const xLabel = document.createElementNS(namespace, "text");
  xLabel.setAttribute("data-heatmap-axis-label", "x");
  xLabel.setAttribute("x", String(width / 2));
  xLabel.setAttribute("y", String(height - 20));
  xLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  xLabel.setAttribute("font-size", "12");
  xLabel.setAttribute("fill", "#172026");
  xLabel.setAttribute("text-anchor", "middle");
  xLabel.textContent = plotSpec.xLabel ?? "";
  group.append(xLabel);

  const yLabel = document.createElementNS(namespace, "text");
  yLabel.setAttribute("data-heatmap-axis-label", "y");
  yLabel.setAttribute("transform", `translate(18 ${height / 2}) rotate(-90)`);
  yLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  yLabel.setAttribute("font-size", "12");
  yLabel.setAttribute("fill", "#172026");
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.textContent = plotSpec.yLabel ?? "";
  group.append(yLabel);

  const defs = document.createElementNS(namespace, "defs");
  const gradient = document.createElementNS(namespace, "linearGradient");
  gradient.setAttribute("id", gradientId);
  gradient.setAttribute("x1", "0");
  gradient.setAttribute("x2", "0");
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("y2", "1");
  const colorRamp = window.d3?.interpolateTurbo ?? ((fraction) => {
    const fallback = ["#30123b", "#4664d7", "#35c4aa", "#f5e642", "#e73f0c"];
    return fallback[Math.max(0, Math.min(fallback.length - 1, Math.round(fraction * (fallback.length - 1))))];
  });
  for (let index = 0; index <= 12; index += 1) {
    const fraction = index / 12;
    const stop = document.createElementNS(namespace, "stop");
    stop.setAttribute("offset", `${fraction * 100}%`);
    stop.setAttribute("stop-color", colorRamp(1 - fraction));
    gradient.append(stop);
  }
  defs.append(gradient);
  svg.append(defs);

  const legendBarWidth = 18;
  const legendLabelGap = 20;
  const legendHeight = Math.max(110, Math.min(180, height - 240));
  const legendX = Math.max(0, width - 112);
  const legendY = 88;
  const legendTitle = document.createElementNS(namespace, "text");
  legendTitle.setAttribute("data-heatmap-legend-title", "true");
  legendTitle.setAttribute("x", String(legendX + legendBarWidth / 2));
  legendTitle.setAttribute("y", String(legendY - 24));
  legendTitle.setAttribute("font-family", "Inter, Arial, sans-serif");
  legendTitle.setAttribute("font-size", "11");
  legendTitle.setAttribute("fill", "#172026");
  legendTitle.setAttribute("text-anchor", "middle");
  legendTitle.textContent = truncatePlotLabel(plotSpec.valueLabel ?? "Value", 18);
  group.append(legendTitle);

  const ramp = document.createElementNS(namespace, "rect");
  ramp.setAttribute("data-heatmap-legend-bar", "true");
  ramp.setAttribute("x", String(legendX));
  ramp.setAttribute("y", String(legendY));
  ramp.setAttribute("width", String(legendBarWidth));
  ramp.setAttribute("height", String(legendHeight));
  ramp.setAttribute("fill", `url(#${gradientId})`);
  group.append(ramp);

  const maxLabel = document.createElementNS(namespace, "text");
  maxLabel.setAttribute("data-heatmap-legend-label", "max");
  maxLabel.setAttribute("x", String(legendX + legendBarWidth + legendLabelGap));
  maxLabel.setAttribute("y", String(legendY));
  maxLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  maxLabel.setAttribute("font-size", "11");
  maxLabel.setAttribute("fill", "#172026");
  maxLabel.setAttribute("dominant-baseline", "middle");
  maxLabel.textContent = formatPlotNumber(max);
  group.append(maxLabel);

  const minLabel = document.createElementNS(namespace, "text");
  minLabel.setAttribute("data-heatmap-legend-label", "min");
  minLabel.setAttribute("x", String(legendX + legendBarWidth + legendLabelGap));
  minLabel.setAttribute("y", String(legendY + legendHeight));
  minLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  minLabel.setAttribute("font-size", "11");
  minLabel.setAttribute("fill", "#172026");
  minLabel.setAttribute("dominant-baseline", "middle");
  minLabel.textContent = formatPlotNumber(min);
  group.append(minLabel);

  svg.append(group);
}

function addCategoricalAminoAcidLabels(svg, plotSpec) {
  if (plotSpec?.kind !== "categorical-bar-plot") {
    return;
  }
  const namespace = "http://www.w3.org/2000/svg";
  const categoriesByLabel = new Map((plotSpec.categories ?? []).map((category) => [category.label, category]));
  const tickGroup = svg.querySelector('g[aria-label="x-axis tick label"]');
  const tickTexts = [...(tickGroup?.querySelectorAll("text") ?? [])];
  if (tickTexts.length === 0) {
    return;
  }
  const height = Number(svg.getAttribute("height")) || plotSpec.height || 548;
  const group = document.createElementNS(namespace, "g");
  group.setAttribute("aria-label", "Amino acid labels");
  group.setAttribute("data-codon-amino-acid-labels", "true");
  group.setAttribute("text-anchor", "middle");
  group.setAttribute("font-family", "Inter, Arial, sans-serif");
  group.setAttribute("font-size", "9");
  group.setAttribute("fill", "#64748b");

  for (const tickText of tickTexts) {
    const codon = tickText.textContent;
    const category = categoriesByLabel.get(codon);
    if (!category?.group) {
      continue;
    }
    const match = tickText.getAttribute("transform")?.match(/translate\(([-\d.]+),([-\d.]+)\)/);
    if (!match) {
      continue;
    }
    const text = document.createElementNS(namespace, "text");
    text.setAttribute("x", match[1]);
    text.setAttribute("y", String(height - 54));
    text.textContent = category.group;
    group.append(text);
  }

  if (group.childNodes.length > 0) {
    tickGroup.append(group);
  }
}

function getSvgNumericDimension(svg, attribute) {
  const value = Number.parseFloat(svg.getAttribute(attribute) ?? "");
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  if (viewBox?.length === 4 && Number.isFinite(viewBox[attribute === "width" ? 2 : 3])) {
    return viewBox[attribute === "width" ? 2 : 3];
  }
  const box = svg.getBoundingClientRect?.();
  return attribute === "width" ? box?.width ?? 0 : box?.height ?? 0;
}

function selectObservablePlotSvg(plot) {
  if (!plot) {
    return null;
  }
  if (plot instanceof SVGSVGElement) {
    return plot;
  }
  const svgs = Array.from(plot.querySelectorAll?.("svg") ?? []);
  if (svgs.length === 0) {
    return null;
  }
  return svgs
    .map((svg) => ({
      svg,
      area: getSvgNumericDimension(svg, "width") * getSvgNumericDimension(svg, "height")
    }))
    .sort((a, b) => b.area - a.area)[0]?.svg ?? null;
}

function lockPlotSvgToLightCanvas(svg) {
  if (!svg) {
    return;
  }
  svg.style.background = "#ffffff";
  svg.style.color = "#172026";
  svg.style.colorScheme = "light";
  svg.setAttribute("data-plot-color-scheme", "light");
}

export function renderObservablePlotPreview(plotSpec) {
  try {
    if (!plotSpec || !window.Plot || !["line-plot", "categorical-bar-plot", "heatmap"].includes(plotSpec.kind)) {
      return null;
    }
    if (plotSpec.kind === "heatmap") {
      const cellMark = window.Plot.cell;
      if (!cellMark) {
        return null;
      }
      const xLabels = new Map((plotSpec.xCategories ?? []).map((item) => [item.id, item.label]));
      const yLabels = new Map((plotSpec.yCategories ?? []).map((item) => [item.id, item.label]));
      const rows = (plotSpec.cells ?? []).map((cell) => ({
        x: xLabels.get(cell.x) ?? cell.x,
        y: yLabels.get(cell.y) ?? cell.y,
        value: cell.value,
        title: cell.title
      }));
      const missingRows = (plotSpec.missingCells ?? []).map((cell) => ({
        x: xLabels.get(cell.x) ?? cell.x,
        y: yLabels.get(cell.y) ?? cell.y,
        title: cell.title
      }));
      if (rows.length === 0 && missingRows.length === 0) {
        return null;
      }
      const maxXLabelLength = Math.max(...(plotSpec.xCategories ?? []).map((item) => String(item.label).length), 4);
      const maxYLabelLength = Math.max(...(plotSpec.yCategories ?? []).map((item) => String(item.label).length), 4);
      const plot = window.Plot.plot({
        width: plotSpec.width ?? Math.max(760, Math.min(1320, 220 + (plotSpec.xCategories ?? []).length * 42)),
        height: plotSpec.height ?? Math.max(460, Math.min(980, 210 + (plotSpec.yCategories ?? []).length * 30 + Math.min(140, maxXLabelLength * 5))),
        marginTop: 58,
        marginRight: 104,
        marginBottom: Math.max(68, Math.min(150, 42 + maxXLabelLength * 4)),
        marginLeft: Math.max(84, Math.min(240, 42 + maxYLabelLength * 7)),
        x: {
          label: null,
          tickRotate: maxXLabelLength > 8 ? -45 : 0,
          domain: (plotSpec.xCategories ?? []).map((item) => item.label)
        },
        y: {
          label: null,
          domain: (plotSpec.yCategories ?? []).map((item) => item.label)
        },
        color: {
          label: plotSpec.valueLabel ?? "Value",
          domain: plotSpec.valueDomain,
          scheme: plotSpec.colorScheme === "blue"
            ? "blues"
            : plotSpec.colorScheme === "red-blue"
              ? "rdbu"
              : plotSpec.colorScheme ?? "viridis",
          legend: false
        },
        marks: [
          ...(missingRows.length > 0
            ? [cellMark(missingRows, {
                x: "x",
                y: "y",
                fill: "#f1f5f9",
                stroke: "#e2e8f0",
                title: "title",
                inset: 0.5
              })]
            : []),
          cellMark(rows, {
            x: "x",
            y: "y",
            fill: "value",
            title: "title",
            inset: 0.5
          })
        ]
      });
      const svg = selectObservablePlotSvg(plot);
      if (!svg) {
        return null;
      }
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", plotSpec.title ?? "Heatmap");
      svg.setAttribute("data-plot-foundation", "observable-plot");
      svg.setAttribute("data-plot-backend", "d3");
      svg.setAttribute("data-plot-renderer", "observable-plot");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      lockPlotSvgToLightCanvas(svg);
      addObservableHeatmapAnnotations(svg, plotSpec);
      return svg;
    }
    if (plotSpec.kind === "categorical-bar-plot") {
      const rows = plotSpec.bars.map((bar) => {
        const category = plotSpec.categories.find((item) => item.id === bar.category);
        const series = plotSpec.series.find((item) => item.id === bar.series);
        return {
          category: category?.label ?? bar.category,
          series: series?.label ?? bar.series,
          value: bar.value,
          title: bar.title
        };
      });
      if (rows.length === 0 || !window.Plot.barY) {
        return null;
      }
      const series = plotSpec.series ?? [];
      const showLegend = plotSpec.showLegend !== false;
      const legendRows = showLegend ? Math.ceil(series.length / (series.length > 6 ? 2 : 1)) : 0;
      const topMargin = showLegend && series.length > 0 ? Math.max(92, 58 + legendRows * 20) : 56;
      const horizontalCategoryLabels = plotSpec.xTickLabelMode === "horizontal";
      const plot = window.Plot.plot({
        width: plotSpec.width ?? 1120,
        height: plotSpec.height ?? Math.max(520, topMargin + 430),
        marginTop: topMargin,
        marginBottom: horizontalCategoryLabels ? 74 : 104,
        marginLeft: 70,
        marginRight: 34,
        x: {
          label: null,
          grid: false,
          tickRotate: horizontalCategoryLabels ? 0 : -90,
          domain: plotSpec.categories.map((item) => item.label)
        },
        y: { label: null, domain: plotSpec.yDomain, grid: true },
        color: {
          domain: series.map((item) => item.label),
          range: series.map((item) => item.color),
          legend: false
        },
        marks: [
          window.Plot.barY(rows, {
            x: "category",
            y: "value",
            fill: "series",
            title: "title",
            inset: 0.5
          })
        ]
      });
      const svg = selectObservablePlotSvg(plot);
      if (!svg) {
        return null;
      }
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", plotSpec.title ?? "Plot");
      svg.setAttribute("data-plot-foundation", "observable-plot");
      svg.setAttribute("data-plot-backend", "d3");
      svg.setAttribute("data-plot-renderer", "observable-plot");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      lockPlotSvgToLightCanvas(svg);
      addObservablePlotLegend(svg, plotSpec);
      if (!horizontalCategoryLabels) {
        addCategoricalAminoAcidLabels(svg, plotSpec);
      }
      return svg;
    }
    const rows = plotSpec.series.flatMap((series) =>
      series.points.map((point) => ({
        series: series.label,
        x: point.x,
        y: point.y,
        title: point.title
      }))
    );
    if (rows.length === 0) {
      return null;
    }
    const bandRows = (plotSpec.bands ?? []).flatMap((band) =>
      (band.points ?? []).map((point) => ({
        band: band.label,
        x: point.x,
        y1: point.y0,
        y2: point.y1,
        title: point.title
      }))
    );
    const lineMark = window.Plot.lineY ?? window.Plot.line;
    const areaMark = window.Plot.areaY ?? window.Plot.area;
    const dotMark = window.Plot.dot ?? window.Plot.dotY;
    const markerRows = rows.filter((row) =>
      shouldShowPointMarkersForSeries(plotSpec, plotSpec.series.find((series) => series.label === row.series))
    );
    if (!lineMark || (bandRows.length > 0 && !areaMark) || (markerRows.length > 0 && !dotMark)) {
      return null;
    }
    const series = plotSpec.series ?? [];
    const bands = plotSpec.bands ?? [];
    const showLegend = plotSpec.showLegend !== false;
    const legendItemCount = series.length + bands.length;
    const legendRows = showLegend ? Math.ceil(legendItemCount / (legendItemCount > 6 ? 2 : 1)) : 0;
    const topMargin = showLegend && legendItemCount > 0 ? Math.max(92, 58 + legendRows * 20) : 56;
    const plot = window.Plot.plot({
      width: plotSpec.width ?? 920,
      height: plotSpec.height ?? Math.max(460, topMargin + 340),
      marginTop: topMargin,
      marginBottom: 64,
      marginLeft: 70,
      marginRight: 34,
      x: { label: null, grid: true },
      y: { label: null, domain: plotSpec.yDomain, grid: true },
      color: { legend: false },
      marks: [
        ...bands.map((band) => areaMark(
          bandRows.filter((row) => row.band === band.label),
          {
            x: "x",
            y1: "y1",
            y2: "y2",
            fill: band.color ?? "#99f6e4",
            fillOpacity: band.opacity ?? 0.22,
            title: "title"
          }
        )),
        ...series.map((item) => lineMark(
          rows.filter((row) => row.series === item.label),
          {
            x: "x",
            y: "y",
            stroke: item.color ?? "#2563eb",
            strokeWidth: item.strokeWidth ?? 2.2,
            strokeDasharray: item.strokeDasharray,
            title: "title"
          }
        )),
        ...series.flatMap((item) => {
          const itemMarkerRows = markerRows.filter((row) => row.series === item.label);
          return itemMarkerRows.length > 0
            ? [dotMark(itemMarkerRows, { x: "x", y: "y", fill: item.color ?? "#2563eb", title: "title", r: 2.5 })]
            : [];
        })
      ]
    });
    const svg = selectObservablePlotSvg(plot);
    if (!svg) {
      return null;
    }
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", plotSpec.title ?? "Plot");
    svg.setAttribute("data-plot-foundation", "observable-plot");
    svg.setAttribute("data-plot-backend", "d3");
    svg.setAttribute("data-plot-renderer", "observable-plot");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    lockPlotSvgToLightCanvas(svg);
    addObservablePlotLegend(svg, plotSpec);
    return svg;
  } catch {
    return null;
  }
}
