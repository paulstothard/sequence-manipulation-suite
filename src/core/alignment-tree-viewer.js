import { buildNeighborJoiningTree } from "./multiple-sequence-alignment.js";
import { parseTreeDocument } from "../../packages/tree-viewer/src/core/index.js";
import { makeTreeDocumentStream, TREE_DOCUMENT_MEDIA_TYPE } from "./tree-document-stream.js";
import { makeTextStream, makeToolResult } from "./workflow.js";

/** Materialize the computed NJ tree directly, without building static figures. */
export async function makeAlignmentTreeViewerResult(prepared, sourceName, context = {}, newick) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: "building-tree", progress: 0.85 });
  const treeWarnings = [];
  newick ??= buildNeighborJoiningTree(prepared.alignment, { warnings: treeWarnings });
  const { document, diagnostics } = await parseTreeDocument(newick, { sourceName }, context);
  for (const tree of document.trees) {
    document.presentation[tree.id].layout = "unrooted";
    document.presentation[tree.id].metric = "phylogram";
    document.presentation[tree.id].labelAlignment = "at-tip";
  }
  context.throwIfCancelled?.();
  const treeDocument = makeTreeDocumentStream(document);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output: treeDocument.items[0].text,
    download: { filename: "alignment-tree.json", mimeType: TREE_DOCUMENT_MEDIA_TYPE },
    warnings: [...prepared.warnings, ...treeWarnings, ...diagnostics.map((item) => item.message)],
    notes: prepared.notes,
    processedUnitLabel: prepared.alignment.alphabet === "protein" ? "residue" : "base",
    recordsProcessed: prepared.records.length,
    basesProcessed: prepared.totalSymbols,
    charactersRemoved: prepared.charactersRemoved,
    streams: { treeDocument, newick: makeTextStream(newick, "text/x-newick") },
    visual: { treeViewer: { document } },
    optionsUsed: {
      sequenceType: prepared.alignment.alphabet,
      alignmentEngine: prepared.alignment.engine,
      treeMethod: "neighbor-joining"
    }
  });
}
