import { recordParserExample } from '../../examples/record-parser-example.js';
import { parseFlatfileRecords } from '../flatfile-records.js';
import { formatFastaRecord } from '../fasta.js';
import { regionExample } from './region-examples.js';
// External endpoints and handoff references are maintained in docs/external-resources.md.
export const sources = {
  ncbi: 'NCBI', uniprot: 'UniProt', ensembl: 'Ensembl', ucsc: 'UCSC Genome Browser',
  ena: 'ENA', rcsb: 'RCSB PDB', alphafold: 'AlphaFold DB', blast: 'NCBI BLAST',
  primer: 'NCBI Primer-BLAST', gdv: 'NCBI Genome Data Viewer', proksee: 'Proksee',
  interpro: 'InterPro', hmmer: 'HMMER', clustalo: 'Clustal Omega', foldseek: 'Foldseek',
  dbsnp: 'dbSNP', clinvar: 'ClinVar', gnomad: 'gnomAD'
};
export const dataTypes = [
  { id: 'nucleotide', label: 'Nucleotide sequence', sources: ['ncbi', 'ena', 'ensembl', 'ucsc'] },
  { id: 'protein', label: 'Protein sequence', sources: ['ncbi', 'uniprot', 'ensembl', 'ucsc'] },
  { id: 'annotations', label: 'Gene / transcript annotations', sources: ['ncbi', 'ensembl', 'ucsc'] },
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
export function lookupModes(type, source) {
  if (type === 'region' || type === 'annotations' || source === 'ucsc') return [['region', 'By genomic region']];
  const modes = [['accession', 'By accession']];
  if (source === 'ncbi' || source === 'uniprot') modes.push(['search', 'By search terms']);
  if (type !== 'structure' && ['ncbi', 'ensembl'].includes(source)) modes.push(['region', 'By genomic region']);
  return modes;
}
export function regionProduct(type, options = {}) {
  return type === 'protein' ? 'protein' : type === 'annotations' ? 'annotations' : ['genomic', 'cdna', 'cds'].includes(options.sequenceType) ? options.sequenceType : 'genomic';
}
export function isRegionLookup(type, source, options = {}) {
  return type === 'region' || lookupModes(type, source)[0][0] === 'region' || options.queryMode === 'region';
}
export function formatsFor(type, source, options = {}) {
  const fasta = ['fasta', 'FASTA'], summary = ['summary', 'Summary report'];
  if (type === 'structure') return [['cif', 'mmCIF'], ['pdb', 'PDB'], summary];
  if (type === 'annotations') return [['tsv', 'Gene / transcript table'], summary];
  if (isRegionLookup(type, source, options)) {
    const product = regionProduct(type, options);
    return source === 'ncbi' && ['genomic', 'cdna', 'protein'].includes(product) ? [fasta, product === 'protein' ? ['gp', 'GenPept'] : ['gb', 'GenBank'], summary] : [fasta, summary];
  }
  if (source === 'ensembl') return [fasta, summary];
  if (source === 'ncbi') return [type === 'protein' ? ['gp', 'GenPept'] : ['gb', 'GenBank'], fasta, summary];
  if (source === 'ena') return [['embl', 'EMBL'], fasta, summary];
  if (source === 'uniprot') return [['uniprot', 'UniProt'], ['json', 'UniProt JSON'], fasta, summary];
  return [fasta, summary];
}
export function formatHelp(type, source, format, options = {}) {
  if (isRegionLookup(type, source, options) && regionProduct(type, options) === 'genomic' && format === 'gb') return 'DNA and NCBI annotations for the entire interval, ready for SMS3 sequence viewers. Feature positions are relative to the retrieved sequence; clipped features are marked partial.';
  if (isRegionLookup(type, source, options) && regionProduct(type, options) === 'genomic' && format === 'summary') return 'The interval sequence is downloaded to calculate length and composition, then omitted from the report.';
  if (isRegionLookup(type, source, options) && regionProduct(type, options) !== 'genomic') {
    if (format === 'tsv') return 'One row per selected transcript: complete genomic spans, exon coordinates, gene/transcript identifiers, and available protein identifiers. Download as TSV.';
    if (format === 'summary') return 'Annotation metadata and transcript identifiers, without downloading product sequences.';
    if (format === 'fasta') return 'Complete products of overlapping transcripts, in biological orientation. Results may extend beyond the entered interval; multiple products are separate FASTA records.';
  }
  if (format === 'gb') return 'Complete record: nucleotide sequence, feature annotations, qualifiers, and references from NCBI.';
  if (format === 'gp') return 'Complete record: amino acid sequence, protein feature annotations, qualifiers, and references from NCBI.';
  if (format === 'embl') return 'Complete record: nucleotide sequence and its annotations from ENA.';
  if (format === 'uniprot' || format === 'json') return `Complete UniProt entry ${format === 'json' ? 'in JSON' : 'in native text format'}: canonical amino acid sequence, annotations, and references. For a specific isoform sequence, choose FASTA.`;
  if (format === 'fasta') return `Sequence and FASTA header only; feature annotations are omitted.${source === 'ensembl' || type === 'region' ? ' This source provides sequence-only retrieval here.' : ''}`;
  if (format === 'summary') return source === 'ncbi' || source === 'uniprot' || type === 'structure'
    ? 'A compact report from database metadata. Sequence or structure coordinates are omitted from the report.'
    : 'A compact report with length and descriptive information. The sequence is downloaded to calculate the report, then omitted from the output.';
  return format === 'cif' ? 'Structure coordinates and metadata in mmCIF format.' : 'Structure coordinates in legacy PDB format. Use mmCIF if this entry cannot be represented as PDB.';
}
export function getFields(type, source, options = {}) {
  if (type === 'structure') return [text('query', source === 'rcsb' ? 'PDB ID' : 'Protein / UniProt ID', source === 'rcsb' ? '4HHB' : 'P04637')];
  const modes = lookupModes(type, source);
  const queryMode = modes.some(([id]) => id === options.queryMode) ? options.queryMode : modes[0][0];
  const fields = [choice('queryMode', 'Lookup method', modes, queryMode)];
  if (queryMode === 'region') {
    const example = regionExample(source, options.regionExample), product = regionProduct(type, options);
    if (source === 'ensembl') fields.push(species());
    fields.push(text('assembly', source === 'ensembl' ? 'Assembly (optional)' : 'Assembly', example.assembly,
      source === 'ucsc' ? 'UCSC assembly ID; hg38 is human GRCh38.' : source === 'ncbi' ? `Current RefSeq reference assembly; GCF_000001405.40 is human GRCh38.p14.${product === 'genomic' ? '' : ' Product searches use primary reference chromosomes.'}` : 'Ensembl assembly, such as GRCh38. Blank uses the species’ current assembly.'));
    fields.push(text('region', 'Genomic coordinates', example.region, 'Chromosome:start-end, with 1-based, inclusive positions. Any interval may be used, including multiple genes or intergenic DNA.'));
    if (type === 'nucleotide' || type === 'region') fields.push(choice('sequenceType', 'Sequence type', [['genomic', 'Genomic DNA'], ['cdna', 'Transcripts (cDNA)'], ['cds', 'Coding sequences (CDS)']], product,
      product === 'genomic' ? 'The exact interval in reference (+) orientation. Included annotations retain features from both strands.' : product === 'cdna' ? 'Complete spliced transcripts, including UTRs.' : 'Complete coding sequences. Transcripts without a CDS are reported.'));
    if (product !== 'genomic') fields.push(choice('transcriptSelection', 'Transcripts', [['all', 'All matching transcripts'], ['canonical', source === 'ensembl' ? 'Canonical transcript per gene' : 'RefSeq / MANE Select per gene']], options.transcriptSelection === 'canonical' ? 'canonical' : 'all',
      options.transcriptSelection !== 'canonical'
        ? product === 'annotations' ? 'All overlapping transcripts on both strands, with their complete genomic spans and identifiers.' : 'Overlapping transcripts on both strands. Complete products are returned in biological orientation, including portions outside the interval.'
        : source === 'ensembl' ? 'Ensembl Canonical transcripts overlapping the interval, on both strands. Missing representatives are reported; no substitute is chosen.' : 'RefSeq / MANE Select transcripts overlapping the interval, on both strands. Missing representatives are reported; no substitute is chosen.'));
    return fields;
  }
  const searchable = (source === 'ncbi' && type !== 'annotated') || source === 'uniprot';
  const sequenceType = ['cdna', 'cds', 'genomic'].includes(options.sequenceType) ? options.sequenceType : 'cdna';
  if (source === 'ensembl' && type === 'nucleotide') fields.push(choice('sequenceType', 'Sequence type', [['cdna', 'cDNA'], ['cds', 'Coding sequence'], ['genomic', 'Genomic sequence']], sequenceType));
  if (searchable && queryMode === 'search') {
    fields.push(text('query', 'Search terms', source === 'uniprot' ? 'gene:TP53 AND organism_id:9606' : 'TP53[Gene] AND Homo sapiens[Organism]', 'Search returns up to 20 matches. Choose a record to retrieve it in the selected output format.'));
  } else if (source === 'ensembl') {
    const genomic = type === 'nucleotide' && sequenceType === 'genomic';
    fields.push(text('query', type === 'protein' ? 'Ensembl protein ID' : genomic ? 'Ensembl gene or transcript ID' : 'Ensembl transcript ID', type === 'protein' ? 'ENSP00000269305' : genomic ? 'ENSG00000141510' : 'ENST00000269305'));
  } else {
    fields.push(text('query', source === 'uniprot' ? 'UniProt accession' : source === 'ena' ? 'ENA accession' : 'NCBI accession', source === 'uniprot' ? 'P04637' : source === 'ena' ? 'X56734.1' : type === 'protein' ? 'NP_000537.3' : type === 'annotated' ? 'NC_001416.1' : 'NM_000546.6',
      source === 'ncbi' && type !== 'protein' ? 'Sequence or assembly accession, for example NM_000546.6 or GCF_001729705.1. Assemblies retrieve all chromosomes, plasmids, and contigs as separate records.' : ''));
  }
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
