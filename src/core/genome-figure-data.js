import { parseSequenceInput } from "./fasta.js";
import { parseBiologicalRecordInput } from "./biological-record-format-converter.js";
import { cleanDnaRnaSequence } from "./sequence.js";

export const genomeFigureFeatureColumns = [
  { id: "record", label: "Record" },
  { id: "type", label: "Type" },
  { id: "label", label: "Label" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "strand", label: "Strand" },
  { id: "parts", label: "Parts" },
  { id: "source", label: "Source" }
];

const DEFAULT_FEATURE_PRIORITY = new Map([
  ["source", 1],
  ["gene", 6],
  ["CDS", 8],
  ["rRNA", 8],
  ["tRNA", 8],
  ["ncRNA", 7],
  ["repeat_region", 5],
  ["mobile_element", 8],
  ["misc_feature", 4]
]);
export const GENOME_FIGURE_MAX_PLOT_WINDOW_SIZE = 10000;
export const GENOME_FIGURE_COMMON_PLOT_WINDOW_SIZES = [
  24, 50, 100, 200, 500, 1000, 2000, 5000, 10000
];
export const GENOME_FIGURE_PREPLOT_POINT_LIMIT = 5000;

function nearestCommonPlotWindowSize(value, sequenceLength = Number.POSITIVE_INFINITY) {
  const maxAllowed = Math.min(GENOME_FIGURE_MAX_PLOT_WINDOW_SIZE, Math.max(24, Number(sequenceLength) || 24));
  const candidates = GENOME_FIGURE_COMMON_PLOT_WINDOW_SIZES.filter((size) => size <= maxAllowed);
  if (!candidates.length) return Math.max(1, Math.round(value));
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best
  ), candidates[0]);
}

export function defaultGenomeFigurePlotWindowSize(sequenceLength) {
  const length = Math.max(1, Number(sequenceLength) || 1);
  const target = Math.max(24, Math.ceil(length / 120));
  return Math.min(GENOME_FIGURE_MAX_PLOT_WINDOW_SIZE, nearestCommonPlotWindowSize(target, length));
}

export function genomeFigurePreparedPlotWindowSizes(sequenceLength) {
  const length = Math.max(1, Number(sequenceLength) || 1);
  const minimumWindow = Math.max(24, Math.ceil(length / GENOME_FIGURE_PREPLOT_POINT_LIMIT));
  const sizes = new Set([
    defaultGenomeFigurePlotWindowSize(length),
    ...GENOME_FIGURE_COMMON_PLOT_WINDOW_SIZES.filter((size) => size <= length && size >= minimumWindow)
  ]);
  return [...sizes].sort((left, right) => left - right);
}

function normalizedPlotWindowSize(length, options = {}) {
  const requestedWindow = Number.parseInt(options.windowSize, 10);
  const boundedLength = Math.max(1, Number(length) || 1);
  const windowSize = Number.isFinite(requestedWindow)
    ? Math.max(24, requestedWindow)
    : defaultGenomeFigurePlotWindowSize(boundedLength);
  return Math.max(1, Math.min(boundedLength, windowSize));
}

function normalizeOptions(options = {}) {
  return {
    layout: options.layout === "linear" ? "linear" : "circular",
    labelDensity: new Set(["low", "medium", "high"]).has(options.labelDensity) ? options.labelDensity : "medium",
    showLegend: options.showLegend !== false,
    featureLayout: new Set(["non-overlap", "type-slots"]).has(options.featureLayout) ? options.featureLayout : "type-slots",
    title: String(options.title || "Genome figure").trim() || "Genome figure",
    width: Math.max(900, Math.min(2600, Number.parseInt(options.width ?? 1600, 10) || 1600))
  };
}

function makeFeatureLabel(feature) {
  return [
    feature.gene,
    feature.locus_tag,
    feature.product,
    feature.protein_id,
    feature.feature
  ].find((value) => String(value ?? "").trim()) || "feature";
}

function normalizePart(part, length) {
  const start = Math.max(1, Math.min(length, Number(part.start)));
  const end = Math.max(1, Math.min(length, Number(part.end)));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
    strand: part.strand === "-" ? "-" : "+"
  };
}

