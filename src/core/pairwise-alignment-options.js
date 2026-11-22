import { getGeneticCode } from './genetic-code.js';
import { effectiveToolLimit } from './tool-limit-policy.js';

export const pairwiseAlignmentDefaultLimits = Object.freeze({ maxAlignmentCells: 2_000_000 });
export const PAIRWISE_ALIGNMENT_ENGINES = Object.freeze({ seqAlign: 'seq-align', sms3: 'sms3-affine' });
export const PAIRWISE_DEFAULTS = Object.freeze({
  mode: 'global', alignmentEngine: PAIRWISE_ALIGNMENT_ENGINES.seqAlign,
  matchScore: 5, mismatchScore: -4, similarScore: 1, gapOpen: 10, gapExtend: 1,
  geneticCode: '1', outputFormat: 'svg-color', secondSequenceOrientation: 'as-provided',
  ...pairwiseAlignmentDefaultLimits
});
export const PAIRWISE_DNA_DEFAULTS = Object.freeze({ ...PAIRWISE_DEFAULTS, gapOpen: 16, gapExtend: 4 });
export const PAIRWISE_OUTPUTS = Object.freeze(['report','alignment-text','aligned-fasta','clustal','tsv','svg-color','aligned-sequence-viewer']);
export const PAIRWISE_CODON_OUTPUTS = Object.freeze(['report','alignment-text','codon-fasta','protein-fasta','tsv','svg-color','aligned-sequence-viewer']);
export function pairwiseNumber(value, fallback) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
export function normalizePairwiseToolOptions(options = {}, alphabet = 'coding-dna') {
  const defaults = alphabet === 'dna-rna' ? PAIRWISE_DNA_DEFAULTS : PAIRWISE_DEFAULTS;
  const result = { ...defaults };
  result.mode = options.mode === 'local' ? 'local' : defaults.mode;
  result.alignmentEngine = options.alignmentEngine === PAIRWISE_ALIGNMENT_ENGINES.sms3 ? options.alignmentEngine : defaults.alignmentEngine;
  for (const key of ['matchScore','mismatchScore','similarScore','gapOpen','gapExtend']) {
    result[key] = pairwiseNumber(options[key], defaults[key]);
    if (key.startsWith('gap')) result[key] = Math.abs(result[key]);
  }
  result.geneticCode = getGeneticCode(options.geneticCode ?? defaults.geneticCode).id;
  result.scoringMatrix = alphabet === 'dna-rna' ? 'identity' : 'blosum62';
  result.secondSequenceOrientation = alphabet === 'dna-rna' && options.secondSequenceOrientation === 'best' ? 'best' : defaults.secondSequenceOrientation;
  const formats = alphabet === 'coding-dna' ? PAIRWISE_CODON_OUTPUTS : PAIRWISE_OUTPUTS;
  result.outputFormat = formats.includes(options.outputFormat) ? options.outputFormat : defaults.outputFormat;
  result.disabledToolLimitIds = Array.isArray(options.disabledToolLimitIds) ? options.disabledToolLimitIds.filter(id => id === 'maxAlignmentCells') : [];
  result.maxAlignmentCells = effectiveToolLimit(result, 'maxAlignmentCells', defaults.maxAlignmentCells);
  if (alphabet !== 'dna-rna') {
    for (const key of ['matchScore','mismatchScore','similarScore','secondSequenceOrientation']) delete result[key];
  }
  if (alphabet !== 'coding-dna') delete result.geneticCode;
  const streams = alphabet === 'coding-dna' ? ['report','alignmentText','codonFasta','proteinFasta','table','coloredSvg','alignmentDocument'] : ['report','alignmentText','fasta','clustal','table','coloredSvg','alignmentDocument'];
  result.requestedPairwiseOutputs = Array.isArray(options.requestedPairwiseOutputs) ? [...new Set(options.requestedPairwiseOutputs.filter(id=>streams.includes(id)))] : [];
  return result;
}
