import { buildMarkdownNotebook } from "../../core/markdown-notebook.js";
import { makeTextStream, makeToolResult } from "../../core/workflow.js";

export async function runMarkdownNotebook(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "building-notebook", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const result = buildMarkdownNotebook(input, options);
  const outputFormat = options.outputFormat === "report" ? "report" : options.outputFormat === "notebook" ? "notebook" : "markdown";
  const output = outputFormat === "report" ? result.report : result.markdown;

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: outputFormat === "report" ? "markdown-notebook-report.txt" : result.filename,
      mimeType: outputFormat === "report" ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8"
    },
    warnings: result.warnings,
    recordsProcessed: 1,
    processedUnitLabel: "notebook",
    streams: {
      report: makeTextStream(result.report, "text/plain")
    },
    visual: outputFormat === "notebook"
      ? {
        notebook: {
          markdown: result.markdown,
          filename: result.filename,
          title: options.title || "Untitled notes"
        }
      }
      : undefined
  });
}
