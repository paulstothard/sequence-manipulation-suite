import { parseSequenceInput } from "./fasta.js";
import { parseFastqRecords } from "./fastq-preprocess.js";
import {
  makeBiologicalRecordViewerRecords,
  parseBiologicalRecordInput
} from "./biological-record-format-converter.js";
import { flatfileRecordsToSequenceRecords } from "./flatfile-records.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";
import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import {
  makeLinePlotSpec,
  makeObservablePlotConfig,
  renderLinePlotSvg
} from "./plot-renderer.js";

const MINIMAP2_VERSION = "2.22";
const SPLIT_SEPARATOR = "---";
const MINIMAP2_PRESETS = new Set(["none", "sr", "map-ont", "map-pb"]);
const OUTPUT_FORMATS = new Set(["coverage-plot", "alignment-table", "coverage-table", "summary-report", "interactive-viewer"]);
const READ_LAYOUTS = new Set(["single", "paired"]);

let minimap2CliPromise = null;
let runCounter = 0;

export const readMappingAlignmentColumns = [
  { id: "read", label: "Read" },
  { id: "reference", label: "Reference" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "strand", label: "Strand" },
  { id: "mapq", label: "MAPQ" },
  { id: "cigar", label: "CIGAR" },
  { id: "flag", label: "FLAG" },
  { id: "paired", label: "Paired" },
  { id: "proper_pair", label: "Proper pair" },
  { id: "first_mate", label: "First mate" },
  { id: "second_mate", label: "Second mate" },
  { id: "rnext", label: "RNEXT" },
  { id: "pnext", label: "PNEXT" },
  { id: "tlen", label: "TLEN" },
  { id: "aligned_bases", label: "Aligned bases" },
  { id: "read_length", label: "Read length" },
  { id: "identity_percent", label: "Identity %" },
  { id: "mismatches", label: "Mismatches" },
  { id: "status", label: "Status" },
  { id: "alignment_method", label: "Alignment method" }
];

export const readMappingCoverageColumns = [
  { id: "reference", label: "Reference" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "window_size", label: "Window size" },
  { id: "mean_depth", label: "Mean depth" },
  { id: "max_depth", label: "Max depth" },
  { id: "covered_bases", label: "Covered bases" },
  { id: "covered_percent", label: "Covered %" }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return "";
  return Number(value.toFixed(digits));
}

