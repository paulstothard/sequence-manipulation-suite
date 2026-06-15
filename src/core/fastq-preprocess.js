import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import { exportDelimitedTable } from "./table.js";

export const FASTP_VERSION = "0.20.1";

export const fastqPreprocessSummaryColumns = [
  { id: "metric", label: "Metric", type: "string" },
  { id: "value", label: "Value", type: "string" },
  { id: "unit", label: "Unit", type: "string" },
  { id: "assessment", label: "Assessment", type: "string" }
];

const OUTPUT_FORMATS = new Set(["fastq", "interleaved-fastq", "read1-fastq", "read2-fastq", "table", "report"]);
const READ_LAYOUTS = new Set(["single", "paired"]);
let fastpCliPromise = null;
let fastpRunCounter = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function parsePercent(value, fallback) {
  const parsed = Number.parseFloat(value);
  return clamp(Number.isFinite(parsed) ? parsed : fallback, 0, 100);
}

export function normalizeFastqPreprocessOptions(options = {}) {
  const rawOutputFormat = String(options.outputFormat ?? "report");
  return {
    readLayout: READ_LAYOUTS.has(options.readLayout) ? options.readLayout : "single",
    qualityCutoff: parseInteger(options.qualityCutoff, 20, 2, 40),
    maxLowQualityPercent: parsePercent(options.maxLowQualityPercent, 40),
    minimumLength: parseInteger(options.minimumLength, 30, 1, 10000),
    maximumNCount: parseInteger(options.maximumNCount, 5, 0, 1000),
    trimTailLowQuality: options.trimTailLowQuality !== false,
    outputFormat: OUTPUT_FORMATS.has(rawOutputFormat) ? rawOutputFormat : "report",
    maxReads: parseInteger(options.maxReads, 100000, 1, 10000000),
    maxInputBases: parseInteger(options.maxInputBases, 100000000, 100, 2000000000),
    maxInputBytes: parseInteger(options.maxInputBytes, 200000000, 100, 4000000000)
  };
}

function checkCancelled(context, counter = 0, interval = 1024) {
  if (counter % interval === 0) {
    context?.throwIfCancelled?.();
  }
}

export function parseFastqRecords(input, options = {}, context = {}) {
  const normalized = normalizeFastqPreprocessOptions(options);
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.length > 0);
  const records = [];
  const warnings = [];

  if (lines.length === 0) {
    throw new Error("FASTQ Quality Trimmer requires FASTQ records or a FASTQ file.");
  }
  if (lines.length % 4 !== 0) {
    warnings.push(`FASTQ input has ${lines.length.toLocaleString()} non-empty line(s), which is not divisible by 4.`);
  }

  for (let index = 0; index + 3 < lines.length; index += 4) {
    checkCancelled(context, records.length, 512);
    if (records.length >= normalized.maxReads) {
      warnings.push(`Only the first ${normalized.maxReads.toLocaleString()} FASTQ record(s) were processed.`);
      break;
    }
    const recordNumber = records.length + 1;
    const titleLine = lines[index];
    const sequence = lines[index + 1] ?? "";
    const separator = lines[index + 2] ?? "";
    const quality = lines[index + 3] ?? "";

    if (!titleLine.startsWith("@")) {
      warnings.push(`Record ${recordNumber} title line does not start with @.`);
    }
    if (!separator.startsWith("+")) {
      warnings.push(`Record ${recordNumber} separator line does not start with +.`);
    }
    if (sequence.length !== quality.length) {
      warnings.push(`Record ${recordNumber} sequence length (${sequence.length}) differs from quality length (${quality.length}); paired bases and qualities were clipped to the shorter length.`);
    }

    const usableLength = Math.min(sequence.length, quality.length);
    records.push({
      title: titleLine.replace(/^@/u, "") || `read_${recordNumber}`,
      sequence: sequence.slice(0, usableLength),
      quality: quality.slice(0, usableLength)
    });
  }

  return { records, warnings };
}

async function getFastpCli() {
  if (!fastpCliPromise) {
    fastpCliPromise = createBioWasmCli({
      tool: "fastp",
      program: "fastp",
      version: FASTP_VERSION,
      assetPath: "../vendor/biowasm/fastp/0.20.1"
    }).catch((error) => {
      fastpCliPromise = null;
      throw error;
    });
  }
  return fastpCliPromise;
}

