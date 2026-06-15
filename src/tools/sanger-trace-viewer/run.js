import {
  makeSangerAssemblyTextMap,
  makeSangerCollectionBaseCallRows,
  makeSangerCollectionBaseCallTsv,
  makeSangerCollectionFasta,
  makeSangerCollectionFastq,
  makeSangerConsensusFasta,
  makeSangerCollectionTraceSvg,
  makeSangerAssemblyTraceMapSvg,
  makeSangerTraceCollectionReport,
  makeSangerTraceCollectionViewData,
  makeSangerDifferenceReviewSvg,
  makeSangerReferenceAlignmentSvg,
  makeSangerReferenceDifferenceTsv,
  makeSangerReferenceTraceMapSvg,
  makeSangerTraceJson,
  makeSangerTraceSessionReport,
  prepareSangerTraceCollection,
  prepareSangerTraceSession,
  sangerBaseCallColumns,
  sangerReferenceDifferenceColumns
} from "../../core/sanger-trace.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set([
  "interactive-trace",
  "svg-trace",
  "tsv",
  "fasta",
  "fastq",
  "trace-json",
  "report",
  "session-report",
  "consensus-fasta",
  "assembly-text-map",
  "assembly-trace-map-svg",
  "reference-trace-map-svg",
  "reference-differences-tsv",
  "reference-alignment-svg",
  "difference-review-svg"
]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "interactive-trace";
}

