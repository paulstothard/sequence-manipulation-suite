import {
  fastqToFasta,
  readSimulatorTruthColumns,
  simulateReads
} from "../../core/read-simulator.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["fastq", "fasta", "truth-table", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "fastq";
}

function selectedOutput(result, outputFormat) {
  if (outputFormat === "fasta") return result.fasta;
  if (outputFormat === "truth-table") return result.truthTsv;
  if (outputFormat === "report") return result.report;
  return result.fastq;
}

function downloadMetadata(outputFormat, readLayout = "single") {
  if (outputFormat === "fasta") {
    return {
      filename: readLayout === "paired" ? "simulated-reads-interleaved.fasta" : "simulated-reads.fasta",
      mimeType: "text/x-fasta;charset=utf-8"
    };
  }
  if (outputFormat === "truth-table") {
    return {
      filename: "simulated-read-metadata.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === "report") {
    return {
      filename: "read-simulator-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  return {
    filename: readLayout === "paired" ? "simulated-reads-interleaved.fastq" : "simulated-reads.fastq",
    mimeType: "text/x-fastq;charset=utf-8"
  };
}

function makeAdditionalDownloads(result, outputFormat) {
  if (result.options.readLayout !== "paired") {
    return [];
  }
  if (outputFormat === "fastq") {
    return [
      {
        label: "Download R1 FASTQ",
        filename: "simulated-reads_R1.fastq",
        mimeType: "text/x-fastq;charset=utf-8",
        text: result.read1Fastq
      },
      {
        label: "Download R2 FASTQ",
        filename: "simulated-reads_R2.fastq",
        mimeType: "text/x-fastq;charset=utf-8",
        text: result.read2Fastq
      }
    ];
  }
  if (outputFormat === "fasta") {
    return [
      {
        label: "Download R1 FASTA",
        filename: "simulated-reads_R1.fasta",
        mimeType: "text/x-fasta;charset=utf-8",
        text: result.read1Fasta || fastqToFasta(result.read1Fastq)
      },
      {
        label: "Download R2 FASTA",
        filename: "simulated-reads_R2.fasta",
        mimeType: "text/x-fasta;charset=utf-8",
        text: result.read2Fasta || fastqToFasta(result.read2Fastq)
      }
    ];
  }
  return [];
}

export async function runReadSimulator(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const result = await simulateReads(input, { ...options, outputFormat }, context);
  const fastqRecords = result.truthRows.length;

  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat, result.options.readLayout),
    downloads: makeAdditionalDownloads(result, outputFormat),
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    charactersRemoved: result.charactersRemoved,
    streams: {
      fastq: makeTextStream(result.fastq, "text/x-fastq"),
      fasta: makeTextStream(result.fasta, "text/x-fasta"),
      ...(result.read1Fastq ? { read1Fastq: makeTextStream(result.read1Fastq, "text/x-fastq") } : {}),
      ...(result.read2Fastq ? { read2Fastq: makeTextStream(result.read2Fastq, "text/x-fastq") } : {}),
      ...(result.read1Fasta ? { read1Fasta: makeTextStream(result.read1Fasta, "text/x-fasta") } : {}),
      ...(result.read2Fasta ? { read2Fasta: makeTextStream(result.read2Fasta, "text/x-fasta") } : {}),
      table: makeTableStream(readSimulatorTruthColumns, result.truthRows, "read-simulator-truth"),
      report: makeTextStream(result.report, "text/plain")
    },
    optionsUsed: {
      ...result.options,
      simulatedFastqRecords: fastqRecords,
      simulationEngine: result.engine
    }
  });
}
