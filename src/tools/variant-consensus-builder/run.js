import { loadConsensusInput } from '../../core/variant-consensus-input.js';
import { buildConsensus } from '../../core/variant-consensus.js';
import { consensusAuditColumns,consensusCoordinateColumns,makeConsensusViewerData,renderConsensusMap,checkConsensusTableSize } from '../../core/variant-consensus-output.js';
import { makeDnaViewerStream } from '../../core/dna-viewer-data.js';
import { makeToolResult,makeTextStream,makeTableStream } from '../../core/workflow.js';
import { exportDelimitedTable } from '../../core/table.js';
export async function runVariantConsensus(input,options={},context={}) {
  const loaded=await loadConsensusInput(input,options,context);
  const a=await buildConsensus(loaded.references,loaded.parsed,loaded.settings,context);
  a.warnings.unshift(...loaded.warnings);
  const format=a.settings.outputFormat, streams={};let output,extension,mimeType,visual;
  if(format==='fasta') {
    output=a.outputs.map(r=>`>${r.title}\n${r.sequence.match(/.{1,60}/g)?.join('\n')??''}`).join('\n')+'\n';
    extension='fasta';mimeType='text/x-fasta';streams.fasta=makeTextStream(output,mimeType);
    streams.sequenceRecords={kind:'sequence-records',alphabet:'dna-rna',records:a.outputs.map(({title,sequence})=>({title,sequence}))};
  } else if(format==='viewer') {
    const viewer=makeConsensusViewerData(a);
    output=JSON.stringify(viewer,null,2);extension='json';mimeType='application/json';visual={viewer};streams.viewer=makeDnaViewerStream(viewer);
  } else if(format==='audit'||format==='coordinates') {
    const columns=format==='audit'?consensusAuditColumns:consensusCoordinateColumns,rows=a[format];
    await checkConsensusTableSize(columns, rows, context);
    output=exportDelimitedTable(columns,rows);extension='tsv';mimeType='text/tab-separated-values';streams[format]=makeTableStream(columns,rows,`variant-consensus-${format}`);
  } else if(format==='map') {
    output=renderConsensusMap(a);extension='svg';mimeType='image/svg+xml';visual={svg:output,pngDownload:true};streams.map=makeTextStream(output,mimeType);
  } else {
    output=['Variant Consensus Builder','',`Sample: ${a.sample}`,`Sequence interpretation: ${a.settings.mode}`,`Phase handling: ${a.settings.phasePolicy}`,`Missing calls: ${a.settings.missing}`,`FILTER policy: ${a.settings.filter}`,`Unsupported selected alleles: ${a.settings.unsupported}`,`Records in scope: ${a.variantCount}`,`Output sequences: ${a.outputs.length}`,`Output bases: ${a.totalBases}`,`Edits across output sequences: ${a.totalEdits}`,'',...a.outputs.map(o=>`${o.title}\n  ${o.length} bases; ${o.edits} edits`),'','Notes',...a.warnings,'','Coordinates: audit VCF positions are 1-based. Coordinate-map intervals are 0-based, end-exclusive on the original reference and each output. Insertions have an empty reference interval; deletions have an empty output interval. Replacement interiors are not claimed to map base-for-base.','Sequence construction: SMS3 strict GT/PS consensus; no phase inference or new variant calling.','References:','VCF specification: https://samtools.github.io/hts-specs/VCFv4.5.pdf','Reference implementation: BCFtools consensus documentation. https://samtools.github.io/bcftools/bcftools.html#consensus',''].join('\n');
    extension='txt';mimeType='text/plain';streams.report=makeTextStream(output);
  }
  context.throwIfCancelled?.();context.reportProgress?.({phase:'complete',progress:1});
  return makeToolResult({output,visual,streams,warnings:a.warnings,recordsProcessed:a.variantCount,basesProcessed:a.totalBases,optionsUsed:{...a.settings,sample:a.sample},download:{filename:`variant-consensus-${format}.${extension}`,mimeType:`${mimeType};charset=utf-8`}});
}
