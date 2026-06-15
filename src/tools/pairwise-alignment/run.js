import {
  codonAlignmentTableColumns,
  makeAlignedFasta,
  makeAlignedCodonFasta,
  makeAlignedProteinFromCodonsFasta,
  makeAlignmentTsv,
  makeCodonAlignmentTsv,
  makeClustal,
  makeColoredAlignmentSvg,
  makeColoredCodonAlignmentSvg,
  makePairwiseCodonAlignmentReport,
  makePairwiseCodonAlignmentText,
  makePairwiseAlignmentReport,
  makePairwiseAlignmentText,
  pairwiseAlignmentTableColumns,
  preparePairwiseCodonAlignment,
  preparePairwiseAlignment
} from "../../core/pairwise-alignment.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set(["report", "alignment-text", "aligned-fasta", "clustal", "tsv", "svg-color"]);
const CODON_OUTPUT_FORMATS = new Set(["report", "alignment-text", "codon-fasta", "protein-fasta", "tsv", "svg-color"]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "svg-color";
}

function normalizeCodonOutputFormat(value) {
  return CODON_OUTPUT_FORMATS.has(value) ? value : "svg-color";
}

function makeEmptyResult(warnings) {
  return makeToolResult({
    output: "",
    warnings,
    recordsProcessed: 0,
    basesProcessed: 0,
    charactersRemoved: 0
  });
}

async function runPairwiseAlignment(input, options = {}, alphabet, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.03 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const normalizedOptions = {
    ...options,
    scoringMatrix: alphabet === "protein" ? "blosum62" : "identity"
  };
  const prepared = await preparePairwiseAlignment(input, normalizedOptions, alphabet, context);
  if (!prepared.alignment) {
    return makeEmptyResult(prepared.warnings);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  const report = makePairwiseAlignmentReport(prepared.records, prepared.alignment, normalizedOptions);
  const alignmentText = makePairwiseAlignmentText(prepared.records, prepared.alignment, options.lineWidth);
  const fasta = makeAlignedFasta(prepared.records, prepared.alignment, options.lineWidth);
  const clustal = makeClustal(prepared.records, prepared.alignment, options.lineWidth);
  const tsv = makeAlignmentTsv(prepared.alignment);
  const svg = makeColoredAlignmentSvg(prepared.records, prepared.alignment, options.lineWidth);

  const outputs = {
    report,
    "alignment-text": alignmentText,
    "aligned-fasta": fasta,
    clustal,
    tsv,
    "svg-color": svg
  };
  const extensions = {
    report: "txt",
    "alignment-text": "txt",
    "aligned-fasta": "fasta",
    clustal: "aln",
    tsv: "tsv",
    "svg-color": "svg"
  };
  const mimeTypes = {
    report: "text/plain;charset=utf-8",
    "alignment-text": "text/plain;charset=utf-8",
    "aligned-fasta": "text/plain;charset=utf-8",
    clustal: "text/plain;charset=utf-8",
    tsv: "text/tab-separated-values;charset=utf-8",
    "svg-color": "image/svg+xml;charset=utf-8"
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: `${alphabet === "protein" ? "protein" : "dna-rna"}-pairwise-alignment.${extensions[outputFormat]}`,
      mimeType: mimeTypes[outputFormat]
    },
    warnings: prepared.warnings,
    recordsProcessed: 2,
    basesProcessed: prepared.records[0].sequence.length + prepared.records[1].sequence.length,
    charactersRemoved: prepared.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      alignmentText: makeTextStream(alignmentText, "text/plain"),
      fasta: makeTextStream(fasta, "text/x-fasta"),
      clustal: makeTextStream(clustal, "text/plain"),
      table: makeTableStream(pairwiseAlignmentTableColumns, prepared.alignment.columns, `pairwise-alignment-${alphabet}`),
      ...(outputFormat === "svg-color" ? { coloredSvg: makeTextStream(svg, "image/svg+xml") } : {})
    },
    visual: outputFormat === "svg-color" ? { svg } : undefined
  });
}

export function runPairwiseAlignDnaRna(input, options = {}, context = {}) {
  return runPairwiseAlignment(input, options, "dna-rna", context);
}

export function runPairwiseAlignProtein(input, options = {}, context = {}) {
  return runPairwiseAlignment(input, options, "protein", context);
}

export async function runPairwiseAlignCodingDna(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.03 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const prepared = await preparePairwiseCodonAlignment(input, options, context);
  if (!prepared.alignment) {
    return makeEmptyResult(prepared.warnings);
  }

  context.reportProgress?.({ phase: "building-output", progress: 0.9 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeCodonOutputFormat(options.outputFormat);
  const report = makePairwiseCodonAlignmentReport(prepared.records, prepared.alignment);
  const alignmentText = makePairwiseCodonAlignmentText(prepared.records, prepared.alignment, options.lineWidth);
  const codonFasta = makeAlignedCodonFasta(prepared.records, prepared.alignment, options.lineWidth ? Number.parseInt(options.lineWidth, 10) * 3 : 60);
  const proteinFasta = makeAlignedProteinFromCodonsFasta(prepared.records, prepared.alignment, options.lineWidth);
  const tsv = makeCodonAlignmentTsv(prepared.alignment);
  const svg = makeColoredCodonAlignmentSvg(prepared.records, prepared.alignment, options.lineWidth);
  const outputs = {
    report,
    "alignment-text": alignmentText,
    "codon-fasta": codonFasta,
    "protein-fasta": proteinFasta,
    tsv,
    "svg-color": svg
  };
  const extensions = {
    report: "txt",
    "alignment-text": "txt",
    "codon-fasta": "fasta",
    "protein-fasta": "fasta",
    tsv: "tsv",
    "svg-color": "svg"
  };
  const mimeTypes = {
    report: "text/plain;charset=utf-8",
    "alignment-text": "text/plain;charset=utf-8",
    "codon-fasta": "text/plain;charset=utf-8",
    "protein-fasta": "text/plain;charset=utf-8",
    tsv: "text/tab-separated-values;charset=utf-8",
    "svg-color": "image/svg+xml;charset=utf-8"
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: `coding-dna-pairwise-alignment.${extensions[outputFormat]}`,
      mimeType: mimeTypes[outputFormat]
    },
    warnings: prepared.warnings,
    recordsProcessed: 2,
    basesProcessed: prepared.records[0].sequence.length + prepared.records[1].sequence.length,
    charactersRemoved: prepared.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      alignmentText: makeTextStream(alignmentText, "text/plain"),
      codonFasta: makeTextStream(codonFasta, "text/x-fasta"),
      proteinFasta: makeTextStream(proteinFasta, "text/x-fasta"),
      table: makeTableStream(codonAlignmentTableColumns, prepared.alignment.codonColumns, "pairwise-coding-dna-alignment"),
      ...(outputFormat === "svg-color" ? { coloredSvg: makeTextStream(svg, "image/svg+xml") } : {})
    },
    visual: outputFormat === "svg-color" ? { svg } : undefined
  });
}
