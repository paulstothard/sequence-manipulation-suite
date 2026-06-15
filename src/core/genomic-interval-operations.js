import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import { exportDelimitedTable } from "./table.js";

const BEDTOOLS_VERSION = "2.31.0";
const SPLIT_SEPARATOR = "---";
const FORMATS = new Set(["auto", "bed", "gff", "gtf", "vcf"]);
const OPERATIONS = new Set(["intersect", "subtract", "merge", "nearest"]);
const OUTPUT_FORMATS = new Set(["interval-table", "summary-report", "bed"]);

let bedtoolsCliPromise = null;
let runCounter = 0;

export const genomicIntervalOperationColumns = [
  { id: "record", label: "Record" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "name", label: "Name" },
  { id: "source_set", label: "Source set" },
  { id: "operation", label: "Operation" },
  { id: "partner_record", label: "Partner record" },
  { id: "partner_start", label: "Partner start" },
  { id: "partner_end", label: "Partner end" },
  { id: "partner_name", label: "Partner name" },
  { id: "overlap_bp", label: "Overlap bp" },
  { id: "distance_bp", label: "Distance bp" },
  { id: "strand", label: "Strand" },
  { id: "notes", label: "Notes" }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function parseNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

export function normalizeGenomicIntervalOptions(options = {}) {
  const queryFormat = FORMATS.has(String(options.queryFormat ?? "auto")) ? String(options.queryFormat ?? "auto") : "auto";
  const referenceFormat = FORMATS.has(String(options.referenceFormat ?? "auto")) ? String(options.referenceFormat ?? "auto") : "auto";
  const operation = OPERATIONS.has(String(options.operation ?? "intersect")) ? String(options.operation ?? "intersect") : "intersect";
  const outputFormat = OUTPUT_FORMATS.has(String(options.outputFormat ?? "interval-table"))
    ? String(options.outputFormat ?? "interval-table")
    : "interval-table";
  return {
    intervalEngine: options.intervalEngine === "sms3" ? "sms3" : "bedtools",
    queryFormat,
    referenceFormat,
    operation,
    minOverlapBp: parseInteger(options.minOverlapBp, 1, 1, 1_000_000_000),
    minReciprocalOverlapPercent: parseNumber(options.minReciprocalOverlapPercent, 0, 0, 100),
    mergeGapBp: parseInteger(options.mergeGapBp, 0, 0, 1_000_000_000),
    outputFormat,
    maxQueryIntervals: parseInteger(options.maxQueryIntervals, 100_000, 1, 10_000_000),
    maxReferenceIntervals: parseInteger(options.maxReferenceIntervals, 100_000, 1, 10_000_000),
    maxOutputRows: parseInteger(options.maxOutputRows, 50_000, 1, 5_000_000),
    maxInputCharacters: parseInteger(options.maxInputCharacters, 20_000_000, 1000, 2_000_000_000)
  };
}

function splitInput(input) {
  const text = String(input ?? "").replace(/\r\n?/g, "\n").trim();
  const parts = text.split(new RegExp(`\\n\\s*${SPLIT_SEPARATOR}\\s*\\n`, "u"));
  return {
    queryText: (parts[0] ?? "").trim(),
    referenceText: parts.length > 1 ? parts.slice(1).join(`\n${SPLIT_SEPARATOR}\n`).trim() : ""
  };
}

function nonCommentLines(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("track ") && !line.startsWith("browser "));
}

function detectIntervalFormat(text) {
  const lines = nonCommentLines(text);
  if (lines.some((line) => line.startsWith("##fileformat=VCF")) || lines.some((line) => line.startsWith("#CHROM"))) {
    return "vcf";
  }
  const firstDataLine = lines.find((line) => !line.startsWith("#"));
  if (!firstDataLine) return "bed";
  const columns = firstDataLine.split("\t");
  if (columns.length >= 9) {
    if (/gene_id\s+"|transcript_id\s+"/u.test(columns[8])) return "gtf";
    return "gff";
  }
  return "bed";
}

