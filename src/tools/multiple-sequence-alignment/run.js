import { multipleAlignedSequenceModel } from "../../core/aligned-sequence-adapters.js";
import { alignedSequenceViewerStream } from "../aligned-sequence-viewer/run.js";
import { normalizeMultipleAlignmentOptions, MSA_STREAM_FORMATS } from "../../core/multiple-alignment-options.js";
import { clustalIdentifierNotes } from "../../core/alignment-identifiers.js";
import { makeAlignmentTreeViewerResult } from "../../core/alignment-tree-viewer.js";
import {
  alignMultipleCodingDna, alignMultipleSequences, buildNeighborJoiningTree,
  makeIdentityHeatmapSvg, makeIdentityMatrixTable,
  makeMultipleCodingDnaProteinFasta, makeMultipleAlignmentClustal,
  makeMultipleAlignmentDistanceRows, makeMultipleAlignmentFasta,
  makeMultipleAlignmentReport, makeMultipleAlignmentSvg,
  makeMultipleAlignmentTreeSvg, makeMultipleAlignmentTreeReport,
  makeMultipleAlignmentIdentityMatrix, multipleCodingDnaAlignmentTableColumns,
  multipleAlignmentDistanceTableColumns, multipleAlignmentIdentityTableColumns,
  multipleAlignmentTableColumns
} from "../../core/multiple-sequence-alignment.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { calculateSequenceLogo } from "../../core/sequence-logo.js";
import { formatFastaRecord } from "../../core/fasta.js";
import { DEFAULT_ALIGNMENT_SVG_CELL_LIMIT } from "../../core/alignment-svg.js";
import { exportDelimitedTable } from "../../core/table.js";

const identityStreams = new Set(['identityMatrix', 'identityMatrixTable', 'identityPairs', 'identityHeatmap']);
const extensions = { report: 'txt', fasta: 'fasta', proteinFasta: 'faa', clustal: 'aln', table: 'tsv', alignmentDocument: 'sms3.json', coloredSvg: 'svg', sequenceLogo: 'logo-summary.txt', treeDocument: 'json', newick: 'nwk', tree: 'nwk.txt', treeSvg: 'tree.svg', distanceTable: 'distances.tsv', identityMatrix: 'identity-matrix.tsv', identityPairs: 'identity-pairs.tsv', identityHeatmap: 'identity-heatmap.svg' };

