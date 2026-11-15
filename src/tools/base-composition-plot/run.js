import { applyAxisLimits, plotNumericExtent } from "../../core/plot-tools.js";
import { exportDelimitedTable } from "../../core/table.js";
import { BASE_COMPOSITION_DEFAULTS, BASE_COMPOSITION_LIMITS, METRIC_LABELS, normalizeBaseCompositionOptions } from "../../core/base-composition-options.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import {
  makeLinePlotSpec,
  makeObservablePlotConfig,
  makePlaceholderSvg,
  renderLinePlotSvg
} from "../../core/plot-renderer.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { baseCompositionPlotTableColumns } from "./metadata.js";

const TSV_COLUMNS = baseCompositionPlotTableColumns.map((column) => ({ ...column, label: column.id }));
const SVG_PLOT_WINDOW_THRESHOLD = BASE_COMPOSITION_LIMITS.plotWindows;
const SVG_PLOT_RECORD_WARNING_THRESHOLD = 8;
const SVG_PLOT_LENGTH_RATIO_WARNING_THRESHOLD = 20;
const RELATIVE_AXIS_LENGTH_RATIO_THRESHOLD = 20;
const AUTO_POINT_MARKER_THRESHOLD = 300;
const AUTO_WINDOW_TARGET_TOTAL_ROWS = 1200;
const AUTO_WINDOW_MAX_ROWS_PER_RECORD = 80;
const AUTO_WINDOW_MIN_ROWS_PER_RECORD = 20;
const MAX_WINDOW_ROWS = BASE_COMPOSITION_LIMITS.windowRows;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = BASE_COMPOSITION_LIMITS.outputCharacters;


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
    return { windowSize: BASE_COMPOSITION_DEFAULTS.windowSize, stepSize: BASE_COMPOSITION_DEFAULTS.stepSize };
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

