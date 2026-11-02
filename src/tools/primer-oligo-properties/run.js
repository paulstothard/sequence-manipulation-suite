import {
  analyzePrimerOligos,
  makeOligoReverseComplementFasta,
  makeOligoPairComparison,
  oligoPairColumns,
  makePrimerOligoPropertiesTsv,
  primerOligoPropertyColumns
} from "../../core/primer-oligo-properties.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { makeDesignAnalysisJson } from "../../core/design-analysis.js";

export async function runPrimerOligoProperties(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = analyzePrimerOligos(input, options);
  result.analysisRevision = "2026-11-01";

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = result.options.outputFormat;
  const tsv = makePrimerOligoPropertiesTsv(result.rows);
  const fasta = outputFormat === "reverse-complement-fasta" ? makeOligoReverseComplementFasta(result.rows) : "";
  const analysis = outputFormat === "analysis-json" ? makeDesignAnalysisJson("primer-oligo-properties", result, options ?? {}) : "";
  const pairs = outputFormat === "pair-tsv" ? makeOligoPairComparison(result) : null;
  if (pairs) result.warnings.push(...pairs.warnings);
  const outputs = {
    report: result.report,
    tsv,
    "reverse-complement-fasta": fasta,
    "analysis-json": analysis,
    "pair-tsv": pairs?.output ?? ""
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    optionsUsed: result.options,
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "pair-tsv" ? "oligo-pair-comparison.tsv" : outputFormat === "analysis-json" ? "primer-oligo-analysis.json" : outputFormat === "reverse-complement-fasta" ? "oligo-reverse-complements.fasta" : outputFormat === "report" ? "primer-oligo-properties.txt" : "primer-oligo-properties.tsv",
      mimeType: outputFormat === "analysis-json" ? "application/json;charset=utf-8" : outputFormat === "reverse-complement-fasta" ? "text/x-fasta;charset=utf-8" : outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    notes: result.notes,
    charactersRemoved: result.charactersRemoved,
    recordsProcessed: result.records.length,
    basesProcessed: result.rows.reduce((sum, row) => sum + (Number(row.length) || 0), 0),
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(primerOligoPropertyColumns, result.rows, "primer-oligo-properties"),
      ...(fasta ? { fasta: makeTextStream(fasta, "text/x-fasta") } : {}),
      ...(analysis ? { analysis: makeTextStream(analysis, "application/json") } : {}),
      ...(pairs ? { pairs: makeTableStream(oligoPairColumns, pairs.rows, "oligo-pair-comparison") } : {})
    }
  });
}
