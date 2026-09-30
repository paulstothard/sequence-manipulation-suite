import { SANGER_SESSION_SEPARATOR } from '../../core/sanger-trace.js';

export const sangerChromatogramPlotMetadata = {
  id: 'sanger-chromatogram-plot', name: 'Sanger Chromatogram Plot', category: 'Sanger Traces',
  tags: ['DNA', 'FASTA', 'coordinates', 'plot'],
  summary: 'Plot Sanger chromatograms with base calls, quality scores, and optional translations.',
  whenToUse: 'Create a readable chromatogram figure for inspecting or sharing one or more Sanger traces.',
  inputType: 'Sanger chromatogram traces or base-call sequences', outputType: 'Chromatogram plot',
  sangerTraceTask: 'edit',
  splitInput: { separator: SANGER_SESSION_SEPARATOR, customRenderer: 'sanger-trace-workspace', panels: [
    { id: 'trace-set', label: 'Trace', dropLabel: 'Drop AB1, SCF, Trace JSON, or base-call sequence here', accept: '.ab1,.abi,.abif,.scf,.json,.txt,.fa,.fasta' }
  ] },
  runInWorker: true, workerModule: '../tools/sanger-chromatogram-plot/run.js', workerExport: 'runSangerChromatogramPlot',
  showcaseOutputs: [{id: 'chromatogram-plot', label: 'Chromatogram plot', options: {}}],
  workflow: {
    inputs: [{id: 'input', kind: 'text', mediaType: 'text/plain'}],
    outputs: [
      {id: 'primary', kind: 'text', mediaType: 'image/svg+xml'},
      {id: 'traceSvg', kind: 'text', mediaType: 'image/svg+xml', label: 'Chromatogram plot'},
      {id: 'warnings', kind: 'warnings'}
    ]
  },
  options: [{type: 'group', id: 'limits', label: 'Limits', collapsible: true, collapsed: true, options: [
    {id: 'maxPlotTraces', type: 'limit-value', label: 'Traces per figure', value: 20, help: 'Fixed figure capacity. Split larger trace sets into separate figures.'},
    {id: 'maxPlotBaseCalls', type: 'limit-value', label: 'Base calls per figure', value: 3000, help: 'Fixed figure capacity across all traces. Larger figures are rejected.'},
    {id: 'maxPlotSamples', type: 'limit-value', label: 'Signal measurements per figure', value: 800000, help: 'Fixed figure capacity across all A/C/G/T curves. Larger figures are rejected.'},
    {id: 'maxPlotInputCharacters', type: 'limit-value', label: 'Input characters', value: 33554432, help: 'Larger input is rejected before parsing.'}
  ]}]
};
