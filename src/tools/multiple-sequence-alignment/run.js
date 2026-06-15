import {
  alignMultipleCodingDna,
  alignMultipleSequences,
  makeIdentityHeatmapSvg,
  makeIdentityMatrixTsv,
  makeIdentityPairsTsv,
  makeMultipleCodingDnaProteinFasta,
  makeMultipleAlignmentClustal,
  makeMultipleAlignmentDistanceRows,
  makeMultipleAlignmentFasta,
  makeMultipleAlignmentReport,
  makeMultipleAlignmentSvg,
  makeMultipleAlignmentTreeSvg,
  makeMultipleAlignmentTreeReport,
  makeMultipleAlignmentTsv,
  makeMultipleAlignmentIdentityMatrix,
  multipleCodingDnaAlignmentTableColumns,
  multipleAlignmentDistanceTableColumns,
  multipleAlignmentIdentityTableColumns,
  multipleAlignmentTableColumns
} from "../../core/multiple-sequence-alignment.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const OUTPUT_FORMATS = new Set([
  "report",
  "aligned-fasta",
  "translated-protein-fasta",
  "clustal",
  "tsv",
  "svg-color",
  "nj-tree",
  "nj-tree-svg",
  "identity-matrix",
  "identity-heatmap"
]);

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.has(value) ? value : "svg-color";
}