function nextFastpRunId() {
  fastpRunCounter += 1;
  return `sms3_fastp_${Date.now()}_${fastpRunCounter}`;
}

export function buildFastpArgs(options, inputPath, outputPath, jsonPath, htmlPath, input2Path = "", output2Path = "") {
  const normalized = normalizeFastqPreprocessOptions(options);
  const args = [
    "-i", inputPath,
    "-o", outputPath,
    ...(normalized.readLayout === "paired" ? ["-I", input2Path, "-O", output2Path] : []),
    "-j", jsonPath,
    "-h", htmlPath,
    "-q", String(normalized.qualityCutoff),
    "-u", String(normalized.maxLowQualityPercent),
    "-n", String(normalized.maximumNCount),
    "-l", String(normalized.minimumLength),
    "-A"
  ];
  if (normalized.trimTailLowQuality) {
    args.push("--cut_tail", "--cut_tail_mean_quality", String(normalized.qualityCutoff));
  }
  return args;
}

function fastqRecordsFromText(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const records = [];
  for (let index = 0; index + 3 < lines.length; index += 4) {
    records.push(lines.slice(index, index + 4).join("\n"));
  }
  return records;
}

function interleaveFastqText(read1Text, read2Text) {
  const read1Records = fastqRecordsFromText(read1Text);
  const read2Records = fastqRecordsFromText(read2Text);
  const pairCount = Math.min(read1Records.length, read2Records.length);
  const interleaved = [];
  for (let index = 0; index < pairCount; index += 1) {
    interleaved.push(read1Records[index], read2Records[index]);
  }
  return interleaved.join("\n") + (interleaved.length > 0 ? "\n" : "");
}

function fastpError(stderr) {
  const message = String(stderr ?? "").trim();
  if (!message) return "";
  if (
    /^error\b|^error:/imu.test(message) ||
    /(?:failed|fail) to (?:open|load|read|write|create|parse|initialize)|could not|not found|no such file|invalid input|abort|segmentation/iu.test(message)
  ) {
    return `fastp reported an error: ${message}`;
  }
  return "";
}

