import {
  compareLists,
  formatItemList,
  listOverlapColumns,
  makeListOverlapTableTsv,
  makeListOverlapUpsetSvg
} from "../../core/list-overlap.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["table-tsv", "shared", "unique-one", "upset-svg", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "upset-svg";
}

export async function runUpsetPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = compareLists(input, options, context);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const sharedItems = formatItemList(result.shared);
  const uniqueItems = formatItemList(result.uniqueToOneList);
  const upsetSvg = makeListOverlapUpsetSvg(result, options);
  const outputs = {
    "table-tsv": makeListOverlapTableTsv(result.rows),
    shared: sharedItems,
    "unique-one": uniqueItems,
    "upset-svg": upsetSvg,
    report: result.report
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "table-tsv" ? "upset-plot-comparison.tsv" : outputFormat.endsWith("-svg") ? "upset-plot.svg" : "upset-plot.txt",
      mimeType: outputFormat === "table-tsv" ? "text/tab-separated-values;charset=utf-8" : outputFormat.endsWith("-svg") ? "image/svg+xml;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      upset: makeTextStream(upsetSvg, "image/svg+xml"),
      sharedItems: makeTextStream(sharedItems, "text/plain"),
      uniqueItems: makeTextStream(uniqueItems, "text/plain"),
      table: makeTableStream(listOverlapColumns, result.rows, "list-overlap")
    },
    visual: outputFormat.endsWith("-svg") ? { svg: outputs[outputFormat], pngDownload: true } : undefined
  });
}