async function runMultipleAlignment(input, options = {}, alphabet, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const outputFormat = normalizeOutputFormat(options.outputFormat);
  if (outputFormat === "identity-matrix" || outputFormat === "identity-heatmap") {
    const identityResult = await makeMultipleAlignmentIdentityMatrix(input, options, alphabet, context);
    if (!identityResult.identity) {
      return makeToolResult({
        output: "",
        warnings: identityResult.warnings,
        recordsProcessed: identityResult.records.length,
        basesProcessed: identityResult.totalSymbols,
        charactersRemoved: identityResult.charactersRemoved
      });
    }
    const matrixTsv = makeIdentityMatrixTsv(identityResult.identity);
    const pairsTsv = makeIdentityPairsTsv(identityResult.identity);
    const heatmap = outputFormat === "identity-heatmap" ? makeIdentityHeatmapSvg(identityResult.identity) : null;
    const output = outputFormat === "identity-heatmap" ? heatmap.svg : matrixTsv;
    context.reportProgress?.({ phase: "finished", progress: 1 });
    return makeToolResult({
      output,
      download: {
        filename: `${alphabet === "protein" ? "protein" : alphabet === "coding-dna" ? "coding-dna" : "dna-rna"}-identity-${outputFormat === "identity-heatmap" ? "heatmap.svg" : "matrix.tsv"}`,
        mimeType: outputFormat === "identity-heatmap" ? "image/svg+xml;charset=utf-8" : "text/tab-separated-values;charset=utf-8"
      },
      warnings: identityResult.warnings,
      recordsProcessed: identityResult.records.length,
      basesProcessed: identityResult.totalSymbols,
      charactersRemoved: identityResult.charactersRemoved,
      streams: {
        identityMatrix: makeTextStream(matrixTsv, "text/tab-separated-values"),
        identityPairs: makeTableStream(multipleAlignmentIdentityTableColumns, identityResult.identity.rows, `multiple-alignment-${alphabet}-identity`),
        ...(outputFormat === "identity-heatmap" ? {
          identityHeatmap: {
            kind: "text",
            mediaType: "image/svg+xml",
            text: heatmap.svg,
            svg: heatmap.svg,
            spec: heatmap.spec,
            observablePlotConfig: heatmap.observablePlotConfig
          }
        } : {})
      },
      visual: outputFormat === "identity-heatmap" ? { svg: heatmap.svg } : undefined
    });
  }

  const prepared = alphabet === "coding-dna"
    ? await alignMultipleCodingDna(input, options, context)
    : await alignMultipleSequences(input, { ...options, alphabet }, context);
  if (!prepared.alignment) {
    return makeToolResult({
      output: "",
      warnings: prepared.warnings,
      recordsProcessed: prepared.records.length,
      basesProcessed: prepared.totalSymbols,
      charactersRemoved: prepared.charactersRemoved
    });
  }

  const report = makeMultipleAlignmentReport(prepared);
  const fasta = makeMultipleAlignmentFasta(prepared.alignment, options.lineWidth);
  const translatedProteinFasta = alphabet === "coding-dna" ? makeMultipleCodingDnaProteinFasta(prepared.alignment, options.lineWidth) : "";
  const clustal = makeMultipleAlignmentClustal(prepared.alignment, options.lineWidth);
  const tsv = makeMultipleAlignmentTsv(prepared.alignment);
  const svg = makeMultipleAlignmentSvg(prepared.alignment, { alphabet, lineWidth: options.lineWidth });
  const isTreeOutput = outputFormat === "nj-tree" || outputFormat === "nj-tree-svg";
  const treeReport = isTreeOutput ? makeMultipleAlignmentTreeReport(prepared.alignment) : "";
  const treeSvg = outputFormat === "nj-tree-svg" ? makeMultipleAlignmentTreeSvg(prepared.alignment) : "";
  const distanceRows = isTreeOutput ? makeMultipleAlignmentDistanceRows(prepared.alignment) : [];
  const outputs = {
    report,
    "aligned-fasta": fasta,
    "translated-protein-fasta": translatedProteinFasta,
    clustal,
    tsv,
    "svg-color": svg,
    "nj-tree": treeReport,
    "nj-tree-svg": treeSvg
  };
  const extensions = {
    report: "txt",
    "aligned-fasta": "fasta",
    "translated-protein-fasta": "faa",
    clustal: "aln",
    tsv: "tsv",
    "svg-color": "svg",
    "nj-tree": "nwk.txt",
    "nj-tree-svg": "tree.svg"
  };
  const mimeTypes = {
    report: "text/plain;charset=utf-8",
    "aligned-fasta": "text/plain;charset=utf-8",
    "translated-protein-fasta": "text/plain;charset=utf-8",
    clustal: "text/plain;charset=utf-8",
    tsv: "text/tab-separated-values;charset=utf-8",
    "svg-color": "image/svg+xml;charset=utf-8",
    "nj-tree": "text/plain;charset=utf-8",
    "nj-tree-svg": "image/svg+xml;charset=utf-8"
  };

  context.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output: outputs[outputFormat],
    download: {
      filename: `${alphabet === "protein" ? "protein" : alphabet === "coding-dna" ? "coding-dna" : "dna-rna"}-multiple-alignment.${extensions[outputFormat]}`,
      mimeType: mimeTypes[outputFormat]
    },
    warnings: prepared.warnings,
    recordsProcessed: prepared.records.length,
    basesProcessed: prepared.totalSymbols,
    charactersRemoved: prepared.charactersRemoved,
    streams: {
      report: makeTextStream(report, "text/plain"),
      fasta: makeTextStream(fasta, "text/x-fasta"),
      ...(alphabet === "coding-dna" ? { proteinFasta: makeTextStream(translatedProteinFasta, "text/x-fasta") } : {}),
      clustal: makeTextStream(clustal, "text/plain"),
      table: makeTableStream(
        alphabet === "coding-dna" ? multipleCodingDnaAlignmentTableColumns : multipleAlignmentTableColumns,
        prepared.alignment.rows,
        `multiple-alignment-${alphabet}`
      ),
      ...(outputFormat === "svg-color" ? { coloredSvg: makeTextStream(svg, "image/svg+xml") } : {}),
      ...(isTreeOutput ? {
        tree: makeTextStream(treeReport, "text/plain"),
        distanceTable: makeTableStream(multipleAlignmentDistanceTableColumns, distanceRows, `multiple-alignment-${alphabet}-distances`),
        ...(outputFormat === "nj-tree-svg" ? { treeSvg: makeTextStream(treeSvg, "image/svg+xml") } : {})
      } : {})
    },
    visual: outputFormat === "svg-color"
      ? { svg }
      : outputFormat === "nj-tree-svg"
        ? { svg: treeSvg }
        : undefined
  });
}

export function runMultipleAlignDnaRna(input, options = {}, context = {}) {
  return runMultipleAlignment(input, options, "dna-rna", context);
}

export function runMultipleAlignProtein(input, options = {}, context = {}) {
  return runMultipleAlignment(input, options, "protein", context);
}

export function runMultipleAlignCodingDna(input, options = {}, context = {}) {
  return runMultipleAlignment(input, options, "coding-dna", context);
}
