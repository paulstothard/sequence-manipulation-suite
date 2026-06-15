import {
  calculateCodonAdaptationIndex,
  codonAdaptationCodonColumns,
  codonAdaptationIndexColumns,
  tableToTsv
} from "../../core/codon-adaptation-index.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

const OUTPUT_FORMATS = new Set(["summary-tsv", "codon-tsv", "report"]);

export async function runCodonAdaptationIndex(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "calculating-cai", progress: 0.15 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "summary-tsv";
  const wantsCodonRows = outputFormat === "codon-tsv";
  const result = calculateCodonAdaptationIndex(input, codonUsageReferences, {
    ...options,
    includeCodonRows: wantsCodonRows
  });
  const summaryTsv =
    outputFormat === "summary-tsv" ? tableToTsv(codonAdaptationIndexColumns, result.rows) : "";
  const codonTsv = wantsCodonRows ? tableToTsv(codonAdaptationCodonColumns, result.codonRows) : "";
  const output = outputFormat === "codon-tsv" ? codonTsv : outputFormat === "report" ? result.report : summaryTsv;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "codon-adaptation-index.txt" : "codon-adaptation-index.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(result.report, "text/plain") } : {}),
      ...(outputFormat === "summary-tsv"
        ? { summaryTable: makeTableStream(codonAdaptationIndexColumns, result.rows, "codon-adaptation-index") }
        : {}),
      ...(wantsCodonRows
        ? { codonTable: makeTableStream(codonAdaptationCodonColumns, result.codonRows, "codon-adaptation-index-codons") }
        : {})
    }
  });
}
