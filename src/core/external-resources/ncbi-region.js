import { DATASETS, EUTILS, encodeUrl, requireData, accession, checkSpan, overlap, checkTranscriptCount, selectTranscripts, parseExactFasta, regionResult, MAX_REGION_GENES } from './region-common.js';
import { parseSequenceInput } from '../fasta.js';
import { validateAnnotatedDownload } from './record-validation.js';
import { parseFlatfileRecords, parseGenbankRegion } from '../flatfile-records.js';

async function pagedReports(target, session, maximum, filtered = false) {
  const reports = [], tokens = new Set();
  let pageToken = '', total;
  do {
    const url = new URL(target); url.searchParams.set('page_size', '1000');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const page = await session.json(url.href);
    requireData(Array.isArray(page.reports) && Number.isSafeInteger(page.total_count) && page.total_count >= 0);
    requireData(page.total_count <= maximum, `This request exceeds the ${maximum.toLocaleString('en-US')} metadata record limit. Request a smaller region.`);
    requireData(total == null || total === page.total_count);
    total = page.total_count; reports.push(...page.reports);
    requireData(reports.length <= total);
    pageToken = page.next_page_token || '';
    if (pageToken) { requireData(typeof pageToken === 'string' && !tokens.has(pageToken) && reports.length < total && page.reports.length); tokens.add(pageToken); }
  } while (pageToken);
  // Chromosome-filtered sequence reports retain the unfiltered total_count.
  // Exhaust the page tokens, then require one exact primary chromosome below.
  if (!filtered) requireData(reports.length === total);
  return reports;
}
function ncbiSpan(range) {
  return checkSpan({ start: Number(range?.begin), end: Number(range?.end), strand: range?.orientation === 'plus' ? '+' : range?.orientation === 'minus' ? '-' : '' });
}
async function regionAssembly(plan, session) {
  session.progress('Checking the NCBI reference assembly…');
  const value = await session.json(plan.url), genome = value.reports?.[0];
  requireData(value.reports?.length === 1 && genome.accession === plan.assembly && genome.current_accession === plan.assembly, 'NCBI did not return the requested current assembly version. Use a current RefSeq reference assembly accession.');
  const info = genome.assembly_info;
  requireData(info?.refseq_category === 'reference genome' && info.assembly_status === 'current' && Number.isSafeInteger(genome.organism?.tax_id), 'NCBI Gene region searches use the current RefSeq reference genome. Choose its versioned GCF assembly accession.');
  const chromName = plan.region.chrom.replace(/^chr/i, '');
  const sequences = await pagedReports(encodeUrl(`${DATASETS}/genome/accession/${plan.assembly}/sequence_reports`, { chromosomes: chromName }), session, 20000, true);
  const candidates = sequences.filter(row => row.assembly_accession === plan.assembly && row.role === 'assembled-molecule' && (row.assembly_unit === 'Primary Assembly' || (plan.product === 'genomic' && row.assembly_unit === 'non-nuclear')) && [row.chr_name, row.sequence_name, row.ucsc_style_name, row.refseq_accession].includes(plan.region.chrom));
  requireData(candidates.length === 1 && accession(candidates[0].refseq_accession), 'Choose a chromosome in this assembly, such as 17 or chr17. NCBI Gene region search currently supports primary reference chromosomes.');
  const chromosome = candidates[0];
  requireData(Number.isSafeInteger(chromosome.length) && plan.region.end <= chromosome.length, 'The requested interval extends beyond this chromosome.');
  return { genome, chromosome, assembly: `${info.assembly_name} (${plan.assembly})`, annotation: genome.annotation_info?.name || 'NCBI RefSeq' };
}
export async function retrieveNcbiRegion(plan, session) {
  const { genome, chromosome, assembly, annotation } = await regionAssembly(plan, session);
  if (plan.product === 'genomic') return retrieveNcbiGenomic(plan, session, { chromosome, assembly, annotation });
  session.progress('Searching NCBI Gene for this chromosome interval…');
  const term = `${chromosome.chr_name}[chr] AND ${plan.region.start}:${plan.region.end}[chrpos] AND txid${genome.organism.tax_id}[Organism] AND alive[prop]`;
  const search = (await session.json(encodeUrl(`${EUTILS}esearch.fcgi`, { db: 'gene', term, retmode: 'json', retmax: MAX_REGION_GENES + 1 }))).esearchresult;
  requireData(search && !search.errorlist && Array.isArray(search.idlist) && /^\d+$/.test(search.count));
  requireData(Number(search.count) <= MAX_REGION_GENES, `This interval matches more than ${MAX_REGION_GENES} NCBI genes. Request a smaller region.`);
  requireData(search.idlist.length === Number(search.count) && new Set(search.idlist).size === search.idlist.length && search.idlist.every(id => /^\d+$/.test(id)));
  const rows = [], warnings = [];
  let genesWithoutTranscripts = 0;
  for (let offset = 0; offset < search.idlist.length; offset += 50) {
    const ids = search.idlist.slice(offset, offset + 50);
    session.progress(`Reading NCBI gene products ${offset + 1}–${offset + ids.length} of ${search.idlist.length}…`);
    const reports = await pagedReports(`${DATASETS}/gene/id/${ids.join(',')}/product_report`, session, MAX_REGION_GENES);
    const found = new Set();
    for (const report of reports) {
      const gene = report.product;
      requireData(gene && ids.includes(gene.gene_id) && !found.has(gene.gene_id) && String(gene.tax_id) === String(genome.organism.tax_id));
      found.add(gene.gene_id);
      const transcripts = gene.transcripts ?? [];
      requireData(Array.isArray(transcripts) && transcripts.length === (gene.transcript_count ?? 0));
      if (!transcripts.length) genesWithoutTranscripts++;
      for (const transcript of transcripts) {
        requireData(accession(transcript.accession_version) && Number.isSafeInteger(transcript.length) && transcript.length > 0 && Array.isArray(transcript.genomic_locations));
        const locations = transcript.genomic_locations.filter(location => location.genomic_accession_version === chromosome.refseq_accession);
        requireData(locations.length <= 1);
        if (!locations.length) continue; // Other assemblies are never substituted.
        const location = locations[0], span = ncbiSpan(location.genomic_range);
        if (!overlap(span, plan.region)) continue; // Gene overlap alone is insufficient.
        const row = { id: transcript.accession_version, geneId: gene.gene_id, geneName: gene.symbol, name: transcript.name,
          ...span, chromosome: chromosome.refseq_accession, length: transcript.length, biotype: transcript.type || gene.type,
          representative: ['MANE_SELECT', 'REFSEQ_SELECT'].includes(transcript.select_category) ? transcript.select_category.replaceAll('_', ' ') : '' };
        requireData(Array.isArray(location.exons) && location.exons.length > 0);
        row.exons = location.exons.map(ncbiSpan).sort((a, b) => a.start - b.start);
        requireData(row.exons.every(exon => exon.start >= row.start && exon.end <= row.end && exon.strand === row.strand));
        if (transcript.protein) {
          requireData(accession(transcript.protein.accession_version) && Number.isSafeInteger(transcript.protein.length) && transcript.protein.length > 0);
          row.proteinId = transcript.protein.accession_version; row.proteinLength = transcript.protein.length;
        }
        if (transcript.cds) {
          requireData(transcript.cds.accession_version === row.id && Array.isArray(transcript.cds.range) && transcript.cds.range.length > 0);
          const spans = transcript.cds.range.map(ncbiSpan);
          requireData(spans.every(span => span.end <= row.length));
          row.cdsLength = spans.reduce((sum, span) => sum + span.end - span.start + 1, 0);
        }
        rows.push(row);
      }
    }
    requireData(found.size === ids.length, 'NCBI did not provide metadata for every matching gene. No partial result was returned.');
  }
  checkTranscriptCount(rows);
  if (genesWithoutTranscripts) warnings.push(`${genesWithoutTranscripts} matching NCBI Gene record(s) have no transcript records in the product report.`);
  if (!rows.length) warnings.push('No annotated transcripts overlap this interval on the requested reference chromosome.');
  return retrieveNcbiProducts(plan, rows, session, { warnings, assembly, annotation: `NCBI RefSeq (${annotation})`, geneCount: search.idlist.length });
}

