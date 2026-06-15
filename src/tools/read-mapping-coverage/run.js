import {
  calculateReadMappingCoverage,
  readMappingAlignmentColumns,
  readMappingCoverageColumns
} from "../../core/read-mapping-coverage.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { complementDnaRnaSequence } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["coverage-plot", "alignment-table", "coverage-table", "interactive-viewer", "summary-report"]);
const READ_SEQUENCE_DETAIL_LIMIT = 180;
const MAX_VIEWER_ALIGNED_READ_BASES = 100000;
const MISMATCH_BASES = ["A", "C", "G", "T"];

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "coverage-plot";
}

function selectedOutput(result, outputFormat) {
  if (outputFormat === "alignment-table") return result.alignmentTsv;
  if (outputFormat === "coverage-table") return result.coverageTsv;
  if (outputFormat === "interactive-viewer") return JSON.stringify(result.viewer, null, 2);
  if (outputFormat === "summary-report") return result.report;
  return result.svg;
}

function downloadMetadata(outputFormat) {
  if (outputFormat === "alignment-table") {
    return {
      filename: "mapped-read-table.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "coverage-table") {
    return {
      filename: "read-coverage-table.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "summary-report") {
    return {
      filename: "read-mapping-coverage-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  if (outputFormat === "interactive-viewer") {
    return {
      filename: "read-mapping-coverage-viewer.json",
      mimeType: "application/json;charset=utf-8"
    };
  }
  return {
    filename: "read-mapping-coverage-plot.svg",
    mimeType: "image/svg+xml;charset=utf-8"
  };
}

function previewReadText(sequence, options = {}) {
  const text = String(sequence ?? "").trim();
  if (!text) return "";
  const displayText = options.uppercase ? text.toUpperCase() : text;
  if (displayText.length <= READ_SEQUENCE_DETAIL_LIMIT) return displayText;
  return `${displayText.slice(0, READ_SEQUENCE_DETAIL_LIMIT)}... (${displayText.length.toLocaleString()} ${options.unitLabel || "bases"})`;
}

function reverseComplement(sequence) {
  return complementDnaRnaSequence(sequence, { preserveCase: false }).split("").reverse().join("");
}

function parseCigar(cigar) {
  const ops = [];
  for (const match of String(cigar ?? "").matchAll(/(\d+)([MIDNSHP=X])/gu)) {
    ops.push({ length: Number.parseInt(match[1], 10), op: match[2] });
  }
  return ops;
}

function readSequenceForAlignment(row, readRecord) {
  const sequence = String(readRecord?.sequence ?? "").toUpperCase();
  if (!sequence) return "";
  return row.strand === "-" ? reverseComplement(sequence) : sequence;
}

function makeAlignedReadBases(row, readRecord, referenceSequence, remainingBudget) {
  const readSequence = readSequenceForAlignment(row, readRecord);
  if (!readSequence || remainingBudget <= 0) return { bases: [], omitted: false };
  const ops = parseCigar(row.cigar);
  if (!ops.length) return { bases: [], omitted: false };
  const estimatedAlignedBases = ops.reduce((sum, entry) => "M=XDN".includes(entry.op) ? sum + entry.length : sum, 0);
  if (estimatedAlignedBases > remainingBudget) {
    return { bases: [], omitted: true };
  }

  const bases = [];
  let referencePosition = Number(row.start);
  let queryIndex = 0;
  const reference = String(referenceSequence ?? "").toUpperCase();
  for (const entry of ops) {
    if ("M=X".includes(entry.op)) {
      for (let offset = 0; offset < entry.length; offset += 1) {
        const position = referencePosition + offset;
        const base = readSequence[queryIndex + offset] || "N";
        const referenceBase = reference[position - 1] || "";
        bases.push({
          position,
          base,
          op: entry.op,
          matchesReference: referenceBase ? base === referenceBase : undefined
        });
      }
      referencePosition += entry.length;
      queryIndex += entry.length;
    } else if (entry.op === "I" || entry.op === "S") {
      queryIndex += entry.length;
    } else if (entry.op === "D" || entry.op === "N") {
      for (let offset = 0; offset < entry.length; offset += 1) {
        bases.push({
          position: referencePosition + offset,
          base: "-",
          op: entry.op,
          matchesReference: false
        });
      }
      referencePosition += entry.length;
    } else if (entry.op === "H" || entry.op === "P") {
      // Hard clips and pads consume neither displayed query bases nor reference bases.
    }
  }
  return { bases, omitted: false };
}

function addMismatchBaseCount(countsByPosition, entry) {
  if (entry?.matchesReference !== false) return;
  const position = Number(entry.position);
  if (!Number.isFinite(position)) return;
  const base = String(entry.base || "").toUpperCase().replace("U", "T");
  if (!MISMATCH_BASES.includes(base)) return;
  const counts = countsByPosition.get(position) ?? { A: 0, C: 0, G: 0, T: 0 };
  counts[base] += 1;
  countsByPosition.set(position, counts);
}

function makeReadFeatureId(row, index) {
  return `mapped-read-${index + 1}-${String(row.read ?? "read").replace(/[^A-Za-z0-9_.-]+/gu, "-")}`;
}

function makePairStatus(row) {
  if (row.pair_status) return row.pair_status;
  if (!row.paired) return "not paired";
  if (row.proper_pair) return "proper pair";
  if (row.mate_unmapped) return "mate unmapped";
  return "paired";
}

function annotateReadMateFeatures(readItems) {
  const byMateKey = new Map();
  for (const item of readItems) {
    if (!item.mateKey) continue;
    if (!byMateKey.has(item.mateKey)) byMateKey.set(item.mateKey, []);
    byMateKey.get(item.mateKey).push(item);
  }

  for (const item of readItems) {
    const candidates = (byMateKey.get(item.mateKey) ?? []).filter((candidate) => candidate.featureId !== item.featureId);
    const mate = item.mateNumber === 1
      ? candidates.find((candidate) => candidate.mateNumber === 2) ?? candidates[0]
      : item.mateNumber === 2
        ? candidates.find((candidate) => candidate.mateNumber === 1) ?? candidates[0]
        : candidates[0];
    item.matePresentInViewer = Boolean(mate);
    if (!mate) continue;
    item.mateFeatureId = mate.featureId;
    item.mateName = mate.readName;
    item.mateStart = mate.start;
    item.mateEnd = mate.end;
  }
}

function mismatchCountsForWindow(countsByPosition, start, end) {
  const counts = { A: 0, C: 0, G: 0, T: 0 };
  for (let position = start; position <= end; position += 1) {
    const positionCounts = countsByPosition.get(position);
    if (!positionCounts) continue;
    for (const base of MISMATCH_BASES) {
      counts[base] += Number(positionCounts[base] || 0);
    }
  }
  const total = MISMATCH_BASES.reduce((sum, base) => sum + counts[base], 0);
  return { counts, total };
}

export function makeCoverageViewerData(result) {
  const rowsByReference = new Map();
  for (const row of result.alignmentRows) {
    if (!row.reference) continue;
    if (!rowsByReference.has(row.reference)) rowsByReference.set(row.reference, []);
    rowsByReference.get(row.reference).push(row);
  }
  const coverageByReference = new Map();
  for (const row of result.coverageRows) {
    if (!coverageByReference.has(row.reference)) coverageByReference.set(row.reference, []);
    coverageByReference.get(row.reference).push(row);
  }
  const readRecordByTitle = new Map(result.readRecords.map((record) => [record.title, record]));
  let remainingAlignedReadBases = MAX_VIEWER_ALIGNED_READ_BASES;
  let omittedAlignedReadDetails = 0;
  return makeDnaViewerData(result.referenceRecords.map((record, index) => {
    const coverageRows = coverageByReference.get(record.title) ?? [];
    const maxDepth = coverageRows.reduce((max, row) => Math.max(max, Number(row.max_depth || 0)), 0);
    const readRows = rowsByReference.get(record.title) ?? [];
    const mismatchCountsByPosition = new Map();
    const readItems = readRows.map((row, readIndex) => {
      const readRecord = readRecordByTitle.get(row.read);
      const alignedReadBases = makeAlignedReadBases(row, readRecord, record.sequence, remainingAlignedReadBases);
      remainingAlignedReadBases -= alignedReadBases.bases.length;
      if (alignedReadBases.omitted) omittedAlignedReadDetails += 1;
      for (const entry of alignedReadBases.bases) {
        addMismatchBaseCount(mismatchCountsByPosition, entry);
      }
      const featureId = makeReadFeatureId(row, readIndex);
      return {
        featureId,
        start: row.start,
        end: row.end,
        length: Number(row.end) - Number(row.start) + 1,
        label: row.read,
        name: row.read,
        type: row.strand === "-" ? "reverse-strand read" : "forward-strand read",
        strand: row.strand,
        readName: row.read,
        flag: row.flag,
        paired: row.paired,
        properPair: row.proper_pair,
        firstMate: row.first_mate,
        secondMate: row.second_mate,
        mateKey: row.mate_key,
        mateNumber: row.mate_number,
        mateReference: row.mate_reference,
        matePosition: row.mate_position,
        templateLength: row.template_length,
        pairStatus: makePairStatus(row),
        mateName: row.read,
        matePresentInViewer: false,
        mapq: row.mapq,
        cigar: row.cigar,
        readLength: row.read_length,
        readSequence: previewReadText(readRecord?.sequence, { uppercase: true }),
        readQuality: previewReadText(readRecord?.quality, { unitLabel: "characters" }),
        alignedReadBases: alignedReadBases.bases,
        referenceSpan: Number(row.end) - Number(row.start) + 1,
        percentIdentity: row.identity_percent,
        mismatches: row.mismatches,
        status: row.status,
        color: row.strand === "-" ? "#c2410c" : "#2563eb"
      };
    });
    annotateReadMateFeatures(readItems);
    const coverageItems = coverageRows.map((row) => {
      const start = Number(row.start);
      const end = Number(row.end);
      const mismatchSummary = mismatchCountsForWindow(mismatchCountsByPosition, start, end);
      return {
        start: row.start,
        end: row.end,
        value: Number(row.mean_depth || 0),
        label: [
          `${record.title}:${row.start}-${row.end} mean depth ${row.mean_depth}x`,
          mismatchSummary.total > 0 ? `${mismatchSummary.total} mismatch base${mismatchSummary.total === 1 ? "" : "s"}` : ""
        ].filter(Boolean).join("; "),
        maxDepth: row.max_depth,
        coveredPercent: row.covered_percent,
        mismatchCount: mismatchSummary.total,
        mismatchBaseCounts: mismatchSummary.counts
      };
    });
    if (omittedAlignedReadDetails > 0 && !result.warnings.includes("Some base-level read details were omitted from the coverage viewer to keep the viewer data size bounded.")) {
      result.warnings.push("Some base-level read details were omitted from the coverage viewer to keep the viewer data size bounded.");
    }
    return {
      id: `read-coverage-reference-${index + 1}`,
      title: record.title,
      sequence: record.sequence,
      length: record.sequence.length,
      topology: record.topology || "linear",
      tracks: [
        ...(record.tracks ?? []),
        ...(coverageItems.length > 0
          ? [{
              id: "read-depth",
              type: "quantitative",
              label: "Read depth",
              axisLabel: "Coverage",
              metric: "mean_depth",
              unit: "x",
              yMin: 0,
              yMax: Math.max(1, maxDepth),
              baseline: 0,
              color: "#0f766e",
              windowSize: result.options.coverageWindowSize,
              items: coverageItems
            }]
          : []),
        ...(readItems.length > 0
          ? [{
              id: "mapped-reads",
              type: "features",
              label: "Mapped reads",
              axisLabel: "Reads",
              layout: "stacked-intervals",
              featureOpacity: 0.58,
              items: readItems
            }]
          : [])
      ]
    };
  }), {
    title: "Read mapping coverage viewer",
    layout: "linear"
  });
}

export async function runReadMappingCoverage(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const result = await calculateReadMappingCoverage(input, { ...options, outputFormat }, context);
  const viewer = outputFormat === "interactive-viewer" ? makeCoverageViewerData(result) : null;
  if (viewer) {
    result.viewer = viewer;
  }
  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat),
    warnings: result.warnings,
    recordsProcessed: result.referenceRecords.length + result.readRecords.length,
    basesProcessed: result.referenceBases + result.readBases,
    streams: {
      plot: makeTextStream(result.svg, "image/svg+xml"),
      table: makeTableStream(readMappingAlignmentColumns, result.alignmentRows, "read-mapping-alignments"),
      coverageTable: makeTableStream(readMappingCoverageColumns, result.coverageRows, "read-mapping-coverage"),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      report: makeTextStream(result.report, "text/plain")
    },
    visual: outputFormat === "interactive-viewer"
      ? { viewer }
      : outputFormat === "coverage-plot"
      ? {
          svg: result.svg,
          renderer: "observable-plot",
          plotSpec: result.plotSpec,
          observablePlotConfig: result.observablePlotConfig,
          pngDownload: true
        }
      : undefined,
    optionsUsed: {
      ...result.options,
      alignmentEngine: result.engine,
      command: result.command
    }
  });
}