function niceCeiling(value) {
  const raw = Math.max(1, Math.ceil(value));
  const exponent = Math.floor(Math.log10(raw));
  const magnitude = 10 ** exponent;
  const fraction = raw / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

export function normalizeReadMappingCoverageOptions(options = {}) {
  const rawPreset = String(options.minimap2Preset ?? "sr");
  const rawOutputFormat = String(options.outputFormat ?? "coverage-plot");
  return {
    alignmentEngine: options.alignmentEngine === "exact" ? "exact" : "minimap2",
    readLayout: READ_LAYOUTS.has(options.readLayout) ? options.readLayout : "single",
    minimap2Preset: MINIMAP2_PRESETS.has(rawPreset) ? rawPreset : "sr",
    minMapq: parseInteger(options.minMapq, 0, 0, 255),
    minAlignedBases: parseInteger(options.minAlignedBases, 20, 1, 1_000_000),
    coverageWindowSize: parseInteger(options.coverageWindowSize, 0, 0, 10_000_000),
    outputFormat: OUTPUT_FORMATS.has(rawOutputFormat) ? rawOutputFormat : "coverage-plot",
    maxReferenceBases: parseInteger(options.maxReferenceBases, 5_000_000, 100, 500_000_000),
    maxReads: parseInteger(options.maxReads, 100_000, 1, 10_000_000),
    maxReportedAlignments: parseInteger(options.maxReportedAlignments, 10_000, 1, 1_000_000),
    maxCoverageBins: parseInteger(options.maxCoverageBins, 800, 10, 100_000)
  };
}

function splitReferenceAndReads(input) {
  const text = String(input ?? "").trim();
  if (!text) {
    return { referenceText: "", readsText: "" };
  }
  const pieces = text.split(new RegExp(`\\n\\s*${SPLIT_SEPARATOR}\\s*\\n`, "u"));
  if (pieces.length >= 2) {
    return {
      referenceText: pieces[0].trim(),
      readsText: pieces.slice(1).join("\n").trim()
    };
  }

  const records = parseSequenceInput(text, "sequence");
  if (records.length > 1) {
    const reference = records[0];
    const reads = records.slice(1);
    return {
      referenceText: `>${reference.title}\n${reference.sequence}`,
      readsText: reads.map((record) => `>${record.title}\n${record.sequence}`).join("\n")
    };
  }

  return { referenceText: text, readsText: "" };
}

function cleanRecordSequence(record, warnings, role, index) {
  const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
  if (cleaned.removedCount > 0) {
    warnings.push(`${role} ${record.title || index + 1}: removed ${cleaned.removedCount.toLocaleString()} non-sequence character(s).`);
  }
  return {
    ...record,
    title: record.title || `${role.toLowerCase().replace(/\s+/gu, "_")}_${index + 1}`,
    sequence: cleaned.sequence.replace(/U/gu, "T"),
    quality: record.quality
  };
}

function uniquifyRecordTitles(records, warnings, role) {
  const titleCounts = new Map();
  return records.map((record) => {
    const seenCount = titleCounts.get(record.title) ?? 0;
    titleCounts.set(record.title, seenCount + 1);
    if (seenCount === 0) return record;
    const title = `${record.title} (${seenCount + 1})`;
    warnings.push(`${role} title "${record.title}" appeared more than once; renamed one record to "${title}".`);
    return { ...record, title };
  });
}

function parseReferenceRecords(referenceText, warnings) {
  const biologicalRecords = parseBiologicalRecordInput(referenceText, { inputFormat: "auto" });
  if (biologicalRecords.records.length > 0) {
    warnings.push(...biologicalRecords.warnings);
    warnings.push(`Reference input was interpreted as ${biologicalRecords.sourceFormat}; mapping uses the whole DNA/RNA sequence records.`);
    const viewerRecords = makeBiologicalRecordViewerRecords(biologicalRecords.records);
    const viewerRecordsByTitle = new Map(viewerRecords.map((record) => [record.title, record]));
    const sequenceRecords = flatfileRecordsToSequenceRecords(biologicalRecords.records, "whole")
      .map((record, index) => {
        const viewerRecord = viewerRecordsByTitle.get(record.title) ?? viewerRecords[index];
        return {
          ...record,
          tracks: viewerRecord?.tracks ?? [],
          topology: viewerRecord?.topology ?? ""
        };
      });
    return uniquifyRecordTitles(sequenceRecords
      .map((record, index) => cleanRecordSequence(record, warnings, "Reference", index))
      .filter((record) => record.sequence.length > 0), warnings, "Reference");
  }

  const records = parseSequenceInput(referenceText, "reference")
    .map((record, index) => cleanRecordSequence(record, warnings, "Reference", index))
    .filter((record) => record.sequence.length > 0);
  return uniquifyRecordTitles(records, warnings, "Reference");
}

function parseReadRecords(readsText, options, warnings, context) {
  const trimmed = String(readsText ?? "").trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("@")) {
    const parsed = parseFastqRecords(trimmed, { maxReads: options.maxReads }, context);
    warnings.push(...parsed.warnings);
    const records = parsed.records
      .map((record, index) => cleanRecordSequence(record, warnings, "Read", index))
      .filter((record) => record.sequence.length > 0);
    return uniquifyRecordTitles(records, warnings, "Read");
  }
  const records = parseSequenceInput(trimmed, "read")
    .slice(0, options.maxReads)
    .map((record, index) => cleanRecordSequence(record, warnings, "Read", index))
    .filter((record) => record.sequence.length > 0);
  return uniquifyRecordTitles(records, warnings, "Read");
}

