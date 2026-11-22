import { getGeneticCode } from './genetic-code.js';
import { pairwiseAlignmentDefaultLimits } from './pairwise-alignment.js';
import { effectiveToolLimit } from './tool-limit-policy.js';

export const MAX_MSA_SEQUENCES = 1000;
export const MULTIPLE_ALIGNMENT_ENGINES = Object.freeze({ muscle: 'muscle', sms3: 'sms3-progressive' });
export const MSA_DEFAULTS = Object.freeze({
  alignmentEngine: MULTIPLE_ALIGNMENT_ENGINES.muscle,
  gapOpen: 10, gapExtend: 1, matchScore: 5, mismatchScore: -4, similarScore: 1,
  geneticCode: '1', lineWidth: 60, showConsensusLine: true, outputFormat: 'svg-color',
  maxAlignmentRecords: MAX_MSA_SEQUENCES, maxTotalSymbols: 250000,
  maxAlignmentCells: pairwiseAlignmentDefaultLimits.maxAlignmentCells
});
export const multipleAlignmentDefaultLimits = Object.freeze({ maxTotalSymbols: MSA_DEFAULTS.maxTotalSymbols });
export const MSA_STREAM_FORMATS = Object.freeze({ report: 'report', fasta: 'aligned-fasta', proteinFasta: 'translated-protein-fasta', clustal: 'clustal', table: 'tsv', alignmentDocument: 'aligned-sequence-viewer', coloredSvg: 'svg-color', sequenceLogo: 'sequence-logo', treeDocument: 'tree-viewer', newick: 'newick', tree: 'nj-tree', treeSvg: 'nj-tree-svg', distanceTable: 'distance-table', identityMatrix: 'identity-matrix', identityMatrixTable: 'identity-matrix', identityPairs: 'identity-pairs', identityHeatmap: 'identity-heatmap' });
export const MSA_OUTPUT_FORMATS = Object.freeze(['report', 'aligned-fasta', 'translated-protein-fasta', 'clustal', 'tsv', 'svg-color', 'aligned-sequence-viewer', 'sequence-logo', 'tree-viewer', 'nj-tree', 'nj-tree-svg', 'identity-matrix', 'identity-heatmap', 'identity-pairs', 'distance-table', 'newick']);

function finiteNumber(value, fallback) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeMultipleAlignmentOptions(options = {}, alphabet = options.alphabet) {
  const result = { ...MSA_DEFAULTS, alphabet: ['protein', 'coding-dna'].includes(alphabet) ? alphabet : 'dna-rna' };
  result.alignmentEngine = options.alignmentEngine === MULTIPLE_ALIGNMENT_ENGINES.sms3 ? MULTIPLE_ALIGNMENT_ENGINES.sms3 : MSA_DEFAULTS.alignmentEngine;
  for (const key of ['gapOpen', 'gapExtend', 'matchScore', 'mismatchScore', 'similarScore']) {
    result[key] = finiteNumber(options[key], MSA_DEFAULTS[key]);
    if (key.startsWith('gap')) result[key] = Math.abs(result[key]);
  }
  result.geneticCode = getGeneticCode(options.geneticCode ?? MSA_DEFAULTS.geneticCode).id;
  result.lineWidth = Math.max(20, Math.min(120, Math.trunc(finiteNumber(options.lineWidth, MSA_DEFAULTS.lineWidth))));
  result.showConsensusLine = options.showConsensusLine !== false;
  if (MSA_OUTPUT_FORMATS.includes(options.outputFormat) && (options.outputFormat !== 'translated-protein-fasta' || result.alphabet === 'coding-dna')) result.outputFormat = options.outputFormat;
  if (['identity-matrix', 'identity-heatmap', 'identity-pairs'].includes(result.outputFormat)) result.alignmentEngine = MULTIPLE_ALIGNMENT_ENGINES.sms3;
  if (Array.isArray(options.disabledToolLimitIds)) result.disabledToolLimitIds = options.disabledToolLimitIds.filter(id => ['maxAlignmentRecords', 'maxTotalSymbols', 'maxAlignmentCells'].includes(id));
  for (const key of ['maxAlignmentRecords', 'maxTotalSymbols', 'maxAlignmentCells']) result[key] = effectiveToolLimit(result, key, MSA_DEFAULTS[key]);
  result.requestedAlignmentOutputs = Array.isArray(options.requestedAlignmentOutputs) ? [...new Set(options.requestedAlignmentOutputs.filter(id => Object.hasOwn(MSA_STREAM_FORMATS, id) && (id !== 'proteinFasta' || result.alphabet === 'coding-dna')))] : [];
  result.materializeAlignmentRows = options.materializeAlignmentRows !== false;
  return result;
}
