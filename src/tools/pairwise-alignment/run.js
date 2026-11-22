import { pairwiseAlignedSequenceModel } from "../../core/aligned-sequence-adapters.js";
import { alignedSequenceViewerStream } from "../aligned-sequence-viewer/run.js";
import { DEFAULT_ALIGNMENT_SVG_CELL_LIMIT } from "../../core/alignment-svg.js";
import { normalizePairwiseToolOptions } from "../../core/pairwise-alignment-options.js";
import { clustalIdentifierNotes } from "../../core/alignment-identifiers.js";
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
  pairwiseDnaAlignmentTableColumns,
  preparePairwiseCodonAlignment,
  preparePairwiseAlignment
} from "../../core/pairwise-alignment.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const standardFormats = { report:'report', alignmentText:'alignment-text', fasta:'aligned-fasta', clustal:'clustal', table:'tsv', coloredSvg:'svg-color', alignmentDocument:'aligned-sequence-viewer' };
const codingFormats = { report:'report', alignmentText:'alignment-text', codonFasta:'codon-fasta', proteinFasta:'protein-fasta', table:'tsv', coloredSvg:'svg-color', alignmentDocument:'aligned-sequence-viewer' };
const extensions = { report:'txt', alignmentText:'txt', fasta:'fasta', clustal:'aln', table:'tsv', coloredSvg:'svg', alignmentDocument:'sms3.json', codonFasta:'fasta', proteinFasta:'fasta' };

async function runPairwiseAlignment(input, rawOptions = {}, alphabet, context = {}) {
  const options = normalizePairwiseToolOptions(rawOptions, alphabet);
  const { requestedPairwiseOutputs, ...optionsUsed } = options;
  const coding = alphabet === 'coding-dna';
  context.reportProgress?.({ phase:'parsing-input', progress:0.03 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const prepared = coding
    ? await preparePairwiseCodonAlignment(input, options, context)
    : await preparePairwiseAlignment(input, options, alphabet, context);
  if (!prepared.alignment) return makeToolResult({ output:'', optionsUsed, warnings:prepared.warnings, notes:prepared.notes });
  const { records, alignment } = prepared;
  const formats = coding ? codingFormats : standardFormats;
  const selected = Object.keys(formats).find(id => formats[id] === options.outputFormat);
  const requested = new Set([selected, ...requestedPairwiseOutputs]);
  const colored = () => {
    const cells = alignment.alignedLength * (coding ? 3 : 1) * records.length;
    if (cells > DEFAULT_ALIGNMENT_SVG_CELL_LIMIT) throw new Error(`Colored alignment would require ${cells.toLocaleString()} displayed cells, exceeding the fixed ${DEFAULT_ALIGNMENT_SVG_CELL_LIMIT.toLocaleString()}-cell limit. Select a report, text, FASTA or table output for the complete alignment.`);
    return makeTextStream(coding ? makeColoredCodonAlignmentSvg(records, alignment) : makeColoredAlignmentSvg(records, alignment), 'image/svg+xml');
  };
  const builders = coding ? {
    report: () => makeTextStream(makePairwiseCodonAlignmentReport(records, alignment)),
    alignmentText: () => makeTextStream(makePairwiseCodonAlignmentText(records, alignment), 'text/plain', {format:'pairwise',alphabet:'dna-rna'}),
    codonFasta: () => makeTextStream(makeAlignedCodonFasta(records, alignment), 'text/x-fasta', {format:'fasta',alphabet:'dna-rna'}),
    proteinFasta: () => makeTextStream(makeAlignedProteinFromCodonsFasta(records, alignment), 'text/x-fasta', {format:'fasta',alphabet:'protein'}),
    table: () => makeTableStream(codonAlignmentTableColumns, alignment.codonColumns, 'pairwise-coding-dna-alignment'),
    alignmentDocument: () => alignedSequenceViewerStream(pairwiseAlignedSequenceModel(records, alignment, alphabet)),
    coloredSvg: colored
  } : {
    report: () => makeTextStream(makePairwiseAlignmentReport(records, alignment, options)),
    alignmentText: () => makeTextStream(makePairwiseAlignmentText(records, alignment), 'text/plain', {format:'pairwise',alphabet}),
    fasta: () => makeTextStream(makeAlignedFasta(records, alignment), 'text/x-fasta', {format:'fasta',alphabet}),
    clustal: () => makeTextStream(makeClustal(records, alignment), 'text/plain', {format:'clustal',alphabet}),
    table: () => makeTableStream(alphabet === 'dna-rna' ? pairwiseDnaAlignmentTableColumns : pairwiseAlignmentTableColumns, alignment.columns, `pairwise-alignment-${alphabet}`),
    alignmentDocument: () => alignedSequenceViewerStream(pairwiseAlignedSequenceModel(records, alignment, alphabet)),
    coloredSvg: colored
  };
  const streams = {};
  context.reportProgress?.({ phase:'building-output', progress:0.9 });
  for (const id of requested) {
    context.throwIfCancelled?.();
    await context.yieldIfNeeded?.();
    streams[id] = builders[id]();
  }
  const primary = streams[selected];
  const output = selected === 'table' ? (coding ? makeCodonAlignmentTsv(alignment) : makeAlignmentTsv(alignment)) : primary.text;
  const mediaType = selected === 'table' ? 'text/tab-separated-values' : primary.mediaType;
  context.reportProgress?.({ phase:'finished', progress:1 });
  return makeToolResult({
    output, optionsUsed, streams, sequenceSearch:primary.sequenceSearch,
    notes:[...prepared.notes, ...(alignment.alignedLength ? [] : ['No positive-scoring local alignment found.']), ...(requested.has('clustal') ? clustalIdentifierNotes(records.map(record=>record.title)) : [])],
    download:{filename:`${coding ? 'coding-dna' : alphabet}-pairwise-alignment.${extensions[selected]}`,mimeType:`${mediaType};charset=utf-8`},
    warnings:prepared.warnings, recordsProcessed:2,
    processedUnitLabel:alphabet === 'protein' ? (records.some(record => record.sequence.includes('*')) ? 'character' : 'residue') : 'base',
    basesProcessed:records[0].sequence.length + records[1].sequence.length,
    charactersRemoved:prepared.charactersRemoved,
    visual:selected === 'alignmentDocument' ? {alignedSequence:JSON.parse(output).source} : selected === 'coloredSvg' ? {svg:output} : undefined
  });
}

export function runPairwiseAlignDnaRna(input, options = {}, context = {}) {
  return runPairwiseAlignment(input, options, 'dna-rna', context);
}
export function runPairwiseAlignProtein(input, options = {}, context = {}) {
  return runPairwiseAlignment(input, options, 'protein', context);
}
export function runPairwiseAlignCodingDna(input, options = {}, context = {}) {
  return runPairwiseAlignment(input, options, 'coding-dna', context);
}
