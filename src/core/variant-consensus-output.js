import '../vendor/d3/d3.min.js';
import { checkpoint } from './variant-consensus.js';
import { makeDnaViewerData } from './dna-viewer-data.js';
export const CONSENSUS_TABLE_CHARACTERS = 20_000_000;
export const CONSENSUS_VIEWER_MAX_RECORDS = 12;
// Count the shared TSV encoder's output before allocating a potentially huge export.
export async function checkConsensusTableSize(columns, rows, context = {}) {
  let characters = 0;
  const add = value => {
    const text = String(value ?? '');
    characters += text.length;
    if (/["\t\r\n]/.test(text)) {
      characters += 2;
      for (const c of text) if (c === '"') characters++;
    }
  };
  columns.forEach(column => add(column.label));
  characters += Math.max(0, columns.length - 1);
  for (let i = 0; i < rows.length; i++) {
    if (i % 256 === 0) await checkpoint(context, 'checking-table-size', 0.92);
    columns.forEach(column => add(rows[i][column.id]));
    characters += columns.length; // row newline and field separators
    if (characters > CONSENSUS_TABLE_CHARACTERS) throw new Error('Consensus table exceeds 20 million output characters. Narrow the region or choose FASTA/report output.');
  }
}
const columns = fields=>fields.map(([id,label,type='string'])=>({id,label,type}));
export const consensusAuditColumns=columns([['sample','Sample'],['sequence_id','Sequence ID'],['chrom','Reference'],['pos','VCF position','number'],['ref','REF'],['alt','ALT'],['gt','GT'],['phase_set','Phase set'],['path','Allele path'],['status','Action'],['reason','Reason']]);
export const consensusCoordinateColumns=columns([['sample','Sample'],['sequence_id','Sequence ID'],['chrom','Reference'],['path','Allele path'],['phase_set','Phase set'],['reference_start0','Reference start (0-based)','number'],['reference_end0','Reference end (exclusive)','number'],['output_start0','Output start (0-based)','number'],['output_end0','Output end (exclusive)','number'],['kind','Mapping'],['vcf_line','VCF line','number']]);
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const siteColor=status=>({applied:'#0072b2',ambiguous:'#cc79a7',masked:'#d55e00',reference:'#758595','retained-reference':'#d55e00',skipped:'#758595'})[status]??'#0072b2';
function variantType(site) {
  if(site.status==='skipped') return 'skipped';
  if(site.status==='masked') return 'masked';
  if(site.status==='reference'||site.status==='retained-reference') return 'reference';
  if(site.status==='ambiguous') return 'ambiguous SNP';
  const refLength=site.referenceEnd0-site.referenceStart0, altLength=String(site.editedAlt??site.selectedAlt??'').length;
  if(refLength===0) return 'insertion';
  if(altLength===0) return 'deletion';
  if(refLength===1&&altLength===1) return 'SNV';
  if(refLength===altLength) return 'MNV';
  return 'replacement';
}
function coordinateIndex(rows) {
  return {
    changedByLine:new Map(rows.filter(row=>row.kind!=='unchanged'&&row.vcf_line!==null).map(row=>[row.vcf_line,row])),
    referenceRows:rows.filter(row=>row.reference_end0>row.reference_start0)
  };
}
function mapReferenceBoundary(index,position,isEnd) {
  const rows=index.referenceRows,target=isEnd?position-1:position;let low=0,high=rows.length-1,found=null;
  while(low<=high) {const mid=(low+high)>>1;if(rows[mid].reference_start0<=target){found=rows[mid];low=mid+1;}else high=mid-1;}
  if(!found||position<found.reference_start0||position>found.reference_end0||(!isEnd&&position===found.reference_end0)) return null;
  const refLength=found.reference_end0-found.reference_start0,outLength=found.output_end0-found.output_start0;
  if(refLength===outLength) return found.output_start0+(position-found.reference_start0);
  return isEnd?found.output_end0:found.output_start0;
}
function mappedSiteInterval(site, index) {
  if(site.changes) {
    const changed=index.changedByLine.get(site.sourceLine);
    if(changed) return [changed.output_start0,changed.output_end0];
  }
  const start=mapReferenceBoundary(index,site.referenceStart0,false),end=mapReferenceBoundary(index,site.referenceEnd0,true);
  return start===null||end===null?null:[Math.min(start,end),Math.max(start,end)];
}
export function makeConsensusViewerData(a) {
  if(a.outputs.length>CONSENSUS_VIEWER_MAX_RECORDS) throw new Error(`Linear consensus viewer supports up to ${CONSENSUS_VIEWER_MAX_RECORDS} output sequences. Select fewer contigs or phase blocks, or choose FASTA/table output.`);
  if(a.outputs.some(output=>!output.sequence.length)) throw new Error('Linear consensus viewer cannot display an empty consensus sequence. Choose FASTA or a table output for a fully deleted region.');
  const records=a.outputs.map((output,index)=>{
    const rows=a.coordinates.filter(row=>row.sequence_id===output.title),coordinatesByPosition=coordinateIndex(rows);
    const sites=a.viewerSites.filter(site=>site.sequence_id===output.title||(site.status==='skipped'&&site.chrom===output.chrom&&site.pos>=output.start&&site.pos<=output.end));
    const items=sites.map(site=>{
      const interval=mappedSiteInterval(site,coordinatesByPosition);
      if(!interval) throw new Error(`${site.chrom}:${site.pos}: could not place the variant site on consensus coordinates. Choose the coordinate-map table to inspect this region.`);
      const [start0,end0]=interval;
      const deletion=end0===start0;
      const anchor=deletion?Math.max(1,Math.min(output.length,start0<output.length?start0+1:start0)):null;
      const type=variantType(site), selected=site.status==='skipped'?site.alt:site.selectedAlt;
      return {
        start:deletion?anchor:start0+1,
        end:deletion?anchor:end0,
        label:`${site.chrom}:${site.pos} ${site.ref}→${selected||'∅'}`,
        name:`${type} at ${site.chrom}:${site.pos}`,
        type,
        color:siteColor(site.status),
        genomicPosition:site.pos,
        genomicCoordinates:`${site.chrom}:${site.pos}-${site.pos+site.ref.length-1}`,
        refAllele:site.ref,
        altAllele:selected||'∅',
        sampleGenotypes:`${site.sample}=${site.gt}`,
        sample:site.sample,
        status:site.status,
        note:site.reason||undefined,
        details:{
          'Allele path':site.path,
          'Phase set':site.phase_set,
          'VCF ALT field':site.alt,
          'Consensus coordinates':deletion?`deletion boundary at output offset ${start0}`:`${start0+1}-${end0}`,
          ...(deletion?{'Display marker':'Nearest retained consensus base; the deleted interval has zero output length.'}:{})
        }
      };
    }).sort((left,right)=>left.start-right.start||left.end-right.end);
    const pathLabel=output.path==='consensus'?'consensus':`haplotype ${output.path}`;
    return {id:`consensus-${index+1}`,title:`${a.sample} · ${output.chrom}:${output.start}-${output.end} · ${pathLabel} · PS ${output.phaseSet}`,sequence:output.sequence,topology:'linear',showSecondStrandDefault:true,tracks:[{id:'variant-sites',type:'features',label:'Variant sites',axisLabel:'Sites on consensus',layout:'stacked-intervals',featureOpacity:0.82,items}]};
  });
  return makeDnaViewerData(records,{title:'Variant consensus sequence viewer',layout:'linear'});
}
export function renderConsensusMap(a) {
  if(a.outputs.length>12||a.audit.length>240) throw new Error('Variant map supports up to 12 sequences and 240 audit rows. Narrow the region or choose a table/FASTA output.');
  const height=150+a.outputs.length*105;
  const p=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 ${height}" role="img" aria-label="Variant consensus map" data-plot-foundation="d3"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#172b3a"><text x="30" y="32" font-size="21" font-weight="bold">Variant consensus map</text><text x="30" y="58" font-size="13">Reference positions (1-based); marks show calls, not output sequence spacing.</text>`];
  for(const [i,o] of a.outputs.entries()) {
    const y=100+i*105, x=globalThis.d3.scaleLinear().domain([o.start,o.end===o.start?o.end+1:o.end]).range([40,910]);
    const label=`${a.sample} · ${o.chrom}:${o.start}–${o.end} · ${o.path==='consensus'?'consensus':`haplotype ${o.path}`} · PS ${o.phaseSet}`;
    p.push(`<text x="30" y="${y}" font-size="14"><title>${escape(label)}</title>${escape([...label].length>60?[...label].slice(0,57).join('')+'…':label)}</text><line x1="40" x2="910" y1="${y+26}" y2="${y+26}" stroke="#718096" stroke-width="3"/>`);
    for(const tick of x.ticks(6).filter(t=>Number.isInteger(t)&&t<=o.end)) p.push(`<text x="${x(tick)}" y="${y+55}" font-size="11" text-anchor="middle">${tick}</text>`);
    for(const r of a.audit.filter(r=>r.sequence_id===o.title || (r.status==='skipped'&&r.chrom===o.chrom&&r.pos>=o.start&&r.pos<=o.end))) {
      const color=({applied:'#0072b2',ambiguous:'#cc79a7',masked:'#d55e00',reference:'#758595','retained-reference':'#d55e00',skipped:'#758595'})[r.status];
      p.push(`<circle cx="${x(Math.max(o.start,r.pos))}" cy="${y+26}" r="5" fill="${color}" stroke="white"><title>${escape(`${r.chrom}:${r.pos} ${r.ref}>${r.alt}; GT ${r.gt}; ${r.status}${r.reason?'; '+r.reason:''}`)}</title></circle>`);
    }
  }
  p.push(`<text x="30" y="${height-25}" font-size="13">Blue: applied · Purple: ambiguity · Orange: missing call · Grey: reference or skipped</text></g></svg>`);return p.join('');
}
