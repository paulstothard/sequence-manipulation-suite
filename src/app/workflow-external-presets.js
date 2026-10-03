export const externalWorkflowPresets = [
  {
    id: 'retrieve-genbank-review',
    name: 'Retrieve GenBank and review features',
    summary: 'Enter one NCBI nucleotide accession to retrieve its complete GenBank record, calculate sequence statistics, and inspect an annotated circular view. The example is the 5,386-base phiX174 genome (NC_001422.1).',
    example: 'NC_001422.1',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'retrieve', type: 'tool', toolId: 'get-data', options: { retrieval: 'nucleotide:ncbi', format: 'gb' } },
      { id: 'sequence', type: 'tool', toolId: 'annotated-dna-record-extractor', selectStream: 'wholeSequenceRecords', options: { outputFormat: 'whole-fasta' } },
      { id: 'statistics', type: 'tool', toolId: 'sequence-stats-dna-rna', selectStream: 'table', options: { outputFormat: 'tsv' } },
      { id: 'features', type: 'tool', toolId: 'annotated-dna-record-extractor', input: { from: 'retrieve' }, selectStream: 'viewer', options: { outputFormat: 'interactive-circular-viewer' } }
    ] }
  },
  {
    id: 'retrieve-protein-blast',
    name: 'Retrieve protein and prepare BLAST',
    summary: 'Enter one NCBI protein accession to retrieve its complete GenPept record, extract the protein, review its statistics, and prepare a BLASTP search. Use Open in NCBI BLAST in the result to review and submit the search at NCBI. The example is human p53 (NP_000537.3).',
    example: 'NP_000537.3',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'retrieve', type: 'tool', toolId: 'get-data', options: { retrieval: 'protein:ncbi', format: 'gp' } },
      { id: 'protein', type: 'tool', toolId: 'annotated-protein-record-extractor', selectStream: 'proteinRecords', options: { outputFormat: 'protein-fasta' } },
      { id: 'statistics', type: 'tool', toolId: 'sequence-stats-protein', selectStream: 'table', options: { outputFormat: 'tsv' } },
      { id: 'blast', type: 'tool', toolId: 'send-data', input: { from: 'protein', stream: 'proteinRecords' }, options: { destination: 'similar:blast', program: 'blastp' } }
    ] }
  },
  {
    id: 'translate-protein-blast',
    name: 'Translate DNA and prepare BLAST',
    summary: 'Translate one coding DNA sequence in forward frame 1 with the standard genetic code, then prepare a BLASTP search for its protein. The example is the human HBB coding sequence from NM_000518.5. Open the prepared search from the result to continue at NCBI.',
    exampleId: 'human-hbb-cds',
    workflow: { steps: [
      { id: 'input', type: 'input', text: '' },
      { id: 'translate', type: 'tool', toolId: 'translate', selectStream: 'proteinRecords', options: { frame: '1', geneticCode: '1', outputFormat: 'fasta' } },
      { id: 'blast', type: 'tool', toolId: 'send-data', options: { destination: 'similar:blast', program: 'blastp' } }
    ] }
  }
];
