import { buildPlateLayout, plateColumns, plateAssignmentRows, plateAssignmentText } from "../../core/plate-layout.js";
import { makeToolResult, makeTextStream, makeTableStream } from "../../core/workflow.js";
export async function runPlateLayout(input, options = {}, context = {}) {
  const layout = await buildPlateLayout(input, options, context);
  const source = { input: String(input), options: { ...options }, layout };
  const document = { format: "sms3-editor-document", version: 1, tool: "plate-layout-planner", source, state: { layout } };
  const isTable = layout.settings.outputFormat === "table";
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "finishing-layout", progress: 1 });
  const output = isTable ? plateAssignmentText(layout) : JSON.stringify(document);
  return makeToolResult({ output,
    download: { filename: isTable ? "plate-assignments.tsv" : "plate-layout-planner.sms3.json", mimeType: isTable ? "text/tab-separated-values" : "application/json" },
    recordsProcessed: new Set(layout.items.map(item => item.id.split("-R")[0])).size,
    basesProcessed: layout.items.length, processedUnitLabel: "assignment",
    streams: isTable ? { table: makeTableStream(plateColumns, plateAssignmentRows(layout), "plate-assignments") } : { document: makeTextStream(output, "application/json") },
    visual: isTable ? undefined : { plateLayout: source }, optionsUsed: { ...options, seed: layout.settings.seed }
  });
}