function rowsFromFastpJson(json, options, engineLabel, command) {
  const before = json?.summary?.before_filtering ?? {};
  const after = json?.summary?.after_filtering ?? {};
  const filtering = json?.filtering_result ?? {};
  const inputReads = Number(before.total_reads ?? 0);
  const outputReads = Number(after.total_reads ?? filtering.passed_filter_reads ?? 0);
  const inputBases = Number(before.total_bases ?? 0);
  const outputBases = Number(after.total_bases ?? 0);
  const discardedReads = Math.max(0, inputReads - outputReads);
  const beforeQ30 = Number(before.q30_rate ?? 0) * 100;
  const afterQ30 = Number(after.q30_rate ?? 0) * 100;
  const beforeGc = Number(before.gc_content ?? 0) * 100;
  const afterGc = Number(after.gc_content ?? 0) * 100;
  const roundNumber = (value, digits = 3) => Number.isFinite(value) ? Number(value.toFixed(digits)) : "";

  const summaryRows = [
    { metric: "engine", value: engineLabel, unit: "", assessment: "local" },
    { metric: "read_layout", value: options.readLayout === "paired" ? "paired-end" : "single-end", unit: "", assessment: "" },
    { metric: "input_reads", value: inputReads, unit: "reads", assessment: "" },
    { metric: "kept_reads", value: outputReads, unit: "reads", assessment: discardedReads === 0 ? "all kept" : "filtered" },
    { metric: "discarded_reads", value: discardedReads, unit: "reads", assessment: discardedReads === 0 ? "none" : "review" },
    { metric: "input_bases", value: inputBases, unit: "bases", assessment: "" },
    { metric: "output_bases", value: outputBases, unit: "bases", assessment: "" },
    { metric: "q30_before", value: roundNumber(beforeQ30, 3), unit: "%", assessment: beforeQ30 >= 80 ? "good" : "review" },
    { metric: "q30_after", value: roundNumber(afterQ30, 3), unit: "%", assessment: afterQ30 >= 80 ? "good" : "review" },
    { metric: "gc_before", value: roundNumber(beforeGc, 3), unit: "%", assessment: "" },
    { metric: "gc_after", value: roundNumber(afterGc, 3), unit: "%", assessment: "" },
    { metric: "too_short_reads", value: Number(filtering.too_short_reads ?? 0), unit: "reads", assessment: "" },
    { metric: "too_many_n_reads", value: Number(filtering.too_many_N_reads ?? filtering.too_many_n_reads ?? 0), unit: "reads", assessment: "" },
    { metric: "low_quality_reads", value: Number(filtering.low_quality_reads ?? 0), unit: "reads", assessment: "" },
    { metric: "quality_cutoff", value: options.qualityCutoff, unit: "Phred", assessment: "" },
    { metric: "maximum_low_quality_percent", value: options.maxLowQualityPercent, unit: "%", assessment: "" },
    { metric: "minimum_length", value: options.minimumLength, unit: "bases", assessment: "" },
    { metric: "maximum_n_count", value: options.maximumNCount, unit: "bases", assessment: "" }
  ];

  const report = [
    options.readLayout === "paired" ? "FASTQ paired-end quality trimming report" : "FASTQ quality trimming report",
    "",
    `Engine: ${engineLabel}`,
    `Command: ${command}`,
    `Input reads: ${inputReads.toLocaleString()}`,
    `Kept reads: ${outputReads.toLocaleString()}`,
    `Discarded reads: ${discardedReads.toLocaleString()}`,
    `Input bases: ${inputBases.toLocaleString()}`,
    `Output bases: ${outputBases.toLocaleString()}`,
    `Q30 before: ${roundNumber(beforeQ30, 2)}%`,
    `Q30 after: ${roundNumber(afterQ30, 2)}%`,
    `GC before: ${roundNumber(beforeGc, 2)}%`,
    `GC after: ${roundNumber(afterGc, 2)}%`,
    "",
    "Settings",
    `Quality cutoff: Q${options.qualityCutoff}`,
    `Maximum low-quality bases: ${options.maxLowQualityPercent}%`,
    `Minimum retained length: ${options.minimumLength} bases`,
    `Maximum N bases per read: ${options.maximumNCount}`,
    `Trim low-quality tail: ${options.trimTailLowQuality ? "yes" : "no"}`,
    "",
    "Filter counts",
    `Too short: ${Number(filtering.too_short_reads ?? 0).toLocaleString()}`,
    `Too many N bases: ${Number(filtering.too_many_N_reads ?? filtering.too_many_n_reads ?? 0).toLocaleString()}`,
    `Low quality: ${Number(filtering.low_quality_reads ?? 0).toLocaleString()}`
  ].join("\n");

  return { summaryRows, report, inputBases, outputBases, inputReads, outputReads };
}

