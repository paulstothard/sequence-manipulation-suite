import { getDataWorkflowOptions } from '../../core/external-resources/workflow-options.js';
import { regionColumns } from '../../core/external-resources/region-common.js';
export const getDataMetadata = {
  id: 'get-data', name: 'Get Data', category: 'External Resources', tags: ['DNA', 'RNA', 'protein', 'FASTA', 'GenBank', 'GenPept', 'EMBL', 'UniProt', 'search'],
  summary: 'Find genes and their sequences, public records, genomic regions, assemblies, or protein structures.',
  whenToUse: 'Find a gene in an organism, choose its transcripts or proteins, or retrieve a public sequence or structure for use in SMS3.',
  inputType: 'Organism and gene name, protein name, public accession, database search, or genomic region',
  outputType: 'GenBank; GenPept; EMBL; UniProt flatfile/JSON; FASTA; mmCIF; PDB; Gene / transcript table; Summary report',
  externalResource: true,
  workflow: { enabled: true, outputFormatOption: 'format', inputs: [{ id: 'input', kind: 'text' }], outputs: [{ id: 'primary', kind: 'text', mediaType: 'text/plain', label: 'Retrieved record', advanced: false }, { id: 'table', kind: 'table', label: 'Gene / transcript table', outputFormat: 'tsv', schema: 'retrieved-region-annotations', columns: regionColumns }, { id: 'warnings', kind: 'warnings' }] },
  options: getDataWorkflowOptions
};
