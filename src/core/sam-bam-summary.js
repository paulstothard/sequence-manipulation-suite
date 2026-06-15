import { streamTextLines } from "./compressed-text-reader.js";

export const samAlignmentColumns = [
  { id: "qname", label: "Read name" },
  { id: "flag", label: "FLAG" },
  { id: "reference", label: "Reference" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "strand", label: "Strand" },
  { id: "mapq", label: "MAPQ" },
  { id: "cigar", label: "CIGAR" },
  { id: "read_length", label: "Read length" },
  { id: "reference_span", label: "Reference span" },
  { id: "template_length", label: "Template length" },
  { id: "read_group", label: "Read group" },
  { id: "sample", label: "Sample" },
  { id: "status", label: "Status" }
];

export const samReferenceColumns = [
  { id: "reference", label: "Reference" },
  { id: "length", label: "Length" },
  { id: "alignments", label: "Alignments" },
  { id: "mapped_alignments", label: "Mapped alignments" },
  { id: "mean_mapq", label: "Mean MAPQ" },
  { id: "covered_min", label: "Covered min" },
  { id: "covered_max", label: "Covered max" }
];

export const samFlagColumns = [
  { id: "flag", label: "Flag" },
  { id: "label", label: "Meaning" },
  { id: "count", label: "Count" },
  { id: "percent", label: "Percent" }
];

export const samCoverageColumns = [
  { id: "reference", label: "Reference" },
  { id: "scope", label: "Scope" },
  { id: "scope_start", label: "Scope start" },
  { id: "scope_end", label: "Scope end" },
  { id: "scope_length", label: "Scope length" },
  { id: "mapped_alignments", label: "Mapped alignments" },
  { id: "covered_bases", label: "Covered bases" },
  { id: "breadth_percent", label: "Breadth %" },
  { id: "mean_depth", label: "Mean depth" },
  { id: "max_depth", label: "Max depth" },
  { id: "total_depth", label: "Total depth" },
  { id: "zero_coverage_region_count", label: "Zero-coverage regions" },
  { id: "largest_zero_coverage_region", label: "Largest zero-coverage region" },
  { id: "zero_coverage_regions", label: "Zero-coverage region examples" }
];

const FLAG_DEFINITIONS = [
  [0x1, "paired"],
  [0x2, "proper pair"],
  [0x4, "read unmapped"],
  [0x8, "mate unmapped"],
  [0x10, "reverse strand"],
  [0x20, "mate reverse strand"],
  [0x40, "first in pair"],
  [0x80, "second in pair"],
  [0x100, "secondary alignment"],
  [0x200, "QC fail"],
  [0x400, "duplicate"],
  [0x800, "supplementary alignment"]
];

const OUTPUT_ROW_LIMIT = 10000;
const ZERO_COVERAGE_EXAMPLE_LIMIT = 8;

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Number.isInteger(number) ? String(number) : number.toFixed(digits);
}

