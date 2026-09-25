import { makeSafeFileStem } from "./canvas-export.js";
import { downloadText } from "./file-download.js";
import { downloadSvgAsPng, serializeSvgElement } from "./svg-export.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FIGURE_FONT = "Arial, Helvetica, 'Liberation Sans', sans-serif";
const LOGO_GLYPH_HEIGHT = 75;
const MAX_VISIBLE_COLUMNS = 500;
const glyphMetricsCache = new Map();
let glyphMetricsContext = null;

const DNA_COLORS = Object.freeze({ A: "#17853f", C: "#2563d9", G: "#e07b00", T: "#cf3131", U: "#cf3131" });
const DNA_PAIR_COLORS = Object.freeze({ A: "#2b8cbe", T: "#2b8cbe", U: "#2b8cbe", C: "#d95f0e", G: "#d95f0e" });
const PROTEIN_CHEMISTRY = Object.freeze({
  A: "#4d5156", C: "#d18a00", D: "#c93838", E: "#c93838", F: "#3975a8",
  G: "#4d5156", H: "#7651a8", I: "#3975a8", K: "#2768c7", L: "#3975a8",
  M: "#3975a8", N: "#2b9274", P: "#9a651d", Q: "#2b9274", R: "#2768c7",
  S: "#2b9274", T: "#2b9274", V: "#3975a8", W: "#3975a8", Y: "#3975a8"
});
const PROTEIN_HYDROPHOBICITY = Object.freeze({
  A: "#62a744", C: "#75a43b", D: "#d43d3d", E: "#d43d3d", F: "#16836b",
  G: "#a6a13d", H: "#6d79a8", I: "#087a61", K: "#356bc0", L: "#087a61",
  M: "#16836b", N: "#a267a6", P: "#b27c31", Q: "#8a6aa8", R: "#356bc0",
  S: "#8aa34a", T: "#75a05a", V: "#16836b", W: "#087a61", Y: "#347f72"
});

function svgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null && value !== "") element.setAttribute(key, String(value));
  }
  if (text !== "") element.textContent = text;
  return element;
}

function addText(parent, attributes, text) {
  const fontSize = attributes["font-size"];
  const explicitFontStyle = [
    attributes.style,
    attributes["font-family"] ? `font-family: ${attributes["font-family"]}` : "",
    fontSize !== undefined ? `font-size: ${Number.isFinite(Number(fontSize)) ? `${fontSize}px` : fontSize}` : "",
    attributes["font-weight"] !== undefined ? `font-weight: ${attributes["font-weight"]}` : ""
  ].filter(Boolean).join("; ");
  parent.append(svgElement("text", {
    ...attributes,
    ...(explicitFontStyle ? { style: explicitFontStyle } : {})
  }, text));
}

function measureLogoGlyph(symbol) {
  if (glyphMetricsCache.has(symbol)) return glyphMetricsCache.get(symbol);
  if (!glyphMetricsContext) {
    glyphMetricsContext = document.createElement("canvas").getContext("2d");
    if (glyphMetricsContext) glyphMetricsContext.font = `800 100px ${FIGURE_FONT}`;
  }
  const measured = glyphMetricsContext?.measureText(symbol);
  const metrics = {
    ascent: Number(measured?.actualBoundingBoxAscent) || LOGO_GLYPH_HEIGHT,
    descent: Number(measured?.actualBoundingBoxDescent) || 0
  };
  glyphMetricsCache.set(symbol, metrics);
  return metrics;
}

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "n/a";
  const number = Number(value);
  return number.toFixed(digits).replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
}

function nicePositionTickStep(columnCount) {
  const requestedStep = Math.max(1, Math.ceil((Math.max(1, columnCount) - 1) / 8));
  const magnitude = 10 ** Math.floor(Math.log10(requestedStep));
  const normalized = requestedStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStep * magnitude;
}

function colorForSymbol(symbol, state, alphabet) {
  if (state.colorScheme === "monochrome") return "#202a31";
  if (state.colorScheme === "grayscale") {
    const index = Math.max(0, alphabet.indexOf(symbol));
    const shade = 42 + (index * 29) % 120;
    return `rgb(${shade} ${shade} ${shade})`;
  }
  if (alphabet.length <= 4) return (state.colorScheme === "base-pairing" ? DNA_PAIR_COLORS : DNA_COLORS)[symbol] ?? "#4d5156";
  return (state.colorScheme === "hydrophobicity" ? PROTEIN_HYDROPHOBICITY : PROTEIN_CHEMISTRY)[symbol] ?? "#4d5156";
}

function checkboxControl(labelText, checked, onChange) {
  const label = document.createElement("label");
  label.className = "sequence-logo-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  label.append(input, document.createTextNode(labelText));
  return { label, input };
}

