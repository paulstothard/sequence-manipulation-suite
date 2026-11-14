import { exportDelimitedTable } from "../../core/table.js";
import { normalizePlasmidFeatureOptions } from "../../core/plasmid-common-feature-options.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import {
  plasmidCommonFeatureMatchColumns,
  scanPlasmidCommonFeatures,
  PLASMID_FEATURE_LIMITS
} from "../../core/plasmid-common-feature-scanner.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import {
  plasmidCommonFeatureProvenance,
  plasmidCommonFeatureRecords
} from "../../reference-data/plasmid-common-features/records.js";

const OUTPUT_FORMATS_BY_STREAM = { report: "report", table: "tsv", textMap: "text-map", overview: "svg-map", viewer: "interactive-viewer" };
export const PLASMID_FEATURE_SVG_MAX_RECORDS = 12;
export const PLASMID_FEATURE_SVG_MAX_TOTAL_HITS = 240;
export const PLASMID_FEATURE_SVG_MAX_HITS_PER_RECORD = 80;

function normalizeDnaForCounting(sequence) {
  return String(sequence ?? "").toUpperCase().replace(/U/g, "T").replace(/[^ACGTRYSWKMBDHVNX]/g, "");
}

function selectedReferences(options = {}) {
  const featureType = String(options.featureType ?? "all");
  const featureId = String(options.featureId ?? "all");
  return plasmidCommonFeatureRecords.filter((record) =>
    (featureType === "all" || record.type === featureType) &&
    (featureId === "all" || record.id === featureId)
  );
}

function makeTsv(rows) {
  return exportDelimitedTable(plasmidCommonFeatureMatchColumns.map(column => ({ ...column, label: column.id })), rows, "\t");
}

function countBy(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field] || "unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]));
}

function formatCounts(counts) {
  return counts.length === 0 ? "none" : counts.map(([label, count]) => `${label}: ${count}`).join("; ");
}

function makeReport({ rows, references, recordsProcessed, basesProcessed, charactersRemoved }) {
  return [
    "Plasmid common feature scanner",
    `Records scanned: ${recordsProcessed}`,
    `Bases scanned: ${basesProcessed}`,
    `Characters removed: ${charactersRemoved}`,
    `Bundled signatures searched: ${references.length}`,
    `Reference dataset: ${plasmidCommonFeatureProvenance.dataset} ${plasmidCommonFeatureProvenance.version}`,
    `Dataset status: ${plasmidCommonFeatureProvenance.status}`,
    `Hits: ${rows.length}`,
    `Hits by type: ${formatCounts(countBy(rows, "feature_type"))}`,
    "",
    "Scope note:",
    "Full-length ungapped signatures are scanned on both strands of each linear sequence. Coordinates use cleaned DNA with U treated as T. Candidate signature hits require biological interpretation; shared sites can match multiple reference signatures."
  ].join("\n") + "\n";
}

function rowsByRecord(records, rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.record_index)) grouped.set(row.record_index, []);
    grouped.get(row.record_index).push(row);
  }
  return records.map((record, index) => {
    const title = record.title || `Record ${index + 1}`;
    return {
      title,
      sequence: normalizeDnaForCounting(record.sequence),
      rows: grouped.get(index + 1) ?? []
    };
  });
}

function makeTextMap(scannedRecords) {
  return renderTextAnnotationMapFromItems(scannedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.rows.map((row) => ({
      ...row,
      label: makeCompactFeatureLabel(row)
    }))
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    labelPrefix: "p",
    headerPrefix: ""
  });
}

