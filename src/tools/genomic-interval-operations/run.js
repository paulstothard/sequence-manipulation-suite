import {
  genomicIntervalOperationColumns,
  runGenomicIntervalOperationsCore
} from "../../core/genomic-interval-operations.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["interval-table", "bed", "summary-report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "interval-table";
}

function selectedOutput(result, outputFormat) {
  if (outputFormat === "bed") return result.bed;
  if (outputFormat === "summary-report") return result.report;
  return result.table;
}

function downloadMetadata(outputFormat) {
  if (outputFormat === "bed") {
    return {
      filename: "genomic-intervals.bed",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  if (outputFormat === "summary-report") {
    return {
      filename: "genomic-interval-operations-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  return {
    filename: "genomic-interval-table.tsv",
    mimeType: "text/tab-separated-values;charset=utf-8"
  };
}

function selectedStreams(result, outputFormat) {
  if (outputFormat === "bed") {
    return {
      bed: makeTextStream(result.bed, "text/plain")
    };
  }
  if (outputFormat === "summary-report") {
    return {
      report: makeTextStream(result.report, "text/plain")
    };
  }
  return {
    table: makeTableStream(genomicIntervalOperationColumns, result.rows, "genomic-interval-operations")
  };
}

export async function runGenomicIntervalOperations(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const result = await runGenomicIntervalOperationsCore(input, { ...options, outputFormat }, context);
  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: selectedOutput(result, outputFormat),
    download: downloadMetadata(outputFormat),
    warnings: result.warnings,
    recordsProcessed: result.recordsProcessed,
    streams: selectedStreams(result, outputFormat),
    optionsUsed: {
      ...result.options,
      outputFormat,
      queryFormat: result.query.format,
      referenceFormat: result.reference.format,
      engine: result.engine,
      command: result.command,
      outputRows: result.rows.length
    }
  });
}
