import { parseTreeDocument } from "../../../packages/tree-viewer/src/core/index.js";
import {
  makeTreeDocumentStream,
  TREE_DOCUMENT_MEDIA_TYPE,
} from "../../core/tree-document-stream.js";
import { makeToolResult } from "../../core/workflow.js";
export async function runTreeViewer(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  const { document, diagnostics } = await parseTreeDocument(input, { supportProfile: options.supportProfile ?? "unresolved" }, context);
  context.throwIfCancelled?.();
  const treeDocument = makeTreeDocumentStream(document);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output: treeDocument.items[0].text,
    download: {
      filename: "tree-document.json",
      mimeType: TREE_DOCUMENT_MEDIA_TYPE,
    },
    recordsProcessed: document.trees.length,
    basesProcessed: document.trees.reduce((count, tree) => count + tree.nodes.length, 0),
    processedUnitLabel: "node",
    warnings: diagnostics.map((d) => d.message),
    streams: { treeDocument },
    visual: { treeViewer: { document } },
    optionsUsed: { formatVersion: document.formatVersion, supportProfile: options.supportProfile ?? "unresolved" },
  });
}