function selectControl(labelText, choices, value, onChange) {
  const label = document.createElement("label");
  label.className = "sequence-logo-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const select = document.createElement("select");
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  label.append(span, select);
  return { label, select };
}

function numberControl(labelText, value, { min, max, step = 1 }, onChange) {
  const label = document.createElement("label");
  label.className = "sequence-logo-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.addEventListener("change", () => onChange(Number(input.value)));
  label.append(span, input);
  return { label, input };
}

function textControl(labelText, value, onChange) {
  const label = document.createElement("label");
  label.className = "sequence-logo-field sequence-logo-field-wide";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("input", () => onChange(input.value));
  label.append(span, input);
  return { label, input };
}

function toolbarButton(label, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = options.primary ? "sequence-logo-button primary" : "sequence-logo-button";
  button.textContent = label;
  if (options.pressed !== undefined) button.setAttribute("aria-pressed", String(options.pressed));
  button.addEventListener("click", onClick);
  return button;
}

function exportButton(format, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dna-viewer-export-button";
  button.title = `Download current logo as ${format}`;
  button.setAttribute("aria-label", button.title);
  const label = document.createElement("span");
  label.className = "dna-viewer-export-label";
  label.textContent = format;
  const icon = svgElement("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" });
  icon.innerHTML = '<path d="M10 3.25v8"></path><path d="m6.9 8.55 3.1 3.1 3.1-3.1"></path><path d="M4.25 15.75h11.5"></path>';
  button.append(label, icon);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await onClick();
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function rangeColumns(logo, state) {
  return logo.columns.filter((column) => column.position >= state.startPosition && column.position <= state.endPosition);
}

function dominantResidue(column, symbols) {
  return [...symbols].sort((left, right) => column.frequencies[right] - column.frequencies[left])[0] ?? "";
}

function stackDescription(column, logo, state) {
  const residues = logo.symbols
    .filter((symbol) => column.frequencies[symbol] > 0)
    .sort((left, right) => column.frequencies[right] - column.frequencies[left])
    .map((symbol) => `${symbol} ${formatNumber(column.frequencies[symbol] * 100, 1)}%`)
    .join(", ");
  const ci = column.confidenceInterval?.informationBits;
  const frequencyIntervals = state.mode === "frequency" && column.confidenceInterval
    ? logo.symbols
      .filter((symbol) => column.frequencies[symbol] > 0)
      .sort((left, right) => column.frequencies[right] - column.frequencies[left])
      .slice(0, 4)
      .map((symbol) => {
        const interval = column.confidenceInterval.frequencies[symbol];
        return `${symbol} ${formatNumber(interval[0] * 100, 1)}–${formatNumber(interval[1] * 100, 1)}%`;
      }).join(", ")
    : "";
  return [
    `Position ${column.position}`,
    residues || "no valid residues",
    `information ${formatNumber(column.informationBits)} bits`,
    `effective sample size ${formatNumber(column.effectiveSampleSize, 2)}`,
    `${formatNumber(column.gapCount, 2)} gaps`,
    ci ? `${Math.round(column.confidenceInterval.level * 100)}% bootstrap information interval ${formatNumber(ci[0])}–${formatNumber(ci[1])} bits` : "",
    frequencyIntervals ? `${Math.round(column.confidenceInterval.level * 100)}% bootstrap frequency intervals ${frequencyIntervals}` : ""
  ].filter(Boolean).join("; ");
}

