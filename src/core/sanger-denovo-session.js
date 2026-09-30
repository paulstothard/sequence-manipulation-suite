import { prepareSangerAlleleCollection } from './sanger-allele-preparation.js';
import { assessSangerGenotypeSignal, genotypeSangerTraces } from './sanger-genotype.js';
import { extractSangerEvidence } from './resolve-mixed-sanger-trace.js';
import { hasSangerGenotypeCandidates } from './sanger-genotype-candidates.js';
import { candidateRecord, sangerCandidatesCompatible } from './sanger-resolved-session.js';
import { assembleLightweightSequences } from './lightweight-sequence-assembly.js';
import { parseSangerTraceInput, prepareSangerTrace, prepareSangerTraceSession, makeSangerTraceJson } from './sanger-trace.js';
import { reverseSangerSequence } from './sanger-reference.js';
import { formatFastaRecord } from './fasta.js';
import { effectiveToolLimit } from './tool-limit-policy.js';

// Conservative assembly policy, independently tested with known signal fixtures.
// The scientific decomposition and signal assessment remain in the shared resolver
// and genotyper (see their method citations). These are assembly heuristics:
// 12 clear cycles separate isolated SNPs from sustained mixtures; fragments need
// at least 20 bases. Drafts use exact, unambiguous overlaps and are built once.
export const SANGER_ASSEMBLY_FRAGMENT_LIMIT = 200;
const CLEAR_RUN = 12;
const ALLELES = { A:'A', C:'C', G:'G', T:'T', R:'AG', Y:'CT', S:'CG', W:'AT', K:'GT', M:'AC' };
export const sangerAssemblyResolutionColumns = [
  ['sequence_id','Sequence ID'], ['source_trace','Source trace'], ['source_name','Source name'],
  ['sequence_kind','Sequence type'], ['status','Status'], ['length','Sequence length'],
  ['source_start','Original start'], ['source_end','Original end'], ['orientation','Source orientation'],
  ['draft_contig','Draft contig'], ['draft_start','Draft start'], ['draft_end','Draft end'],
  ['ploidy','Ploidy'], ['phase','Phase'], ['reason','Reason'],
].map(([id,label]) => ({ id,label,type:['length','source_start','source_end','draft_start','draft_end','ploidy'].includes(id)?'number':'string' }));

function runs(values, minimum = 1) {
  const result = [];
  for (let i = 0; i < values.length;) {
    if (!values[i]) { i++; continue; }
    const start = i;
    while (i < values.length && values[i]) i++;
    if (i - start >= minimum) result.push({ start, end:i, sequence:values.slice(start,i).join('') });
  }
  return result;
}

export function reliableSangerRegions(prepared, options = {}) {
  const preview = prepared.trace.traceMode === 'base-call-preview';
  const record = parseSangerTraceInput(makeSangerTraceJson(prepared));
  const ratio = Number(options.secondaryPeakPercent ?? 20) / 100;
  const assessed = preview ? null : assessSangerGenotypeSignal(record);
  const peaks = preview ? null : extractSangerEvidence(record, ratio);
  const codes = prepared.view.baseCalls.map((call, i) => preview
    ? (ALLELES[call.base] ? call.base : '')
    : assessed[i].usable && peaks[i].active.length === 1 && peaks[i].secondaryRatio < Math.min(ratio, 0.15)
      ? peaks[i].code : '');
  const uncertain = codes.map((code,i) => !/^[ACGT]$/.test(code) ? i : -1).filter(i=>i>=0);
  const allowed = codes.slice();
  // Keep supported isolated SNPs only with clear flanks on both sides. Mask the
  // entire span of clustered mixed calls, including coincident peaks within it.
  for (let j = 0; j < uncertain.length;) {
    const first = uncertain[j];
    let end = j;
    while (end + 1 < uncertain.length && uncertain[end+1] - uncertain[end] <= CLEAR_RUN) end++;
    const last = uncertain[end];
    const isolated = end === j && first >= CLEAR_RUN && first + CLEAR_RUN < codes.length;
    const code = preview ? prepared.view.baseCalls[first].base : peaks[first].code;
    if (isolated && ALLELES[code]?.length === 2 && (preview || assessed[first].usable)) allowed[first] = code;
    else for (let i = first; i <= last; i++) allowed[i] = '';
    j = end + 1;
  }
  const minimum = Math.max(20, Math.min(10000, Number(options.assemblyMinOverlap ?? 20)));
  return { allowed, fragments:runs(allowed,minimum), seeds:runs(allowed.map(code=>/^[ACGT]$/.test(code)?code:''),minimum),
    peaks, assessed, preview, minimum };
}

