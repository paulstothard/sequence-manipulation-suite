import {
  indexedFastaRegionColumns,
  parseIndexedFastaExampleBundle,
  readLoadedFastaRegions,
  readIndexedFastaRegions,
  resolveIndexedFastaRegionInput
} from "../../core/indexed-genomics/indexed-fasta-reader.js";
import { makeDnaViewerData, makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { exportDelimitedTable } from "../../core/table.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["fasta", "table-tsv", "interactive-viewer", "report"]);
const SOURCE_MODES = new Set(["loaded", "indexed", "bgzf"]);

function shouldUseIndexedSource(input, options) {
  return ["indexed", "bgzf"].includes(options.sourceMode) ||
    Boolean(options.fastaFile?.slice || options.faiFile?.text || options.gziFile?.slice) ||
    Boolean(parseIndexedFastaExampleBundle(input));
}

function makeReport(result) {
  return [
    "FASTA region extractor",
    "",
    `Source: ${result.sourceLabel ?? "loaded FASTA"}`,
    `Reader: ${result.backendLabel ?? "loaded FASTA scanner"}`,
    `Source sequences: ${result.indexedSequences.length}`,
    `Regions requested: ${result.requestedCount}`,
    `Regions extracted: ${result.rows.length}`,
    "",
    "Coordinate policy: ranges are 1-based inclusive in the UI and output table.",
    "Reader policy: loaded FASTA and ordinary FASTA.GZ are scanned after browser loading; prepared FASTA+FAI and BGZF FASTA+FAI+GZI bundles use random-access region reads. Ordinary gzip FASTA is not random-access indexed FASTA."
  ].join("\n") + "\n";
}

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function makeRegionViewer(sequenceRecords) {
  return makeDnaViewerData(sequenceRecords.map((record, index) => ({
    id: `fasta-region-${index + 1}`,
    title: record.title,
    sequence: record.sequence,
    length: record.sequence.length,
    topology: "linear",
    tracks: []
  })), {
    title: "FASTA region viewer",
    layout: "linear"
  });
}

export async function runIndexedFastaRegionExtractor(input, options = {}, context = {}) {
  const sourceMode = SOURCE_MODES.has(options.sourceMode) ? options.sourceMode : "loaded";
  const useIndexedSource = shouldUseIndexedSource(input, { ...options, sourceMode });
  context.reportProgress?.({ phase: useIndexedSource ? "reading-index" : "reading-fasta", progress: 0.05 });
  context.throwIfCancelled?.();
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "fasta";
  const maxBasesPerRegion = normalizePositiveInteger(options.maxBasesPerRegion, 1000000);
  const result = useIndexedSource
    ? await readIndexedFastaRegions({
      ...(await resolveIndexedFastaRegionInput(input, options)),
      maxBasesPerRegion
    }, context)
    : await readLoadedFastaRegions(input, options.rangeText ?? "", context);
  const tableTsv = exportDelimitedTable(indexedFastaRegionColumns, result.rows, "\t");
  const report = makeReport(result);
  const viewer = outputFormat === "interactive-viewer" ? makeRegionViewer(result.sequenceRecords) : null;
  const output = outputFormat === "table-tsv"
    ? tableTsv
    : outputFormat === "fasta"
      ? result.fasta
      : report;
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "table-tsv"
        ? "fasta-regions.tsv"
        : outputFormat === "report"
          ? "fasta-region-extractor.txt"
          : outputFormat === "interactive-viewer"
            ? "fasta-region-viewer.txt"
            : "fasta-regions.fasta",
      mimeType: outputFormat === "table-tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "fasta"
          ? "text/x-fasta;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    basesProcessed: result.rows.reduce((sum, row) => sum + row.length, 0),
    streams: {
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {}),
      report: makeTextStream(report, "text/plain"),
      regionTable: makeTableStream(indexedFastaRegionColumns, result.rows, "indexed-fasta-regions"),
      sequenceRecords: {
        kind: "sequence-records",
        schema: "indexed-fasta-regions",
        alphabet: "dna-rna",
        records: result.sequenceRecords
      }
    },
    visual: viewer ? { viewer } : undefined
  });
}
