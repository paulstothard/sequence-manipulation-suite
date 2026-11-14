import { effectiveToolLimit, normalizeDisabledToolLimitIds } from './tool-limit-policy.js';

export const MAX_ASSEMBLY_RECORDS = 1000;
export const ASSEMBLY_DEFAULTS = Object.freeze({
  minOverlap:20, maxMismatchPercent:5, tryReverseComplement:true,
  lineWidth:60, outputFormat:'fasta', maxAssemblyRecords:MAX_ASSEMBLY_RECORDS
});
export const ASSEMBLY_OUTPUT_FORMATS = Object.freeze(['report','fasta','text-map','tsv','sequence-records']);

export function normalizeAssemblyOptions(options = {}) {
  const result={...ASSEMBLY_DEFAULTS};
  for(const [key,min,max,integer] of [['minOverlap',6,10000,true],['maxMismatchPercent',0,40,false],['lineWidth',10,200,true]]) {
    const raw=options[key];
    const value=raw==null || typeof raw==='boolean' || String(raw).trim()==='' ? NaN : Number(raw);
    result[key]=Number.isFinite(value)?Math.max(min,Math.min(max,integer?Math.trunc(value):value)):ASSEMBLY_DEFAULTS[key];
  }
  result.tryReverseComplement=options.tryReverseComplement!==false;
  if(ASSEMBLY_OUTPUT_FORMATS.includes(options.outputFormat))result.outputFormat=options.outputFormat;
  if(result.outputFormat==='text-map')result.lineWidth=Math.max(40,result.lineWidth);
  const disabled=normalizeDisabledToolLimitIds('lightweight-sequence-assembly',options.disabledToolLimitIds);
  if(disabled.length)result.disabledToolLimitIds=disabled;
  result.maxAssemblyRecords=effectiveToolLimit(result,'maxAssemblyRecords',MAX_ASSEMBLY_RECORDS);
  if(Array.isArray(options.requestedAssemblyOutputs))result.requestedAssemblyOutputs=[...new Set(options.requestedAssemblyOutputs.filter(id=>['report','fasta','textMap','table','sequenceRecords'].includes(id)))];
  return result;
}

// Fixed allocation and work budgets also apply when the optional read cap is disabled.
export const ASSEMBLY_LIMITS = Object.freeze({inputCharacters:2_000_000,inputRecords:10_000,titleCharacters:500,readCharacters:100_000,readBases:20_000,totalBases:500_000,readTrials:2_000_000,comparisons:50_000_000,mapCells:2_000_000,outputCharacters:8_000_000});
