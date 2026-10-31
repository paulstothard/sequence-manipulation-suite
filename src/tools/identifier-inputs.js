// Explicit input contracts; do not infer an identifier namespace from tool tags.
const example = (label, query, extra = {}) => ({ label, query, ...extra });
export const identifierExamples = {
  pdb: [example('p53–DNA', '1TUP'), example('Haemoglobin', '4HHB'), example('Crambin', '1CRN')],
  uniprot: [example('Insulin', 'P01308'), example('p53', 'P04637'), example('Alpha-globin', 'P69905')],
  'ncbi-protein': [example('p53', 'NP_000537.3'), example('Beta-globin', 'NP_000509.1'), example('Alpha-globin', 'NP_000549.1')],
  'ncbi-nucleotide': [example('phiX174', 'NC_001422.1'), example('pBR322', 'J01749.1'), example('Human HBB transcript', 'NM_000518.5')],
  transcript: [example('HBB transcript', 'NM_000518.5'), example('INS transcript', 'NM_000207.3'), example('TP53 transcript', 'NM_000546.6')],
  'protein-pair': [example('Human alpha/beta globin', 'P69905\nP68871'), example('Human/mouse p53', 'P04637\nP02340')],
  'protein-set': [example('p53 orthologues', 'P04637\nP02340\nP10361'), example('Human globins', 'P69905\nP68871\nP02042')],
  'ncbi-protein-pair': [example('Human alpha/beta globin', 'NP_000549.1\nNP_000509.1'), example('Human beta/delta globin', 'NP_000509.1\nNP_000510.1')],
  'ncbi-protein-set': [example('Human globins', 'NP_000549.1\nNP_000509.1\nNP_000510.1'), example('Beta/delta/gamma globin', 'NP_000509.1\nNP_000510.1\nNP_000550.2')],
  'nucleotide-pair': [example('Beta/delta globin transcripts', 'NM_000518.5\nNM_000519.4'), example('Beta/gamma globin transcripts', 'NM_000518.5\nNM_000559.3')],
  'nucleotide-set': [example('Human globin transcripts', 'NM_000518.5\nNM_000519.4\nNM_000559.3'), example('Beta/gamma globin transcripts', 'NM_000518.5\nNM_000559.3')],
  reference: [example('phiX174', 'NC_001422.1'), example('pBR322', 'J01749.1'), example('HBB genomic interval', 'NC_000011.10', { start: '5225464', end: '5227071' })]
};

const dna = { kind: 'nucleotide', providers: ['ncbi-nucleotide'], maxLength: 1_000_000, maxRecords: 1, allowRange: true };
const protein = { kind: 'protein', providers: ['uniprot', 'ncbi-protein'], maxLength: 20_000, maxRecords: 1 };
const annotatedDna = { ...dna, kind: 'annotated-nucleotide', options: { inputFormat: 'genbank', sourceMode: 'annotated' } };
const annotatedProtein = { ...protein, kind: 'annotated-protein', options: { sourceMode: 'annotated' } };
const structure = { kind: 'structure', providers: ['pdb'], maxRecords: 1, options: { format: 'mmcif' } };
const reference = { ...dna, examples: 'reference', optionsFromRange: 'referenceStart', help: 'Use a reference matching your traces. Retrieved intervals keep their original reference base numbers.' };
const configurations = {};
function add(ids, config) { for (const id of ids.split(' ')) configurations[id] = [{ slot: 'input', ...config }]; }

add('protein-structure-viewer', structure);
add('protein-sequence-viewer annotated-protein-record-extractor', annotatedProtein);
add('dna-sequence-viewer circular-dna-sequence-viewer annotated-dna-record-extractor circular-genome-figure linear-genome-figure', { ...annotatedDna, mount: 'biological' });
add('sequence-extractor', { ...annotatedDna, mount: 'biological', slot: 'annotation' });
add('pcr-primer-design', { ...annotatedDna, maxLength: 20_000, mount: 'template' });
add('in-silico-pcr', { ...annotatedDna, mount: 'template', slot: 'template' });
add('crispr-guide-design', { ...annotatedDna, maxLength: 100_000 });
add('sirna-design', { ...dna, kind: 'transcript', maxLength: 100_000, allowRange: false, examples: 'transcript', options: { sourceMode: 'loaded' } });
add('protein-hydropathy sequence-stats-protein protein-digest protein-motif-scanner protein-pattern-finder reverse-translate', protein);
add('restriction-summary restriction-digest', { ...annotatedDna, maxLength: 200_000 });
add('sequence-stats-dna-rna base-composition-plot dna-rna-pattern-finder orf-finder', { ...dna, options: { sourceMode: 'loaded' } });

for (const [suffix, base] of [['dna-rna', dna], ['protein', protein], ['coding-dna', { ...dna, kind: 'coding-dna', allowRange: false }]]) {
  add(`pairwise-align-${suffix}`, { ...base, allowRange: false, maxLength: 10_000, minRecords: 2, maxRecords: 2, examples: suffix === 'protein' ? 'protein-pair' : 'nucleotide-pair' });
  add(`multiple-align-${suffix}`, { ...base, allowRange: false, maxLength: 10_000, minRecords: 2, maxRecords: 20, examples: suffix === 'protein' ? 'protein-set' : 'nucleotide-set' });
}
for (const [suffix, base] of [['dna-rna', dna], ['protein', protein]]) add(`alignment-dot-plot-${suffix}`, { ...base, allowRange: false, maxLength: 10_000, minRecords: 2, maxRecords: 2, examples: suffix === 'protein' ? 'protein-pair' : 'nucleotide-pair' });
add('phylogeny-builder', { ...dna, kind: 'phylogeny', providers: ['ncbi-nucleotide', 'uniprot', 'ncbi-protein'], allowRange: false, maxLength: 10_000, minRecords: 2, maxRecords: 20, examples: 'nucleotide-set' });
configurations['protein-conservation-structure-viewer'] = [
  { ...structure, slot: 'structure', mount: 'split', index: 0 },
  { ...protein, slot: 'alignment', mount: 'split', index: 1, minRecords: 1, maxRecords: 19, maxLength: 10_000, examples: 'protein-set', options: { alignmentInputMode: 'unaligned' } }
];
for (const id of ['sanger-genotyper', 'resolve-mixed-sanger-trace']) configurations[id] = [{ ...reference, slot: 'reference', mount: id === 'resolve-mixed-sanger-trace' ? 'split' : 'sanger', index: 1 }];

export function identifierInputsFor(toolId) { return configurations[toolId] ?? []; }
export const identifierToolIds = Object.freeze(Object.keys(configurations));
export function examplesForIdentifier(config, provider) {
  let key = config.examples ?? provider;
  if (config.kind === 'phylogeny') key = provider === 'ncbi-nucleotide' ? 'nucleotide-set' : 'protein-set';
  if (provider === 'ncbi-protein' && key.startsWith('protein-')) key = `ncbi-${key}`;
  return identifierExamples[key] ?? identifierExamples[provider];
}
