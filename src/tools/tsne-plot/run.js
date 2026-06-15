import {
  runTsneEmbedding,
  tsneEmbeddingColumns,
  tsneEmbeddingToTsv
} from "../../core/tsne-plot.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["svg", "embedding-table", "report"]);

export async function runTsnePlot(input, options = {}, context = {}) {
  const outputFormat = OUTPUT_FORMATS.has(options.outputFormat) ? options.outputFormat : "svg";
  context.reportProgress?.({ phase: "preparing-tsne", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = await runTsneEmbedding(input, options, context);
  const embeddingTsv = tsneEmbeddingToTsv(result.embeddingRows);
  const output = outputFormat === "report"
    ? result.report
    : outputFormat === "embedding-table"
      ? embeddingTsv
      : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report"
        ? "tsne-plot.txt"
        : outputFormat === "embedding-table"
          ? "tsne-embedding.tsv"
          : "tsne-plot.svg",
      mimeType: outputFormat === "svg" ? "image/svg+xml;charset=utf-8" : outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      embeddingTable: makeTableStream(tsneEmbeddingColumns, result.embeddingRows, "tsne-embedding")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
