import {
  findInSilicoPcrProductsAsync,
  makePcrBindingSitesTsv,
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
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["report", "tsv", "binding-sites-tsv", "fasta", "text-map", "svg-gel", "interactive-viewer", "interactive-circular-viewer"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "report";
}

export async function runInSilicoPcr(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "scanning-primers", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = await findInSilicoPcrProductsAsync(input, options, context);
  const outputFormat = normalizeOutputFormat(options.outputFormat);

  context.reportProgress?.({ phase: "building-output", progress: 0.85 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const report = makePcrReport(result);
  const tsv = makePcrProductsTsv(result.rows);
  const bindingSitesTsv = makePcrBindingSitesTsv(result.siteRows);
  const fasta = makePcrProductsFasta(result.rows, options.lineWidth);
  const textMap = outputFormat === "text-map" ? makePcrTextMap(result, options.textMapWidth) : "";
  const gelSvg = outputFormat === "svg-gel" ? makePcrProductGelSvg(result) : "";
  const viewer = outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer"
    ? makePcrViewerData(result, { layout: outputFormat === "interactive-circular-viewer" ? "circular" : "linear" })
    : null;
  const viewerJson = viewer ? JSON.stringify(viewer, null, 2) : "";
  const outputs = {
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
    download: {
      filename: outputFormat === "tsv"
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
      mimeType: outputFormat.endsWith("-tsv") || outputFormat === "tsv"
        ? "text/tab-separated-values;charset=utf-8"
        : outputFormat === "fasta"
          ? "text/x-fasta;charset=utf-8"
          : outputFormat === "svg-gel"
            ? "image/svg+xml;charset=utf-8"
            : outputFormat === "interactive-viewer" || outputFormat === "interactive-circular-viewer"
              ? "application/json;charset=utf-8"
              : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.records.length,
    basesProcessed: result.records.reduce((sum, record) => sum + record.sequence.length, 0),
    charactersRemoved: result.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      table: makeTableStream(pcrProductTableColumns, result.rows, "in-silico-pcr-products"),
      bindingSites: makeTableStream(pcrBindingSiteTableColumns, result.siteRows, "in-silico-pcr-binding-sites"),
      ...(outputFormat === "fasta" ? { fasta: makeTextStream(fasta, "text/x-fasta") } : {}),
      ...(outputFormat === "text-map" ? { textMap: makeTextStream(textMap, "text/plain") } : {}),
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
