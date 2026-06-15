import { formatFastaRecord, parseSequenceInput } from "../../core/fasta.js";
import { cleanDnaRnaSequence, complementDnaRnaSequence } from "../../core/sequence.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

const WORKER_CHUNK_SIZE = 100_000;

export function complementSequence(sequence, options = {}) {
  return { sequence: complementDnaRnaSequence(sequence, options), warnings: [] };
}

export function reverseComplementSequence(sequence, options = {}) {
  const operation = options.operation ?? "reverse-complement";
  const source = String(sequence ?? "");

  if (operation === "reverse") {
    return { sequence: Array.from(source).reverse().join(""), warnings: [] };
  }

  const complemented = complementSequence(source, options);

  if (operation === "complement") {
    return complemented;
  }

  return {
    sequence: Array.from(complemented.sequence).reverse().join(""),
    warnings: complemented.warnings
  };
}

export function runReverseComplement(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const outputParts = [];
  const transformedRecords = [];
  const lineWidth = options.lineWidth ?? 60;
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (const record of records) {
    const cleaned = cleanDnaRnaSequence(record.sequence);
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    const result = reverseComplementSequence(cleaned.sequence, options);
    warnings.push(...result.warnings.map((warning) => `${record.title}: ${warning}`));
    const suffix =
      options.operation === "reverse"
        ? " reverse"
        : options.operation === "complement"
          ? " complement"
          : " reverse complement";
    const title = `${record.title}${suffix}`;
    transformedRecords.push({
      title,
      sequence: result.sequence,
      sourceTitle: record.title,
      operation: options.operation ?? "reverse-complement"
    });

    outputParts.push(formatFastaRecord(title, result.sequence, lineWidth));
  }

  const output = outputParts.join("\n");
  const fastaOutput = transformedRecords
    .map((record) => formatFastaRecord(record.title, record.sequence, lineWidth))
    .join("\n");

  return makeToolResult({
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
      fasta: makeTextStream(fastaOutput, "text/x-fasta"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "reverse-complement-dna-rna",
        alphabet: "dna-rna",
        records: transformedRecords
      }
    }
  });
}

async function cleanDnaRnaSequenceChunked(sequence, options = {}, context = {}) {
  const source = String(sequence ?? "");
  const chunks = [];
  let removedCount = 0;

  for (let index = 0; index < source.length; index += WORKER_CHUNK_SIZE) {
    context.throwIfCancelled?.();
    const cleaned = cleanDnaRnaSequence(source.slice(index, index + WORKER_CHUNK_SIZE), options);
    chunks.push(cleaned.sequence);
    removedCount += cleaned.removedCount;
    await context.yieldIfNeeded?.();
  }

  return { chunks, sequence: chunks.join(""), removedCount };
}

async function transformCleanedChunks(chunks, options = {}, context = {}) {
  const operation = options.operation ?? "reverse-complement";

  if (operation === "reverse") {
    const outputChunks = [];
    for (let index = chunks.length - 1; index >= 0; index -= 1) {
      context.throwIfCancelled?.();
      outputChunks.push(Array.from(chunks[index]).reverse().join(""));
      await context.yieldIfNeeded?.();
    }
    return outputChunks.join("");
  }

  if (operation === "complement") {
    const outputChunks = [];
    for (const chunk of chunks) {
      context.throwIfCancelled?.();
      outputChunks.push(complementDnaRnaSequence(chunk, options));
      await context.yieldIfNeeded?.();
    }
    return outputChunks.join("");
  }

  const outputChunks = [];
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    context.throwIfCancelled?.();
    const complemented = complementDnaRnaSequence(chunks[index], options);
    outputChunks.push(Array.from(complemented).reverse().join(""));
    await context.yieldIfNeeded?.();
  }
  return outputChunks.join("");
}

export async function runReverseComplementWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const records = parseSequenceInput(input, "sequence");
  await context.yieldIfNeeded?.();

  if (records.length === 0) {
    return makeToolResult({
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
  const lineWidth = options.lineWidth ?? 60;
  let basesProcessed = 0;
  let charactersRemoved = 0;

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    context.reportProgress?.({
      phase: "transforming-records",
      progress: 0.1 + 0.75 * (recordIndex / Math.max(1, records.length))
    });
    const cleaned = await cleanDnaRnaSequenceChunked(record.sequence, options, context);
    basesProcessed += cleaned.sequence.length;
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    const sequence = await transformCleanedChunks(cleaned.chunks, options, context);
    const suffix =
      options.operation === "reverse"
        ? " reverse"
        : options.operation === "complement"
          ? " complement"
          : " reverse complement";
    const title = `${record.title}${suffix}`;
    transformedRecords.push({
      title,
      sequence,
      sourceTitle: record.title,
      operation: options.operation ?? "reverse-complement"
    });

    outputParts.push(formatFastaRecord(title, sequence, lineWidth));
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const output = outputParts.join("\n");
  const fastaOutput = transformedRecords
    .map((record) => formatFastaRecord(record.title, record.sequence, lineWidth))
    .join("\n");

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
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
      fasta: makeTextStream(fastaOutput, "text/x-fasta"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "reverse-complement-dna-rna",
        alphabet: "dna-rna",
        records: transformedRecords
      }
    }
  });
}
