import { makeDesignAnalysisJson } from "../../core/design-analysis.js";
import { exportDelimitedTable } from "../../core/table.js";
import {
  SIRNA_REFERENCE_SEPARATOR,
  designSirna,
  makeSirnaContextText,
  makeSirnaDesignReport,
  makeSirnaDesignTsv,
  makeSirnaGuideFasta,
  makeSirnaDuplexFasta,
  makeSirnaDuplexText,
  sirnaSeedColumns,
  makeSirnaReferenceMatchTsv,
  sirnaDesignTableColumns,
  sirnaReferenceMatchColumns
} from "../../core/sirna-design.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { makeLegacyReferenceScreenOptions } from "../reference-genome-runner.js";

function inputWithOptionalReference(input, options = {}) {
  const text = String(input ?? "");
  const referenceText = String(options.referenceText ?? "").trim();
  const alreadySplit = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .some((line) => line.trim() === SIRNA_REFERENCE_SEPARATOR);
  if (
    options.searchReferenceOffTargets === true &&
    (options.referenceInputMode ?? "pasted") === "pasted" &&
    referenceText &&
    !alreadySplit
  ) {
    return `${text.trim()}\n${SIRNA_REFERENCE_SEPARATOR}\n${referenceText}`;
  }
  return input;
}

export async function runSirnaDesign(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  options = options && typeof options === "object" ? options : {};
  const runOptions = await makeLegacyReferenceScreenOptions(options, context);
  const result = await designSirna(inputWithOptionalReference(input, runOptions), runOptions, context);
  const outputFormat = result.options.outputFormat;
  result.analysisRevision = "2026-11-01";

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makeSirnaDesignReport(result);
  const tsv = outputFormat === "tsv" ? makeSirnaDesignTsv(result.rows) : "";
  const offTargetTsv = outputFormat === "offtarget-tsv" ? makeSirnaReferenceMatchTsv(result.referenceMatchRows ?? []) : "";
  const guideFasta = outputFormat === "guide-fasta" ? makeSirnaGuideFasta(result.rows, result.options.lineWidth) : "";
  const contextText = outputFormat === "context-text" ? makeSirnaContextText(result.rows) : "";
  const extras = {
    "analysis-json": outputFormat === "analysis-json" ? makeDesignAnalysisJson("sirna-design", result, options) : "",
    "duplex-fasta": outputFormat === "duplex-fasta" ? makeSirnaDuplexFasta(result.rows, result.options.lineWidth) : "",
    "duplex-text": outputFormat === "duplex-text" ? makeSirnaDuplexText(result.rows) : "",
    "seed-tsv": outputFormat === "seed-tsv" ? exportDelimitedTable(sirnaSeedColumns, result.seedMatchRows ?? [], "\t") : ""
  };
  const outputs = {
    ...extras,
    report,
    tsv,
    "offtarget-tsv": offTargetTsv,
    "guide-fasta": guideFasta,
    "context-text": contextText
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    optionsUsed: result.options,
    output: outputs[outputFormat],
    sequenceSearch: ["guide-fasta", "duplex-fasta"].includes(outputFormat)
      ? { format: "fasta", alphabet: "dna-rna" }
      : outputFormat === "context-text"
        ? { format: "context", alphabet: "dna-rna" }
        : undefined,
    download: {
      filename: outputFormat in extras ? `sirna-${outputFormat}.${outputFormat === "analysis-json" ? "json" : outputFormat === "duplex-fasta" ? "fasta" : outputFormat === "seed-tsv" ? "tsv" : "txt"}` : outputFormat === "tsv"
        ? "sirna-design-candidates.tsv"
        : outputFormat === "offtarget-tsv"
          ? "sirna-design-reference-matches.tsv"
        : outputFormat === "guide-fasta"
          ? "sirna-design-guides.fasta"
          : outputFormat === "context-text"
            ? "sirna-design-context.txt"
            : "sirna-design.txt",
      mimeType: outputFormat === "analysis-json" ? "application/json;charset=utf-8" : outputFormat === "duplex-fasta" ? "text/x-fasta;charset=utf-8" : outputFormat === "seed-tsv" ? "text/tab-separated-values;charset=utf-8" : outputFormat === "tsv" || outputFormat === "offtarget-tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "guide-fasta"
          ? "text/x-fasta;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    notes: result.notes,
    recordsProcessed: result.records.length,
    basesProcessed: (result.basesProcessed ?? result.records.reduce((sum, record) => sum + record.sequence.length, 0)) + (result.referenceScreen?.basesProcessed ?? 0),
    charactersRemoved: (result.charactersRemoved ?? 0) + (result.referenceCharactersRemoved ?? 0),
    streams: {
      report: makeTextStream(report, "text/plain"),
      ...(outputFormat === "analysis-json" ? { analysis: makeTextStream(extras[outputFormat], "application/json") } : {}),
      ...(outputFormat === "duplex-fasta" ? { duplexFasta: makeTextStream(extras[outputFormat], "text/x-fasta") } : {}),
      ...(outputFormat === "duplex-text" ? { duplexText: makeTextStream(extras[outputFormat], "text/plain") } : {}),
      ...(outputFormat === "seed-tsv" ? { seedTable: makeTableStream(sirnaSeedColumns, result.seedMatchRows ?? [], "sirna-seed-matches") } : {}),
      table: makeTableStream(sirnaDesignTableColumns, result.rows, "sirna-design"),
      ...(outputFormat === "offtarget-tsv"
        ? { offTargetTable: makeTableStream(sirnaReferenceMatchColumns, result.referenceMatchRows ?? [], "sirna-reference-matches") }
        : {}),
      ...(outputFormat === "guide-fasta" ? { guideFasta: makeTextStream(guideFasta, "text/x-fasta") } : {}),
      ...(outputFormat === "context-text" ? {
        contextText: makeTextStream(contextText, "text/plain", { format: "context", alphabet: "dna-rna" })
      } : {})
    }
  });
}
