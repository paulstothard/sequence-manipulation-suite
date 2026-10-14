import { workflowSequenceRecordsToFasta } from './workflow-sequence-input.js';

export function workflowInputDisplayText(step) {
  if (step?.stream?.kind === 'sequence-records') return workflowSequenceRecordsToFasta(step.stream);
  if (step?.stream?.kind === 'text') return step.stream.text ?? '';
  return step?.text ?? '';
}

// Only follow a whole-record extraction, which keeps the same sequences/features.
// Never offer input features after a coordinate-changing or sequence-generating step.
export function findWorkflowFeatureInput(workflow, step) {
  const visited = new Set();
  let consumer = step;
  while (consumer && !visited.has(consumer.id)) {
    visited.add(consumer.id);
    const source = consumer.input
      ? workflow.steps.find(item => item.id === consumer.input.from)
      : workflow.steps[workflow.steps.findIndex(item => item.id === consumer.id) - 1];
    if (source?.type === 'input') return source;
    const stream = consumer.input?.stream && consumer.input.stream !== 'primary'
      ? consumer.input.stream : source?.selectStream;
    if (source?.toolId !== 'annotated-dna-record-extractor' || stream !== 'wholeSequenceRecords') return null;
    consumer = source;
  }
  return null;
}
