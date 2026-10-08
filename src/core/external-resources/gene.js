import { DATASETS, EUTILS, ENSEMBL, encodeUrl, requireData, checkSpan, accession, checkTranscriptCount, regionSession, versioned, cleanText } from './region-common.js';
import { retrieveNcbiProducts, retrieveNcbiGenomic } from './ncbi-region.js';
import { retrieveEnsemblProducts } from './ensembl-region.js';
import { knownOrganism, resolveOrganism } from './organisms.js';
import { buildRetrieval, retrieveData, validateRecord } from './get.js';

// NCBI Entrez Gene supplies discovery, not broad Nucleotide/Protein queries.
// Schemas: https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/data-reports/gene/
// https://www.ncbi.nlm.nih.gov/datasets/docs/v2/reference-docs/data-reports/gene-product/
// Ensembl: https://rest.ensembl.org/documentation/info/xref_external
export const geneProducts = [
  ['genomic', 'Genomic DNA', 'The gene’s genomic span, including introns. Optional flanks extend the interval.'],
  ['cdna', 'Transcripts (with UTRs)', 'Complete spliced transcripts represented as DNA (cDNA). Introns are removed; untranslated regions (UTRs) are retained.'],
  ['cds', 'Coding sequences (CDS)', 'The protein-coding part of each transcript, without UTRs or introns. Noncoding transcripts have no CDS.'],
  ['protein', 'Proteins', 'Amino acid sequences linked to the selected transcripts. Shared proteins are returned once.'],
  ['annotations', 'Gene / transcript annotations', 'Transcript spans, exons, and linked protein identifiers; select a sequence type to retrieve their sequences.']
];
const jsonUrl = (path, params = {}) => encodeUrl(`${ENSEMBL}${path}`, { 'content-type': 'application/json', ...params });
const ncbiSpan = range => checkSpan({ start: Number(range?.begin), end: Number(range?.end), strand: range?.orientation === 'minus' ? '-' : range?.orientation === 'plus' ? '+' : '' });
export function referenceStatus(id) {
  return /^(XM_|XR_|XP_)/.test(id) ? 'Predicted RefSeq' : /^(NM_|NR_|NP_|NC_|NG_)/.test(id) ? 'RefSeq reference record' : 'Source annotation';
}
export async function searchGenes({ source = 'ncbi', query, organism, page = 0 }, client, signal) {
  query = String(query ?? '').trim();
  requireData(query && query.length <= 200, 'Enter a gene symbol, name, synonym, or Gene ID (up to 200 characters).');
  requireData(Number.isSafeInteger(page) && page >= 0 && page <= 499, 'Choose a valid results page.');
  organism = typeof organism === 'string' ? knownOrganism(organism) : organism;
  requireData(organism?.taxId && /^\d+$/.test(organism.taxId), 'Choose an organism before searching for genes.');
  const session = regionSession(client, signal);
  if (source === 'ncbi') {
    // Quote phrases to keep the simple search independent of database syntax.
    const term = `${/^\d+$/.test(query) ? `${query}[uid]` : `"${query.replaceAll('"', '')}"[Gene Name]`} AND txid${organism.taxId}[Organism] AND alive[prop]`;
    let search = (await session.json(encodeUrl(`${EUTILS}esearch.fcgi`, { db: 'gene', term, retmode: 'json', retmax: 20, retstart: page * 20 }))).esearchresult;
    requireData(search && !Object.values(search.errorlist ?? {}).some(items => items.length) && Array.isArray(search.idlist) && search.idlist.every(id => /^\d+$/.test(id)) && /^\d+$/.test(search.count), 'NCBI Gene could not interpret this name. Try a gene symbol or a shorter name.');
    if (Number(search.count) === 0 && !/^\d+$/.test(query)) {
      const broadTerm = `"${query.replaceAll('"', '')}"[All Fields] AND txid${organism.taxId}[Organism] AND alive[prop]`;
      search = (await session.json(encodeUrl(`${EUTILS}esearch.fcgi`, { db: 'gene', term: broadTerm, retmode: 'json', retmax: 20, retstart: page * 20 }))).esearchresult;
      requireData(search && Array.isArray(search.idlist) && search.idlist.every(id => /^\d+$/.test(id)) && /^\d+$/.test(search.count));
    }
    if (!search.idlist.length) return { matches: [], total: Number(search.count), page };
    const summary = (await session.json(encodeUrl(`${EUTILS}esummary.fcgi`, { db: 'gene', id: search.idlist.join(','), retmode: 'json' }))).result;
    const matches = search.idlist.map(id => {
      const row = summary?.[id]; requireData(row && !row.error && row.name && row.organism?.scientificname);
      return { id, symbol: row.name, title: row.description || '', organism: row.organism.scientificname, taxId: String(row.organism.taxid), aliases: row.otheraliases || '', chromosome: row.chromosome || '', description: row.summary || '' };
    });
    // Exact symbols first; synonyms remain visible for a deliberate choice.
    matches.sort((a, b) => Number(b.symbol.toLowerCase() === query.toLowerCase()) - Number(a.symbol.toLowerCase() === query.toLowerCase()));
    return { matches, total: Number(search.count), page };
  }
  requireData(source === 'ensembl' && /^[a-z0-9_]+$/.test(organism.species), 'Choose a supported gene source and species.');
  organism = await resolveOrganism(organism, source, client, signal);
  let ids;
  if (/^ENS[A-Z]*G\d+(?:\.\d+)?$/i.test(query)) ids = [query.replace(/\.\d+$/, '')];
  else {
    const rows = await session.json(jsonUrl(`/xrefs/symbol/${organism.species}/${encodeURIComponent(query)}`, { object_type: 'gene' }));
    requireData(Array.isArray(rows)); ids = [...new Set(rows.filter(row => row.type === 'gene').map(row => row.id))];
  }
  requireData(ids.length <= 1000, 'More than 1,000 Ensembl matches; use a more specific symbol.');
  const batch = ids.slice(page * 20, page * 20 + 20), matches = [];
  if (batch.length) {
    const response = await session.json(`${ENSEMBL}/lookup/id`, { json: { ids: batch } });
    for (const id of batch) {
      const row = response[id]; requireData(row?.object_type === 'Gene' && row.species === organism.species);
      matches.push({ id, symbol: row.display_name || id, title: row.description || row.biotype, organism: organism.name, chromosome: row.seq_region_name, assembly: row.assembly_name });
    }
  }
  return { matches, total: ids.length, page };
}

