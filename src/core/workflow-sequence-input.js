import { formatFastaRecord, parseSequenceInput } from './fasta.js';

// Internal, structured-clone-safe companion to the ordinary FASTA tool input.
// Only consumers declaring workflow.sequenceRecordInput receive this option.
export function readWorkflowSequenceRecords(input, options = {}) {
  const stream = options.workflowSequenceRecords;
  if (stream === undefined) return null;
  if (stream?.kind !== 'sequence-records' || !Array.isArray(stream.records)) {
    throw new Error('Invalid workflow sequence records.');
  }
  const sequences = parseSequenceInput(input, 'sequence');
  if (sequences.length !== stream.records.length || sequences.some((record, index) =>
    record.title !== (stream.records[index].title ?? 'sequence') || record.sequence !== (stream.records[index].sequence ?? ''))) {
    throw new Error('Workflow annotations do not match the input sequences. Run the workflow again with matching records.');
  }
  return stream.records;
}

export function workflowSequenceRecordsToFasta(stream) {
  return stream.records.map(record => formatFastaRecord(record.title ?? 'sequence', record.sequence ?? '', 60)).join('\n');
}

// Capture identity before workflow filtering, sorting, splitting or gathering.
// This does not change coordinates or permit a stale feature to match new sequence.
export function identifyWorkflowSequenceRecords(stream) {
  if (stream?.kind !== 'sequence-records') return stream;
  return { ...stream, records: stream.records.map((record, index) => record.features?.length
    ? { ...record, featureTargetRecordIndex: record.featureTargetRecordIndex ?? index }
    : record) };
}
