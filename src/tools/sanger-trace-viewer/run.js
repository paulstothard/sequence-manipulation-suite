import { makeSangerPlotModel, renderSangerPlot } from '../../core/sanger-plot.js';
import { SANGER_ALLELE_OUTPUTS, runSangerAlleleOutput } from '../sanger-genotyper/integrate.js';
import { runResolvedSangerSession } from './resolved-run.js';
import {
  makeSangerAssemblyTextMap,
  makeSangerCollectionBaseCallRows,
  makeSangerCollectionBaseCallTsv,
  makeSangerCollectionFasta,
  makeSangerCollectionFastq,
  makeSangerConsensusFasta,
  makeSangerTraceCollectionReport,
  makeSangerTraceCollectionViewData,
  makeSangerDifferenceReviewSvg,
  makeSangerReferenceAlignmentSvg,
  makeSangerReferenceDifferenceTsv,
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
  "analysis-json",
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
  if ((options.resolveSequences === true || ['resolution-tsv', 'assembly-input-fasta'].includes(options.outputFormat) ||
    (options.task === 'assemble' && SANGER_ALLELE_OUTPUTS.includes(options.outputFormat))) && ['assemble', 'compare'].includes(options.task))
    return runResolvedSangerSession(input, options, context);
  if (SANGER_ALLELE_OUTPUTS.includes(options.outputFormat)) return runSangerAlleleOutput(input, options, context);
  const outputFormat = normalizeOutputFormat(options.outputFormat ?? (options.task === "assemble" ? "assembly-trace-map-svg" : options.task === "compare" ? "reference-trace-map-svg" : "interactive-trace"));
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

  const needsSession = ["analysis-json", "session-report", "consensus-fasta", "assembly-text-map", "assembly-trace-map-svg", "reference-trace-map-svg", "reference-differences-tsv", "reference-alignment-svg", "difference-review-svg"].includes(outputFormat) ||
    (collection.traces.length > 1 && outputFormat === "report");
  const session = needsSession ? await prepareSangerTraceSession(input, options, context) : null;
  const report = !["interactive-trace", "report", "session-report"].includes(outputFormat) ? "" : session && (outputFormat === "report" || outputFormat === "session-report")
    ? makeSangerTraceSessionReport(session)
    : makeSangerTraceCollectionReport(collection);
  const rows = outputFormat === "tsv" ? makeSangerCollectionBaseCallRows(collection) : [];
  const sangerPlot = ["svg-trace", "assembly-trace-map-svg", "reference-trace-map-svg"].includes(outputFormat)
    ? makeSangerPlotModel(outputFormat === "svg-trace" ? "trace" : outputFormat === "assembly-trace-map-svg" ? "assembly" : "reference", session ?? {collection}, result.options) : null;
  const plotSvg = sangerPlot ? renderSangerPlot(sangerPlot) : "";
  const svg = outputFormat === "svg-trace" ? plotSvg : "";
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
  const assemblyTraceMapSvg = outputFormat === "assembly-trace-map-svg" && session ? plotSvg : "";
  const referenceTraceMapSvg = outputFormat === "reference-trace-map-svg" && session ? plotSvg : "";
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
    visual = { svg, sangerPlot };
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
  } else if (outputFormat === "analysis-json") {
    output = JSON.stringify({format:"sms3-sanger-session-analysis-v1", task:options.task, resolveSequences:false,
      reference:session.reference, sourceTraces:collection.traces.map((r,i)=>({sourceTrace:`Trace ${i+1}`,sourceName:r.view.record,
        clipStart:r.view.clipStart,clipEnd:r.view.clipEnd,orientation:r.view.orientation,sequence:r.sequence})),
      assembly:session.assembly,referenceAlignments:session.referenceAlignments,referenceDifferences:session.referenceDifferences,
      warnings:session.warnings});
    download = {filename:"sanger-analysis.json",mimeType:"application/json"};
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
    visual = { svg: assemblyTraceMapSvg, sangerPlot };
  } else if (outputFormat === "reference-trace-map-svg") {
    output = referenceTraceMapSvg;
    download = {
      filename: "sanger-reference-trace-map.svg",
      mimeType: "image/svg+xml;charset=utf-8"
    };
    visual = { svg: referenceTraceMapSvg, sangerPlot };
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

  const streams = {};
  if (["interactive-trace", "report"].includes(outputFormat)) streams.report = makeTextStream(report);
  if (outputFormat === "tsv") streams.table = makeTableStream(sangerBaseCallColumns, rows, "sanger-base-calls");
  if (outputFormat === "analysis-json") streams.analysisJson = makeTextStream(output, "application/json");
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
      streams.assemblyTextMap = makeTextStream(assemblyTextMap, "text/plain", {
        format: "assembly",
        alphabet: "dna-rna"
      });
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
    sequenceSearch: outputFormat === "assembly-text-map"
      ? { format: "assembly", alphabet: "dna-rna" }
      : ["fasta", "consensus-fasta"].includes(outputFormat)
        ? { format: "fasta", alphabet: "dna-rna" }
        : undefined,
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

export async function runSangerTraceAssembly(input, options = {}, context = {}) {
  if (['resolution-tsv', 'assembly-input-fasta', ...SANGER_ALLELE_OUTPUTS].includes(options.outputFormat)) {
    throw new Error('Use Sanger Genotyper or Resolve Mixed Sanger Trace for haplotype outputs.');
  }
  const result = await runSangerTraceViewer(input, { ...options, resolveSequences: false, task: "assemble" }, context);
  if (options.resolveSequences) result.warnings.push('Assembly now uses trimmed trace base calls. Use Sanger Genotyper or Resolve Mixed Sanger Trace for haplotype reconstruction.');
  return result;
}

export function runSangerTraceReferenceComparison(input, options = {}, context = {}) {
  return runSangerTraceViewer(input, { ...options, task: "compare" }, context);
}

export const sangerTraceViewerRunner = runSangerTraceViewer;
