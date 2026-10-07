import { formatsFor, identifier, parseRegion, required, sources, url, validateSelection, isRegionLookup, regionProduct } from './catalog.js';
import { formatFastaRecord, parseSequenceInput } from '../fasta.js';
import { makeToolResult } from '../workflow.js';
import { MAX_RESPONSE_BYTES } from './limits.js';
import { assemblyReportUrl, readAssemblySequences, verifyAssemblyRecords } from './ncbi-assembly.js';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
export { MAX_RESPONSE_BYTES } from './limits.js';
export const MAX_REGION_BASES = 1_000_000;
export const retrievalHosts = new Set(['eutils.ncbi.nlm.nih.gov', 'api.ncbi.nlm.nih.gov', 'rest.uniprot.org', 'rest.ensembl.org', 'api.genome.ucsc.edu', 'www.ebi.ac.uk', 'files.rcsb.org', 'data.rcsb.org', 'alphafold.ebi.ac.uk']);
const accessionPattern = /^(?:[A-Z]{1,6}_?\d+(?:\.\d+)?|\d+)$/i;
const uniprotPattern = /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-\d+)?$/i;
export function isUniProtId(value) { return uniprotPattern.test(value); }
export function pdbId(value) {
  const id = identifier(value, 'PDB ID').toUpperCase();
  if (!/^(?:[1-9][A-Z0-9]{3}|PDB_[A-Z0-9]{8})$/.test(id)) throw new Error('Enter a PDB ID such as 4HHB.');
  return id;
}
export function uniprotId(value) {
  const id = required(value, 'a UniProt accession', 30).toUpperCase();
  if (!isUniProtId(id)) throw new Error('Enter a UniProt accession such as P04637.');
  return id;
}
export function buildRetrieval(options = {}) {
  // Keep old saved/request descriptions compatible with the unified sequence menu.
  if (options.type === 'region') options = { ...options, type: 'nucleotide', queryMode: 'region' };
  const type = options.type === 'annotated' ? 'nucleotide' : options.type ?? 'nucleotide', source = options.source ?? 'ncbi';
  validateSelection('get', type, source);
  const format = options.format ?? formatsFor(type, source, options)[0][0];
  if (!formatsFor(type, source, options).some(([id]) => id === format)) throw new Error('Choose an output format supported by this source.');
  const plan = { type, source, format, responseType: 'text', kind: 'record', label: sources[source] };
  if (isRegionLookup(type, source, options)) {
    if (!['ncbi', 'ucsc', 'ensembl'].includes(source) || type === 'structure') throw new Error('This source does not support genomic region retrieval.');
    const r = parseRegion(options.region, MAX_REGION_BASES);
    plan.region = r;
    const product = regionProduct(type, options), strand = product === 'genomic' ? String(options.strand ?? '1') : '1';
    if (!['1', '-1'].includes(strand)) throw new Error('Choose a forward or reverse strand.');
    if (options.sequenceType && type === 'nucleotide' && !['genomic', 'cdna', 'cds'].includes(options.sequenceType)) throw new Error('Choose genomic DNA, transcripts, or coding sequences.');
    const selection = product === 'genomic' ? 'all' : options.transcriptSelection ?? 'all';
    if (!['all', 'canonical'].includes(selection)) throw new Error('Choose all matching transcripts or the source’s representative transcripts.');
    Object.assign(plan, { product, strand, selection, selectionLabel: selection === 'all' ? 'All matching transcripts' : source === 'ensembl' ? 'Ensembl Canonical transcript per gene' : 'RefSeq / MANE Select per gene' });
    if (source === 'ensembl') {
      plan.species = identifier(options.species, 'species');
      plan.assembly = options.assembly ? identifier(options.assembly, 'assembly') : '';
    } else plan.assembly = identifier(options.assembly, 'assembly');
    if (product !== 'genomic' || source === 'ncbi') {
      if (source === 'ncbi' && !/^GCF_\d{9}\.[1-9]\d*$/.test(plan.assembly)) throw new Error('Enter a versioned RefSeq reference assembly accession such as GCF_000001405.40.');
      plan.responseType = 'region-products';
      plan.url = source === 'ensembl' ? url(`https://rest.ensembl.org/info/assembly/${plan.species}`, { 'content-type': 'application/json' })
        : source === 'ncbi' ? `https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/${plan.assembly}/dataset_report`
        : url('https://api.genome.ucsc.edu/getData/track', { genome: plan.assembly, track: 'ncbiRefSeq', chrom: r.chrom, start: r.start - 1, end: r.end });
      return plan;
    }
    if (source === 'ucsc') {
      const assembly = identifier(options.assembly, 'assembly');
      plan.url = url('https://api.genome.ucsc.edu/getData/sequence', { genome: assembly, chrom: r.chrom, start: r.start - 1, end: r.end, ...(strand === '-1' ? { revComp: 1 } : {}) });
      plan.title = `${assembly} ${r.chrom}:${r.start}-${r.end}`;
      plan.responseType = 'ucsc';
    } else {
      const species = identifier(options.species, 'species'), strand = options.strand ?? '1';
      if (!['1', '-1'].includes(String(strand))) throw new Error('Choose a forward or reverse strand.');
      plan.url = url(`https://rest.ensembl.org/sequence/region/${species}/${r.chrom}:${r.start}..${r.end}:${strand}`, { 'content-type': 'text/x-fasta', coord_system_version: options.assembly ? identifier(options.assembly, 'assembly') : '' });
    }
    return plan;
  }
  const query = required(options.query, 'an accession or query');
  plan.query = query;
  if (source === 'ncbi') {
    if (options.queryMode !== 'search' && /^GC[AF]_/i.test(query)) {
      if (type !== 'nucleotide') throw new Error('An assembly accession identifies a genome. Choose Nucleotide sequence to retrieve its chromosomes and contigs.');
      if (!/^GC[AF]_\d{9}\.[1-9]\d*$/i.test(query)) throw new Error('Enter a versioned assembly accession such as GCF_001729705.1 or GCA_001729705.1.');
      plan.query = query.toUpperCase();
      plan.responseType = 'ncbi-assembly';
      plan.url = assemblyReportUrl(plan.query);
      return plan;
    }
    const db = type === 'protein' ? 'protein' : 'nuccore';
    plan.db = db;
    const search = type !== 'annotated' && (options.queryMode === 'search' || (options.queryMode !== 'accession' && !accessionPattern.test(query)));
    if (search) {
      plan.kind = 'search'; plan.responseType = 'ncbi-search';
      plan.url = url(`${EUTILS}esearch.fcgi`, { db, term: query, retmode: 'json', retmax: 20 });
    } else {
      const id = identifier(query);
      plan.url = format === 'summary'
        ? url(`${EUTILS}esummary.fcgi`, { db, id, retmode: 'json' })
        : url(`${EUTILS}efetch.fcgi`, { db, id, rettype: format === 'gb' ? 'gbwithparts' : format === 'gp' ? 'gp' : 'fasta', retmode: 'text' });
      if (format === 'summary') plan.responseType = 'ncbi-summary';
    }
  } else if (source === 'uniprot') {
    const search = options.queryMode === 'search' || (options.queryMode !== 'accession' && !isUniProtId(query));
    if (search || format === 'summary') {
      plan.kind = search ? 'search' : 'record';
      plan.responseType = 'uniprot-summary';
      plan.url = url('https://rest.uniprot.org/uniprotkb/search', { query: search ? query : `accession:${uniprotId(query)}`, format: 'tsv', fields: 'accession,id,protein_name,organism_name,length', size: 20 });
    } else {
      const id = uniprotId(query);
      if (format !== 'fasta' && /-\d+$/.test(id)) throw new Error('UniProt annotated entries describe the canonical sequence. Choose FASTA for this isoform, or enter the base UniProt accession for its complete entry.');
      plan.url = `https://rest.uniprot.org/uniprotkb/${id}.${format === 'uniprot' ? 'txt' : format}`;
    }
  } else if (source === 'ena') {
    const id = identifier(query);
    plan.url = `https://www.ebi.ac.uk/ena/browser/api/${format === 'fasta' || format === 'summary' ? 'fasta' : 'embl'}/${id}?download=false`;
  } else if (source === 'ensembl') {
    const id = identifier(query, 'Ensembl stable ID');
    const sequenceType = type === 'protein' ? 'protein' : options.sequenceType ?? 'cdna';
    if (!['protein', 'cdna', 'cds', 'genomic'].includes(sequenceType)) throw new Error('Choose a supported sequence type.');
    plan.url = url(`https://rest.ensembl.org/sequence/id/${id}`, { type: sequenceType, 'content-type': 'text/x-fasta' });
  } else if (source === 'rcsb') {
    const id = pdbId(query);
    plan.url = format === 'summary' ? `https://data.rcsb.org/rest/v1/core/entry/${id}` : `https://files.rcsb.org/download/${id}.${format}`;
    if (format === 'summary') plan.responseType = 'rcsb-summary';
  } else if (source === 'alphafold') {
    plan.url = `https://alphafold.ebi.ac.uk/api/prediction/${uniprotId(query)}`;
    plan.responseType = 'alphafold';
  }
  return plan;
}
function abortError() { return new DOMException('Retrieval cancelled.', 'AbortError'); }
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const abort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
// A single client serializes requests. Web Locks + timestamp coordinate same-origin
// tabs; a static app cannot coordinate all machines behind a classroom's shared IP.
function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function createRetrievalClient({ fetchImpl = globalThis.fetch, intervalMs = 1100, timeoutMs = 30000, maxBytes = MAX_RESPONSE_BYTES, locks = globalThis.navigator?.locks, storage = safeStorage() } = {}) {
  let queue = Promise.resolve(), nextStart = 0, cooldown = 0;
  const sizeError = () => new Error(`The response exceeds the ${maxBytes / 1024 / 1024} MiB retrieval limit. Request a summary or a smaller region.`);
  async function request(target, signal, options = {}) {
    const address = new URL(target);
    if (address.protocol !== 'https:' || !retrievalHosts.has(address.hostname)) throw new Error('Unsupported retrieval host.');
    let post = {};
    if (options.json !== undefined) {
      if (address.hostname !== 'rest.ensembl.org' || !['/lookup/id', '/sequence/id'].includes(address.pathname) || !Array.isArray(options.json.ids) || !options.json.ids.length || options.json.ids.length > 50 || options.json.ids.some(id => typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{1,99}$/.test(id)) || Object.keys(options.json).length !== 1) throw new Error('Unsupported batch retrieval request.');
      post = { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(options.json) };
    }
    const requestOnce = async () => {
      if (signal?.aborted) throw abortError();
      let saved = 0;
      try { saved = Number(storage?.getItem('sms3-external-next-request')) || 0; } catch { /* storage may be disabled */ }
      const start = Math.max(nextStart, saved, cooldown);
      await wait(Math.max(0, start - Date.now()), signal);
      nextStart = Date.now() + intervalMs;
      try { storage?.setItem('sms3-external-next-request', String(nextStart)); } catch { /* optional coordination */ }
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const response = await fetchImpl(target, { ...post, signal: controller.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) {
          if (response.status === 429 || response.status === 503) {
            const raw = response.headers.get('retry-after');
            const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.max(0, (Date.parse(raw) - Date.now()) / 1000) : 60;
            const delay = Math.max(60, Number.isFinite(seconds) ? seconds : 60);
            cooldown = Date.now() + delay * 1000;
            try { storage?.setItem('sms3-external-next-request', String(cooldown)); } catch { /* optional */ }
            throw new Error(`The service is busy or rate-limited. Wait at least ${Math.ceil(delay)} seconds before retrying. Shared classroom networks may need longer. No automatic retry was sent.`);
          }
          throw new Error(response.status === 404 ? 'No public record was found for this identifier.' : `The service returned HTTP ${response.status}. Check the identifier or try again later.`);
        }
        if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw sizeError(); }
        const reader = response.body.getReader(), decoder = new TextDecoder(), chunks = [];
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw sizeError();
            chunks.push(decoder.decode(value, { stream: true }));
          }
          chunks.push(decoder.decode());
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        const body = chunks.join('');
        if (!body.trim() || /^\s*(?:<!doctype html|<html)/i.test(body)) throw new Error('The service returned an empty response or web page instead of biological data.');
        return body;
      } catch (error) {
        if (timedOut) throw new Error('The service did not finish within 30 seconds. Try again later or request a smaller record.');
        if (signal?.aborted) throw abortError();
        if (error instanceof TypeError) throw new Error('Could not reach the service. Check your connection; the service may be unavailable or may not allow browser access (CORS).');
        throw error;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    };
    const run = () => locks?.request ? locks.request('sms3-external-retrieval', { signal }, requestOnce) : requestOnce();
    const pending = queue.then(run, run);
    queue = pending.catch(() => {});
    return pending;
  }
  return { request };
}
function json(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('The service returned invalid JSON. Try again later.'); }
  if (!value || typeof value !== 'object') throw new Error('The service returned invalid JSON data. Try again later.');
  if (value.error || value.ERROR) throw new Error(`Service error: ${String(value.error || value.ERROR).slice(0, 500)}`);
  return value;
}
function ncbiRows(value) {
  const root = value.result;
  if (!root?.uids?.length) throw new Error('No matching public record was found.');
  return root.uids.map(id => {
    const row = root[id];
    if (!row || row.error) throw new Error(row?.error || 'The record summary is unavailable.');
    return { id: row.accessionversion || row.caption || id, title: row.title || '', organism: row.organism || '', length: Number(row.slen ?? row.length) || null, molecule: row.moltype || '', topology: row.topology || '', updated: row.updatedate || '' };
  });
}
function uniprotRows(text) {
  return text.trim().split(/\r?\n/).slice(1).filter(Boolean).map(line => {
    const [id, entry, title, organism, length] = line.split('\t');
    return { id, entry, title, organism, length: Number(length), molecule: 'protein' };
  });
}
function summary(rows, plan, notes = '') {
  return `${sources[plan.source]} — summary\n\n${rows.map(row => Object.entries(row).filter(([, value]) => value !== '' && value != null).map(([key, value]) => `${key === 'length' ? `Length (${plan.type === 'protein' ? 'aa' : 'bp'})` : key[0].toUpperCase() + key.slice(1)}: ${value}`).join('\n')).join('\n\n')}\n${notes ? `\n${notes}\n` : ''}\nSource: ${plan.url}\n`;
}
function result(output, extension, plan, count = 1, warnings = []) {
  const stem = (plan.query || plan.title || 'region').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80);
  const value = makeToolResult({ output, sequenceSearch: ['gb', 'gp', 'embl', 'uniprot'].includes(plan.format) ? { format: 'flatfile', alphabet: plan.type === 'protein' ? 'protein' : 'dna-rna' } : null, download: { filename: `${stem}.${extension}`, mimeType: extension === 'fasta' ? 'text/x-fasta' : extension === 'json' ? 'application/json' : 'text/plain' }, warnings, recordsProcessed: count });
  // Carry import metadata on the text stream so a terminal workflow retrieval
  // offers the same local save action without changing its native output format.
  if (plan.type !== 'structure' && ['fasta', 'gb', 'gp', 'embl', 'uniprot', 'json'].includes(plan.format)) {
    value.streams.primary.workspaceImport = {
      kind: 'retrieved-sequence', format: plan.format,
      alphabet: plan.type === 'protein' ? 'protein' : 'dna-rna',
      source: sources[plan.source], url: plan.url,
      retrievedAt: new Date().toISOString(), download: value.download
    };
  }
  return value;
}
export async function retrieveData(plan, client, signal, onProgress) {
  if (plan.responseType === 'region-products') {
    const { regionSession } = await import('./region-common.js');
    const session = regionSession(client, signal, onProgress);
    const adapter = plan.source === 'ensembl' ? (await import('./ensembl-region.js')).retrieveEnsemblRegion
      : plan.source === 'ncbi' ? (await import('./ncbi-region.js')).retrieveNcbiRegion : (await import('./ucsc-region.js')).retrieveUcscRegion;
    const value = await adapter(plan, session);
    if (!value.genomicText) return value;
    const output = await validateRecord(value.genomicText, { ...plan, title: value.title, url: value.target }, signal);
    output.retrievalSummary = `Source: ${value.annotation}\nAssembly: ${value.assembly}\nRegion: ${plan.region.chrom}:${plan.region.start}-${plan.region.end} (1-based, inclusive)\nStrand: ${plan.strand === '-1' ? 'Reverse complement' : 'Forward'}\nLength: ${plan.region.length} bp\n${plan.format === 'gb' ? 'Sequence and all supplied annotations retained. Viewer and feature coordinates are local to this interval, starting at 1. Save to workspace or load the GenBank file in the Linear DNA Sequence Viewer.\n' : ''}`;
    return output;
  }
  const text = await client.request(plan.url, signal);
  if (signal?.aborted) throw abortError();
  if (plan.responseType === 'ncbi-assembly') {
    const sequences = await readAssemblySequences(plan, json(text), client, signal);
    const bases = sequences.reduce((sum, record) => sum + record.length, 0);
    if (!Number.isSafeInteger(bases)) throw new Error('NCBI returned an invalid assembly length.');
    if (plan.format === 'summary') return result(summary(sequences, plan, `Assembly: ${plan.query}\nSequences: ${sequences.length}\nTotal length (bp): ${bases}\nDatabase metadata; the full sequences were not downloaded.`), 'txt', plan, sequences.length);
    if (bases > MAX_RESPONSE_BYTES) throw new Error('The assembly sequences exceed the 25 MiB retrieval limit. Choose Summary report or download the full assembly from NCBI Datasets.');
    const chunks = [];
    let bytes = 0;
    // Bounded accession batches avoid long URLs and keep cancellation available.
    for (let offset = 0; offset < sequences.length; offset += 100) {
      if (signal?.aborted) throw abortError();
      const batch = sequences.slice(offset, offset + 100);
      const target = url(`${EUTILS}efetch.fcgi`, { db: 'nuccore', id: batch.map(record => record.id).join(','), rettype: plan.format === 'gb' ? 'gbwithparts' : 'fasta', retmode: 'text' });
      const records = await client.request(target, signal);
      if (signal?.aborted) throw abortError();
      const chunk = records.endsWith('\n') ? records : `${records}\n`;
      bytes += new TextEncoder().encode(chunk).byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error('The complete assembly exceeds the 25 MiB retrieval limit. Choose FASTA or Summary report, or download it from NCBI Datasets. No partial assembly was returned.');
      await validateRecord(records, plan, signal);
      verifyAssemblyRecords(records, plan.format, batch);
      chunks.push(chunk);
    }
    if (signal?.aborted) throw abortError();
    return result(chunks.join(''), plan.format, plan, sequences.length);
  }
  if (plan.responseType === 'ncbi-search') {
    const value = json(text).esearchresult;
    if (value?.errorlist) throw new Error('NCBI could not interpret the search. Check the search expression.');
    if (!value?.idlist?.length) return { matches: [], total: 0 };
    const rows = ncbiRows(json(await client.request(url(`${EUTILS}esummary.fcgi`, { db: plan.db, id: value.idlist.join(','), retmode: 'json' }), signal)));
    return { matches: rows, total: Number(value.count) };
  }
  if (plan.responseType === 'ncbi-summary') return result(summary(ncbiRows(json(text)), plan, 'Database metadata; the full sequence was not downloaded.'), 'txt', plan);
  if (plan.responseType === 'uniprot-summary') {
    const rows = uniprotRows(text);
    if (plan.kind === 'search') return { matches: rows, total: rows.length === 20 ? null : rows.length };
    if (!rows.length) throw new Error('No matching public record was found.');
    return result(summary(rows, plan, 'Database metadata; the full sequence was not downloaded.'), 'txt', plan, rows.length);
  }
  if (plan.responseType === 'rcsb-summary') {
    const value = json(text), info = value.rcsb_entry_info ?? {};
    if (!value.rcsb_id) throw new Error('No PDB entry summary was returned.');
    const row = { id: value.rcsb_id, title: value.struct?.title, method: value.exptl?.map(item => item.method).join(', '), resolution: info.resolution_combined?.join(', '), 'polymer entities': info.polymer_entity_count, 'deposited atoms': info.deposited_atom_count };
    return result(summary([row], plan, 'Resolution is in Å where reported. Structure coordinates were not downloaded.'), 'txt', plan);
  }
  if (plan.responseType === 'alphafold') {
    const models = json(text);
    if (!Array.isArray(models) || !models.length) throw new Error('No AlphaFold model was found for this UniProt accession.');
    if (plan.format === 'summary') return result(summary(models.map(m => ({ id: m.entryId, title: m.uniprotDescription, organism: m.organismScientificName, 'residue start': m.uniprotStart, 'residue end': m.uniprotEnd, 'mean pLDDT': m.globalMetricValue })), plan, 'Predicted models; pLDDT is a model confidence score. Coordinates were not downloaded.'), 'txt', plan, models.length);
    // Do not silently discard additional fragments/models.
    if (models.length > 1 && !plan.modelId) return { models: models.map(m => ({ id: m.entryId, title: `${m.uniprotStart}–${m.uniprotEnd}`, url: m[plan.format === 'pdb' ? 'pdbUrl' : 'cifUrl'] })) };
    const model = plan.modelId ? models.find(m => m.entryId === plan.modelId) : models[0];
    if (!model) throw new Error('The selected AlphaFold model is no longer available.');
    const target = new URL(model[plan.format === 'pdb' ? 'pdbUrl' : 'cifUrl']);
    if (target.protocol !== 'https:' || target.hostname !== 'alphafold.ebi.ac.uk') throw new Error('AlphaFold returned an unsupported structure download address.');
    const structure = await client.request(target.href, signal);
    return validateRecord(structure, plan, signal);
  }
  if (plan.responseType === 'ucsc') {
    const value = json(text);
    if (typeof value.dna !== 'string' || value.dna.length !== plan.region.length) throw new Error('UCSC did not return the complete requested region. Check assembly and chromosome.');
    return validateRecord(formatFastaRecord(plan.title, value.dna), plan, signal);
  }
  return validateRecord(text, plan, signal);
}
async function validateRecord(text, plan, signal) {
  if (plan.type === 'structure') {
    if (plan.format === 'cif' ? !/^data_/m.test(text) : !/^(?:HEADER|ATOM  |HETATM)/m.test(text)) throw new Error('The service did not return a valid structure record in the selected format.');
    return result(text, plan.format, plan);
  }
  if (['gb', 'gp', 'embl', 'uniprot'].includes(plan.format)) {
    const { validateAnnotatedDownload } = await import('./record-validation.js');
    const count = await validateAnnotatedDownload(text, plan.format, signal);
    return result(text, plan.format === 'uniprot' ? 'txt' : plan.format, plan, count);
  }
  if (plan.format === 'json' && plan.source === 'uniprot') {
    const value = json(text), sequence = value.sequence;
    if (!value.primaryAccession || !sequence?.value || !/^[A-Za-z*]+$/.test(sequence.value) || sequence.value.length !== sequence.length) throw new Error('UniProt did not return a complete entry with its full sequence.');
    return result(text, 'json', plan);
  }
  if (!text.trim().startsWith('>')) throw new Error('The service did not return FASTA. Check the accession and selected database.');
  const records = parseSequenceInput(text);
  if (!records.length || records.some(r => !r.sequence || !/^[A-Za-z*.-]+$/.test(r.sequence))) throw new Error('The service returned an invalid or empty FASTA record.');
  if (plan.format === 'summary') {
    const rows = [];
    for (const r of records) {
      const row = { id: r.title, length: r.sequence.length };
      if (plan.type !== 'protein') {
        let canonical = 0, gc = 0;
        for (let i = 0; i < r.sequence.length; i++) {
          const base = r.sequence.charCodeAt(i) & ~32;
          if (base === 67 || base === 71) { gc++; canonical++; }
          else if (base === 65 || base === 84 || base === 85) canonical++;
          if (i > 0 && i % 65536 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (signal?.aborted) throw abortError();
          }
        }
        row['GC (% of A/C/G/T/U)'] = canonical ? 100 * gc / canonical : 'undefined';
        row['ambiguous bases'] = r.sequence.length - canonical;
      }
      rows.push(row);
    }
    return result(summary(rows, plan, 'Calculated in your browser from retrieved sequence; the full sequence is omitted from this report.'), 'txt', plan, records.length);
  }
  return result(text, 'fasta', plan, records.length);
}