export function parseReadMappingCoverageInput(input, options = {}, context = {}) {
  const normalized = normalizeReadMappingCoverageOptions(options);
  const warnings = [];
  const { referenceText, readsText } = splitReferenceAndReads(input);
  const referenceRecords = parseReferenceRecords(referenceText, warnings);
  const readRecords = parseReadRecords(readsText, normalized, warnings, context);
  const referenceBases = referenceRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  const readBases = readRecords.reduce((sum, record) => sum + record.sequence.length, 0);

  if (referenceRecords.length === 0) {
    throw new Error("Read Mapping Coverage requires one reference sequence or FASTA record before the separator.");
  }
  if (readRecords.length === 0) {
    throw new Error("Read Mapping Coverage requires FASTQ/FASTQ.GZ or FASTA reads after the separator.");
  }
  if (referenceBases > normalized.maxReferenceBases) {
    throw new Error(`Reference input contains ${referenceBases.toLocaleString()} bases, which exceeds the current limit of ${normalized.maxReferenceBases.toLocaleString()} bases.`);
  }
  if (readRecords.length >= normalized.maxReads) {
    warnings.push(`Only the first ${normalized.maxReads.toLocaleString()} read(s) were processed.`);
  }

  return {
    referenceRecords,
    readRecords,
    referenceBases,
    readBases,
    warnings,
    options: normalized
  };
}

function nextRunId() {
  runCounter += 1;
  return `sms3_read_mapping_${Date.now()}_${runCounter}`;
}

async function getBioWasmMinimap2Cli() {
  if (!minimap2CliPromise) {
    minimap2CliPromise = createBioWasmCli({
      tool: "minimap2",
      program: "minimap2",
      version: MINIMAP2_VERSION,
      assetPath: "../vendor/biowasm/minimap2/2.22"
    });
  }
  return minimap2CliPromise;
}

function formatTempFastaRecord(record) {
  const lines = [`>${record.title}`];
  for (let index = 0; index < record.sequence.length; index += 60) {
    lines.push(record.sequence.slice(index, index + 60));
  }
  return `${lines.join("\n")}\n`;
}

function formatTempFastqRecord(record) {
  const quality = record.quality?.length === record.sequence.length
    ? record.quality
    : "I".repeat(record.sequence.length);
  return `@${record.title}\n${record.sequence}\n+\n${quality}\n`;
}

function makeMinimap2SafeRecords(referenceRecords, readRecords) {
  const referenceEntries = referenceRecords.map((record, index) => ({
    original: record,
    safe: { ...record, title: `sms3_reference_${index + 1}` }
  }));
  const readEntries = readRecords.map((record, index) => ({
    original: record,
    safe: { ...record, title: `sms3_read_${index + 1}` }
  }));
  return {
    referenceRecords: referenceEntries.map((entry) => entry.safe),
    readRecords: readEntries.map((entry) => entry.safe),
    nameMaps: {
      referenceNames: new Map(referenceEntries.map((entry) => [entry.safe.title, entry.original.title])),
      readNames: new Map(readEntries.map((entry) => [entry.safe.title, entry.original.title]))
    }
  };
}

function minimap2Error(stderr) {
  const message = String(stderr ?? "").trim();
  if (!message) return "";
  if (/error|failed|fail to|could not|not found|no such file|invalid|segmentation/i.test(message)) {
    return `minimap2 reported an error: ${message}`;
  }
  return "";
}

export function buildReadMappingMinimap2Args(options, referencePath, readsPath) {
  const normalized = normalizeReadMappingCoverageOptions(options);
  const args = ["-a", "--secondary=no"];
  if (normalized.minimap2Preset !== "none") {
    args.push("-x", normalized.minimap2Preset);
  }
  args.push(referencePath, readsPath);
  return args;
}

