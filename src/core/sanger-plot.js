import { makeSangerAssemblyTraceMapSvg, makeSangerReferenceTraceMapSvg, makeSangerCollectionTraceSvg } from './sanger-trace.js';

export function composeSangerSvg(figures) {
  let y = 0;
  const width = 1240, parts = [];
  for (const svg of figures) {
    const bounds = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!bounds) throw new Error('A Sanger figure is missing its bounds.');
    const height = width * Number(bounds[2]) / Number(bounds[1]);
    parts.push(svg.replace(/^<svg\b[^>]*>/, root => root.replace(/ width="[^"]+"/, ` width="${width}"`).replace(/ height="[^"]+"/, ` height="${height}"`).replace('<svg ', `<svg x="0" y="${y}" `)));
    y += height + 20;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y}" viewBox="0 0 ${width} ${y}" role="img" aria-label="Sanger sequences and source evidence">${parts.join('')}</svg>`;
}

function plotTrace(result) {
  const c = result.candidate;
  return { view: result.view, sequence: result.sequence, options: result.options,
    ...(c ? { candidate: { id:c.id, label:c.label, kind:c.kind, sourceTrace:c.sourceTrace,
      sourceName:c.sourceName, orientation:c.orientation, phase:c.phase } } : {}) };
}

// Keep only the already-calculated display data. Display changes never rerun
// assembly, reference placement, resolving, trimming or simulation.
export function makeSangerPlotModel(kind, data, options = {}) {
  const collection = { traces: data.collection.traces.map(plotTrace) };
  return { kind, options: { showForwardTranslations:options.showForwardTranslations === true,
    showReverseTranslations:options.showReverseTranslations === true,
    geneticCode:String(options.geneticCode ?? '1'), lowQualityThreshold:Number(options.lowQualityThreshold ?? 20),
    showSourceTraces:options.showSourceTraces === true },
    session: { collection, reference:data.reference, referenceAlignments:data.referenceAlignments,
      assembly:data.assembly, ...(data.resolution ? { resolution:{mode:data.resolution.mode},
        sourceCollection:{traces:data.sourceCollection.traces.map(plotTrace)} } : {}) } };
}

export function renderSangerPlot(model, display = model.options) {
  const {kind, session} = model;
  if (kind === 'trace') return makeSangerCollectionTraceSvg({traces:session.collection.traces.map(trace => ({...trace,
    options:{...trace.options,...display}}))}, {basesPerRow:56});
  const render = kind === 'assembly' ? makeSangerAssemblyTraceMapSvg : makeSangerReferenceTraceMapSvg;
  const svg = render(session, display);
  if (!session.resolution || !display.showSourceTraces) return svg;
  const sources = {traces:session.sourceCollection.traces.map((source,i)=>({...source,
    view:{...source.view,record:`Original Trace ${i+1}: ${source.view.record}`}}))};
  return composeSangerSvg([svg, makeSangerCollectionTraceSvg(sources, {
    width:1240, basesPerRow:56, originalCoordinates:true, title:'Source chromatograms',
    summary:'Original clipped signals, shown once per trace. Base numbers refer to the input trace; mixed peaks are preserved.'
  })]);
}
