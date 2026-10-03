import { getDataWorkflowOptions } from '../../core/external-resources/workflow-options.js';
export const getDataMetadata = {
  id: 'get-data', name: 'Get Data', category: 'External Resources', tags: ['DNA', 'RNA', 'protein', 'FASTA', 'GenBank', 'GenPept', 'EMBL', 'UniProt', 'search'],
  summary: 'Retrieve public biological records, sequences, regions, structures, or compact summaries.',
  whenToUse: 'Bring a public database record into SMS3 or check its size and description before downloading its sequence.',
  inputType: 'Public accession, database search, or genomic region',
  outputType: 'GenBank; GenPept; EMBL; UniProt flatfile/JSON; FASTA; mmCIF; PDB; Summary report',
  externalResource: true,
  workflow: { enabled: true, inputs: [{ id: 'input', kind: 'text' }], outputs: [{ id: 'primary', kind: 'text', mediaType: 'text/plain', label: 'Retrieved record' }, { id: 'warnings', kind: 'warnings' }] },
  options: getDataWorkflowOptions
};
