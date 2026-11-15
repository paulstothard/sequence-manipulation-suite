import { makePcrAmpliconGff } from "../../core/pcr-annotated-export.js";
import { createGelAppearanceSeed } from "../../core/gel-image.js";
import {
  findInSilicoPcrProductsAsync,
  makePcrBindingSitesTsv,
  makePcrBindingAlignments,
  makePcrProductGelSvg,
  makePcrViewerData,
  makePcrProductsFasta,
  makePcrProductsTsv,
  makePcrReport,
  makePcrTextMap,
  pcrBindingSiteTableColumns,
  pcrProductTableColumns
} from "../../core/in-silico-pcr.js";
import { makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { makeDesignAnalysisJson } from "../../core/design-analysis.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

export async function runInSilicoPcr(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "scanning-primers", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = await findInSilicoPcrProductsAsync(input, options, context);
  const { outputFormat, lineWidth, textMapWidth } = result.options;

  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makePcrReport(result);
  const tsv = makePcrProductsTsv(result.rows);
  const bindingSitesTsv = makePcrBindingSitesTsv(result.siteRows);
  const fasta = makePcrProductsFasta(result.rows, lineWidth);
  const textMap = outputFormat === "text-map" ? makePcrTextMap(result, textMapWidth) : "";
  const gelSvg = outputFormat === "svg-gel" ? makePcrProductGelSvg(result, { gelAppearanceSeed: createGelAppearanceSeed() }) : "";
  const viewer = outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer"
    ? makePcrViewerData(result, { layout: outputFormat === "interactive-circular-viewer" ? "circular" : "linear" })
    : null;
  const viewerJson = viewer ? JSON.stringify(viewer, null, 2) : "";
  const alignments = outputFormat === "alignments" ? makePcrBindingAlignments(result) : "";
  const analysis = outputFormat === "analysis-json" ? makeDesignAnalysisJson("in-silico-pcr", result, options) : "";
  const ampliconGff = outputFormat === "amplicon-gff3" ? makePcrAmpliconGff(result) : "";
  const outputs = {
    "amplicon-gff3": ampliconGff,
    alignments,
    "analysis-json": analysis,
    report,
    tsv,
    "binding-sites-tsv": bindingSitesTsv,
    fasta,
    "text-map": textMap,
    "svg-gel": gelSvg,
    "interactive-viewer": viewerJson,
    "interactive-circular-viewer": viewerJson
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    sequenceSearch: outputFormat === "fasta"
      ? { format: "fasta", alphabet: "dna-rna" }
      : outputFormat === "text-map"
        ? { format: "labelled-blocks", alphabet: "dna-rna" }
        : undefined,
    download: {
      filename: outputFormat === "amplicon-gff3" ? "pcr-amplicons.gff3" : outputFormat === "analysis-json" ? "in-silico-pcr-analysis.json" : outputFormat === "alignments" ? "in-silico-pcr-alignments.txt" : outputFormat === "tsv"
        ? "in-silico-pcr-products.tsv"
        : outputFormat === "binding-sites-tsv"
          ? "in-silico-pcr-binding-sites.tsv"
          : outputFormat === "fasta"
            ? "in-silico-pcr-products.fasta"
            : outputFormat === "text-map"
              ? "in-silico-pcr-primer-map.txt"
              : outputFormat === "svg-gel"
                ? "in-silico-pcr-gel.svg"
                : outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer"
                  ? "in-silico-pcr-viewer.json"
                  : "in-silico-pcr.txt",
      mimeType: outputFormat === "analysis-json" ? "application/json;charset=utf-8" : outputFormat.endsWith("-tsv") || outputFormat === "tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "fasta"
          ? "text/x-fasta;charset=utf-8"
          : outputFormat === "svg-gel"
            ? "image/svg+xml;charset=utf-8"
            : outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer"
              ? "application/json;charset=utf-8"
              : "text/plain;charset=utf-8"
    },
    optionsUsed: result.options,
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    charactersRemoved: result.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      ...(ampliconGff ? { ampliconGff: makeTextStream(ampliconGff, "text/plain") } : {}),
      table: makeTableStream(pcrProductTableColumns, result.rows, "in-silico-pcr-products"),
      bindingSites: makeTableStream(pcrBindingSiteTableColumns, result.siteRows, "in-silico-pcr-binding-sites"),
      ...(alignments ? { alignments: makeTextStream(alignments, "text/plain") } : {}),
      ...(analysis ? { analysis: makeTextStream(analysis, "application/json") } : {}),
      ...(outputFormat === "fasta" ? { fasta: makeTextStream(fasta, "text/x-fasta") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain", { format: "labelled-blocks", alphabet: "dna-rna" }) } : {}),
      ...(outputFormat === "svg-gel" ? { gel: makeTextStream(gelSvg, "image/svg+xml") } : {}),
      ...(viewer ? { viewer: makeDnaViewerStream(viewer) } : {})
    },
    visual: outputFormat === "svg-gel"
      ? { svg: gelSvg, pngDownload: true }
      : viewer
        ? { viewer }
        : undefined
  });
}
