import {
  joinTables,
  makeJoinedTableTsv
} from "../../core/table-join.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["tsv", "report"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "tsv";
}

export async function runTableJoin(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = joinTables(input, options);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const tsv = makeJoinedTableTsv(result.outputColumns, result.outputRows);
  const outputs = {
    tsv,
    report: result.report
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: outputFormat === "report" ? "table-join.txt" : "table-join.tsv",
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: result.outputRows.length,
    streams: {
      report: makeTextStream(result.report, "text/plain"),
      table: makeTableStream(result.outputColumns, result.outputRows, "table-join")
    }
  });
}
