import { parseSequenceInput } from "../../core/fasta.js";
import {
  KYTE_DOOLITTLE_HYDROPATHY,
  cleanProteinSequence,
  getProteinGravy,
  getProteinHydropathyProfile
} from "../../core/sequence.js";
import {
  makeLinePlotSpec,
  makeObservablePlotConfig,
  makePlaceholderSvg,
  renderLinePlotSvg
} from "../../core/plot-renderer.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const SVG_PLOT_WINDOW_THRESHOLD = 5000;
const DEFAULT_WINDOW_SIZE = 19;

export const proteinHydropathyTableColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "position", label: "Position", type: "number" },
  { id: "window_start", label: "Window start", type: "number" },
  { id: "window_end", label: "Window end", type: "number" },
  { id: "window_size", label: "Window size", type: "number" },
  { id: "standard_residues", label: "Standard residues", type: "number" },
  { id: "excluded_symbols", label: "Excluded symbols", type: "number" },
  { id: "hydropathy", label: "Hydropathy", type: "number" }
];
const TSV_COLUMNS = proteinHydropathyTableColumns.map((column) => column.id);

function formatNumber(value, digits = 3) {
  return value === null ? "n/a" : value.toFixed(digits);
}

function normalizeWindowSize(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_WINDOW_SIZE;
  }
  return Math.min(1001, Math.max(1, parsed));
}

function normalizeOutputFormat(outputFormat) {
  const outputFormats = new Set(["report", "tsv", "svg-plot"]);
  return outputFormats.has(outputFormat) ? outputFormat : "report";
}

async function getProteinHydropathyProfileWithContext(sequence, options = {}, context = {}) {
  const source = String(sequence ?? "").toUpperCase();
  const scale = options.scale ?? KYTE_DOOLITTLE_HYDROPATHY;
  const requestedWindowSize = Math.max(1, Number.parseInt(options.windowSize, 10) || 9);
  const windowSize = source.length > 0 ? Math.min(requestedWindowSize, source.length) : requestedWindowSize;
  const rows = [];

  if (source.length === 0) {
    return {
      requestedWindowSize,
      windowSize,
      rows
    };
  }

  for (let start = 0; start + windowSize <= source.length; start += 1) {
    if (start > 0 && start % 500 === 0) {
      await context.yieldIfNeeded?.();
    } else {
      context.throwIfCancelled?.();
    }

    const end = start + windowSize;
    const window = source.slice(start, end);
    let total = 0;
    let standardResidues = 0;

    for (const character of window) {
      if (Object.hasOwn(scale, character)) {
        total += scale[character];
        standardResidues += 1;
      }
    }

    rows.push({
      position: (start + 1 + end) / 2,
      windowStart: start + 1,
      windowEnd: end,
      windowSize,
      standardResidues,
      excludedSymbols: window.length - standardResidues,
      hydropathy: standardResidues > 0 ? total / standardResidues : null
    });
  }

  return {
    requestedWindowSize,
    windowSize,
    rows
  };
}

function summarizeProfile(rows) {
  const scoredRows = rows.filter((row) => row.hydropathy !== null);
  if (scoredRows.length === 0) {
    return {
      min: null,
      max: null
    };
  }

  return {
    min: scoredRows.reduce((best, row) => (row.hydropathy < best.hydropathy ? row : best), scoredRows[0]),
    max: scoredRows.reduce((best, row) => (row.hydropathy > best.hydropathy ? row : best), scoredRows[0])
  };
}