function parseAttributes(text, format) {
  const attributes = {};
  const source = String(text ?? "").trim();
  if (format === "gtf" || /;\s*\w+\s+"/u.test(source)) {
    for (const match of source.matchAll(/([A-Za-z0-9_.:-]+)\s+"([^"]*)"/gu)) {
      attributes[match[1]] = match[2];
    }
    return attributes;
  }
  for (const field of source.split(";")) {
    const [rawKey, ...rest] = field.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    attributes[key] = decodeURIComponent(rest.join("=").trim());
  }
  return attributes;
}

function bestFeatureName(attributes, fallback) {
  return attributes.Name || attributes.ID || attributes.gene_name || attributes.gene_id || attributes.transcript_id || fallback;
}

function parseInfoAttributes(infoText) {
  const values = {};
  for (const field of String(infoText ?? "").split(";")) {
    if (!field) continue;
    const [key, ...rest] = field.split("=");
    values[key] = rest.length > 0 ? rest.join("=") : true;
  }
  return values;
}

function makeInterval({
  record,
  start,
  end,
  name,
  sourceSet,
  sourceFormat,
  sourceType = "",
  strand = ".",
  attributes = {},
  raw = "",
  index
}) {
  return {
    id: `${sourceSet}_${index}`,
    record: String(record ?? "").trim(),
    start,
    end,
    name: String(name ?? `${sourceSet}_${index + 1}`).trim() || `${sourceSet}_${index + 1}`,
    sourceSet,
    sourceFormat,
    sourceType,
    strand: strand === "+" || strand === "-" ? strand : ".",
    attributes,
    raw,
    length: Math.max(0, end - start + 1)
  };
}

function parseBed(text, sourceSet, warnings, maxIntervals) {
  const intervals = [];
  let skipped = 0;
  for (const [lineIndex, line] of nonCommentLines(text).entries()) {
    if (line.startsWith("#")) continue;
    const columns = line.split("\t");
    if (columns.length < 3) {
      skipped += 1;
      continue;
    }
    const start0 = Number.parseInt(columns[1], 10);
    const end0 = Number.parseInt(columns[2], 10);
    if (!columns[0] || !Number.isFinite(start0) || !Number.isFinite(end0) || start0 < 0 || end0 <= start0) {
      skipped += 1;
      continue;
    }
    intervals.push(makeInterval({
      record: columns[0],
      start: start0 + 1,
      end: end0,
      name: columns[3] || `${sourceSet}_bed_${lineIndex + 1}`,
      sourceSet,
      sourceFormat: "bed",
      sourceType: "BED interval",
      strand: columns[5] || ".",
      raw: line,
      index: intervals.length
    }));
    if (intervals.length >= maxIntervals) {
      warnings.push(`Only the first ${maxIntervals.toLocaleString()} ${sourceSet} interval(s) were parsed.`);
      break;
    }
  }
  if (skipped > 0) {
    warnings.push(`${sourceSet}: skipped ${skipped.toLocaleString()} invalid BED row(s).`);
  }
  return intervals;
}

function parseGffLike(text, sourceSet, format, warnings, maxIntervals) {
  const intervals = [];
  let skipped = 0;
  for (const line of nonCommentLines(text)) {
    if (line.startsWith("#")) continue;
    const columns = line.split("\t");
    if (columns.length < 9) {
      skipped += 1;
      continue;
    }
    const start = Number.parseInt(columns[3], 10);
    const end = Number.parseInt(columns[4], 10);
    if (!columns[0] || !Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
      skipped += 1;
      continue;
    }
    const attributes = parseAttributes(columns[8], format);
    const fallback = `${columns[2] || "feature"}_${intervals.length + 1}`;
    intervals.push(makeInterval({
      record: columns[0],
      start,
      end,
      name: bestFeatureName(attributes, fallback),
      sourceSet,
      sourceFormat: format,
      sourceType: columns[2] || "feature",
      strand: columns[6],
      attributes,
      raw: line,
      index: intervals.length
    }));
    if (intervals.length >= maxIntervals) {
      warnings.push(`Only the first ${maxIntervals.toLocaleString()} ${sourceSet} feature(s) were parsed.`);
      break;
    }
  }
  if (skipped > 0) {
    warnings.push(`${sourceSet}: skipped ${skipped.toLocaleString()} invalid ${format.toUpperCase()} row(s).`);
  }
  return intervals;
}

