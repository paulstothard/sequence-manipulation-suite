import { readTextFile } from './compressed-text-reader.js';
import { parseFaiIndex } from './indexed-genomics/indexed-fasta-reader.js';
import { runBcftoolsIndexedRegion, runSamtoolsFaidx } from './indexed-genomics/biowasm-hts.js';
import { CONSENSUS_LIMITS, parseConsensusFasta, parseConsensusVcf, consensusSettings } from './variant-consensus.js';
export const CONSENSUS_SEPARATOR = '##SMS3_VARIANTS##';
export async function loadConsensusInput(input, options = {}, context = {}) {
  const s=consensusSettings(options), parts=String(input??'').split(new RegExp(`^${CONSENSUS_SEPARATOR}$`,'m'));
  if(parts.length>2) throw new Error('Input has more than one VCF separator.');
  let [fasta='',vcf='']=parts;
  const vcfMode=options.consensusVcfMode??'loaded', refMode=options.consensusRefMode??'loaded';
  if(!['loaded','indexed'].includes(vcfMode)||!['loaded','indexed','bgzf'].includes(refMode)) throw new Error('Invalid reference or VCF source mode.');
  const read=file=>readTextFile(file,{maxDecodedBytes:CONSENSUS_LIMITS.characters,signal:context.signal});
  const warnings=[];
  if(vcfMode==='indexed'||refMode!=='loaded') {
    if(!s.chromosome||s.end===null) throw new Error('Indexed input requires a reference / chromosome and explicit start and end positions.');
    if(s.end-s.start+1>CONSENSUS_LIMITS.bases) throw new Error('Indexed region exceeds 5 million reference bases.');
  }
  if(vcfMode==='loaded') {
    if(options.consensusVcfFile) vcf=await read(options.consensusVcfFile);
  } else {
    if(!options.consensusVcfFile||!options.consensusVcfIndex) throw new Error('Choose BGZF VCF.GZ and its matching TBI or CSI index.');
    const result=await runBcftoolsIndexedRegion({vcfFile:options.consensusVcfFile,indexFile:options.consensusVcfIndex,region:`${s.chromosome}:${s.start}-${s.end}`},context);
    vcf=result.headerText.trimEnd()+'\n'+result.dataText;
    warnings.push('Indexed variants read with BCFtools 1.10 via local BioWasm.');
  }
  const parsed=await parseConsensusVcf(vcf,s,context);
  let references;
  if(refMode==='loaded') {
    if(options.consensusRefFile) fasta=await read(options.consensusRefFile);
    references=await parseConsensusFasta(fasta,context);
  } else {
    if(!options.consensusRefFile||!options.consensusFaiFile) throw new Error('Choose reference FASTA and its matching FAI index.');
    if(refMode==='bgzf'&&!options.consensusGziFile) throw new Error('BGZF reference requires matching FAI and GZI indexes.');
    if(refMode==='indexed'&&/\.(gz|bgz)$/i.test(options.consensusRefFile.name??'')) throw new Error('Compressed indexed FASTA requires BGZF mode and a GZI index; ordinary gzip belongs in Paste/upload FASTA.');
    const faiText=await read(options.consensusFaiFile), fai=parseFaiIndex(faiText);
    if(fai.warnings.length) throw new Error(fai.warnings.join(' '));
    const ref=fai.records.get(s.chromosome);
    if(!ref||s.end>ref.length) throw new Error('Requested reference region is absent from or outside the FAI index.');
    // Include complete overlapping REF spans, including anchors before the requested interval.
    let lo=s.start, hi=s.end;
    for(const r of parsed.records) {lo=Math.min(lo,r.pos);hi=Math.max(hi,r.pos+r.ref.length-1);}
    if(hi>ref.length||hi-lo+1>CONSENSUS_LIMITS.bases) throw new Error('Expanded REF-validation span is outside the reference or exceeds 5 million bases.');
    const text=await runSamtoolsFaidx({fastaFile:options.consensusRefFile,faiText,gziFile:refMode==='bgzf'?options.consensusGziFile:null,isBgzip:refMode==='bgzf',regions:[`${s.chromosome}:${lo}-${hi}`]},context);
    const extracted=await parseConsensusFasta(text,context);
    if(extracted.size!==1) throw new Error('Indexed reference did not return exactly one region.');
    const sequence=[...extracted.values()][0].sequence;
    if(sequence.length!==hi-lo+1) throw new Error('Indexed reference length differs from the requested span. Check the FASTA/index pairing.');
    references=new Map([[s.chromosome,{id:s.chromosome,start:lo,sequence}]]);
    warnings.push('Indexed reference read with SAMtools 1.21 via local BioWasm.');
  }
  return {references,parsed,settings:s,warnings};
}
