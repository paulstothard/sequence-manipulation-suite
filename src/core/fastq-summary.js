import {
  makeCategoricalBarPlotSpec,
  makeLinePlotSpec
} from "./plot-renderer.js";
import { streamTextLines } from "./compressed-text-reader.js";
import { exportDelimitedTable } from "./table.js";

export const fastqSummaryColumns = [
  { id: "metric", label: "Metric", type: "string" },
  { id: "value", label: "Value", type: "string" },
  { id: "unit", label: "Unit", type: "string" },
  { id: "assessment", label: "Assessment", type: "string" }
];

export const fastqPerBaseQualityColumns = [
  { id: "position", label: "Position", type: "number" },
  { id: "read_count", label: "Read count", type: "number" },
  { id: "mean_quality", label: "Mean quality", type: "number" },
  { id: "q25_quality", label: "Q25 quality", type: "number" },
  { id: "median_quality", label: "Median quality", type: "number" },
  { id: "q75_quality", label: "Q75 quality", type: "number" },
  { id: "a_percent", label: "A %", type: "number" },
  { id: "c_percent", label: "C %", type: "number" },
  { id: "g_percent", label: "G %", type: "number" },
  { id: "t_u_percent", label: "T/U %", type: "number" },
  { id: "n_percent", label: "N %", type: "number" },
  { id: "other_percent", label: "Other %", type: "number" }
];

export const fastqDistributionColumns = [
  { id: "bin", label: "Bin", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "percent", label: "Percent", type: "number" }
];

export const defaultFastqSummaryLimits = {
  maxReads: 100000,
  maxInputCharacters: 50000000,
  maxPerBasePositions: 1000,
  maxDuplicateSequences: 50000
};

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function looksLikeWorkerContext(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (
      typeof value.reportProgress === "function" ||
      typeof value.throwIfCancelled === "function" ||
      typeof value.yieldIfNeeded === "function" ||
      value.signal
    )
  );
}

export function normalizeFastqSummaryOptions(options = {}) {
  return {
    maxReads: clampInteger(options.maxReads, defaultFastqSummaryLimits.maxReads, 1, 10000000),
    maxInputCharacters: clampInteger(
      options.maxInputCharacters,
      defaultFastqSummaryLimits.maxInputCharacters,
      100,
      2000000000
    ),
    maxPerBasePositions: clampInteger(
      options.maxPerBasePositions,
      defaultFastqSummaryLimits.maxPerBasePositions,
      1,
      100000
    ),
    maxDuplicateSequences: clampInteger(
      options.maxDuplicateSequences,
      defaultFastqSummaryLimits.maxDuplicateSequences,
      0,
      1000000
    )
  };
}

function checkCancelled(context, counter = 0, interval = 1024) {
  if (counter % interval === 0) {
    context?.throwIfCancelled?.();
  }
}

function parseFastq(input, options = {}, context = {}) {
  const normalized = normalizeFastqSummaryOptions(options);
  const text = String(input ?? "");
  if (text.length > normalized.maxInputCharacters) {
    throw new Error(
      `FASTQ text is larger than the current ${normalized.maxInputCharacters.toLocaleString()} character browser-local summary limit. Use the FASTQ file input or lower the input size.`
    );
  }
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.length > 0);
  const records = [];
  const warnings = [];
  if (lines.length % 4 !== 0) {
    warnings.push(`FASTQ input has ${lines.length} non-empty line(s), which is not divisible by 4.`);
  }
  for (let index = 0; index + 3 < lines.length; index += 4) {
    checkCancelled(context, index / 4, 1024);
    if (records.length >= normalized.maxReads) {
      warnings.push(`Only the first ${normalized.maxReads.toLocaleString()} FASTQ record(s) were summarized.`);
      break;
    }
    const title = lines[index];
    const sequence = lines[index + 1];
    const plus = lines[index + 2];
    const quality = lines[index + 3];
    const recordNumber = records.length + 1;
    if (!title.startsWith("@")) {
      warnings.push(`Record ${recordNumber} title line does not start with @.`);
    }
    if (!plus.startsWith("+")) {
      warnings.push(`Record ${recordNumber} separator line does not start with +.`);
    }
    if (sequence.length !== quality.length) {
      warnings.push(`Record ${recordNumber} sequence length (${sequence.length}) differs from quality length (${quality.length}).`);
    }
    records.push({ title: title.replace(/^@/, ""), sequence, quality });
  }
  return { records, warnings };
}

