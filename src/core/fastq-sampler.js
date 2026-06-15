import { streamTextLines } from "./compressed-text-reader.js";
import { resolveRandom, randomInteger } from "./random-sequence.js";
import { exportDelimitedTable } from "./table.js";

export const fastqSamplerColumns = [
  { id: "sample_order", label: "Sample order", type: "number" },
  { id: "source_index", label: "Source index", type: "number" },
  { id: "read_name", label: "Read name", type: "string" },
  { id: "mate", label: "Mate", type: "string" },
  { id: "read_length", label: "Read length", type: "number" },
  { id: "mean_quality", label: "Mean quality", type: "number" }
];

const LAYOUTS = new Set(["single", "paired"]);

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeFastqSamplerOptions(options = {}) {
  return {
    readLayout: LAYOUTS.has(options.readLayout) ? options.readLayout : "single",
    sampleSize: clampInteger(options.sampleSize, 1000, 0, 1000000),
    maxInputReads: clampInteger(options.maxInputReads, 5000000, 1, 100000000),
    maxOutputBytes: clampInteger(options.maxOutputBytes, 200000000, 1000, 2000000000)
  };
}

function checkCancelled(context, counter = 0, interval = 2048) {
  if (counter % interval === 0) {
    context?.throwIfCancelled?.();
  }
}

function textToChunks(text) {
  return [String(text ?? "")];
}

function makeChunksFromSource(source = {}) {
  if (source.chunks) return source.chunks;
  return textToChunks(source.text ?? "");
}

function formatFastqRecord(record) {
  return [
    record.title,
    record.sequence,
    record.plus,
    record.quality
  ].join("\n");
}

export function makeFastqText(records = []) {
  return records.map(formatFastqRecord).join("\n") + (records.length > 0 ? "\n" : "");
}

function readName(title) {
  return String(title ?? "").replace(/^@/u, "").trim().split(/\s+/u)[0] || "";
}

function readPairKey(title) {
  return readName(title).replace(/\/[12]$/u, "");
}

function meanQuality(quality) {
  const text = String(quality ?? "");
  if (!text) return 0;
  let total = 0;
  for (const character of text) {
    total += character.charCodeAt(0) - 33;
  }
  return Number((total / text.length).toFixed(3));
}

function makeRecordWarnings(record, recordNumber) {
  const warnings = [];
  if (!record.title.startsWith("@")) {
    warnings.push(`FASTQ record ${recordNumber.toLocaleString()} title line does not start with @.`);
  }
  if (!record.plus.startsWith("+")) {
    warnings.push(`FASTQ record ${recordNumber.toLocaleString()} separator line does not start with +.`);
  }
  if (record.sequence.length !== record.quality.length) {
    warnings.push(`FASTQ record ${recordNumber.toLocaleString()} sequence length (${record.sequence.length}) differs from quality length (${record.quality.length}).`);
  }
  return warnings;
}

async function* parseFastqRecordStream(chunks, context = {}) {
  const pending = [];
  let nonEmptyRecordNumber = 0;
  let lineCount = 0;
  for await (const line of streamTextLines(chunks, { signal: context.signal })) {
    lineCount += 1;
    pending.push(String(line ?? ""));
    if (pending.length < 4) continue;
    nonEmptyRecordNumber += 1;
    const record = {
      title: pending[0],
      sequence: pending[1],
      plus: pending[2],
      quality: pending[3]
    };
    yield {
      record,
      recordNumber: nonEmptyRecordNumber,
      warnings: makeRecordWarnings(record, nonEmptyRecordNumber)
    };
    pending.length = 0;
    checkCancelled(context, nonEmptyRecordNumber, 1024);
  }
  if (pending.length > 0 && !(pending.length === 1 && pending[0] === "")) {
    yield {
      record: null,
      recordNumber: nonEmptyRecordNumber + 1,
      warnings: [`FASTQ input ended with ${pending.length.toLocaleString()} incomplete line(s) after ${lineCount.toLocaleString()} total line(s).`]
    };
  }
}

function addReservoirItem(reservoir, item, seenCount, sampleSize, random) {
  if (sampleSize <= 0) return;
  if (reservoir.length < sampleSize) {
    reservoir.push(item);
    return;
  }
  const replacementIndex = randomInteger(random, seenCount);
  if (replacementIndex < sampleSize) {
    reservoir[replacementIndex] = item;
  }
}