function parseVcf(text, sourceSet, warnings, maxIntervals) {
  const intervals = [];
  let skipped = 0;
  for (const line of nonCommentLines(text)) {
    if (line.startsWith("#")) continue;
    const columns = line.split("\t");
    if (columns.length < 5) {
      skipped += 1;
      continue;
    }
    const pos = Number.parseInt(columns[1], 10);
    if (!columns[0] || !Number.isFinite(pos) || pos < 1) {
      skipped += 1;
      continue;
    }
    const info = parseInfoAttributes(columns[7] || "");
    const ref = columns[3] && columns[3] !== "." ? columns[3] : "N";
    const inferredEnd = pos + Math.max(1, ref.length) - 1;
    const end = Number.isFinite(Number(info.END)) ? Number.parseInt(info.END, 10) : inferredEnd;
    intervals.push(makeInterval({
      record: columns[0],
      start: pos,
      end: Math.max(pos, end),
      name: columns[2] && columns[2] !== "." ? columns[2] : `${columns[3]}>${columns[4]}`,
      sourceSet,
      sourceFormat: "vcf",
      sourceType: "variant",
      strand: ".",
      attributes: info,
      raw: line,
      index: intervals.length
    }));
    if (intervals.length >= maxIntervals) {
      warnings.push(`Only the first ${maxIntervals.toLocaleString()} ${sourceSet} variant(s) were parsed.`);
      break;
    }
  }
  if (skipped > 0) {
    warnings.push(`${sourceSet}: skipped ${skipped.toLocaleString()} invalid VCF variant row(s).`);
  }
  return intervals;
}

export function parseIntervalSet(text, requestedFormat, sourceSet, maxIntervals = 100000) {
  const warnings = [];
  const format = requestedFormat === "auto" ? detectIntervalFormat(text) : requestedFormat;
  let intervals = [];
  if (format === "bed") intervals = parseBed(text, sourceSet, warnings, maxIntervals);
  if (format === "gff" || format === "gtf") intervals = parseGffLike(text, sourceSet, format, warnings, maxIntervals);
  if (format === "vcf") intervals = parseVcf(text, sourceSet, warnings, maxIntervals);
  if (intervals.length === 0) {
    warnings.push(`${sourceSet}: no ${format.toUpperCase()} intervals were parsed.`);
  }
  return { format, intervals, warnings };
}

export function parseGenomicIntervalInput(input, options = {}) {
  const normalized = normalizeGenomicIntervalOptions(options);
  const text = String(input ?? "");
  if (text.length > normalized.maxInputCharacters) {
    throw new Error(`Input contains ${text.length.toLocaleString()} characters, which exceeds the current limit of ${normalized.maxInputCharacters.toLocaleString()} characters.`);
  }
  const { queryText, referenceText } = splitInput(text);
  if (!queryText) {
    throw new Error("BED/GFF/VCF Interval Operations requires intervals to analyze before the separator.");
  }
  if (normalized.operation !== "merge" && !referenceText) {
    throw new Error("This interval operation requires reference intervals after the separator.");
  }

  const query = parseIntervalSet(queryText, normalized.queryFormat, "query", normalized.maxQueryIntervals);
  const reference = referenceText
    ? parseIntervalSet(referenceText, normalized.referenceFormat, "reference", normalized.maxReferenceIntervals)
    : { format: normalized.referenceFormat, intervals: [], warnings: [] };
  if (query.intervals.length === 0) {
    throw new Error("No query intervals could be parsed.");
  }
  if (normalized.operation !== "merge" && reference.intervals.length === 0) {
    throw new Error("No reference intervals could be parsed.");
  }

  return {
    query,
    reference,
    options: normalized,
    warnings: [...query.warnings, ...reference.warnings]
  };
}

function intervalOverlapBp(left, right) {
  if (left.record !== right.record) return 0;
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start) + 1);
}

function intervalDistanceBp(left, right) {
  if (left.record !== right.record) return Number.POSITIVE_INFINITY;
  const overlap = intervalOverlapBp(left, right);
  if (overlap > 0) return 0;
  if (left.end < right.start) return right.start - left.end;
  return left.start - right.end;
}

