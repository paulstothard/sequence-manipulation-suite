import { sendDataWorkflowOptions } from '../../core/external-resources/workflow-options.js';
export const sendDataMetadata = {
  id: 'send-data', name: 'Send Data', category: 'External Resources', tags: ['DNA', 'RNA', 'protein', 'FASTA', 'alignment', 'primer', 'search'],
  summary: 'Prepare data for external sequence searches, genome browsers, protein analysis, alignment, and structure or variant lookup.',
  whenToUse: 'Send selected data to an external analysis service, or open that service with a prepared query.',
  inputType: 'Sequence, FASTA, primers, annotated record, structure, identifier, or region',
  outputType: 'Prepared handoff; FASTA; GenBank; EMBL; PDB; mmCIF; CGView JSON',
  externalResource: true,
  workflow: { enabled: true, inputs: [{ id: 'input', kind: 'text' }, { id: 'sequenceRecords', kind: 'sequence-records' }], outputs: [{ id: 'primary', kind: 'text', mediaType: 'text/plain', label: 'External service handoff' }, { id: 'warnings', kind: 'warnings' }] },
  options: sendDataWorkflowOptions
};