async function runBioWasmMinimap2(referenceRecords, readRecords, options, context = {}) {
  requireBioWasmRuntime("Read Mapping Coverage minimap2 alignment");
  const cli = await getBioWasmMinimap2Cli();
  const safeRecords = makeMinimap2SafeRecords(referenceRecords, readRecords);
  const runId = nextRunId();
  const referenceName = `${runId}_reference.fasta`;
  const readsAreFastq = readRecords.some((record) => record.quality);
  const readsName = `${runId}_reads.${readsAreFastq ? "fastq" : "fasta"}`;
  const referenceFasta = safeRecords.referenceRecords.map(formatTempFastaRecord).join("");
  const readsText = readsAreFastq
    ? safeRecords.readRecords.map(formatTempFastqRecord).join("")
    : safeRecords.readRecords.map(formatTempFastaRecord).join("");

  context.reportProgress?.({ phase: "mounting-minimap2-input", progress: 0.2 });
  const [referencePath, readsPath] = await cli.mount([
    { name: referenceName, data: new Blob([referenceFasta], { type: "text/plain" }) },
    { name: readsName, data: new Blob([readsText], { type: "text/plain" }) }
  ]);
  context.throwIfCancelled?.();

  const args = buildReadMappingMinimap2Args(options, referencePath, readsPath);
  context.reportProgress?.({ phase: "running-minimap2", progress: 0.44 });
  const result = await cli.exec("minimap2", args);
  context.throwIfCancelled?.();
  const error = minimap2Error(result?.stderr);
  if (error) {
    throw new Error(error);
  }
  return {
    samText: String(result?.stdout ?? ""),
    engineMessage: `minimap2 ${MINIMAP2_VERSION}`,
    command: `minimap2 ${args.slice(0, -2).join(" ")} reference.fasta reads.${readsAreFastq ? "fastq" : "fasta"}`.replace(/\s+/gu, " ").trim(),
    nameMaps: safeRecords.nameMaps
  };
}

function reverseComplement(sequence) {
  return complementDnaRnaSequence(sequence, { preserveCase: false }).split("").reverse().join("");
}

function findExactReadHit(referenceRecords, read) {
  for (const reference of referenceRecords) {
    const directIndex = reference.sequence.indexOf(read.sequence);
    if (directIndex !== -1) {
      return {
        reference,
        start: directIndex + 1,
        end: directIndex + read.sequence.length,
        sequence: read.sequence,
        reverse: false
      };
    }
    const rc = reverseComplement(read.sequence);
    const reverseIndex = reference.sequence.indexOf(rc);
    if (reverseIndex !== -1) {
      return {
        reference,
        start: reverseIndex + 1,
        end: reverseIndex + read.sequence.length,
        sequence: rc,
        reverse: true
      };
    }
  }
  return null;
}

function makeTemplateLength(hit, mateHit, readIndex, mateIndex) {
  if (!hit || !mateHit || hit.reference.title !== mateHit.reference.title) return 0;
  const start = Math.min(hit.start, mateHit.start);
  const end = Math.max(hit.end, mateHit.end);
  const span = end - start + 1;
  if (hit.start !== mateHit.start) {
    return hit.start < mateHit.start ? span : -span;
  }
  return readIndex <= mateIndex ? span : -span;
}

function exactMatchSam(referenceRecords, readRecords, options = {}) {
  const lines = referenceRecords.map((record) => `@SQ\tSN:${record.title}\tLN:${record.sequence.length}`);
  const hits = readRecords.map((read) => findExactReadHit(referenceRecords, read));
  const paired = options.readLayout === "paired";
  for (let index = 0; index < readRecords.length; index += 1) {
    const read = readRecords[index];
    const hit = hits[index];
    const mateIndex = paired ? (index % 2 === 0 ? index + 1 : index - 1) : -1;
    const mateRead = readRecords[mateIndex];
    const mateHit = hits[mateIndex];
    const hasMate = paired && mateRead;
    const sameReferencePair = hit && mateHit && hit.reference.title === mateHit.reference.title;
    const flag = [
      paired ? 1 : 0,
      sameReferencePair ? 2 : 0,
      hit ? 0 : 4,
      hasMate && !mateHit ? 8 : 0,
      hit?.reverse ? 16 : 0,
      mateHit?.reverse ? 32 : 0,
      paired && index % 2 === 0 ? 64 : 0,
      paired && index % 2 === 1 ? 128 : 0
    ].reduce((sum, value) => sum + value, 0);
    const rnext = !hasMate || !mateHit
      ? "*"
      : sameReferencePair
        ? "="
        : mateHit.reference.title;
    const pnext = mateHit ? mateHit.start : 0;
    const tlen = makeTemplateLength(hit, mateHit, index, mateIndex);
    if (!hit) {
      lines.push(`${read.title}\t${flag}\t*\t0\t0\t*\t${rnext}\t${pnext}\t${tlen}\t${read.sequence}\t${read.quality ?? "*"}`);
      continue;
    }
    lines.push([
      read.title,
      flag,
      hit.reference.title,
      hit.start,
      60,
      `${read.sequence.length}M`,
      rnext,
      pnext,
      tlen,
      hit.sequence,
      read.quality ?? "*",
      "NM:i:0"
    ].join("\t"));
  }
  return `${lines.join("\n")}\n`;
}