function passesOverlap(query, reference, overlap, options) {
  if (overlap < options.minOverlapBp) return false;
  if (options.minReciprocalOverlapPercent <= 0) return true;
  const threshold = options.minReciprocalOverlapPercent / 100;
  return overlap / query.length >= threshold && overlap / reference.length >= threshold;
}

function makeOperationRow(interval, operation, partner = null, details = {}) {
  return {
    record: interval.record,
    start: interval.start,
    end: interval.end,
    name: interval.name,
    source_set: interval.sourceSet,
    operation,
    partner_record: partner?.record ?? "",
    partner_start: partner?.start ?? "",
    partner_end: partner?.end ?? "",
    partner_name: partner?.name ?? "",
    overlap_bp: details.overlapBp ?? "",
    distance_bp: details.distanceBp ?? "",
    strand: interval.strand,
    notes: details.notes ?? ""
  };
}

function limitRows(rows, options, warnings) {
  if (rows.length <= options.maxOutputRows) return rows;
  warnings.push(`Only the first ${options.maxOutputRows.toLocaleString()} output row(s) were retained.`);
  return rows.slice(0, options.maxOutputRows);
}

function sortIntervals(intervals) {
  return [...intervals].sort((left, right) =>
    left.record.localeCompare(right.record) ||
    left.start - right.start ||
    left.end - right.end ||
    left.name.localeCompare(right.name)
  );
}

function runFallbackIntervals(queryIntervals, referenceIntervals, options, warnings) {
  if (options.operation === "intersect") {
    const rows = [];
    for (const query of queryIntervals) {
      for (const reference of referenceIntervals) {
        const overlapBp = intervalOverlapBp(query, reference);
        if (passesOverlap(query, reference, overlapBp, options)) {
          rows.push(makeOperationRow(query, "intersect", reference, { overlapBp }));
        }
      }
    }
    return limitRows(rows, options, warnings);
  }

  if (options.operation === "nearest") {
    const rows = [];
    for (const query of queryIntervals) {
      let best = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const reference of referenceIntervals) {
        const distance = intervalDistanceBp(query, reference);
        if (distance < bestDistance) {
          best = reference;
          bestDistance = distance;
        }
      }
      if (best) {
        rows.push(makeOperationRow(query, "nearest", best, {
          overlapBp: intervalOverlapBp(query, best),
          distanceBp: bestDistance
        }));
      }
    }
    return limitRows(rows, options, warnings);
  }

  if (options.operation === "subtract") {
    const rows = [];
    for (const query of queryIntervals) {
      let fragments = [{ start: query.start, end: query.end }];
      for (const reference of referenceIntervals.filter((item) => item.record === query.record)) {
        fragments = fragments.flatMap((fragment) => {
          const overlapStart = Math.max(fragment.start, reference.start);
          const overlapEnd = Math.min(fragment.end, reference.end);
          if (overlapEnd < overlapStart) return [fragment];
          const pieces = [];
          if (fragment.start < overlapStart) pieces.push({ start: fragment.start, end: overlapStart - 1 });
          if (overlapEnd < fragment.end) pieces.push({ start: overlapEnd + 1, end: fragment.end });
          return pieces;
        });
      }
      for (const fragment of fragments) {
        rows.push(makeOperationRow({ ...query, start: fragment.start, end: fragment.end, length: fragment.end - fragment.start + 1 }, "subtract", null, {
          notes: "Query segment remaining after subtracting reference intervals"
        }));
      }
    }
    return limitRows(rows, options, warnings);
  }

  const rows = [];
  for (const interval of sortIntervals(queryIntervals)) {
    const previous = rows[rows.length - 1];
    if (
      previous &&
      previous.record === interval.record &&
      Number(previous.end) + options.mergeGapBp + 1 >= interval.start
    ) {
      previous.end = Math.max(Number(previous.end), interval.end);
      previous.name = Array.from(new Set(String(previous.name).split(",").concat(interval.name))).join(",");
      previous.notes = "Merged query intervals";
    } else {
      rows.push(makeOperationRow(interval, "merge", null, { notes: "Merged query intervals" }));
    }
  }
  return limitRows(rows, options, warnings);
}