function roundNumber(value, digits = 6) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(digits));
}

function quantile(sortedValues, probability) {
  if (sortedValues.length === 0) {
    return "";
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sortedValues[lower];
  }
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function median(values) {
  return quantile([...values].sort((left, right) => left - right), 0.5);
}

function baseCompositionForCounts(counts) {
  const total = counts.A + counts.C + counts.G + counts.TU + counts.N + counts.other;
  const percent = (value) => total > 0 ? roundNumber((value / total) * 100, 2) : 0;
  return {
    a_percent: percent(counts.A),
    c_percent: percent(counts.C),
    g_percent: percent(counts.G),
    t_u_percent: percent(counts.TU),
    n_percent: percent(counts.N),
    other_percent: percent(counts.other)
  };
}

function createPositionStats() {
  return {
    count: 0,
    qualitySum: 0,
    qualityCounts: new Map(),
    baseCounts: { A: 0, C: 0, G: 0, TU: 0, N: 0, other: 0 }
  };
}

function addBaseToPositionStats(stats, base) {
  const upper = base.toUpperCase();
  if (upper === "A") {
    stats.baseCounts.A += 1;
  } else if (upper === "C") {
    stats.baseCounts.C += 1;
  } else if (upper === "G") {
    stats.baseCounts.G += 1;
  } else if (upper === "T" || upper === "U") {
    stats.baseCounts.TU += 1;
  } else if (upper === "N") {
    stats.baseCounts.N += 1;
  } else {
    stats.baseCounts.other += 1;
  }
}

function valueAtQualityRank(qualityCounts, rank) {
  let seen = 0;
  const target = Math.max(0, rank);
  for (const [quality, count] of [...qualityCounts.entries()].sort((left, right) => left[0] - right[0])) {
    seen += count;
    if (target < seen) {
      return quality;
    }
  }
  return "";
}

function quantileFromQualityCounts(qualityCounts, total, probability) {
  if (total <= 0) {
    return "";
  }
  if (total === 1) {
    return valueAtQualityRank(qualityCounts, 0);
  }
  const position = (total - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = valueAtQualityRank(qualityCounts, lower);
  if (lower === upper) {
    return lowerValue;
  }
  const upperValue = valueAtQualityRank(qualityCounts, upper);
  const weight = position - lower;
  return lowerValue * (1 - weight) + upperValue * weight;
}

function makePerBaseQualityRowsFromPositionStats(positionStats) {
  return positionStats.map((stats, index) => ({
    position: index + 1,
    read_count: stats.count,
    mean_quality: stats.count > 0 ? roundNumber(stats.qualitySum / stats.count, 3) : 0,
    q25_quality: roundNumber(quantileFromQualityCounts(stats.qualityCounts, stats.count, 0.25), 3),
    median_quality: roundNumber(quantileFromQualityCounts(stats.qualityCounts, stats.count, 0.5), 3),
    q75_quality: roundNumber(quantileFromQualityCounts(stats.qualityCounts, stats.count, 0.75), 3),
    ...baseCompositionForCounts(stats.baseCounts)
  }));
}

function makeLengthDistribution(lengths) {
  const counts = new Map();
  for (const length of lengths) {
    counts.set(String(length), (counts.get(String(length)) ?? 0) + 1);
  }
  const total = Math.max(1, lengths.length);
  return [...counts.entries()]
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([bin, count]) => ({ bin, count, percent: roundNumber((count / total) * 100, 2) }));
}

function makeBinnedDistribution(values, { min = 0, max = 100, step = 10 } = {}) {
  const bins = [];
  for (let start = min; start < max; start += step) {
    const end = Math.min(max, start + step);
    bins.push({ start, end, label: end === max ? `${start}-${end}` : `${start}-${end - 1}`, count: 0 });
  }
  for (const value of values) {
    const bounded = Math.max(min, Math.min(max, value));
    const index = Math.min(bins.length - 1, Math.floor((bounded - min) / step));
    bins[index].count += 1;
  }
  const total = Math.max(1, values.length);
  return bins.map((bin) => ({
    bin: bin.label,
    count: bin.count,
    percent: roundNumber((bin.count / total) * 100, 2)
  }));
}

function assessmentForMetric(metric, value) {
  if (metric === "mean_phred_quality") {
    return value >= 30 ? "good" : value >= 20 ? "review" : "low";
  }
  if (metric === "q30_bases_percent") {
    return value >= 80 ? "good" : value >= 50 ? "review" : "low";
  }
  if (metric === "duplicate_reads_percent") {
    return value <= 10 ? "low" : value <= 30 ? "review" : "high";
  }
  if (metric === "reads_with_n_percent") {
    return value <= 5 ? "low" : value <= 20 ? "review" : "high";
  }
  return "";
}

function makeSummaryRows({
  readCount,
  totalBases,
  lengths,
  gc,
  n,
  qualitySum,
  qualityCount,
  q20Bases,
  q30Bases,
  readMeanQualities,
  readGcPercents,
  readNPercentages,
  readsWithN,
  duplicateReads,
  overrepresentedSequences,
  minAscii,
  maxAscii
}) {
  const rows = [];
  const add = (metric, value, unit = "", assessment = assessmentForMetric(metric, Number(value))) => {
    rows.push({ metric, value, unit, assessment });
  };
  add("read_count", readCount, "reads");
  add("total_bases", totalBases, "bases");
  add("min_read_length", lengths[0] ?? 0, "bases");
  add("mean_read_length", readCount > 0 ? roundNumber(totalBases / readCount) : 0, "bases");
  add("median_read_length", roundNumber(quantile(lengths, 0.5)), "bases");
  add("max_read_length", lengths[lengths.length - 1] ?? 0, "bases");
  add("gc_percent", totalBases > 0 ? roundNumber((gc / totalBases) * 100, 2) : 0, "%");
  add("median_read_gc_percent", roundNumber(median(readGcPercents), 2), "%");
  add("n_count", n, "bases");
  add("reads_with_n_percent", readCount > 0 ? roundNumber((readsWithN / readCount) * 100, 2) : 0, "%");
  add("median_read_n_percent", roundNumber(median(readNPercentages), 2), "%");
  add("mean_phred_quality", qualityCount > 0 ? roundNumber(qualitySum / qualityCount) : 0, "Phred+33");
  add("median_read_mean_quality", roundNumber(median(readMeanQualities), 3), "Phred+33");
  add("q20_bases_percent", qualityCount > 0 ? roundNumber((q20Bases / qualityCount) * 100, 2) : 0, "%");
  add("q30_bases_percent", qualityCount > 0 ? roundNumber((q30Bases / qualityCount) * 100, 2) : 0, "%");
  add("duplicate_reads", duplicateReads, "reads");
  add("duplicate_reads_percent", readCount > 0 ? roundNumber((duplicateReads / readCount) * 100, 2) : 0, "%");
  add("overrepresented_sequence_count", overrepresentedSequences.length, "sequences");
  add("quality_encoding_assumption", "Phred+33", "", "assumed from standard Sanger/Illumina 1.8+ FASTQ");
  add("quality_ascii_range", qualityCount > 0 ? `${minAscii}-${maxAscii}` : "", "ASCII");
  return rows;
}

function makeReport(result) {
  const byMetric = Object.fromEntries(result.rows.map((row) => [row.metric, row]));
  const lines = [
    "FASTQ summary / analysis",
    "",
    `Reads: ${byMetric.read_count.value}`,
    `Total bases: ${byMetric.total_bases.value}`,
    `Read length: ${byMetric.min_read_length.value}-${byMetric.max_read_length.value} bases; mean ${byMetric.mean_read_length.value}`,
    `GC: ${byMetric.gc_percent.value}%`,
    `Mean Phred quality: ${byMetric.mean_phred_quality.value} (${byMetric.mean_phred_quality.assessment})`,
    `Q30 bases: ${byMetric.q30_bases_percent.value}% (${byMetric.q30_bases_percent.assessment})`,
    `Reads containing N: ${byMetric.reads_with_n_percent.value}%`,
    `Duplicate reads: ${byMetric.duplicate_reads_percent.value}%`,
    "",
    "Assessment notes:",
    "- Quality scores are interpreted as Phred+33.",
    "- Duplicate/overrepresented sequence checks are exact sequence checks on the provided reads.",
    "- Plots summarize the reads provided in the input; this is not a full FastQC replacement."
  ];
  if (result.overrepresentedSequences.length > 0) {
    lines.push("");
    lines.push("Most frequent sequences:");
    for (const item of result.overrepresentedSequences.slice(0, 5)) {
      lines.push(`- ${item.count} reads (${item.percent}%): ${item.sequence.slice(0, 60)}${item.sequence.length > 60 ? "..." : ""}`);
    }
  }
  return lines.join("\n");
}

function createFastqAccumulator(options = {}) {
  const normalized = normalizeFastqSummaryOptions(options);
  return {
    options: normalized,
    readCount: 0,
    lengths: [],
    totalBases: 0,
    gc: 0,
    n: 0,
    qualitySum: 0,
    qualityCount: 0,
    q20Bases: 0,
    q30Bases: 0,
    minAscii: Number.POSITIVE_INFINITY,
    maxAscii: Number.NEGATIVE_INFINITY,
    readsWithN: 0,
    readMeanQualities: [],
    readGcPercents: [],
    readNPercentages: [],
    sequenceCounts: new Map(),
    positionStats: [],
    perBaseLimitExceeded: false,
    duplicateTrackingLimitExceeded: false
  };
}

function addFastqRecordToAccumulator(accumulator, record, context = {}) {
  checkCancelled(context, accumulator.readCount, 512);
  accumulator.readCount += 1;
  accumulator.lengths.push(record.sequence.length);
  accumulator.totalBases += record.sequence.length;

  let readGc = 0;
  let readAcgtu = 0;
  let readN = 0;
  let readQualitySum = 0;
  let readQualityCount = 0;
  let hasN = false;
  for (const base of record.sequence.toUpperCase()) {
    if (base === "G" || base === "C") {
      accumulator.gc += 1;
      readGc += 1;
    }
    if (/[ACGTU]/.test(base)) {
      readAcgtu += 1;
    }
    if (base === "N") {
      accumulator.n += 1;
      readN += 1;
      hasN = true;
    }
  }
  if (hasN) {
    accumulator.readsWithN += 1;
  }
  accumulator.readGcPercents.push(readAcgtu > 0 ? (readGc / readAcgtu) * 100 : 0);
  accumulator.readNPercentages.push(record.sequence.length > 0 ? (readN / record.sequence.length) * 100 : 0);
  if (
    accumulator.sequenceCounts.has(record.sequence) ||
    accumulator.sequenceCounts.size < accumulator.options.maxDuplicateSequences
  ) {
    accumulator.sequenceCounts.set(record.sequence, (accumulator.sequenceCounts.get(record.sequence) ?? 0) + 1);
  } else {
    accumulator.duplicateTrackingLimitExceeded = true;
  }
  for (let index = 0; index < record.quality.length; index += 1) {
    const character = record.quality[index];
    const ascii = character.charCodeAt(0);
    const score = ascii - 33;
    accumulator.minAscii = Math.min(accumulator.minAscii, ascii);
    accumulator.maxAscii = Math.max(accumulator.maxAscii, ascii);
    accumulator.qualitySum += score;
    accumulator.qualityCount += 1;
    readQualitySum += score;
    readQualityCount += 1;
    if (score >= 20) {
      accumulator.q20Bases += 1;
    }
    if (score >= 30) {
      accumulator.q30Bases += 1;
    }
    if (index < record.sequence.length && index < accumulator.options.maxPerBasePositions) {
      while (accumulator.positionStats.length <= index) {
        accumulator.positionStats.push(createPositionStats());
      }
      const stats = accumulator.positionStats[index];
      stats.count += 1;
      stats.qualitySum += score;
      stats.qualityCounts.set(score, (stats.qualityCounts.get(score) ?? 0) + 1);
      addBaseToPositionStats(stats, record.sequence[index]);
    } else if (index >= accumulator.options.maxPerBasePositions) {
      accumulator.perBaseLimitExceeded = true;
    }
  }
  accumulator.readMeanQualities.push(readQualityCount > 0 ? readQualitySum / readQualityCount : 0);
}

function finalizeFastqSummary(accumulator, warnings, records = []) {
  if (accumulator.perBaseLimitExceeded) {
    warnings.push(
      `Per-base quality and composition rows were limited to the first ${accumulator.options.maxPerBasePositions.toLocaleString()} base position(s).`
    );
  }
  if (accumulator.duplicateTrackingLimitExceeded) {
    warnings.push(
      `Duplicate and overrepresented sequence tracking was limited to the first ${accumulator.options.maxDuplicateSequences.toLocaleString()} unique read sequence(s).`
    );
  }
  const lengths = [...accumulator.lengths].sort((left, right) => left - right);
  const readCount = accumulator.readCount;

  const overrepresentedSequences = [...accumulator.sequenceCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([sequence, count]) => ({
      sequence,
      count,
      percent: readCount > 0 ? roundNumber((count / readCount) * 100, 2) : 0
    }))
    .sort((left, right) => right.count - left.count || left.sequence.localeCompare(right.sequence));
  const duplicateReads = overrepresentedSequences.reduce((sum, item) => sum + item.count - 1, 0);
  const perBaseQualityRows = makePerBaseQualityRowsFromPositionStats(accumulator.positionStats);
  const lengthDistributionRows = makeLengthDistribution(lengths);
  const gcDistributionRows = makeBinnedDistribution(accumulator.readGcPercents, { min: 0, max: 100, step: 10 });
  const readQualityDistributionRows = makeBinnedDistribution(accumulator.readMeanQualities, { min: 0, max: 50, step: 5 });
  const nDistributionRows = makeBinnedDistribution(accumulator.readNPercentages, { min: 0, max: 100, step: 10 });

  const rows = makeSummaryRows({
    readCount,
    totalBases: accumulator.totalBases,
    lengths,
    gc: accumulator.gc,
    n: accumulator.n,
    qualitySum: accumulator.qualitySum,
    qualityCount: accumulator.qualityCount,
    q20Bases: accumulator.q20Bases,
    q30Bases: accumulator.q30Bases,
    readMeanQualities: accumulator.readMeanQualities,
    readGcPercents: accumulator.readGcPercents,
    readNPercentages: accumulator.readNPercentages,
    readsWithN: accumulator.readsWithN,
    duplicateReads,
    overrepresentedSequences,
    minAscii: Number.isFinite(accumulator.minAscii) ? accumulator.minAscii : "",
    maxAscii: Number.isFinite(accumulator.maxAscii) ? accumulator.maxAscii : ""
  });
  const result = {
    records,
    recordCount: readCount,
    totalBases: accumulator.totalBases,
    rows,
    perBaseQualityRows,
    lengthDistributionRows,
    gcDistributionRows,
    readQualityDistributionRows,
    nDistributionRows,
    overrepresentedSequences,
    report: "",
    warnings
  };
  result.report = makeReport(result);
  return result;
}

export function summarizeFastq(input, optionsOrContext = {}, maybeContext = {}) {
  const options = looksLikeWorkerContext(optionsOrContext) ? {} : optionsOrContext;
  const context = looksLikeWorkerContext(optionsOrContext) ? optionsOrContext : maybeContext;
  const parsed = parseFastq(input, options, context);
  const accumulator = createFastqAccumulator(options);
  for (const record of parsed.records) {
    addFastqRecordToAccumulator(accumulator, record, context);
  }
  return finalizeFastqSummary(accumulator, parsed.warnings, parsed.records);
}

export async function summarizeFastqChunks(chunks, optionsOrContext = {}, maybeContext = {}) {
  const options = looksLikeWorkerContext(optionsOrContext) ? {} : optionsOrContext;
  const context = looksLikeWorkerContext(optionsOrContext) ? optionsOrContext : maybeContext;
  const normalized = normalizeFastqSummaryOptions(options);
  const accumulator = createFastqAccumulator(normalized);
  const warnings = [];
  const pending = [];
  let nonEmptyLines = 0;
  let recordNumber = 0;

  for await (const rawLine of streamTextLines(chunks, { signal: context.signal })) {
    const line = String(rawLine ?? "");
    if (line.length === 0) {
      continue;
    }
    pending.push(line);
    nonEmptyLines += 1;
    if (pending.length < 4) {
      continue;
    }
    if (recordNumber >= normalized.maxReads) {
      warnings.push(`Only the first ${normalized.maxReads.toLocaleString()} FASTQ record(s) were summarized.`);
      break;
    }
    recordNumber += 1;
    const [title, sequence, plus, quality] = pending.splice(0, 4);
    if (!title.startsWith("@")) {
      warnings.push(`Record ${recordNumber} title line does not start with @.`);
    }
    if (!plus.startsWith("+")) {
      warnings.push(`Record ${recordNumber} separator line does not start with +.`);
    }
    if (sequence.length !== quality.length) {
      warnings.push(`Record ${recordNumber} sequence length (${sequence.length}) differs from quality length (${quality.length}).`);
    }
    addFastqRecordToAccumulator(accumulator, { title: title.replace(/^@/, ""), sequence, quality }, context);
    if (recordNumber % 1000 === 0) {
      context.reportProgress?.({ phase: "summarizing-fastq", recordsProcessed: recordNumber });
      await context.yieldIfNeeded?.();
    }
  }

  if (nonEmptyLines % 4 !== 0) {
    warnings.push(`FASTQ input has ${nonEmptyLines} non-empty line(s), which is not divisible by 4.`);
  }
  return finalizeFastqSummary(accumulator, warnings, []);
}

export function makeFastqSummaryTsv(rows) {
  return exportDelimitedTable(fastqSummaryColumns, rows, "\t");
}

export function makeFastqPerBaseQualityTsv(rows) {
  return exportDelimitedTable(fastqPerBaseQualityColumns, rows, "\t");
}

export function makeFastqDistributionTsv(rows) {
  return exportDelimitedTable(fastqDistributionColumns, rows, "\t");
}

export function makeFastqQualityPlotSpec(result) {
  return makeLinePlotSpec({
    title: "FASTQ per-base quality",
    xLabel: "Base position",
    yLabel: "Phred quality",
    yDomain: [0, Math.max(40, ...result.perBaseQualityRows.map((row) => row.q75_quality || 0))],
    showLegend: true,
    pointMarkers: "hide",
    bands: [
      {
        id: "iqr",
        label: "Q25-Q75",
        color: "#99f6e4",
        opacity: 0.5,
        points: result.perBaseQualityRows.map((row) => ({
          x: row.position,
          y0: row.q25_quality,
          y1: row.q75_quality,
          title: `Position ${row.position}: Q25 ${row.q25_quality}, Q75 ${row.q75_quality}`
        }))
      }
    ],
    series: [
      {
        id: "q25",
        label: "Q25",
        color: "#64748b",
        strokeWidth: 2.4,
        strokeDasharray: "5 4",
        points: result.perBaseQualityRows.map((row) => ({ x: row.position, y: row.q25_quality }))
      },
      {
        id: "q75",
        label: "Q75",
        color: "#0f766e",
        strokeWidth: 2.4,
        strokeDasharray: "5 4",
        points: result.perBaseQualityRows.map((row) => ({ x: row.position, y: row.q75_quality }))
      },
      {
        id: "median",
        label: "Median",
        color: "#f59e0b",
        strokeWidth: 2.2,
        points: result.perBaseQualityRows.map((row) => ({
          x: row.position,
          y: row.median_quality,
          title: `Position ${row.position}: median Q ${row.median_quality}`
        }))
      },
      {
        id: "mean",
        label: "Mean",
        color: "#2563eb",
        strokeWidth: 2.6,
        points: result.perBaseQualityRows.map((row) => ({
          x: row.position,
          y: row.mean_quality,
          title: `Position ${row.position}: mean Q ${row.mean_quality}`
        }))
      }
    ],
    notes: ["Quality scores are interpreted as Phred+33. The shaded band spans Q25 to Q75 at each base position."]
  });
}

export function makeFastqLengthPlotSpec(result) {
  return makeCategoricalBarPlotSpec({
    title: "FASTQ read length distribution",
    xLabel: "Read length",
    yLabel: "Reads",
    showLegend: false,
    xTickLabelMode: "horizontal",
    barWidthMode: "histogram",
    barFillOpacity: 0.86,
    categories: result.lengthDistributionRows.map((row) => ({ id: row.bin, label: row.bin })),
    series: [{ id: "reads", label: "Reads", color: "#2563eb" }],
    bars: result.lengthDistributionRows.map((row) => ({
      category: row.bin,
      series: "reads",
      value: row.count,
      title: `${row.bin} bases: ${row.count} reads`
    }))
  });
}

export function makeFastqGcPlotSpec(result) {
  return makeCategoricalBarPlotSpec({
    title: "FASTQ read GC distribution",
    xLabel: "Read GC %",
    yLabel: "Reads",
    showLegend: false,
    xTickLabelMode: "horizontal",
    barWidthMode: "histogram",
    barFillOpacity: 0.86,
    categories: result.gcDistributionRows.map((row) => ({ id: row.bin, label: row.bin })),
    series: [{ id: "reads", label: "Reads", color: "#0f766e" }],
    bars: result.gcDistributionRows.map((row) => ({
      category: row.bin,
      series: "reads",
      value: row.count,
      title: `${row.bin}% GC: ${row.count} reads`
    }))
  });
}

export function makeFastqReadQualityDistributionPlotSpec(result) {
  return makeCategoricalBarPlotSpec({
    title: "FASTQ per-read mean quality distribution",
    xLabel: "Mean Phred quality",
    yLabel: "Reads",
    showLegend: false,
    xTickLabelMode: "horizontal",
    barWidthMode: "histogram",
    barFillOpacity: 0.86,
    categories: result.readQualityDistributionRows.map((row) => ({ id: row.bin, label: row.bin })),
    series: [{ id: "reads", label: "Reads", color: "#7c3aed" }],
    bars: result.readQualityDistributionRows.map((row) => ({
      category: row.bin,
      series: "reads",
      value: row.count,
      title: `Mean Q ${row.bin}: ${row.count} reads`
    }))
  });
}

export function makeFastqBaseCompositionPlotSpec(result) {
  const baseSeries = [
    ["a_percent", "A", "#2ca25f"],
    ["c_percent", "C", "#2563eb"],
    ["g_percent", "G", "#f59e0b"],
    ["t_u_percent", "T/U", "#dc2626"],
    ["n_percent", "N", "#64748b"],
    ["other_percent", "Other", "#7c3aed"]
  ];
  return makeLinePlotSpec({
    title: "FASTQ per-base composition",
    xLabel: "Base position",
    yLabel: "Reads at position (%)",
    yDomain: [0, 100],
    showLegend: true,
    pointMarkers: "hide",
    series: baseSeries.map(([field, label, color]) => ({
      id: field,
      label,
      color,
      points: result.perBaseQualityRows.map((row) => ({
        x: row.position,
        y: row[field],
        title: `Position ${row.position}: ${label} ${row[field]}%`
      }))
    })),
    notes: ["Percentages are calculated from reads covering each base position."]
  });
}

export function makeFastqAmbiguousDistributionPlotSpec(result) {
  return makeCategoricalBarPlotSpec({
    title: "FASTQ read N/ambiguous-base distribution",
    xLabel: "N bases per read (%)",
    yLabel: "Reads",
    showLegend: false,
    xTickLabelMode: "horizontal",
    barWidthMode: "histogram",
    barFillOpacity: 0.86,
    categories: result.nDistributionRows.map((row) => ({ id: row.bin, label: row.bin })),
    series: [{ id: "reads", label: "Reads", color: "#64748b" }],
    bars: result.nDistributionRows.map((row) => ({
      category: row.bin,
      series: "reads",
      value: row.count,
      title: `${row.bin}% N: ${row.count} reads`
    }))
  });
}
