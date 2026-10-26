export const geneViewerMetadata = {
  id: 'gene-viewer', name: 'Gene Viewer', category: 'Viewers & Figures',
  tags: ['DNA', 'RNA', 'GenBank', 'annotation', 'coordinates', 'search'],
  summary: 'Find a gene and explore its genomic sequence, transcripts, coding regions, and available NCBI annotations.',
  whenToUse: 'Inspect a known gene, compare its annotated transcripts, or examine its surrounding sequence.',
  inputType: 'Organism and gene symbol, name, synonym, or NCBI Gene ID',
  outputType: 'Interactive gene viewer',
  externalResource: true,
  externalProcessingNote: 'Find genes sends the organism and query to NCBI. Select gene loads its available region settings. View region retrieves public sequence and annotation records; the viewer processes them locally.',
  runInWorker: true, workerModule: '../tools/gene-viewer/run.js', workerExport: 'runGeneViewer',
  workflow: {
    enabled: false,
    reason: 'Choose a gene and assembly interactively on the Gene Viewer page.',
    inputs: [{ id: 'input', kind: 'text', mediaType: 'text/plain' }],
    outputs: [
      { id: 'primary', kind: 'text', mediaType: 'application/json' },
      { id: 'viewer', kind: 'viewer', viewerType: 'dna-sequence-viewer', label: 'Interactive gene viewer' },
      { id: 'warnings', kind: 'warnings' }
    ]
  },
  options: [
    { type: 'group', label: 'Output format', options: [
      { id: 'outputFormat', type: 'radio', label: 'Output format', defaultValue: 'interactive-viewer', choices: [{ value: 'interactive-viewer', label: 'Interactive gene viewer' }] }
    ] },
    { type: 'group', label: 'Limits', collapsible: true, collapsed: true, options: [
      { type: 'limit-value', label: 'Genomic interval', value: '1,000,000 bases', detail: 'Larger regions are refused.' },
      { type: 'limit-value', label: 'Retrieved record', value: '25 MiB', detail: 'Larger responses are refused.' },
      { type: 'limit-value', label: 'Transcript metadata', value: 1000, detail: 'Larger transcript sets are refused.' }
    ] }
  ]
};
