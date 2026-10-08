import { dataTypes, tasks, sources, formatsFor, getFields, sendFields } from './catalog.js';

const modes = items => items.flatMap(item => item.sources.map(source => ({
  value: `${item.id}:${source}`, label: `${item.label} — ${sources[source]}`, operation: item.id, source
})));
const regionModes = ['ncbi', 'ensembl', 'ucsc'].flatMap(source => [
  ['region', 'Genomic DNA', 'nucleotide', 'genomic'], ['region-cdna', 'Transcripts (cDNA)', 'nucleotide', 'cdna'],
  ['region-cds', 'Coding sequences (CDS)', 'nucleotide', 'cds'], ['region-protein', 'Proteins', 'protein', 'protein']
].map(([id, label, operation, sequenceType]) => ({ value: `${id}:${source}`, label: `${label} by genomic region — ${sources[source]}`, operation, source, options: { queryMode: 'region', ...(operation === 'nucleotide' ? { sequenceType } : {}) } })));
const retrieveModes = [...modes(dataTypes.filter(item => !['gene', 'assembly'].includes(item.id))).filter(mode => mode.source !== 'ucsc' || mode.operation === 'annotations'), ...regionModes], sendModes = modes(tasks);

// Keep workflow controls in sync with the standalone tools. The incoming step
// supplies the accession, region, sequence, template, structure, or variant.
function auxiliaryOptions(choices, selector, fieldsFor, excluded) {
  const grouped = new Map();
  for (const mode of choices) {
    for (const field of fieldsFor(mode.operation, mode.source, mode.options)) {
      if (excluded.includes(field.id)) continue;
      if (mode.options?.sequenceType && field.id === 'sequenceType') continue;
      if (!grouped.has(field.id)) grouped.set(field.id, { ...field, choices: [], modes: [] });
      const option = grouped.get(field.id);
      option.modes.push(mode.value);
      if (field.type === 'select') option.choices.push(...field.choices.map(choice => ({ ...choice, dependsOnValue: mode.value })));
    }
  }
  return [...grouped.values()].map(({ example, modes, ...field }) => ({
    ...field, defaultValue: field.id === 'assembly' ? '' : example,
    ...(field.type === 'select' ? { dependsOn: selector } : {}),
    ...(field.id === 'assembly' ? { help: 'Assembly identifier: for example hg38 for UCSC, GRCh38 for Ensembl, or GCF_000001405.40 for NCBI. Ensembl may use its default when blank.' } : {}),
    visibleWhen: { option: selector, value: modes }
  }));
}
export const getDataWorkflowOptions = [
  { id: 'retrieval', type: 'select', label: 'Retrieve', defaultValue: 'nucleotide:ncbi', choices: retrieveModes,
    help: 'The incoming output supplies one sequence or structure accession, or a genomic region. Use Get Data to choose a gene and its transcript or protein first, then use that record accession here.' },
  { id: 'format', type: 'select', label: 'Output format', defaultValue: 'gb', dependsOn: 'retrieval',
    choices: retrieveModes.flatMap(mode => formatsFor(mode.operation, mode.source, mode.options).map(([value, label]) => ({ value, label, dependsOnValue: mode.value }))) },
  ...auxiliaryOptions(retrieveModes, 'retrieval', getFields, ['query', 'queryMode', 'region', 'regionExample']),
  // New region requests use reference orientation. Keep an explicit reverse
  // choice visible in older recipes so editing does not silently alter biology.
  { id: 'strand', type: 'select', label: 'Saved DNA orientation', defaultValue: '1',
    choices: [{ value: '1', label: 'Reference (+)' }, { value: '-1', label: 'Reverse complement (−)' }],
    visibleWhen: [{ option: 'strand', value: '-1' }, { option: 'retrieval', value: regionModes.filter(mode => mode.options.sequenceType === 'genomic').map(mode => mode.value) }],
    help: 'This saved workflow requests reverse-complement DNA. Keep its original behavior or switch to reference orientation.' },
  { id: 'modelId', type: 'text', label: 'AlphaFold model ID (optional)', defaultValue: '', visibleWhen: { option: 'retrieval', value: 'structure:alphafold' },
    help: 'Required if AlphaFold returns more than one model. Choose the model on the Get Data tool page to find its ID.' }
];
export const sendDataWorkflowOptions = [
  { id: 'destination', type: 'select', label: 'Send to', defaultValue: 'similar:blast', choices: sendModes,
    help: 'Uses the incoming output. Open or send it from the completed workflow result.' },
  ...auxiliaryOptions(sendModes, 'destination', sendFields, ['input', 'template', 'region'])
];

export function retrievalOptions(input, options = {}) {
  const selected = retrieveModes.find(mode => mode.value === options.retrieval);
  const [type, source] = selected ? [selected.operation, selected.source] : options.retrieval?.split(':') ?? [options.type ?? 'nucleotide', options.source ?? 'ncbi'];
  if (options.queryMode === 'search') throw new Error('Workflow retrieval needs an accession. Search on the Get Data tool page, then use the chosen accession as workflow input.');
  return { ...options, type, source, queryMode: options.queryMode ?? 'accession', ...selected?.options, query: input.trim(), region: input.trim() };
}
export function handoffOptions(input, options = {}) {
  const [task, source] = options.destination?.split(':') ?? [options.task ?? 'similar', options.source ?? 'blast'];
  return { ...options, task, source, input, ...(task === 'primers' ? { template: input } : {}), ...(task === 'region' ? { region: input.trim() } : {}) };
}
