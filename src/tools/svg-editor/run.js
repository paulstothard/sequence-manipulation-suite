import {
  createGraphicSource,
  initialGraphicState,
} from "../../core/graphic-editor.js";
import { makeToolResult, makeTextStream } from "../../core/workflow.js";
export async function runGraphicEditor(input, kind, context = {}) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "Reading image", progress: 0.2 });
  await context.yieldIfNeeded?.();
  const source = createGraphicSource(input, kind);
  context.throwIfCancelled?.();
  const tool = kind === "svg" ? "svg-editor" : "image-annotator";
  const document = {
    format: "sms3-editor-document",
    version: 1,
    tool,
    source,
    state: initialGraphicState(),
  };
  const output = JSON.stringify(document);
  context.reportProgress?.({ phase: "Image ready", progress: 1 });
  return makeToolResult({
    output,
    download: { filename: `${tool}.sms3.json`, mimeType: "application/json" },
    warnings: source.warnings,
    recordsProcessed: 1,
    basesProcessed: 0,
    streams: { document: makeTextStream(output, "application/json") },
    visual: { graphicEditor: source },
  });
}
export const runSvgEditor = (input, options, context) =>
  runGraphicEditor(input, "svg", context);
