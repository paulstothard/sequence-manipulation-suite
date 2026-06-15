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

const OUTPUT_FORMATS = new Set(["report", "reciprocal-tsv", "candidates-tsv", "unmatched-tsv", "heatmap-svg"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

async function runSequenceSetReciprocalBestMatch(input, options = {}, context = {}, config) {
  context.reportProgress?.({ phase: "starting", progress: 0.02 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = await config.compare(input, options, context);
  const outputFormat = normalizeOutputFormat(options.outputFormat);

  context.reportProgress?.({ phase: "building-output", progress: 0.92 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makeSequenceSetBestMatchReport(result);
  const reciprocalTsv = makeSequenceSetBestMatchTsv(result.reciprocalRows, config.alphabet);
  const candidatesTsv = makeSequenceSetBestMatchTsv(result.rows, config.alphabet);
  const unmatchedTsv = makeSequenceSetUnmatchedTsv(result.unmatchedRows, config.alphabet);
  const heatmap = outputFormat === "heatmap-svg" ? makeSequenceSetBestMatchHeatmapSvg(result) : "";
  const outputs = {
    report,
    "reciprocal-tsv": reciprocalTsv,
    "candidates-tsv": candidatesTsv,
    "unmatched-tsv": unmatchedTsv,
    "heatmap-svg": heatmap
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
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
    recordsProcessed: result.recordsA.length + result.recordsB.length,
    basesProcessed: result.recordsA.reduce((sum, record) => sum + record.length, 0) + result.recordsB.reduce((sum, record) => sum + record.length, 0),
    processedUnitLabel: config.processedUnitLabel,
    charactersRemoved: result.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      ...(outputFormat === "unmatched-tsv" ? {} : {
        table: makeTableStream(config.tableColumns, outputFormat === "reciprocal-tsv" ? result.reciprocalRows : result.rows, config.tableSchema)
      }),
      unmatchedTable: makeTableStream(config.unmatchedColumns, result.unmatchedRows, config.unmatchedSchema),
      ...(outputFormat === "heatmap-svg" ? { heatmap: makeTextStream(heatmap, "image/svg+xml") } : {})
    },
    visual: outputFormat === "heatmap-svg" ? { svg: heatmap, pngDownload: true } : undefined
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
