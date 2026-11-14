import { effectiveToolLimit, normalizeDisabledToolLimitIds } from './tool-limit-policy.js';
import { PAIRWISE_ALIGNMENT_ENGINES } from './pairwise-alignment.js';

const COMMON = Object.freeze({ separator:'---', minSharedKmers:1, topCandidatesPerProtein:5, maxPairwiseAlignments:500, maxProteinsPerProteome:500, minIdentityPercent:0, minCoveragePercent:0, nearTiePercent:5, verificationEngine:PAIRWISE_ALIGNMENT_ENGINES.seqAlign, alignmentMode:'local', matchScore:5, similarScore:1, mismatchScore:-4, gapOpen:10, gapExtend:1, outputFormat:'reciprocal-tsv' });
export const RECIPROCAL_DEFAULTS = Object.freeze({
 'dna-rna':Object.freeze({...COMMON,kmerSize:11,maxSequenceLength:10000}),
 protein:Object.freeze({...COMMON,kmerSize:4,maxSequenceLength:1500})
});
const COMMON_RULES = { minSharedKmers:[0,10000,true],topCandidatesPerProtein:[1,50,true],maxPairwiseAlignments:[1,10000,true],maxProteinsPerProteome:[1,5000,true],maxSequenceLength:[10,20000,true],minIdentityPercent:[0,100],minCoveragePercent:[0,100],nearTiePercent:[0,100],matchScore:[-100,100],similarScore:[-100,100],mismatchScore:[-100,100],gapOpen:[0.1,100],gapExtend:[0.01,50] };
export const RECIPROCAL_NUMBER_RULES = Object.freeze({
 'dna-rna':Object.freeze({...COMMON_RULES,kmerSize:[4,100,true]}),
 protein:Object.freeze({...COMMON_RULES,kmerSize:[2,8,true]})
});
export const RECIPROCAL_OUTPUT_FORMATS = Object.freeze(['report','reciprocal-tsv','candidates-tsv','unmatched-tsv','heatmap-svg']);

// Missing/blank/invalid values use the shared defaults. Finite values retain
// the existing clamping contract; explicit zero reporting thresholds survive.
export function normalizeSequenceSetReciprocalBestMatchOptions(options = {}, alphabet = 'protein') {
 const kind=alphabet==='dna-rna'?'dna-rna':'protein', defaults=RECIPROCAL_DEFAULTS[kind];
 const result={alphabet:kind,...defaults};
 for(const [key,[min,max,integer]] of Object.entries(RECIPROCAL_NUMBER_RULES[kind])) {
  const raw=options?.[key], number=raw==null||String(raw).trim()===''||typeof raw==='boolean'?NaN:Number(raw);
  const value=Number.isFinite(number)?number:defaults[key];
  result[key]=Math.max(min,Math.min(max,integer?Math.trunc(value):value));
 }
 for(const [key,choices] of Object.entries({verificationEngine:Object.values(PAIRWISE_ALIGNMENT_ENGINES),alignmentMode:['local','global'],outputFormat:RECIPROCAL_OUTPUT_FORMATS})) {
  if(choices.includes(options?.[key]))result[key]=options[key];
 }
 result.separator=String(options?.separator??defaults.separator).trim()||defaults.separator;
 const disabled=normalizeDisabledToolLimitIds(kind==='protein'?'proteome-reciprocal-best-match':'dna-rna-set-reciprocal-best-match',options?.disabledToolLimitIds);
 if(disabled.length)result.disabledToolLimitIds=disabled;
 for(const key of ['maxPairwiseAlignments','maxProteinsPerProteome','maxSequenceLength'])result[key]=effectiveToolLimit(result,key,result[key]);
 return result;
}

// Fixed allocation/work budgets remain in force when optional input ceilings are disabled.
export const RECIPROCAL_RESOURCE_LIMITS = Object.freeze({ inputCharacters:4_000_000, inputRecords:10_000, titleCharacters:500, recordPairs:1_000_000, kmerSymbols:20_000_000, screeningVisits:10_000_000, candidatePairs:250_000, verifiedPairs:10_000, pairCells:2_000_000, totalCells:50_000_000, outputCharacters:16_000_000 });
