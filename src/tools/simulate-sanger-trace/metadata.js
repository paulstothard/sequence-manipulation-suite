import { SANGER_SIMULATION_SEPARATOR, SANGER_SIMULATION_LIMITS, simulatedSangerColumns } from '../../core/simulate-sanger-trace.js';

const fragmentPanel = {
  label: 'Fragment', idPrefix: 'fragment',
  dropLabel: 'Drop one plain-text DNA sequence or FASTA records here',
  accept: '.fa,.fasta,.fna,.txt',
  relativeAmount: true
};

export const simulateSangerTraceMetadata = {
  id: 'simulate-sanger-trace', name: 'Simulate Sanger Trace', category: 'Sanger Traces',
  tags: ['DNA', 'FASTA', 'coordinates', 'plot'],
  summary: 'Simulate one chromatogram from one or more DNA templates, including mixed SNP and indel signals.',
  whenToUse: 'Generate reproducible Sanger traces to examine signals from individual DNA templates or mixtures.',
  inputType: 'DNA sequences or FASTA records',
  outputType: 'Trace editor, chromatogram plot, trace JSON, AB1, SCF, base-call table, FASTA/FASTQ, or summary report',
  splitInput: {
    separator: SANGER_SIMULATION_SEPARATOR, allowAdd: true, allowRemove: true,
    addLabel: 'Add fragment', maxPanels: SANGER_SIMULATION_LIMITS.templates, maxPanelsLimitId: 'maxTemplates', repeatFromIndex: 0,
    panels: [{ ...fragmentPanel, id: 'fragment-1', label: 'Fragment 1' }],
    additionalPanelTemplate: fragmentPanel
  },
  runInWorker: true, workerModule: '../tools/simulate-sanger-trace/run.js', workerExport: 'runSimulateSangerTrace',
  showcaseOutputs: [
    { id: 'interactive-trace', label: 'Trace editor', options: { outputFormat: 'interactive-trace' } }
  ],
  workflow: {
    inputs: [{ id: 'input', kind: 'text', mediaType: 'text/plain' }, { id: 'sequenceRecords', kind: 'sequence-records', alphabet: 'dna-rna' }],
    outputs: [
      { id: 'primary', kind: 'text', mediaType: 'text/plain' },
      { id: 'report', kind: 'text', mediaType: 'text/plain', label: 'Summary report' },
      { id: 'traceJson', kind: 'text', mediaType: 'application/json', label: 'Trace JSON' },
      { id: 'traceSvg', kind: 'text', mediaType: 'image/svg+xml', label: 'Chromatogram plot' },
      { id: 'table', kind: 'table', schema: 'simulated-sanger-base-calls', columns: simulatedSangerColumns, label: 'Base-call table' },
      { id: 'fasta', kind: 'text', mediaType: 'text/x-fasta', alphabet: 'dna-rna', label: 'Base-call FASTA' },
      { id: 'fastq', kind: 'text', mediaType: 'text/x-fastq', alphabet: 'dna-rna', label: 'Base-call FASTQ' },
      { id: 'templates', kind: 'sequence-records', alphabet: 'dna-rna', label: 'Template sequences' },
      { id: 'warnings', kind: 'warnings' }
    ]
  },
  options: [
    { type: 'group', label: 'Sequencing', options: [
      { id: 'direction', type: 'radio', label: 'Read from', defaultValue: 'forward', choices: [
        { value: 'forward', label: '5′ end — as supplied' },
        { value: 'reverse-complement', label: '3′ end — opposite strand' }
      ], help: 'Each template starts at read position 1 from the selected end. Opposite-strand reads use the reverse complement of each complete template. Insertions and deletions retain their shifts in the pooled trace.' }
    ] },
    { type: 'group', id: 'optionalFlanks', label: 'Optional flanks', collapsible: true, collapsed: true,
      help: 'Adds random bases and lower-quality signals before and after the pooled read. These use Random seed under Signal; input templates are unchanged.', options: [
      { id: 'prefixBases', type: 'number', label: 'Bases before the read', defaultValue: 0, min: 0, max: SANGER_SIMULATION_LIMITS.flankBases, step: 1 },
      { id: 'suffixBases', type: 'number', label: 'Bases after the read', defaultValue: 0, min: 0, max: SANGER_SIMULATION_LIMITS.flankBases, step: 1 },
      { id: 'flankIntensity', type: 'number', label: 'Flank signal (%)', defaultValue: 25, min: 1, max: 100, step: 1, help: 'Relative to the main read. Added random flanks have broader, mixed peaks and low synthetic quality; the trailing flank begins after the longest template.' }
    ] },
    { type: 'group', id: 'signal', label: 'Signal', collapsible: true, collapsed: true, options: [
      { id: 'signalModel', type: 'select', label: 'Signal model', defaultValue: 'measured', choices: [{ value: 'measured', label: 'Measured profile' }, { value: 'uniform', label: 'Uniform peaks' }], help: 'Measured profile varies peak widths, positions, heights, and smooth background using ranges observed in public AB1 traces. Uniform peaks share a fixed width and center. Both models produce synthetic signals.' },
      { id: 'noise', type: 'number', label: 'Background noise (%)', defaultValue: 1, min: 0, max: 25, step: 0.1, help: 'Background signal relative to a full-strength peak. Measured profile uses this as the approximate average of smooth background variation; Uniform peaks uses it as the maximum of independent sample noise. Uses Random seed below.' },
      { id: 'peakVariation', type: 'number', label: 'Peak-height variation (%)', defaultValue: 25, min: 0, max: 50, step: 1, help: 'Measured profile uses this as the approximate relative standard deviation of channel peak heights. Uniform peaks varies each template contribution within ± this percentage. Zero keeps heights constant; Measured profile still varies widths and positions. Uses Random seed below.' },
      { id: 'seed', type: 'text', label: 'Random seed', defaultValue: '', placeholder: 'Random each run', help: 'Controls background noise, peak heights, widths and positions, and the bases and signals in optional flanks. Input template sequences are preserved. Leave blank for a new seed each run. Reuse the same seed, inputs, amounts and settings to reproduce the trace. Recorded in Summary report and Trace JSON.' },
      { id: 'mixedPeakThreshold', type: 'number', label: 'Mixed-base threshold (%)', defaultValue: 20, min: 1, max: 100, step: 1, help: 'Call an IUPAC mixed base when another channel reaches this percentage of the strongest channel. Signal is retained below this calling threshold.' }
    ] },
    { type: 'group', label: 'Output format', options: [
      { id: 'outputFormat', type: 'select', label: 'Output format', defaultValue: 'interactive-trace', choices: [
        { value: 'interactive-trace', label: 'Trace editor' },
        { value: 'svg-trace', label: 'Chromatogram plot' },
        { value: 'trace-json', label: 'Trace JSON' },
        { value: 'ab1', label: 'AB1' },
        { value: 'scf', label: 'SCF' },
        { value: 'tsv', label: 'Base-call table' },
        { value: 'fasta', label: 'Base-call FASTA' },
        { value: 'fastq', label: 'Base-call FASTQ' },
        { value: 'template-fasta', label: 'Template FASTA' },
        { value: 'report', label: 'Summary report' }
      ] }
    ] },
    { type: 'group', id: 'limits', label: 'Limits', collapsible: true, collapsed: true, options: [
      { id: 'maxTemplates', type: 'limit-value', label: 'Templates', value: SANGER_SIMULATION_LIMITS.templates, help: 'Rejects additional FASTA records across all fragments. Disabling also permits more fragment input panels.' },
      { id: 'maxTemplateBases', type: 'limit-value', label: 'Bases per template', value: SANGER_SIMULATION_LIMITS.templateBases, help: 'Rejects longer templates without truncation. Separate figure and AB1 limits still apply.' },
      { id: 'maxFlankBases', type: 'limit-value', label: 'Bases per flank', value: SANGER_SIMULATION_LIMITS.flankBases, help: 'Maximum for each added flank. Disabling permits larger values in Bases before the read and Bases after the read.' },
      { id: 'maxVisualReadPositions', type: 'limit-value', label: 'Trace editor and plot read positions', value: SANGER_SIMULATION_LIMITS.visualReadPositions, help: 'Fixed display limit, including flanks. Longer reads require SCF, Trace JSON, or sequence output.' },
      { id: 'maxAb1ReadPositions', type: 'limit-value', label: 'AB1 read positions', value: SANGER_SIMULATION_LIMITS.ab1ReadPositions, help: 'Fixed limit for the AB1 peak-position encoding, including flanks. Longer AB1 reads are rejected; use SCF or Trace JSON.' },
      { id: 'maxInputCharacters', type: 'limit-value', label: 'Input characters', value: SANGER_SIMULATION_LIMITS.inputCharacters, help: 'Rejects larger combined input before parsing.' }
    ] },
    { id: 'methodNote', type: 'note', text: 'Illustrative simulation using weighted peaks at read positions. Measured profile uses signal ranges from six public AB1 traces. Indels retain their downstream shift. Quality scores use an uncalibrated synthetic confidence model. IUPAC template bases split their contribution across the represented channels.' },
    { id: 'references', type: 'note', text: 'References:\n\nSignal profile: Biopython 1.86 and sangerseqR 1.48.0 public trace examples.\n\nMixed Sanger traces: Thermo Fisher Scientific troubleshooting documentation.\n\nSCF chromatogram format: Staden Package documentation.\n\nAB1 chromatogram format: Applied Biosystems ABIF file format specification.' }
  ]
};
