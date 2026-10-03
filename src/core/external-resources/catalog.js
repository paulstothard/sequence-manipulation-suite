import { recordParserExample } from '../../examples/record-parser-example.js';
import { parseFlatfileRecords } from '../flatfile-records.js';
import { formatFastaRecord } from '../fasta.js';
// External endpoints and handoff references are maintained in docs/external-resources.md.
export const sources = {
  ncbi: 'NCBI', uniprot: 'UniProt', ensembl: 'Ensembl', ucsc: 'UCSC Genome Browser',
  ena: 'ENA', rcsb: 'RCSB PDB', alphafold: 'AlphaFold DB', blast: 'NCBI BLAST',
  primer: 'NCBI Primer-BLAST', gdv: 'NCBI Genome Data Viewer', proksee: 'Proksee',
  interpro: 'InterPro', hmmer: 'HMMER', clustalo: 'Clustal Omega', foldseek: 'Foldseek',
  dbsnp: 'dbSNP', clinvar: 'ClinVar', gnomad: 'gnomAD'
};
export const dataTypes = [
  { id: 'nucleotide', label: 'Nucleotide sequence', sources: ['ncbi', 'ena', 'ensembl'] },
  { id: 'protein', label: 'Protein sequence', sources: ['ncbi', 'uniprot', 'ensembl'] },
  { id: 'region', label: 'Genomic region', sources: ['ucsc', 'ensembl'] },
  { id: 'structure', label: 'Protein structure', sources: ['rcsb', 'alphafold'] }
];
export const tasks = [
  { id: 'similar', label: 'Search for similar sequences', sources: ['blast'] },
  { id: 'primers', label: 'Check primers', sources: ['primer'] },
  { id: 'region', label: 'View a genomic region', sources: ['ucsc', 'ensembl', 'gdv'] },
  { id: 'genome', label: 'Visualize a genome', sources: ['proksee'] },
  { id: 'protein', label: 'Analyze a protein', sources: ['interpro', 'hmmer'] },
  { id: 'align', label: 'Align sequences', sources: ['clustalo'] },
  { id: 'structure', label: 'View/search structures', sources: ['rcsb', 'alphafold', 'foldseek'] },
  { id: 'variant', label: 'Look up a variant', sources: ['dbsnp', 'clinvar', 'gnomad', 'ensembl', 'ucsc', 'gdv'] }
];
const text = (id, label, example, help = '') => ({ id, label, example, help, type: 'text' });
const area = (id, label, example, help = '') => ({ ...text(id, label, example, help), type: 'textarea' });
const choice = (id, label, values, example = values[0][0], help = '') => ({ id, label, type: 'select', example, help, choices: values.map(([value, label]) => ({ value, label })) });
const dna = '>TP53_cds_fragment\nATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT';
const protein = '>TP53_fragment\nMEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP';
const species = () => text('species', 'Species', 'homo_sapiens', 'Ensembl species name, for example homo_sapiens or mus_musculus.');
const region = (ensembl = false, gdv = false) => text('region', 'Region', gdv ? 'NC_000017.11:7668421-7687490' : `${ensembl ? '17' : 'chr17'}:7668421-7687490`, 'Coordinates are 1-based, inclusive.');
export function formatsFor(type, source) {
  const fasta = ['fasta', 'FASTA'], summary = ['summary', 'Summary report'];
  if (type === 'structure') return [['cif', 'mmCIF'], ['pdb', 'PDB'], summary];
  if (type === 'region' || source === 'ensembl') return [fasta, summary];
  if (source === 'ncbi') return [type === 'protein' ? ['gp', 'GenPept'] : ['gb', 'GenBank'], fasta, summary];
  if (source === 'ena') return [['embl', 'EMBL'], fasta, summary];
  if (source === 'uniprot') return [['uniprot', 'UniProt'], ['json', 'UniProt JSON'], fasta, summary];
  return [fasta, summary];
}
export function formatHelp(type, source, format) {
  if (format === 'gb') return 'Complete GenBank record from NCBI: nucleotide sequence, feature annotations, qualifiers, and references, preserved as supplied by the database.';
  if (format === 'gp') return 'Complete GenPept record from NCBI: amino acid sequence, protein feature annotations, qualifiers, and references, preserved as supplied by the database.';
  if (format === 'embl') return 'Complete EMBL record from ENA: nucleotide sequence and its annotations, preserved as supplied by the database.';
  if (format === 'uniprot' || format === 'json') return `Complete UniProt entry ${format === 'json' ? 'in JSON' : 'in native text format'}: canonical amino acid sequence, annotations, and references. For a specific isoform sequence, choose FASTA.`;
  if (format === 'fasta') return `Sequence and FASTA header only; feature annotations are omitted.${source === 'ensembl' || type === 'region' ? ' This source provides sequence-only retrieval here.' : ''}`;
  if (format === 'summary') return source === 'ncbi' || source === 'uniprot' || type === 'structure'
    ? 'A compact report from database metadata. Sequence or structure coordinates are omitted from the report.'
    : 'A compact report with length and descriptive information. The sequence is downloaded to calculate the report, then omitted from the output.';
  return format === 'cif' ? 'Structure coordinates and metadata in mmCIF format.' : 'Structure coordinates in legacy PDB format. Use mmCIF if this entry cannot be represented as PDB.';
}
export function getFields(type, source) {
  if (type === 'region') return source === 'ucsc'
    ? [text('assembly', 'Assembly', 'hg38', 'UCSC assembly identifier; hg38 is human GRCh38.'), region()]
    : [species(), text('assembly', 'Assembly (optional)', '', 'Ensembl coordinate-system version, for example GRCh38. Blank uses the current assembly.'), region(true), choice('strand', 'Strand', [['1', 'Forward'], ['-1', 'Reverse']])];
  if (type === 'structure') return [text('query', source === 'rcsb' ? 'PDB ID' : 'Protein / UniProt ID', source === 'rcsb' ? '4HHB' : 'P04637')];
  const fields = [text('query', source === 'ncbi' && type !== 'annotated' || source === 'uniprot' ? 'Accession or search' : source === 'ensembl' ? 'Ensembl stable ID' : 'Accession', source === 'uniprot' ? 'P04637' : source === 'ensembl' ? (type === 'protein' ? 'ENSP00000269305' : 'ENST00000269305') : source === 'ena' ? 'X56734.1' : type === 'protein' ? 'NP_000537.3' : type === 'annotated' ? 'NC_001416.1' : 'NM_000546.6')];
  if (source === 'ensembl' && type === 'nucleotide') fields.push(choice('sequenceType', 'Sequence type', [['cdna', 'cDNA (transcript ID)'], ['cds', 'Coding sequence (transcript ID)'], ['genomic', 'Genomic sequence']]));
  if ((source === 'ncbi' && type !== 'annotated') || source === 'uniprot') fields.push(choice('queryMode', 'Find by', [['auto', 'Accession or search'], ['accession', 'Accession'], ['search', 'Database search']], 'auto', 'A search shows up to 20 matches. Refine the query to narrow larger result sets.'));
  return fields;
}
export function sendFields(task, source) {
  if (task === 'similar') return [area('input', 'Sequence or FASTA', dna), choice('program', 'Search type', [['auto', 'Automatic'], ['blastn', 'BLASTN'], ['blastp', 'BLASTP'], ['blastx', 'BLASTX'], ['tblastn', 'TBLASTN'], ['tblastx', 'TBLASTX']], 'auto', 'Automatic treats IUPAC nucleotide-only input as DNA/RNA. Choose explicitly for ambiguous short proteins.')];
  if (task === 'primers') return [text('forward', 'Forward primer (5′ → 3′)', 'ATGGAGGAGCCGCAGTCAG'), text('reverse', 'Reverse primer (5′ → 3′)', 'TCAGTCTGAGTCAGGCCCT'), area('template', 'Template (optional sequence or accession)', 'NM_000546.6')];
  if (task === 'region') return source === 'ensembl' ? [species(), region(true)] : [text('assembly', 'Assembly', source === 'ucsc' ? 'hg38' : 'GCF_000001405.40'), region(false, source === 'gdv')];
  if (task === 'genome') return [choice('inputMode', 'Input type', [['fasta', 'Sequence / FASTA'], ['genbank', 'GenBank / EMBL file'], ['accession', 'NCBI accession']]), area('input', 'Genome data', sendInputExample('genome', 'fasta'), 'FASTA is sent through the Proksee project API. Annotated files and accessions are prepared for Proksee’s import form.')];
  if (task === 'protein') return source === 'interpro'
    ? [choice('inputMode', 'Input type', [['sequence', 'Protein sequence'], ['accession', 'UniProt accession']]), area('input', 'Protein sequence or UniProt accession', protein)]
    : [area('input', 'Protein sequence or FASTA', protein)];
  if (task === 'align') return [area('input', 'Multiple FASTA sequences', `${protein}\n>TP53_variant_fragment\nMEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGS`)];
  if (task === 'structure') return source === 'foldseek' ? [area('input', 'Structure (PDB or mmCIF)', '', 'Choose a structure file or paste its text, then download the prepared file for upload to Foldseek.')] : [text('input', source === 'rcsb' ? 'PDB ID' : 'UniProt accession', source === 'rcsb' ? '4HHB' : 'P04637')];
  if (source === 'gnomad') return [text('input', 'Variant (chromosome-position-ref-alt)', '17-7674220-C-T', 'Use GRCh38 coordinates.'), text('dataset', 'gnomAD dataset', 'gnomad_r4')];
  if (source === 'ensembl') return [species(), text('input', 'Variant ID', 'rs429358')];
  if (source === 'ucsc' || source === 'gdv') return [text('assembly', 'Assembly', source === 'ucsc' ? 'hg38' : 'GCF_000001405.40'), text('input', 'Variant ID or region', 'rs429358')];
  return [text('input', source === 'dbsnp' ? 'rsID' : 'Variant ID or search', 'rs429358')];
}
export function fieldExamples(fields) { return Object.fromEntries(fields.map(f => [f.id, f.example])); }
export function validateSelection(mode, operation, source) {
  const item = (mode === 'get' ? dataTypes : tasks).find(item => item.id === operation);
  if (!item?.sources.includes(source)) throw new Error('Choose a supported data type/task and source.');
}
export function parseRegion(value, maxLength = Number.MAX_SAFE_INTEGER) {
  const match = String(value).trim().match(/^([A-Za-z0-9_.-]+):(\d[\d,]*)-(\d[\d,]*)$/);
  if (!match) throw new Error('Enter a region such as chr17:7668421-7687490 (1-based, inclusive).');
  const start = Number(match[2].replaceAll(',', '')), end = Number(match[3].replaceAll(',', ''));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('Region start and end must be positive integers with start ≤ end.');
  if (end - start + 1 > maxLength) throw new Error(`Request at most ${maxLength.toLocaleString('en-US')} bases per region.`);
  return { chrom: match[1], start, end, length: end - start + 1 };
}
export function required(value, label, max = 2000) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Enter ${label}.`);
  if (text.length > max) throw new Error(`${label} exceeds the ${max.toLocaleString('en-US')}-character limit.`);
  return text;
}
export function identifier(value, label = 'an accession') {
  const id = required(value, label, 100);
  if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error(`Use one valid ${label}; spaces and URL characters are not allowed.`);
  return id;
}
export function url(base, params = {}) {
  const target = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) target.searchParams.set(key, value);
  return target.href;
}

export function sendInputExample(task, mode) {
  if (task === 'genome') {
    if (mode === 'accession') return 'NC_001422.1';
    if (mode === 'genbank') return recordParserExample;
    const record = parseFlatfileRecords(recordParserExample).records[0];
    return formatFastaRecord(`${record.accession} ${record.title}`, record.sequence);
  }
  return mode === 'accession' ? 'P04637' : protein;
}
