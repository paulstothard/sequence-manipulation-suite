import { prepareSequenceExtractor } from "../../core/sequence-extractor.js";
import { makeDnaViewerStream } from "../../core/dna-viewer-data.js";
import { makeToolResult } from "../../core/workflow.js";

export async function runSequenceExtractor(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  const extractor = await prepareSequenceExtractor(input, options, context);
  context.reportProgress?.({ phase: "building-sequence-document", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const viewer = {
    viewerType: "dna-sequence-viewer",
    version: 1,
    layout: "linear",
    title: extractor.title,
    alphabet: "dna-rna",
    geneticCode: extractor.geneticCode,
    records: extractor.records
  };
  const output = JSON.stringify(extractor, null, 2);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download: {
      filename: "sequence-extractor.json",
      mimeType: "application/json;charset=utf-8"
    },
    warnings: extractor.warnings,
    recordsProcessed: extractor.metrics.records,
    basesProcessed: extractor.metrics.bases,
    charactersRemoved: 0,
    streams: {
      sequenceExtractor: {
        kind: "viewer",
        viewerType: "sequence-extractor",
        title: "Interactive sequence extraction workspace",
        viewer: extractor
      },
      viewer: makeDnaViewerStream(viewer)
    },
    visual: { sequenceExtractor: extractor }
  });
}