function nextRunId() {
  runCounter += 1;
  return `sms3_intervals_${Date.now()}_${runCounter}`;
}

async function getBioWasmBedtoolsCli() {
  if (!bedtoolsCliPromise) {
    bedtoolsCliPromise = createBioWasmCli({
      tool: "bedtools",
      program: "bedtools",
      version: BEDTOOLS_VERSION,
      assetPath: "../vendor/biowasm/bedtools/2.31.0"
    });
  }
  return bedtoolsCliPromise;
}

function intervalToBedLine(interval) {
  return [
    interval.record,
    String(interval.start - 1),
    String(interval.end),
    interval.id,
    "0",
    interval.strand === "+" || interval.strand === "-" ? interval.strand : "."
  ].join("\t");
}

function makeBedText(intervals) {
  return `${sortIntervals(intervals).map(intervalToBedLine).join("\n")}\n`;
}

function bedtoolsArgsForOperation(options, queryPath, referencePath) {
  if (options.operation === "intersect") {
    return ["intersect", "-a", queryPath, "-b", referencePath, "-wa", "-wb"];
  }
  if (options.operation === "subtract") {
    return ["subtract", "-a", queryPath, "-b", referencePath];
  }
  if (options.operation === "nearest") {
    return ["closest", "-a", queryPath, "-b", referencePath, "-d", "-t", "first"];
  }
  return ["merge", "-i", queryPath, "-d", String(options.mergeGapBp), "-c", "4,6", "-o", "distinct,distinct"];
}

function parseBedtoolsRows(stdout, queryMap, referenceMap, operation, options) {
  const rows = [];
  for (const line of String(stdout ?? "").trim().split("\n")) {
    if (!line) continue;
    const fields = line.split("\t");
    if (operation === "intersect" && fields.length >= 12) {
      const query = queryMap.get(fields[3]);
      const reference = referenceMap.get(fields[9]);
      if (query && reference) {
        const overlapBp = intervalOverlapBp(query, reference);
        if (passesOverlap(query, reference, overlapBp, options)) {
          rows.push(makeOperationRow(query, "intersect", reference, { overlapBp }));
        }
      }
    } else if (operation === "nearest" && fields.length >= 13) {
      const query = queryMap.get(fields[3]);
      const reference = referenceMap.get(fields[9]);
      if (query && reference) {
        rows.push(makeOperationRow(query, "nearest", reference, {
          overlapBp: intervalOverlapBp(query, reference),
          distanceBp: fields[12]
        }));
      }
    } else if (operation === "subtract" && fields.length >= 6) {
      const query = queryMap.get(fields[3]);
      if (query) {
        rows.push(makeOperationRow({
          ...query,
          start: Number.parseInt(fields[1], 10) + 1,
          end: Number.parseInt(fields[2], 10)
        }, "subtract", null, { notes: "Query segment remaining after subtracting reference intervals" }));
      }
    } else if (operation === "merge" && fields.length >= 5) {
      const ids = fields[3].split(",");
      const first = queryMap.get(ids[0]);
      rows.push(makeOperationRow({
        ...(first ?? {}),
        record: fields[0],
        start: Number.parseInt(fields[1], 10) + 1,
        end: Number.parseInt(fields[2], 10),
        name: ids.map((id) => queryMap.get(id)?.name ?? id).join(","),
        sourceSet: "query",
        strand: fields[4] || "."
      }, "merge", null, { notes: "Merged query intervals" }));
    }
  }
  return rows;
}

function bedtoolsError(stderr) {
  const message = String(stderr ?? "").trim();
  if (!message) return "";
  if (/error|failed|fail to|could not|not found|no such file|invalid|unable/i.test(message)) {
    return message;
  }
  return "";
}

