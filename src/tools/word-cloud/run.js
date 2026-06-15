import { makeWordCloud, wordCloudColumns, wordCloudRowsToTsv } from "../../core/text-word-cloud.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runWordCloud(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "counting-words", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeWordCloud(input, options);
  const outputFormat = options.outputFormat === "word-tsv" ? "word-tsv" : "svg";
  const tsv = wordCloudRowsToTsv(result.rows);
  const output = outputFormat === "word-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "word-tsv" ? "word-cloud-counts.tsv" : "word-cloud.svg",
      mimeType: outputFormat === "word-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.totalWords,
    streams: {
      wordTable: makeTableStream(wordCloudColumns, result.rows, "word-cloud-counts")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
