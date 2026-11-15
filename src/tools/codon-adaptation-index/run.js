import {
  calculateCodonAdaptationIndex,
  codonAdaptationCodonColumns,
  codonAdaptationIndexColumns,
  tableToTsv
} from "../../core/codon-adaptation-index.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";
import { normalizeCodonAdaptationOptions, CODON_ADAPTATION_INDEX_LIMITS } from "../../core/codon-adaptation-options.js";

export { CODON_ADAPTATION_INDEX_LIMITS } from "../../core/codon-adaptation-options.js";

function makeResult({ outputFormat, reference, rows, codonRows, report, warnings, recordsProcessed, basesProcessed, charactersRemoved, limitOptions = {} }) {
  const summaryTsv = outputFormat === "summary-tsv" ? tableToTsv(codonAdaptationIndexColumns, rows) : "";
  const codonTsv = outputFormat === "codon-tsv" ? tableToTsv(codonAdaptationCodonColumns, codonRows) : "";
  const output = outputFormat === "codon-tsv" ? codonTsv : outputFormat === "report" ? report : summaryTsv;
  const maxOutputCharacters = effectiveToolLimit(limitOptions, "caiOutput", CODON_ADAPTATION_INDEX_LIMITS.maxMaterializedOutputCharacters);
  if (output.length > maxOutputCharacters) {
    throw new Error(`CAI output contains ${output.length.toLocaleString()} characters, above the current materialized-output limit of ${maxOutputCharacters.toLocaleString()}.`);
  }
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "codon-adaptation-index.txt" : "codon-adaptation-index.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings,
    recordsProcessed,
    basesProcessed,
    charactersRemoved,
    streams: {
      ...(outputFormat === "report" ? { report: makeTextStream(report, "text/plain") } : {}),
      ...(outputFormat === "summary-tsv"
        ? { summaryTable: makeTableStream(codonAdaptationIndexColumns, rows, "codon-adaptation-index") }
        : {}),
      ...(outputFormat === "codon-tsv"
        ? { codonTable: makeTableStream(codonAdaptationCodonColumns, codonRows, "codon-adaptation-index-codons") }
        : {})
    },
    optionsUsed: { outputFormat, referenceId: reference.id }
  });
}

export async function runCodonAdaptationIndex(input, options = {}, context = {}) {
  options = { ...options, ...normalizeCodonAdaptationOptions(options) };
  context.reportProgress?.({ phase: "calculating-cai", progress: 0.15 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = options.outputFormat;
  const maxInputCharacters = effectiveToolLimit(options, "caiInput", 100_000_000);
  const maxRecords = effectiveToolLimit(options, "caiInput", CODON_ADAPTATION_INDEX_LIMITS.maxRecords);
  const maxCodonRows = effectiveToolLimit(options, "caiRows", CODON_ADAPTATION_INDEX_LIMITS.maxCodonRows);
  const sourceOptions = applyDisabledFastaSourceLimits({
    ...options,
    maxSourceRecords: Math.min(CODON_ADAPTATION_INDEX_LIMITS.maxRecords, Number(options.maxSourceRecords) || CODON_ADAPTATION_INDEX_LIMITS.maxRecords)
  }, {
    maxSourceBases: "caiInput",
    maxSourceRecords: "caiInput",
    maxDecodedSourceBytes: "caiInput",
    maxSourceBytes: "caiInput"
  });
  const result = await calculateCodonAdaptationIndex(input, codonUsageReferences, {
    ...sourceOptions,
    maxSourceBases: Math.min(sourceOptions.maxSourceBases ?? maxInputCharacters, maxInputCharacters),
    maxSourceRecords: Math.min(sourceOptions.maxSourceRecords ?? maxRecords, maxRecords),
    maxCodonRows
  }, context);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeResult({ outputFormat, ...result, limitOptions: options });
}
