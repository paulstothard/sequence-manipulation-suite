import { parseSequenceInput } from "../../core/fasta.js";
import {
  plasmidCommonFeatureMatchColumns,
  scanPlasmidCommonFeatures
} from "../../core/plasmid-common-feature-scanner.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { renderSequenceMap } from "../../core/sequence-map-renderer.js";
import { renderTextAnnotationMapFromItems } from "../../core/text-annotation-map.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import {
  plasmidCommonFeatureProvenance,
  plasmidCommonFeatureRecords
} from "../../reference-data/plasmid-common-features/records.js";

const OUTPUT_FORMATS = new Set(["report", "tsv", "text-map", "svg-map", "interactive-viewer", "interactive-circular-viewer"]);
const SVG_MAX_RECORDS = 12;
const SVG_MAX_TOTAL_HITS = 240;
const SVG_MAX_HITS_PER_RECORD = 80;

function normalizeDnaForCounting(sequence) {
  return String(sequence ?? "").toUpperCase().replace(/U/g, "T").replace(/[^ACGTRYSWKMBDHVN]/g, "");
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
  const columns = plasmidCommonFeatureMatchColumns.map((column) => column.id);
  return [
    columns.join("\t"),
    ...rows.map((row) =>
      columns.map((column) => String(row[column] ?? "").replaceAll("\t", " ")).join("\t")
    )
  ].join("\n") + "\n";
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

function makeReport({ rows, references, recordsProcessed, basesProcessed }) {
  return [
    "Plasmid common feature scanner",
    `Records scanned: ${recordsProcessed}`,
    `Bases scanned: ${basesProcessed}`,
    `Bundled reference records scanned: ${references.length}`,
    `Reference dataset: ${plasmidCommonFeatureProvenance.dataset} ${plasmidCommonFeatureProvenance.version}`,
    `Dataset status: ${plasmidCommonFeatureProvenance.status}`,
    `Hits: ${rows.length}`,
    `Hits by type: ${formatCounts(countBy(rows, "feature_type"))}`,
    "",
    "Scope note:",
    "This tool uses a focused provenance-bearing reference set and ungapped exact/near-exact matching. Larger licensed reference databases and seed-plus-local-alignment verification remain planned before SMS3 claims complete plasmid annotation."
  ].join("\n") + "\n";
}

function rowsByRecord(records, rows) {
  return records.map((record, index) => {
    const title = record.title || `Record ${index + 1}`;
    return {
      title,
      sequence: normalizeDnaForCounting(record.sequence),
      rows: rows.filter((row) => row.record === title)
    };
  });
}

function makeTextMap(scannedRecords) {
  return renderTextAnnotationMapFromItems(scannedRecords.map((record) => ({
    title: record.title,
    sequence: record.sequence,
    items: record.rows.map((row, index) => ({
      ...row,
      label: `p${index + 1}`
    }))
  })), {
    width: 60,
    alphabet: "dna-rna",
    showSecondStrand: true,
    labelPrefix: "p"
  });
}

function makeSvgMap(scannedRecords) {
  const drawableRecords = scannedRecords.slice(0, SVG_MAX_RECORDS);
  const omittedRecords = Math.max(0, scannedRecords.length - drawableRecords.length);
  const perRecordBase = Math.max(1, Math.floor(SVG_MAX_TOTAL_HITS / Math.max(1, drawableRecords.length)));
  return renderSequenceMap({
    title: "Plasmid common feature map",
    records: drawableRecords.map((record) => {
      const shownLimit = Math.min(SVG_MAX_HITS_PER_RECORD, Math.max(perRecordBase, Math.min(record.rows.length, SVG_MAX_HITS_PER_RECORD)));
      const shownRows = record.rows.slice(0, shownLimit);
      const omitted = Math.max(0, record.rows.length - shownRows.length);
      return {
        title: record.title,
        length: record.sequence.length,
        molecule: "dna",
        features: shownRows.map((row, index) => ({
          start: row.start,
          end: row.end,
          strand: row.strand,
          className: row.feature_type,
          label: `p${index + 1}`,
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

export async function runPlasmidCommonFeatureScanner(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const records = parseSequenceInput(input, "dna-rna");
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No DNA/RNA sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      streams: {
        table: makeTableStream(plasmidCommonFeatureMatchColumns, [], "plasmid-common-feature-scanner")
      }
    });
  }

  const references = selectedReferences(options);
  const warnings = [];
  if (references.length === 0) {
    warnings.push("No bundled plasmid feature records matched the selected filters.");
  }
  if (Number(options.maxMismatches ?? 0) > 2) {
    warnings.push("High mismatch tolerance can produce low-specificity hits with the current ungapped seed scanner.");
  }

  const basesProcessed = records.reduce((sum, record) => sum + normalizeDnaForCounting(record.sequence).length, 0);
  context.reportProgress?.({ phase: "scanning", progress: 0.2, recordsProcessed: 0, totalRecords: records.length });
  const rows = scanPlasmidCommonFeatures(records, references, options, context);
  context.reportProgress?.({ phase: "formatting-output", progress: 0.9, recordsProcessed: records.length, totalRecords: records.length });
  context.throwIfCancelled?.();

  const scannedRecords = rowsByRecord(records, rows);
  const report = makeReport({ rows, references, recordsProcessed: records.length, basesProcessed });
  const tsv = makeTsv(rows);
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "report";
  const textMap = outputFormat === "text-map" ? makeTextMap(scannedRecords) : "";
  const svgMap = outputFormat === "svg-map" ? makeSvgMap(scannedRecords) : "";
  const viewer = outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer"
    ? makeViewer(scannedRecords, { outputFormat })
    : null;
  const output = outputFormat === "tsv"
    ? tsv
    : outputFormat === "text-map"
      ? textMap
      : outputFormat === "svg-map"
        ? svgMap
        : viewer
          ? JSON.stringify(viewer, null, 2)
          : report;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: `plasmid-common-feature-scanner.${outputFormat === "tsv" ? "tsv" : outputFormat === "svg-map" ? "svg" : viewer ? "json" : "txt"}`,
      mimeType: outputFormat === "tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "svg-map"
          ? "image/svg+xml;charset=utf-8"
          : viewer
            ? "application/json;charset=utf-8"
            : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    streams: {
      report: makeTextStream(report, "text/plain"),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
      ...(outputFormat === "svg-map" ? { overview: makeTextStream(svgMap, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      table: makeTableStream(plasmidCommonFeatureMatchColumns, rows, "plasmid-common-feature-scanner")
    },
    visual: outputFormat === "svg-map"
      ? { svg: svgMap }
      : viewer
        ? { viewer }
        : undefined
  });
}