function sortSampledItems(items) {
  return [...items].sort((left, right) => left.sourceIndex - right.sourceIndex);
}

function makeRowsFromSingleRecords(records) {
  return records.map((item, index) => ({
    sample_order: index + 1,
    source_index: item.sourceIndex,
    read_name: readName(item.record.title),
    mate: "single",
    read_length: item.record.sequence.length,
    mean_quality: meanQuality(item.record.quality)
  }));
}

function makeRowsFromPairs(pairs) {
  return pairs.flatMap((item, index) => [
    {
      sample_order: index + 1,
      source_index: item.sourceIndex,
      read_name: readName(item.read1.title),
      mate: "R1",
      read_length: item.read1.sequence.length,
      mean_quality: meanQuality(item.read1.quality)
    },
    {
      sample_order: index + 1,
      source_index: item.sourceIndex,
      read_name: readName(item.read2.title),
      mate: "R2",
      read_length: item.read2.sequence.length,
      mean_quality: meanQuality(item.read2.quality)
    }
  ]);
}

function maybeWarnOutputSize(text, maxOutputBytes, warnings, label) {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxOutputBytes) {
    throw new Error(`${label} is ${bytes.toLocaleString()} byte(s), which exceeds the current ${maxOutputBytes.toLocaleString()} byte browser-local output limit. Reduce the sample size or raise the limit.`);
  }
  if (bytes > Math.floor(maxOutputBytes * 0.8)) {
    warnings.push(`${label} uses ${bytes.toLocaleString()} byte(s), close to the current ${maxOutputBytes.toLocaleString()} byte output limit.`);
  }
  return bytes;
}

export async function sampleSingleEndFastq(source = {}, rawOptions = {}, context = {}) {
  const options = normalizeFastqSamplerOptions(rawOptions);
  const { seed, random } = resolveRandom(rawOptions);
  const warnings = [];
  const reservoir = [];
  let seenRecords = 0;
  let stoppedAtLimit = false;
  const chunks = makeChunksFromSource(source);

  for await (const item of parseFastqRecordStream(chunks, context)) {
    if (item.warnings.length) warnings.push(...item.warnings);
    if (!item.record) continue;
    if (seenRecords >= options.maxInputReads) {
      stoppedAtLimit = true;
      break;
    }
    seenRecords += 1;
    addReservoirItem(reservoir, { sourceIndex: seenRecords, record: item.record }, seenRecords, options.sampleSize, random);
    if (seenRecords % 1000 === 0) {
      context.reportProgress?.({ phase: "sampling-fastq", recordsProcessed: seenRecords });
      await context.yieldIfNeeded?.();
    }
  }

  if (stoppedAtLimit) {
    warnings.push(`Sampling stopped after the first ${options.maxInputReads.toLocaleString()} FASTQ record(s).`);
  }
  if (options.sampleSize > seenRecords) {
    warnings.push(`Requested ${options.sampleSize.toLocaleString()} read(s), but only ${seenRecords.toLocaleString()} read(s) were available.`);
  }

  const sampledItems = sortSampledItems(reservoir);
  const sampledFastq = makeFastqText(sampledItems.map((item) => item.record));
  const rows = makeRowsFromSingleRecords(sampledItems);
  const outputBytes = maybeWarnOutputSize(sampledFastq, options.maxOutputBytes, warnings, "Sampled FASTQ output");

  return {
    layout: "single",
    seed,
    requestedSampleSize: options.sampleSize,
    availableReads: seenRecords,
    sampledReads: sampledItems.length,
    sampledPairs: 0,
    sampledFastq,
    read1Fastq: "",
    read2Fastq: "",
    interleavedFastq: "",
    rows,
    warnings,
    outputBytes,
    options
  };
}

