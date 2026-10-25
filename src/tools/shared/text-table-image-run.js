import { exportDelimitedTable } from '../../core/table.js';
import { createImageState, layoutImage, parseImageSource, imageToolId } from '../../core/text-table-image.js';
import { makeToolResult, makeTextStream } from '../../core/workflow.js';

export async function runTextTableImage(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: 'Preparing image', progress: 0.2 });
  const structuredTable = options.inputMode === 'table' && input?.kind === 'table';
  const text = structuredTable ? exportDelimitedTable(input.columns, input.rows) : String(input ?? '');
  const state = createImageState(text, structuredTable ? { ...options, delimiter: 'tab', hasHeader: true } : options);
  const tool = imageToolId(state.mode);
  await context.yieldIfNeeded?.();
  context.throwIfCancelled?.();
  const layout = layoutImage(state);
  const source = { input: state.text, options: { inputMode: state.mode, delimiter: state.delimiter, hasHeader: state.hasHeader }, image: state };
  const document = { format: 'sms3-editor-document', version: 1, tool, source, state: { image: state } };
  const output = JSON.stringify(document);
  context.reportProgress?.({ phase: 'Image ready', progress: 1 });
  return makeToolResult({ output, download: { filename: `${tool}.sms3.json`, mimeType: 'application/json' },
    recordsProcessed: (layout.source.lines ?? layout.source.rows).length, basesProcessed: state.text.length, processedUnitLabel: 'character',
    warnings: parseImageSource(state.text, state.mode, state).warnings,
    streams: { document: makeTextStream(output, 'application/json') }, visual: { textTableImage: source } });
}
