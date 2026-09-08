// VCF GT/PS: https://samtools.github.io/hts-specs/VCFv4.5.pdf
// Independent reference: https://samtools.github.io/bcftools/bcftools.html#consensus
// SMS3 deliberately validates phase blocks, missing calls and conflicts before edits.
export const CONSENSUS_LIMITS = { characters: 20_000_000, variants: 50000, bases: 5_000_000, outputBases: 10_000_000, samples: 2000, contigs: 2000, idLength: 200, phaseBlocks: 200, outputRecords: 4000 };
const DNA = /^[ACGTRYSWKMBDHVN]+$/i;
const IUPAC = { AG:'R', CT:'Y', CG:'S', AT:'W', GT:'K', AC:'M' };
export async function checkpoint(context, phase, progress) {
  context.throwIfCancelled?.(); context.reportProgress?.({ phase, progress });
  await context.yieldIfNeeded?.(); context.throwIfCancelled?.();
}
export function consensusSettings(options = {}) {
  const choice = (key, allowed, fallback) => {
    const value = options[key] ?? fallback;
    if (!allowed.includes(value)) throw new Error(`Invalid ${key}: ${value}`);
    return value;
  };
  const integer = (key, fallback, max) => {
    const value = options[key] === '' || options[key] == null ? fallback : Number(options[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${key} must be an integer from 1 to ${max}.`);
    return value;
  };
  const chromosome = String(options.chromosome ?? '').trim();
  const start = integer('regionStart', 1, Number.MAX_SAFE_INTEGER);
  const end = options.regionEnd === '' || options.regionEnd == null ? null : integer('regionEnd', 1, Number.MAX_SAFE_INTEGER);
  if (end !== null && end < start) throw new Error('Region end must be at or after region start.');
  if (!chromosome && (start !== 1 || end !== null)) throw new Error('Choose a reference / chromosome when specifying a region.');
  return { sample: String(options.sample ?? '').trim(), chromosome, start, end,
    mode: choice('sequenceMode', ['consensus','haplotype1','haplotype2','both'], 'consensus'),
    phasePolicy: choice('phasePolicy', ['continuous','blocks'], 'continuous'),
    missing: choice('missingPolicy', ['error','mask','reference'], 'error'),
    filter: choice('filterPolicy', ['pass','pass-or-unfiltered','all'], 'pass-or-unfiltered'),
    unsupported: choice('unsupportedPolicy', ['error','skip'], 'error'),
    outputFormat: choice('outputFormat', ['fasta','audit','coordinates','map','report'], 'fasta'),
    maxVariants: integer('maxVariants', CONSENSUS_LIMITS.variants, CONSENSUS_LIMITS.variants) };
}
export async function parseConsensusFasta(text, context = {}) {
  if (typeof text !== 'string' || text.length > CONSENSUS_LIMITS.characters) throw new Error('Reference FASTA exceeds the 20 million character limit.');
  const records = new Map(); let current, bases = 0;
  const lines = text.replace(/\r\n?/g,'\n').split('\n');
  for (let i=0;i<lines.length;i++) {
    if (i%512===0) await checkpoint(context,'reading-reference',0.05);
    const line = lines[i]; if (!line.trim()) continue;
    if (line.startsWith('>')) {
      const id = line.slice(1).trim().split(/\s/)[0];
      if (!id || id.length>CONSENSUS_LIMITS.idLength || /[\x00-\x20\x7f]/.test(id) || records.has(id)) throw new Error(`Empty, overlong (maximum 200 characters) or duplicate reference ID: ${id}`);
      if(records.size>=CONSENSUS_LIMITS.contigs) throw new Error('Too many reference contigs (maximum 2,000).');
      current = { id, chunks: [], start: 1 }; records.set(id,current);
    } else {
      if (!current) throw new Error('Reference input must be FASTA with a >contig header.');
      if (!DNA.test(line)) throw new Error(`Reference ${current.id}: invalid sequence characters, gaps or embedded whitespace. Correct the FASTA; bases are never removed.`);
      bases += line.length;
      if (bases>CONSENSUS_LIMITS.bases) throw new Error('Loaded reference exceeds 5 million bases. Use indexed FASTA with a bounded region.');
      current.chunks.push(line.toUpperCase());
    }
  }
  if (!records.size) throw new Error('Provide reference FASTA.');
  for(const r of records.values()) { r.sequence=r.chunks.join(''); delete r.chunks; if(!r.sequence) throw new Error(`Empty reference: ${r.id}`); }
  return records;
}
export function parseConsensusGt(gt, altCount, location) {
  if (!/^(?:\d+|\.)(?:[|/](?:\d+|\.))?$/.test(gt)) throw new Error(`${location}: GT must be haploid or diploid (unsupported or malformed GT: ${gt || 'absent'}).`);
  const alleles=gt.split(/[|/]/).map(a=>a==='.'?null:Number(a));
  if (alleles.some(a=>a!==null && (!Number.isSafeInteger(a)||a>altCount))) throw new Error(`${location}: GT allele index exceeds ALT alleles.`);
  return { alleles, phased: gt.includes('|'), missing: alleles.includes(null), ploidy: alleles.length };
}
export async function parseConsensusVcf(text, settings, context = {}) {
  if(typeof text!=='string'||text.length>CONSENSUS_LIMITS.characters) throw new Error('VCF exceeds the 20 million character limit. Use indexed VCF for a bounded region.');
  const lines=text.replace(/\r\n?/g,'\n').split('\n');
  let samples=null, sampleIndex, selected, version=false; const records=[];
  for(let i=0;i<lines.length;i++) {
    if(i%256===0) await checkpoint(context,'reading-variants',0.15);
    const line=lines[i]; if(!line) continue;
    if(line.startsWith('##fileformat=')) { if(!/^##fileformat=VCFv4\.[0-5]$/.test(line)) throw new Error('Supported VCF versions are 4.0–4.5 with standard GT and PS fields.'); version=true; }
    if(line.startsWith('##')) continue;
    if(line.startsWith('#CHROM\t')) {
      if(samples) throw new Error('Duplicate #CHROM header.');
      const fields=line.split('\t');
      if(fields.slice(0,9).join('\t')!=='#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT') throw new Error('VCF requires the standard nine columns followed by sample columns.');
      samples=fields.slice(9);
      if(!samples.length||samples.some(s=>!s||s.length>CONSENSUS_LIMITS.idLength||/[\x00-\x20\x7f]/.test(s))||new Set(samples).size!==samples.length) throw new Error('VCF requires unique sample names (up to 200 characters, without whitespace) and sample genotypes.');
      if(samples.length>CONSENSUS_LIMITS.samples) throw new Error('VCF exceeds 2,000 samples.');
      selected=settings.sample || (samples.length===1?samples[0]:''); sampleIndex=samples.indexOf(selected);
      if(sampleIndex<0) throw new Error(selected?`Sample "${selected}" was not found in the VCF header.`:'Select one sample from this multi-sample VCF.');
      continue;
    }
    if(line.startsWith('#')) continue;
    if(!samples||!version) throw new Error('VCF requires ##fileformat and #CHROM/sample headers before records.');
    const f=line.split('\t');
    if(f.length!==9+samples.length) throw new Error(`VCF line ${i+1}: column count does not match the sample header.`);
    if(!/^[1-9]\d*$/.test(f[1])||!Number.isSafeInteger(Number(f[1]))) throw new Error(`VCF line ${i+1}: invalid position.`);
    if(!f[0]||f[0].length>CONSENSUS_LIMITS.idLength||/[\x00-\x20\x7f]/.test(f[0])) throw new Error('VCF contig IDs must be 1–200 characters without whitespace.');
    const pos=Number(f[1]), ref=f[3].toUpperCase(), alts=f[4]==='.'?[]:f[4].split(',').map(a=>a.toUpperCase());
    if(!/^[ACGTN]+$/.test(ref)) throw new Error(`VCF line ${i+1}: REF must contain A, C, G, T or N.`);
    if(settings.chromosome && f[0]!==settings.chromosome) continue;
    if(pos+ref.length-1<settings.start || (settings.end!==null && pos>settings.end)) continue;
    const keys=f[8].split(':'), values=f[9+sampleIndex].split(':');
    if(new Set(keys).size!==keys.length || !keys.includes('GT') || values.length>keys.length) throw new Error(`${f[0]}:${pos}: invalid FORMAT or missing GT field.`);
    const fields=Object.fromEntries(keys.map((k,j)=>[k,values[j]??'.']));
    const gt=parseConsensusGt(fields.GT,alts.length,`${f[0]}:${pos}`);
    const ps=fields.PS==null||fields.PS==='.'?'implicit':fields.PS;
    if(ps!=='implicit'&&(!/^\d+$/.test(ps)||Number(ps)>2147483647)) throw new Error(`${f[0]}:${pos}: invalid PS phase-set identifier.`);
    if(settings.mode!=='consensus'&&['PSL','PSO','PGT','PID','HP'].some(k=>fields[k]&&fields[k]!=='.')) throw new Error(`${f[0]}:${pos}: this phased output supports GT/PS; ${keys.filter(k=>['PSL','PSO','PGT','PID','HP'].includes(k)).join(', ')} phase fields need conversion to supported GT/PS first.`);
    records.push({ chrom:f[0],pos,id:f[2],ref,alts,filter:f[6],gt:fields.GT,...gt,ps,line:i+1 });
    if(records.length>settings.maxVariants) throw new Error(`More than ${settings.maxVariants.toLocaleString()} variants in the requested scope. Narrow the region or raise the limit.`);
  }
  if(!samples||!version) throw new Error('Provide VCF with ##fileformat and #CHROM/sample headers.');
  return { records,samples,sample:selected };
}
function trimEdit(pos, ref, alt) {
  let prefix=0; while(prefix<ref.length&&prefix<alt.length&&ref[prefix]===alt[prefix]) prefix++;
  let suffix=0; while(suffix<ref.length-prefix&&suffix<alt.length-prefix&&ref[ref.length-1-suffix]===alt[alt.length-1-suffix]) suffix++;
  return { start:pos-1+prefix, end:pos-1+ref.length-suffix, alt:alt.slice(prefix,alt.length-suffix) };
}
function selectedAllele(record, path, s) {
  const {alleles,ref,alts}=record;
  if(record.missing) {
    if(s.missing==='error') throw new Error(`${record.chrom}:${record.pos}: missing or partially missing GT ${record.gt}. Choose an explicit missing-call policy.`);
    return { alt:s.missing==='mask'?'N'.repeat(ref.length):ref, status:s.missing==='mask'?'masked':'retained-reference',reason:'missing genotype; unknown indel length is not reconstructed' };
  }
  if(path==='consensus' && alleles.length===2 && alleles[0]!==alleles[1]) {
    const a=alleles.map(n=>n===0?ref:alts[n-1]);
    if(a.some(v=>!/^[ACGT]$/.test(v))) throw new Error(`${record.chrom}:${record.pos}: heterozygous indels or multi-base alleles cannot be represented by a single IUPAC base. Use phased haplotypes or resolve the genotype upstream.`);
    return {alt:IUPAC[[...new Set(a)].sort().join('')],status:'ambiguous',reason:'IUPAC code from the selected sample genotype'};
  }
  const index=path==='consensus'?alleles[0]:alleles[Number(path)-1];
  if(index===undefined) throw new Error(`${record.chrom}:${record.pos}: requested haplotype ${path} does not exist for haploid GT.`);
  return {alt:index===0?ref:alts[index-1],status:index===0?'reference':'applied',reason:''};
}
export async function buildConsensus(references, parsed, s, context = {}) {
  const warnings=['Positions absent from this VCF retain reference bases; this does not establish sequencing coverage.'];
  const grouped=new Map(); for(const r of parsed.records) { if(!references.has(r.chrom)) throw new Error(`VCF contig "${r.chrom}" is absent from the reference FASTA.`); if(!grouped.has(r.chrom)) grouped.set(r.chrom,[]); grouped.get(r.chrom).push(r); }
  if(s.chromosome&&!references.has(s.chromosome)) throw new Error(`Reference "${s.chromosome}" was not found.`);
  const outputs=[],audit=[],coordinates=[]; let totalBases=0, totalEdits=0, skipped=0;
  const needSequence=s.outputFormat==='fasta', needAudit=s.outputFormat==='audit'||s.outputFormat==='map', needCoordinates=s.outputFormat==='coordinates';
  for(const reference of references.values()) {
    if(s.chromosome&&reference.id!==s.chromosome) continue;
    const first=reference.start??1, last=first+reference.sequence.length-1;
    const start=s.start, end=s.end??last;
    if(start<first||end>last||end<start) throw new Error(`Region ${reference.id}:${start}-${end} is outside the loaded reference.`);
    const candidates=(grouped.get(reference.id)??[]).sort((a,b)=>a.pos-b.pos||a.line-b.line);
    const active=[];
    for(let i=0;i<candidates.length;i++) {
      if(i%256===0) await checkpoint(context,'checking-variants',0.3);
      const r=candidates[i];
      const actual=reference.sequence.slice(r.pos-first,r.pos-first+r.ref.length).toUpperCase();
      if(r.pos<first||actual!==r.ref) throw new Error(`${r.chrom}:${r.pos}: REF mismatch; VCF ${r.ref}, reference ${actual||'outside loaded span'}. Check the reference build and region.`);
      let reason='';
      if(s.filter!=='all'&&r.filter!=='PASS'&&!(s.filter==='pass-or-unfiltered'&&r.filter==='.')) reason=`FILTER=${r.filter}`;
      const selected=r.alleles.filter(n=>n!==null&&n>0).map(n=>r.alts[n-1]);
      if(!reason&&selected.some(a=>!/^[ACGTN]+$/.test(a))) {
        if(s.unsupported==='error') throw new Error(`${r.chrom}:${r.pos}: selected symbolic, spanning-deletion (*) or breakend allele is unsupported. Use explicit sequence alleles or choose Skip unsupported calls.`);
        reason='unsupported selected allele';
      }
      if(reason) { skipped++; if(needAudit) audit.push({sample:parsed.sample,chrom:r.chrom,pos:r.pos,ref:r.ref,alt:r.alts.join(','),gt:r.gt,phase_set:r.ps,path:'all',status:'skipped',reason}); continue; }
      active.push(r);
    }
    const het=active.filter(r=>!r.missing&&r.ploidy===2&&r.alleles[0]!==r.alleles[1]);
    let segments=[{start,end,block:'none'}];
    if(s.mode!=='consensus') {
      const unphased=het.find(r=>!r.phased); if(unphased) throw new Error(`${reference.id}:${unphased.pos}: unphased heterozygous GT ${unphased.gt} cannot define a haplotype.`);
      const blocks=[...new Set(het.map(r=>r.ps))];
      if(blocks.length>CONSENSUS_LIMITS.phaseBlocks) throw new Error('More than 200 phase blocks on one contig. Narrow the region.');
      if(blocks.includes('implicit')) warnings.push(`${reference.id}: phased GT without PS is interpreted as one implicit phase set.`);
      if(blocks.length>1&&s.phasePolicy==='continuous') throw new Error(`${reference.id}: ${blocks.length} disconnected phase sets. Choose Separate phase blocks or restrict the region to one block.`);
      if(blocks.length>0&&s.phasePolicy==='blocks') {
        segments=blocks.map(block=>{const rows=het.filter(r=>r.ps===block);return {block,start:Math.max(start,Math.min(...rows.map(r=>r.pos))),end:Math.min(end,Math.max(...rows.map(r=>r.pos+r.ref.length-1)))}}).sort((a,b)=>a.start-b.start);
        for(let i=1;i<segments.length;i++) if(segments[i].start<=segments[i-1].end) throw new Error(`${reference.id}: interleaved phase sets cannot be exported as separate contiguous blocks. Restrict the region.`);
        warnings.push(`${reference.id}: exporting phase-block spans only; flanking bases and gaps between blocks are not included.`);
      } else segments[0].block=blocks[0]??'none';
    }
    for(const segment of segments) {
      const rows=active.filter(r=>r.pos<=segment.end&&r.pos+r.ref.length-1>=segment.start);
      const ploidies=new Set(rows.filter(r=>!r.missing).map(r=>r.ploidy));
      if(s.mode!=='consensus'&&ploidies.size>1) throw new Error(`${reference.id}: haploid/diploid transition in the requested haplotype span. Split the region at the ploidy boundary.`);
      const haploid=ploidies.size===1&&ploidies.has(1);
      if(s.mode==='haplotype2'&&haploid) throw new Error(`${reference.id}: no second haplotype exists for haploid calls.`);
      if(s.mode!=='consensus'&&!ploidies.size) throw new Error(`${reference.id}: no called genotypes establish ploidy for haplotype output. Use Single consensus.`);
      const paths=s.mode==='consensus'?['consensus']:s.mode==='both'?(haploid?['1']:['1','2']):[s.mode==='haplotype1'?'1':'2'];
      for(const path of paths) {
        const title=`${encodeURIComponent(parsed.sample)}|${encodeURIComponent(reference.id)}:${segment.start}-${segment.end}|${path==='consensus'?'consensus':`haplotype-${path}`}|PS=${segment.block}`;
        const parts=[]; const insertions=new Set(); let cursor=segment.start-1, out=0, edits=0;
        const append=(a,b,seq,kind,line=null)=>{
          const length=seq===null?b-a:seq.length;
          if(needSequence) parts.push(seq===null?reference.sequence.slice(a-first+1,b-first+1):seq);
          if(needCoordinates&&length+b-a>0) coordinates.push({sample:parsed.sample,sequence_id:title,chrom:reference.id,path,phase_set:segment.block,reference_start0:a,reference_end0:b,output_start0:out,output_end0:out+length,kind,vcf_line:line});
          out+=length;
          if(out+totalBases>CONSENSUS_LIMITS.outputBases) throw new Error('Consensus exceeds 10 million output bases. Narrow the region.');
        };
        for(let i=0;i<rows.length;i++) {
          if(i%256===0) await checkpoint(context,'applying-variants',0.55);
          const r=rows[i], choice=selectedAllele(r,path,s), edit=trimEdit(r.pos,r.ref,choice.alt);
          const changes=edit.end>edit.start||edit.alt.length>0;
          if(changes&&(edit.start<segment.start-1||edit.end>segment.end)) throw new Error(`${r.chrom}:${r.pos}: variant crosses the requested region or phase-block boundary. Expand the region.`);
          if(changes&&edit.start<cursor) throw new Error(`${r.chrom}:${r.pos}: overlapping or duplicate edits on haplotype ${path}. Normalize or resolve the conflicting variants.`);
          if(changes&&edit.start===edit.end&&insertions.has(edit.start)) throw new Error(`${r.chrom}:${r.pos}: conflicting insertions at the same boundary.`);
          if(changes) {
            append(cursor,edit.start,null,'unchanged');
            append(edit.start,edit.end,edit.alt,choice.status==='masked'?'masked':edit.start===edit.end?'insertion':!edit.alt.length?'deletion':'replacement',r.line);
            cursor=edit.end; edits++;
            if(edit.start===edit.end) insertions.add(edit.start);
          }
          if(needAudit) audit.push({sample:parsed.sample,sequence_id:title,chrom:r.chrom,pos:r.pos,ref:r.ref,alt:r.alts.join(','),gt:r.gt,phase_set:r.phased?r.ps:'',path,status:choice.status,reason:choice.reason});
        }
        append(cursor,segment.end,null,'unchanged'); totalBases+=out;totalEdits+=edits;
        if(outputs.length>=CONSENSUS_LIMITS.outputRecords) throw new Error('More than 4,000 output sequences. Select fewer contigs or phase blocks.');
        outputs.push({title,chrom:reference.id,start:segment.start,end:segment.end,path,phaseSet:segment.block,length:out,edits,...(needSequence?{sequence:parts.join('')}:{})});
      }
    }
  }
  if(!outputs.length) throw new Error('No reference sequences selected.');

  if(skipped) warnings.push(`${skipped} variant record(s) skipped; reference bases retained at skipped sites.`);
  if(s.missing!=='error'&&parsed.records.some(r=>r.missing)) warnings.push(`Missing calls: ${s.missing==='mask'?'reference spans masked with N':'reference retained'}; unknown insertion/deletion lengths are not inferred.`);
  await checkpoint(context,'building-output',0.9);
  return {outputs,audit,coordinates,warnings:[...new Set(warnings)],totalBases,totalEdits,sample:parsed.sample,settings:s,variantCount:parsed.records.length};
}