function makeSvgMap(scannedRecords, warnings) {
  const drawableRecords = scannedRecords.slice(0, PLASMID_FEATURE_SVG_MAX_RECORDS);
  const omittedRecords = Math.max(0, scannedRecords.length - drawableRecords.length);
  const shownCounts = drawableRecords.map(() => 0);
  let remaining = PLASMID_FEATURE_SVG_MAX_TOTAL_HITS;
  for (let round = 0; round < PLASMID_FEATURE_SVG_MAX_HITS_PER_RECORD && remaining > 0; round += 1) {
    for (let index = 0; index < drawableRecords.length && remaining > 0; index += 1) {
      if (shownCounts[index] < drawableRecords[index].rows.length) {
        shownCounts[index] += 1;
        remaining -= 1;
      }
    }
  }
  const total = scannedRecords.reduce((sum, record) => sum + record.rows.length, 0);
  const shown = shownCounts.reduce((sum, count) => sum + count, 0);
  if (shown < total || omittedRecords) warnings.push(`Linear feature map shows ${shown} of ${total} hits across ${drawableRecords.length} of ${scannedRecords.length} records. Select Table for all hit coordinates.`);
  return renderSequenceMap({
    title: "Plasmid common feature map",
    records: drawableRecords.map((record, recordIndex) => {
      const shownLimit = shownCounts[recordIndex];
      const shownRows = record.rows.slice(0, shownLimit);
      const omitted = Math.max(0, record.rows.length - shownRows.length);
      return {
        title: record.title,
        length: record.sequence.length,
        molecule: "dna",
        features: shownRows.map((row) => ({
          start: row.start,
          end: row.end,
          strand: row.strand,
          className: row.feature_type,
          label: makeCompactFeatureLabel(row),
          inspectionLabel: row.feature_name,
          source: row.reference_source,
          matchedText: row.matched_sequence,
          identityPercent: row.identity_percent,
          score: row.score,
          showLabel: true,
          type: row.feature_type
        })),
        notes: [
          `Plasmid feature hits: ${record.rows.length}; shown: ${shownRows.length}; omitted: ${omitted}.`,
          ...(omittedRecords > 0 ? [`${omittedRecords} additional record(s) not drawn; see table output.`] : [])
        ]
      };
    }),
    styles: {
      promoter: { label: "Promoter", fill: "#2563eb", stroke: "#1d4ed8" },
      primer: { label: "Primer", fill: "#0891b2", stroke: "#0e7490" },
      operator: { label: "Operator", fill: "#d97706", stroke: "#b45309" },
      source: { label: "Source", fill: "#94a3b8", stroke: "#64748b" }
    }
  });
}

function makeCompactFeatureLabel(row) {
  const labels = {
    "t7-promoter-core": "T7 promoter",
    "sp6-promoter-core": "SP6 promoter",
    "addgene-m13-forward-21": "M13 forward",
    "addgene-m13-reverse": "M13 reverse",
    "lac-operator-core": "lac operator"
  };
  return labels[row.feature_id] ?? row.feature_name ?? row.feature_id ?? "feature";
}

function makeViewer(scannedRecords, options = {}) {
  const layout = options.outputFormat === "interactive-circular-viewer" ? "circular" : "linear";
  return makeDnaViewerData(scannedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    length: record.sequence.length,
    topology: layout === "circular" ? "circular" : "linear",
    alphabet: "dna-rna",
    tracks: record.rows.length > 0
      ? [
          {
            id: "plasmid-common-features",
            type: "features",
            label: "Plasmid common features",
            layout: "stacked-intervals",
            featureOpacity: 0.74,
            items: record.rows.map((row) => ({
              start: row.start,
              end: row.end,
              length: row.reference_length,
              strand: row.strand,
              label: makeCompactFeatureLabel(row),
              name: row.feature_name,
              type: row.feature_type,
              featureId: row.feature_id,
              mismatches: row.mismatches,
              identityPercent: row.identity_percent,
              score: row.score,
              source: row.reference_source,
              matchedText: row.matched_sequence
            }))
          }
        ]
      : []
  })), {
    title: "Plasmid common feature viewer",
    layout
  });
}

