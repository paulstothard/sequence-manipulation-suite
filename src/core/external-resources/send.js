import { identifier, parseRegion, required, sources, url, validateSelection } from './catalog.js';
import { pdbId, uniprotId } from './get.js';
import { formatFastaRecord, parseSequenceInput } from '../fasta.js';

export const MAX_HANDOFF_CHARS = 1_000_000;
export function validatedSequences(value, { alphabet = 'auto', multiple = false, max = MAX_HANDOFF_CHARS } = {}) {
  const input = required(value, 'sequence data', max);
  const records = parseSequenceInput(input);
  if ((!multiple && records.length !== 1) || (multiple && records.length < 2)) throw new Error(multiple ? 'Enter at least two FASTA records.' : 'Enter exactly one sequence.');
  if (records.length > 1000) throw new Error('Use at most 1,000 records per handoff.');
  if (multiple && records.some(r => !r.hadHeader)) throw new Error('Give each sequence a FASTA header.');
  for (const record of records) {
    record.sequence = record.sequence.toUpperCase();
    if (!record.sequence || !/^[ACDEFGHIKLMNPQRSTVWYBXZOU*]+$/.test(record.sequence)) throw new Error('Sequences must contain amino-acid or IUPAC nucleotide letters. Remove gaps, numbers, and other symbols first.');
    if (alphabet === 'dna' && !/^[ACGTURYSWKMBDHVN]+$/.test(record.sequence)) throw new Error('This action requires a nucleotide sequence.');
  }
  return records;
}
const fasta = records => records.map(r => formatFastaRecord(r.title, r.sequence)).join('\n');
function manual(service, target, input, filename, instructions) {
  return { service, method: 'manual', url: target, input, filename, instructions, actionLabel: `Open ${sources[service]}` };
}
export function buildHandoff(options = {}) {
  const task = options.task ?? 'similar', service = options.source ?? 'blast';
  validateSelection('send', task, service);
  const input = String(options.input ?? '').trim();
  let plan;
  if (task === 'similar') {
    const records = validatedSequences(input);
    const isDna = /^[ACGTURYSWKMBDHVN]+$/.test(records[0].sequence);
    const program = options.program && options.program !== 'auto' ? options.program : isDna ? 'blastn' : 'blastp';
    if (!['blastn', 'blastp', 'blastx', 'tblastn', 'tblastx'].includes(program)) throw new Error('Choose a supported BLAST search type.');
    if (['blastn', 'blastx', 'tblastx'].includes(program) && !isDna) throw new Error(`${program.toUpperCase()} requires nucleotide input.`);
    plan = { method: 'POST', url: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi', fields: { PAGE_TYPE: 'BlastSearch', PROGRAM: program, QUERY: fasta(records) }, instructions: `Opens a prefilled ${program.toUpperCase()} form. Review the database and submit the search at NCBI.` };
  } else if (task === 'primers') {
    const primer = (value, label) => {
      const sequence = required(value, label, 200).replace(/\s/g, '').toUpperCase();
      if (!/^[ACGT]+$/.test(sequence)) throw new Error(`${label} must contain only A, C, G, and T.`);
      return sequence;
    };
    const template = String(options.template ?? '').trim();
    if (template) {
      if (/^[A-Za-z]{1,6}_?\d+(?:\.\d+)?$/.test(template)) identifier(template);
      else validatedSequences(template, { alphabet: 'dna', max: 50000 });
    }
    plan = { method: 'POST', url: 'https://www.ncbi.nlm.nih.gov/tools/primer-blast/index.cgi', fields: { PRIMER_LEFT_INPUT: primer(options.forward, 'Forward primer'), PRIMER_RIGHT_INPUT: primer(options.reverse, 'Reverse primer'), INPUT_SEQUENCE: template }, instructions: 'Opens the Primer-BLAST form with both primers and optional template. Review specificity settings at NCBI.' };
  } else if (task === 'region') {
    const r = parseRegion(options.region);
    const region = `${r.chrom}:${r.start}-${r.end}`;
    if (service === 'ucsc') plan = { url: url('https://genome.ucsc.edu/cgi-bin/hgTracks', { db: identifier(options.assembly, 'assembly'), position: region }) };
    if (service === 'ensembl') plan = { url: url(`https://www.ensembl.org/${identifier(options.species, 'species')}/Location/View`, { r: region }) };
    if (service === 'gdv') plan = { url: url('https://www.ncbi.nlm.nih.gov/gdv/browser/', { id: identifier(options.assembly, 'assembly'), context: 'genome', chr: r.chrom, from: r.start, to: r.end }) };
  } else if (task === 'genome') {
    const mode = options.inputMode ?? 'fasta';
    if (mode === 'accession') return manual(service, 'https://proksee.ca/projects/new', identifier(input), 'accession.txt', 'Copy the accession, open Proksee, and paste it into the Genome accession field.');
    if (mode === 'genbank') {
      required(input, 'a GenBank or EMBL record', MAX_HANDOFF_CHARS);
      if (!/^(?:LOCUS|ID)\s/m.test(input) || !/^\/\//m.test(input)) throw new Error('Enter a complete GenBank or EMBL record.');
      return manual(service, 'https://proksee.ca/projects/new', input, /^LOCUS\s/m.test(input) ? 'genome.gb' : 'genome.embl', 'Download the prepared annotated file, open Proksee, and upload it under Genome. This preserves the original annotations.');
    }
    if (mode !== 'fasta') throw new Error('Choose a supported genome input type.');
    const records = parseSequenceInput(required(input, 'genome sequence', MAX_HANDOFF_CHARS));
    if (records.length > 1000) throw new Error('Use at most 1,000 contigs.');
    const names = new Set();
    const contigs = records.map((r, index) => {
      if (!/^[ACGTURYSWKMBDHVN]+$/i.test(r.sequence)) throw new Error('Genome contigs must contain IUPAC nucleotide letters.');
      let name = r.title || `contig_${index + 1}`;
      if (names.has(name)) name = `${name}_${index + 1}`;
      names.add(name);
      return { name, seq: r.sequence.toUpperCase().replaceAll('U', 'T') };
    });
    if (contigs.reduce((sum, r) => sum + r.seq.length, 0) < 1000) throw new Error('Proksee genome input requires at least 1,000 bases.');
    const map = { cgview: { version: '1.6.0', name: contigs[0].name, sequence: { contigs }, tracks: [{ name: 'GC Content', dataType: 'plot', dataMethod: 'sequence', dataKeys: 'gc-content' }, { name: 'GC Skew', dataType: 'plot', dataMethod: 'sequence', dataKeys: 'gc-skew' }] } };
    plan = { method: 'api', url: 'https://proksee.ca/api/v1/projects.json', body: { origin: 'sms3', data: JSON.stringify(map) }, input: JSON.stringify(map, null, 2), filename: 'genome.cgview.json', instructions: 'Sends the genome sequence to Proksee and creates a map. Anyone with the resulting project link can access it.', actionLabel: 'Send to Proksee' };
  } else if (task === 'protein') {
    if (service === 'interpro' && options.inputMode === 'accession') plan = { url: `https://www.ebi.ac.uk/interpro/protein/UniProt/${uniprotId(input)}/` };
    else {
      const data = fasta(validatedSequences(input, { alphabet: 'protein' }));
      return manual(service, service === 'interpro' ? 'https://www.ebi.ac.uk/interpro/search/sequence/' : 'https://www.ebi.ac.uk/Tools/hmmer/search/phmmer', data, 'protein.fasta', `Copy the prepared FASTA, open ${sources[service]}, and paste it into the sequence search form. Submit the analysis there.`);
    }
  } else if (task === 'align') {
    const records = validatedSequences(input, { multiple: true });
    return manual(service, 'https://www.ebi.ac.uk/jdispatcher/msa/clustalo', fasta(records), 'sequences.fasta', 'Copy or download the prepared FASTA, open Clustal Omega, and paste or upload it. Select the correct sequence type and submit the alignment there.');
  } else if (task === 'structure') {
    if (service === 'rcsb') plan = { url: `https://www.rcsb.org/structure/${pdbId(input)}` };
    if (service === 'alphafold') plan = { url: `https://alphafold.ebi.ac.uk/entry/${uniprotId(input)}` };
    if (service === 'foldseek') {
      required(input, 'a structure record', MAX_HANDOFF_CHARS);
      if (!/^(?:data_|HEADER|ATOM  |HETATM)/m.test(input)) throw new Error('Paste a PDB or mmCIF structure record.');
      return manual(service, 'https://search.foldseek.com/search', input, /^data_/m.test(input) ? 'structure.cif' : 'structure.pdb', 'Download the prepared structure, open Foldseek, and upload it to start a structure search.');
    }
  } else if (task === 'variant') {
    const query = required(input, 'a variant identifier or query', 500);
    if (service === 'dbsnp') {
      if (!/^rs\d+$/i.test(query)) throw new Error('Enter an rsID such as rs429358.');
      plan = { url: `https://www.ncbi.nlm.nih.gov/snp/${query.slice(2)}` };
    }
    if (service === 'clinvar') plan = { url: url('https://www.ncbi.nlm.nih.gov/clinvar/', { term: query }) };
    if (service === 'gnomad') {
      if (!/^(?:[1-9]|1\d|2[0-2]|X|Y|MT)-[1-9]\d*-[ACGT]+-[ACGT]+$/i.test(query)) throw new Error('Use chromosome-position-ref-alt, for example 17-7674220-C-T (GRCh38).');
      plan = { url: url(`https://gnomad.broadinstitute.org/variant/${query}`, { dataset: identifier(options.dataset || 'gnomad_r4', 'dataset') }) };
    }
    if (service === 'ensembl') plan = { url: url(`https://www.ensembl.org/${identifier(options.species, 'species')}/Variation/Explore`, { v: query }) };
    if (service === 'ucsc') plan = { url: url('https://genome.ucsc.edu/cgi-bin/hgTracks', { db: identifier(options.assembly, 'assembly'), position: query }) };
    if (service === 'gdv') plan = { url: url('https://www.ncbi.nlm.nih.gov/gdv/browser/', { id: identifier(options.assembly, 'assembly'), context: 'genome', q: query }) };
  }
  return { service, method: 'GET', actionLabel: `Open in ${sources[service]}`, instructions: 'Opens the external service with the supplied identifier or coordinates.', ...plan };
}
