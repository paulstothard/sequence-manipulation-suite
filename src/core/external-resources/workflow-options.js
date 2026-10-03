import { dataTypes, tasks, sources, formatsFor, getFields, sendFields } from './catalog.js';

const modes = items => items.flatMap(item => item.sources.map(source => ({
  value: `${item.id}:${source}`, label: `${item.label} — ${sources[source]}`, operation: item.id, source
})));
const retrieveModes = modes(dataTypes), sendModes = modes(tasks);

// Keep workflow controls in sync with the standalone tools. The incoming step
// supplies the accession, region, sequence, template, structure, or variant.
function auxiliaryOptions(choices, selector, fieldsFor, excluded) {
  const grouped = new Map();
  for (const mode of choices) {
    for (const field of fieldsFor(mode.operation, mode.source)) {
      if (excluded.includes(field.id)) continue;
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
    help: 'The incoming output supplies one accession or a genomic region. Use the Get Data tool page to search for an accession first.' },
  { id: 'format', type: 'select', label: 'Output format', defaultValue: 'gb', dependsOn: 'retrieval',
    choices: retrieveModes.flatMap(mode => formatsFor(mode.operation, mode.source).map(([value, label]) => ({ value, label, dependsOnValue: mode.value }))) },
  ...auxiliaryOptions(retrieveModes, 'retrieval', getFields, ['query', 'queryMode', 'region']),
  { id: 'modelId', type: 'text', label: 'AlphaFold model ID (optional)', defaultValue: '', visibleWhen: { option: 'retrieval', value: 'structure:alphafold' },
    help: 'Required if AlphaFold returns more than one model. Choose the model on the Get Data tool page to find its ID.' }
];
export const sendDataWorkflowOptions = [
  { id: 'destination', type: 'select', label: 'Send to', defaultValue: 'similar:blast', choices: sendModes,
    help: 'Uses the incoming output. Open or send it from the completed workflow result.' },
  ...auxiliaryOptions(sendModes, 'destination', sendFields, ['input', 'template', 'region'])
];

export function retrievalOptions(input, options = {}) {
  const [type, source] = options.retrieval?.split(':') ?? [options.type ?? 'nucleotide', options.source ?? 'ncbi'];
  if (options.queryMode === 'search') throw new Error('Workflow retrieval needs an accession. Search on the Get Data tool page, then use the chosen accession as workflow input.');
  return { ...options, type, source, queryMode: 'accession', query: input.trim(), region: input.trim() };
}
export function handoffOptions(input, options = {}) {
  const [task, source] = options.destination?.split(':') ?? [options.task ?? 'similar', options.source ?? 'blast'];
  return { ...options, task, source, input, ...(task === 'primers' ? { template: input } : {}), ...(task === 'region' ? { region: input.trim() } : {}) };
}