async function runFastp(source, options, context = {}) {
  const paired = options.readLayout === "paired";
  const sourceFile = paired ? source?.read1File : source?.file;
  const sourceFile2 = paired ? source?.read2File : null;
  const sourceText = paired ? String(source?.read1Text ?? "") : String(source?.text ?? "");
  const sourceText2 = paired ? String(source?.read2Text ?? "") : "";
  const hasSource1 = Boolean(sourceFile || sourceText.trim());
  const hasSource2 = Boolean(sourceFile2 || sourceText2.trim());
  if (sourceFile && Number(sourceFile.size ?? 0) > options.maxInputBytes) {
    throw new Error(`FASTQ file is larger than the current ${options.maxInputBytes.toLocaleString()} byte browser-local processing limit.`);
  }
  if (sourceFile2 && Number(sourceFile2.size ?? 0) > options.maxInputBytes) {
    throw new Error(`FASTQ Read 2 file is larger than the current ${options.maxInputBytes.toLocaleString()} byte browser-local processing limit.`);
  }
  if (paired && (!hasSource1 || !hasSource2)) {
    throw new Error("FASTQ Quality Trimmer paired-end mode requires both Read 1 and Read 2 FASTQ inputs.");
  }
  if (!sourceFile && sourceText.length > options.maxInputBytes) {
    throw new Error(`FASTQ text is larger than the current ${options.maxInputBytes.toLocaleString()} byte browser-local processing limit.`);
  }
  if (paired && !sourceFile2 && sourceText2.length > options.maxInputBytes) {
    throw new Error(`FASTQ Read 2 text is larger than the current ${options.maxInputBytes.toLocaleString()} byte browser-local processing limit.`);
  }
  requireBioWasmRuntime("FASTQ Quality Trimmer");
  const cli = await getFastpCli();
  const runId = nextFastpRunId();
  const sourceName = sourceFile?.name || "input.fastq";
  const sourceName2 = sourceFile2?.name || "input_R2.fastq";
  const inputName = `${runId}_${sourceName.replace(/[^A-Za-z0-9_.-]/gu, "_") || "input.fastq"}`;
  const inputName2 = `${runId}_${sourceName2.replace(/[^A-Za-z0-9_.-]/gu, "_") || "input_R2.fastq"}`;
  const outputPath = `/shared/data/${runId}_trimmed.fastq`;
  const output2Path = `/shared/data/${runId}_trimmed_R2.fastq`;
  const jsonPath = `/shared/data/${runId}_fastp.json`;
  const htmlPath = `/shared/data/${runId}_fastp.html`;
  const sourceData = sourceFile ?? new Blob([sourceText], { type: "text/plain" });

  context.reportProgress?.({ phase: "mounting-fastq", progress: 0.08 });
  const mounts = [{ name: inputName, data: sourceData }];
  if (paired) {
    mounts.push({ name: inputName2, data: sourceFile2 ?? new Blob([sourceText2], { type: "text/plain" }) });
  }
  const mountedPaths = await cli.mount(mounts);
  const inputPath = mountedPaths[0];
  const input2Path = mountedPaths[1] ?? "";
  context.throwIfCancelled?.();

  const args = buildFastpArgs(options, inputPath, outputPath, jsonPath, htmlPath, input2Path, output2Path);
  const command = `fastp ${args.map((arg) => arg.startsWith("/shared/") ? arg.replace(/^\/shared\/data\//u, "") : arg).join(" ")}`.replace(/\s+/gu, " ").trim();
  context.reportProgress?.({ phase: "running-fastp", progress: 0.42 });
  const result = await cli.exec("fastp", args);
  context.throwIfCancelled?.();
  const error = fastpError(result?.stderr);
  if (error) {
    throw new Error(error);
  }

  const jsonText = await cli.cat(jsonPath);
  const json = JSON.parse(String(jsonText ?? "{}"));
  const engineLabel = `fastp ${FASTP_VERSION}`;
  const summarized = rowsFromFastpJson(json, options, engineLabel, command);
  let fastq = "";
  let read1Fastq = "";
  let read2Fastq = "";
  let interleavedFastq = "";
  if (options.outputFormat === "fastq") {
    context.reportProgress?.({ phase: "reading-trimmed-fastq", progress: 0.82 });
    fastq = String(await cli.cat(outputPath) ?? "");
  } else if (options.outputFormat === "read1-fastq") {
    context.reportProgress?.({ phase: "reading-trimmed-r1-fastq", progress: 0.82 });
    read1Fastq = String(await cli.cat(outputPath) ?? "");
  } else if (options.outputFormat === "read2-fastq") {
    context.reportProgress?.({ phase: "reading-trimmed-r2-fastq", progress: 0.82 });
    read2Fastq = String(await cli.cat(output2Path) ?? "");
  } else if (options.outputFormat === "interleaved-fastq") {
    context.reportProgress?.({ phase: "reading-trimmed-paired-fastq", progress: 0.82 });
    read1Fastq = String(await cli.cat(outputPath) ?? "");
    read2Fastq = String(await cli.cat(output2Path) ?? "");
    interleavedFastq = interleaveFastqText(read1Fastq, read2Fastq);
  }
  return {
    ...summarized,
    fastq,
    read1Fastq,
    read2Fastq,
    interleavedFastq,
    engine: "fastp",
    engineLabel,
    command,
    options,
    warnings: [],
    recordsProcessed: summarized.inputReads
  };
}

export async function preprocessFastq(source, rawOptions = {}, context = {}) {
  const options = normalizeFastqPreprocessOptions(rawOptions);
  const normalizedSource = typeof source === "string" ? { text: source } : source;
  return runFastp(normalizedSource, options, context);
}

export function makeFastqPreprocessTable(summaryRows) {
  return exportDelimitedTable(fastqPreprocessSummaryColumns, summaryRows);
}
