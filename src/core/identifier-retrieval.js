import { parseExternalJson, externalServiceError } from './external-resources/errors.js';
import { buildRetrieval, createRetrievalClient, retrieveData, pdbId, uniprotId, isUniProtId } from './external-resources/get.js';
import { formatFastaRecord, parseSequenceInput } from './fasta.js';
import { parseFlatfileRecords } from './flatfile-records.js';

export const identifierProviders = {
  pdb: { label: 'RCSB PDB', field: 'PDB ID', source: 'rcsb' },
  uniprot: { label: 'UniProt', field: 'UniProt accession', source: 'uniprot' },
  'ncbi-protein': { label: 'NCBI Protein', field: 'Protein accession.version', source: 'ncbi' },
  'ncbi-nucleotide': { label: 'NCBI Nucleotide', field: 'Nucleotide accession.version', source: 'ncbi' }
};
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const abort = signal => { if (signal?.aborted) throw new DOMException('Retrieval cancelled.', 'AbortError'); };

export function planIdentifierInput(config, draft) {
  const provider = draft.provider ?? config.providers[0];
  if (!config.providers.includes(provider)) throw new Error('Choose a supported identifier source.');
  const ids = String(draft.query ?? '').trim().split(/[\s,;]+/).filter(Boolean).map(id => id.toUpperCase());
  const min = config.minRecords ?? 1, max = config.maxRecords ?? 1;
  if (ids.length < min || ids.length > max) throw new Error(min === max ? `Enter exactly ${min} ${min === 1 ? 'identifier' : 'identifiers'}.` : `Enter ${min}–${max} identifiers.`);
  if (new Set(ids).size !== ids.length) throw new Error('Enter each identifier once. Duplicate accessions would repeat a sequence.');
  for (const id of ids) {
    if (provider === 'pdb') { pdbId(id); continue; }
    if (provider === 'uniprot') {
      uniprotId(id);
      if (config.kind === 'annotated-protein' && /-\d+$/.test(id)) throw new Error('Annotated UniProt records describe the canonical protein. Use its base accession; choose a sequence analysis tool for an isoform accession.');
      continue;
    }
    if (/^GC[AF]_/.test(id)) throw new Error('An assembly accession identifies a whole genome. Enter a versioned nucleotide record accession and, for a large record, a bounded interval.');
    if (!/^[A-Z]{1,6}_?\d{5,12}\.\d+$/.test(id)) throw new Error(`Enter an exact ${identifierProviders[provider].field.toLowerCase()}. Use Find by Gene ID to choose a sequence; gene names can be searched in Get Data.`);
    if (provider === 'ncbi-protein' && /^(?:N[CMRTWZ]|X[MR]|AC|NG|NT)_/.test(id)) throw new Error('This is a nucleotide accession. Choose a protein accession such as NP_000537.3.');
    if (provider === 'ncbi-nucleotide' && /^(?:NP|XP|YP|WP|AP|ZP)_/.test(id)) throw new Error('This is a protein accession. Choose a nucleotide accession such as NM_000518.5.');
    if (config.kind === 'transcript' && !/^[NX][MR]_/.test(id)) throw new Error('siRNA targets require a spliced transcript accession (NM_, XM_, NR_, or XR_). Choose a transcript in Get Data first.');
  }
  const hasRange = String(draft.start ?? '').trim() !== '' || String(draft.end ?? '').trim() !== '';
  let range = null;
  if (hasRange) {
    if (!config.allowRange || provider !== 'ncbi-nucleotide' || ids.length !== 1) throw new Error('Intervals apply to one nucleotide record in this input.');
    const start = Number(draft.start), end = Number(draft.end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('Enter both interval endpoints as 1-based inclusive coordinates, with end at or after start.');
    range = { start, end };
    checkLength(end - start + 1, config, 'Selected interval');
  }
  return { provider, ids, range, kind: config.kind === 'phylogeny' ? provider === 'ncbi-nucleotide' ? 'nucleotide' : 'protein' : config.kind };
}

function checkLength(length, config, label) {
  if (!Number.isSafeInteger(length) || length < 1) throw new Error(`${label}: the source did not provide a valid sequence length.`);
  if (length > config.maxLength) throw new Error(`${label} has ${length.toLocaleString('en-US')} bases/residues; this input accepts at most ${config.maxLength.toLocaleString('en-US')}. ${config.allowRange ? 'Choose a bounded interval before retrieving the sequence.' : 'Choose a shorter sequence.'}`);
}

async function ncbiPreflight(id, request, config, client, signal, enforceLimits = true) {
  const db = request.provider === 'ncbi-protein' ? 'protein' : 'nuccore';
  const url = `${EUTILS}esummary.fcgi?db=${db}&id=${encodeURIComponent(id)}&retmode=json`;
  const data = parseExternalJson(await client.request(url, signal), url);
  if (data.result?.uids != null && !Array.isArray(data.result.uids)) throw externalServiceError(url, 'response');
  const records = (data.result?.uids ?? []).map(uid => data.result[uid]);
  const record = records.find(record => typeof record?.accessionversion === 'string' && record.accessionversion.toUpperCase() === id);
  if (records.length !== 1 || !record) throw new Error(`${id}: NCBI did not resolve this exact accession.version in ${db === 'protein' ? 'Protein' : 'Nucleotide'}. No replacement or gene product was selected.`);
  const length = Number(record.slen);
  if (!Number.isSafeInteger(length) || length < 1) throw new Error(`${id}: NCBI did not provide a sequence length; retrieval stopped before downloading the record.`);
  if (request.range && request.range.end > length) throw new Error(`${id} has ${length.toLocaleString('en-US')} bases; the requested interval ends beyond the record.`);
  let issue;
  try { checkLength(request.range ? request.range.end - request.range.start + 1 : length, config, id); }
  catch (error) { if (enforceLimits) throw error; issue = error.message; }
  return { issue, length, title: record.title ?? '', organism: record.organism ?? '', summaryUrl: url };
}

function decodeSequence(text, kind, id) {
  if (kind.startsWith('annotated-') || kind === 'coding-dna') {
    const parsed = parseFlatfileRecords(text);
    if (parsed.records.length !== 1) throw new Error(`${id}: expected exactly one annotated record from the source.`);
    const record = parsed.records[0];
    if (kind === 'coding-dna') {
      const cds = record.features.filter(f => f.feature === 'CDS');
      if (cds.length !== 1) throw new Error(`${id}: found ${cds.length} CDS features. Choose a transcript with exactly one CDS; no gene product was selected automatically.`);
      const feature = cds[0];
      if (!feature.nucleotide || /[<>]/.test(feature.location) || feature.qualifiers.pseudo || feature.qualifiers.pseudogene || Number(feature.qualifiers.codon_start?.[0] ?? 1) !== 1) throw new Error(`${id}: coding-DNA alignment requires a complete, supported CDS starting at codon position 1.`);
      return { sequence: feature.nucleotide, title: `${id} CDS ${feature.protein_id || feature.gene || ''}`.trim(), organism: record.organism, cdsLocation: feature.location, proteinAccession: feature.protein_id };
    }
    return { sequence: record.sequence, title: record.definition || record.title, organism: record.organism };
  }
  if (!/^>/.test(text.trim())) throw new Error(`${id}: the source did not return FASTA sequence data.`);
  const records = parseSequenceInput(text);
  if (records.length !== 1) throw new Error(`${id}: expected exactly one sequence from the source.`);
  return records[0];
}

export async function retrieveIdentifierInput(config, draft, { client = createRetrievalClient(), signal, onProgress = () => {} } = {}) {
  const request = planIdentifierInput(config, draft);
  const records = [];
  let totalBytes = 0;
  // Complete validation of the list and all NCBI lengths before full downloads.
  const summaries = new Map();
  for (const id of request.ids) {
    abort(signal);
    if (request.provider.startsWith('ncbi-')) {
      onProgress(`Checking ${id}…`);
      summaries.set(id, await ncbiPreflight(id, request, config, client, signal));
    }
  }
  for (const [index, id] of request.ids.entries()) {
    abort(signal);
    onProgress(`Retrieving ${id} (${index + 1}/${request.ids.length})…`);
    const protein = request.provider === 'ncbi-protein' || request.provider === 'uniprot';
    const annotated = request.kind.startsWith('annotated-') || request.kind === 'coding-dna';
    const format = request.provider === 'pdb' ? 'cif' : annotated ? request.provider === 'uniprot' ? 'uniprot' : protein ? 'gp' : 'gb' : 'fasta';
    const plan = buildRetrieval({ type: request.provider === 'pdb' ? 'structure' : protein ? 'protein' : 'nucleotide', source: identifierProviders[request.provider].source, query: id, queryMode: 'accession', format });
    if (request.provider.startsWith('ncbi-')) {
      const url = new URL(plan.url);
      url.searchParams.set('complexity', '1');
      if (request.range) { url.searchParams.set('seq_start', request.range.start); url.searchParams.set('seq_stop', request.range.end); url.searchParams.set('strand', '1'); }
      plan.url = url.href;
    }
    const result = await retrieveData(plan, client, signal);
    abort(signal);
    if (request.provider === 'uniprot') {
      const resolved = annotated ? result.output.match(/^AC\s+(\S+);/m)?.[1] : result.output.match(/^>(?:sp|tr)\|([^|]+)\|/)?.[1];
      if (resolved !== id) throw new Error(`${id}: UniProt did not return this exact accession. No replacement was selected.`);
    }
    totalBytes += new TextEncoder().encode(result.output).length;
    if (totalBytes > 25 * 1024 * 1024) throw new Error('The combined records exceed the 25 MiB input retrieval limit. Use fewer or smaller records.');
    const decoded = request.kind === 'structure' ? {} : decodeSequence(result.output, request.kind, id);
    if (request.kind !== 'structure') {
      checkLength(decoded.sequence?.length, config, id);
      const expectedLength = request.range ? request.range.end - request.range.start + 1 : summaries.get(id)?.length;
      if (expectedLength && request.kind !== 'coding-dna' && decoded.sequence.length !== expectedLength) throw new Error(`${id}: the returned sequence length does not match the requested record or interval.`);
      const alphabet = protein ? /^[ACDEFGHIKLMNPQRSTVWYBXZJUO*]+$/i : /^[ACGTURYSWKMBDHVNX]+$/i;
      if (!alphabet.test(decoded.sequence)) throw new Error(`${id}: the response contains symbols outside the required sequence alphabet.`);
    }
    const text = request.kind === 'coding-dna' ? formatFastaRecord(decoded.title, decoded.sequence) : result.output;
    records.push({ id, text, original: result.output, format, url: plan.url, retrievedAt: new Date().toISOString(), length: decoded.sequence?.length, title: decoded.title ?? summaries.get(id)?.title, organism: decoded.organism ?? summaries.get(id)?.organism, cdsLocation: decoded.cdsLocation, proteinAccession: decoded.proteinAccession, range: request.range });
  }
  const options = { ...(config.options ?? {}) };
  if (config.optionsFromRange) options[config.optionsFromRange] = request.range?.start ?? 1;
  if (config.kind === 'phylogeny') options.sequenceType = request.provider === 'ncbi-nucleotide' ? 'dna-rna' : 'protein';
  return { text: records.map(record => record.text.trimEnd()).join('\n') + '\n', records, provider: request.provider, options, range: request.range };
}

export function identifierDownloads(retrievals) {
  const rows = retrievals.flatMap(({ slot, result }) => result.records.map(({ text, original, ...record }) => ({ slot, provider: result.provider, ...record })));
  const files = retrievals.flatMap(({ slot, result }) => result.records.map(record => ({
    label: `Download retrieved ${record.id}${record.range ? ` (${record.range.start}–${record.range.end})` : ''}`,
    filename: `${slot}-${record.id}${record.range ? `-${record.range.start}-${record.range.end}` : ''}.${({ cif: 'cif', uniprot: 'txt', gp: 'gp', gb: 'gb', fasta: 'fasta' })[record.format]}`,
    mimeType: 'text/plain', text: record.original
  })));
  return rows.length ? [...files, { label: 'Download retrieval provenance', filename: 'input-sources.json', mimeType: 'application/json', text: JSON.stringify({ sources: rows }, null, 2) }] : [];
}

export function identifierRecordUrl(provider, id) {
  return provider === 'pdb' ? `https://www.rcsb.org/structure/${encodeURIComponent(id)}`
    : provider === 'uniprot' ? `https://www.uniprot.org/uniprotkb/${encodeURIComponent(id)}/entry`
    : `https://www.ncbi.nlm.nih.gov/${provider === 'ncbi-protein' ? 'protein' : 'nuccore'}/${encodeURIComponent(id)}`;
}

// Metadata only: checking a chromosome must never download its sequence.
export async function previewIdentifierInput(config, draft, { client = createRetrievalClient(), signal } = {}) {
  const request = planIdentifierInput(config, draft), records = [];
  for (const id of request.ids) {
    abort(signal);
    let record;
    if (request.provider.startsWith('ncbi-')) record = await ncbiPreflight(id, request, config, client, signal, false);
    else if (request.provider === 'pdb') {
      const data = parseExternalJson(await client.request(`https://data.rcsb.org/rest/v1/core/entry/${id}`, signal), 'https://data.rcsb.org');
      if (data.exptl != null && !Array.isArray(data.exptl)) throw externalServiceError('https://data.rcsb.org', 'response');
      if (data.rcsb_id !== id || typeof data.struct?.title !== 'string') throw new Error(`${id}: RCSB did not return the requested structure summary.`);
      record = { title: data.struct.title, detail: (data.exptl ?? []).map(row => row?.method).filter(method => typeof method === 'string').join(', '), resolution: data.rcsb_entry_info?.resolution_combined?.[0] };
    } else {
      const baseId = id.replace(/-\d+$/, '');
      const data = parseExternalJson(await client.request(`https://rest.uniprot.org/uniprotkb/${baseId}.json?fields=accession,protein_name,organism_name,length`, signal), 'https://rest.uniprot.org');
      if (typeof data.primaryAccession !== 'string' || !isUniProtId(data.primaryAccession)) throw externalServiceError('https://rest.uniprot.org', 'response');
      if (data.primaryAccession !== baseId) throw new Error(`${id}: UniProt resolved a different accession (${data.primaryAccession ?? 'unknown'}). Enter that accession explicitly to use it.`);
      record = { title: data.proteinDescription?.recommendedName?.fullName?.value ?? data.proteinDescription?.submissionNames?.[0]?.fullName?.value ?? id, organism: data.organism?.scientificName, length: data.sequence?.length, detail: data.entryType };
      if (baseId !== id) {
        // Canonical metadata identifies the parent protein, not the isoform's length.
        record.title += ` — isoform ${id.split('-')[1]}`;
        record.length = undefined;
        record.detail = 'Parent protein identified; exact isoform availability and length are checked on retrieval.';
      } else {
        try { checkLength(record.length, config, id); } catch (error) { record.issue = error.message; }
      }
    }
    records.push({ ...record, id, range: request.range, url: identifierRecordUrl(request.provider, id), unit: request.provider === 'uniprot' || request.provider === 'ncbi-protein' ? 'aa' : 'bp' });
  }
  abort(signal);
  return { provider: request.provider, records };
}

export async function findIdentifierGeneProducts(config, geneId, { client = createRetrievalClient(), signal } = {}) {
  if (!/^[1-9]\d{0,11}$/.test(String(geneId).trim())) throw new Error('Enter a numeric NCBI Gene ID, such as 7157.');
  const { loadGene } = await import('./external-resources/gene.js');
  const gene = await loadGene({ source: 'ncbi', id: String(geneId).trim() }, client, signal);
  const protein = config.providers.includes('ncbi-protein') && !config.providers.includes('ncbi-nucleotide');
  const seen = new Set();
  const products = gene.rowsByPlacement.flat().flatMap(row => {
    const id = protein ? row.proteinId : row.hasTranscript ? row.id : null;
    if (!id || seen.has(id) || (config.kind === 'coding-dna' && !row.cdsLength)) return [];
    seen.add(id);
    const length = protein ? row.proteinLength : row.length;
    return [{ id, title: protein ? row.proteinName : row.name, length, representative: row.representative, status: row.status, disabled: length > config.maxLength }];
  });
  return { id: gene.id, title: gene.title, symbol: gene.symbol, organism: gene.organism, provider: protein ? 'ncbi-protein' : 'ncbi-nucleotide', products };
}
