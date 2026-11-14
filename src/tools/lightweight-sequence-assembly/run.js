import { normalizeAssemblyOptions, ASSEMBLY_LIMITS as limits } from "../../core/lightweight-assembly-options.js";
import {
  assembleLightweightSequencesAsync,
  lightweightAssemblyColumns,
  makeAssemblyFasta,
  makeAssemblyReport,
  makeAssemblyTextMap,
  makeAssemblyTsv
} from "../../core/lightweight-sequence-assembly.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";


export async function runLightweightSequenceAssembly(input, options = {}, context = {}) {
  options = normalizeAssemblyOptions({...options, tryReverseComplement: true});
  context.reportProgress?.({ phase: "assembling", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();

  const { outputFormat } = options;
  const selected = {report:'report',fasta:'fasta','text-map':'textMap',tsv:'table','sequence-records':'sequenceRecords'}[outputFormat];
  const requested = new Set([selected, ...(options.requestedAssemblyOutputs ?? [])]);
  const result = await assembleLightweightSequencesAsync(input, options, {...context, includePlacementRows:requested.has('table')});
  const streams = {};
  if(requested.has('table'))streams.table=makeTableStream(lightweightAssemblyColumns,result.placements,'lightweight-sequence-assembly');
  if(requested.has('report'))streams.report=makeTextStream(makeAssemblyReport(result),'text/plain');
  if(requested.has('fasta'))streams.fasta=makeTextStream(makeAssemblyFasta(result,options.lineWidth),'text/x-fasta');
  if(requested.has('textMap'))streams.textMap=makeTextStream(makeAssemblyTextMap(result,options.lineWidth),'text/plain',{format:'assembly',alphabet:'dna-rna'});
  if(requested.has('sequenceRecords'))streams.sequenceRecords={
    kind:'sequence-records',schema:'assembled-contigs',alphabet:'dna-rna',
    records:result.contigs.map(contig=>({title:`${contig.title} reads=${contig.reads.length}`,sequence:contig.sequence}))
  };
  const output = selected==='table' ? makeAssemblyTsv(result.placements) : (streams[selected].text ?? '');

  context.throwIfCancelled?.();
  if(Object.values(streams).reduce((sum,stream)=>sum+(stream.text?.length??0),selected==='table'?output.length:0)>limits.outputCharacters)throw new Error(`Assembly output exceeds the fixed ${limits.outputCharacters.toLocaleString()}-character budget. Choose a smaller output or reduce the input.`);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return makeToolResult({
    output,
    sequenceSearch: outputFormat === "text-map" ? { format: "assembly", alphabet: "dna-rna" } : undefined,
    download: {
      filename: outputFormat === "fasta"
        ? "lightweight-assembly.fasta"
        : outputFormat === "text-map"
          ? "lightweight-assembly-text-map.txt"
        : outputFormat === "tsv"
          ? "lightweight-assembly-overlaps.tsv"
          : "lightweight-assembly.txt",
      mimeType: outputFormat === "fasta"
        ? "text/x-fasta;charset=utf-8"
        : outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings: result.warnings,
    notes: result.notes,
    recordsProcessed: result.readsProcessed,
    basesProcessed: result.inputBasesProcessed,
    charactersRemoved: result.charactersRemoved,
    streams,
    optionsUsed: options
  });
}
