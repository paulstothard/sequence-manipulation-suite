export const PUBLICATION_PLOT_FONT_FAMILY = "Arial,Helvetica,sans-serif";
export const PUBLICATION_SEQUENCE_FONT_FAMILY = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";
export const DEFAULT_PUBLICATION_WIDTH_MM = 180;
export const PUBLICATION_WIDTH_CHOICES_MM = [90, 180];

const freeze = (value) => Object.freeze(value);

// Shared semantic roles for SVG plots. Renderers should consume these names
// instead of introducing local color arrays so the plot family can be retuned
// without hunting through individual tools.
export const SMS3_PLOT_THEME = freeze({
  surface: "#ffffff",
  surfaceMuted: "#f8fafc",
  text: "#172026",
  textMuted: "#475569",
  axis: "#374151",
  grid: "#d9e2e8",
  outline: "#111827",
  missing: "#f1f5f9",
  missingOutline: "#cbd5e1",
  categorical: freeze([
    "#0072B2",
    "#D55E00",
    "#009E73",
    "#CC79A7",
    "#56B4E9",
    "#E69F00",
    "#4B5563",
    "#6D28D9"
  ]),
  chromosome: freeze(["#0072B2", "#D55E00"]),
  direction: freeze({
    positive: "#D55E00",
    negative: "#0072B2",
    neutral: "#64748b"
  }),
  reference: "#4b5563",
  significance: "#A16207",
  significanceSecondary: "#6D28D9",
  selection: "#0072B2",
  highlight: "#009E73",
  band: "#99f6e4",
  venn: freeze(["#0072B2", "#E69F00", "#009E73"]),
  sequential: freeze({
    low: "#f2f6f6",
    high: "#0f766e"
  }),
  diverging: freeze({
    low: "#0072B2",
    middle: "#f8fafc",
    high: "#D55E00"
  }),
  heatmapScales: freeze({
    lightViridis: freeze(["#f1f5f9", "#bbdbe0", "#48bb8f", "#fde725"]),
    viridis: freeze(["#440154", "#31688e", "#35b779", "#fde725"]),
    blue: freeze(["#eff6ff", "#60a5fa", "#1d4ed8"]),
    redBlue: freeze(["#0072B2", "#f8fafc", "#D55E00"])
  }),
  alignment: freeze({
    exact: "#cdece2",
    similar: "#d7e9f3",
    mismatch: "#f5d9ca",
    gap: "#e5e7eb"
  }),
  featureMap: freeze({
    coding: freeze({ fill: "#0072B2", stroke: "#005A8A" }),
    gene: freeze({ fill: "#009E73", stroke: "#007A59" }),
    source: freeze({ fill: "#94a3b8", stroke: "#64748b" }),
    regulatory: freeze({ fill: "#E69F00", stroke: "#A16207" }),
    repeat: freeze({ fill: "#CC79A7", stroke: "#9D4B7C" }),
    variant: freeze({ fill: "#D55E00", stroke: "#A34100" }),
    other: freeze({ fill: "#56B4E9", stroke: "#0072B2" })
  }),
  genomeFigure: freeze({
    paper: "#ffffff",
    panel: "#f8fafc",
    rowPanel: "#f8fafc",
    ink: "#172026",
    muted: "#475569",
    axis: "#374151",
    grid: "#cbd5e1",
    connector: "#94a3b8",
    plotLine: "#0072B2",
    plotFill: "rgba(0, 114, 178, 0.16)",
    features: freeze({
      CDS: "#0072B2",
      gene: "#94a3b8",
      RNA: "#6D28D9",
      tRNA: "#6D28D9",
      rRNA: "#CC79A7",
      ncRNA: "#56B4E9",
      tmRNA: "#7C3AED",
      repeat: "#E69F00",
      mobile: "#D55E00",
      variant: "#B91C1C",
      misc: "#009E73",
      custom: "#172026"
    })
  }),
  genomeComparison: freeze({
    darkBackground: "#0b0b0f",
    darkNoHit: "#0b0b0f",
    darkText: "#f8fafc",
    darkMutedText: "#cbd5e1",
    darkAxis: "#F0E442",
    darkAxisSecondary: "#6b7280",
    lightBackground: "#ffffff",
    lightText: "#172026",
    lightMutedText: "#475569",
    lightAxis: "#374151",
    lightAxisSecondary: "#94a3b8"
  })
});