function addLetterStack(svg, column, logo, state, geometry) {
  const { centerX, baselineY, plotHeight, yMax, cellWidth, maxCoverage } = geometry;
  const totalHeight = state.mode === "frequency" ? 1 : column.informationBits;
  const values = state.mode === "frequency" ? column.frequencies : column.letterHeightsBits;
  const coverage = maxCoverage > 0 ? column.contributingWeight / maxCoverage : 1;
  const widthScale = state.scaleWidthByCoverage ? Math.max(0.08, Math.min(1, coverage)) : 1;
  const glyphWidth = Math.max(1.8, cellWidth * 0.84 * widthScale);
  const sorted = logo.symbols
    .filter((symbol) => values[symbol] > 0)
    .sort((left, right) => values[left] - values[right] || left.localeCompare(right));
  let bottom = baselineY;
  const group = svgElement("g", {
    class: "sequence-logo-stack",
    "data-sms3-inspection-text": stackDescription(column, logo, state),
    role: "img",
    "aria-label": stackDescription(column, logo, state)
  });
  group.append(svgElement("title", {}, stackDescription(column, logo, state)));
  for (const symbol of sorted) {
    const value = values[symbol];
    const pixelHeight = Math.max(0, (value / yMax) * plotHeight);
    if (pixelHeight < 0.35) continue;
    const { ascent, descent } = measureLogoGlyph(symbol);
    const measuredHeight = ascent + descent > 0 ? ascent + descent : LOGO_GLYPH_HEIGHT;
    const fill = colorForSymbol(symbol, state, logo.symbols);
    const text = svgElement("text", {
      class: "sequence-logo-letter",
      x: 0,
      y: 0,
      fill,
      style: `fill: ${fill}; font-family: ${FIGURE_FONT}; font-size: 100px; font-weight: 800`,
      "font-family": FIGURE_FONT,
      "font-size": 100,
      "font-weight": 800,
      "text-anchor": "middle",
      "data-logo-bottom": bottom,
      "data-logo-width": glyphWidth,
      "data-logo-height": pixelHeight,
      transform: `translate(${centerX} ${bottom}) scale(${glyphWidth / 72} ${pixelHeight / measuredHeight}) translate(0 ${-descent})`,
      "aria-hidden": "true"
    }, symbol);
    group.append(text);
    bottom -= pixelHeight;
  }
  svg.append(group);

  if (state.showConfidenceInterval && state.mode === "information" && column.confidenceInterval?.informationBits) {
    const [low, high] = column.confidenceInterval.informationBits;
    const x = centerX + Math.min(cellWidth * 0.43, glyphWidth / 2 + 2.5);
    const lowY = baselineY - (low / yMax) * plotHeight;
    const highY = baselineY - (high / yMax) * plotHeight;
    const ci = svgElement("g", {
      class: "sequence-logo-ci",
      "data-logo-position": column.position,
      "data-logo-ci-low": low,
      "data-logo-ci-high": high,
      "data-logo-baseline": baselineY,
      "data-logo-plot-height": plotHeight,
      "data-logo-y-max": yMax,
      "data-sms3-inspection-text": `Position ${column.position}; ${Math.round(column.confidenceInterval.level * 100)}% bootstrap information interval ${formatNumber(low)}–${formatNumber(high)} bits`
    });
    ci.append(
      svgElement("line", { x1: x, y1: highY, x2: x, y2: lowY, stroke: "#394750", "stroke-width": 0.8 }),
      svgElement("line", { x1: x - 2.1, y1: highY, x2: x + 2.1, y2: highY, stroke: "#394750", "stroke-width": 0.8 }),
      svgElement("line", { x1: x - 2.1, y1: lowY, x2: x + 2.1, y2: lowY, stroke: "#394750", "stroke-width": 0.8 })
    );
    ci.append(svgElement("title", {}, `Position ${column.position}; bootstrap information interval ${formatNumber(low)}–${formatNumber(high)} bits`));
    svg.append(ci);
  }
  return totalHeight;
}

function addMiniTrack(svg, columns, rowGeometry, track, logo) {
  const { left, baselineY, cellWidth } = rowGeometry;
  const top = baselineY + track.offset;
  const height = 22;
  addText(svg, {
    x: left - 8,
    y: top + 14,
    fill: "#56636c",
    "font-family": FIGURE_FONT,
    "font-size": 8.2,
    "font-weight": 600,
    "text-anchor": "end"
  }, track.label);
  svg.append(svgElement("line", { x1: left, y1: top + height, x2: left + columns.length * cellWidth, y2: top + height, stroke: "#ccd4d9", "stroke-width": 0.65 }));
  const values = columns.map(track.value).filter((value) => Number.isFinite(value));
  const maxAbsolute = track.domain === "symmetric"
    ? Math.max(0.0001, ...values.map((value) => Math.abs(value)))
    : Math.max(0.0001, ...values);
  if (track.domain === "symmetric") {
    svg.append(svgElement("line", { x1: left, y1: top + height / 2, x2: left + columns.length * cellWidth, y2: top + height / 2, stroke: "#aeb9c0", "stroke-width": 0.55 }));
  }
  columns.forEach((column, index) => {
    const value = track.value(column);
    if (!Number.isFinite(value)) return;
    const centerX = left + (index + 0.5) * cellWidth;
    const barWidth = Math.max(1.5, cellWidth * 0.46);
    let y;
    let barHeight;
    if (track.domain === "symmetric") {
      const middle = top + height / 2;
      barHeight = Math.abs(value) / maxAbsolute * (height / 2);
      y = value >= 0 ? middle - barHeight : middle;
    } else {
      barHeight = value / maxAbsolute * height;
      y = top + height - barHeight;
    }
    const description = `Position ${column.position}; ${track.label} ${formatNumber(value, 3)}`;
    const bar = svgElement("rect", {
      x: centerX - barWidth / 2,
      y,
      width: barWidth,
      height: Math.max(0.35, barHeight),
      fill: track.color,
      opacity: 0.78,
      "data-sms3-inspection-text": description
    });
    bar.append(svgElement("title", {}, description));
    svg.append(bar);
  });
}

