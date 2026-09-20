import {
  appendCodonAdaptationChunk,
  calculateCodonAdaptationIndex,
  codonAdaptationCodonColumns,
  codonAdaptationIndexColumns,
  createCodonAdaptationAccumulator,
  finishCodonAdaptationAccumulator,
  makeCodonAdaptationReport,
  tableToTsv
} from "../../core/codon-adaptation-index.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { getCodonUsageReference } from "../../core/codon-reference.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

const OUTPUT_FORMATS = new Set(["summary-tsv", "codon-tsv", "report"]);
export const CODON_ADAPTATION_INDEX_LIMITS = Object.freeze({
  maxCodonRows: 250_000,
  maxMaterializedOutputCharacters: 25 * 1024 * 1024,
  maxRecords: 10_000
});

function makeResult({ outputFormat, reference, rows, codonRows, report, warnings, recordsProcessed, basesProcessed, charactersRemoved }) {
  const summaryTsv = outputFormat === "summary-tsv" ? tableToTsv(codonAdaptationIndexColumns, rows) : "";
  const codonTsv = outputFormat === "codon-tsv" ? tableToTsv(codonAdaptationCodonColumns, codonRows) : "";
  const output = outputFormat === "codon-tsv" ? codonTsv : outputFormat === "report" ? report : summaryTsv;
  if (output.length > CODON_ADAPTATION_INDEX_LIMITS.maxMaterializedOutputCharacters) {
    throw new Error(`CAI output contains ${output.length.toLocaleString()} characters, above the current materialized-output limit of ${CODON_ADAPTATION_INDEX_LIMITS.maxMaterializedOutputCharacters.toLocaleString()}.`);
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
  context.reportProgress?.({ phase: "calculating-cai", progress: 0.15 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "summary-tsv";
  const wantsCodonRows = outputFormat === "codon-tsv";
  const usesExternalSource = options.loadedFastaFile?.stream || ["indexed", "bgzf"].includes(options.sourceMode);
  if (!usesExternalSource) {
    const result = calculateCodonAdaptationIndex(input, codonUsageReferences, {
      ...options,
      includeCodonRows: wantsCodonRows,
      maxCodonRows: CODON_ADAPTATION_INDEX_LIMITS.maxCodonRows
    });
    context.reportProgress?.({ phase: "finished", progress: 1 });
    return makeResult({
      outputFormat,
      reference: result.reference,
      rows: result.rows,
      codonRows: result.codonRows,
      report: result.report,
      warnings: result.warnings,
      recordsProcessed: result.rows.length,
      basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
      charactersRemoved: result.records.reduce((sum, record) => sum + (record.removed || 0), 0)
    });
  }

  const reference = getCodonUsageReference(codonUsageReferences, options.referenceId);
  const opened = await openCleanDnaRnaFastaSource(input, {
    ...options,
    maxSourceRecords: Math.min(CODON_ADAPTATION_INDEX_LIMITS.maxRecords, Number(options.maxSourceRecords) || CODON_ADAPTATION_INDEX_LIMITS.maxRecords)
  }, context);
  const rows = [];
  const codonRows = [];
  const warnings = [];
  let current = null;
  let basesProcessed = 0;
  let charactersRemoved = 0;
  for await (const event of opened.events()) {
    if (event.type === "record-start") {
      current = {
        title: event.title,
        accumulator: createCodonAdaptationAccumulator(reference, {
          includeCodonRows: wantsCodonRows,
          maxCodonRows: CODON_ADAPTATION_INDEX_LIMITS.maxCodonRows - codonRows.length
        })
      };
    } else if (event.type === "sequence-chunk" && current) {
      appendCodonAdaptationChunk(current.accumulator, event.text);
      basesProcessed += event.text.length;
    } else if (event.type === "record-end" && current) {
      const scored = finishCodonAdaptationAccumulator(current.accumulator, current.title);
      rows.push(scored.row);
      codonRows.push(...scored.codonRows);
      charactersRemoved += event.removedCount;
      if (event.removedCount > 0) warnings.push(`${current.title}: removed ${event.removedCount} unsupported character(s) before CAI calculation.`);
      if (scored.trailingBases > 0) warnings.push(`${current.title}: ignored ${scored.trailingBases} trailing base(s) because the sequence length is not a multiple of three.`);
      current = null;
    }
  }
  warnings.push(...opened.warnings);
  if (rows.length === 0) warnings.unshift(opened.source.stats.inputProvided ? "No DNA/RNA records were found." : "No DNA/RNA records were found.");
  const report = makeCodonAdaptationReport(reference, rows);

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeResult({
    outputFormat,
    reference,
    rows,
    codonRows,
    report,
    warnings,
    recordsProcessed: rows.length,
    basesProcessed,
    charactersRemoved
  });
}
