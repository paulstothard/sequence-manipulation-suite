import { prepareSangerTraceCollection, splitSangerSessionInput } from '../../core/sanger-trace.js';
import { makeSangerPlotModel, renderSangerPlot } from '../../core/sanger-plot.js';
import { makeTextStream, makeToolResult } from '../../core/workflow.js';

export async function runSangerChromatogramPlot(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  context.reportProgress?.({phase: 'parsing-traces', progress: 0.1});
  const text = String(input ?? '');
  if (text.length > 33554432) throw new Error('Chromatogram plot input exceeds 33,554,432 characters.');
  if ((splitSangerSessionInput(text)?.traces.filter(part => String(part).trim()).length ?? 1) > 20)
    throw new Error('A chromatogram figure supports at most 20 traces.');
  await context.yieldIfNeeded?.();
  const collection = prepareSangerTraceCollection(text, {task: 'edit', trimMethod: 'manual', maxSessionTraces: 20, maxTraceBaseCalls: 3000, maxTraceSamples: 200000});
  const calls = collection.traces.reduce((sum, trace) => sum + trace.view.baseCalls.length, 0);
  const samples = collection.traces.reduce((sum, trace) => sum + Object.values(trace.view.traces).reduce((n, values) => n + values.length, 0), 0);
  if (calls > 3000) throw new Error('A chromatogram figure supports at most 3,000 base calls.');
  if (samples > 800000) throw new Error('A chromatogram figure supports at most 800,000 signal measurements across all channels.');
  context.throwIfCancelled?.();
  context.reportProgress?.({phase: 'drawing-chromatograms', progress: 0.7});
  await context.yieldIfNeeded?.();
  const sangerPlot = makeSangerPlotModel('trace', {collection}, {showForwardTranslations:true, showReverseTranslations:true});
  const svg = renderSangerPlot(sangerPlot);
  context.throwIfCancelled?.();
  return makeToolResult({output: svg, download: {filename: 'sanger-chromatogram.svg', mimeType: 'image/svg+xml;charset=utf-8'},
    warnings: collection.warnings, recordsProcessed: collection.traces.length, basesProcessed: calls, processedUnitLabel: 'base call',
    streams: {traceSvg: makeTextStream(svg, 'image/svg+xml')}, visual: {svg, sangerPlot}});
}