function addFrequencyInformationCiTrack(svg, columns, rowGeometry, logo) {
  const { left, baselineY, cellWidth } = rowGeometry;
  const top = baselineY + rowGeometry.ciOffset;
  const height = 22;
  const maxBits = Math.log2(logo.symbols.length);
  addText(svg, {
    x: left - 8, y: top + 14, fill: "#56636c", "font-family": FIGURE_FONT,
    "font-size": 8.2, "font-weight": 600, "text-anchor": "end"
  }, "Information CI");
  svg.append(svgElement("line", { x1: left, y1: top + height, x2: left + columns.length * cellWidth, y2: top + height, stroke: "#ccd4d9", "stroke-width": 0.65 }));
  columns.forEach((column, index) => {
    const interval = column.confidenceInterval?.informationBits;
    if (!interval) return;
    const x = left + (index + 0.5) * cellWidth;
    const highY = top + height - interval[1] / maxBits * height;
    const lowY = top + height - interval[0] / maxBits * height;
    const description = `Position ${column.position}; bootstrap information interval ${formatNumber(interval[0])}–${formatNumber(interval[1])} bits`;
    const group = svgElement("g", {
      class: "sequence-logo-frequency-information-ci",
      "data-logo-position": column.position,
      "data-logo-ci-low": interval[0],
      "data-logo-ci-high": interval[1],
      "data-logo-track-top": top,
      "data-logo-track-height": height,
      "data-logo-y-max": maxBits,
      "data-sms3-inspection-text": description
    });
    group.append(
      svgElement("line", { x1: x, y1: highY, x2: x, y2: lowY, stroke: "#4b5962", "stroke-width": 1 }),
      svgElement("line", { x1: x - 2, y1: highY, x2: x + 2, y2: highY, stroke: "#4b5962", "stroke-width": 1 }),
      svgElement("line", { x1: x - 2, y1: lowY, x2: x + 2, y2: lowY, stroke: "#4b5962", "stroke-width": 1 })
    );
    group.append(svgElement("title", {}, description));
    svg.append(group);
  });
}

