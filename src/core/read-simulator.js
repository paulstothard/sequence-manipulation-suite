import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { cleanDnaRnaSequence } from "./sequence.js";
import { generateRandomSeed } from "./random-sequence.js";
import { exportDelimitedTable } from "./table.js";
import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";

export const WGSIM_VERSION = "2011.10.17";

const OUTPUT_FORMATS = new Set(["fastq", "fasta", "truth-table", "report"]);
const READ_LAYOUTS = new Set(["paired", "single"]);

let wgsimCliPromise = null;
let runCounter = 0;

export const readSimulatorTruthColumns = [
  { id: "read_id", label: "Read ID" },
  { id: "mate", label: "Mate" },
  { id: "reference", label: "Reference" },
  { id: "start", label: "Start" },
  { id: "end", label: "End" },
  { id: "strand", label: "Strand" },
  { id: "read_length", label: "Read length" },
  { id: "mean_quality", label: "Mean quality" },
  { id: "source", label: "Source" }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parsePositiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function parseProbabilityPercent(value, fallbackPercent) {
  const parsed = Number.parseFloat(value);
  const percent = Number.isFinite(parsed) ? parsed : fallbackPercent;
  return clamp(percent, 0, 100) / 100;
}

function normalizeSeed(seed) {
  return String(seed ?? "").trim() || generateRandomSeed();
}

export function normalizeReadSimulatorOptions(options = {}) {
  const maxReads = parsePositiveInteger(options.maxReads, 5000, 1, 1_000_000);
  const readCount = parsePositiveInteger(options.readCount, 20, 1, maxReads);
  const readLength = parsePositiveInteger(options.readLength, 100, 20, 2000);
  const insertSize = parsePositiveInteger(options.insertSize, 300, readLength, 100_000);
  const insertSizeStdDev = parsePositiveInteger(options.insertSizeStdDev, 40, 0, 100_000);
  const rawLayout = String(options.readLayout ?? "paired");
  const rawOutputFormat = String(options.outputFormat ?? "fastq");

  return {
    readLayout: READ_LAYOUTS.has(rawLayout) ? rawLayout : "paired",
    readCount,
    readLength,
    insertSize,
    insertSizeStdDev,
    baseErrorRate: parseProbabilityPercent(options.baseErrorPercent ?? Number(options.baseErrorRate) * 100, 1),
    mutationRate: parseProbabilityPercent(options.mutationPercent ?? Number(options.mutationRate) * 100, 0.1),
    indelFraction: parseProbabilityPercent(options.indelPercent ?? Number(options.indelFraction) * 100, 15),
    indelExtensionProbability: parseProbabilityPercent(options.indelExtensionPercent ?? Number(options.indelExtensionProbability) * 100, 30),
    seed: normalizeSeed(options.seed),
    outputFormat: OUTPUT_FORMATS.has(rawOutputFormat) ? rawOutputFormat : "fastq",
    maxReads,
    maxReferenceLength: parsePositiveInteger(options.maxReferenceLength, 1_000_000, 100, 500_000_000)
  };
}

function cleanRecords(records, warnings) {
  let charactersRemoved = 0;
  const titleCounts = new Map();
  const cleaned = records.map((record, index) => {
    const result = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    charactersRemoved += result.removedCount;
    if (result.removedCount > 0) {
      warnings.push(`${record.title || `record ${index + 1}`}: removed ${result.removedCount.toLocaleString()} non-DNA/RNA character(s).`);
    }
    const dna = result.sequence.replaceAll("U", "T");
    const ambiguousCount = (dna.match(/[^ACGT]/gu) ?? []).length;
    if (ambiguousCount > 0) {
      warnings.push(`${record.title || `record ${index + 1}`}: converted ${ambiguousCount.toLocaleString()} ambiguous base(s) to N for read simulation.`);
    }
    const baseTitle = record.title || `reference_${index + 1}`;
    const seenCount = titleCounts.get(baseTitle) ?? 0;
    titleCounts.set(baseTitle, seenCount + 1);
    const title = seenCount === 0 ? baseTitle : `${baseTitle} (${seenCount + 1})`;
    if (seenCount > 0) {
      warnings.push(`Reference title "${baseTitle}" appeared more than once; renamed one record to "${title}".`);
    }
    return {
      title,
      sequence: dna.replace(/[^ACGT]/gu, "N")
    };
  }).filter((record) => record.sequence.length > 0);

  return { records: cleaned, charactersRemoved };
}

export function parseReadSimulatorInput(input, rawOptions = {}) {
  const options = normalizeReadSimulatorOptions(rawOptions);
  const warnings = [];
  const parsed = cleanRecords(parseSequenceInput(input, "reference"), warnings);
  const records = parsed.records;
  if (records.length === 0) {
    throw new Error("Read Simulator requires one or more DNA/RNA reference sequences.");
  }
  const referenceLength = records.reduce((sum, record) => sum + record.sequence.length, 0);
  if (referenceLength > options.maxReferenceLength) {
    throw new Error(`Reference length ${referenceLength.toLocaleString()} bp exceeds the current limit of ${options.maxReferenceLength.toLocaleString()} bp.`);
  }
  if (!records.some((record) => record.sequence.length >= options.readLength)) {
    throw new Error(`At least one reference sequence must be at least ${options.readLength.toLocaleString()} bp for the selected read length.`);
  }
  return {
    records,
    warnings,
    charactersRemoved: parsed.charactersRemoved,
    options
  };
}

function nextRunId() {
  runCounter += 1;
  return `sms3_wgsim_${Date.now()}_${runCounter}`;
}

async function getBioWasmWgsimCli() {
  if (!wgsimCliPromise) {
    wgsimCliPromise = createBioWasmCli({
      tool: "wgsim",
      program: "wgsim",
      version: WGSIM_VERSION,
      assetPath: "../vendor/biowasm/wgsim/2011.10.17"
    });
  }
  return wgsimCliPromise;
}

async function resetBioWasmWgsimCli(cli) {
  try {
    // WGSIM leaves its Aioli module in a state that can produce empty files on the next exec.
    await cli.reinit("wgsim");
  } catch {
    wgsimCliPromise = null;
  }
}

export function buildWgsimArgs(options, referencePath, read1Path, read2Path) {
  const normalized = normalizeReadSimulatorOptions(options);
  return [
    "-e", String(normalized.baseErrorRate),
    "-d", String(normalized.insertSize),
    "-s", String(normalized.insertSizeStdDev),
    "-N", String(normalized.readCount),
    "-1", String(normalized.readLength),
    "-2", String(normalized.readLength),
    "-r", String(normalized.mutationRate),
    "-R", String(normalized.indelFraction),
    "-X", String(normalized.indelExtensionProbability),
    "-S", String(hashSeedForWgsim(normalized.seed)),
    referencePath,
    read1Path,
    read2Path
  ];
}

function makeWgsimSafeReferences(records) {
  const entries = records.map((record, index) => ({
    original: record,
    safe: { ...record, title: `sms3_reference_${index + 1}` }
  }));
  return {
    records: entries.map((entry) => entry.safe),
    referenceNameMap: new Map(entries.map((entry) => [entry.safe.title, entry.original.title]))
  };
}

function hashSeedForWgsim(seed) {
  let hash = 2166136261;
  for (const character of String(seed ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.max(1, (hash >>> 0) % 2147483647);
}

function wgsimError(stderr) {
  const message = String(stderr ?? "").trim();
  if (!message) return "";
  if (/error|failed|fail to|could not|not found|no such file|invalid|abort|segmentation/i.test(message)) {
    return `wgsim reported an error: ${message}`;
  }
  return "";
}

async function runBioWasmWgsim(parsed, context = {}) {
  requireBioWasmRuntime("Read Simulator");
  const cli = await getBioWasmWgsimCli();
  try {
    const safeReferences = makeWgsimSafeReferences(parsed.records);
    const runId = nextRunId();
    const referenceName = `${runId}_reference.fasta`;
    const read1Path = `/shared/data/${runId}_R1.fastq`;
    const read2Path = `/shared/data/${runId}_R2.fastq`;
    const referenceFasta = safeReferences.records.map((record) => formatFastaRecord(record.title, record.sequence, 60)).join("");

    context.reportProgress?.({ phase: "mounting-wgsim-reference", progress: 0.18 });
    const [referencePath] = await cli.mount([
      { name: referenceName, data: new Blob([referenceFasta], { type: "text/plain" }) }
    ]);
    context.throwIfCancelled?.();

    const args = buildWgsimArgs(parsed.options, referencePath, read1Path, read2Path);
    context.reportProgress?.({ phase: "running-wgsim", progress: 0.42 });
    const result = await cli.exec("wgsim", args);
    context.throwIfCancelled?.();
    const error = wgsimError(result?.stderr);
    if (error) {
      throw new Error(error);
    }
    const read1Fastq = String(await cli.cat(read1Path) ?? "");
    const read2Fastq = String(await cli.cat(read2Path) ?? "");
    const fastq = parsed.options.readLayout === "single"
      ? read1Fastq
      : interleaveFastqText(read1Fastq, read2Fastq);
    if (!fastq.trim()) {
      throw new Error("wgsim did not produce FASTQ output.");
    }
    return {
      fastq,
      read1Fastq,
      read2Fastq: parsed.options.readLayout === "paired" ? read2Fastq : "",
      engine: "wgsim",
      engineLabel: `WGSIM ${WGSIM_VERSION}`,
      command: `wgsim ${args.slice(0, -3).join(" ")} reference.fasta reads_R1.fastq reads_R2.fastq`.replace(/\s+/gu, " ").trim(),
      referenceNameMap: safeReferences.referenceNameMap
    };
  } finally {
    await resetBioWasmWgsimCli(cli);
  }
}

export function parseFastqRecords(fastqText) {
  const lines = String(fastqText ?? "").replace(/\r\n?/g, "\n").split("\n");
  const records = [];
  for (let index = 0; index < lines.length;) {
    if (!lines[index]) {
      index += 1;
      continue;
    }
    const titleLine = lines[index] ?? "";
    const sequence = lines[index + 1] ?? "";
    const plus = lines[index + 2] ?? "";
    const quality = lines[index + 3] ?? "";
    if (!titleLine.startsWith("@") || !plus.startsWith("+")) {
      break;
    }
    records.push({
      title: titleLine.slice(1).trim(),
      sequence,
      quality
    });
    index += 4;
  }
  return records;
}

function formatFastqRecord(record) {
  return `@${record.title}\n${record.sequence}\n+\n${record.quality}\n`;
}

export function interleaveFastqText(read1Fastq, read2Fastq) {
  const read1Records = parseFastqRecords(read1Fastq);
  const read2Records = parseFastqRecords(read2Fastq);
  const records = [];
  const pairCount = Math.min(read1Records.length, read2Records.length);

  for (let index = 0; index < pairCount; index += 1) {
    records.push(read1Records[index], read2Records[index]);
  }
  if (read1Records.length > pairCount) {
    records.push(...read1Records.slice(pairCount));
  }
  if (read2Records.length > pairCount) {
    records.push(...read2Records.slice(pairCount));
  }

  return records.map(formatFastqRecord).join("");
}

function meanQuality(quality) {
  if (!quality) return "";
  const values = Array.from(quality, (character) => character.charCodeAt(0) - 33);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number.isFinite(mean) ? Math.round(mean * 10) / 10 : "";
}

function parseCoordinatesFromReadId(title) {
  const text = String(title ?? "");
  const fallback = {
    reference: "",
    start: "",
    end: "",
    strand: ""
  };
  const sms3Match = text.match(/^(.+):(\d+)-(\d+):\d+\/([12])$/u);
  if (sms3Match) {
    return {
      reference: sms3Match[1],
      start: Number(sms3Match[2]),
      end: Number(sms3Match[3]),
      strand: sms3Match[4] === "2" ? "-" : "+"
    };
  }
  const wgsimMatch = text.match(/^(.+)_(\d+)_(\d+)_/u);
  if (wgsimMatch) {
    const start = Number(wgsimMatch[2]) + 1;
    const end = Number(wgsimMatch[3]);
    return {
      reference: wgsimMatch[1],
      start: Number.isFinite(start) ? start : "",
      end: Number.isFinite(end) ? end : "",
      strand: text.endsWith("/2") ? "-" : "+"
    };
  }
  return fallback;
}

export function fastqToTruthRows(fastq, source, referenceNameMap = new Map()) {
  return parseFastqRecords(fastq).map((record) => {
    const parsed = parseCoordinatesFromReadId(record.title);
    const reference = referenceNameMap.get(parsed.reference) ?? parsed.reference;
    const mate = record.title.endsWith("/2") ? "2" : record.title.endsWith("/1") ? "1" : "";
    return {
      read_id: record.title,
      mate,
      reference,
      start: parsed.start,
      end: parsed.end,
      strand: parsed.strand,
      read_length: record.sequence.length,
      mean_quality: meanQuality(record.quality),
      source
    };
  });
}

export function fastqToFasta(fastq) {
  return parseFastqRecords(fastq)
    .map((record) => formatFastaRecord(record.title, record.sequence, 60))
    .join("");
}

export function makeReadSimulatorReport(result) {
  const options = result.options;
  const readRecords = parseFastqRecords(result.fastq);
  const rows = result.truthRows;
  const referenceNames = result.records.map((record) => record.title).join(", ");
  const totalReadBases = readRecords.reduce((sum, record) => sum + record.sequence.length, 0);
  const lines = [
    "Read Simulator report",
    "",
    `Reference records: ${result.records.length}`,
    `Reference bases: ${result.records.reduce((sum, record) => sum + record.sequence.length, 0).toLocaleString()}`,
    `References: ${referenceNames}`,
    "",
    `Read layout: ${options.readLayout === "paired" ? "paired-end" : "single-end"}`,
    ...(options.readLayout === "paired"
      ? ["Paired read files: R1/R2 downloads are available for read sequence outputs; the main preview is interleaved for single-file copy/paste."]
      : []),
    `Read pairs/requested reads: ${options.readCount.toLocaleString()}`,
    `FASTQ records: ${readRecords.length.toLocaleString()}`,
    `Read bases: ${totalReadBases.toLocaleString()}`,
    `Read length: ${options.readLength.toLocaleString()} bp`,
    ...(options.readLayout === "paired"
      ? [
          `Insert size: ${options.insertSize.toLocaleString()} bp`,
          `Insert size standard deviation: ${options.insertSizeStdDev.toLocaleString()} bp`
        ]
      : []),
    "",
    `Base error rate: ${(options.baseErrorRate * 100).toFixed(3)}%`,
    `Mutation rate: ${(options.mutationRate * 100).toFixed(3)}%`,
    `Indel fraction: ${(options.indelFraction * 100).toFixed(3)}%`,
    `Indel extension probability: ${(options.indelExtensionProbability * 100).toFixed(3)}%`,
    `Random seed: ${options.seed}`,
    `Simulation engine: ${result.engineLabel}`,
    ...(result.command ? [`Command: ${result.command}`] : []),
    "",
    `Truth/read metadata rows: ${rows.length.toLocaleString()}`
  ];
  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...result.warnings.map((warning) => `- ${warning}`));
  }
  lines.push("", "Reference: Li H. wgsim read simulator, distributed with SAMtools.");
  return lines.join("\n");
}

export async function simulateReads(input, rawOptions = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-reference", progress: 0.05 });
  const parsed = parseReadSimulatorInput(input, rawOptions);
  context.throwIfCancelled?.();
  const warnings = [...parsed.warnings];
  const simulation = await runBioWasmWgsim(parsed, context);

  const truthRows = simulation.rows?.length
    ? simulation.rows
    : fastqToTruthRows(simulation.fastq, simulation.engineLabel, simulation.referenceNameMap);
  const result = {
    ...simulation,
    records: parsed.records,
    options: parsed.options,
    warnings,
    charactersRemoved: parsed.charactersRemoved,
    truthRows
  };
  result.fasta = fastqToFasta(result.fastq);
  result.read1Fasta = fastqToFasta(result.read1Fastq ?? "");
  result.read2Fasta = fastqToFasta(result.read2Fastq ?? "");
  result.truthTsv = exportDelimitedTable(readSimulatorTruthColumns, truthRows, "\t");
  result.report = makeReadSimulatorReport(result);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
