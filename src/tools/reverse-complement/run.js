import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "../../core/sequence.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";
import { normalizeReverseComplementOptions } from "../../core/reverse-complement-options.js";

const WORKER_CHUNK_SIZE = 100_000;

export function complementSequence(sequence, options = {}) {
  return { sequence: complementDnaRnaSequence(sequence, normalizeReverseComplementOptions(options)), warnings: [] };
}

export function reverseComplementSequence(sequence, options = {}) {
  return transformSequence(sequence, normalizeReverseComplementOptions(options));
}

function transformSequence(sequence, options) {
  const operation = options.operation;
  const source = String(sequence ?? "");

  if (operation === "reverse") {
    const normalized = options.preserveCase === false ? source.toUpperCase() : source;
    return { sequence: Array.from(normalized).reverse().join(""), warnings: [] };
  }

  const complemented = { sequence: complementDnaRnaSequence(source, options), warnings: [] };

  if (operation === "complement") {
    return complemented;
  }

  return {
    sequence: Array.from(complemented.sequence).reverse().join(""),
    warnings: complemented.warnings
  };
}

async function cleanDnaRnaSequenceChunked(sequence, options, context) {
  const source = String(sequence ?? "");
  const chunks = [];
  let removedCount = 0;
  let length = 0;

  for (let index = 0; index < source.length; index += WORKER_CHUNK_SIZE) {
    context.throwIfCancelled?.();
    const cleaned = cleanDnaRnaSequence(source.slice(index, index + WORKER_CHUNK_SIZE), options);
    chunks.push(cleaned.sequence);
    removedCount += cleaned.removedCount;
    length += cleaned.sequence.length;
    await context.yieldIfNeeded?.();
  }

  return { chunks, length, removedCount };
}

async function transformCleanedChunks(chunks, options, context) {
  const reverseOrder = options.operation !== "complement";
  const outputChunks = [];
  for (let step = 0; step < chunks.length; step += 1) {
    context.throwIfCancelled?.();
    const index = reverseOrder ? chunks.length - 1 - step : step;
    outputChunks.push(transformSequence(chunks[index], options).sequence);
    await context.yieldIfNeeded?.();
  }
  return outputChunks.join("");
}

export async function runReverseComplement(input, options = {}, context = {}) {
  const settings = normalizeReverseComplementOptions(options);
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const records = parseSequenceInput(input, "sequence");
  await context.yieldIfNeeded?.();

  if (records.length === 0) {
    return makeToolResult({
      optionsUsed: settings,
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const warnings = [];
  const outputParts = [];
  const transformedRecords = [];
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    context.reportProgress?.({
      phase: "transforming-records",
      progress: 0.1 + 0.75 * (recordIndex / Math.max(1, records.length))
    });
    const cleaned = await cleanDnaRnaSequenceChunked(record.sequence, settings, context);
    basesProcessed += cleaned.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    const sequence = await transformCleanedChunks(cleaned.chunks, settings, context);
    const suffix =
      settings.operation === "reverse"
        ? " reverse"
        : settings.operation === "complement"
          ? " complement"
          : " reverse complement";
    const title = `${record.title}${suffix}`;
    transformedRecords.push({
      title,
      sequence,
      sourceTitle: record.title,
      operation: settings.operation,
      preserveCase: settings.preserveCase
    });

    outputParts.push(formatFastaRecord(title, sequence, settings.lineWidth));
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const output = outputParts.join("\n");

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    optionsUsed: settings,
    output,
    download: {
      filename: "reverse-complement.fasta",
      mimeType: "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed,
    charactersRemoved,
    streams: {
      fasta: makeTextStream(output, "text/x-fasta"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "reverse-complement-dna-rna",
        alphabet: "dna-rna",
        records: transformedRecords
      }
    }
  });
}

// Keep the existing worker export name as an alias, never a second implementation.
export { runReverseComplement as runReverseComplementWorker };