// Shared by genomic-region discovery and exact NCBI Gene product selection.
export async function retrieveNcbiProducts(plan, rows, session, metadata) {
  const warnings = [...(metadata.warnings ?? [])];
  const selected = selectTranscripts(rows, plan.selectedIds ?? plan.selection, warnings, 'RefSeq/MANE Select');
  const products = ['protein', 'cds'].includes(plan.product) ? selected.filter(row => row.proteinId && (plan.product !== 'cds' || row.cdsLength)) : plan.product === 'cdna' ? selected.filter(row => row.hasTranscript !== false) : selected;
  if (products.length < selected.length) warnings.push(`${selected.length - products.length} selected record(s) have no annotated ${plan.product === 'protein' ? 'protein' : plan.product === 'cdna' ? 'transcript' : 'CDS'} product and were excluded.`);
  const records = [], nativeChunks = [];
  if (!['summary', 'tsv'].includes(plan.format)) {
    const protein = plan.product === 'protein';
    const ids = [...new Set(products.map(row => protein ? row.proteinId : row.id))];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      session.progress(`Retrieving RefSeq sequences ${offset + 1}–${offset + batch.length} of ${ids.length}…`);
      const native = ['gb', 'gp'].includes(plan.format);
      const rettype = native ? plan.format === 'gb' ? 'gbwithparts' : 'gp' : plan.product === 'cds' ? 'fasta_cds_na' : 'fasta';
      const text = await session.request(encodeUrl(`${EUTILS}efetch.fcgi`, { db: protein ? 'protein' : 'nuccore', id: batch.join(','), rettype, retmode: 'text' }));
      const expected = batch.map(id => { const row = products.find(row => (protein ? row.proteinId : row.id) === id); return { id, length: protein ? row.proteinLength : row.length }; });
      let sequences;
      if (native) {
        await validateAnnotatedDownload(text, plan.format, session.signal);
        const parsed = parseFlatfileRecords(text).records;
        requireData(parsed.length === expected.length && new Set(parsed.map(row => row.accession)).size === parsed.length);
        sequences = new Map(parsed.map(row => [row.accession, row.sequence]));
        for (const row of expected) requireData(sequences.get(row.id)?.length === row.length);
        nativeChunks.push(text);
      } else if (plan.product === 'cds') {
        requireData(text.trim().startsWith('>'));
        const parsed = parseSequenceInput(text); sequences = new Map();
        requireData(parsed.length === batch.length);
        for (const record of parsed) {
          const id = record.title.match(/^lcl\|(.+?)_cds_/ )?.[1], row = products.find(row => row.id === id);
          requireData(row && batch.includes(id) && !sequences.has(id) && record.title.includes(`[protein_id=${row.proteinId}]`) && record.sequence.length === row.cdsLength && /^[ACGTURYSWKMBDHVN]+$/i.test(record.sequence));
          sequences.set(id, record.sequence);
        }
      } else sequences = parseExactFasta(text, expected, protein ? 'protein' : 'dna-rna');
      for (const id of batch) {
        const mapped = products.filter(row => (protein ? row.proteinId : row.id) === id), row = mapped[0];
        requireData(sequences.has(id));
        records.push({ id, transcriptId: mapped.filter(row => row.hasTranscript !== false).map(row => row.id).join(','), geneId: row.geneId, description: row.name, sequence: sequences.get(id) });
      }
    }
  }
  return regionResult(plan, { rows: selected, records, nativeText: nativeChunks.length ? nativeChunks.join('\n') : undefined, ...metadata, warnings, matchedCount: rows.length }, session);
}

