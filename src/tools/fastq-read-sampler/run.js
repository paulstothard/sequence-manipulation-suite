import {
  fastqSamplerColumns,
  makeFastqSamplerReport,
  makeFastqSamplerTable,
  samplePairedEndFastq,
  sampleSingleEndFastq
} from "../../core/fastq-sampler.js";
import { streamTextFileChunks } from "../../core/compressed-text-reader.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["fastq", "interleaved-fastq", "read1-fastq", "read2-fastq", "table", "report"]);

function normalizeOutputFormat(value, layout) {
  if (OUTPUT_FORMATS.has(value)) {
    if (layout === "single" && ["interleaved-fastq", "read1-fastq", "read2-fastq"].includes(value)) {
      return "fastq";
    }
    if (layout === "paired" && value === "fastq") {
      return "interleaved-fastq";
    }
    return value;
  }
  return layout === "paired" ? "interleaved-fastq" : "fastq";
}

function sourceFromTextOrFile(text, file, context, phasePrefix) {
  if (file?.stream) {
    return {
      chunks: streamTextFileChunks(file, {
        signal: context.signal,
        onProgress: (detail) => context.reportProgress?.({
          ...detail,
          phase: detail.phase === "decompressing-text" ? `decompressing-${phasePrefix}` : `reading-${phasePrefix}`
        })
      })
    };
  }
  return { text: file?.text ?? text };
}

function hasFastqSource(source) {
  return Boolean(source?.stream || String(source?.text ?? "").trim());
}

function makeSelectedOutput(result, outputFormat) {
  if (outputFormat === "table") return makeFastqSamplerTable(result.rows);
  if (outputFormat === "report") return makeFastqSamplerReport(result);
  if (outputFormat === "read1-fastq") return result.read1Fastq;
  if (outputFormat === "read2-fastq") return result.read2Fastq;
  if (outputFormat === "interleaved-fastq") return result.interleavedFastq;
  return result.sampledFastq;
}

function downloadMetadata(outputFormat) {
  if (outputFormat === "table") {
    return {
      filename: "fastq-read-sample.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "report") {
    return {
      filename: "fastq-read-sampling-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  if (outputFormat === "read1-fastq") {
    return {
      filename: "sampled_R1.fastq",
      mimeType: "text/x-fastq;charset=utf-8"
    };
  }
  if (outputFormat === "read2-fastq") {
    return {
      filename: "sampled_R2.fastq",
      mimeType: "text/x-fastq;charset=utf-8"
    };
  }
  if (outputFormat === "interleaved-fastq") {
    return {
      filename: "sampled_interleaved_pairs.fastq",
      mimeType: "text/x-fastq;charset=utf-8"
    };
  }
  return {
    filename: "sampled_reads.fastq",
    mimeType: "text/x-fastq;charset=utf-8"
  };
}

function makeStreams(result, report) {
  const streams = {
    table: makeTableStream(fastqSamplerColumns, result.rows, "fastq-read-sampler"),
    report: makeTextStream(report, "text/plain")
  };
  if (result.sampledFastq) {
    streams.fastq = makeTextStream(result.sampledFastq, "text/x-fastq");
  }
  if (result.read1Fastq) {
    streams.read1Fastq = makeTextStream(result.read1Fastq, "text/x-fastq");
  }
  if (result.read2Fastq) {
    streams.read2Fastq = makeTextStream(result.read2Fastq, "text/x-fastq");
  }
  if (result.interleavedFastq) {
    streams.interleavedFastq = makeTextStream(result.interleavedFastq, "text/x-fastq");
  }
  return streams;
}

export async function runFastqReadSampler(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const layout = options.readLayout === "paired" ? "paired" : "single";
  let result;
  if (layout === "paired") {
    if (!hasFastqSource(options.read1FastqFile) || !hasFastqSource(options.read2FastqFile)) {
      throw new Error("FASTQ Read Sampler paired-end mode requires both Read 1 and Read 2 FASTQ inputs.");
    }
    result = await samplePairedEndFastq(
      sourceFromTextOrFile("", options.read1FastqFile, context, "r1-fastq"),
      sourceFromTextOrFile("", options.read2FastqFile, context, "r2-fastq"),
      options,
      context
    );
  } else {
    result = await sampleSingleEndFastq(
      sourceFromTextOrFile(input, options.fastqInputFile, context, "fastq"),
      options,
      context
    );
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  const outputFormat = normalizeOutputFormat(options.outputFormat, layout);
  const report = makeFastqSamplerReport(result);
  const output = makeSelectedOutput(result, outputFormat);
  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output,
    download: downloadMetadata(outputFormat),
    warnings: result.warnings,
    recordsProcessed: result.availableReads,
    basesProcessed: result.rows.reduce((sum, row) => sum + Number(row.read_length || 0), 0),
    processedUnitLabel: "base",
    streams: makeStreams(result, report),
    optionsUsed: {
      ...result.options,
      outputFormat,
      seed: result.seed,
      sampledReads: result.sampledReads,
      sampledPairs: result.sampledPairs
    }
  });
}