function buildLogoSvg(logo, state, availableWidth) {
  const columns = rangeColumns(logo, state);
  const cellWidth = state.stackWidth === "compact" ? 20 : state.stackWidth === "wide" ? 32 : 26;
  const left = 62;
  const right = 18;
  const usableWidth = Math.max(220, availableWidth - left - right);
  const fitColumns = Math.max(5, Math.floor(usableWidth / cellWidth));
  const perRow = Math.max(1, Math.min(state.wrapColumns, fitColumns));
  const rows = [];
  for (let index = 0; index < columns.length; index += perRow) rows.push(columns.slice(index, index + perRow));
  const titleHeight = state.showTitle ? 58 : 22;
  const plotHeight = 112;
  const axisHeight = state.showNumbering ? 28 : 12;
  const tracks = [];
  if (state.showEffectiveSampleSize) tracks.push({ id: "n", label: "N effective", value: (column) => column.effectiveSampleSize, color: "#357aa1" });
  if (state.showLocalComplexity) tracks.push({ id: "complexity", label: "Complexity", value: (column) => column.localComplexity, color: "#629641" });
  if (state.showLocalRelativeConservation) tracks.push({ id: "relative", label: "Local Δ", value: (column) => column.localRelativeConservation, color: "#8a60a8", domain: "symmetric" });
  const frequencyCiTrack = state.showConfidenceInterval && state.mode === "frequency" && logo.bootstrap;
  const trackHeight = (tracks.length + (frequencyCiTrack ? 1 : 0)) * 31;
  const rowHeight = plotHeight + axisHeight + trackHeight + 24;
  const width = Math.max(360, left + right + Math.min(perRow, Math.max(1, columns.length)) * cellWidth);
  const height = titleHeight + Math.max(1, rows.length) * rowHeight + 42;
  const svg = svgElement("svg", {
    xmlns: SVG_NS,
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    class: "sequence-logo-svg",
    style: "color-scheme: light",
    role: "img",
    tabindex: "0",
    "data-sms3-inspection-highlight": "none",
    "aria-label": `${logo.title}; ${state.mode === "frequency" ? "frequency" : "information-content"} sequence logo`
  });
  svg.append(svgElement("rect", { x: 0, y: 0, width, height, fill: "#ffffff" }));
  if (state.showTitle) {
    addText(svg, { x: 18, y: 25, fill: "#172026", "font-family": FIGURE_FONT, "font-size": 16, "font-weight": 700 }, state.title || logo.title);
    const details = [
      `${logo.alphabet === "protein" ? "Protein" : logo.alphabet.toUpperCase()} · ${columns.length.toLocaleString()} displayed columns`,
      logo.sequenceCount ? `${logo.sequenceCount.toLocaleString()} sequences` : `${logo.sourceType} input`,
      logo.weighting === "henikoff" ? "Henikoff weighted" : "equal weights",
      logo.bootstrap ? `${Math.round(logo.bootstrap.confidenceLevel * 100)}% bootstrap intervals` : ""
    ].filter(Boolean).join(" · ");
    addText(svg, { x: 18, y: 43, fill: "#59666f", "font-family": FIGURE_FONT, "font-size": 9.5 }, details);
  }
  const yMax = state.mode === "frequency" ? 1 : Math.log2(logo.symbols.length);
  const maxCoverage = Math.max(0, ...columns.map((column) => Number(column.contributingWeight) || 0));
  const renderedRows = rows.length ? rows : [[]];
  renderedRows.forEach((row, rowIndex) => {
    const rowTop = titleHeight + rowIndex * rowHeight;
    const baselineY = rowTop + plotHeight;
    const positionTickStep = nicePositionTickStep(row.length);
    if (state.showAxis) {
      svg.append(
        svgElement("line", {
          class: "sequence-logo-y-axis",
          x1: left,
          y1: rowTop,
          x2: left,
          y2: baselineY,
          stroke: "#53636d",
          "stroke-width": 0.75
        }),
        svgElement("line", {
          class: "sequence-logo-baseline",
          x1: left,
          y1: baselineY,
          x2: left + row.length * cellWidth,
          y2: baselineY,
          stroke: "#53636d",
          "stroke-width": 0.8
        })
      );
      for (const fraction of [0, 0.5, 1]) {
        const y = baselineY - fraction * plotHeight;
        svg.append(svgElement("line", {
          class: "sequence-logo-y-tick",
          x1: left - 3,
          y1: y,
          x2: left + 3,
          y2: y,
          stroke: "#53636d",
          "stroke-width": 0.75
        }));
        addText(svg, { x: left - 7, y: y + 3, fill: "#4f5d66", "font-family": FIGURE_FONT, "font-size": 8, "text-anchor": "end" }, formatNumber(yMax * fraction, state.mode === "frequency" ? 1 : 2));
      }
      addText(svg, {
        x: 13,
        y: rowTop + plotHeight / 2,
        fill: "#4f5d66",
        "font-family": FIGURE_FONT,
        "font-size": 8.5,
        "font-weight": 600,
        "text-anchor": "middle",
        transform: `rotate(-90 13 ${rowTop + plotHeight / 2})`
      }, state.mode === "frequency" ? "Frequency" : "Bits");
    } else {
      svg.append(svgElement("line", {
        class: "sequence-logo-baseline",
        x1: left,
        y1: baselineY,
        x2: left + row.length * cellWidth,
        y2: baselineY,
        stroke: "#53636d",
        "stroke-width": 0.8
      }));
    }
    row.forEach((column, index) => {
      const centerX = left + (index + 0.5) * cellWidth;
      addLetterStack(svg, column, logo, state, { centerX, baselineY, plotHeight, yMax, cellWidth, maxCoverage });
      const position = Number(column.position);
      const showPositionTick = state.showNumbering && (
        index === 0
        || index === row.length - 1
        || (Number.isFinite(position) && position % positionTickStep === 0)
      );
      if (showPositionTick) {
        svg.append(svgElement("line", {
          class: "sequence-logo-x-tick",
          x1: centerX,
          y1: baselineY,
          x2: centerX,
          y2: baselineY + 4,
          stroke: "#53636d",
          "stroke-width": 0.75,
          "data-logo-position": column.position
        }));
        addText(svg, {
          class: "sequence-logo-position-label",
          x: centerX, y: baselineY + 16, fill: "#44525b", "font-family": FIGURE_FONT,
          "font-size": 8.2, "text-anchor": "middle", "data-logo-position": column.position
        }, String(column.position));
      }
    });
    let nextTrackOffset = axisHeight;
    if (frequencyCiTrack) {
      addFrequencyInformationCiTrack(svg, row, { left, baselineY, cellWidth, ciOffset: nextTrackOffset }, logo);
      nextTrackOffset += 31;
    }
    tracks.forEach((track) => {
      addMiniTrack(svg, row, { left, baselineY, cellWidth }, { ...track, offset: nextTrackOffset }, logo);
      nextTrackOffset += 31;
    });
  });
  const footnote = [
    "Gaps are excluded from letter frequencies.",
    logo.ambiguousPolicy === "fractional" ? "Ambiguous symbols are fractionally distributed." : "Ambiguous symbols are excluded.",
    state.mode === "information" ? "Letter height = frequency × Shannon information." : "Letter height = residue frequency."
  ].join(" ");
  addText(svg, { x: 18, y: height - 17, fill: "#64727a", "font-family": FIGURE_FONT, "font-size": 8.4 }, footnote);
  return svg;
}

