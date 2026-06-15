import { parseSequenceInput } from "../../core/fasta.js";
import {
  makeLinePlotSpec,
  makeObservablePlotConfig,
  makePlaceholderSvg,
  renderLinePlotSvg
} from "../../core/plot-renderer.js";
import { cleanDnaRnaSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { baseCompositionPlotTableColumns } from "./metadata.js";

const TSV_COLUMNS = baseCompositionPlotTableColumns.map((column) => column.id);
const SVG_PLOT_WINDOW_THRESHOLD = 5000;
const SVG_PLOT_RECORD_WARNING_THRESHOLD = 8;
const SVG_PLOT_LENGTH_RATIO_WARNING_THRESHOLD = 20;
const RELATIVE_AXIS_LENGTH_RATIO_THRESHOLD = 20;
const AUTO_POINT_MARKER_THRESHOLD = 300;
const AUTO_WINDOW_TARGET_TOTAL_ROWS = 1200;
const AUTO_WINDOW_MAX_ROWS_PER_RECORD = 80;
const AUTO_WINDOW_MIN_ROWS_PER_RECORD = 20;
const METRIC_LABELS = {
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

function roundToNiceInteger(value) {
  const positive = Math.max(1, Number(value) || 1);
  const magnitude = 10 ** Math.floor(Math.log10(positive));
  const candidates = [1, 2, 5, 10].map((scale) => scale * magnitude);
  const closest = candidates.reduce((best, candidate) =>
    Math.abs(candidate - positive) < Math.abs(best - positive) ? candidate : best
  );
  return Math.max(1, Math.round(closest));
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function estimateWindowRowCount(lengths, windowSize, stepSize) {
  return lengths.reduce((total, length) => {
    if (length <= 0) {
      return total;
    }
    const effectiveWindow = Math.min(windowSize, length);
    return total + Math.floor((length - effectiveWindow) / stepSize) + 1;
  }, 0);
}

function chooseAutoWindowSettings(lengths) {
  const positiveLengths = lengths.filter((length) => length > 0);
  if (positiveLengths.length === 0) {
    return { windowSize: 100, stepSize: 25 };
  }

  const referenceLength = median(positiveLengths);
  const targetRowsPerRecord = Math.max(
    AUTO_WINDOW_MIN_ROWS_PER_RECORD,
    Math.min(AUTO_WINDOW_MAX_ROWS_PER_RECORD, Math.floor(AUTO_WINDOW_TARGET_TOTAL_ROWS / positiveLengths.length))
  );
  const windowSize = Math.min(
    Math.max(...positiveLengths),
    1000000,
    roundToNiceInteger(Math.max(10, referenceLength / 20))
  );
  let stepSize = Math.max(
    1,
    Math.min(windowSize, 1000000, roundToNiceInteger(Math.max(1, referenceLength / targetRowsPerRecord)))
  );

  while (
    estimateWindowRowCount(positiveLengths, windowSize, stepSize) > SVG_PLOT_WINDOW_THRESHOLD * 0.75 &&
    stepSize < Math.max(...positiveLengths)
  ) {
    const nextStepSize = Math.min(1000000, roundToNiceInteger(stepSize * 2));
    if (nextStepSize <= stepSize) {
      break;
    }
    stepSize = nextStepSize;
  }

  return { windowSize, stepSize };
}

function formatNumber(value, digits = 3) {
  return value === null || value === undefined ? "n/a" : Number(value).toFixed(digits);
}

function countWindow(sequence) {
  const counts = { A: 0, C: 0, G: 0, TU: 0, ambiguous: 0 };
  for (const character of sequence) {
    if (character === "A") {
      counts.A += 1;
    } else if (character === "C") {
      counts.C += 1;
    } else if (character === "G") {
      counts.G += 1;
    } else if (character === "T" || character === "U") {
      counts.TU += 1;
    } else {
      counts.ambiguous += 1;
    }
  }
  return counts;
}

function divideOrNull(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function makeWindowRows(title, sequence, options) {
  if (!sequence) {
    return [];
  }

  const rows = [];
  const effectiveWindow = Math.min(options.windowSize, sequence.length);
  for (let start = 0; start <= sequence.length - effectiveWindow; start += options.stepSize) {
    const end = start + effectiveWindow;
    const windowSequence = sequence.slice(start, end);
    const counts = countWindow(windowSequence);
    const unambiguous = counts.A + counts.C + counts.G + counts.TU;
    const gcPercent = divideOrNull((counts.G + counts.C) * 100, unambiguous);
    const atPercent = divideOrNull((counts.A + counts.TU) * 100, unambiguous);
    const gcSkew = divideOrNull(counts.G - counts.C, counts.G + counts.C);
    const atSkew = divideOrNull(counts.A - counts.TU, counts.A + counts.TU);
    const ambiguousPercent = (counts.ambiguous / windowSequence.length) * 100;
    const values = {
      gc_percent: gcPercent,
      at_percent: atPercent,
      gc_skew: gcSkew,
      at_skew: atSkew,
      ambiguous_percent: ambiguousPercent
    };

    rows.push({
      record: title,
      window_start: start + 1,
      window_end: end,
      position: (start + 1 + end) / 2,
      window_size: windowSequence.length,
      a_count: counts.A,
      c_count: counts.C,
      g_count: counts.G,
      t_u_count: counts.TU,
      ambiguous_count: counts.ambiguous,
      gc_percent: gcPercent,
      at_percent: atPercent,
      gc_skew: gcSkew,
      at_skew: atSkew,
      ambiguous_percent: ambiguousPercent,
      metric_value: values[options.metric]
    });

    if (end === sequence.length) {
      break;
    }
  }

  return rows;
}

async function makeWindowRowsWithContext(title, sequence, options, context = {}) {
  if (!sequence) {
    return [];
  }

  const rows = [];
  const effectiveWindow = Math.min(options.windowSize, sequence.length);
  for (let start = 0; start <= sequence.length - effectiveWindow; start += options.stepSize) {
    if (rows.length > 0 && rows.length % 100 === 0) {
      await context.yieldIfNeeded?.();
    } else {
      context.throwIfCancelled?.();
    }
    const end = start + effectiveWindow;
    const windowSequence = sequence.slice(start, end);
    const counts = countWindow(windowSequence);
    const unambiguous = counts.A + counts.C + counts.G + counts.TU;
    const gcPercent = divideOrNull((counts.G + counts.C) * 100, unambiguous);
    const atPercent = divideOrNull((counts.A + counts.TU) * 100, unambiguous);
    const gcSkew = divideOrNull(counts.G - counts.C, counts.G + counts.C);
    const atSkew = divideOrNull(counts.A - counts.TU, counts.A + counts.TU);
    const ambiguousPercent = (counts.ambiguous / windowSequence.length) * 100;
    const values = {
      gc_percent: gcPercent,
      at_percent: atPercent,
      gc_skew: gcSkew,
      at_skew: atSkew,
      ambiguous_percent: ambiguousPercent
    };

    rows.push({
      record: title,
      window_start: start + 1,
      window_end: end,
      position: (start + 1 + end) / 2,
      window_size: windowSequence.length,
      a_count: counts.A,
      c_count: counts.C,
      g_count: counts.G,
      t_u_count: counts.TU,
      ambiguous_count: counts.ambiguous,
      gc_percent: gcPercent,
      at_percent: atPercent,
      gc_skew: gcSkew,
      at_skew: atSkew,
      ambiguous_percent: ambiguousPercent,
      metric_value: values[options.metric]
    });

    if (end === sequence.length) {
      break;
    }
  }

  return rows;
}

function makeTsv(rows) {
  return [
    TSV_COLUMNS.join("\t"),
    ...rows.map((row) =>
      TSV_COLUMNS.map((column) =>
        typeof row[column] === "number" ? formatNumber(row[column]) : row[column]
      ).join("\t")
    )
  ].join("\n");
}

function summarizeRows(rows) {
  const scoredRows = rows.filter((row) => row.metric_value !== null);
  if (scoredRows.length === 0) {
    return { min: null, max: null };
  }
  return {
    min: scoredRows.reduce((best, row) => (row.metric_value < best.metric_value ? row : best), scoredRows[0]),
    max: scoredRows.reduce((best, row) => (row.metric_value > best.metric_value ? row : best), scoredRows[0])
  };
}

function makeReport(records, metric, windowSettings) {
  const lines = [];
  for (const record of records) {
    const summary = summarizeRows(record.rows);
    lines.push(`${record.title} base composition plot`);
    lines.push(`Length: ${record.cleanedLength}`);
    lines.push(`Windows: ${record.rows.length}`);
    lines.push(`Window settings: ${windowSettings.windowMode === "auto" ? "auto" : "custom"}`);
    lines.push(`Window size: ${windowSettings.windowSize}`);
    lines.push(`Step size: ${windowSettings.stepSize}`);
    lines.push(`Metric: ${METRIC_LABELS[metric]}`);
    if (summary.min && summary.max) {
      lines.push(`Minimum: ${formatNumber(summary.min.metric_value)} at ${summary.min.window_start}-${summary.min.window_end}`);
      lines.push(`Maximum: ${formatNumber(summary.max.metric_value)} at ${summary.max.window_start}-${summary.max.window_end}`);
    } else {
      lines.push("Minimum: n/a");
      lines.push("Maximum: n/a");
    }
    lines.push("Method: sliding windows over cleaned DNA/RNA IUPAC sequence.");
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function getLengthRatio(records) {
  const lengths = records.map((record) => record.cleanedLength).filter((length) => length > 0);
  const minLength = Math.min(...lengths);
  const maxLength = Math.max(...lengths);
  if (!Number.isFinite(minLength) || !Number.isFinite(maxLength) || minLength <= 0) {
    return { minLength: 0, maxLength: 0, ratio: 1 };
  }
  return { minLength, maxLength, ratio: maxLength / minLength };
}

function getPositionAxisMode(records, requestedMode) {
  if (requestedMode === "relative" || requestedMode === "absolute") {
    return requestedMode;
  }
  return getLengthRatio(records).ratio >= RELATIVE_AXIS_LENGTH_RATIO_THRESHOLD ? "relative" : "absolute";
}

function makeCompositionPlotSpec(records, metric, options) {
  const title = `${METRIC_LABELS[metric]} base composition plot`;
  const yDomain = metric.endsWith("_skew") ? [-1, 1] : [0, 100];
  const positionAxisUsed = getPositionAxisMode(records, options.positionAxis);
  const series = records
    .filter((record) => record.rows.some((row) => row.metric_value !== null))
    .map((record) => ({
      id: record.title,
      label: record.title,
      points: record.rows
        .filter((row) => row.metric_value !== null)
        .map((row) => ({
          x: positionAxisUsed === "relative" && record.cleanedLength > 0
            ? (row.position / record.cleanedLength) * 100
            : row.position,
          y: row.metric_value,
          title: `${record.title} ${row.window_start}-${row.window_end}: ${formatNumber(row.metric_value)}`
        }))
    }));
  const spec = makeLinePlotSpec({
    title,
    xLabel: positionAxisUsed === "relative" ? "Relative position (% of sequence)" : "Position (window midpoint)",
    yLabel: METRIC_LABELS[metric],
    yDomain,
    series,
    showLegend: options.showLegend,
    pointMarkers: options.pointMarkers,
    pointMarkerThreshold: AUTO_POINT_MARKER_THRESHOLD,
    notes: [
      `Window size: ${options.windowSize} bases; step size: ${options.stepSize} bases.`,
      positionAxisUsed === "relative"
        ? "Plot x-axis uses each window midpoint as a percent of that record length."
        : "Plot x-axis uses sequence positions from each record."
    ]
  });
  return { ...spec, xAxisMode: positionAxisUsed };
}

function getSvgPlotWarnings(analyzedRecords, tableRows, requestedPositionAxis, positionAxisUsed, pointMarkers) {
  const warnings = [];
  const plotRecords = analyzedRecords.filter((record) => record.rows.some((row) => row.metric_value !== null));
  const { minLength, maxLength, ratio } = getLengthRatio(plotRecords);
  if (plotRecords.length > SVG_PLOT_RECORD_WARNING_THRESHOLD) {
    warnings.push(
      `Base composition plot contains ${plotRecords.length} records. The legend may be crowded; consider TSV output or plotting fewer records.`
    );
  }
  if (positionAxisUsed === "relative" && requestedPositionAxis === "auto" && ratio >= RELATIVE_AXIS_LENGTH_RATIO_THRESHOLD) {
    warnings.push(
      `Base composition plot used a relative position axis because record lengths range from ${minLength} to ${maxLength} bases. Table output keeps absolute coordinates.`
    );
  } else if (positionAxisUsed === "absolute" && ratio >= SVG_PLOT_LENGTH_RATIO_WARNING_THRESHOLD) {
    warnings.push(
      `Base composition plot uses one position axis for records ranging from ${minLength} to ${maxLength} bases; shorter records may be visually compressed.`
    );
  }
  if (tableRows.length > SVG_PLOT_WINDOW_THRESHOLD * 0.75) {
    warnings.push(
      `Base composition plot has ${tableRows.length} windows and may be visually dense; use TSV output or larger step/window settings for detailed review.`
    );
  }
  if (pointMarkers === "auto" && tableRows.length > AUTO_POINT_MARKER_THRESHOLD) {
    warnings.push(
      `Point markers are hidden automatically for dense plots with more than ${AUTO_POINT_MARKER_THRESHOLD} windows; lines still show the plotted metric.`
    );
  }
  return warnings;
}

function normalizeBaseCompositionOptions(options = {}) {
  const metric = Object.hasOwn(METRIC_LABELS, options.metric) ? options.metric : "gc_percent";
  const hasLegacyExplicitWindow = options.windowMode === undefined && (options.windowSize !== undefined || options.stepSize !== undefined);
  const windowMode = options.windowMode === "custom" || hasLegacyExplicitWindow ? "custom" : "auto";
  const requestedOutputFormat = new Set(["report", "tsv", "plot", "svg-plot", "sms3-svg", "observable-svg"]).has(options.outputFormat)
    ? options.outputFormat
    : "plot";
  return {
    metric,
    windowMode,
    windowSize: normalizePositiveInteger(options.windowSize, 100),
    stepSize: normalizePositiveInteger(options.stepSize, 25),
    positionAxis: new Set(["auto", "absolute", "relative"]).has(options.positionAxis)
      ? options.positionAxis
      : "auto",
    showLegend: options.showLegend !== false,
    pointMarkers: new Set(["auto", "show", "hide"]).has(options.pointMarkers)
      ? options.pointMarkers
      : "auto",
    outputFormat: ["svg-plot", "sms3-svg", "observable-svg"].includes(requestedOutputFormat)
      ? "plot"
      : requestedOutputFormat
  };
}

function resolveWindowSettings(normalizedOptions, lengths) {
  if (normalizedOptions.windowMode === "custom") {
    return {
      windowMode: "custom",
      windowSize: normalizedOptions.windowSize,
      stepSize: normalizedOptions.stepSize
    };
  }
  return {
    windowMode: "auto",
    ...chooseAutoWindowSettings(lengths)
  };
}

function makeBaseCompositionResult({
  analyzedRecords,
  warnings,
  recordsProcessed,
  basesProcessed,
  charactersRemoved,
  metric,
  windowMode,
  windowSize,
  stepSize,
  positionAxis,
  showLegend,
  pointMarkers,
  outputFormat
}) {
  const tableRows = analyzedRecords.flatMap((record) => record.rows);
  const windowSettings = { windowMode, windowSize, stepSize };
  const reportOutput = makeReport(analyzedRecords, metric, windowSettings);
  const isSvgOutput = outputFormat === "plot";
  const svgRenderer = "observable-plot";
  let svgPlot = "";
  let plotSpec = null;
  if (isSvgOutput && tableRows.length <= SVG_PLOT_WINDOW_THRESHOLD) {
    plotSpec = makeCompositionPlotSpec(analyzedRecords, metric, {
      windowSize,
      stepSize,
      positionAxis,
      showLegend,
      pointMarkers
    });
    warnings.push(...getSvgPlotWarnings(analyzedRecords, tableRows, positionAxis, plotSpec.xAxisMode, pointMarkers));
    svgPlot = renderLinePlotSvg(plotSpec);
  } else if (isSvgOutput) {
    warnings.push(
      `Base composition plot was not drawn because this run has ${tableRows.length} windows. Use table output or larger window/step settings for dense analyses.`
    );
    svgPlot = makePlaceholderSvg("Base composition plot not drawn", [
      `${tableRows.length} windows across ${recordsProcessed} records.`,
      "The graphical plot is suppressed for dense outputs to keep the browser responsive.",
      "Use the table output or increase the step size for a drawable plot."
    ]);
  }
  const output = outputFormat === "report" ? reportOutput : outputFormat === "tsv" ? makeTsv(tableRows) : svgPlot;

  return makeToolResult({
    output,
    download: {
      filename: `base-composition-plot.${outputFormat === "tsv" ? "tsv" : isSvgOutput ? "svg" : "txt"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values"
          : isSvgOutput
            ? "image/svg+xml;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed,
    basesProcessed,
    charactersRemoved,
    optionsUsed: {
      outputFormat,
      windowMode,
      windowSize,
      stepSize
    },
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      table: makeTableStream(baseCompositionPlotTableColumns, tableRows, "base-composition-plot"),
      ...(isSvgOutput ? { plot: makeTextStream(svgPlot, "image/svg+xml") } : {})
    },
    visual: isSvgOutput
      ? {
          svg: svgPlot,
          renderer: svgRenderer,
          plotSpec,
          observablePlotConfig: plotSpec ? makeObservablePlotConfig(plotSpec) : undefined,
          pngDownload: true
        }
      : undefined
  });
}

export function runBaseCompositionPlot(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const normalizedOptions = normalizeBaseCompositionOptions(options);

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const cleanedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    charactersRemoved += cleaned.removedCount;
    basesProcessed += cleaned.sequence.length;
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }
    cleanedRecords.push({ title: record.title, sequence: cleaned.sequence });
  }

  const windowSettings = resolveWindowSettings(
    normalizedOptions,
    cleanedRecords.map((record) => record.sequence.length)
  );
  const analyzedRecords = [];

  for (const record of cleanedRecords) {
    if (record.sequence.length > 0 && record.sequence.length < windowSettings.windowSize) {
      warnings.push(`${record.title}: sequence shorter than window size; used a ${record.sequence.length}-base window.`);
    }
    const rows = makeWindowRows(record.title, record.sequence, { ...normalizedOptions, ...windowSettings });
    analyzedRecords.push({
      title: record.title,
      cleanedLength: record.sequence.length,
      rows
    });
  }

  return makeBaseCompositionResult({
    analyzedRecords,
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    metric: normalizedOptions.metric,
    windowMode: windowSettings.windowMode,
    windowSize: windowSettings.windowSize,
    stepSize: windowSettings.stepSize,
    positionAxis: normalizedOptions.positionAxis,
    showLegend: normalizedOptions.showLegend,
    pointMarkers: normalizedOptions.pointMarkers,
    outputFormat: normalizedOptions.outputFormat
  });
}

export async function runBaseCompositionPlotWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const normalizedOptions = normalizeBaseCompositionOptions(options);

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const cleanedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const [index, record] of records.entries()) {
    await context.yieldIfNeeded?.();
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    charactersRemoved += cleaned.removedCount;
    basesProcessed += cleaned.sequence.length;
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }
    cleanedRecords.push({ title: record.title, sequence: cleaned.sequence });
    context.reportProgress?.({
      phase: "cleaning-records",
      progress: 0.05 + ((index + 1) / records.length) * 0.2,
      recordsProcessed: index + 1,
      totalRecords: records.length
    });
  }

  const windowSettings = resolveWindowSettings(
    normalizedOptions,
    cleanedRecords.map((record) => record.sequence.length)
  );
  const analyzedRecords = [];

  for (const [index, record] of cleanedRecords.entries()) {
    await context.yieldIfNeeded?.();
    if (record.sequence.length > 0 && record.sequence.length < windowSettings.windowSize) {
      warnings.push(`${record.title}: sequence shorter than window size; used a ${record.sequence.length}-base window.`);
    }
    const rows = await makeWindowRowsWithContext(record.title, record.sequence, { ...normalizedOptions, ...windowSettings }, context);
    analyzedRecords.push({
      title: record.title,
      cleanedLength: record.sequence.length,
      rows
    });
    context.reportProgress?.({
      phase: "building-windows",
      progress: 0.25 + ((index + 1) / cleanedRecords.length) * 0.65,
      recordsProcessed: index + 1,
      totalRecords: cleanedRecords.length
    });
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  context.throwIfCancelled?.();
  return makeBaseCompositionResult({
    analyzedRecords,
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    metric: normalizedOptions.metric,
    windowMode: windowSettings.windowMode,
    windowSize: windowSettings.windowSize,
    stepSize: windowSettings.stepSize,
    positionAxis: normalizedOptions.positionAxis,
    showLegend: normalizedOptions.showLegend,
    pointMarkers: normalizedOptions.pointMarkers,
    outputFormat: normalizedOptions.outputFormat
  });
}