const MILLIMETRES_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;

export function normalizePublicationWidthMm(value, fallback = DEFAULT_PUBLICATION_WIDTH_MM) {
  const numeric = Number(value);
  return PUBLICATION_WIDTH_CHOICES_MM.includes(numeric) ? numeric : fallback;
}

export function svgUnitsForPoints(points, viewBoxWidth, publicationWidthMm = DEFAULT_PUBLICATION_WIDTH_MM) {
  const width = Math.max(1, Number(viewBoxWidth) || 1);
  const physicalWidth = normalizePublicationWidthMm(publicationWidthMm);
  return Number((Number(points) * width * MILLIMETRES_PER_INCH / (physicalWidth * POINTS_PER_INCH)).toFixed(3));
}

export function effectivePointSize(svgUnits, viewBoxWidth, publicationWidthMm = DEFAULT_PUBLICATION_WIDTH_MM) {
  const width = Math.max(1, Number(viewBoxWidth) || 1);
  const physicalWidth = normalizePublicationWidthMm(publicationWidthMm);
  return Number((Number(svgUnits) * physicalWidth * POINTS_PER_INCH / (width * MILLIMETRES_PER_INCH)).toFixed(3));
}

export function makePublicationPlotStyle(viewBoxWidth, viewBoxHeight, options = {}) {
  const widthMm = normalizePublicationWidthMm(options.publicationWidthMm ?? options.publicationWidth);
  const heightMm = Number((widthMm * Number(viewBoxHeight) / Math.max(1, Number(viewBoxWidth))).toFixed(3));
  return {
    widthMm,
    heightMm,
    fontFamily: PUBLICATION_PLOT_FONT_FAMILY,
    sequenceFontFamily: PUBLICATION_SEQUENCE_FONT_FAMILY,
    titleFontSize: svgUnitsForPoints(6.8, viewBoxWidth, widthMm),
    axisLabelFontSize: svgUnitsForPoints(6.8, viewBoxWidth, widthMm),
    bodyFontSize: svgUnitsForPoints(6.2, viewBoxWidth, widthMm),
    smallFontSize: svgUnitsForPoints(5.2, viewBoxWidth, widthMm),
    axisStrokeWidth: svgUnitsForPoints(0.68, viewBoxWidth, widthMm),
    dataStrokeWidth: svgUnitsForPoints(0.92, viewBoxWidth, widthMm),
    tickLength: Math.max(4, Number((viewBoxWidth / widthMm).toFixed(3))),
    showGridLines: options.showGridLines === true,
    showTitle: options.showTitle !== false
  };
}

export function publicationSvgAttributes(style) {
  return `width="${style.widthMm}mm" height="${style.heightMm}mm" data-publication-width-mm="${style.widthMm}" data-publication-font-range-pt="5-7"`;
}

export function publicationSvgAttributeMap(style) {
  return {
    width: `${style.widthMm}mm`,
    height: `${style.heightMm}mm`,
    "data-publication-width-mm": style.widthMm,
    "data-publication-font-range-pt": "5-7"
  };
}