export async function runPlasmidCommonFeatureScanner(input, options = {}, executionContext = {}) {
  const sourceOptions = options ?? {};
  let lastYield = -Infinity;
  let lastProgress = -Infinity;
  const context = {
    ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    },
    reportProgress(detail) {
      if (detail.progress === 1 || Date.now() - lastProgress >= 32) {
        executionContext.reportProgress?.(detail);
        lastProgress = Date.now();
      }
    }
  };
  const requested = Array.isArray(options?.requestedPlasmidOutputs) ? options.requestedPlasmidOutputs : [];
  options = normalizePlasmidFeatureOptions(options);
  const formats = new Set([options.outputFormat]);
  for (const stream of requested) {
    if (Object.hasOwn(OUTPUT_FORMATS_BY_STREAM, stream)) formats.add(stream === "viewer" && options.outputFormat === "interactive-circular-viewer" ? options.outputFormat : OUTPUT_FORMATS_BY_STREAM[stream]);
  }
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  await context.yieldIfNeeded();
  let current;
  let charactersRemoved = 0;
  let gapsRemoved = 0;
  const warnings = [];
  const opened = await openCleanDnaRnaFastaSource(input, {
    ...sourceOptions, strictHeaders: true,
    onSourceChunk(text) { current.gaps += (text.match(/[.-]/g) ?? []).length; },
    maxSourceBases: PLASMID_FEATURE_LIMITS.maxInputCharacters, maxSourceRecords: 10_000,
    maxSourceBytes: 512 * 1024 * 1024, maxDecodedSourceBytes: 150 * 1024 * 1024,
    maxFastaHeaderCharacters: 10_000, maxTotalFastaHeaderCharacters: 5_000_000, maxIndexBytes: 16 * 1024 * 1024
  }, context);
  const records = [];
  for await (const event of opened.events()) {
    context.throwIfCancelled?.();
    if (event.type === "record-start") current = { title: event.title, chunks: [], gaps: 0 };
    else if (event.type === "sequence-chunk") current.chunks.push(event.text);
    else if (event.type === "record-end") {
      charactersRemoved += event.removedCount;
      gapsRemoved += current.gaps;
      const unsupported = event.removedCount - current.gaps;
      if (unsupported > 0) warnings.push(`${current.title}: removed ${unsupported} unsupported DNA/RNA character(s).`);
      if (!event.length) warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      records.push({ title: current.title, sequence: current.chunks.join("").replace(/U/g, "T") });
      current = null;
    }
  }

  if (records.length === 0) {
    return makeToolResult({
      optionsUsed: options,
      output: "",
      warnings: ["No DNA/RNA sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      streams: {}
    });
  }

  const references = selectedReferences(options);
  warnings.push(...opened.warnings);
  if (references.length === 0) {
    warnings.push("No bundled plasmid feature records matched the selected filters.");
  }
  if (Number(options.maxMismatches ?? 0) > 2) {
    warnings.push("High mismatch tolerance can produce low-specificity hits with the current ungapped seed scanner.");
  }

  const basesProcessed = records.reduce((sum, record) => sum + normalizeDnaForCounting(record.sequence).length, 0);
  context.reportProgress?.({ phase: "scanning", progress: 0.2, recordsProcessed: 0, totalRecords: records.length });
  const rows = await scanPlasmidCommonFeatures(records, references, options, context);
  context.reportProgress?.({ phase: "formatting-output", progress: 0.9, recordsProcessed: records.length, totalRecords: records.length });
  context.throwIfCancelled?.();

  const scannedRecords = [...formats].some(format => !["report", "tsv"].includes(format)) ? rowsByRecord(records, rows) : null;
  const report = formats.has("report") ? makeReport({ rows, references, recordsProcessed: records.length, basesProcessed, charactersRemoved }) : "";
  const tsv = formats.has("tsv") ? makeTsv(rows) : "";
  const outputFormat = options.outputFormat;
  // Map lines duplicate sequence and annotation labels; refuse dense rendering
  // before constructing the monospaced text, while table/report stay available.
  if (formats.has("text-map") && (basesProcessed > 1_000_000 || rows.length > 10_000)) {
    throw new Error("Text annotation maps support up to 1,000,000 bases and 10,000 hits. Select Table or Summary report.");
  }
  const textMap = formats.has("text-map") ? makeTextMap(scannedRecords) : "";
  const svgMap = formats.has("svg-map") ? makeSvgMap(scannedRecords, warnings) : "";
  const viewer = formats.has("interactive-viewer") || formats.has("interactive-circular-viewer")
    ? makeViewer(scannedRecords, { outputFormat })
    : null;
  const primaryViewer = outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer";
  const output = outputFormat === "tsv"
    ? tsv
    : outputFormat === "text-map"
      ? textMap
      : outputFormat === "svg-map"
        ? svgMap
        : primaryViewer
          ? JSON.stringify(viewer, null, 2)
          : report;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  const result = makeToolResult({
    optionsUsed: options,
    output,
    sequenceSearch: outputFormat === "text-map"
      ? { format: "labelled-blocks", alphabet: "dna-rna", plainMapHeadings: true }
      : undefined,
    download: {
      filename: `plasmid-common-feature-scanner.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : primaryViewer ? "json" : "txt"}`,
      mimeType: outputFormat === "tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "svg-map"
          ? "image/svg+xml;charset=utf-8"
          : primaryViewer
            ? "application/json;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    charactersRemoved,
    notes: [
      `Bundled reference: ${plasmidCommonFeatureProvenance.dataset} ${plasmidCommonFeatureProvenance.version}; searched ${references.length} of ${plasmidCommonFeatureRecords.length} signatures.`,
      ...(gapsRemoved ? [`Removed ${gapsRemoved} alignment gap character(s); coordinates use the cleaned sequence.`] : [])
    ],
    recordsProcessed: records.length,
    basesProcessed,
    streams: {
      ...(formats.has("report") ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(formats.has("text-map") ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", alphabet: "dna-rna", plainMapHeadings: true }) } : {}),
      ...(formats.has("svg-map") ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      ...(formats.has("tsv") ? { table: makeTableStream(plasmidCommonFeatureMatchColumns, rows, "plasmid-common-feature-scanner") } : {})
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : primaryViewer
        ? { viewer }
        : undefined
  });
  if (JSON.stringify(result).length > PLASMID_FEATURE_LIMITS.maxOutputCharacters) {
    throw new Error("Plasmid result exceeds the 26,214,400-character output limit. Use fewer sequences or stricter matching options.");
  }
  return result;
}
