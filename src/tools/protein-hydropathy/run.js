import { applyAxisLimits, plotNumericExtent } from "../../core/plot-tools.js";
import { effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { exportDelimitedTable } from "../../core/table.js";
import { PROTEIN_HYDROPATHY_LIMITS as LIMITS, normalizeProteinHydropathyOptions } from "../../core/protein-hydropathy-options.js";
import { parseSequenceInput } from "../../core/fasta.js";
import {
  KYTE_DOOLITTLE_HYDROPATHY,
  cleanProteinSequence,
  proteinHydropathyProfileSteps
} from "../../core/sequence.js";
import {
  makeLinePlotSpec,
  makeObservablePlotConfig,
  makePlaceholderSvg,
  renderLinePlotSvg
} from "../../core/plot-renderer.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export const SVG_PLOT_WINDOW_THRESHOLD = 5000;

export const proteinHydropathyTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "record_index", label: "Record number", type: "number" },
  { id: "position", label: "Position", type: "number" },
  { id: "window_start", label: "Window start", type: "number" },
  { id: "window_end", label: "Window end", type: "number" },
  { id: "window_size", label: "Window size", type: "number" },
  { id: "standard_residues", label: "Standard residues", type: "number" },
  { id: "excluded_symbols", label: "Excluded symbols", type: "number" },
  { id: "hydropathy", label: "Hydropathy", type: "number" }
];
const TSV_COLUMNS = proteinHydropathyTableColumns.map((column) => ({ ...column, label: column.id }));

function formatNumber(value, digits = 3) {
  return value === null ? "n/a" : value.toFixed(digits);
}

async function getProteinHydropathyProfileWithContext(sequence, options, context) {
  if (sequence.length >= 16_384) context.reportProgress?.({ phase: "building-windows" });
  const steps = proteinHydropathyProfileSteps(sequence, options, context);
  let step = steps.next();
  while (!step.done) {
    if (sequence.length >= 16_384) await context.yieldIfNeeded?.();
    step = steps.next();
  }
  return step.value;
}

async function cleanRecord(sequence, context) {
  const parts = [];
  let removedCount = 0, excludedSymbols = 0, gapCount = 0;
  for (let start = 0; start < sequence.length;) {
    context.throwIfCancelled?.();
    let end = Math.min(sequence.length, start + 65_536);
    if (end < sequence.length && /[\uD800-\uDBFF]/.test(sequence[end - 1]) && /[\uDC00-\uDFFF]/.test(sequence[end])) end += 1;
    const cleaned = cleanProteinSequence(sequence.slice(start, end), { preserveCase: false, keepGaps: false });
    for (const character of sequence.slice(start, end)) if (character === "-" || character === ".") gapCount += 1;
    parts.push(cleaned.sequence);
    removedCount += cleaned.removedCount;
    for (const character of cleaned.sequence) if (!Object.hasOwn(KYTE_DOOLITTLE_HYDROPATHY, character)) excludedSymbols += 1;
    start = end;
    if (start < sequence.length) await context.yieldIfNeeded?.();
  }
  return { sequence: parts.join(""), removedCount, excludedSymbols, gapCount };
}

function makeTableRows(records) {
  return records.flatMap((record) =>
    record.profile.rows.map((row) => ({
      record: record.title,
      record_index: record.recordIndex,
      position: row.position,
      window_start: row.windowStart,
      window_end: row.windowEnd,
      window_size: row.windowSize,
      standard_residues: row.standardResidues,
      excluded_symbols: row.excludedSymbols,
      hydropathy: row.hydropathy
    }))
  );
}