function ncbiRows(gene, product, placement) {
  const transcripts = product.transcripts ?? [];
  requireData(Array.isArray(transcripts) && transcripts.filter(row => row.accession_version).length === (product.transcript_count ?? 0));
  return checkTranscriptCount(transcripts.flatMap(transcript => {
    const hasTranscript = Boolean(transcript.accession_version);
    requireData(hasTranscript ? accession(transcript.accession_version) && Number.isSafeInteger(transcript.length) && transcript.length > 0 : accession(transcript.protein?.accession_version));
    const locations = (transcript.genomic_locations ?? []).filter(row => !placement || row.genomic_accession_version === placement.chrom);
    if (placement && !locations.length) return [];
    const location = locations[0];
    const row = { id: hasTranscript ? transcript.accession_version : transcript.protein.accession_version, hasTranscript, geneId: gene.gene_id, geneName: gene.symbol, name: transcript.name || transcript.protein?.name || '', length: hasTranscript ? transcript.length : null,
      biotype: transcript.type || gene.type, status: referenceStatus(transcript.accession_version || transcript.protein?.accession_version), chromosome: location?.genomic_accession_version || '',
      ...(location ? ncbiSpan(location.genomic_range) : { start: null, end: null, strand: '' }),
      exons: location?.exons?.map(ncbiSpan) ?? [], representative: ['MANE_SELECT', 'REFSEQ_SELECT'].includes(transcript.select_category) ? transcript.select_category.replaceAll('_', ' ') : '' };
    if (transcript.protein) {
      requireData(accession(transcript.protein.accession_version) && Number.isSafeInteger(transcript.protein.length) && transcript.protein.length > 0);
      Object.assign(row, { proteinId: transcript.protein.accession_version, proteinLength: transcript.protein.length, proteinName: [transcript.protein.name, transcript.protein.isoform_name].filter(Boolean).join(' — ') });
    }
    if (hasTranscript && transcript.cds) {
      requireData(transcript.cds.accession_version === row.id && Array.isArray(transcript.cds.range));
      const spans = transcript.cds.range.map(ncbiSpan); requireData(spans.length && spans.every(span => span.end <= row.length));
      row.cdsLength = spans.reduce((sum, span) => sum + span.end - span.start + 1, 0);
    }
    return [row];
  }));
}
export async function loadGene({ source = 'ncbi', id, organism }, client, signal, onProgress) {
  const session = regionSession(client, signal, onProgress);
  if (source === 'ncbi') {
    requireData(/^\d+$/.test(id), 'Choose an NCBI Gene match.');
    session.progress('Reading the gene and its transcript–protein relationships…');
    const report = await session.json(`${DATASETS}/gene/id/${id}`), gene = report.reports?.[0]?.gene;
    requireData(report.reports?.length === 1 && gene?.gene_id === id && gene.taxname, 'NCBI did not return the selected gene.');
    if (organism?.taxId) requireData(String(gene.tax_id) === organism.taxId, 'The selected gene belongs to a different organism.');
    const response = await session.json(`${DATASETS}/gene/id/${id}/product_report`), product = response.reports?.[0]?.product;
    requireData(response.reports?.length === 1 && product?.gene_id === id && String(product.tax_id) === String(gene.tax_id), 'Product metadata for this gene is unavailable. Direct accession retrieval remains available.');
    const placements = (gene.annotations ?? []).flatMap(annotation => (annotation.genomic_locations ?? []).map(location => ({
      ...ncbiSpan(location.genomic_range), chrom: location.genomic_accession_version, assembly: annotation.assembly_accession,
      assemblyName: annotation.assembly_name, annotation: annotation.annotation_name,
      label: `${annotation.assembly_name} — ${location.sequence_name || location.genomic_accession_version} (${annotation.assembly_accession})`
    })));
    requireData(placements.every(row => accession(row.chrom) && /^GC[AF]_\d+\.\d+$/.test(row.assembly)));
    return { source, id, symbol: gene.symbol, title: gene.description, organism: gene.taxname, taxId: String(gene.tax_id), placements,
      rowsByPlacement: placements.length ? placements.map(row => ncbiRows(gene, product, row)) : [ncbiRows(gene, product)],
      url: `${DATASETS}/gene/id/${id}`, urls: session.urls, uniprotIds: gene.swiss_prot_accessions ?? [] };
  }
  requireData(source === 'ensembl' && /^ENS[A-Z]*G\d+$/i.test(id), 'Choose an Ensembl gene match.');
  const gene = await session.json(jsonUrl(`/lookup/id/${id}`, { expand: 1 }));
  requireData(gene.id === id && gene.object_type === 'Gene' && gene.species === organism.species && Array.isArray(gene.Transcript));
  const placement = { start: gene.start, end: gene.end, strand: gene.strand === -1 ? '-' : '+', chrom: gene.seq_region_name, assembly: gene.assembly_name, assemblyName: gene.assembly_name, annotation: 'Ensembl', label: `${gene.assembly_name} — chromosome ${gene.seq_region_name}` };
  checkSpan(placement);
  const rows = checkTranscriptCount(gene.Transcript.map(transcript => {
    requireData(transcript.Parent === id && transcript.version && transcript.assembly_name === gene.assembly_name && Array.isArray(transcript.Exon));
    const exons = transcript.Exon.map(row => checkSpan({ start: row.start, end: row.end, strand: transcript.strand === -1 ? '-' : '+' }));
    const length = exons.reduce((sum, exon) => sum + exon.end - exon.start + 1, 0);
    requireData(length > 0);
    const protein = transcript.Translation;
    if (protein) requireData(protein.Parent === transcript.id && typeof protein.id === 'string' && Number.isInteger(protein.version) && protein.version > 0 && Number.isSafeInteger(protein.length) && protein.length > 0);
    return checkSpan({ id: versioned(transcript), stableId: transcript.id, version: transcript.version, geneId: id, geneName: gene.display_name,
      name: transcript.display_name || '', start: transcript.start, end: transcript.end, strand: transcript.strand === -1 ? '-' : '+',
      chromosome: gene.seq_region_name, length, exons, biotype: transcript.biotype, status: transcript.logic_name || 'Ensembl annotation',
      representative: transcript.is_canonical ? 'Ensembl Canonical' : '',
      ...(protein ? { proteinId: versioned(protein), proteinStableId: protein.id, proteinVersion: protein.version, proteinLength: protein.length } : {}) });
  }));
  return { source, id, symbol: gene.display_name || id, title: gene.description || '', organism: organism.name, species: gene.species,
    placements: [placement], rowsByPlacement: [rows], url: jsonUrl(`/lookup/id/${id}`, { expand: 1 }), urls: session.urls };
}

