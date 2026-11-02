import { formatFastaRecord } from './fasta.js';
const esc = value => encodeURIComponent(String(value ?? ''));
const attr = fields => Object.entries(fields).map(([k,v])=>`${k}=${esc(v)}`).join(';');

export function makePcrAmpliconGff(result) {
  const lines=['##gff-version 3', '# Selected PCR sequences with primer annealing regions and tails. Template annotations are projected as sequence_feature intervals; their function, CDS phase and translation are not revalidated after primer changes or clipping.'];
  const fasta=[];
  for(const [index,row] of result.rows.entries()) {
    if(!row.product_sequence){lines.push(`# Omitted product ${row.product}: ${row.sequence_status}`);continue;}
    const id=`amplicon-${index+1}`, sequence=row.product_sequence;
    const template=result.records.find(r=>r.id===row.template_id);
    const f=result.primers.find(p=>p.id===row.forward_primer_id), r=result.primers.find(p=>p.id===row.reverse_primer_id);
    const incorporated=row.sequence_mode==='primer-incorporated';
    const leftTail=incorporated?f.tail_sequence.length:0, rightTail=incorporated?r.tail_sequence.length:0;
    const emit=(type,start,end,strand,fields)=>lines.push([id,'SMS3',type,start,end,'.',strand,'.',attr(fields)].join('\t'));
    lines.push(`##sequence-region ${id} 1 ${sequence.length}`);
    emit('region',1,sequence.length,'+', {ID:id,Name:row.template,template_id:row.template_id,template_start:row.forward_start,template_end:row.reverse_end,template_topology:row.topology,sequence_mode:row.sequence_mode,sequence_status:row.sequence_status,search_status:row.search_status});
    emit('primer_bind',leftTail+1,leftTail+f.sequence.length,'+',{ID:`${id}.forward`,Name:f.title,primer_id:f.id,template_mismatches:row.forward_mismatches});
    emit('primer_bind',leftTail+row.template_span_length-r.sequence.length+1,leftTail+row.template_span_length,'-',{ID:`${id}.reverse`,Name:r.title,primer_id:r.id,template_mismatches:row.reverse_mismatches});
    if(leftTail) emit('sequence_feature',1,leftTail,'+',{ID:`${id}.forward_tail`,feature_role:'5-prime primer tail',primer_id:f.id});
    if(rightTail) emit('sequence_feature',sequence.length-rightTail+1,sequence.length,'-',{ID:`${id}.reverse_tail`,feature_role:'5-prime primer tail',primer_id:r.id});
    const offset=row.forward_start-1, stop=offset+row.template_span_length, n=template.sequence.length;
    for(const [fi,feature] of (template.features??[]).entries()) {
      if(feature.feature==='source') continue;
      const loc=feature.parsedLocation;
      if(!loc?.supported){lines.push(`# ${id}: unsupported template annotation ${fi+1} omitted`);continue;}
      const ranges=loc.ranges?.length?loc.ranges:[loc];
      for(const [pi,part] of ranges.entries()) {
        for(let cycle=0;cycle<Math.ceil(stop/n);cycle++) {
          const a=part.start-1+cycle*n,b=part.end+cycle*n;
          const lo=Math.max(offset,a), hi=Math.min(stop,b);
          if(lo>=hi) continue;
          emit('sequence_feature',leftTail+lo-offset+1,leftTail+hi-offset,part.strand??loc.strand??'.',{
            ID:`${id}.feature${fi+1}.part${pi+1}.copy${cycle+1}`,Name:feature.gene||feature.locus_tag||feature.product||feature.feature,
            original_type:feature.feature,original_location:feature.location,original_part:`${part.start}-${part.end}`,clipped:lo!==a||hi!==b,
            interpretation:'coordinate projection; function and translation not revalidated'
          });
        }
      }
    }
    fasta.push(formatFastaRecord(id,sequence,60).trimEnd());
  }
  if(fasta.length) lines.push('##FASTA',...fasta);
  return lines.join('\n')+'\n';
}