function makeReport(records) {
  const lines = [];

  for (const record of records) {
    const summary = record.profile.summary;
    lines.push(`${record.title} protein hydropathy`);
    lines.push(`Record: ${record.recordIndex}`);
    lines.push(`Length: ${record.cleanedLength}`);
    lines.push(`Standard residues used for GRAVY: ${record.gravy.residueCount}`);
    lines.push(`GRAVY: ${formatNumber(record.gravy.value)}`);
    lines.push(`Requested window size: ${record.profile.requestedWindowSize}`);
    lines.push(`Profile window size used: ${record.profile.windowSize}`);
    lines.push(`Profile windows: ${record.profile.windowCount}`);
    if (summary.max) {
      lines.push(
        `Most hydrophobic window: ${formatNumber(summary.max.hydropathy)} at ${summary.max.windowStart}-${summary.max.windowEnd}`
      );
      lines.push(
        `Most hydrophilic window: ${formatNumber(summary.min.hydropathy)} at ${summary.min.windowStart}-${summary.min.windowEnd}`
      );
    } else {
      lines.push("Most hydrophobic window: n/a");
      lines.push("Most hydrophilic window: n/a");
    }
    lines.push("Method: Kyte-Doolittle hydropathy scale; windows average standard residues only.");
    lines.push("Reference: Kyte J, Doolittle RF. J Mol Biol. 1982;157:105-132; ExPASy ProtScale.");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function makeTsv(rows) {
  return exportDelimitedTable(TSV_COLUMNS, rows, "\t");
}

function makeHydropathyPlotSpec(records, options, warnings) {
  const plotRecords = records.filter((record) => record.profile.rows.length > 0);
  const points = plotRecords.flatMap(record => record.profile.rows);
  return makeLinePlotSpec({
    title: "Protein hydropathy plot",
    xLabel: "Residue position (window midpoint)",
    yLabel: "Kyte-Doolittle hydropathy",
    xDomain: applyAxisLimits(plotNumericExtent(points.map(row => row.position)), { ...options, warnings }, "x"),
    yDomain: applyAxisLimits(plotNumericExtent(points.map(row => row.hydropathy)), { ...options, warnings }, "y"),
    clip: true,
    width: 920,
    showLegend: true,
    pointMarkers: "auto",
    pointMarkerThreshold: 140,
    series: plotRecords.map((record) => ({
      id: `record-${record.recordIndex}`,
      label: `Record ${record.recordIndex}: ${record.title}`,
      points: record.profile.rows
        .map((row) => ({
          x: row.position,
          y: row.hydropathy,
          title: `Record ${record.recordIndex}: ${record.title} ${row.windowStart}-${row.windowEnd}: ${formatNumber(row.hydropathy)}`
        }))
    })),
    notes: ["Positive values are more hydrophobic; each point is an averaged sliding window. Windows without standard residues are undefined and break the line."]
  });
}

function makeHydropathyResult({ analyzedRecords, warnings, notes, recordsProcessed, basesProcessed, charactersRemoved, outputFormat, optionsUsed }) {
  const tableRows = outputFormat === "tsv" ? makeTableRows(analyzedRecords) : null;
  const reportOutput = outputFormat === "report" ? makeReport(analyzedRecords) : "";
  const windowCount = analyzedRecords.reduce((sum, record) => sum + record.profile.windowCount, 0);
  let plotSpec = null;
  let svgPlot = "";
  if (outputFormat === "svg-plot" && windowCount <= SVG_PLOT_WINDOW_THRESHOLD) {
    plotSpec = makeHydropathyPlotSpec(analyzedRecords, optionsUsed, warnings);
    svgPlot = renderLinePlotSvg(plotSpec);
  } else if (outputFormat === "svg-plot") {
    warnings.push(
      `Protein hydropathy plot was not drawn because this run has ${windowCount} windows. Use table output or a larger window size for dense analyses.`
    );
    svgPlot = makePlaceholderSvg("Protein hydropathy plot not drawn", [
      `${windowCount} windows across ${recordsProcessed} records.`,
      "The graphical plot is suppressed for dense outputs to keep the browser responsive.",
      "Use the table output or analyze fewer residues for a drawable plot."
    ]);
  }
  const output =
    outputFormat === "tsv" ? makeTsv(tableRows) : outputFormat === "svg-plot" ? svgPlot : reportOutput;

  if (output.length > effectiveToolLimit(optionsUsed, "hydropathyOutput", LIMITS.outputCharacters)) throw new Error("Hydropathy output exceeds 26,214,400 characters. Select a summary report or fewer records.");
  return makeToolResult({
    output,
    download: {
      filename: `protein-hydropathy.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-plot" ? "svg" : "txt"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values"
          : outputFormat === "svg-plot"
            ? "image/svg+xml;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    notes,
    processedUnitLabel: "residue",
    optionsUsed,
    recordsProcessed,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(reportOutput, "text/plain") } : {}),
      ...(outputFormat === "tsv" ? { table: makeTableStream(proteinHydropathyTableColumns, tableRows, "protein-hydropathy") } : {}),
      ...(outputFormat === "svg-plot" ? { plot: makeTextStream(svgPlot, "image/svg+xml") } : {})
    },
    visual: outputFormat === "svg-plot"
      ? {
          svg: svgPlot,
          renderer: "observable-plot",
          plotSpec,
          observablePlotConfig: plotSpec ? makeObservablePlotConfig(plotSpec) : undefined,
          pngDownload: true
        }
      : undefined
  });
}

export async function runProteinHydropathy(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const optionsUsed = normalizeProteinHydropathyOptions(options);
  const source = String(input ?? "");
  let sourceCharacters = 0;
  for (const character of source) {
    sourceCharacters += 1;
    if (sourceCharacters > effectiveToolLimit(optionsUsed, "hydropathyInput", LIMITS.inputCharacters)) throw new Error("Hydropathy input exceeds 2,000,000 characters.");
    if ((sourceCharacters & 0xffff) === 0) { context.throwIfCancelled?.(); await context.yieldIfNeeded?.(); }
  }
  const records = parseSequenceInput(source, "sequence", { strictHeaders: true });
  if (records.length > effectiveToolLimit(optionsUsed, "hydropathyRecords", LIMITS.records)) throw new Error("Hydropathy input exceeds 10,000 protein records.");
  if (records.some(record => record.title.length > LIMITS.headerCharacters)) throw new Error("Hydropathy FASTA headers must not exceed 1,000 characters.");
  const warnings = [];
  const notes = [];
  const { windowSize, outputFormat } = optionsUsed;

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      optionsUsed,
      processedUnitLabel: "residue",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  let charactersRemoved = 0;
  let basesProcessed = 0;
  let totalWindows = 0;
  let minimumTableCharacters = 0;

  for (const [index, record] of records.entries()) {
    context.throwIfCancelled?.();
    if (index % 100 === 0) await context.yieldIfNeeded?.();
    const cleaned = await cleanRecord(record.sequence, context);
    charactersRemoved += cleaned.removedCount;
    basesProcessed += cleaned.sequence.length;

    if (cleaned.gapCount > 0) notes.push(`${record.title}: removed ${cleaned.gapCount} alignment gap character(s); coordinates refer to the cleaned sequence.`);
    const invalidCount = cleaned.removedCount - cleaned.gapCount;
    if (invalidCount > 0) warnings.push(`${record.title}: removed ${invalidCount} non-protein character(s).`);

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    const excludedSymbols = cleaned.excludedSymbols;
    if (excludedSymbols > 0) {
      warnings.push(`${record.title}: excluded ${excludedSymbols} ambiguous, uncommon, or stop symbol(s) from hydropathy values.`);
    }
    if (cleaned.sequence.length > 0 && cleaned.sequence.length < windowSize) {
      warnings.push(`${record.title}: sequence shorter than requested window; used a ${cleaned.sequence.length}-residue window.`);
    }

    const recordWindows = cleaned.sequence.length ? Math.max(1, cleaned.sequence.length - windowSize + 1) : 0;
    if (outputFormat === "tsv") {
      if (totalWindows + recordWindows > effectiveToolLimit(optionsUsed, "hydropathyRows", LIMITS.tableWindows)) throw new Error("Hydropathy table exceeds 50,000 windows. Select a summary report or fewer residues.");
      minimumTableCharacters += recordWindows * (record.title.length + 8);
      if (minimumTableCharacters > effectiveToolLimit(optionsUsed, "hydropathyOutput", LIMITS.outputCharacters)) throw new Error("Hydropathy output exceeds 26,214,400 characters. Select a summary report or fewer records.");
    }
    const profile = await getProteinHydropathyProfileWithContext(cleaned.sequence, {
      windowSize, retainRows: outputFormat !== "report",
      maxRetainedRows: outputFormat === "svg-plot" ? Math.max(0, SVG_PLOT_WINDOW_THRESHOLD - totalWindows) : Infinity
    }, context);
    totalWindows += profile.windowCount;
    if (outputFormat === "svg-plot" && totalWindows > SVG_PLOT_WINDOW_THRESHOLD && totalWindows - profile.windowCount <= SVG_PLOT_WINDOW_THRESHOLD) {
      for (const record of analyzedRecords) record.profile.rows.length = 0;
    }
    analyzedRecords.push({
      title: record.title,
      recordIndex: index + 1,
      cleanedLength: cleaned.sequence.length,
      gravy: profile.gravy,
      profile
    });
    if (index % 100 === 0 || index === records.length - 1) context.reportProgress?.({
      phase: "building-windows",
      progress: 0.05 + ((index + 1) / records.length) * 0.85,
      recordsProcessed: index + 1,
      totalRecords: records.length
    });
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.95 });
  context.throwIfCancelled?.();
  return makeHydropathyResult({
    analyzedRecords,
    warnings,
    notes,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    outputFormat,
    optionsUsed
  });
}

export const runProteinHydropathyWorker = runProteinHydropathy;
