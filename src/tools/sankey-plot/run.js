import { makeSankeyPlot, sankeyFlowColumns, sankeyRowsToTsv } from "../../core/sankey-plot.js";
import { makeTableStream, makeToolResult } from "../../core/workflow.js";

export async function runSankeyPlot(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "plotting-sankey", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = makeSankeyPlot(input, options);
  const outputFormat = options.outputFormat === "flow-tsv" ? "flow-tsv" : "svg";
  const tsv = sankeyRowsToTsv(result.rows);
  const output = outputFormat === "flow-tsv" ? tsv : result.svg;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "flow-tsv" ? "sankey-flows.tsv" : "sankey-plot.svg",
      mimeType: outputFormat === "flow-tsv" ? "text/tab-separated-values;charset=utf-8" : "image/svg+xml;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.table.rows.length,
    streams: {
      flowTable: makeTableStream(sankeyFlowColumns, result.rows, "sankey-flows")
    },
    visual: outputFormat === "svg" ? { svg: result.svg, pngDownload: true } : undefined
  });
}