export async function runSangerTraceViewer(input, options = {}, context = {}) {
  const outputFormat = normalizeOutputFormat(options.outputFormat);
  context.reportProgress?.({ phase: "parsing-trace", progress: 0.08 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const collection = prepareSangerTraceCollection(input, options);
  const result = collection.traces[0];
  if (!result) {
    throw new Error("No Sanger trace input was provided.");
  }
  context.reportProgress?.({ phase: "preparing-base-calls", progress: 0.45 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const needsSession = ["session-report", "consensus-fasta", "assembly-text-map", "assembly-trace-map-svg", "reference-trace-map-svg", "reference-differences-tsv", "reference-alignment-svg", "difference-review-svg"].includes(outputFormat) ||
    (collection.traces.length > 1 && outputFormat === "report");
  const session = needsSession ? await prepareSangerTraceSession(input, options, context) : null;
  const report = session && (outputFormat === "report" || outputFormat === "session-report")
    ? makeSangerTraceSessionReport(session)
    : makeSangerTraceCollectionReport(collection);
  const rows = makeSangerCollectionBaseCallRows(collection);
  const svg = outputFormat === "svg-trace" ? makeSangerCollectionTraceSvg(collection) : "";
  const sangerTrace = outputFormat === "interactive-trace" ? makeSangerTraceCollectionViewData(collection) : null;
  const fasta = outputFormat === "fasta" ? makeSangerCollectionFasta(collection, result.options.lineWidth) : "";
  const fastq = outputFormat === "fastq" ? makeSangerCollectionFastq(collection) : "";
  const traceJson = outputFormat === "trace-json"
    ? JSON.stringify({
        format: "sms3-sanger-trace-session-result-v1",
        traces: collection.traces.map((traceResult) => JSON.parse(makeSangerTraceJson(traceResult))),
        reference: collection.reference,
        traceCount: collection.traces.length
      }, null, 2)
    : "";
  const tsv = outputFormat === "tsv" ? makeSangerCollectionBaseCallTsv(collection) : "";
  const consensusFasta = outputFormat === "consensus-fasta" && session ? makeSangerConsensusFasta(session, result.options.lineWidth) : "";
  const assemblyTextMap = outputFormat === "assembly-text-map" && session ? makeSangerAssemblyTextMap(session, result.options.lineWidth) : "";
  const assemblyTraceMapSvg = outputFormat === "assembly-trace-map-svg" && session ? makeSangerAssemblyTraceMapSvg(session) : "";
  const referenceTraceMapSvg = outputFormat === "reference-trace-map-svg" && session ? makeSangerReferenceTraceMapSvg(session) : "";
  const referenceDifferencesTsv = outputFormat === "reference-differences-tsv" && session ? makeSangerReferenceDifferenceTsv(session) : "";
  const referenceAlignmentSvg = outputFormat === "reference-alignment-svg" && session ? makeSangerReferenceAlignmentSvg(session, { lineWidth: result.options.lineWidth }) : "";
  const differenceReviewSvg = outputFormat === "difference-review-svg" && session ? makeSangerDifferenceReviewSvg(session) : "";

  context.reportProgress?.({ phase: "building-output", progress: 0.82 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  let output = report;
  let download = {
    filename: "sanger-trace-report.txt",
    mimeType: "text/plain;charset=utf-8"
  };
  let visual;

  if (outputFormat === "interactive-trace") {
    output = report;
    download = {
      filename: "sanger-trace-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
    visual = { sangerTrace };
  } else if (outputFormat === "svg-trace") {
    output = svg;
    download = {
      filename: "sanger-trace.svg",
      mimeType: "image/svg+xml;charset=utf-8"
    };
    visual = { svg };
  } else if (outputFormat === "tsv") {
    output = tsv;
    download = {
      filename: "sanger-base-calls.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  } else if (outputFormat === "fasta") {
    output = fasta;
    download = {
      filename: "sanger-clipped-sequence.fasta",
      mimeType: "text/x-fasta;charset=utf-8"
    };
  } else if (outputFormat === "fastq") {
    output = fastq;
    download = {
      filename: "sanger-clipped-sequence.fastq",
      mimeType: "text/x-fastq;charset=utf-8"
    };
  } else if (outputFormat === "trace-json") {
    output = traceJson;
    download = {
      filename: "sanger-trace-view.json",
      mimeType: "application/json;charset=utf-8"
    };
  } else if (outputFormat === "session-report") {
    output = report;
    download = {
      filename: "sanger-trace-session-report.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  } else if (outputFormat === "consensus-fasta") {
    output = consensusFasta;
    download = {
      filename: "sanger-consensus.fasta",
      mimeType: "text/x-fasta;charset=utf-8"
    };
  } else if (outputFormat === "assembly-text-map") {
    output = assemblyTextMap;
    download = {
      filename: "sanger-trace-assembly-map.txt",
      mimeType: "text/plain;charset=utf-8"
    };
  } else if (outputFormat === "assembly-trace-map-svg") {
    output = assemblyTraceMapSvg;
    download = {
      filename: "sanger-trace-assembly-map.svg",
      mimeType: "image/svg+xml;charset=utf-8"
    };
    visual = { svg: assemblyTraceMapSvg };
  } else if (outputFormat === "reference-trace-map-svg") {
    output = referenceTraceMapSvg;
    download = {
      filename: "sanger-reference-trace-map.svg",
      mimeType: "image/svg+xml;charset=utf-8"
    };
    visual = { svg: referenceTraceMapSvg };
  } else if (outputFormat === "reference-differences-tsv") {
    output = referenceDifferencesTsv;
    download = {
      filename: "sanger-reference-differences.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8"
    };
  } else if (outputFormat === "reference-alignment-svg") {
    output = referenceAlignmentSvg;
    download = {
      filename: "sanger-reference-alignment.svg",
      mimeType: "image/svg+xml;charset=utf-8"
    };
    visual = { svg: referenceAlignmentSvg };
  } else if (outputFormat === "difference-review-svg") {
    output = differenceReviewSvg;
    download = {
      filename: "sanger-difference-review.svg",
      mimeType: "image/svg+xml;charset=utf-8"
    };
    visual = { svg: differenceReviewSvg };
  }

  const streams = {
    report: makeTextStream(report),
    table: makeTableStream(sangerBaseCallColumns, rows, "sanger-base-calls")
  };
  if (svg) {
    streams.traceSvg = makeTextStream(svg, "image/svg+xml");
  }
  if (fasta) {
    streams.fasta = makeTextStream(fasta, "text/x-fasta");
  }
  if (fastq) {
    streams.fastq = makeTextStream(fastq, "text/x-fastq");
  }
  if (traceJson) {
    streams.traceJson = makeTextStream(traceJson, "application/json");
  }
  if (session) {
    if (outputFormat === "session-report" || (outputFormat === "report" && collection.traces.length > 1)) {
      streams.sessionReport = makeTextStream(report, "text/plain");
    }
    if (consensusFasta) {
      streams.consensusFasta = makeTextStream(consensusFasta, "text/x-fasta");
    }
    if (assemblyTextMap) {
      streams.assemblyTextMap = makeTextStream(assemblyTextMap, "text/plain");
    }
    if (assemblyTraceMapSvg) {
      streams.assemblyTraceMapSvg = makeTextStream(assemblyTraceMapSvg, "image/svg+xml");
    }
    if (referenceTraceMapSvg) {
      streams.referenceTraceMapSvg = makeTextStream(referenceTraceMapSvg, "image/svg+xml");
    }
    if (outputFormat === "reference-differences-tsv") {
      streams.referenceDifferences = makeTableStream(
        sangerReferenceDifferenceColumns,
        session.referenceDifferences,
        "sanger-reference-differences"
      );
    }
    if (referenceAlignmentSvg) {
      streams.referenceAlignmentSvg = makeTextStream(referenceAlignmentSvg, "image/svg+xml");
    }
    if (differenceReviewSvg) {
      streams.differenceReviewSvg = makeTextStream(differenceReviewSvg, "image/svg+xml");
    }
  }

  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    download,
    warnings: session?.warnings ?? collection.warnings,
    recordsProcessed: collection.traces.length,
    basesProcessed: collection.traces.reduce((sum, traceResult) => sum + traceResult.trace.baseCalls.length, 0),
    processedUnitLabel: "base call",
    streams,
    visual
  });
}

export function runSangerTraceReviewEditor(input, options = {}, context = {}) {
  return runSangerTraceViewer(input, { ...options, task: "edit" }, context);
}

export function runSangerTraceAssembly(input, options = {}, context = {}) {
  return runSangerTraceViewer(input, { ...options, task: "assemble" }, context);
}

export function runSangerTraceReferenceComparison(input, options = {}, context = {}) {
  return runSangerTraceViewer(input, { ...options, task: "compare" }, context);
}

export const sangerTraceViewerRunner = runSangerTraceViewer;
