import { parseAlignedSequences, alignedSequencesFasta } from '../../core/aligned-sequences.js';
import { makeAlignedSequenceDocument, validateAlignedSequenceDocument } from '../../core/aligned-sequence-viewer.js';
import { makeToolResult, makeTextStream } from '../../core/workflow.js';

export function alignedSequenceViewerStream(model, input = alignedSequencesFasta(model)) {
  return makeTextStream(JSON.stringify(makeAlignedSequenceDocument(model,input)), 'application/json');
}
export async function runAlignedSequenceViewer(input, options = {}, context = {}) {
  let document;
  if (String(input ?? '').trimStart().startsWith('{')) {
    document = JSON.parse(input);
    if(document.format !== 'sms3-editor-document' || document.version !== 1 || document.tool !== 'aligned-sequence-viewer') throw new Error('Provide a current Aligned Sequence Viewer document.');
    validateAlignedSequenceDocument(document);
  } else {
    const model = await parseAlignedSequences(input,options,context);
    document = makeAlignedSequenceDocument(model,String(input ?? ''));
  }
  const model = document.source.model;
  const output = JSON.stringify(document);
  context.throwIfCancelled?.();
  context.reportProgress?.({phase:'Alignment ready',progress:1});
  return makeToolResult({output,optionsUsed:{alphabet:model.alphabet},download:{filename:'aligned-sequence-viewer.sms3.json',mimeType:'application/json'},
    recordsProcessed:model.records.length,basesProcessed:model.length*model.records.length,processedUnitLabel:'alignment cell',
    streams:{alignmentDocument:makeTextStream(output,'application/json')},visual:{alignedSequence:document.source,editorDocument:document}});
}
