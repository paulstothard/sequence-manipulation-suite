import { RECIPROCAL_RESOURCE_LIMITS } from "../../core/reciprocal-best-match-options.js";
import {
  compareDnaRnaSequenceSetReciprocalBestMatches,
  compareProteomeReciprocalBestMatches,
  dnaRnaSequenceSetReciprocalBestMatchColumns,
  dnaRnaSequenceSetUnmatchedColumns,
  makeSequenceSetBestMatchHeatmapSvg,
  makeSequenceSetBestMatchReport,
  makeSequenceSetBestMatchTsv,
  makeSequenceSetUnmatchedTsv,
  proteomeReciprocalBestMatchColumns,
  proteomeUnmatchedColumns
} from "../../core/proteome-reciprocal-best-match.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

async function runSequenceSetReciprocalBestMatch(input, options = {}, context = {}, config) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = await config.compare(input, options, context);
  const outputFormat = result.options.outputFormat;

  context.reportProgress?.({ phase: "building-output", progress: 0.92 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  let output;
  let streams;
  if (outputFormat === "report") {
    output = makeSequenceSetBestMatchReport(result);
    streams = { report: makeTextStream(output, "text/plain") };
  } else if (outputFormat === "heatmap-svg") {
    output = makeSequenceSetBestMatchHeatmapSvg(result);
    streams = { heatmap: makeTextStream(output, "image/svg+xml") };
  } else if (outputFormat === "unmatched-tsv") {
    output = makeSequenceSetUnmatchedTsv(result.unmatchedRows, config.alphabet);
    streams = { unmatchedTable: makeTableStream(config.unmatchedColumns, result.unmatchedRows, config.unmatchedSchema) };
  } else {
    const rows = outputFormat === "reciprocal-tsv" ? result.reciprocalRows : result.rows;
    output = makeSequenceSetBestMatchTsv(rows, config.alphabet);
    streams = { table: makeTableStream(config.tableColumns, rows, config.tableSchema) };
  }

  if (output.length > RECIPROCAL_RESOURCE_LIMITS.outputCharacters) throw new Error(`Selected output exceeds ${RECIPROCAL_RESOURCE_LIMITS.outputCharacters.toLocaleString()} characters. Reduce input or select a summary report.`);
  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output,
    optionsUsed: result.options,
    download: {
      filename: outputFormat === "reciprocal-tsv"
        ? `${config.filenamePrefix}-reciprocal-best-matches.tsv`
        : outputFormat === "candidates-tsv"
          ? `${config.filenamePrefix}-aligned-candidate-pairs.tsv`
          : outputFormat === "unmatched-tsv"
            ? `${config.filenamePrefix}-${config.unmatchedFilenamePart}.tsv`
            : outputFormat === "heatmap-svg"
              ? `${config.filenamePrefix}-reciprocal-best-match-heatmap.svg`
              : `${config.filenamePrefix}-reciprocal-best-match.txt`,
      mimeType: outputFormat.endsWith("tsv")
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "heatmap-svg"
          ? "image/svg+xml;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    notes: result.notes,
    recordsProcessed: result.recordsA.length + result.recordsB.length,
    basesProcessed: result.recordsA.reduce((sum, record) => sum + record.length, 0) + result.recordsB.reduce((sum, record) => sum + record.length, 0),
    processedUnitLabel: config.processedUnitLabel,
    charactersRemoved: result.charactersRemoved,
    streams,
    visual: outputFormat === "heatmap-svg" ? { svg: output, pngDownload: true } : undefined
  });
}

export async function runProteomeReciprocalBestMatch(input, options = {}, context = {}) {
  return runSequenceSetReciprocalBestMatch(input, options, context, {
    alphabet: "protein",
    compare: compareProteomeReciprocalBestMatches,
    filenamePrefix: "protein-set",
    unmatchedFilenamePart: "proteins-without-reciprocal-matches",
    processedUnitLabel: "residue",
    tableColumns: proteomeReciprocalBestMatchColumns,
    unmatchedColumns: proteomeUnmatchedColumns,
    tableSchema: "protein-set-reciprocal-best-match",
    unmatchedSchema: "protein-set-unmatched-proteins"
  });
}

export async function runDnaRnaSequenceSetReciprocalBestMatch(input, options = {}, context = {}) {
  return runSequenceSetReciprocalBestMatch(input, options, context, {
    alphabet: "dna-rna",
    compare: compareDnaRnaSequenceSetReciprocalBestMatches,
    filenamePrefix: "dna-rna-set",
    unmatchedFilenamePart: "sequences-without-reciprocal-matches",
    processedUnitLabel: "base",
    tableColumns: dnaRnaSequenceSetReciprocalBestMatchColumns,
    unmatchedColumns: dnaRnaSequenceSetUnmatchedColumns,
    tableSchema: "dna-rna-set-reciprocal-best-match",
    unmatchedSchema: "dna-rna-set-unmatched-sequences"
  });
}
