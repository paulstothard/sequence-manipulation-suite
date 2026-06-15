import {
  normalizeTableSqlOutputFormat,
  runTableSqlQueryCore
} from "../../core/table-sql-query.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const DOWNLOADS = {
  table: {
    filename: "table-sql-query.tsv",
    mimeType: "text/tab-separated-values;charset=utf-8"
  },
  csv: {
    filename: "table-sql-query.csv",
    mimeType: "text/csv;charset=utf-8"
  },
  json: {
    filename: "table-sql-query.json",
    mimeType: "application/json;charset=utf-8"
  },
  report: {
    filename: "table-sql-query.txt",
    mimeType: "text/plain;charset=utf-8"
  }
};

function outputForFormat(result, outputFormat) {
  if (outputFormat === "csv") return result.csv;
  if (outputFormat === "json") return result.json;
  if (outputFormat === "report") return result.report;
  return result.tsv;
}

export async function runTableSqlQuery(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeTableSqlOutputFormat(options.outputFormat);
  const result = runTableSqlQueryCore(input, options, context);

  context.reportProgress?.({ phase: "building-output", progress: 0.75 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const streams = {
    ...(outputFormat === "report" ? { report: makeTextStream(result.report, "text/plain") } : {}),
    ...(outputFormat !== "report" ? { table: makeTableStream(result.columns, result.rows, "table-sql-query") } : {})
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output: outputForFormat(result, outputFormat),
    download: DOWNLOADS[outputFormat],
    warnings: result.warnings,
    recordsProcessed: result.rows.length,
    streams,
    optionsUsed: { outputFormat }
  });
}