function parseCigar(cigar) {
  const ops = [];
  for (const match of String(cigar ?? "").matchAll(/(\d+)([MIDNSHP=X])/gu)) {
    ops.push({ length: Number.parseInt(match[1], 10), op: match[2] });
  }
  return ops;
}

function queryLengthFromCigar(ops) {
  return ops.reduce((sum, entry) => "MIS=X".includes(entry.op) ? sum + entry.length : sum, 0);
}

function referenceSpanFromCigar(ops) {
  return ops.reduce((sum, entry) => "MDN=X".includes(entry.op) ? sum + entry.length : sum, 0);
}

function alignedBasesFromCigar(ops) {
  return ops.reduce((sum, entry) => "M=X".includes(entry.op) ? sum + entry.length : sum, 0);
}

function cigarIntervals(start, ops) {
  const intervals = [];
  let refPosition = start;
  for (const entry of ops) {
    if ("M=X".includes(entry.op)) {
      intervals.push({ start: refPosition, end: refPosition + entry.length - 1 });
      refPosition += entry.length;
    } else if ("DN".includes(entry.op)) {
      refPosition += entry.length;
    }
  }
  return intervals;
}

function optionalTagValue(fields, tag) {
  const prefix = `${tag}:`;
  const field = fields.find((item) => item.startsWith(prefix));
  if (!field) return "";
  return field.split(":").slice(2).join(":");
}

