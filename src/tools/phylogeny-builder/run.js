import { makeAlignmentTreeViewerResult } from "../../core/alignment-tree-viewer.js";
import { buildNeighborJoiningTree } from "../../core/multiple-sequence-alignment.js";
import { parseTreeDocument } from "../../../packages/tree-viewer/src/core/index.js";
import { makeTreeDocumentStream } from "../../core/tree-document-stream.js";
import {
  PHYLOGENY_OUTPUT_FORMATS,
  alignPhylogenyInput,
  makePhylogenyArtifacts,
  phylogenyDistanceTableColumns
} from "../../core/phylogeny-builder.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(Object.values(PHYLOGENY_OUTPUT_FORMATS));

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : PHYLOGENY_OUTPUT_FORMATS.treePlot;
}

function selectedOutput(artifacts, outputFormat) {
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.treeReport) return artifacts.treeReport;
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.distanceTable) return artifacts.distanceTsv;
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.alignedFasta) return artifacts.alignedFasta;
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.alignmentReport) return artifacts.alignmentReport;
  return artifacts.treeSvg;
}

function downloadMetadata(outputFormat) {
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.treeReport) {
    return {
      filename: "phylogeny-tree-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.distanceTable) {
    return {
      filename: "phylogeny-distance-table.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  }
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.alignedFasta) {
    return {
      filename: "phylogeny-aligned-sequences.fasta",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.alignmentReport) {
    return {
      filename: "phylogeny-alignment-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  }
  return {
    filename: "phylogeny-tree.svg",
    mimeType: "image/svg+xml;charset=utf-8"
  };
}

export async function runPhylogenyBuilder(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const prepared = await alignPhylogenyInput(input, { ...options, outputFormat }, context);
  if (!prepared.alignment) {
    return makeToolResult({
      output: "",
      warnings: prepared.warnings,
      recordsProcessed: prepared.records.length,
      basesProcessed: prepared.totalSymbols,
      charactersRemoved: prepared.charactersRemoved
    });
  }

  if (outputFormat === PHYLOGENY_OUTPUT_FORMATS.treeViewer) {
    return makeAlignmentTreeViewerResult(prepared, "Phylogeny Builder", context);
  }

  context.reportProgress?.({ phase: "building-tree", progress: 0.85 });
  context.throwIfCancelled?.();
  const artifacts = makePhylogenyArtifacts(prepared);
  const newick = buildNeighborJoiningTree(prepared.alignment);
  const { document } = await parseTreeDocument(newick, { sourceName: "Phylogeny Builder" }, context);
  const treeDocument = makeTreeDocumentStream(document);
  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: selectedOutput(artifacts, outputFormat),
    download: downloadMetadata(outputFormat),
    warnings: prepared.warnings,
    recordsProcessed: prepared.records.length,
    basesProcessed: prepared.totalSymbols,
    charactersRemoved: prepared.charactersRemoved,
    streams: {
      treeDocument,
      newick: makeTextStream(newick, "text/x-newick"),
      plot: makeTextStream(artifacts.treeSvg, "image/svg+xml"),
      tree: makeTextStream(artifacts.treeReport, "text/plain"),
      distanceTable: makeTableStream(phylogenyDistanceTableColumns, artifacts.distanceRows, "phylogeny-distance-table"),
      alignedFasta: makeTextStream(artifacts.alignedFasta, "text/x-fasta"),
      alignmentReport: makeTextStream(artifacts.alignmentReport, "text/plain")
    },
    visual: outputFormat === PHYLOGENY_OUTPUT_FORMATS.treePlot ? { svg: artifacts.treeSvg } : undefined,
    optionsUsed: {
      sequenceType: prepared.alignment.alphabet,
      alignmentEngine: prepared.alignment.engine,
      treeMethod: "neighbor-joining"
    }
  });
}
