import {
  HEATMAP_CELL_GUTTER_PX,
  HEATMAP_LEGEND_BAR_WIDTH,
  HEATMAP_LEGEND_LABEL_GAP,
  heatmapLegendLayout,
  makeCategoricalBarRows,
  shouldShowPointMarkersForSeries
} from "../core/plot-renderer.js";
import { fitSideLegendLabel, sideLegendLayout } from "../core/plot-side-legend.js";
import {
  makePublicationPlotStyle,
  publicationSvgAttributeMap,
  SMS3_PLOT_THEME
} from "../core/publication-plot-style.js";

function addObservablePlotLegend(svg, plotSpec, plotTop, publicationStyle) {
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
  const marginLeft = 70;
  const marginRight = 34;
  const legend = showLegend && legendItems.length > 0
    ? sideLegendLayout(width, legendItems.map((item) => item.label), {
        left: marginLeft,
        fontSize: publicationStyle.bodyFontSize
      })
    : null;
  const labelGroup = document.createElementNS(namespace, "g");
  labelGroup.setAttribute("text-anchor", "start");

  if (publicationStyle.showTitle) {
    const title = document.createElementNS(namespace, "text");
    title.setAttribute("x", String(marginLeft));
    title.setAttribute("y", "28");
    title.setAttribute("text-anchor", "start");
    title.setAttribute("font-family", publicationStyle.fontFamily);
    title.setAttribute("font-size", String(publicationStyle.titleFontSize));
    title.setAttribute("font-weight", "600");
    title.setAttribute("fill", SMS3_PLOT_THEME.text);
    title.textContent = plotSpec.title ?? "Plot";
    labelGroup.append(title);
  }

  const legendGroup = document.createElementNS(namespace, "g");
  legendGroup.setAttribute("aria-label", "Legend");
  legendGroup.setAttribute("data-plot-legend", "true");
  legendGroup.setAttribute("text-anchor", "start");

  if (legend) {
    legendItems.forEach((item, index) => {
      const x = legend.legendX;
      const y = plotTop + 12 + index * legend.rowHeight;
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
        line.setAttribute("stroke-width", String(item.strokeWidth ?? publicationStyle.dataStrokeWidth));
        if (item.strokeDasharray) {
          line.setAttribute("stroke-dasharray", item.strokeDasharray);
        }
        legendGroup.append(line);
      }

      const text = document.createElementNS(namespace, "text");
      text.setAttribute("x", String(legend.labelX));
      text.setAttribute("y", String(y + 4));
      text.setAttribute("font-family", publicationStyle.fontFamily);
      text.setAttribute("font-size", String(publicationStyle.bodyFontSize));
      text.setAttribute("fill", SMS3_PLOT_THEME.text);
      text.setAttribute("text-anchor", "start");
      const fullLabel = item.label ?? item.id ?? `Series ${index + 1}`;
      text.textContent = fitSideLegendLabel(fullLabel, legend.labelWidth, publicationStyle.bodyFontSize);
      const fullTitle = document.createElementNS(namespace, "title");
      fullTitle.textContent = fullLabel;
      text.append(fullTitle);
      legendGroup.append(text);
    });
  }

  const xLabel = document.createElementNS(namespace, "text");
  xLabel.setAttribute("x", String((marginLeft + (legend?.plotRight ?? width - marginRight)) / 2));
  xLabel.setAttribute("y", String(height - 18));
  xLabel.setAttribute("font-family", publicationStyle.fontFamily);
  xLabel.setAttribute("font-size", String(publicationStyle.axisLabelFontSize));
  xLabel.setAttribute("fill", SMS3_PLOT_THEME.text);
  xLabel.setAttribute("text-anchor", "middle");
  xLabel.textContent = plotSpec.xLabel ?? "";
  labelGroup.append(xLabel);

  const yLabel = document.createElementNS(namespace, "text");
  yLabel.setAttribute("transform", `translate(18 ${height / 2}) rotate(-90)`);
  yLabel.setAttribute("font-family", publicationStyle.fontFamily);
  yLabel.setAttribute("font-size", String(publicationStyle.axisLabelFontSize));
  yLabel.setAttribute("fill", SMS3_PLOT_THEME.text);
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.textContent = plotSpec.yLabel ?? "";
  labelGroup.append(yLabel);

  svg.append(labelGroup);
  if (legend) {
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

function truncatePlotLabel(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function observableHeatmapColors(plotSpec) {
  if (plotSpec.colorScheme === "blue") {
    return SMS3_PLOT_THEME.heatmapScales.blue;
  }
  if (plotSpec.colorScheme === "red-blue") {
    return SMS3_PLOT_THEME.heatmapScales.redBlue;
  }
  if (plotSpec.colorScheme === "viridis") {
    return SMS3_PLOT_THEME.heatmapScales.viridis;
  }
  return SMS3_PLOT_THEME.heatmapScales.lightViridis;
}

function addObservableHeatmapAnnotations(svg, plotSpec, publicationStyle, matrixBounds) {
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

  if (publicationStyle.showTitle) {
    const title = document.createElementNS(namespace, "text");
    title.setAttribute("x", "24");
    title.setAttribute("y", "28");
    title.setAttribute("text-anchor", "start");
    title.setAttribute("font-family", publicationStyle.fontFamily);
    title.setAttribute("font-size", String(publicationStyle.titleFontSize));
    title.setAttribute("font-weight", "600");
    title.setAttribute("fill", SMS3_PLOT_THEME.text);
    title.textContent = plotSpec.title ?? "Heatmap";
    group.append(title);
  }

  const xLabel = document.createElementNS(namespace, "text");
  xLabel.setAttribute("data-heatmap-axis-label", "x");
  xLabel.setAttribute("x", String(width / 2));
  xLabel.setAttribute("y", String(height - 20));
  xLabel.setAttribute("font-family", publicationStyle.fontFamily);
  xLabel.setAttribute("font-size", String(publicationStyle.axisLabelFontSize));
  xLabel.setAttribute("fill", SMS3_PLOT_THEME.text);
  xLabel.setAttribute("text-anchor", "middle");
  xLabel.textContent = plotSpec.xLabel ?? "";
  group.append(xLabel);

  const yLabel = document.createElementNS(namespace, "text");
  yLabel.setAttribute("data-heatmap-axis-label", "y");
  yLabel.setAttribute("transform", `translate(18 ${height / 2}) rotate(-90)`);
  yLabel.setAttribute("font-family", publicationStyle.fontFamily);
  yLabel.setAttribute("font-size", String(publicationStyle.axisLabelFontSize));
  yLabel.setAttribute("fill", SMS3_PLOT_THEME.text);
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.textContent = plotSpec.yLabel ?? "";
  group.append(yLabel);

  const defs = document.createElementNS(namespace, "defs");
  const gradient = document.createElementNS(namespace, "linearGradient");
  gradient.setAttribute("id", gradientId);
  gradient.setAttribute("data-heatmap-legend-gradient", "true");
  gradient.setAttribute("x1", "0");
  gradient.setAttribute("x2", "0");
  gradient.setAttribute("y1", "0");
  gradient.setAttribute("y2", "1");
  const heatmapColors = observableHeatmapColors(plotSpec);
  const colorRamp = window.d3?.scaleLinear
    ? window.d3.scaleLinear()
      .domain(heatmapColors.map((_, index) => index / Math.max(1, heatmapColors.length - 1)))
      .range(heatmapColors)
    : (fraction) => heatmapColors[
      Math.max(0, Math.min(heatmapColors.length - 1, Math.round(fraction * (heatmapColors.length - 1))))
    ];
  for (let index = 0; index <= 64; index += 1) {
    const fraction = index / 64;
    const stop = document.createElementNS(namespace, "stop");
    stop.setAttribute("offset", `${fraction * 100}%`);
    stop.setAttribute("stop-color", colorRamp(1 - fraction));
    gradient.append(stop);
  }
  defs.append(gradient);
  svg.append(defs);

  const legendBarWidth = HEATMAP_LEGEND_BAR_WIDTH;
  const legendLabelGap = HEATMAP_LEGEND_LABEL_GAP;
  const legendLayout = heatmapLegendLayout({
    matrixX: matrixBounds.left,
    matrixY: matrixBounds.top,
    matrixWidth: matrixBounds.right - matrixBounds.left,
    matrixHeight: matrixBounds.bottom - matrixBounds.top
  });
  const legendHeight = legendLayout.height;
  const legendX = legendLayout.x;
  const legendY = legendLayout.y;
  const legendTitle = document.createElementNS(namespace, "text");
  legendTitle.setAttribute("data-heatmap-legend-title", "true");
  legendTitle.setAttribute("x", String(legendX + legendBarWidth / 2));
  legendTitle.setAttribute("y", String(legendY - 24));
  legendTitle.setAttribute("font-family", publicationStyle.fontFamily);
  legendTitle.setAttribute("font-size", String(publicationStyle.bodyFontSize));
  legendTitle.setAttribute("fill", SMS3_PLOT_THEME.text);
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
  maxLabel.setAttribute("font-family", publicationStyle.fontFamily);
  maxLabel.setAttribute("font-size", String(publicationStyle.bodyFontSize));
  maxLabel.setAttribute("fill", SMS3_PLOT_THEME.text);
  maxLabel.setAttribute("dominant-baseline", "middle");
  maxLabel.textContent = formatPlotNumber(max);
  group.append(maxLabel);

  const minLabel = document.createElementNS(namespace, "text");
  minLabel.setAttribute("data-heatmap-legend-label", "min");
  minLabel.setAttribute("x", String(legendX + legendBarWidth + legendLabelGap));
  minLabel.setAttribute("y", String(legendY + legendHeight));
  minLabel.setAttribute("font-family", publicationStyle.fontFamily);
  minLabel.setAttribute("font-size", String(publicationStyle.bodyFontSize));
  minLabel.setAttribute("fill", SMS3_PLOT_THEME.text);
  minLabel.setAttribute("dominant-baseline", "middle");
  minLabel.textContent = formatPlotNumber(min);
  group.append(minLabel);

  svg.append(group);
}

function usesCodonCategoryLabels(plotSpec) {
  return plotSpec?.kind === "categorical-bar-plot" &&
    (plotSpec.categories ?? []).some((category) => category.group) &&
    (plotSpec.categories ?? []).every((category) => /^[ACGTU]{3}$/u.test(category.label));
}

function addCategoricalAminoAcidLabels(svg, plotSpec, publicationStyle) {
  if (!usesCodonCategoryLabels(plotSpec)) return;
  const namespace = "http://www.w3.org/2000/svg";
  const categoriesByLabel = new Map((plotSpec.categories ?? []).map((category) => [category.label, category]));
  const tickGroup = svg.querySelector('g[aria-label="x-axis tick label"]');
  const tickTexts = [...(tickGroup?.querySelectorAll("text") ?? [])];
  if (tickTexts.length === 0) {
    return;
  }
  for (const tickText of tickTexts) {
    tickText.setAttribute("font-family", publicationStyle.sequenceFontFamily);
    tickText.setAttribute("font-size", String(publicationStyle.smallFontSize));
    tickText.style.fontFamily = publicationStyle.sequenceFontFamily;
    tickText.style.fontVariantLigatures = "none";
  }
  const height = Number(svg.getAttribute("height")) || plotSpec.height || 548;
  const group = document.createElementNS(namespace, "g");
  group.setAttribute("aria-label", "Amino acid labels");
  group.setAttribute("data-codon-amino-acid-labels", "true");
  group.setAttribute("text-anchor", "middle");
  group.setAttribute("font-family", publicationStyle.sequenceFontFamily);
  group.setAttribute("font-size", String(publicationStyle.smallFontSize));
  group.setAttribute("fill", SMS3_PLOT_THEME.textMuted);

  for (const tickText of tickTexts) {
    const codon = tickText.textContent;
    const category = categoriesByLabel.get(codon);
    if (!category?.group) continue;
    const match = tickText.getAttribute("transform")?.match(/translate\(([-\d.]+),([-\d.]+)\)/);
    if (!match) continue;
    const text = document.createElementNS(namespace, "text");
    text.setAttribute("x", match[1]);
    text.setAttribute("y", String(height - 54));
    text.setAttribute("font-family", publicationStyle.sequenceFontFamily);
    text.style.fontFamily = publicationStyle.sequenceFontFamily;
    text.style.fontVariantLigatures = "none";
    text.textContent = category.group;
    group.append(text);
  }

  if (group.childNodes.length > 0) {
    tickGroup.append(group);
  }
}

function polishCategoricalBarMarks(svg, plotSpec) {
  if (!usesCodonCategoryLabels(plotSpec)) return;
  for (const bar of svg.querySelectorAll('g[aria-label="bar"] rect')) {
    bar.setAttribute("shape-rendering", "geometricPrecision");
    bar.setAttribute("stroke", "none");
  }
}

function polishLineMarks(svg, plotSpec, publicationStyle) {
  [...svg.querySelectorAll('g[aria-label="line"] path')].forEach((line, index) => {
    line.setAttribute("pointer-events", "none");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute(
      "stroke-width",
      String(plotSpec.series?.[index]?.strokeWidth ?? publicationStyle.dataStrokeWidth)
    );
  });
}

function addObservableAxisRules(svg, {
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  publicationStyle
}) {
  const namespace = "http://www.w3.org/2000/svg";
  const width = getSvgNumericDimension(svg, "width");
  const height = getSvgNumericDimension(svg, "height");
  const plotRight = width - marginRight;
  const plotBottom = height - marginBottom;
  const group = document.createElementNS(namespace, "g");
  group.setAttribute("aria-label", "Plot axis rules");
  group.setAttribute("data-plot-axis-rules", "true");
  group.setAttribute("fill", "none");
  group.setAttribute("stroke", SMS3_PLOT_THEME.axis);
  group.setAttribute("stroke-width", String(publicationStyle.axisStrokeWidth));

  const xAxis = document.createElementNS(namespace, "line");
  xAxis.setAttribute("x1", String(marginLeft));
  xAxis.setAttribute("x2", String(plotRight));
  xAxis.setAttribute("y1", String(plotBottom));
  xAxis.setAttribute("y2", String(plotBottom));
  group.append(xAxis);

  const yAxis = document.createElementNS(namespace, "line");
  yAxis.setAttribute("x1", String(marginLeft));
  yAxis.setAttribute("x2", String(marginLeft));
  yAxis.setAttribute("y1", String(marginTop));
  yAxis.setAttribute("y2", String(plotBottom));
  group.append(yAxis);

  svg.insertBefore(group, svg.firstChild);
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
  svg.style.background = SMS3_PLOT_THEME.surface;
  svg.style.color = SMS3_PLOT_THEME.text;
  svg.style.colorScheme = "light";
  svg.setAttribute("data-plot-color-scheme", "light");
}

function publicationStyleForObservableSvg(svg, plotSpec) {
  return makePublicationPlotStyle(
    getSvgNumericDimension(svg, "width"),
    getSvgNumericDimension(svg, "height"),
    plotSpec
  );
}

function applyObservablePublicationStyle(svg, plotSpec, publicationStyle) {
  const namespace = "http://www.w3.org/2000/svg";
  const viewBoxWidth = getSvgNumericDimension(svg, "width");
  const viewBoxHeight = getSvgNumericDimension(svg, "height");
  if (!svg.hasAttribute("viewBox")) {
    svg.setAttribute("viewBox", `0 0 ${viewBoxWidth} ${viewBoxHeight}`);
  }
  for (const [name, value] of Object.entries(publicationSvgAttributeMap(publicationStyle))) {
    svg.setAttribute(name, String(value));
  }
  svg.setAttribute("font-family", publicationStyle.fontFamily);
  svg.setAttribute("font-size", String(publicationStyle.bodyFontSize));
  svg.setAttribute("data-sms3-publication-theme", "default");
  svg.setAttribute("data-grid-lines", plotSpec.showGridLines === true ? "shown" : "hidden");
  const style = document.createElementNS(namespace, "style");
  style.setAttribute("data-sms3-publication-style", "true");
  style.textContent = [
    `[data-plot-renderer="observable-plot"]{font-family:${publicationStyle.fontFamily};font-size:${publicationStyle.bodyFontSize}px;color:${SMS3_PLOT_THEME.text}}`,
    `[data-plot-renderer="observable-plot"] text{font-family:${publicationStyle.fontFamily};fill:${SMS3_PLOT_THEME.text};stroke:none;text-shadow:none;paint-order:normal}`,
    `[data-plot-renderer="observable-plot"] g[aria-label$="axis tick"]{stroke:${SMS3_PLOT_THEME.axis};stroke-width:${publicationStyle.axisStrokeWidth}}`,
    `[data-plot-renderer="observable-plot"] g[aria-label$="axis tick label"]{fill:${SMS3_PLOT_THEME.axis}}`,
    `[data-plot-renderer="observable-plot"] g[aria-label$="grid"]{stroke:${SMS3_PLOT_THEME.grid};stroke-width:${publicationStyle.axisStrokeWidth}}`
  ].join("");
  svg.prepend(style);
  lockPlotSvgToLightCanvas(svg);
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
      const width = plotSpec.width ?? Math.max(760, Math.min(1320, 220 + (plotSpec.xCategories ?? []).length * 42));
      const height = plotSpec.height ?? Math.max(460, Math.min(980, 210 + (plotSpec.yCategories ?? []).length * 30 + Math.min(140, maxXLabelLength * 5)));
      const margins = {
        top: 58,
        right: 104,
        bottom: Math.max(68, Math.min(150, 42 + maxXLabelLength * 4)),
        left: Math.max(84, Math.min(240, 42 + maxYLabelLength * 7))
      };
      const plot = window.Plot.plot({
        width,
        height,
        marginTop: margins.top,
        marginRight: margins.right,
        marginBottom: margins.bottom,
        marginLeft: margins.left,
        x: {
          label: null,
          tickRotate: maxXLabelLength > 8 ? -45 : 0,
          domain: (plotSpec.xCategories ?? []).map((item) => item.label),
          padding: 0
        },
        y: {
          label: null,
          domain: (plotSpec.yCategories ?? []).map((item) => item.label),
          padding: 0
        },
        color: {
          label: plotSpec.valueLabel ?? "Value",
          domain: plotSpec.valueDomain,
          range: observableHeatmapColors(plotSpec),
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
                inset: HEATMAP_CELL_GUTTER_PX / 2
              })]
            : []),
          cellMark(rows, {
            x: "x",
            y: "y",
            fill: "value",
            title: "title",
            inset: HEATMAP_CELL_GUTTER_PX / 2
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
      svg.setAttribute("data-sms3-plot-kind", "heatmap");
      svg.setAttribute("data-heatmap-cell-gutter-px", String(HEATMAP_CELL_GUTTER_PX));
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const publicationStyle = publicationStyleForObservableSvg(svg, plotSpec);
      addObservableAxisRules(svg, {
        marginTop: margins.top,
        marginRight: margins.right,
        marginBottom: margins.bottom,
        marginLeft: margins.left,
        publicationStyle
      });
      addObservableHeatmapAnnotations(svg, plotSpec, publicationStyle, {
        left: margins.left,
        top: margins.top,
        right: width - margins.right,
        bottom: height - margins.bottom
      });
      applyObservablePublicationStyle(svg, plotSpec, publicationStyle);
      return svg;
    }
    if (plotSpec.kind === "categorical-bar-plot") {
      const rows = makeCategoricalBarRows(plotSpec);
      if (rows.length === 0 || !window.Plot.barY) {
        return null;
      }
      const series = plotSpec.series ?? [];
      const showLegend = plotSpec.showLegend !== false;
      const width = plotSpec.width ?? 1120;
      const provisionalStyle = makePublicationPlotStyle(width, 1, plotSpec);
      const sideLegend = showLegend && series.length > 0
        ? sideLegendLayout(width, series.map((item) => item.label), {
            left: 70,
            fontSize: provisionalStyle.bodyFontSize
          })
        : null;
      const topMargin = sideLegend ? 76 : 56;
      const horizontalCategoryLabels = plotSpec.xTickLabelMode === "horizontal";
      const bottomMargin = horizontalCategoryLabels ? 74 : 104;
      const plot = window.Plot.plot({
        width,
        height: Math.max(plotSpec.height ?? 0, 520, topMargin + bottomMargin + Math.max(300, 24 + (sideLegend ? series.length : 0) * 20)),
        marginTop: topMargin,
        marginBottom: bottomMargin,
        marginLeft: 70,
        marginRight: sideLegend?.right ?? 34,
        x: {
          label: null,
          grid: false,
          tickRotate: horizontalCategoryLabels ? 0 : -90,
          domain: plotSpec.categories.map((item) => item.label)
        },
        y: {
          label: null,
          domain: plotSpec.yDomain,
          grid: plotSpec.showGridLines === true
        },
        color: {
          domain: series.map((item) => item.label),
          range: series.map((item) => item.color),
          legend: false
        },
        marks: [
          window.Plot.barY(rows, {
            x: "category",
            ...(plotSpec.barLayout === "stacked"
              ? { y1: "y1", y2: "y2" }
              : { y: "value" }),
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
      svg.setAttribute("data-sms3-plot-kind", "categorical-bar-plot");
      svg.setAttribute("data-sms3-plot-width-mode", plotSpec.barWidthMode ?? "compact");
      svg.setAttribute("data-sms3-bar-layout", plotSpec.barLayout ?? "grouped");
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const publicationStyle = publicationStyleForObservableSvg(svg, plotSpec);
      addObservableAxisRules(svg, {
        marginTop: topMargin,
        marginRight: sideLegend?.right ?? 34,
        marginBottom: bottomMargin,
        marginLeft: 70,
        publicationStyle
      });
      polishCategoricalBarMarks(svg, plotSpec);
      addObservablePlotLegend(svg, plotSpec, topMargin, publicationStyle);
      if (!horizontalCategoryLabels) {
        addCategoricalAminoAcidLabels(svg, plotSpec, publicationStyle);
      }
      applyObservablePublicationStyle(svg, plotSpec, publicationStyle);
      return svg;
    }
    const rows = plotSpec.series.flatMap((series) =>
      series.points.map((point) => ({
        series: series.label,
        x: point.x,
        y: point.y,
        title: point.title ?? `${series.label}; ${plotSpec.xLabel} ${point.x}; ${plotSpec.yLabel} ${point.y}`
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
    const markerRowSet = new Set(markerRows);
    const inspectionRows = rows.filter((row) => !markerRowSet.has(row));
    if (!lineMark || (bandRows.length > 0 && !areaMark) || !dotMark) {
      return null;
    }
    const series = plotSpec.series ?? [];
    const bands = plotSpec.bands ?? [];
    const showLegend = plotSpec.showLegend !== false;
    const legendItemCount = series.length + bands.length;
    const width = plotSpec.width ?? 920;
    const provisionalStyle = makePublicationPlotStyle(width, 1, plotSpec);
    const sideLegend = showLegend && legendItemCount > 0
      ? sideLegendLayout(width, [...bands, ...series].map((item) => item.label), {
          left: 70,
          fontSize: provisionalStyle.bodyFontSize
        })
      : null;
    const topMargin = sideLegend ? 76 : 56;
    const plot = window.Plot.plot({
      width,
      height: Math.max(plotSpec.height ?? 0, 460, topMargin + 64 + Math.max(300, 24 + (sideLegend ? legendItemCount : 0) * 20)),
      marginTop: topMargin,
      marginBottom: 64,
      marginLeft: 70,
      marginRight: sideLegend?.right ?? 34,
      x: { label: null, grid: plotSpec.showGridLines === true },
      y: {
        label: null,
        domain: plotSpec.yDomain,
        grid: plotSpec.showGridLines === true
      },
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
        ...series.flatMap((item) => {
          const itemMarkerRows = markerRows.filter((row) => row.series === item.label);
          return itemMarkerRows.length > 0
            ? [dotMark(itemMarkerRows, {
                x: "x",
                y: "y",
                fill: item.color ?? "#2563eb",
                stroke: "none",
                title: "title",
                r: 2.5
              })]
            : [];
        }),
        ...series.map((item) => lineMark(
          rows.filter((row) => row.series === item.label),
          {
            x: "x",
            y: "y",
            stroke: item.color ?? "#2563eb",
            strokeWidth: item.strokeWidth ?? 2.2,
            strokeDasharray: item.strokeDasharray,
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }
        )),
        ...(inspectionRows.length > 0
          ? [dotMark(inspectionRows, {
              x: "x",
              y: "y",
              fill: "transparent",
              stroke: "none",
              title: "title",
              r: 5.5
            })]
          : [])
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
    const publicationStyle = publicationStyleForObservableSvg(svg, plotSpec);
    addObservableAxisRules(svg, {
      marginTop: topMargin,
      marginRight: sideLegend?.right ?? 34,
      marginBottom: 64,
      marginLeft: 70,
      publicationStyle
    });
    polishLineMarks(svg, plotSpec, publicationStyle);
    addObservablePlotLegend(svg, plotSpec, topMargin, publicationStyle);
    applyObservablePublicationStyle(svg, plotSpec, publicationStyle);
    return svg;
  } catch (error) {
    console.warn("Could not render the live publication plot; using the deterministic SVG fallback.", error);
    return null;
  }
}