export async function retrieveNcbiGenomic(plan, session, { chromosome, assembly, annotation }) {
  const annotated = plan.format === 'gb';
  session.progress(annotated ? 'Retrieving genomic DNA and NCBI feature annotations…' : 'Retrieving genomic DNA…');
  const target = encodeUrl(`${EUTILS}efetch.fcgi`, { db: 'nuccore', id: chromosome.refseq_accession, seq_start: plan.region.start, seq_stop: plan.region.end, strand: plan.strand === '-1' ? 2 : 1, rettype: annotated ? 'gbwithparts' : 'fasta', retmode: 'text' });
  const text = await session.request(target);
  const title = `${chromosome.refseq_accession}_${plan.region.start}-${plan.region.end}${plan.strand === '-1' ? '_reverse' : ''}`;
  if (annotated) {
    requireData(await validateAnnotatedDownload(text, 'gb', session.signal) === 1);
    const returnedRegion = parseGenbankRegion(text);
    // EFetch omits REGION only for a complete chromosome on its forward strand.
    const wholeChromosome = plan.strand === '1' && plan.region.start === 1 && plan.region.end === chromosome.length && !/^ACCESSION[^\r\n]*\bREGION:/m.test(text) && text.match(/^VERSION\s+(\S+)/m)?.[1] === chromosome.refseq_accession;
    requireData(wholeChromosome || (returnedRegion?.accession === chromosome.refseq_accession && returnedRegion.start === plan.region.start && returnedRegion.end === plan.region.end && returnedRegion.strand === (plan.strand === '-1' ? '-' : '+')), 'NCBI did not return the exact chromosome version, interval and strand requested. No region was substituted.');
    const sequence = text.match(/^ORIGIN[^\r\n]*\r?\n([\s\S]*?)^\/\//m)?.[1]?.replace(/[\s\d]/g, '') ?? '';
    requireData(sequence.length === plan.region.length && /^[ACGTURYSWKMBDHVN]+$/i.test(sequence));
    return { genomicText: text, assembly, annotation, target, title };
  }
  requireData(text.trim().startsWith('>'));
  const records = parseSequenceInput(text);
  const interval = plan.strand === '-1' ? `c${plan.region.end}-${plan.region.start}` : `${plan.region.start}-${plan.region.end}`;
  requireData(records.length === 1 && records[0].title.split(/\s/)[0] === `${chromosome.refseq_accession}:${interval}` && records[0].sequence.length === plan.region.length && /^[ACGTURYSWKMBDHVN]+$/i.test(records[0].sequence));
  return { genomicText: text, assembly, annotation, target, title };
}