export function geneFormats(source, product) {
  if (product === 'annotations') return [['tsv', 'Gene / transcript table'], ['summary', 'Summary report']];
  const choices = [['fasta', 'FASTA'], ['summary', 'Summary report']];
  if (source === 'ncbi' && product !== 'cds') choices.splice(1, 0, product === 'protein' ? ['gp', 'GenPept (with annotations)'] : ['gb', 'GenBank (with annotations)']);
  return choices;
}
export function genePlan(model, options = {}) {
  const product = options.product ?? 'cdna', format = options.format ?? geneFormats(model.source, product)[0][0];
  requireData(geneProducts.some(([id]) => id === product) && geneFormats(model.source, product).some(([id]) => id === format), 'Choose a supported sequence type and output format.');
  const index = Number(options.placement ?? 0), placement = model.placements[index];
  requireData(Number.isInteger(index) && index >= 0 && index < Math.max(1, model.placements.length), 'Choose an available assembly.');
  const rows = model.rowsByPlacement[index];
  const plan = { type: product === 'protein' ? 'protein' : product === 'annotations' ? 'annotations' : 'nucleotide', source: model.source, product, format,
    geneLabel: `${model.symbol} (${model.id})`, organism: model.organism, species: model.species, region: placement ? { ...placement } : null,
    assembly: placement?.assembly || 'Not supplied', url: model.url, selectedIds: options.selectedIds,
    selection: options.selection ?? 'all', selectionLabel: options.selectedIds ? `${options.selectedIds.length} explicitly selected transcript(s)` : options.selection === 'canonical' ? 'Source representative transcripts' : 'All associated transcripts' };
  if (product === 'genomic') {
    requireData(placement, 'No genomic placement is available for this gene. Choose a transcript or protein instead.');
    const upstream = Number(options.upstream ?? 0), downstream = Number(options.downstream ?? 0);
    requireData([upstream, downstream].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000), 'Flanks must be whole numbers from 0 to 100,000 bases.');
    const start = placement.start - (placement.strand === '-' ? downstream : upstream), end = placement.end + (placement.strand === '-' ? upstream : downstream);
    requireData(start >= 1, 'The upstream/downstream flank extends before the chromosome. Reduce the flanking sequence.');
    requireData(end - start + 1 <= 1_000_000, 'Request at most 1,000,000 genomic bases; transcript and protein retrieval remain available.');
    requireData(!options.orientation || ['reference', 'gene'].includes(options.orientation), 'Choose reference or gene orientation.');
    Object.assign(plan, { strand: options.orientation === 'gene' && placement.strand === '-' ? '-1' : '1', upstream, downstream,
      region: { ...placement, start, end, length: end - start + 1 } });
  }
  return { plan, rows, placement };
}
export async function retrieveGene(model, options, client, signal, onProgress) {
  const { plan, rows, placement } = genePlan(model, options);
  const session = regionSession(client, signal, onProgress);
  if (plan.product === 'genomic') {
    // Shared retrieval verifies chromosome version, full span and orientation.
    let result;
    if (model.source === 'ncbi') {
      const info = (await session.json(encodeUrl(`${EUTILS}esummary.fcgi`, { db: 'nuccore', id: plan.region.chrom, retmode: 'json' }))).result;
      const row = info?.[info.uids?.[0]];
      requireData(row?.accessionversion === plan.region.chrom && Number.isSafeInteger(row.slen) && plan.region.end <= row.slen, 'The gene interval or its flanks extend beyond the exact reference chromosome. Reduce the flank.');
      const value = await retrieveNcbiGenomic(plan, session, { chromosome: { refseq_accession: plan.region.chrom, length: row.slen }, assembly: placement.assembly, annotation: placement.annotation });
      result = await validateRecord(value.genomicText, { ...plan, title: value.title, url: value.target }, signal);
    } else result = await retrieveData(buildRetrieval({ ...plan, queryMode: 'region', sequenceType: 'genomic', region: `${plan.region.chrom}:${plan.region.start}-${plan.region.end}` }), client, signal, onProgress);
    result.retrievalSummary = `Gene: ${plan.geneLabel}\nOrganism: ${model.organism}\nAssembly: ${placement.assemblyName} (${placement.assembly})\nRegion: ${plan.region.chrom}:${plan.region.start}-${plan.region.end}\nDNA orientation: ${plan.strand === '-1' ? 'Gene (reverse complement)' : 'Reference (+)'}\nFlanks relative to gene: ${plan.upstream} bp upstream; ${plan.downstream} bp downstream\n${result.retrievalSummary || ''}`;
    result.optionsUsed = { ...result.optionsUsed, source: model.source, assembly: placement.assembly, gene: model.id, region: `${plan.region.chrom}:${plan.region.start}-${plan.region.end}`, orientation: plan.strand };
    if (plan.format === 'fasta') {
      result.output = result.output.replace(/^(>[^\r\n]*)/, header => `${header} [gene=${cleanText(model.symbol)}] [assembly=${cleanText(placement.assemblyName)} ${placement.assembly}] [organism=${cleanText(model.organism)}] [source=${model.source}] [orientation=${plan.strand}]`);
      result.streams.primary.text = result.output;
    } else if (plan.format === 'summary') {
      result.output = `${result.retrievalSummary}\n${result.output}`; result.streams.primary.text = result.output;
    }
    return withProvenance(result, model, plan, session);
  }
  requireData(rows.length > 0 || ['summary', 'tsv'].includes(plan.format), 'This source provides no transcript products for this gene on this assembly. Try another assembly or source, or retrieve genomic DNA.');
  const metadata = { assembly: placement ? `${placement.assemblyName} (${placement.assembly})` : 'Not supplied', annotation: `${model.source === 'ncbi' ? 'NCBI RefSeq' : 'Ensembl'}${placement?.annotation ? ` (${placement.annotation})` : ''}`, geneCount: 1 };
  const result = await (model.source === 'ncbi' ? retrieveNcbiProducts(plan, rows, session, metadata) : retrieveEnsemblProducts({ ...plan, selectedIds: plan.selectedIds ?? plan.selection }, rows, session, metadata));
  return withProvenance(result, model, plan, session);
}

function withProvenance(result, model, plan, session) {
  const provenance = { source: model.source, geneId: model.id, gene: model.symbol, organism: model.organism,
    assembly: plan.assembly, region: plan.region, sequenceType: plan.product, format: plan.format,
    annotationsIncluded: ['gb', 'gp', 'tsv'].includes(plan.format), selection: plan.selectedIds ?? plan.selection,
    urls: [...new Set([...model.urls, ...session.urls])], retrievedAt: new Date().toISOString() };
  result.optionsUsed = { ...result.optionsUsed, gene: model.id, organism: model.organism, sequenceType: plan.product };
  result.downloads.push({ label: 'Download provenance', filename: `${model.source}_${model.id}_provenance.json`, mimeType: 'application/json', text: JSON.stringify(provenance, null, 2) + '\n' });
  if (result.streams.primary.workspaceImport) result.streams.primary.workspaceImport.source = `${model.source}; ${model.organism}; ${plan.assembly}; gene ${model.id}`;
  return result;
}