function originalRanges(prepared, indices) {
  const positions = [...new Set(indices.map(i=>prepared.view.baseCalls[i].originalIndex))].sort((a,b)=>a-b);
  const result = [];
  for (const position of positions) {
    if (result.at(-1)?.end === position - 1) result.at(-1).end = position;
    else result.push({ start:position, end:position });
  }
  return result;
}

function fragmentRecord(prepared, traceIndex, fragment, index, ploidy, reason) {
  const id = `trace${traceIndex+1}_fragment${index+1}`;
  const label = `Trace ${traceIndex+1} / fragment ${index+1}`;
  const calls = prepared.view.baseCalls.slice(fragment.start,fragment.end);
  const result = prepareSangerTrace(formatFastaRecord(label,fragment.sequence), { trimMethod:'manual' });
  result.candidate = { id,label,kind:'reliable-fragment',sourceTrace:`Trace ${traceIndex+1}`,sourceIndex:traceIndex,
    sourceName:prepared.view.record,orientation:prepared.view.orientation,ploidy,phase:'Observed calls; mixed SNP phase unconfirmed',
    sourcePositions:calls.map(call=>({readPosition:call.originalIndex,signalPosition:call.originalTracePosition,
      sourceDisplayIndex:call.displayIndex,sourceTracePosition:call.tracePosition})),phaseBlocks:[],component:null,reason };
  result.view.traces = { A:[],C:[],G:[],T:[] }; result.view.sampleCount = 0;
  result.view.baseCalls = result.view.baseCalls.map((call,i)=>({...call,quality:calls[i].quality,
    originalIndex:calls[i].originalIndex,originalTracePosition:calls[i].originalTracePosition}));
  result.warnings = [];
  return result;
}

function draftContigs(regions, options, context) {
  const seeds = regions.flatMap((r,i)=>r.seeds.map((s,j)=>({...s,id:`trace${i+1}_seed${j+1}`,sourceIndex:i})));
  if (seeds.length > SANGER_ASSEMBLY_FRAGMENT_LIMIT) throw new Error('Assembly resolving supports at most 200 reliable fragments. Clip or reduce the input traces.');
  if (!seeds.length) return [];
  const byId = new Map(seeds.map(s=>[s.id,s]));
  const assembly = assembleLightweightSequences(seeds.map(s=>formatFastaRecord(s.id,s.sequence)).join(''),{
    minOverlap:options.assemblyMinOverlap ?? 20,maxMismatchPercent:0,tryReverseComplement:options.assemblyTryReverseComplement !== false,
  },{...context,canCombineReads:(placed,read)=>placed.every(other=>byId.get(other.title).sourceIndex!==byId.get(read.title).sourceIndex)});
  return assembly.contigs.filter(c=>c.sequence.length>=40).map((c,i)=>({
    id:`draft_${i+1}`,title:`draft_${i+1}`,sequence:c.sequence,firstBase:1,lastBase:c.sequence.length,
    support:c.reads.map(read=>({sourceIndex:byId.get(read.title).sourceIndex,sourceTrace:`Trace ${byId.get(read.title).sourceIndex+1}`,
      fragment:read.title,start:read.start,end:read.end,orientation:read.orientation,
      displayStart:byId.get(read.title).start+1,displayEnd:byId.get(read.title).end})),
  }));
}

function matchingDrafts(drafts, region, options) {
  const words = new Set(region.seeds.flatMap(seed=>{
    const words=[];
    for(let i=0;i<=seed.sequence.length-11;i+=5) words.push(seed.sequence.slice(i,i+11));
    return words;
  }));
  return drafts.filter(draft=>{
    const forward = [...words].filter(word=>draft.sequence.includes(word)).length;
    const reverse = options.assemblyTryReverseComplement === false ? 0 : [...words].filter(word=>draft.sequence.includes(reverseSangerSequence(word))).length;
    return Math.max(forward,reverse)>=2;
  });
}

function supportedReconstruction(read, draft, region, traceIndex, options) {
  if (!hasSangerGenotypeCandidates(read)) return false;
  if (options.assemblyTryReverseComplement === false && read.orientation === 'reverse-complement') return false;
  // Every retained call must have usable measured signal. At mixed positions,
  // require draft coverage by a different physical trace, including gap anchors.
  for (const component of read.resolution.components) {
    let anchor=component.referenceStart;
    for(const col of component.alignment.columns) {
      if(col.sequence_a_position) anchor=col.sequence_a_position;
      if(!col.sequence_b_position) continue;
      const pos=component.sourcePositions[col.sequence_b_position-1].readPosition-1;
      if(!region.assessed[pos]?.usable) return false;
      if(region.peaks[pos].active.length>1 || !region.allowed[pos]) {
        if(!draft.support.some(s=>s.sourceIndex!==traceIndex && s.start<=anchor && s.end>=anchor)) return false;
      }
    }
  }
  return true;
}

