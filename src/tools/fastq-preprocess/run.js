import {
  fastqPreprocessSummaryColumns,
  makeFastqPreprocessTable,
  preprocessFastq
} from "../../core/fastq-preprocess.js";
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
  return "report";
}

function selectedOutput(result, outputFormat) {
  if (outputFormat === "table") return makeFastqPreprocessTable(result.summaryRows);
  if (outputFormat === "report") return result.report;
  if (outputFormat === "read1-fastq") return result.read1Fastq;
  if (outputFormat === "read2-fastq") return result.read2Fastq;
  if (outputFormat === "interleaved-fastq") return result.interleavedFastq;
  return result.fastq;
}

function downloadMetadata(outputFormat) {
  if (outputFormat === "table") {
    return {
      filename: "fastq-trimming-summary.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "report") {
    return {
      filename: "fastq-trimming-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  if (outputFormat === "read1-fastq") {
    return {
      filename: "trimmed_R1.fastq",
      mimeType: "text/x-fastq;charset=utf-8"
    };
  }
  if (outputFormat === "read2-fastq") {
    return {
      filename: "trimmed_R2.fastq",
      mimeType: "text/x-fastq;charset=utf-8"
    };
  }
  if (outputFormat === "interleaved-fastq") {
    return {
      filename: "trimmed_interleaved_pairs.fastq",
      mimeType: "text/x-fastq;charset=utf-8"
    };
  }
  return {
    filename: "trimmed-reads.fastq",
    mimeType: "text/x-fastq;charset=utf-8"
  };
}

function fastqOptionFile(option) {
  return option?.stream ? option : null;
}

function fastqOptionText(option) {
  return option?.stream ? "" : String(option?.text ?? "");
}

export async function runFastqPreprocess(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  const layout = options.readLayout === "paired" ? "paired" : "single";
  const outputFormat = normalizeOutputFormat(options.outputFormat, layout);
  const source = layout === "paired"
    ? {
      read1File: fastqOptionFile(options.read1FastqFile),
      read2File: fastqOptionFile(options.read2FastqFile),
      read1Text: fastqOptionText(options.read1FastqFile),
      read2Text: fastqOptionText(options.read2FastqFile)
    }
    : options.fastqInputFile
      ? { file: options.fastqInputFile }
      : { text: input };
  const result = await preprocessFastq(source, { ...options, readLayout: layout, outputFormat }, context);
  const tableText = makeFastqPreprocessTable(result.summaryRows);
  const streams = {
    table: makeTableStream(fastqPreprocessSummaryColumns, result.summaryRows, "fastq-preprocess-summary"),
    report: makeTextStream(result.report, "text/plain")
  };
  if (result.fastq) {
    streams.fastq = makeTextStream(result.fastq, "text/x-fastq");
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

  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat),
    warnings: result.warnings,
    recordsProcessed: result.recordsProcessed,
    basesProcessed: result.inputBases,
    streams,
    optionsUsed: {
      ...result.options,
      outputFormat,
      engine: result.engine,
      outputBases: result.outputBases,
      summaryRows: result.summaryRows.length,
      tableBytes: tableText.length
    }
  });
}
