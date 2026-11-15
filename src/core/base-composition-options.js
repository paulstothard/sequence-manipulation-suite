export const BASE_COMPOSITION_LIMITS = Object.freeze({ plotWindows: 5000, windowRows: 50_000, outputCharacters: 25 * 1024 * 1024 });

// Authoritative analysis/display defaults shared by controls and all callers.
export const BASE_COMPOSITION_DEFAULTS = Object.freeze({
  windowMode: "auto", windowSize: 100, stepSize: 25,
  metric: "gc_percent", positionAxis: "auto", showLegend: true,
  pointMarkers: "auto", yStartAtZero: false, xMin: "", xMax: "", yMin: "", yMax: "", outputFormat: "plot"
});

export const METRIC_LABELS = {
  gc_percent: "GC percent",
  at_percent: "AT percent",
  gc_skew: "GC skew",
  at_skew: "AT skew",
  ambiguous_percent: "Ambiguous percent"
};

function normalizePositiveInteger(value, fallback, max = 1000000) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

export function normalizeBaseCompositionOptions(options = {}) {
  options ??= {};
  const metric = Object.hasOwn(METRIC_LABELS, options.metric) ? options.metric : BASE_COMPOSITION_DEFAULTS.metric;
  const hasLegacyExplicitWindow = options.windowMode === undefined && (options.windowSize !== undefined || options.stepSize !== undefined);
  const windowMode = options.windowMode === "custom" || hasLegacyExplicitWindow ? "custom" : BASE_COMPOSITION_DEFAULTS.windowMode;
  const requestedOutputFormat = new Set(["report", "tsv", "plot", "svg-plot", "sms3-svg", "observable-svg"]).has(options.outputFormat)
    ? options.outputFormat
    : BASE_COMPOSITION_DEFAULTS.outputFormat;
  return {
    metric,
    yStartAtZero: typeof options.yStartAtZero === "boolean" ? options.yStartAtZero : BASE_COMPOSITION_DEFAULTS.yStartAtZero,
    ...Object.fromEntries(["xMin", "xMax", "yMin", "yMax"].map(id => [id, String(options[id] ?? BASE_COMPOSITION_DEFAULTS[id]).trim()])),
    windowMode,
    windowSize: normalizePositiveInteger(options.windowSize, BASE_COMPOSITION_DEFAULTS.windowSize),
    stepSize: normalizePositiveInteger(options.stepSize, BASE_COMPOSITION_DEFAULTS.stepSize),
    positionAxis: new Set(["auto", "absolute", "relative"]).has(options.positionAxis)
      ? options.positionAxis
      : BASE_COMPOSITION_DEFAULTS.positionAxis,
    showLegend: typeof options.showLegend === "boolean" ? options.showLegend : BASE_COMPOSITION_DEFAULTS.showLegend,
    pointMarkers: new Set(["auto", "show", "hide"]).has(options.pointMarkers)
      ? options.pointMarkers
      : BASE_COMPOSITION_DEFAULTS.pointMarkers,
    outputFormat: ["svg-plot", "sms3-svg", "observable-svg"].includes(requestedOutputFormat)
      ? "plot"
      : requestedOutputFormat
  };
}

