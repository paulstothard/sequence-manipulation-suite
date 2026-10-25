import { createImageState, layoutImage, parseImageSource } from '../../core/text-table-image.js';
import { makeToolResult, makeTextStream } from '../../core/workflow.js';

export async function runTextTableImage(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: 'Preparing image', progress: 0.2 });
  const state = createImageState(String(input ?? ''), options);
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  const layout = layoutImage(state);
  const source = { input: state.text, options: { inputMode: state.mode, delimiter: state.delimiter, hasHeader: state.hasHeader }, image: state };
  const document = { format: 'sms3-editor-document', version: 1, tool: 'text-table-to-image', source, state: { image: state } };
  const output = JSON.stringify(document);
  context.reportProgress?.({ phase: 'Image ready', progress: 1 });
  return makeToolResult({ output, download: { filename: 'text-table-to-image.sms3.json', mimeType: 'application/json' },
    recordsProcessed: (layout.source.lines ?? layout.source.rows).length, basesProcessed: state.text.length, processedUnitLabel: 'character',
    warnings: parseImageSource(state.text, state.mode, state).warnings,
    streams: { document: makeTextStream(output, 'application/json') }, visual: { textTableImage: source } });
}
