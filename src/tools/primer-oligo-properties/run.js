import {
  analyzePrimerOligos,
  makePrimerOligoPropertiesTsv,
  primerOligoPropertyColumns
} from "../../core/primer-oligo-properties.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["report", "tsv"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

export async function runPrimerOligoProperties(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = analyzePrimerOligos(input);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const tsv = makePrimerOligoPropertiesTsv(result.rows);
  const outputs = {
    report: result.report,
    tsv
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "report" ? "primer-oligo-properties.txt" : "primer-oligo-properties.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(primerOligoPropertyColumns, result.rows, "primer-oligo-properties")
    }
  });
}