function normalizeFeature(feature, record, index) {
  if (feature.feature === "source") return null;
  const parsed = feature.parsedLocation ?? {};
  const parts = (parsed.ranges ?? [])
    .map((part) => normalizePart(part, record.sequence.length))
    .filter(Boolean);
  const start = Number(parsed.start);
  const end = Number(parsed.end);
  const fallbackPart = normalizePart({ start, end, strand: parsed.strand }, record.sequence.length);
  const normalizedParts = parts.length > 0 ? parts : fallbackPart ? [fallbackPart] : [];
  if (normalizedParts.length === 0) return null;
  const type = feature.feature || "misc_feature";
  const label = makeFeatureLabel(feature);
  return {
    id: feature.id || `${record.accession || record.title || "record"}:${index + 1}`,
    type,
    label,
    start: Math.min(...normalizedParts.map((part) => part.start)),
    end: Math.max(...normalizedParts.map((part) => part.end)),
    strand: parsed.strand === "-" ? "-" : "+",
    parts: normalizedParts,
    source: feature.location || "",
    priority: DEFAULT_FEATURE_PRIORITY.get(type) ?? (type === "CDS" ? 8 : 5)
  };
}

function cleanSequenceRecord(record, warnings) {
  const cleaned = cleanDnaRnaSequence(record.sequence, {
    preserveCase: false,
    keepGaps: false
  });
  if (cleaned.removedCount > 0) {
    warnings.push(`${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
  }
  if (!cleaned.sequence) {
    warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
  }
  return {
    title: record.title || "sequence",
    accession: record.title || "sequence",
    sequence: cleaned.sequence,
    topology: record.topology === "circular" ? "circular" : "linear",
    features: []
  };
}

export function flatfileRecordsToGenomeFigureRecords(records) {
  return records
    .filter((record) => record.sequence && record.molecule !== "protein")
    .map((record) => ({
      title: record.title || record.accession,
      accession: record.accession,
      sequence: record.sequence,
      topology: record.topology === "circular" ? "circular" : "linear",
      features: record.features
        .map((feature, index) => normalizeFeature(feature, record, index))
        .filter(Boolean)
    }));
}

function recordsFromInput(input, warnings, options = {}) {
  const biologicalRecordInput = parseBiologicalRecordInput(input, options);
  const dnaFlatfileRecords = flatfileRecordsToGenomeFigureRecords(biologicalRecordInput.records);

  if (dnaFlatfileRecords.length > 0) {
    warnings.push(...biologicalRecordInput.warnings);
    return dnaFlatfileRecords;
  }
  if (biologicalRecordInput.records.length > 0 || biologicalRecordInput.warnings.length > 0) {
    warnings.push(...biologicalRecordInput.warnings);
    return [];
  }

  return parseSequenceInput(input, "sequence").map((record) => cleanSequenceRecord(record, warnings));
}

export function makeGcPlot(sequence, options = {}) {
  const length = sequence.length;
  if (length === 0) return [];
  const windowSize = normalizedPlotWindowSize(length, options);
  const circular = options.circular === true && length > windowSize;
  const points = [];
  for (let start = 0; start < length; start += windowSize) {
    const end = Math.min(length, start + windowSize);
    const chunk = circular && end - start < windowSize
      ? sequence.slice(start) + sequence.slice(0, windowSize - (length - start))
      : sequence.slice(start, end);
    const informative = chunk.replace(/[^ACGT]/g, "");
    const gc = informative.length
      ? (informative.match(/[GC]/g)?.length ?? 0) / informative.length
      : 0;
    points.push({
      position: start + 1 + Math.floor(chunk.length / 2),
      value: Number(gc.toFixed(4))
    });
  }
  return points;
}

export function makeGcSkewPlot(sequence, options = {}) {
  const length = sequence.length;
  if (length === 0) return [];
  const windowSize = normalizedPlotWindowSize(length, options);
  const circular = options.circular === true && length > windowSize;
  const points = [];
  for (let start = 0; start < length; start += windowSize) {
    const end = Math.min(length, start + windowSize);
    const chunk = circular && end - start < windowSize
      ? sequence.slice(start) + sequence.slice(0, windowSize - (length - start))
      : sequence.slice(start, end);
    const g = chunk.match(/G/g)?.length ?? 0;
    const c = chunk.match(/C/g)?.length ?? 0;
    const skew = g + c > 0 ? (g - c) / (g + c) : 0;
    points.push({
      position: start + 1 + Math.floor(chunk.length / 2),
      value: Number(skew.toFixed(4))
    });
  }
  return points;
}

function makePlotTracks(sequence, options = {}) {
  const windowSize = normalizedPlotWindowSize(sequence.length, options);
  const circular = options.circular === true;
  return [
    {
      id: "gc",
      label: "GC fraction",
      baseline: 0.5,
      windowSize,
      values: makeGcPlot(sequence, { windowSize, circular })
    },
    {
      id: "gc-skew",
      label: "GC skew",
      baseline: 0,
      windowSize,
      values: makeGcSkewPlot(sequence, { windowSize, circular })
    }
  ];
}

function makePlotSummaries(sequence, options = {}) {
  const summaries = {};
  for (const windowSize of genomeFigurePreparedPlotWindowSizes(sequence.length)) {
    summaries[String(windowSize)] = makePlotTracks(sequence, { windowSize, circular: options.circular === true });
  }
  return summaries;
}

function makeFeatureRows(records) {
  return records.flatMap((record) =>
    record.features.map((feature) => ({
      record: record.title,
      type: feature.type,
      label: feature.label,
      start: feature.start,
      end: feature.end,
      strand: feature.strand,
      parts: feature.parts.map((part) => `${part.start}-${part.end}`).join(";"),
      source: feature.source
    }))
  );
}

function makeGenomeFigureDataFromRecords(parsedRecords, options = {}, context = {}, initialWarnings = []) {
  const normalized = normalizeOptions(options);
  const warnings = [...initialWarnings];
  const records = [];
  let basesProcessed = 0;

  for (const parsedRecord of parsedRecords) {
    context.throwIfCancelled?.();
    const cleaned = cleanDnaRnaSequence(parsedRecord.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    if (!cleaned.sequence) continue;
    if (cleaned.removedCount > 0) {
      warnings.push(`${parsedRecord.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s) from the figure sequence.`);
    }
    const plotSummaries = makePlotSummaries(cleaned.sequence, {
      circular: normalized.layout === "circular"
    });
    const defaultWindow = defaultGenomeFigurePlotWindowSize(cleaned.sequence.length);
    const cleanedRecord = {
      id: parsedRecord.accession || parsedRecord.title,
      title: parsedRecord.title || parsedRecord.accession || "sequence",
      accession: parsedRecord.accession || parsedRecord.title || "sequence",
      sequence: cleaned.sequence,
      length: cleaned.sequence.length,
      topology: parsedRecord.topology === "circular" ? "circular" : "linear",
      features: parsedRecord.features ?? [],
      plots: plotSummaries[String(defaultWindow)] ?? makePlotTracks(cleaned.sequence, {
        windowSize: defaultWindow,
        circular: normalized.layout === "circular"
      }),
      plotSummaries
    };
    basesProcessed += cleanedRecord.length;
    records.push(cleanedRecord);
  }

  return {
    figure: {
      figureType: "genome-figure",
      version: 1,
      title: normalized.title,
      layout: normalized.layout,
      palette: "classic",
      labelDensity: normalized.labelDensity,
      showLegend: normalized.showLegend,
      plotMode: "both",
      featureLayout: normalized.featureLayout,
      width: normalized.width,
      records
    },
    rows: makeFeatureRows(records),
    warnings,
    recordsProcessed: records.length,
    basesProcessed
  };
}

export function makeGenomeFigureData(input, options = {}, context = {}) {
  const warnings = [];
  const parsedRecords = recordsFromInput(input, warnings, options);
  return makeGenomeFigureDataFromRecords(parsedRecords, options, context, warnings);
}

export function makeGenomeFigureDataFromFlatfileRecords(records, options = {}, context = {}) {
  return makeGenomeFigureDataFromRecords(
    flatfileRecordsToGenomeFigureRecords(records),
    options,
    context
  );
}

export function makeGenomeFigureStream(figure) {
  return {
    kind: "figure",
    figureType: "genome-figure",
    figure
  };
}