function buildDataTable(logo, state) {
  const wrapper = document.createElement("div");
  wrapper.className = "sequence-logo-data-wrap";
  const table = document.createElement("table");
  table.className = "sequence-logo-data-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["Position", "N effective", "Gaps", "Entropy", "Information", "Information interval", "Frequency intervals", "Counts", "Frequencies"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headerRow.append(th);
  }
  head.append(headerRow);
  const body = document.createElement("tbody");
  for (const column of rangeColumns(logo, state)) {
    const row = document.createElement("tr");
    const values = [
      column.position,
      formatNumber(column.effectiveSampleSize, 2),
      formatNumber(column.gapCount, 2),
      formatNumber(column.entropyBits, 4),
      formatNumber(column.informationBits, 4),
      column.confidenceInterval
        ? `${formatNumber(column.confidenceInterval.informationBits[0], 4)}–${formatNumber(column.confidenceInterval.informationBits[1], 4)}`
        : "—",
      column.confidenceInterval
        ? logo.symbols.filter((symbol) => column.frequencies[symbol] > 0).map((symbol) => {
          const interval = column.confidenceInterval.frequencies[symbol];
          return `${symbol} ${formatNumber(interval[0], 4)}–${formatNumber(interval[1], 4)}`;
        }).join(" · ") || "—"
        : "—",
      logo.symbols.filter((symbol) => column.counts[symbol] > 0).map((symbol) => `${symbol} ${formatNumber(column.counts[symbol], 3)}`).join(" · ") || "—",
      logo.symbols.filter((symbol) => column.frequencies[symbol] > 0).map((symbol) => `${symbol} ${formatNumber(column.frequencies[symbol], 4)}`).join(" · ") || "—"
    ];
    values.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      if (index === 0) cell.scope = "row";
      cell.textContent = String(value);
      row.append(cell);
    });
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function logoTsv(logo) {
  const headers = ["position", "effective_sample_size", "gap_count", "ambiguous_count", "entropy_bits", "information_bits", "information_ci_low", "information_ci_high", "frequency_confidence_intervals", "counts", "frequencies"];
  return [headers.join("\t"), ...logo.columns.map((column) => [
    column.position,
    column.effectiveSampleSize,
    column.gapCount,
    column.ambiguousCount,
    column.entropyBits,
    column.informationBits,
    column.confidenceInterval?.informationBits?.[0] ?? "",
    column.confidenceInterval?.informationBits?.[1] ?? "",
    column.confidenceInterval
      ? logo.symbols.map((symbol) => `${symbol}:${column.confidenceInterval.frequencies[symbol][0]}-${column.confidenceInterval.frequencies[symbol][1]}`).join(" ")
      : "",
    logo.symbols.map((symbol) => `${symbol}:${column.counts[symbol] ?? "n/a"}`).join(" "),
    logo.symbols.map((symbol) => `${symbol}:${column.frequencies[symbol]}`).join(" ")
  ].join("\t"))].join("\n");
}

