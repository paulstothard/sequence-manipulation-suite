import {
  compareLists,
  formatItemList,
  listOverlapColumns,
  makeListOverlapTableTsv,
  makeListOverlapVennSvg,
  VENN_DIAGRAM_MAX_LISTS
} from "../../core/list-overlap.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["table-tsv", "shared", "unique-one", "venn-svg", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "venn-svg";
}

export async function runVennDiagram(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = compareLists(input, options, context);
  const warnings = [...(result.warnings ?? [])];
  if ((result.listCount ?? 0) > VENN_DIAGRAM_MAX_LISTS) {
    warnings.push(`Venn Diagram supports up to ${VENN_DIAGRAM_MAX_LISTS} lists. Use UpSet Plot for larger list comparisons.`);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const sharedItems = formatItemList(result.shared);
  const uniqueItems = formatItemList(result.uniqueToOneList);
  const vennSvg = makeListOverlapVennSvg(result, options);
  const outputs = {
    "table-tsv": makeListOverlapTableTsv(result.rows),
    shared: sharedItems,
    "unique-one": uniqueItems,
    "venn-svg": vennSvg,
    report: result.report
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "table-tsv" ? "venn-diagram-comparison.tsv" : outputFormat.endsWith("-svg") ? "venn-diagram.svg" : "venn-diagram.txt",
      mimeType: outputFormat === "table-tsv" ? "text/tab-separated-values;charset=utf-8" : outputFormat.endsWith("-svg") ? "image/svg+xml;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: result.rows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      venn: makeTextStream(vennSvg, "image/svg+xml"),
      sharedItems: makeTextStream(sharedItems, "text/plain"),
      uniqueItems: makeTextStream(uniqueItems, "text/plain"),
      table: makeTableStream(listOverlapColumns, result.rows, "list-overlap")
    },
    visual: outputFormat.endsWith("-svg") ? { svg: outputs[outputFormat], pngDownload: true } : undefined
  });
}
