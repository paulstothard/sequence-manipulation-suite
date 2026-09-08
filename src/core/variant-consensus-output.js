import '../vendor/d3/d3.min.js';
import { checkpoint } from './variant-consensus.js';
export const CONSENSUS_TABLE_CHARACTERS = 20_000_000;
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