function makeTableRows(records) {
  return records.flatMap((record) =>
    record.profile.rows.map((row) => ({
      record: record.title,
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
    const summary = summarizeProfile(record.profile.rows);
    lines.push(`${record.title} protein hydropathy`);
    lines.push(`Length: ${record.cleanedLength}`);
    lines.push(`Standard residues used for GRAVY: ${record.gravy.residueCount}`);
    lines.push(`GRAVY: ${formatNumber(record.gravy.value)}`);
    lines.push(`Requested window size: ${record.profile.requestedWindowSize}`);
    lines.push(`Profile window size used: ${record.profile.windowSize}`);
    lines.push(`Profile windows: ${record.profile.rows.length}`);
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
  return [
    TSV_COLUMNS.join("\t"),
    ...rows.map((row) =>
      [
        row.record,
        formatNumber(row.position, 1),
        row.window_start,
        row.window_end,
        row.window_size,
        row.standard_residues,
        row.excluded_symbols,
        formatNumber(row.hydropathy)
      ].join("\t")
    )
  ].join("\n");
}

function makeHydropathyPlotSpec(records) {
  const plotRecords = records.filter((record) => record.profile.rows.some((row) => row.hydropathy !== null));
  return makeLinePlotSpec({
    title: "Protein hydropathy plot",
    xLabel: "Residue position (window midpoint)",
    yLabel: "Kyte-Doolittle hydropathy",
    yDomain: [-4.5, 4.5],
    width: 920,
    showLegend: true,
    pointMarkers: "auto",
    pointMarkerThreshold: 140,
    series: plotRecords.map((record) => ({
      id: record.title,
      label: record.title,
      points: record.profile.rows
        .filter((row) => row.hydropathy !== null)
        .map((row) => ({
          x: row.position,
          y: row.hydropathy,
          title: `${record.title} ${row.windowStart}-${row.windowEnd}: ${formatNumber(row.hydropathy)}`
        }))
    })),
    notes: ["Positive values are more hydrophobic; each point is an averaged sliding window."]
  });
}

function makeHydropathyResult({ analyzedRecords, warnings, recordsProcessed, basesProcessed, charactersRemoved, outputFormat }) {
  const tableRows = makeTableRows(analyzedRecords);
  const reportOutput = makeReport(analyzedRecords);
  let plotSpec = null;
  let svgPlot = "";
  if (outputFormat === "svg-plot" && tableRows.length <= SVG_PLOT_WINDOW_THRESHOLD) {
    plotSpec = makeHydropathyPlotSpec(analyzedRecords);
    svgPlot = renderLinePlotSvg(plotSpec);
  } else if (outputFormat === "svg-plot") {
    warnings.push(
      `Protein hydropathy plot was not drawn because this run has ${tableRows.length} windows. Use table output or a larger window size for dense analyses.`
    );
    svgPlot = makePlaceholderSvg("Protein hydropathy plot not drawn", [
      `${tableRows.length} windows across ${recordsProcessed} records.`,
      "The graphical plot is suppressed for dense outputs to keep the browser responsive.",
      "Use the table output or analyze fewer residues for a drawable plot."
    ]);
  }
  const output =
    outputFormat === "tsv" ? makeTsv(tableRows) : outputFormat === "svg-plot" ? svgPlot : reportOutput;

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
    recordsProcessed,
    basesProcessed,
    charactersRemoved,
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      table: makeTableStream(proteinHydropathyTableColumns, tableRows, "protein-hydropathy"),
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

export function runProteinHydropathy(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const windowSize = normalizeWindowSize(options.windowSize ?? DEFAULT_WINDOW_SIZE);
  const outputFormat = normalizeOutputFormat(options.outputFormat);

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  let charactersRemoved = 0;
  let basesProcessed = 0;

  for (const record of records) {
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    charactersRemoved += cleaned.removedCount;
    basesProcessed += cleaned.sequence.length;

    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-protein character(s).`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    const excludedSymbols = Array.from(cleaned.sequence).filter(
      (character) => !Object.hasOwn(KYTE_DOOLITTLE_HYDROPATHY, character)
    ).length;
    if (excludedSymbols > 0) {
      warnings.push(`${record.title}: excluded ${excludedSymbols} ambiguous, uncommon, or stop symbol(s) from hydropathy values.`);
    }
    if (cleaned.sequence.length > 0 && cleaned.sequence.length < windowSize) {
      warnings.push(`${record.title}: sequence shorter than requested window; used a ${cleaned.sequence.length}-residue window.`);
    }

    analyzedRecords.push({
      title: record.title,
      cleanedLength: cleaned.sequence.length,
      gravy: getProteinGravy(cleaned.sequence),
      profile: getProteinHydropathyProfile(cleaned.sequence, { windowSize })
    });
  }

  return makeHydropathyResult({
    analyzedRecords,
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    outputFormat
  });
}

export async function runProteinHydropathyWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const windowSize = normalizeWindowSize(options.windowSize ?? DEFAULT_WINDOW_SIZE);
  const outputFormat = normalizeOutputFormat(options.outputFormat);

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  let charactersRemoved = 0;
  let basesProcessed = 0;

  for (const [index, record] of records.entries()) {
    await context.yieldIfNeeded?.();
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    charactersRemoved += cleaned.removedCount;
    basesProcessed += cleaned.sequence.length;

    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} non-protein character(s).`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    const excludedSymbols = Array.from(cleaned.sequence).filter(
      (character) => !Object.hasOwn(KYTE_DOOLITTLE_HYDROPATHY, character)
    ).length;
    if (excludedSymbols > 0) {
      warnings.push(`${record.title}: excluded ${excludedSymbols} ambiguous, uncommon, or stop symbol(s) from hydropathy values.`);
    }
    if (cleaned.sequence.length > 0 && cleaned.sequence.length < windowSize) {
      warnings.push(`${record.title}: sequence shorter than requested window; used a ${cleaned.sequence.length}-residue window.`);
    }

    analyzedRecords.push({
      title: record.title,
      cleanedLength: cleaned.sequence.length,
      gravy: getProteinGravy(cleaned.sequence),
      profile: await getProteinHydropathyProfileWithContext(cleaned.sequence, { windowSize }, context)
    });
    context.reportProgress?.({
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
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    outputFormat
  });
}