async function runBedtoolsIntervals(queryIntervals, referenceIntervals, options, context = {}) {
  requireBioWasmRuntime("bedtools interval operations");
  const cli = await getBioWasmBedtoolsCli();
  const runId = nextRunId();
  const queryName = `${runId}_query.bed`;
  const referenceName = `${runId}_reference.bed`;
  const files = [{ name: queryName, data: new Blob([makeBedText(queryIntervals)], { type: "text/plain" }) }];
  if (options.operation !== "merge") {
    files.push({ name: referenceName, data: new Blob([makeBedText(referenceIntervals)], { type: "text/plain" }) });
  }
  context.reportProgress?.({ phase: "mounting-bedtools-input", progress: 0.25 });
  const mountedPaths = await cli.mount(files);
  const queryPath = mountedPaths[0];
  const referencePath = mountedPaths[1];
  context.throwIfCancelled?.();
  const args = bedtoolsArgsForOperation(options, queryPath, referencePath);
  context.reportProgress?.({ phase: "running-bedtools", progress: 0.55 });
  const result = await cli.exec("bedtools", args);
  context.throwIfCancelled?.();
  const error = bedtoolsError(result?.stderr);
  if (error) {
    throw new Error(`bedtools reported an error: ${error}`);
  }
  const queryMap = new Map(queryIntervals.map((interval) => [interval.id, interval]));
  const referenceMap = new Map(referenceIntervals.map((interval) => [interval.id, interval]));
  return {
    rows: parseBedtoolsRows(result?.stdout, queryMap, referenceMap, options.operation, options),
    command: `bedtools ${args.map((arg) => (arg === queryPath ? "query.bed" : arg === referencePath ? "reference.bed" : arg)).join(" ")}`,
    stdout: result?.stdout ?? "",
    stderr: result?.stderr ?? ""
  };
}

function makeIntervalTable(rows) {
  return exportDelimitedTable(genomicIntervalOperationColumns, rows);
}

function makeBedOutput(rows) {
  return rows.map((row) => [
    row.record,
    Number(row.start) - 1,
    row.end,
    row.name || ".",
    0,
    row.strand || "."
  ].join("\t")).join("\n") + (rows.length ? "\n" : "");
}

function makeReport({ query, reference, rows, options, warnings, engine, command }) {
  const lines = [
    "BED/GFF/VCF Interval Operations report",
    "",
    `Operation: ${options.operation}`,
    `Engine: ${engine}`,
    ...(command ? [`Command: ${command}`] : []),
    `Query intervals: ${query.intervals.length.toLocaleString()} (${query.format.toUpperCase()})`,
    `Reference intervals: ${reference.intervals.length.toLocaleString()} (${reference.format.toUpperCase()})`,
    `Output rows: ${rows.length.toLocaleString()}`,
    "",
    "Coordinate conventions:",
    "Input BED rows are interpreted as 0-based half-open intervals. SMS3 table/report output uses 1-based inclusive coordinates. GFF/GTF and VCF input coordinates are interpreted as 1-based.",
    "",
    warnings.length ? `Warnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}` : "Warnings: none reported."
  ];
  return lines.join("\n");
}

export async function runGenomicIntervalOperationsCore(input, options = {}, context = {}) {
  const parsed = parseGenomicIntervalInput(input, options);
  const warnings = [...parsed.warnings];
  let rows;
  let engine = "sms3";
  let command = "";

  if (parsed.options.intervalEngine === "bedtools") {
    const bedtoolsResult = await runBedtoolsIntervals(parsed.query.intervals, parsed.reference.intervals, parsed.options, context);
    rows = limitRows(bedtoolsResult.rows, parsed.options, warnings);
    engine = `bedtools ${BEDTOOLS_VERSION}`;
    command = bedtoolsResult.command;
  } else {
    rows = runFallbackIntervals(parsed.query.intervals, parsed.reference.intervals, parsed.options, warnings);
  }

  const table = makeIntervalTable(rows);
  const bed = makeBedOutput(rows);
  const report = makeReport({
    query: parsed.query,
    reference: parsed.reference,
    rows,
    options: parsed.options,
    warnings,
    engine,
    command
  });

  return {
    ...parsed,
    rows,
    table,
    bed,
    report,
    warnings,
    engine,
    command,
    recordsProcessed: parsed.query.intervals.length + parsed.reference.intervals.length
  };
}