export function renderSequenceLogo(container, logo) {
  container.classList.add("sequence-logo-output");
  if (!logo?.columns?.length) {
    const empty = document.createElement("p");
    empty.className = "sequence-logo-empty";
    empty.textContent = "No sequence-logo columns were available.";
    container.append(empty);
    return;
  }
  const positions = logo.columns.map((column) => column.position);
  const state = {
    mode: logo.appearance?.mode === "frequency" ? "frequency" : "information",
    colorScheme: logo.appearance?.colorScheme ?? (logo.alphabet === "protein" ? "chemistry" : "classic"),
    wrapColumns: Math.max(5, Number(logo.appearance?.wrapColumns) || (logo.alphabet === "protein" ? 30 : 40)),
    stackWidth: "standard",
    startPosition: positions[0],
    endPosition: positions[Math.min(positions.length, 120) - 1],
    title: logo.title,
    showTitle: logo.appearance?.showTitle !== false,
    showAxis: logo.appearance?.showAxis !== false,
    showNumbering: true,
    showEffectiveSampleSize: logo.appearance?.showEffectiveSampleSize === true,
    showConfidenceInterval: logo.appearance?.showConfidenceInterval === true && Boolean(logo.bootstrap),
    showLocalComplexity: false,
    showLocalRelativeConservation: false,
    scaleWidthByCoverage: false,
    panelOpen: false,
    panelTab: "style"
  };
  const workspace = document.createElement("section");
  workspace.className = "sequence-logo-workspace";
  const toolbar = document.createElement("div");
  toolbar.className = "sequence-logo-toolbar";
  const heading = document.createElement("div");
  heading.className = "sequence-logo-toolbar-title";
  const strong = document.createElement("strong");
  strong.textContent = "Sequence logo";
  const detail = document.createElement("span");
  detail.textContent = `${logo.alphabet === "protein" ? "Protein" : logo.alphabet.toUpperCase()} · ${logo.columns.length.toLocaleString()} columns${logo.sequenceCount ? ` · ${logo.sequenceCount.toLocaleString()} sequences` : ""}`;
  heading.append(strong, detail);
  toolbar.append(heading);

  let currentSvg = null;
  let renderFrame = 0;
  const body = document.createElement("div");
  body.className = "sequence-logo-body";
  const paper = document.createElement("div");
  paper.className = "sequence-logo-paper";
  const host = document.createElement("div");
  host.className = "sequence-logo-svg-host";
  const notice = document.createElement("div");
  notice.className = "sequence-logo-range-notice";
  notice.hidden = true;
  paper.append(notice, host);
  const panel = document.createElement("aside");
  panel.className = "sequence-logo-panel";
  panel.hidden = true;
  body.append(paper, panel);

  const filename = () => `${makeSafeFileStem(state.title || logo.title, "sequence-logo")}`;
  const downloads = document.createElement("div");
  downloads.className = "dna-viewer-buttons sequence-logo-toolbar-actions";
  downloads.setAttribute("role", "group");
  downloads.setAttribute("aria-label", "Logo downloads");
  downloads.append(
    exportButton("PNG", async () => {
      if (currentSvg) await downloadSvgAsPng(serializeSvgElement(currentSvg), `${filename()}.png`);
    }),
    exportButton("SVG", () => {
      if (currentSvg) downloadText(serializeSvgElement(currentSvg), `${filename()}.svg`, "image/svg+xml;charset=utf-8");
    })
  );
  const settingsButton = toolbarButton("Settings", () => {
    state.panelOpen = !state.panelOpen;
    settingsButton.setAttribute("aria-pressed", String(state.panelOpen));
    panel.hidden = !state.panelOpen;
    workspace.classList.toggle("panel-open", state.panelOpen);
    if (state.panelOpen) renderPanel();
    queueRender();
  }, { pressed: false });
  toolbar.append(
    selectControl("View", [
      { value: "information", label: "Information (bits)" },
      { value: "frequency", label: "Frequency" }
    ], state.mode, (value) => { state.mode = value; render(); }).label,
    downloads,
    settingsButton
  );

  function validateRange() {
    const selected = rangeColumns(logo, state);
    if (selected.length > MAX_VISIBLE_COLUMNS) {
      notice.hidden = false;
      notice.textContent = `Choose a range of ${MAX_VISIBLE_COLUMNS.toLocaleString()} columns or fewer. The Data tab and TSV export retain all ${logo.columns.length.toLocaleString()} columns.`;
      return false;
    }
    if (selected.length === 0) {
      notice.hidden = false;
      notice.textContent = "The selected coordinate range does not contain a logo column.";
      return false;
    }
    notice.hidden = selected.length === logo.columns.length;
    if (!notice.hidden) {
      notice.textContent = `Showing positions ${selected[0].position.toLocaleString()}–${selected.at(-1).position.toLocaleString()} (${selected.length.toLocaleString()} of ${logo.columns.length.toLocaleString()} columns). Use Layout to choose another range; the Data tab and TSV retain all columns.`;
    }
    return true;
  }

  function render() {
    if (!validateRange()) {
      currentSvg = null;
      host.replaceChildren();
      return;
    }
    const paperStyle = getComputedStyle(paper);
    const horizontalPadding = Number.parseFloat(paperStyle.paddingLeft || "0") + Number.parseFloat(paperStyle.paddingRight || "0");
    const availableWidth = Math.max(360, (paper.clientWidth || 960) - horizontalPadding);
    currentSvg = buildLogoSvg(logo, state, availableWidth);
    host.replaceChildren(currentSvg);
    if (state.panelOpen && state.panelTab === "data") renderPanel();
  }
  function queueRender() {
    cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(render);
  }

  function renderPanel() {
    panel.textContent = "";
    const panelHeader = document.createElement("div");
    panelHeader.className = "sequence-logo-panel-header";
    const tabs = document.createElement("div");
    tabs.className = "sequence-logo-tabs";
    for (const [id, label] of [["style", "Style"], ["layout", "Layout"], ["tracks", "Tracks"], ["data", "Data"]]) {
      const button = toolbarButton(label, () => {
        state.panelTab = id;
        renderPanel();
      });
      button.classList.toggle("active", state.panelTab === id);
      button.setAttribute("aria-pressed", String(state.panelTab === id));
      tabs.append(button);
    }
    const close = toolbarButton("×", () => {
      state.panelOpen = false;
      panel.hidden = true;
      workspace.classList.remove("panel-open");
      settingsButton.setAttribute("aria-pressed", "false");
      queueRender();
    });
    close.classList.add("sequence-logo-panel-close");
    close.setAttribute("aria-label", "Close sequence logo settings");
    panelHeader.append(tabs, close);
    const content = document.createElement("div");
    content.className = "sequence-logo-panel-content";
    if (state.panelTab === "style") {
      const colorChoices = logo.alphabet === "protein"
        ? [
          { value: "chemistry", label: "Chemistry" },
          { value: "hydrophobicity", label: "Hydrophobicity" },
          { value: "grayscale", label: "Grayscale" },
          { value: "monochrome", label: "Monochrome" }
        ]
        : [
          { value: "classic", label: "Classic bases" },
          { value: "base-pairing", label: "Base pairing" },
          { value: "grayscale", label: "Grayscale" },
          { value: "monochrome", label: "Monochrome" }
        ];
      content.append(
        textControl("Figure title", state.title, (value) => { state.title = value; queueRender(); }).label,
        selectControl("Letter colors", colorChoices, state.colorScheme, (value) => { state.colorScheme = value; render(); }).label,
        checkboxControl("Show title", state.showTitle, (value) => { state.showTitle = value; render(); }).label,
        checkboxControl("Show y-axis", state.showAxis, (value) => { state.showAxis = value; render(); }).label,
        checkboxControl("Show position numbers", state.showNumbering, (value) => { state.showNumbering = value; render(); }).label,
        checkboxControl("Scale stack width by contributing data", state.scaleWidthByCoverage, (value) => { state.scaleWidthByCoverage = value; render(); }).label
      );
    } else if (state.panelTab === "layout") {
      const start = numberControl("Start position", state.startPosition, { min: positions[0], max: positions.at(-1) }, (value) => {
        state.startPosition = value;
        render();
      });
      const end = numberControl("End position", state.endPosition, { min: positions[0], max: positions.at(-1) }, (value) => {
        state.endPosition = value;
        render();
      });
      content.append(
        start.label,
        end.label,
        numberControl("Maximum columns per row", state.wrapColumns, { min: 5, max: 100 }, (value) => { state.wrapColumns = Math.max(5, Math.min(100, value || 40)); render(); }).label,
        selectControl("Stack width", [
          { value: "compact", label: "Compact" },
          { value: "standard", label: "Standard" },
          { value: "wide", label: "Wide" }
        ], state.stackWidth, (value) => { state.stackWidth = value; render(); }).label
      );
      const rangeHelp = document.createElement("p");
      rangeHelp.className = "sequence-logo-help";
      rangeHelp.textContent = `Up to ${MAX_VISIBLE_COLUMNS.toLocaleString()} columns can be drawn at once. Range changes affect the figure and its SVG/PNG exports, not the full Data table or TSV download.`;
      content.append(rangeHelp);
    } else if (state.panelTab === "tracks") {
      const trackIntro = document.createElement("p");
      trackIntro.className = "sequence-logo-help";
      trackIntro.textContent = "Tracks provide context without changing the conventional logo calculation.";
      content.append(
        trackIntro,
        checkboxControl("Effective sample size", state.showEffectiveSampleSize, (value) => { state.showEffectiveSampleSize = value; render(); }).label
      );
      if (logo.bootstrap) {
        content.append(checkboxControl("Bootstrap confidence intervals", state.showConfidenceInterval, (value) => { state.showConfidenceInterval = value; render(); }).label);
      }
      if (logo.columns.some((column) => column.localComplexity !== null)) {
        content.append(checkboxControl("Local sequence complexity", state.showLocalComplexity, (value) => { state.showLocalComplexity = value; render(); }).label);
      }
      content.append(checkboxControl("Local-relative conservation", state.showLocalRelativeConservation, (value) => { state.showLocalRelativeConservation = value; render(); }).label);
      const caveat = document.createElement("p");
      caveat.className = "sequence-logo-caveat";
      caveat.textContent = "Interpretation: this figure summarizes the supplied alignment. Alignment quality, homology assumptions, gaps, sampling, redundancy, phylogeny, and low-complexity sequence can all affect apparent conservation.";
      content.append(caveat);
    } else {
      const dataHeader = document.createElement("div");
      dataHeader.className = "sequence-logo-data-header";
      const summary = document.createElement("p");
      summary.textContent = `${rangeColumns(logo, state).length.toLocaleString()} displayed rows; the download contains all ${logo.columns.length.toLocaleString()} columns.`;
      const download = toolbarButton("Download all TSV", () => downloadText(logoTsv(logo), `${filename()}-columns.tsv`, "text/tab-separated-values;charset=utf-8"));
      dataHeader.append(summary, download);
      const caveat = document.createElement("p");
      caveat.className = "sequence-logo-caveat";
      caveat.textContent = "Interpretation: these values summarize the supplied alignment or position table. Alignment quality, homology assumptions, gaps, sampling, redundancy, phylogeny, and low-complexity sequence can all affect apparent conservation.";
      content.append(dataHeader, buildDataTable(logo, state), caveat);
    }
    panel.append(panelHeader, content);
  }

  workspace.append(toolbar, body);
  container.append(workspace);
  render();
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(queueRender) : null;
  resizeObserver?.observe(paper);
  container._sms3VisualCleanup = () => {
    cancelAnimationFrame(renderFrame);
    resizeObserver?.disconnect();
    container.classList.remove("sequence-logo-output");
  };
}
