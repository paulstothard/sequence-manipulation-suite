// Human GRCh38 loci, checked against the source APIs. Coordinates in the UI
// are always 1-based and inclusive; provider adapters own any conversion.
export const regionExamples = [
  { id: 'tp53', label: 'TP53 — transcript isoforms', chrom: '17', start: 7668421, end: 7687490,
    genomicHelp: 'The TP53 interval includes reverse-strand features and overlapping annotations. GenBank retains the features within the requested interval.',
    help: 'TP53 is on the reverse strand. Complete transcripts and proteins can extend beyond this interval.' },
  { id: 'hbb', label: 'HBB — compact coding locus', chrom: '11', start: 5225464, end: 5229395,
    genomicHelp: 'A compact interval containing HBB and flanking DNA.',
    help: 'A compact protein-coding locus for comparing cDNA, CDS, and protein output.' },
  { id: 'malat1', label: 'MALAT1 — noncoding RNA', chrom: '11', start: 65497606, end: 65508073,
    genomicHelp: 'An interval containing a noncoding RNA locus and its genomic DNA.',
    help: 'A noncoding RNA locus. Transcript output is useful; protein/CDS output may be empty.' },
  { id: 'globins', label: 'Beta-globin cluster — several genes', chrom: '11', start: 5200000, end: 5300000,
    genomicHelp: 'A 100,001-base interval containing several genes and intergenic DNA. NCBI GenBank includes all supplied annotations across the interval.',
    help: 'Several globin genes and their transcripts, for comparing all matching and representative transcripts.' }
];
export function regionExample(source, id = 'tp53') {
  const example = regionExamples.find(row => row.id === id) ?? regionExamples[0];
  return { ...example, species: 'homo_sapiens', assembly: source === 'ucsc' ? 'hg38' : source === 'ncbi' ? 'GCF_000001405.40' : 'GRCh38',
    region: `${source === 'ucsc' ? 'chr' : ''}${example.chrom}:${example.start}-${example.end}` };
}