function parseHeaderFields(fields) {
  const parsed = {};
  for (const field of fields) {
    const match = /^([^:\t]+):(.+)$/.exec(field);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  return parsed;
}

function parseOptionalFields(fields) {
  const parsed = {};
  for (const field of fields) {
    const match = /^([A-Za-z][A-Za-z0-9]):[AifZHB]:([\s\S]*)$/.exec(field);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  return parsed;
}

export function parseSamCigar(cigar) {
  if (!cigar || cigar === "*") {
    return {
      referenceSpan: 0,
      queryLength: 0,
      valid: true
    };
  }
  let referenceSpan = 0;
  let queryLength = 0;
  let consumed = "";
  const regex = /(\d+)([MIDNSHP=X])/g;
  let match = regex.exec(cigar);
  while (match) {
    const length = Number.parseInt(match[1], 10);
    const op = match[2];
    consumed += match[0];
    if ("MDN=X".includes(op)) referenceSpan += length;
    if ("MIS=X".includes(op)) queryLength += length;
    match = regex.exec(cigar);
  }
  return {
    referenceSpan,
    queryLength,
    valid: consumed.length === cigar.length
  };
}

function parseSamCigarOperations(cigar) {
  if (!cigar || cigar === "*") return [];
  const operations = [];
  const regex = /(\d+)([MIDNSHP=X])/g;
  let match = regex.exec(cigar);
  while (match) {
    operations.push({
      length: Number.parseInt(match[1], 10),
      op: match[2]
    });
    match = regex.exec(cigar);
  }
  return operations;
}

function describeFlag(flag) {
  const labels = FLAG_DEFINITIONS
    .filter(([bit]) => (flag & bit) !== 0)
    .map(([, label]) => label);
  return labels.length > 0 ? labels.join("; ") : "primary mapped/unpaired";
}

function ensureReference(referenceMap, name, length = "") {
  if (!name || name === "*") return null;
  if (!referenceMap.has(name)) {
    referenceMap.set(name, {
      reference: name,
      length: length ? parseInteger(length) : "",
      alignments: 0,
      mapped_alignments: 0,
      mapqSum: 0,
      covered_min: "",
      covered_max: ""
    });
  } else if (length && !referenceMap.get(name).length) {
    referenceMap.get(name).length = parseInteger(length);
  }
  return referenceMap.get(name);
}

function updateReferenceStats(referenceStats, row) {
  const stats = ensureReference(referenceStats, row.reference);
  if (!stats) return;
  stats.alignments += 1;
  if (row.status.includes("unmapped")) return;
  stats.mapped_alignments += 1;
  stats.mapqSum += Number(row.mapq) || 0;
  stats.covered_min = stats.covered_min === "" ? row.start : Math.min(stats.covered_min, row.start);
  stats.covered_max = stats.covered_max === "" ? row.end : Math.max(stats.covered_max, row.end);
}

function ensureCoverageStats(coverageStats, reference) {
  if (!reference || reference === "*") return null;
  if (!coverageStats.has(reference)) {
    coverageStats.set(reference, {
      reference,
      mappedAlignments: 0,
      minCovered: "",
      maxCovered: "",
      events: new Map()
    });
  }
  return coverageStats.get(reference);
}

function addCoverageEvent(events, position, delta) {
  events.set(position, (events.get(position) ?? 0) + delta);
}

function updateCoverageStats(coverageStats, row) {
  if (!row || row.status.includes("unmapped") || !row.reference || row.reference === "*") return;
  const stats = ensureCoverageStats(coverageStats, row.reference);
  if (!stats) return;
  stats.mappedAlignments += 1;
  let referencePosition = Number(row.start);
  for (const { length, op } of parseSamCigarOperations(row.cigar)) {
    if (!Number.isFinite(referencePosition) || !Number.isFinite(length) || length <= 0) {
      continue;
    }
    if (op === "M" || op === "=" || op === "X") {
      const start = referencePosition;
      const end = referencePosition + length - 1;
      addCoverageEvent(stats.events, start, 1);
      addCoverageEvent(stats.events, end + 1, -1);
      stats.minCovered = stats.minCovered === "" ? start : Math.min(stats.minCovered, start);
      stats.maxCovered = stats.maxCovered === "" ? end : Math.max(stats.maxCovered, end);
      referencePosition += length;
    } else if (op === "D" || op === "N") {
      referencePosition += length;
    }
  }
}

function overlapsRegion(row, region) {
  if (!row || row.status.includes("unmapped")) return false;
  if (region.reference && row.reference !== region.reference) return false;
  if (region.start && row.end < region.start) return false;
  if (region.end && row.start > region.end) return false;
  return true;
}

function chooseRegion(rows, options) {
  const requestedReference = String(options.chromosome ?? "").trim();
  const firstMapped = rows.find((row) => !row.status.includes("unmapped"));
  const reference = requestedReference || firstMapped?.reference || "";
  const sameReference = rows.filter((row) => !row.status.includes("unmapped") && (!reference || row.reference === reference));
  const requestedStart = parseInteger(options.regionStart, 0);
  const requestedEnd = parseInteger(options.regionEnd, 0);
  const minStart = Math.min(...sameReference.map((row) => row.start).filter(Number.isFinite));
  const maxEnd = Math.max(...sameReference.map((row) => row.end).filter(Number.isFinite));
  const start = requestedStart > 0 ? requestedStart : (Number.isFinite(minStart) ? minStart : 1);
  const end = requestedEnd > 0 ? Math.max(requestedEnd, start) : (Number.isFinite(maxEnd) ? maxEnd : start);
  return { reference, start, end };
}

function chooseRegionFromStats(referenceStats, firstMappedReference, options) {
  const requestedReference = String(options.chromosome ?? "").trim();
  const reference = requestedReference || firstMappedReference || [...referenceStats.keys()][0] || "";
  const stats = referenceStats.get(reference);
  const requestedStart = parseInteger(options.regionStart, 0);
  const requestedEnd = parseInteger(options.regionEnd, 0);
  const start = requestedStart > 0
    ? requestedStart
    : (Number.isFinite(Number(stats?.covered_min)) ? Number(stats.covered_min) : 1);
  const end = requestedEnd > 0
    ? Math.max(requestedEnd, start)
    : (Number.isFinite(Number(stats?.covered_max)) ? Number(stats.covered_max) : start);
  return { reference, start, end };
}

function shouldKeepForRegionOutput(row, firstMappedReference, options) {
  if (!row || row.status.includes("unmapped")) return false;
  const requestedReference = String(options.chromosome ?? "").trim();
  const reference = requestedReference || firstMappedReference || row.reference;
  if (reference && row.reference !== reference) return false;
  const requestedStart = parseInteger(options.regionStart, 0);
  const requestedEnd = parseInteger(options.regionEnd, 0);
  const start = requestedStart > 0 ? requestedStart : 0;
  const end = requestedEnd > 0 ? Math.max(requestedEnd, start || 1) : 0;
  if (start && Number(row.end) < start) return false;
  if (end && Number(row.start) > end) return false;
  return true;
}

function addSamInputWarnings(warnings, {
  headerLines,
  alignmentLines,
  referenceStats,
  options
}) {
  if (headerLines === 0 && alignmentLines > 0) {
    warnings.push("SAM file has no header; reference lengths, sort order, and read-group sample names may be unavailable.");
  }
  const requestedReference = String(options.chromosome ?? "").trim();
  if (requestedReference && referenceStats.size > 0 && !referenceStats.has(requestedReference)) {
    const examples = [...referenceStats.keys()].slice(0, 6).join(", ");
    warnings.push(`Region reference "${requestedReference}" was not found in the SAM header or mapped alignments. Available references include: ${examples}.`);
  }
  const stats = referenceStats.get(requestedReference);
  const requestedStart = parseInteger(options.regionStart, 0);
  const requestedEnd = parseInteger(options.regionEnd, 0);
  if (stats?.length) {
    if (requestedStart > stats.length) {
      warnings.push(`Region start ${requestedStart.toLocaleString()} is beyond ${requestedReference} length ${Number(stats.length).toLocaleString()}.`);
    } else if (requestedEnd > stats.length) {
      warnings.push(`Region end ${requestedEnd.toLocaleString()} is beyond ${requestedReference} length ${Number(stats.length).toLocaleString()}.`);
    }
  }
}

function formatCoverageInterval(start, end) {
  return Number(start) === Number(end) ? String(start) : `${start}-${end}`;
}

function summarizeCoverageEvents(events, scopeStart, scopeEnd) {
  const start = Number(scopeStart);
  const end = Number(scopeEnd);
  const sortedEvents = [...events.entries()]
    .filter(([position]) => Number.isFinite(Number(position)))
    .sort(([left], [right]) => left - right);
  let depth = 0;
  let previous = start;
  let coveredBases = 0;
  let totalDepth = 0;
  let maxDepth = 0;
  let zeroCoverageRegionCount = 0;
  let largestZeroCoverageRegion = 0;
  const zeroCoverageExamples = [];

  const addInterval = (intervalStart, intervalEnd, intervalDepth) => {
    if (intervalEnd < intervalStart) return;
    const length = intervalEnd - intervalStart + 1;
    if (intervalDepth > 0) {
      coveredBases += length;
      totalDepth += length * intervalDepth;
      maxDepth = Math.max(maxDepth, intervalDepth);
      return;
    }
    zeroCoverageRegionCount += 1;
    largestZeroCoverageRegion = Math.max(largestZeroCoverageRegion, length);
    if (zeroCoverageExamples.length < ZERO_COVERAGE_EXAMPLE_LIMIT) {
      zeroCoverageExamples.push(formatCoverageInterval(intervalStart, intervalEnd));
    }
  };

  for (const [position, delta] of sortedEvents) {
    if (position <= start) {
      depth += delta;
      continue;
    }
    if (position > end + 1) {
      break;
    }
    addInterval(previous, Math.min(position - 1, end), depth);
    depth += delta;
    previous = position;
  }
  addInterval(previous, end, depth);

  return {
    coveredBases,
    totalDepth,
    maxDepth,
    zeroCoverageRegionCount,
    largestZeroCoverageRegion,
    zeroCoverageExamples
  };
}

function chooseCoverageScope(reference, coverageStats, referenceStats, options = {}) {
  const requestedReference = String(options.chromosome ?? "").trim();
  const requestedStart = parseInteger(options.regionStart, 0);
  const requestedEnd = parseInteger(options.regionEnd, 0);
  const isIndexedRegion = options.dataSourceMode === "indexed-bam" && requestedReference === reference;
  if (isIndexedRegion && requestedStart > 0 && requestedEnd > 0) {
    return {
      scope: "selected region",
      start: requestedStart,
      end: Math.max(requestedEnd, requestedStart),
      lengthSource: "requested region"
    };
  }
  if (referenceStats?.length) {
    return {
      scope: "reference length",
      start: 1,
      end: Number(referenceStats.length),
      lengthSource: "SAM @SQ LN"
    };
  }
  if (coverageStats?.minCovered !== "" && coverageStats?.maxCovered !== "") {
    return {
      scope: "observed span",
      start: Number(coverageStats.minCovered),
      end: Number(coverageStats.maxCovered),
      lengthSource: "observed coverage span"
    };
  }
  if (isIndexedRegion && requestedStart > 0) {
    return {
      scope: "selected region",
      start: requestedStart,
      end: Math.max(requestedEnd || requestedStart, requestedStart),
      lengthSource: "requested region"
    };
  }
  return null;
}

function buildCoverageRows(coverageStats, referenceStats, options = {}, warnings = []) {
  const referenceNames = new Set();
  const requestedReference = String(options.chromosome ?? "").trim();
  if (options.dataSourceMode === "indexed-bam" && requestedReference) {
    referenceNames.add(requestedReference);
  } else {
    for (const reference of referenceStats.keys()) referenceNames.add(reference);
    for (const reference of coverageStats.keys()) referenceNames.add(reference);
  }

  let usedObservedSpan = false;
  const rows = [];
  for (const reference of referenceNames) {
    const coverage = coverageStats.get(reference);
    const referenceRow = referenceStats.get(reference);
    const scope = chooseCoverageScope(reference, coverage, referenceRow, options);
    if (!scope) continue;
    if (scope.lengthSource === "observed coverage span") usedObservedSpan = true;
    const scopeLength = Math.max(0, scope.end - scope.start + 1);
    const summary = scopeLength > 0
      ? summarizeCoverageEvents(coverage?.events ?? new Map(), scope.start, scope.end)
      : {
          coveredBases: 0,
          totalDepth: 0,
          maxDepth: 0,
          zeroCoverageRegionCount: 0,
          largestZeroCoverageRegion: 0,
          zeroCoverageExamples: []
        };
    const breadth = scopeLength > 0 ? (summary.coveredBases / scopeLength) * 100 : 0;
    const meanDepth = scopeLength > 0 ? summary.totalDepth / scopeLength : 0;
    rows.push({
      reference,
      scope: scope.scope,
      scope_start: scope.start,
      scope_end: scope.end,
      scope_length: scopeLength,
      mapped_alignments: coverage?.mappedAlignments ?? referenceRow?.mapped_alignments ?? 0,
      covered_bases: summary.coveredBases,
      breadth_percent: formatNumber(breadth),
      mean_depth: formatNumber(meanDepth),
      max_depth: summary.maxDepth,
      total_depth: summary.totalDepth,
      zero_coverage_region_count: summary.zeroCoverageRegionCount,
      largest_zero_coverage_region: summary.largestZeroCoverageRegion,
      zero_coverage_regions: summary.zeroCoverageExamples.length >= ZERO_COVERAGE_EXAMPLE_LIMIT && summary.zeroCoverageRegionCount > ZERO_COVERAGE_EXAMPLE_LIMIT
        ? `${summary.zeroCoverageExamples.join("; ")}; ...`
        : summary.zeroCoverageExamples.join("; ")
    });
  }

  if (usedObservedSpan) {
    warnings.push("Reference lengths were unavailable for at least one reference; coverage breadth was calculated over the observed covered span for those rows.");
  }
  return rows;
}

export function analyzeSam(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const text = String(input ?? "");
  const warnings = [];
  if (!text.trim()) {
    return makeEmptySamResult(["No SAM text was supplied."]);
  }
  if (text.startsWith("BAM\u0001")) {
    return makeEmptySamResult([
      "Binary BAM cannot be pasted into the text area. Choose Indexed BAM region file mode, then provide a BAM file and matching BAI/CSI index so SMS3 can query the requested region."
    ]);
  }

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const headerCounts = new Map();
  const readGroups = new Map();
  const referenceStats = new Map();
  const coverageStats = new Map();
  const alignments = [];
  const flagCounts = new Map(FLAG_DEFINITIONS.map(([bit]) => [bit, 0]));
  let headerLines = 0;
  let malformed = 0;
  let alignmentLines = 0;
  let mapped = 0;
  let unmapped = 0;
  let truncatedRows = 0;
  let firstMappedReference = "";
  const maxAlignments = Math.min(1000, Math.max(1, parseInteger(options.maxAlignments, 200)));
  const regionRows = [];
  let regionOverlapCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (index % 2000 === 0) {
      context.throwIfCancelled?.();
      context.reportProgress?.({ phase: "parsing-sam", progress: Math.min(0.65, index / Math.max(1, lines.length)) });
    }
    const line = lines[index];
    if (!line.trim()) continue;
    if (line.startsWith("@")) {
      headerLines += 1;
      const fields = line.split("\t");
      const type = fields[0].slice(1);
      headerCounts.set(type, (headerCounts.get(type) ?? 0) + 1);
      const parsedFields = parseHeaderFields(fields.slice(1));
      if (type === "SQ" && parsedFields.SN) {
        ensureReference(referenceStats, parsedFields.SN, parsedFields.LN);
      }
      if (type === "RG" && parsedFields.ID) {
        readGroups.set(parsedFields.ID, parsedFields.SM || "");
      }
      continue;
    }

    const fields = line.split("\t");
    if (fields.length < 11) {
      malformed += 1;
      continue;
    }
    alignmentLines += 1;
    const flag = parseInteger(fields[1], 0);
    const pos = parseInteger(fields[3], 0);
    const mapq = parseInteger(fields[4], 0);
    const tlen = parseInteger(fields[8], 0);
    const cigarInfo = parseSamCigar(fields[5]);
    if (!cigarInfo.valid) {
      warnings.push(`Read ${fields[0]} has a CIGAR string that was not fully parsed: ${fields[5]}.`);
    }
    const optional = parseOptionalFields(fields.slice(11));
    const status = describeFlag(flag);
    const isUnmapped = (flag & 0x4) !== 0 || fields[2] === "*" || pos <= 0;
    const readSequence = fields[9] === "*" ? "" : fields[9];
    const readQuality = fields[10] === "*" ? "" : fields[10];
    const referenceSpan = isUnmapped ? 0 : Math.max(1, cigarInfo.referenceSpan || (readSequence ? readSequence.length : 1));
    const row = {
      qname: fields[0],
      flag,
      reference: fields[2],
      start: isUnmapped ? "" : pos,
      end: isUnmapped ? "" : pos + referenceSpan - 1,
      strand: (flag & 0x10) !== 0 ? "-" : "+",
      mapq,
      cigar: fields[5],
      read_length: readSequence ? readSequence.length : cigarInfo.queryLength,
      read_sequence: readSequence,
      read_quality: readQuality,
      reference_span: referenceSpan,
      template_length: tlen,
      read_group: optional.RG || "",
      sample: optional.RG ? readGroups.get(optional.RG) || "" : "",
      status
    };
    for (const [bit] of FLAG_DEFINITIONS) {
      if ((flag & bit) !== 0) flagCounts.set(bit, (flagCounts.get(bit) ?? 0) + 1);
    }
    if (isUnmapped) {
      unmapped += 1;
    } else {
      mapped += 1;
      if (!firstMappedReference) {
        firstMappedReference = row.reference;
      }
      updateReferenceStats(referenceStats, row);
      updateCoverageStats(coverageStats, row);
      if (shouldKeepForRegionOutput(row, firstMappedReference, options)) {
        regionOverlapCount += 1;
        if (regionRows.length < maxAlignments) {
          regionRows.push(row);
        }
      }
    }
    if (alignments.length < OUTPUT_ROW_LIMIT) {
      alignments.push(row);
    } else {
      truncatedRows += 1;
    }
  }

  if (malformed > 0) {
    warnings.push(`${malformed.toLocaleString()} malformed alignment line(s) were skipped because they had fewer than 11 SAM fields.`);
  }
  if (truncatedRows > 0) {
    warnings.push(`Alignment table materialization was capped at ${OUTPUT_ROW_LIMIT.toLocaleString()} rows; ${truncatedRows.toLocaleString()} additional row(s) were summarized but not retained for output.`);
  }

  const referenceRows = [...referenceStats.values()].map((stats) => ({
    reference: stats.reference,
    length: stats.length,
    alignments: stats.alignments,
    mapped_alignments: stats.mapped_alignments,
    mean_mapq: stats.mapped_alignments > 0 ? formatNumber(stats.mapqSum / stats.mapped_alignments) : "",
    covered_min: stats.covered_min,
    covered_max: stats.covered_max
  }));
  addSamInputWarnings(warnings, {
    headerLines,
    alignmentLines,
    referenceStats,
    options
  });
  const flagRows = FLAG_DEFINITIONS.map(([flag, label]) => ({
    flag,
    label,
    count: flagCounts.get(flag) ?? 0,
    percent: alignmentLines > 0 ? formatNumber(((flagCounts.get(flag) ?? 0) / alignmentLines) * 100) : "0"
  }));
  const coverageRows = buildCoverageRows(coverageStats, referenceStats, options, warnings);
  const region = referenceStats.size > 0
    ? chooseRegionFromStats(referenceStats, firstMappedReference, options)
    : chooseRegion(alignments, options);
  const regionOmitted = Math.max(0, regionOverlapCount - regionRows.length);
  if (regionOmitted > 0) {
    warnings.push(`Region output was capped at ${maxAlignments.toLocaleString()} overlapping alignment(s); ${regionOmitted.toLocaleString()} additional overlapping alignment(s) were summarized but not drawn or emitted in the selected region table.`);
  }
  const report = makeSamReport({
    lineCount: lines.length,
    headerLines,
    headerCounts,
    alignmentLines,
    mapped,
    unmapped,
    referenceRows,
    coverageRows,
    readGroups,
    region,
    regionRows,
    regionOmitted,
    warnings
  });
  return {
    report,
    warnings,
    lineCount: lines.length,
    headerLines,
    alignmentLines,
    mapped,
    unmapped,
    alignments,
    referenceRows,
    coverageRows,
    flagRows,
    region,
    regionRows,
    regionOmitted
  };
}

export async function analyzeSamChunks(chunks, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const warnings = [];
  const headerCounts = new Map();
  const readGroups = new Map();
  const referenceStats = new Map();
  const coverageStats = new Map();
  const alignments = [];
  const flagCounts = new Map(FLAG_DEFINITIONS.map(([bit]) => [bit, 0]));
  let lineCount = 0;
  let headerLines = 0;
  let malformed = 0;
  let alignmentLines = 0;
  let mapped = 0;
  let unmapped = 0;
  let truncatedRows = 0;
  let firstMappedReference = "";
  const maxAlignments = Math.min(1000, Math.max(1, parseInteger(options.maxAlignments, 200)));
  const regionRows = [];
  let regionOverlapCount = 0;
  let firstNonEmptyLine = "";

  for await (const line of streamTextLines(chunks)) {
    lineCount += 1;
    if (lineCount % 2000 === 0) {
      context.throwIfCancelled?.();
      context.reportProgress?.({ phase: "parsing-sam", linesProcessed: lineCount });
      await context.yieldIfNeeded?.();
    }
    if (!line.trim()) continue;
    if (!firstNonEmptyLine) {
      firstNonEmptyLine = line;
      if (firstNonEmptyLine.startsWith("BAM\u0001")) {
        return makeEmptySamResult([
          "Binary BAM cannot be streamed as text. Choose Indexed BAM region file mode, then provide a BAM file and matching BAI/CSI index so SMS3 can query the requested region."
        ]);
      }
    }
    if (line.startsWith("@")) {
      headerLines += 1;
      const fields = line.split("\t");
      const type = fields[0].slice(1);
      headerCounts.set(type, (headerCounts.get(type) ?? 0) + 1);
      const parsedFields = parseHeaderFields(fields.slice(1));
      if (type === "SQ" && parsedFields.SN) {
        ensureReference(referenceStats, parsedFields.SN, parsedFields.LN);
      }
      if (type === "RG" && parsedFields.ID) {
        readGroups.set(parsedFields.ID, parsedFields.SM || "");
      }
      continue;
    }

    const fields = line.split("\t");
    if (fields.length < 11) {
      malformed += 1;
      continue;
    }
    alignmentLines += 1;
    const flag = parseInteger(fields[1], 0);
    const pos = parseInteger(fields[3], 0);
    const mapq = parseInteger(fields[4], 0);
    const tlen = parseInteger(fields[8], 0);
    const cigarInfo = parseSamCigar(fields[5]);
    if (!cigarInfo.valid) {
      warnings.push(`Read ${fields[0]} has a CIGAR string that was not fully parsed: ${fields[5]}.`);
    }
    const optional = parseOptionalFields(fields.slice(11));
    const status = describeFlag(flag);
    const isUnmapped = (flag & 0x4) !== 0 || fields[2] === "*" || pos <= 0;
    const readSequence = fields[9] === "*" ? "" : fields[9];
    const readQuality = fields[10] === "*" ? "" : fields[10];
    const referenceSpan = isUnmapped ? 0 : Math.max(1, cigarInfo.referenceSpan || (readSequence ? readSequence.length : 1));
    const row = {
      qname: fields[0],
      flag,
      reference: fields[2],
      start: isUnmapped ? "" : pos,
      end: isUnmapped ? "" : pos + referenceSpan - 1,
      strand: (flag & 0x10) !== 0 ? "-" : "+",
      mapq,
      cigar: fields[5],
      read_length: readSequence ? readSequence.length : cigarInfo.queryLength,
      read_sequence: readSequence,
      read_quality: readQuality,
      reference_span: referenceSpan,
      template_length: tlen,
      read_group: optional.RG || "",
      sample: optional.RG ? readGroups.get(optional.RG) || "" : "",
      status
    };
    for (const [bit] of FLAG_DEFINITIONS) {
      if ((flag & bit) !== 0) flagCounts.set(bit, (flagCounts.get(bit) ?? 0) + 1);
    }
    if (isUnmapped) {
      unmapped += 1;
    } else {
      mapped += 1;
      if (!firstMappedReference) {
        firstMappedReference = row.reference;
      }
      updateReferenceStats(referenceStats, row);
      updateCoverageStats(coverageStats, row);
      if (shouldKeepForRegionOutput(row, firstMappedReference, options)) {
        regionOverlapCount += 1;
        if (regionRows.length < maxAlignments) {
          regionRows.push(row);
        }
      }
    }
    if (alignments.length < OUTPUT_ROW_LIMIT) {
      alignments.push(row);
    } else {
      truncatedRows += 1;
    }
  }

  if (!firstNonEmptyLine) {
    return makeEmptySamResult(["No SAM text was supplied."]);
  }
  if (malformed > 0) {
    warnings.push(`${malformed.toLocaleString()} malformed alignment line(s) were skipped because they had fewer than 11 SAM fields.`);
  }
  if (truncatedRows > 0) {
    warnings.push(`Alignment table materialization was capped at ${OUTPUT_ROW_LIMIT.toLocaleString()} rows; ${truncatedRows.toLocaleString()} additional row(s) were summarized but not retained for output.`);
  }

  const referenceRows = [...referenceStats.values()].map((stats) => ({
    reference: stats.reference,
    length: stats.length,
    alignments: stats.alignments,
    mapped_alignments: stats.mapped_alignments,
    mean_mapq: stats.mapped_alignments > 0 ? formatNumber(stats.mapqSum / stats.mapped_alignments) : "",
    covered_min: stats.covered_min,
    covered_max: stats.covered_max
  }));
  addSamInputWarnings(warnings, {
    headerLines,
    alignmentLines,
    referenceStats,
    options
  });
  const flagRows = FLAG_DEFINITIONS.map(([flag, label]) => ({
    flag,
    label,
    count: flagCounts.get(flag) ?? 0,
    percent: alignmentLines > 0 ? formatNumber(((flagCounts.get(flag) ?? 0) / alignmentLines) * 100) : "0"
  }));
  const coverageRows = buildCoverageRows(coverageStats, referenceStats, options, warnings);
  const region = referenceStats.size > 0
    ? chooseRegionFromStats(referenceStats, firstMappedReference, options)
    : chooseRegion(alignments, options);
  const regionOmitted = Math.max(0, regionOverlapCount - regionRows.length);
  if (regionOmitted > 0) {
    warnings.push(`Region output was capped at ${maxAlignments.toLocaleString()} overlapping alignment(s); ${regionOmitted.toLocaleString()} additional overlapping alignment(s) were summarized but not drawn or emitted in the selected region table.`);
  }
  const report = makeSamReport({
    lineCount,
    headerLines,
    headerCounts,
    alignmentLines,
    mapped,
    unmapped,
    referenceRows,
    coverageRows,
    readGroups,
    region,
    regionRows,
    regionOmitted,
    warnings
  });
  return {
    report,
    warnings,
    lineCount,
    headerLines,
    alignmentLines,
    mapped,
    unmapped,
    alignments,
    referenceRows,
    coverageRows,
    flagRows,
    region,
    regionRows,
    regionOmitted
  };
}

function makeEmptySamResult(warnings = []) {
  return {
    report: `SAM/BAM Summary And Region Viewer\n\n${warnings.join("\n")}`,
    warnings,
    lineCount: 0,
    headerLines: 0,
    alignmentLines: 0,
    mapped: 0,
    unmapped: 0,
    alignments: [],
    referenceRows: [],
    coverageRows: [],
    flagRows: FLAG_DEFINITIONS.map(([flag, label]) => ({ flag, label, count: 0, percent: "0" })),
    region: { reference: "", start: 1, end: 1 },
    regionRows: [],
    regionOmitted: 0
  };
}

function makeSamReport(result) {
  const lines = [
    "SAM/BAM Summary And Region Viewer",
    "",
    `Input lines: ${result.lineCount.toLocaleString()}`,
    `Header lines: ${result.headerLines.toLocaleString()}`,
    `Alignment records: ${result.alignmentLines.toLocaleString()}`,
    `Mapped alignments: ${result.mapped.toLocaleString()}`,
    `Unmapped alignments: ${result.unmapped.toLocaleString()}`,
    `References in summary: ${result.referenceRows.length.toLocaleString()}`,
    `Read groups: ${result.readGroups.size.toLocaleString()}`
  ];
  if (result.headerCounts.size > 0) {
    lines.push("", "Header line types:");
    for (const [type, count] of [...result.headerCounts.entries()].sort()) {
      lines.push(`- @${type}: ${count.toLocaleString()}`);
    }
  }
  if (result.referenceRows.length > 0) {
    lines.push("", "Top references:");
    for (const row of result.referenceRows.slice(0, 8)) {
      lines.push(`- ${row.reference}: ${Number(row.mapped_alignments).toLocaleString()} mapped alignment(s)${row.length ? `, length ${Number(row.length).toLocaleString()}` : ""}`);
    }
  }
  if (result.coverageRows?.length > 0) {
    lines.push("", "Coverage summary:");
    for (const row of result.coverageRows.slice(0, 8)) {
      lines.push(`- ${row.reference} ${row.scope_start}-${row.scope_end} (${row.scope}): mean depth ${row.mean_depth}x, breadth ${row.breadth_percent}%, zero-coverage regions ${Number(row.zero_coverage_region_count).toLocaleString()}`);
    }
  }
  if (result.region.reference) {
    lines.push(
      "",
      `Region preview: ${result.region.reference}:${Number(result.region.start).toLocaleString()}-${Number(result.region.end).toLocaleString()}`,
      `Region alignments shown: ${result.regionRows.length.toLocaleString()}`,
      `Region alignments omitted by cap: ${result.regionOmitted.toLocaleString()}`
    );
  }
  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`));
  }
  lines.push("", "Input note: SAM/SAM.GZ input is summarized from pasted/uploaded text or direct local file input; indexed BAM plus BAI/CSI is queried only for the selected region.");
  return lines.join("\n");
}

export function makeSamTableTsv(columns, rows) {
  const header = columns.map((column) => column.label).join("\t");
  const body = rows.map((row) => columns.map((column) => escapeTsv(row[column.id])).join("\t"));
  return [header, ...body].join("\n");
}

function escapeTsv(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\t/g, " ");
}

function scaleCoordinate(position, region, left, width) {
  const start = Number(region.start);
  const end = Number(region.end);
  const span = Math.max(1, end - start + 1);
  if (span <= 1) return left + width / 2;
  return left + ((Number(position) - start) / (span - 1)) * width;
}

function scaleBoundary(position, region, left, width) {
  const start = Number(region.start);
  const end = Number(region.end);
  const span = Math.max(1, end - start + 1);
  return left + ((Number(position) - start) / span) * width;
}

function assignReadLanes(rows, maxLanes = 14) {
  const laneEnds = [];
  const placed = [];
  let omitted = 0;
  for (const row of rows.slice().sort((left, right) => left.start - right.start || left.end - right.end)) {
    let lane = laneEnds.findIndex((end) => Number(row.start) > end + 3);
    if (lane < 0 && laneEnds.length < maxLanes) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    if (lane < 0) {
      omitted += 1;
      continue;
    }
    laneEnds[lane] = Number(row.end);
    placed.push({ ...row, lane });
  }
  return { placed, omitted, laneCount: Math.max(1, laneEnds.length) };
}

function makeNiceTickStep(span, targetTickCount = 5) {
  const rough = Math.max(1, span / Math.max(1, targetTickCount));
  const exponent = 10 ** Math.floor(Math.log10(rough));
  for (const multiplier of [1, 2, 5, 10]) {
    if (rough <= multiplier * exponent) return multiplier * exponent;
  }
  return exponent * 10;
}

function makeRegionAxisTicks(region, left, width) {
  const start = Number(region.start);
  const end = Number(region.end);
  const span = Math.max(1, end - start + 1);
  const ticks = new Set([start]);
  if (end !== start) ticks.add(end);
  const targetTickCount = Math.max(2, Math.floor(width / 170));
  const tickStep = makeNiceTickStep(span, targetTickCount);
  const firstTick = Math.ceil(start / tickStep) * tickStep;
  const endpointGapPx = 92;
  for (let position = firstTick; position <= end; position += tickStep) {
    if (position <= start || position >= end) continue;
    const x = scaleCoordinate(position, region, left, width);
    if (x - left < endpointGapPx || left + width - x < endpointGapPx) continue;
    ticks.add(position);
  }
  return [...ticks]
    .sort((leftValue, rightValue) => leftValue - rightValue)
    .map((position) => ({
      position,
      x: scaleCoordinate(position, region, left, width),
      label: Number(position).toLocaleString()
    }));
}

function computeCoverageSegments(rows, region) {
  const start = Number(region.start);
  const end = Number(region.end);
  const events = new Map();
  const addEvent = (position, delta) => {
    events.set(position, (events.get(position) ?? 0) + delta);
  };
  for (const row of rows) {
    const segmentStart = Math.max(start, Number(row.start));
    const segmentEndExclusive = Math.min(end + 1, Number(row.end) + 1);
    if (segmentEndExclusive <= segmentStart) {
      continue;
    }
    addEvent(segmentStart, 1);
    addEvent(segmentEndExclusive, -1);
  }
  const boundaries = [...new Set([start, end + 1, ...events.keys()])]
    .filter((position) => position >= start && position <= end + 1)
    .sort((leftValue, rightValue) => leftValue - rightValue);
  const segments = [];
  let depth = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const boundary = boundaries[index];
    depth += events.get(boundary) ?? 0;
    const nextBoundary = boundaries[index + 1];
    if (depth > 0 && nextBoundary > boundary) {
      segments.push({
        start: boundary,
        endExclusive: nextBoundary,
        depth
      });
    }
  }
  return segments;
}

function formatCoverageDepth(value) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 10 || Number.isInteger(value)) return value.toFixed(0);
  return value.toFixed(1);
}

export function renderSamRegionSvg(result, options = {}) {
  const region = result.region ?? { reference: "", start: 1, end: 1 };
  const rows = result.regionRows ?? [];
  const left = 205;
  const right = 1000;
  const width = right - left;
  const { placed, omitted, laneCount } = assignReadLanes(rows);
  const totalOmitted = omitted + (result.regionOmitted ?? 0);
  const coverageTop = 88;
  const coverageHeight = 54;
  const coverageBaseY = coverageTop + coverageHeight;
  const axisY = coverageBaseY + 34;
  const readTop = axisY + 52;
  const readHeight = 13;
  const laneGap = 19;
  const height = readTop + laneCount * laneGap + 76;
  const svgWidth = 1060;
  const title = `${region.reference || "region"}:${Number(region.start).toLocaleString()}-${Number(region.end).toLocaleString()}`;
  const scope = '[data-sms3-plot="sam-region-map"]';
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${height}" role="img" aria-label="SAM region map" data-sms3-plot="sam-region-map">`,
    "<style>",
    `${scope} text{stroke:none!important;stroke-width:0!important;text-shadow:none!important;paint-order:normal!important}`,
    `${scope} .title{font:700 18px system-ui,-apple-system,Segoe UI,sans-serif;fill:#111827}`,
    `${scope} .subtitle,${scope} .section-label,${scope} .legend,${scope} .note{font:12px system-ui,-apple-system,Segoe UI,sans-serif;fill:#475569}`,
    `${scope} .axis-label{font:500 11px system-ui,-apple-system,Segoe UI,sans-serif;fill:#334155}`,
    `${scope} .section-label{font-weight:650;fill:#334155}`,
    `${scope} .axis{stroke:#334155;stroke-width:1.4}`,
    `${scope} .tick{stroke:#64748b;stroke-width:1}`,
    `${scope} .grid{stroke:#e2e8f0;stroke-width:1}`,
    `${scope} .coverage-axis{stroke:#94a3b8;stroke-width:1}`,
    `${scope} .coverage{fill:#c7d2fe}`,
    `${scope} .read-forward{fill:#2563eb;stroke:#1d4ed8}`,
    `${scope} .read-reverse{fill:#dc2626;stroke:#b91c1c}`,
    `${scope} .read-label{font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:#ffffff}`,
    "</style>",
    `<rect x="0" y="0" width="${svgWidth}" height="${height}" fill="#ffffff"></rect>`,
    `<text class="title" x="40" y="34">SAM region map</text>`,
    `<text class="subtitle" x="40" y="58">${escapeXml(title)}; ${rows.length.toLocaleString()} alignment(s) shown${totalOmitted ? `, ${totalOmitted.toLocaleString()} omitted` : ""}</text>`,
    `<rect class="read-forward" x="${right - 220}" y="23" width="18" height="8" rx="2"></rect>`,
    `<text class="legend" x="${right - 196}" y="31">forward read</text>`,
    `<rect class="read-reverse" x="${right - 100}" y="23" width="18" height="8" rx="2"></rect>`,
    `<text class="legend" x="${right - 76}" y="31">reverse read</text>`
  ];

  const coverageSegments = computeCoverageSegments(rows, region);
  const maxCoverage = Math.max(1, ...coverageSegments.map((segment) => segment.depth));
  parts.push(`<text class="section-label" x="${left - 62}" y="${coverageTop + 4}" text-anchor="end">Coverage depth</text>`);
  parts.push(`<line class="coverage-axis" x1="${left - 10}" y1="${coverageTop}" x2="${left - 10}" y2="${coverageBaseY}"></line>`);
  parts.push(`<line class="grid" x1="${left}" y1="${coverageTop}" x2="${right}" y2="${coverageTop}"></line>`);
  parts.push(`<line class="grid" x1="${left}" y1="${coverageBaseY}" x2="${right}" y2="${coverageBaseY}"></line>`);
  parts.push(`<line class="tick" x1="${left - 14}" y1="${coverageTop}" x2="${left - 6}" y2="${coverageTop}"></line>`);
  parts.push(`<line class="tick" x1="${left - 14}" y1="${coverageBaseY}" x2="${left - 6}" y2="${coverageBaseY}"></line>`);
  parts.push(`<text class="axis-label" x="${left - 18}" y="${coverageTop + 4}" text-anchor="end">${formatCoverageDepth(maxCoverage)}x</text>`);
  parts.push(`<text class="axis-label" x="${left - 18}" y="${coverageBaseY + 4}" text-anchor="end">0</text>`);
  coverageSegments.forEach((segment) => {
    const barHeight = Math.max(1, (segment.depth / maxCoverage) * coverageHeight);
    const x1 = scaleBoundary(segment.start, region, left, width);
    const x2 = scaleBoundary(segment.endExclusive, region, left, width);
    const y = coverageBaseY - barHeight;
    parts.push(`<rect class="coverage" data-start="${segment.start}" data-end-exclusive="${segment.endExclusive}" data-depth="${segment.depth}" x="${x1.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, x2 - x1).toFixed(2)}" height="${barHeight.toFixed(2)}"></rect>`);
  });
  if (totalOmitted > 0) {
    parts.push(`<text class="note" x="${left}" y="${coverageTop - 14}">Coverage depth uses displayed alignments only.</text>`);
  }
  parts.push(`<line class="axis" x1="${left}" y1="${axisY}" x2="${right}" y2="${axisY}"></line>`);
  for (const { x, label } of makeRegionAxisTicks(region, left, width)) {
    parts.push(`<line class="tick" x1="${x.toFixed(2)}" y1="${axisY - 6}" x2="${x.toFixed(2)}" y2="${axisY + 6}"></line>`);
    parts.push(`<text class="axis-label" x="${x.toFixed(2)}" y="${axisY + 22}" text-anchor="middle">${label}</text>`);
  }
  parts.push(`<text class="section-label" x="${left - 62}" y="${readTop + readHeight}" text-anchor="end">Alignments</text>`);

  for (const row of placed) {
    const clippedStart = Math.max(Number(region.start), Number(row.start));
    const clippedEndExclusive = Math.min(Number(region.end) + 1, Number(row.end) + 1);
    const x1 = scaleBoundary(clippedStart, region, left, width);
    const x2 = scaleBoundary(clippedEndExclusive, region, left, width);
    const x = Math.max(left, Math.min(right, x1));
    const w = Math.max(2, Math.min(right, x2) - x);
    const y = readTop + row.lane * laneGap;
    const className = row.strand === "-" ? "read-reverse" : "read-forward";
    const readName = String(row.qname);
    const escapedReadName = escapeXml(readName);
    parts.push(`<rect class="${className}" data-read-name="${escapedReadName}" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${readHeight}" rx="2"></rect>`);
    if (w > 72) {
      const label = readName.length > 34 ? `${readName.slice(0, 31)}...` : readName;
      parts.push(`<text class="read-label" data-read-label="${escapedReadName}" x="${(x + w / 2).toFixed(2)}" y="${(y + readHeight / 2).toFixed(2)}" text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text>`);
    }
  }
  if (rows.length === 0) {
    parts.push(`<text class="note" x="${left}" y="${readTop + 12}">No mapped alignments overlap this region.</text>`);
  }
  if (totalOmitted > 0) {
    parts.push(`<text class="note" x="${left}" y="${height - 24}">${totalOmitted.toLocaleString()} additional overlapping alignment(s) are omitted from this SVG; use the alignment table for capped row output.</text>`);
  }
  parts.push("</svg>");
  return parts.join("\n");
}