export function normalizeReadMateKey(readName) {
  const firstToken = String(readName ?? "").trim().split(/\s+/u)[0] ?? "";
  return firstToken
    .replace(/\/[12]$/u, "")
    .replace(/([._-])R?[12]$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeMateReference(rawMateReference, reference, referenceNames) {
  if (!rawMateReference || rawMateReference === "*") return "";
  if (rawMateReference === "=") return reference || "";
  return referenceNames.get(rawMateReference) ?? rawMateReference;
}

function mateNumberFromFlag(flag) {
  if ((flag & 64) !== 0) return 1;
  if ((flag & 128) !== 0) return 2;
  return "";
}

function pairStatusFromFlag(flag, isUnmapped) {
  if ((flag & 1) === 0) return "not paired";
  if (isUnmapped) return "read unmapped";
  if ((flag & 8) !== 0) return "mate unmapped";
  if ((flag & 2) !== 0) return "proper pair";
  return "paired";
}

export function parseReadMappingSam(samText, engineMessage = "minimap2", nameMaps = {}) {
  const rows = [];
  const referenceLengths = new Map();
  const referenceNames = nameMaps.referenceNames ?? new Map();
  const readNames = nameMaps.readNames ?? new Map();
  for (const line of String(samText ?? "").split(/\r?\n/u)) {
    if (!line.trim()) continue;
    if (line.startsWith("@SQ")) {
      const parts = line.split("\t");
      const rawName = parts.find((part) => part.startsWith("SN:"))?.slice(3);
      const name = referenceNames.get(rawName) ?? rawName;
      const length = Number.parseInt(parts.find((part) => part.startsWith("LN:"))?.slice(3), 10);
      if (name && Number.isFinite(length)) {
        referenceLengths.set(name, length);
      }
      continue;
    }
    if (line.startsWith("@")) continue;
    const fields = line.split("\t");
    if (fields.length < 11) continue;
    const [rawRead, flagText, rawReference, positionText, mapqText, cigar, rawMateReference, matePositionText, templateLengthText, sequence] = fields;
    const read = readNames.get(rawRead) ?? rawRead;
    const reference = referenceNames.get(rawReference) ?? rawReference;
    const flag = Number.parseInt(flagText, 10) || 0;
    const start = Number.parseInt(positionText, 10) || 0;
    const mapq = Number.parseInt(mapqText, 10) || 0;
    const mateReference = normalizeMateReference(rawMateReference, reference, referenceNames);
    const matePosition = Number.parseInt(matePositionText, 10);
    const templateLength = Number.parseInt(templateLengthText, 10);
    const isUnmapped = (flag & 4) !== 0 || reference === "*" || start <= 0 || cigar === "*";
    const ops = parseCigar(cigar);
    const referenceSpan = isUnmapped ? 0 : referenceSpanFromCigar(ops);
    const alignedBases = isUnmapped ? 0 : alignedBasesFromCigar(ops);
    const readLength = sequence && sequence !== "*" ? sequence.length : queryLengthFromCigar(ops);
    const mismatches = Number.parseInt(optionalTagValue(fields.slice(11), "NM"), 10);
    const identityPercent = Number.isFinite(mismatches) && alignedBases > 0
      ? clamp(((alignedBases - mismatches) / alignedBases) * 100, 0, 100)
      : "";
    rows.push({
      read,
      reference: isUnmapped ? "" : reference,
      start: isUnmapped ? "" : start,
      end: isUnmapped ? "" : start + referenceSpan - 1,
      strand: isUnmapped ? "" : ((flag & 16) !== 0 ? "-" : "+"),
      mapq: isUnmapped ? "" : mapq,
      cigar: isUnmapped ? "" : cigar,
      flag,
      paired: (flag & 1) !== 0,
      proper_pair: (flag & 2) !== 0,
      first_mate: (flag & 64) !== 0,
      second_mate: (flag & 128) !== 0,
      mate_unmapped: (flag & 8) !== 0,
      mate_reverse: (flag & 32) !== 0,
      rnext: rawMateReference || "",
      pnext: Number.isFinite(matePosition) ? matePosition : "",
      tlen: Number.isFinite(templateLength) ? templateLength : "",
      mate_reference: mateReference,
      mate_position: Number.isFinite(matePosition) && matePosition > 0 ? matePosition : "",
      template_length: Number.isFinite(templateLength) ? templateLength : "",
      mate_key: normalizeReadMateKey(read),
      mate_number: mateNumberFromFlag(flag),
      pair_status: pairStatusFromFlag(flag, isUnmapped),
      aligned_bases: alignedBases,
      read_length: readLength,
      identity_percent: identityPercent === "" ? "" : round(identityPercent, 2),
      mismatches: Number.isFinite(mismatches) ? mismatches : "",
      status: isUnmapped ? "unmapped" : "mapped",
      alignment_method: engineMessage,
      _cigarOps: ops
    });
  }
  return { rows, referenceLengths };
}

function effectiveWindowSize(referenceRecords, options, warnings) {
  const totalReferenceBases = referenceRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  const minimumWindow = niceCeiling(totalReferenceBases / options.maxCoverageBins);
  if (options.coverageWindowSize > 0) {
    if (options.coverageWindowSize < minimumWindow) {
      warnings.push(`Coverage window size was increased to ${minimumWindow.toLocaleString()} bp to keep the plot/table within ${options.maxCoverageBins.toLocaleString()} window(s).`);
      return minimumWindow;
    }
    return options.coverageWindowSize;
  }
  return minimumWindow;
}

export function buildCoverageRows(referenceRecords, alignmentRows, options, warnings = []) {
  const windowSize = effectiveWindowSize(referenceRecords, options, warnings);
  const intervalsByReference = new Map(referenceRecords.map((record) => [record.title, []]));
  for (const row of alignmentRows) {
    if (row.status !== "mapped") continue;
    if (Number(row.mapq) < options.minMapq) continue;
    if (Number(row.aligned_bases) < options.minAlignedBases) continue;
    const intervals = intervalsByReference.get(row.reference);
    if (!intervals) continue;
    intervals.push(...cigarIntervals(Number(row.start), row._cigarOps ?? []));
  }

  const rows = [];
  for (const reference of referenceRecords) {
    const diff = new Int32Array(reference.sequence.length + 3);
    for (const interval of intervalsByReference.get(reference.title) ?? []) {
      const start = clamp(interval.start, 1, reference.sequence.length);
      const end = clamp(interval.end, start, reference.sequence.length);
      diff[start] += 1;
      diff[end + 1] -= 1;
    }

    let depth = 0;
    let windowStart = 1;
    let depthSum = 0;
    let maxDepth = 0;
    let coveredBases = 0;
    for (let position = 1; position <= reference.sequence.length; position += 1) {
      depth += diff[position];
      depthSum += depth;
      maxDepth = Math.max(maxDepth, depth);
      if (depth > 0) coveredBases += 1;
      const atWindowEnd = position === reference.sequence.length || (position - windowStart + 1) >= windowSize;
      if (atWindowEnd) {
        const length = position - windowStart + 1;
        rows.push({
          reference: reference.title,
          start: windowStart,
          end: position,
          window_size: length,
          mean_depth: round(depthSum / length, 3),
          max_depth: maxDepth,
          covered_bases: coveredBases,
          covered_percent: round((coveredBases / length) * 100, 2)
        });
        windowStart = position + 1;
        depthSum = 0;
        maxDepth = 0;
        coveredBases = 0;
      }
    }
  }
  return { rows, windowSize };
}

function mappedRowsForOutput(alignmentRows, options, warnings) {
  const filtered = alignmentRows.filter((row) =>
    row.status === "mapped" &&
    Number(row.mapq) >= options.minMapq &&
    Number(row.aligned_bases) >= options.minAlignedBases
  );
  if (filtered.length > options.maxReportedAlignments) {
    warnings.push(`Mapped read table was limited to the first ${options.maxReportedAlignments.toLocaleString()} alignment row(s).`);
  }
  return filtered.slice(0, options.maxReportedAlignments).map(({ _cigarOps, ...row }) => row);
}

function makeCoveragePlot(coverageRows) {
  const references = [...new Set(coverageRows.map((row) => row.reference))];
  const series = references.map((reference, index) => ({
    id: reference,
    label: reference,
    points: coverageRows
      .filter((row) => row.reference === reference)
      .map((row) => ({
        x: (Number(row.start) + Number(row.end)) / 2,
        y: Number(row.mean_depth),
        title: `${reference}:${row.start}-${row.end} mean depth ${row.mean_depth}`
      })),
    color: ["#2563eb", "#0f766e", "#a33a3a", "#7c3aed", "#d97706", "#0369a1"][index % 6]
  }));
  const spec = makeLinePlotSpec({
    title: "Read mapping coverage plot",
    xLabel: "Reference position",
    yLabel: "Mean read depth",
    series,
    width: 980,
    height: 560,
    pointMarkers: "auto",
    pointMarkerThreshold: 80,
    showLegend: references.length > 1,
    notes: ["Coverage is summarized in fixed windows across each reference sequence."]
  });
  spec.subtitle = "Mapped-read depth after the selected MAPQ and aligned-length filters.";
  return {
    spec,
    svg: renderLinePlotSvg(spec),
    observablePlotConfig: makeObservablePlotConfig(spec)
  };
}

function summarize(referenceRecords, readRecords, alignmentRows, mappedRows, coverageRows, options, engine, command, warnings) {
  const mappedReadNames = new Set(alignmentRows.filter((row) => row.status === "mapped").map((row) => row.read));
  const filteredReadNames = new Set(mappedRows.map((row) => row.read));
  const coveredBases = coverageRows.reduce((sum, row) => sum + Number(row.covered_bases || 0), 0);
  const totalWindowBases = coverageRows.reduce((sum, row) => sum + Number(row.window_size || 0), 0);
  const weightedDepth = coverageRows.reduce((sum, row) => sum + Number(row.mean_depth || 0) * Number(row.window_size || 0), 0);
  const maxDepth = coverageRows.reduce((max, row) => Math.max(max, Number(row.max_depth || 0)), 0);
  const lines = [
    "Read Mapping Coverage output generated by SMS3 v0.0.1.",
    "",
    "Summary",
    `Reference records: ${referenceRecords.length.toLocaleString()}`,
    `Reference bases: ${referenceRecords.reduce((sum, record) => sum + record.sequence.length, 0).toLocaleString()}`,
    `Read layout: ${options.readLayout === "paired" ? "paired-end" : "single-end"}`,
    `Reads processed: ${readRecords.length.toLocaleString()}`,
    `Mapped reads: ${mappedReadNames.size.toLocaleString()}`,
    `Unmapped reads: ${(readRecords.length - mappedReadNames.size).toLocaleString()}`,
    `Mapped reads after filters: ${filteredReadNames.size.toLocaleString()}`,
    `Coverage window size: ${coverageRows[0]?.window_size?.toLocaleString?.() ?? options.coverageWindowSize.toLocaleString()} bp`,
    `Mean coverage depth: ${round(weightedDepth / Math.max(1, totalWindowBases), 3)}`,
    `Maximum coverage depth: ${maxDepth.toLocaleString()}`,
    `Covered reference bases: ${coveredBases.toLocaleString()} (${round((coveredBases / Math.max(1, totalWindowBases)) * 100, 2)}%)`,
    "",
    "Filters",
    `Minimum MAPQ: ${options.minMapq}`,
    `Minimum aligned bases: ${options.minAlignedBases.toLocaleString()}`,
    "",
    "Alignment method",
    engine,
    command ? `Command: ${command}` : "Command: not applicable",
    "",
    "Warnings",
    warnings.length ? warnings.map((warning) => `- ${warning}`).join("\n") : "None reported."
  ];
  return lines.join("\n");
}

export async function calculateReadMappingCoverage(input, options = {}, context = {}) {
  const parsed = parseReadMappingCoverageInput(input, options, context);
  const warnings = [...parsed.warnings];
  const { referenceRecords, readRecords } = parsed;
  const runOptions = parsed.options;
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "preparing-alignments", progress: 0.12 });

  let samText = "";
  let engine = "";
  let command = "";
  let samNameMaps = {};
  if (runOptions.alignmentEngine === "minimap2") {
    const mapped = await runBioWasmMinimap2(referenceRecords, readRecords, runOptions, context);
    samText = mapped.samText;
    engine = mapped.engineMessage;
    command = mapped.command;
    samNameMaps = mapped.nameMaps ?? {};
  } else {
    samText = exactMatchSam(referenceRecords, readRecords, runOptions);
    engine = "SMS3 exact-match screen";
    command = "";
  }

  context.reportProgress?.({ phase: "summarizing-alignments", progress: 0.68 });
  const parsedSam = parseReadMappingSam(samText, engine, samNameMaps);
  const alignmentRows = parsedSam.rows;
  const mappedRows = mappedRowsForOutput(alignmentRows, runOptions, warnings);
  const coverage = buildCoverageRows(referenceRecords, alignmentRows, runOptions, warnings);
  const coverageRows = coverage.rows;
  const alignmentTsv = exportDelimitedTable(readMappingAlignmentColumns, mappedRows, "\t");
  const coverageTsv = exportDelimitedTable(readMappingCoverageColumns, coverageRows, "\t");
  const plot = makeCoveragePlot(coverageRows);
  const report = summarize(referenceRecords, readRecords, alignmentRows, mappedRows, coverageRows, runOptions, engine, command, warnings);

  return {
    referenceRecords,
    readRecords,
    alignmentRows: mappedRows,
    coverageRows,
    alignmentTsv,
    coverageTsv,
    report,
    svg: plot.svg,
    plotSpec: plot.spec,
    observablePlotConfig: plot.observablePlotConfig,
    warnings,
    options: { ...runOptions, coverageWindowSize: coverage.windowSize },
    engine,
    command,
    referenceBases: parsed.referenceBases,
    readBases: parsed.readBases
  };
}