function compatiblePlacement(contig, placement, byLabel) {
  const b=byLabel.get(placement.read.title);
  for(const other of contig.reads) {
    const a=byLabel.get(other.title), otherStart=other.start+placement.shift;
    const first=Math.max(otherStart,placement.start),last=Math.min(other.end+placement.shift,placement.end);
    if(last<first) continue;
    // Split pieces of the same trace cannot overlap across an excluded region.
    if(a.sourceTrace===b.sourceTrace) return false;
    for(let p=first;p<=last;p++) {
      const ai=p-otherStart,bi=p-placement.start;
      const ab=other.sequence[ai],bb=placement.sequence[bi];
      if(![...(ALLELES[ab]??'')].some(base=>(ALLELES[bb]??'').includes(base))) return false;
      if(a.draft && a.draft===b.draft) {
        const ac=a.coordinates[other.orientation==='reverse-complement'?a.coordinates.length-ai-1:ai];
        const bc=b.coordinates[placement.orientation==='reverse-complement'?b.coordinates.length-bi-1:bi];
        if(ac!==bc) return false;
      }
    }
  }
  return true;
}

export async function prepareDeNovoSangerSession(input, options={}, context={}) {
  const ploidy=Number(options.ploidy??2);
  if(![1,2,3,4].includes(ploidy)) throw new Error('Choose ploidy 1, 2, 3 or 4.');
  const ratio=Number(options.secondaryPeakPercent??20);
  if(!Number.isFinite(ratio)||ratio<5||ratio>45) throw new Error('Secondary peak threshold must be from 5 to 45%.');
  const source=typeof input==='string'?input:JSON.stringify({...input,format:'sms3-sanger-trace-session-v1'});
  if(source.length>effectiveToolLimit(options,'maxInputCharacters',33554432)) throw new Error('Resolving input exceeds 33,554,432 characters.');
  const sourceCollection=prepareSangerAlleleCollection(source,{...options,task:'assemble',resolveSequences:true,maxSessionTraces:20});
  for(const prepared of sourceCollection.traces) if(prepared.trace.sampleCount>effectiveToolLimit(options,'maxSignalSamples',200000))
    throw new Error('Resolving supports 200,000 signal measurements per channel while this limit is enforced.');
  const regions=[];
  for(const prepared of sourceCollection.traces) {
    context.throwIfCancelled?.(); await context.yieldIfNeeded?.();
    regions.push(reliableSangerRegions(prepared,options));
  }
  context.reportProgress?.({phase:'Assembling reliable regions',progress:0.1});
  const drafts=draftContigs(regions,options,context);
  const traces=[],rows=[],reads=[],genotypes=[],exclusions=[],warnings=[...sourceCollection.warnings];
  for(const [i,prepared] of sourceCollection.traces.entries()) {
    context.throwIfCancelled?.(); await context.yieldIfNeeded?.();
    const region=regions[i],sample=`Trace ${i+1}`;
    const eligible=!region.preview && prepared.sequence.length>=40 && prepared.sequence.length<=1200;
    const guides=eligible?matchingDrafts(drafts,region,options):[];
    const attempts=[];
    // Bound repeated-placement work and refuse competing draft loci.
    if(guides.length<=8) for(const draft of guides) {
      const analysis=await genotypeSangerTraces({reference:draft,traces:[{sample,trace:JSON.parse(makeSangerTraceJson(prepared))}]},
        {...options,referenceStart:1,siteMode:'variants',ploidy,trimMode:'none',autoTrim:false,clipStart:0,clipEnd:0},context);
      const read=analysis.reads[0];
      if(supportedReconstruction(read,draft,region,i,options)) attempts.push({read,draft,analysis});
    }
    let reason=region.preview?'Base-call input; reliable sequence retained.':!eligible?'Outside the 40–1,200-base reconstruction scope.':
      guides.length>8?'Too many matching draft contigs.':attempts.length>1?'Multiple draft contigs support different possible placements.':
      !drafts.length?'No reliable draft contig was available.':'Draft evidence was insufficient for reconstruction.';
    const included=new Set(),records=[];
    if(attempts.length===1) {
      const {read,draft,analysis}=attempts[0];
      reads.push(read); genotypes.push(...analysis.rows);
      const unique=read.resolution.components.filter((c,j,all)=>all.findIndex(other=>other.sequence===c.sequence &&
        other.alignment.alignmentA===c.alignment.alignmentA && other.referenceStart===c.referenceStart)===j);
      for(const [j,component] of unique.entries()) {
        const result=candidateRecord(component,read,prepared,i,j);
        Object.assign(result.candidate,{kind:'candidate-haplotype',draft:draft.id});
        records.push(result);
        component.sourcePositions.forEach(p=>included.add(p.readPosition-1));
      }
      reason='';
      warnings.push(...read.resolution.warnings.map(w=>`${sample}: ${w}`));
    }
    // Preserve usable ends outside a local reconstruction; split at every break.
    const leftovers=runs(region.allowed.map((code,j)=>included.has(j)?'':code),region.minimum);
    for(const [j,fragment] of leftovers.entries()) {
      records.push(fragmentRecord(prepared,i,fragment,j,ploidy,reason));
      for(let k=fragment.start;k<fragment.end;k++) included.add(k);
    }
    const omitted=originalRanges(prepared,prepared.view.baseCalls.map((_,j)=>j).filter(j=>!included.has(j)));
    if(omitted.length) {
      exclusions.push({source_trace:sample,source_name:prepared.view.record,ranges:omitted,reason:reason||'Uncertain signal or fragments below the minimum length.'});
      warnings.push(`${sample}: excluded original bases ${omitted.map(r=>`${r.start}–${r.end}`).join(', ')} from assembly.`);
    }
    for(const result of records) {
      const c=result.candidate,positions=c.sourcePositions.map(p=>p.readPosition);
      rows.push({sequence_id:c.id,source_trace:sample,source_name:c.sourceName,sequence_kind:c.kind==='reliable-fragment'?'Reliable fragment':'Candidate haplotype',
        status:c.kind==='reliable-fragment'?'retained':'resolved',length:result.sequence.length,source_start:Math.min(...positions),source_end:Math.max(...positions),
        orientation:c.orientation,draft_contig:c.draft??'',draft_start:c.component?.referenceStart??'',draft_end:c.component?.referenceEnd??'',ploidy,phase:c.phase,reason:c.reason??''});
      traces.push(result);
    }
    if(!records.length) rows.push({source_trace:sample,source_name:prepared.view.record,status:'excluded',ploidy,reason});
    if(reason) warnings.push(`${sample}: ${reason} Retained ${leftovers.length} reliable fragment(s).`);
  }
  if(traces.length>SANGER_ASSEMBLY_FRAGMENT_LIMIT) throw new Error('Assembly resolving supports at most 200 sequences and fragments. Clip or reduce the input traces.');
  const byLabel=new Map(traces.map(r=>[r.view.record,r.candidate]));
  const session=await prepareSangerTraceSession('',{...options,task:'assemble',assemblyUseAmbiguousIupacConsensus:true},
    {...context,canCombineReads:(placed,read)=>placed.every(other=>{
      const a=byLabel.get(other.title),b=byLabel.get(read.title);
      if(a.sourceTrace===b.sourceTrace && a.kind==='candidate-haplotype' && b.kind==='candidate-haplotype') return false;
      return !(a.draft && a.draft===b.draft) || sangerCandidatesCompatible(a,b);
    }),canPlaceRead:(contig,placement)=>compatiblePlacement(contig,placement,byLabel)},
    {...sourceCollection,traces,reference:null,warnings:[]});
  for(const contig of session.assembly.contigs) {
    contig.sourceTraces=[...new Set(contig.reads.map(r=>byLabel.get(r.title).sourceTrace))];
    contig.sequenceIds=contig.reads.map(r=>byLabel.get(r.title).id);
    contig.candidateIds=contig.reads.filter(r=>byLabel.get(r.title).kind==='candidate-haplotype').map(r=>byLabel.get(r.title).id);
  }
  session.sourceCollection=sourceCollection;
  session.resolution={enabled:true,mode:'draft-contigs',ploidy,secondaryPeakPercent:ratio,unresolvedTraceAction:'retain-reliable-fragments',
    rows,exclusions,drafts,analysis:{reads,rows:genotypes}};
  session.warnings=[...new Set([...warnings,...session.warnings])];
  if(!traces.length) session.warnings.push('No reliable sequence remains for assembly. Review clipping and signal quality.');
  return session;
}