export async function samplePairedEndFastq(read1Source = {}, read2Source = {}, rawOptions = {}, context = {}) {
  const options = normalizeFastqSamplerOptions({ ...rawOptions, readLayout: "paired" });
  const { seed, random } = resolveRandom(rawOptions);
  const warnings = [];
  const reservoir = [];
  const read1Iterator = parseFastqRecordStream(makeChunksFromSource(read1Source), context)[Symbol.asyncIterator]();
  const read2Iterator = parseFastqRecordStream(makeChunksFromSource(read2Source), context)[Symbol.asyncIterator]();
  let seenPairs = 0;
  let stoppedAtLimit = false;
  let nameMismatchWarnings = 0;

  while (true) {
    const [read1Next, read2Next] = await Promise.all([read1Iterator.next(), read2Iterator.next()]);
    if (read1Next.done && read2Next.done) break;
    if (read1Next.done || read2Next.done) {
      warnings.push("Paired FASTQ inputs contain different numbers of records; sampling stopped at the last complete pair.");
      break;
    }
    const left = read1Next.value;
    const right = read2Next.value;
    if (left.warnings.length) warnings.push(...left.warnings.map((warning) => `R1 ${warning}`));
    if (right.warnings.length) warnings.push(...right.warnings.map((warning) => `R2 ${warning}`));
    if (!left.record || !right.record) continue;
    if (seenPairs >= options.maxInputReads) {
      stoppedAtLimit = true;
      break;
    }
    seenPairs += 1;
    if (readPairKey(left.record.title) !== readPairKey(right.record.title) && nameMismatchWarnings < 5) {
      nameMismatchWarnings += 1;
      warnings.push(`Mate pair ${seenPairs.toLocaleString()} has different read names: ${readName(left.record.title)} and ${readName(right.record.title)}.`);
    }
    addReservoirItem(
      reservoir,
      { sourceIndex: seenPairs, read1: left.record, read2: right.record },
      seenPairs,
      options.sampleSize,
      random
    );
    if (seenPairs % 1000 === 0) {
      context.reportProgress?.({ phase: "sampling-paired-fastq", recordsProcessed: seenPairs });
      await context.yieldIfNeeded?.();
    }
  }

  if (nameMismatchWarnings >= 5) {
    warnings.push("Additional mate-name mismatches were suppressed.");
  }
  if (stoppedAtLimit) {
    warnings.push(`Sampling stopped after the first ${options.maxInputReads.toLocaleString()} FASTQ pair(s).`);
  }
  if (options.sampleSize > seenPairs) {
    warnings.push(`Requested ${options.sampleSize.toLocaleString()} read pair(s), but only ${seenPairs.toLocaleString()} pair(s) were available.`);
  }

  const sampledPairs = sortSampledItems(reservoir);
  const read1Fastq = makeFastqText(sampledPairs.map((item) => item.read1));
  const read2Fastq = makeFastqText(sampledPairs.map((item) => item.read2));
  const interleavedFastq = makeFastqText(sampledPairs.flatMap((item) => [item.read1, item.read2]));
  const rows = makeRowsFromPairs(sampledPairs);
  const outputBytes = maybeWarnOutputSize(interleavedFastq, options.maxOutputBytes, warnings, "Interleaved paired FASTQ output");

  return {
    layout: "paired",
    seed,
    requestedSampleSize: options.sampleSize,
    availableReads: seenPairs,
    sampledReads: sampledPairs.length * 2,
    sampledPairs: sampledPairs.length,
    sampledFastq: "",
    read1Fastq,
    read2Fastq,
    interleavedFastq,
    rows,
    warnings,
    outputBytes,
    options
  };
}

export function makeFastqSamplerReport(result) {
  const unit = result.layout === "paired" ? "read pairs" : "reads";
  return [
    "FASTQ read sampling report",
    "",
    `Read layout: ${result.layout === "paired" ? "paired-end" : "single-end"}`,
    `Random seed: ${result.seed}`,
    `Available ${unit}: ${result.availableReads.toLocaleString()}`,
    `Requested sample size: ${result.requestedSampleSize.toLocaleString()}`,
    `Sampled ${unit}: ${(result.layout === "paired" ? result.sampledPairs : result.sampledReads).toLocaleString()}`,
    result.layout === "paired" ? `Sampled reads: ${result.sampledReads.toLocaleString()}` : null,
    `Output bytes: ${result.outputBytes.toLocaleString()}`,
    "",
    "Method: streaming reservoir sampling without replacement.",
    ...result.warnings.map((warning) => `Warning: ${warning}`)
  ].filter(Boolean).join("\n") + "\n";
}

export function makeFastqSamplerTable(rows) {
  return exportDelimitedTable(fastqSamplerColumns, rows);
}