export function publicationPlotCss(style, options = {}) {
  const scope = String(options.scope ?? "").trim();
  const selector = (value) => scope ? `${scope} ${value}` : value;
  const titleWeight = Number.isFinite(Number(options.titleWeight)) ? Number(options.titleWeight) : 600;
  return [
    `${selector("text")}{font-family:${style.fontFamily};font-weight:400;fill:${SMS3_PLOT_THEME.text};stroke:none;stroke-width:0;text-shadow:none;paint-order:normal}`,
    `${selector(".title")}{font-size:${style.titleFontSize}px;font-weight:${titleWeight}}`,
    `${selector(".subtitle")},${selector(".note")}{font-size:${style.smallFontSize}px;fill:${SMS3_PLOT_THEME.textMuted}}`,
    `${selector(".axis")},${selector(".axis-rule")},${selector(".axis-tick")}{stroke:${SMS3_PLOT_THEME.axis};stroke-width:${style.axisStrokeWidth}}`,
    `${selector(".grid")}{stroke:${SMS3_PLOT_THEME.grid};stroke-width:${style.axisStrokeWidth}}`,
    `${selector(".tick")},${selector(".tick-label")}{font-size:${style.bodyFontSize}px;fill:${SMS3_PLOT_THEME.axis}}`,
    `${selector(".label")},${selector(".axis-label")}{font-size:${style.axisLabelFontSize}px;fill:${SMS3_PLOT_THEME.text}}`,
    `${selector(".legend")}{font-size:${style.bodyFontSize}px;fill:${SMS3_PLOT_THEME.axis}}`
  ].join("");
}

const ACRONYMS = new Map([
  ["bp", "bp"],
  ["dna", "DNA"],
  ["fpkm", "FPKM"],
  ["id", "ID"],
  ["od", "OD"],
  ["pca", "PCA"],
  ["rna", "RNA"],
  ["rin", "RIN"],
  ["rpkm", "RPKM"],
  ["rpm", "RPM"],
  ["tpm", "TPM"]
]);

const UNIT_SUFFIXES = [
  { pattern: /(?:_|\s)ng(?:_|\/)u[lL]$/u, unit: "ng/µl" },
  { pattern: /(?:_|\s)u[mM]$/u, unit: "µM" },
  { pattern: /(?:_|\s)n[mM]$/u, unit: "nM" },
  { pattern: /(?:_|\s)hr$/iu, unit: "h" },
  { pattern: /(?:_|\s)hours?$/iu, unit: "h" },
  { pattern: /(?:_|\s)minutes?$/iu, unit: "min" },
  { pattern: /(?:_|\s)seconds?$/iu, unit: "s" },
  { pattern: /(?:_|\s)kb$/iu, unit: "kb" },
  { pattern: /(?:_|\s)mb$/iu, unit: "Mb" },
  { pattern: /(?:_|\s)bp$/iu, unit: "bp" }
];

function titleCaseToken(token, index) {
  const normalized = token.toLowerCase();
  if (ACRONYMS.has(normalized)) return ACRONYMS.get(normalized);
  if (/^pc\d+$/iu.test(token)) return token.toUpperCase();
  if (/^log\d+$/iu.test(token)) return token.toLowerCase();
  return index === 0 ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : normalized;
}

export function humanizePlotLabel(value) {
  const original = String(value ?? "").trim();
  if (!original) return "";
  if (/^od[_\s-]?260[_\s\/-]?280$/iu.test(original)) return "OD260/280";
  if (/[\s()−]/u.test(original)) return original;
  const words = original
    .replace(/[_.-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .split(" ");
  return words.map(titleCaseToken).join(" ");
}

export function makePlotAxisLabel(sourceLabel, explicitLabel = "", explicitUnit = "") {
  const requestedLabel = String(explicitLabel ?? "").trim();
  const requestedUnit = String(explicitUnit ?? "").trim();
  let source = String(sourceLabel ?? "").trim();
  let inferredUnit = "";
  if (!requestedLabel) {
    for (const candidate of UNIT_SUFFIXES) {
      if (!candidate.pattern.test(source)) continue;
      source = source.replace(candidate.pattern, "");
      inferredUnit = candidate.unit;
      break;
    }
  }
  const label = requestedLabel || humanizePlotLabel(source);
  const unit = requestedUnit || inferredUnit;
  return unit && label && !/\([^()]+\)\s*$/u.test(label) ? `${label} (${unit})` : label;
}