async function runMultipleAlignment(input, rawOptions = {}, alphabet, context = {}) {
  context.reportProgress?.({ phase: "parsing-input", progress: 0.05 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const options = normalizeMultipleAlignmentOptions(rawOptions, alphabet);
  const selected = Object.keys(MSA_STREAM_FORMATS).find(id => MSA_STREAM_FORMATS[id] === options.outputFormat);
  const requested = new Set([selected, ...options.requestedAlignmentOutputs]);
  if (selected === 'identityMatrix') requested.add('identityMatrixTable');
  const needsAlignment = [...requested].some(id => !identityStreams.has(id));
  const needsIdentity = [...requested].some(id => identityStreams.has(id));
  options.materializeAlignmentRows = requested.has('table');
  const prepared = needsAlignment
    ? alphabet === 'coding-dna'
      ? await alignMultipleCodingDna(input, options, context)
      : await alignMultipleSequences(input, { ...options, alphabet }, context)
    : null;
  const identityResult = needsIdentity ? await makeMultipleAlignmentIdentityMatrix(input, options, alphabet, context) : null;
  const source = prepared ?? identityResult;
  const warnings = [...new Set([...(prepared?.warnings ?? []), ...(identityResult?.warnings ?? [])])];
  const { requestedAlignmentOutputs, materializeAlignmentRows, ...optionsUsed } = options;
  const notes = [...new Set([...(prepared?.notes ?? []), ...(identityResult?.notes ?? [])])];
  const resultBase = {
    optionsUsed, warnings, notes,
    processedUnitLabel: alphabet === 'protein' ? (source.records.some(record => record.sequence.includes('*')) ? 'character' : 'residue') : 'base',
    recordsProcessed: source.records.length,
    basesProcessed: source.totalSymbols, charactersRemoved: source.charactersRemoved
  };
  if ((needsAlignment && !prepared.alignment) || (needsIdentity && !identityResult.identity)) return makeToolResult({ ...resultBase, output: '' });

  const streams = {};
  let treeData;
  let matrix;
  let distanceRows;
  let treeViewer;
  const getTree = () => treeData ??= { newick: buildNeighborJoiningTree(prepared.alignment, { warnings }) };
  const getDistances = () => distanceRows ??= makeMultipleAlignmentDistanceRows(prepared.alignment);
  const getMatrix = () => matrix ??= makeIdentityMatrixTable(identityResult.identity);
  const table = (columns, rows, suffix = '') => makeTableStream(columns, rows, `multiple-alignment-${alphabet}${suffix}`);
  const materializers = {
    report: () => makeTextStream(makeMultipleAlignmentReport(prepared)),
    fasta: () => makeTextStream(makeMultipleAlignmentFasta(prepared.alignment, options.lineWidth), 'text/x-fasta', { format: 'fasta', alphabet }),
    proteinFasta: () => makeTextStream(makeMultipleCodingDnaProteinFasta(prepared.alignment, options.lineWidth), 'text/x-fasta', { format: 'fasta', alphabet: 'protein' }),
    clustal: () => makeTextStream(makeMultipleAlignmentClustal(prepared.alignment, options.lineWidth), 'text/plain', { format: 'clustal', alphabet }),
    table: () => table(alphabet === 'coding-dna' ? multipleCodingDnaAlignmentTableColumns : multipleAlignmentTableColumns, prepared.alignment.rows),
    alignmentDocument: () => alignedSequenceViewerStream(multipleAlignedSequenceModel(prepared.alignment)),
    coloredSvg: () => makeTextStream(makeMultipleAlignmentSvg(prepared.alignment, { alphabet, lineWidth: options.lineWidth, maxCells: DEFAULT_ALIGNMENT_SVG_CELL_LIMIT, showConsensusLine: options.showConsensusLine }), 'image/svg+xml'),
    sequenceLogo: async () => {
      const calculation = await calculateSequenceLogo(prepared.alignment.titles.map((title, index) => formatFastaRecord(title, prepared.alignment.aligned[index], 80)).join('\n'), {
        inputFormat: 'alignment', alphabet: alphabet === 'protein' ? 'protein' : alphabet === 'coding-dna' ? 'dna' : 'auto',
        ambiguousPolicy: 'exclude', sequenceWeighting: 'none', correction: 'none', bootstrapReplicates: 0,
        title: alphabet === 'coding-dna' ? 'Aligned coding-DNA sequence logo' : 'Multiple-alignment sequence logo'
      }, context);
      warnings.push(...calculation.warnings.filter(warning => !warnings.includes(warning)));
      return { kind: 'figure', figureType: 'sequence-logo', label: 'Sequence logo', figure: calculation.logo };
    },
    treeDocument: async () => {
      treeViewer = await makeAlignmentTreeViewerResult(prepared, `Multiple Align ${alphabet}`, context, getTree().newick);
      warnings.push(...treeViewer.warnings.filter(warning => !warnings.includes(warning)));
      return treeViewer.streams.treeDocument;
    },
    newick: () => makeTextStream(getTree().newick, 'text/x-newick'),
    tree: () => makeTextStream(makeMultipleAlignmentTreeReport(prepared.alignment, { ...getTree(), distanceRows: getDistances() })),
    treeSvg: () => makeTextStream(makeMultipleAlignmentTreeSvg(prepared.alignment, getTree().newick), 'image/svg+xml'),
    distanceTable: () => table(multipleAlignmentDistanceTableColumns, getDistances(), '-distances'),
    identityMatrix: () => makeTextStream(exportDelimitedTable(getMatrix().columns, getMatrix().rows), 'text/tab-separated-values'),
    identityMatrixTable: () => table(getMatrix().columns, getMatrix().rows, '-identity-matrix'),
    identityPairs: () => table(multipleAlignmentIdentityTableColumns, identityResult.identity.rows, '-identity'),
    identityHeatmap: () => {
      const heatmap = makeIdentityHeatmapSvg(identityResult.identity);
      return { ...makeTextStream(heatmap.svg, 'image/svg+xml'), ...heatmap };
    }
  };
  for (const id of requested) {
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    streams[id] = await materializers[id]();
  }
  const primary = streams[selected];
  const output = primary.kind === 'table' ? exportDelimitedTable(primary.columns.map(column => ({ ...column, label: column.id })), primary.rows)
    : selected === 'treeDocument' ? primary.items[0].text
    : selected === 'sequenceLogo' ? `Sequence logo\nAlphabet: ${primary.figure.alphabet}\nColumns: ${primary.figure.alignmentLength}\nSequences: ${primary.figure.sequenceCount}`
    : primary.text;
  const mediaType = primary.kind === 'table' ? 'text/tab-separated-values' : selected === 'treeDocument' ? primary.items[0].mediaType : primary.mediaType ?? 'text/plain';
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    ...resultBase, output, streams, sequenceSearch: primary.sequenceSearch,
    notes: [...notes, ...(requested.has('clustal') ? clustalIdentifierNotes(prepared.alignment.titles) : [])],
    download: { filename: selected === 'treeDocument' ? 'alignment-tree.json' : selected.startsWith('identity') ? `${alphabet}-${extensions[selected]}` : `${alphabet}-multiple-alignment.${extensions[selected]}`, mimeType: `${mediaType};charset=utf-8` },
    visual: selected === 'alignmentDocument' ? {alignedSequence:JSON.parse(output).source} : selected === 'treeDocument' ? treeViewer.visual
      : selected === 'sequenceLogo' ? { sequenceLogo: primary.figure }
      : mediaType === 'image/svg+xml' ? { svg: output } : undefined
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
