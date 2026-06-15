import {
  assembleLightweightSequences,
  lightweightAssemblyColumns,
  makeAssemblyFasta,
  makeAssemblyReport,
  makeAssemblyTextMap,
  makeAssemblyTsv
} from "../../core/lightweight-sequence-assembly.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["report", "fasta", "text-map", "tsv"]);

export async function runLightweightSequenceAssembly(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "assembling", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = assembleLightweightSequences(input, {
    ...options,
    tryReverseComplement: true
  }, context);
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "report";
  const output =
    outputFormat === "fasta"
      ? makeAssemblyFasta(result, options.lineWidth)
      : outputFormat === "text-map"
        ? makeAssemblyTextMap(result, options.lineWidth)
      : outputFormat === "tsv"
        ? makeAssemblyTsv(result.placements)
        : makeAssemblyReport(result);
  const streams = {
    table: makeTableStream(lightweightAssemblyColumns, result.placements, "lightweight-sequence-assembly"),
    sequenceRecords: {
      kind: "sequence-records",
      schema: "assembled-contigs",
      alphabet: "dna-rna",
      records: result.contigs.map((contig) => ({
        title: `${contig.title} reads=${contig.reads.length}`,
        sequence: contig.sequence
      }))
    }
  };
  if (outputFormat === "report") {
    streams.report = makeTextStream(output, "text/plain");
  }
  if (outputFormat === "fasta") {
    streams.fasta = makeTextStream(output, "text/x-fasta");
  }
  if (outputFormat === "text-map") {
    streams.textMap = makeTextStream(output, "text/plain");
  }

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "fasta"
        ? "lightweight-assembly.fasta"
        : outputFormat === "text-map"
          ? "lightweight-assembly-text-map.txt"
        : outputFormat === "tsv"
          ? "lightweight-assembly-overlaps.tsv"
          : "lightweight-assembly.txt",
      mimeType: outputFormat === "fasta"
        ? "text/x-fasta;charset=utf-8"
        : outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.readsProcessed,
    basesProcessed: result.inputBasesProcessed,
    charactersRemoved: result.charactersRemoved,
    streams
  });
}