function divideOrNull(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function makeWindowRow(title, recordIndex, start, end, counts, metric) {
  const unambiguous = counts.A + counts.C + counts.G + counts.TU;
  const gcPercent = divideOrNull((counts.G + counts.C) * 100, unambiguous);
  const atPercent = divideOrNull((counts.A + counts.TU) * 100, unambiguous);
  const gcSkew = divideOrNull(counts.G - counts.C, counts.G + counts.C);
  const atSkew = divideOrNull(counts.A - counts.TU, counts.A + counts.TU);
  const ambiguousPercent = (counts.ambiguous / (end - start)) * 100;
  return {
    record: title,
    record_index: recordIndex,
    window_start: start + 1,
    window_end: end,
    position: (start + 1 + end) / 2,
    window_size: end - start,
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
    metric_value: {
      gc_percent: gcPercent,
      at_percent: atPercent,
      gc_skew: gcSkew,
      at_skew: atSkew,
      ambiguous_percent: ambiguousPercent
    }[metric]
  };
}

const BASE_CATEGORY = Object.freeze({ A: 0, C: 1, G: 2, T: 3, U: 3 });
const CATEGORY_FIELD = ["A", "C", "G", "TU", "ambiguous"];

function makeStreamingWindowState(title, recordIndex, length, windowSettings, metric, retainRows) {
  const windowSize = Math.min(windowSettings.windowSize, length);
  return {
    title,
    recordIndex,
    length,
    windowSize,
    stepSize: windowSettings.stepSize,
    metric,
    position: 0,
    ring: new Uint8Array(windowSize),
    counts: { A: 0, C: 0, G: 0, TU: 0, ambiguous: 0 },
    retainRows,
    windowCount: 0,
    undefinedWindows: 0,
    summary: { min: null, max: null },
    rows: []
  };
}

async function consumeStreamingWindowChunk(state, text, context) {
  const { windowSize, counts, ring } = state;
  if (!windowSize) return;
  for (const character of text) {
    const position = state.position;
    const slot = position % windowSize;
    if (position >= windowSize) counts[CATEGORY_FIELD[ring[slot]]] -= 1;
    const category = BASE_CATEGORY[character] ?? 4;
    ring[slot] = category;
    counts[CATEGORY_FIELD[category]] += 1;
    state.position += 1;
    if (state.position >= windowSize && (state.position - windowSize) % state.stepSize === 0) {
      const row = makeWindowRow(state.title, state.recordIndex, state.position - windowSize, state.position, counts, state.metric);
      state.windowCount += 1;
      if (state.retainRows) state.rows.push(row);
      if (row.metric_value === null) state.undefinedWindows += 1;
      if (row.metric_value !== null) {
        if (!state.summary.min || row.metric_value < state.summary.min.metric_value) state.summary.min = row;
        if (!state.summary.max || row.metric_value > state.summary.max.metric_value) state.summary.max = row;
      }
    }
    if ((state.position & 0xffff) === 0) await context.yieldIfNeeded?.();
  }
}

function makeTsv(rows) {
  return exportDelimitedTable(TSV_COLUMNS, rows, "\t");
}

function makeReport(records, metric, windowSettings) {
  const lines = [];
  for (const record of records) {
    const summary = record.summary;
    lines.push(`${record.title} base composition plot`);
    lines.push(`Record: ${record.recordIndex}`);
    lines.push(`Length: ${record.cleanedLength}`);
    lines.push(`Windows: ${record.windowCount}`);
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

function makeCompositionPlotSpec(records, metric, options, warnings) {
  const title = `${METRIC_LABELS[metric]} base composition plot`;
  const positionAxisUsed = getPositionAxisMode(records, options.positionAxis);
  const duplicateTitles = new Set(records.map(record => record.title)).size !== records.length;
  const series = records
    .filter((record) => record.rows.some((row) => row.metric_value !== null))
    .map((record) => ({
      id: `record-${record.recordIndex}`,
      label: duplicateTitles ? `Record ${record.recordIndex}: ${record.title}` : record.title,
      points: record.rows
        .map((row) => ({
          x: positionAxisUsed === "relative" && record.cleanedLength > 0
            ? (row.position / record.cleanedLength) * 100
            : row.position,
          y: row.metric_value,
          title: `${record.title} ${row.window_start}-${row.window_end}: ${formatNumber(row.metric_value)}`
        }))
    }));
  const points = series.flatMap(record => record.points);
  const spec = makeLinePlotSpec({
    title,
    xLabel: positionAxisUsed === "relative" ? "Relative position (% of sequence)" : "Position (window midpoint)",
    yLabel: METRIC_LABELS[metric],
    xDomain: applyAxisLimits(plotNumericExtent(points.map(point => point.x)), { ...options, warnings }, "x"),
    yDomain: applyAxisLimits(plotNumericExtent(points.map(point => point.y)), { ...options, warnings }, "y"),
    clip: true,
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

function getSvgPlotWarnings(analyzedRecords, tableRows, requestedPositionAxis, positionAxisUsed, pointMarkers, notes) {
  const warnings = [];
  const plotRecords = analyzedRecords.filter((record) => record.rows.some((row) => row.metric_value !== null));
  const { minLength, maxLength, ratio } = getLengthRatio(plotRecords);
  if (plotRecords.length > SVG_PLOT_RECORD_WARNING_THRESHOLD) {
    warnings.push(
      `Base composition plot contains ${plotRecords.length} records. The legend may be crowded; consider TSV output or plotting fewer records.`
    );
  }
  if (positionAxisUsed === "relative" && requestedPositionAxis === "auto" && ratio >= RELATIVE_AXIS_LENGTH_RATIO_THRESHOLD) {
    notes.push(
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
    notes.push(
      `Point markers are hidden automatically for dense plots with more than ${AUTO_POINT_MARKER_THRESHOLD} windows; lines still show the plotted metric.`
    );
  }
  return warnings;
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
  pointMarkers,
  outputFormat,
  normalizedOptions,
  limitOptions = {}
}) {
  const maxOutputCharacters = effectiveToolLimit(limitOptions, "compositionOutput", MAX_MATERIALIZED_OUTPUT_CHARACTERS);
  const windowCount = analyzedRecords.reduce((sum, record) => sum + record.windowCount, 0);
  const tableRows = analyzedRecords.flatMap((record) => record.rows);
  const notes = [];
  const undefinedWindows = analyzedRecords.reduce((sum, record) => sum + record.undefinedWindows, 0);
  if (undefinedWindows > 0) notes.push(`${undefinedWindows} window(s) have undefined ${METRIC_LABELS[metric]} because the denominator is zero. These values are blank in tables and break plotted lines.`);
  const windowSettings = { windowMode, windowSize, stepSize };
  const reportOutput = outputFormat === "report" ? makeReport(analyzedRecords, metric, windowSettings) : "";
  if (reportOutput.length > maxOutputCharacters) {
    throw new Error(`Base composition report exceeds the ${maxOutputCharacters.toLocaleString()}-character materialized-output limit.`);
  }
  const isSvgOutput = outputFormat === "plot";
  const svgRenderer = "observable-plot";
  let svgPlot = "";
  let plotSpec = null;
  if (isSvgOutput && windowCount <= SVG_PLOT_WINDOW_THRESHOLD) {
    plotSpec = makeCompositionPlotSpec(analyzedRecords, metric, {
      ...normalizedOptions,
      windowSize,
      stepSize
    }, warnings);
    warnings.push(...getSvgPlotWarnings(analyzedRecords, tableRows, positionAxis, plotSpec.xAxisMode, pointMarkers, notes));
    svgPlot = renderLinePlotSvg(plotSpec);
  } else if (isSvgOutput) {
    warnings.push(
      `Base composition plot was not drawn because this run has ${windowCount} windows. Use table output or larger window/step settings for dense analyses.`
    );
    svgPlot = makePlaceholderSvg("Base composition plot not drawn", [
      `${windowCount} windows across ${recordsProcessed} records.`,
      "The graphical plot is suppressed for dense outputs to keep the browser responsive.",
      "Use the table output or increase the step size for a drawable plot."
    ]);
  }
  const output = outputFormat === "report" ? reportOutput : outputFormat === "tsv" ? makeTsv(tableRows) : svgPlot;
  if (output.length > maxOutputCharacters) {
    throw new Error(`Base composition output exceeds the ${maxOutputCharacters.toLocaleString()}-character materialized-output limit. Increase the step size or select fewer records.`);
  }

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
    notes,
    recordsProcessed,
    basesProcessed,
    charactersRemoved,
    optionsUsed: { ...normalizedOptions, ...windowSettings },
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(reportOutput, "text/plain") } : {}),
      ...(outputFormat === "tsv" ? { table: makeTableStream(baseCompositionPlotTableColumns, tableRows, "base-composition-plot") } : {}),
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

export async function runBaseCompositionPlot(input, options = {}, executionContext = {}) {
  let lastYield = 0;
  const context = {
    ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      // Batch short records into a scheduling slice while polling cancellation
      // at every source chunk in both the length and window scans.
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    }
  };
  options ??= {};
  context.reportProgress?.({ phase: "reading-record-lengths", progress: 0.05 });
  const warnings = [];
  const normalizedOptions = normalizeBaseCompositionOptions(options);
  const sourceOptions = applyDisabledFastaSourceLimits(options, {
    maxSourceBases: "compositionInput",
    maxSourceRecords: "compositionInput",
    maxDecodedSourceBytes: "compositionInput",
    maxSourceBytes: "compositionInput"
  });
  const opened = await openCleanDnaRnaFastaSource(input, { ...sourceOptions, strictHeaders: true }, context);
  const recordLengths = [];
  let currentLength = 0;
  for await (const event of opened.events({ trackStats: false })) {
    if (event.type === "record-start") currentLength = 0;
    else if (event.type === "sequence-chunk") currentLength += event.text.length;
    else if (event.type === "record-end") recordLengths.push(currentLength);
  }
  if (recordLengths.length === 0) {
    return makeToolResult({
      output: "",
      optionsUsed: normalizedOptions,
      warnings: [opened.source.stats.inputProvided ? "No DNA/RNA records were found." : "No sequence input was provided.", ...opened.warnings],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }
  const windowSettings = resolveWindowSettings(normalizedOptions, recordLengths);
  const estimatedRows = estimateWindowRowCount(recordLengths, windowSettings.windowSize, windowSettings.stepSize);
  const maxWindowRows = effectiveToolLimit(options, "compositionWindows", MAX_WINDOW_ROWS);
  if (estimatedRows > maxWindowRows) {
    throw new Error(`Base composition would produce ${estimatedRows.toLocaleString()} windows, above the ${maxWindowRows.toLocaleString()}-row limit. Increase the step size or select fewer records.`);
  }

  const retainRows = normalizedOptions.outputFormat === "tsv" ||
    (normalizedOptions.outputFormat === "plot" && estimatedRows <= SVG_PLOT_WINDOW_THRESHOLD);
  context.reportProgress?.({ phase: "scanning-windows", progress: 0.25 });
  const analyzedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;
  let current = null;
  for await (const event of opened.events()) {
    if (event.type === "record-start") {
      const length = recordLengths[analyzedRecords.length];
      current = makeStreamingWindowState(event.title, event.record, length, windowSettings, normalizedOptions.metric, retainRows);
    } else if (event.type === "sequence-chunk" && current) {
      await consumeStreamingWindowChunk(current, event.text, context);
    } else if (event.type === "record-end" && current) {
      if (current.position !== event.length) throw new Error(`${current.title}: cleaned FASTA length changed between scan passes.`);
      basesProcessed += event.length;
      charactersRemoved += event.removedCount;
      if (event.removedCount > 0) warnings.push(`${current.title}: removed ${event.removedCount} non-DNA/RNA character(s).`);
      if (event.length === 0) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      if (event.length > 0 && event.length < windowSettings.windowSize) {
        warnings.push(`${current.title}: sequence shorter than window size; used a ${event.length}-base window.`);
      }
      analyzedRecords.push({ title: current.title, recordIndex: current.recordIndex, cleanedLength: event.length, rows: current.rows, windowCount: current.windowCount, summary: current.summary, undefinedWindows: current.undefinedWindows });
      current = null;
      context.reportProgress?.({
        phase: "scanning-windows",
        progress: 0.25 + (analyzedRecords.length / recordLengths.length) * 0.65,
        recordsProcessed: analyzedRecords.length,
        totalRecords: recordLengths.length
      });
    }
  }

  warnings.push(...opened.warnings);
  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  context.throwIfCancelled?.();
  return makeBaseCompositionResult({
    analyzedRecords,
    warnings,
    recordsProcessed: analyzedRecords.length,
    basesProcessed,
    charactersRemoved,
    metric: normalizedOptions.metric,
    windowMode: windowSettings.windowMode,
    windowSize: windowSettings.windowSize,
    stepSize: windowSettings.stepSize,
    positionAxis: normalizedOptions.positionAxis,
    pointMarkers: normalizedOptions.pointMarkers,
    outputFormat: normalizedOptions.outputFormat,
    normalizedOptions,
    limitOptions: options
  });
}

// The production worker, registry and default workflow use one implementation.
export const runBaseCompositionPlotWorker = runBaseCompositionPlot;
