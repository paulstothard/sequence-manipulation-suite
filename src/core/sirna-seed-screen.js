import { complementDnaRnaSequence } from './sequence.js';
const rc = s => [...complementDnaRnaSequence(s.replaceAll('U','T'), {preserveCase:false})].reverse().join('');
export const sirnaSeedColumns = [
 ...['candidate_id','reference_id','reference_record','guide_seed_rna','reference_seed_rna','seed_model','search_status','interpretation','transcript_relation'].map(id=>({id,label:id.replaceAll('_',' '),type:'string'})),
 ...['reference_start','reference_end','details_omitted'].map(id=>({id,label:id.replaceAll('_',' '),type:'number'}))
];
// Jackson et al. 2006, doi:10.1261/rna.25706. Exact seed complementarity is
// a warning/review signal, not a calibrated probability of silencing.
export async function screenSirnaSeeds(rows, records, options, fullScreen, context, warnings) {
 const length=options.seedLength, model=`guide positions 2-${length+1}; exact ${length}-nt complement; sense transcripts only`;
 const screen={status:'not run',model,recordsScanned:0,recordsSkipped:0,basesProcessed:0,ambiguousWindowsSkipped:0,detailsOmitted:0,matchComparisons:0};
 const hits=[], index=new Map(), transcripts=new Map();
 const intended=new Set(options.intendedTranscriptIds??[]), names=new Map();
 for(const record of records){const name=record.title.split(/\s+/)[0];names.set(name,(names.get(name)??0)+1);}
 screen.limits={maxReferenceBases:5000000,maxMatchingComparisons:10000000,maxDetailRows:5000};
 screen.intendedTranscriptIds=[...intended];
 screen.unmatchedIntendedIds=[...intended].filter(id=>!names.has(id));
 for(const row of rows){
  row.guide_seed_rna=row.guide_antisense_rna.slice(1,length+1);
  row.seed_intended_matches='';row.seed_other_matches='';row.seed_unclassified_matches='';
  row.seed_match_count=''; row.seed_transcript_count=''; row.seed_search_status='not run'; row.seed_search_model=model;
  row.seed_count_interpretation='unavailable; choose a sense transcript reference';
  const key=rc(row.guide_seed_rna); if(!index.has(key)) index.set(key,[]); index.get(key).push(row); transcripts.set(row,new Set());
 }
 if(!options.searchReferenceOffTargets || options.referenceSequenceType!=='transcripts' || !rows.length) return {screen,hits};
 if(!records.length || !['complete','partial'].includes(fullScreen.status)) { screen.status='skipped'; for(const r of rows){r.seed_search_status='skipped';r.seed_count_interpretation='unavailable';} return {screen,hits}; }
 for(const row of rows){row.seed_match_count=0;row.seed_transcript_count=0;if(intended.size){row.seed_intended_matches=0;row.seed_other_matches=0;row.seed_unclassified_matches=0;}}
 screen.status='complete';
 if(screen.unmatchedIntendedIds.length) warnings.push(`Intended transcript IDs absent from the supplied reference: ${screen.unmatchedIntendedIds.join(', ')}.`);
 // Bounded independently from full-length matches: details are capped, counts
 // continue until the declared scan/work limit. Never silently truncate counts.
 outer: for(const [ri,record] of records.entries()){
  const seq=record.sequence;
  const name=record.title.split(/\s+/)[0];
  const relation=!intended.size?"unclassified: no intended IDs supplied":names.get(name)>1?"unclassified: duplicate reference ID":intended.has(name)?"intended transcript":"other transcript";
  if(!seq || (!record.indexed && seq.length>options.maxReferenceRecordLength) || screen.basesProcessed+seq.length>5000000){screen.recordsSkipped++;continue;}
  screen.recordsScanned++; screen.basesProcessed+=seq.length;
  for(let i=0;i<=seq.length-length;i++){
   if(i%2000===0){context.throwIfCancelled?.();await context.yieldIfNeeded?.();}
   const word=seq.slice(i,i+length); if(/[^ACGT]/.test(word)){screen.ambiguousWindowsSkipped++;continue;}
   for(const row of index.get(word)??[]){
    if(++screen.matchComparisons>10000000){screen.status='partial';screen.skipReason='seed match work limit';screen.basesProcessed-=Math.max(0,seq.length-i-length);screen.recordsSkipped+=records.length-ri-1;break outer;}
    row.seed_match_count++;transcripts.get(row).add(ri);
    if(intended.size) row[relation==="intended transcript"?"seed_intended_matches":relation==="other transcript"?"seed_other_matches":"seed_unclassified_matches"]++;
    if(hits.length<5000) hits.push({candidate_id:row.candidate_id,reference_id:`reference-${ri+1}`,reference_record:record.title,reference_start:i+1,reference_end:i+length,guide_seed_rna:row.guide_seed_rna,reference_seed_rna:word.replaceAll('T','U'),seed_model:model,transcript_relation:relation});
    else screen.detailsOmitted++;
   }
  }
 }
 if(screen.recordsSkipped || screen.ambiguousWindowsSkipped || fullScreen.status==='partial') screen.status=screen.recordsScanned?'partial':'skipped';
 const interpretation=screen.status==='skipped'?'unavailable':`${screen.status==='partial'?'lower bound; ':''}includes intended transcripts; identity only from supplied IDs; no UTR/function inference or silencing probability`;
 for(const row of rows){row.seed_search_status=screen.status;row.seed_transcript_count=transcripts.get(row).size;row.seed_count_interpretation=interpretation;if(screen.status==='skipped'){row.seed_match_count='';row.seed_transcript_count='';row.seed_intended_matches='';row.seed_other_matches='';row.seed_unclassified_matches='';}}
 for(const hit of hits){hit.search_status=screen.status;hit.interpretation=interpretation;hit.details_omitted=screen.detailsOmitted;}
 if(screen.status!=='complete') warnings.push(`Seed search ${screen.status}: ${screen.recordsSkipped} records and ${screen.ambiguousWindowsSkipped} ambiguous windows skipped${screen.skipReason?`; ${screen.skipReason}`:''}; counts are ${screen.status==='partial'?'lower bounds':'unavailable'}.`);
 if(screen.detailsOmitted) warnings.push(`Seed hit table omits ${screen.detailsOmitted} rows; counts include all matches found before scan limits.`);
 return {screen,hits};
}
