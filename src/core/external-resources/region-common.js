import { MAX_RESPONSE_BYTES } from './limits.js';
import { formatFastaRecord, parseSequenceInput } from '../fasta.js';
import { makeToolResult, makeTableStream } from '../workflow.js';

export const MAX_REGION_TRANSCRIPTS = 1000;
export const MAX_REGION_GENES = 500;
export const ENSEMBL = 'https://rest.ensembl.org';
export const DATASETS = 'https://api.ncbi.nlm.nih.gov/datasets/v2';
export const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
export const encodeUrl = (base, params = {}) => {
  const target = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== '' && value != null) target.searchParams.set(key, value);
  return target.href;
};
export function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Retrieval cancelled.', 'AbortError');
}
export function requireData(ok, message = 'The service returned incomplete or inconsistent region data. No partial result was returned.') {
  if (!ok) throw new Error(message);
}
export const cleanText = value => String(value ?? '').replace(/[\r\n\t\u0000-\u001f]+/g, ' ').trim();
export const overlap = (a, b) => a.start <= b.end && a.end >= b.start;
export const accession = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]*\d\.\d+$/.test(value);
export const stableId = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{1,99}$/.test(value);
export const versioned = row => row.version ? `${row.id}.${row.version}` : row.id;
export function checkSpan(row) {
  requireData(Number.isSafeInteger(row.start) && row.start > 0 && Number.isSafeInteger(row.end) && row.end >= row.start && ['+', '-'].includes(row.strand));
  return row;
}
export function checkTranscriptCount(rows) {
  requireData(rows.length <= MAX_REGION_TRANSCRIPTS, `This region contains more than ${MAX_REGION_TRANSCRIPTS.toLocaleString('en-US')} transcripts. Request a smaller region. No transcripts were silently truncated.`);
  const ids = new Set();
  for (const row of rows) { requireData(!ids.has(row.id)); ids.add(row.id); }
  return rows.sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id, 'en'));
}
export function regionSession(client, signal, onProgress = () => {}) {
  let bytes = 0;
  const urls = [];
  return {
    signal, urls, progress: onProgress,
    async request(target, options) {
      checkCancelled(signal);
      const text = await client.request(target, signal, options);
      checkCancelled(signal);
      bytes += new TextEncoder().encode(text).byteLength;
      requireData(bytes <= MAX_RESPONSE_BYTES, 'The complete region retrieval exceeds the 25 MiB limit. Request a smaller region. No partial result was returned.');
      urls.push(target);
      return text;
    },
    async json(target, options) {
      const text = await this.request(target, options);
      let value;
      try { value = JSON.parse(text); } catch { throw new Error('The service returned invalid region metadata. Please try again later.'); }
      requireData(value && typeof value === 'object' && !value.error && !value.ERROR);
      return value;
    }
  };
}
export function selectTranscripts(rows, selection, warnings, label) {
  if (selection === 'all') return rows;
  const selected = rows.filter(row => row.representative);
  const genes = new Set(rows.map(row => row.geneId || row.geneName));
  const selectedGenes = new Set(selected.map(row => row.geneId || row.geneName));
  const missing = genes.size - selectedGenes.size;
  if (missing) warnings.push(`${missing} matching gene(s) have no ${label} transcript overlapping this interval. No substitute transcript was chosen.`);
  return selected;
}
export function parseExactFasta(text, expected, alphabet = 'dna-rna') {
  requireData(text.trim().startsWith('>'), 'The service did not return the requested FASTA sequences.');
  const records = parseSequenceInput(text), byId = new Map(expected.map(row => [row.id, row]));
  requireData(records.length === expected.length);
  const found = new Map();
  for (const record of records) {
    const id = record.title.split(/\s+/)[0], model = byId.get(id);
    requireData(model && !found.has(id) && (alphabet === 'protein' ? /^[ACDEFGHIKLMNPQRSTVWYBXZJUO*]+$/i : /^[ACGTURYSWKMBDHVN]+$/i).test(record.sequence));
    if (model.length != null) requireData(record.sequence.length === model.length);
    found.set(id, record.sequence);
  }
  return found;
}
export const regionColumns = [
  ['geneName', 'Gene'], ['id', 'Transcript ID'], ['chromosome', 'Chromosome / sequence'],
  ['start', 'Start (1-based)'], ['end', 'End (inclusive)'], ['strand', 'Strand'], ['proteinId', 'Protein ID'],
  ['biotype', 'Type'], ['length', 'Transcript length (nt)'], ['proteinLength', 'Protein length (aa)'],
  ['representative', 'Representative designation'], ['name', 'Transcript name'], ['geneId', 'Gene ID'],
  ['exons', 'Exons (1-based, inclusive)'], ['assembly', 'Assembly'], ['source', 'Annotation source']
].map(([id, label]) => ({ id, label, ...(['start', 'end', 'length', 'proteinLength'].includes(id) ? { type: 'number' } : {}) }));

export function regionResult(plan, model, session) {
  const { rows, records = [], warnings = [], assembly, annotation, matchedCount = rows.length, geneCount = new Set(rows.map(r => r.geneId || r.geneName)).size } = model;
  const metadataOnly = ['summary', 'tsv'].includes(plan.format);
  const report = `Source: ${annotation}\nAssembly: ${assembly}\nRegion: ${plan.region.chrom}:${plan.region.start}-${plan.region.end} (1-based, inclusive)\nStrands: Both\nSelection: ${plan.selectionLabel}\nOverlapping transcripts: ${matchedCount}\nMatching genes: ${geneCount}\nSelected transcripts: ${rows.length}\n${metadataOnly ? 'Sequences were not downloaded.' : `Returned sequences: ${records.length}`}\nComplete products of overlapping transcripts in their biological orientation; sequences are not clipped to the query interval.\n`;
  const tableRows = rows.map(row => ({ ...row, source: annotation, assembly, chromosome: row.chromosome ?? plan.region.chrom,
    exons: (row.exons ?? []).map(exon => `${exon.start}-${exon.end}`).join(';') }));
  let output, extension, streams = {};
  if (plan.format === 'tsv') {
    output = [regionColumns.map(c => c.id).join('\t'), ...tableRows.map(row => regionColumns.map(c => cleanText(row[c.id])).join('\t'))].join('\n') + '\n';
    streams.table = makeTableStream(regionColumns, tableRows, 'retrieved-region-annotations'); extension = 'tsv';
  } else if (plan.format === 'summary' || !records.length) {
    output = `${report}\n${rows.map(row => `${row.id} | gene=${row.geneId || row.geneName} | ${row.chromosome ?? plan.region.chrom}:${row.start}-${row.end}:${row.strand} | ${row.biotype || ''}${row.proteinId ? ` | protein=${row.proteinId}` : ''}`).join('\n')}\n`;
    extension = 'txt';
  } else {
    output = model.nativeText ?? records.map(record => formatFastaRecord(`${record.id} ${cleanText(record.description)} [gene=${record.geneId || record.geneName}] [transcript=${record.transcriptId}] [assembly=${assembly}] [source=${annotation}]`, record.sequence)).join('');
    extension = plan.format;
  }
  requireData(new TextEncoder().encode(output).byteLength <= MAX_RESPONSE_BYTES, 'The complete output exceeds 25 MiB. Request a smaller region.');
  const stem = `${plan.source}_${plan.region.chrom}_${plan.region.start}-${plan.region.end}_${plan.product}`;
  const value = makeToolResult({ output, warnings, recordsProcessed: metadataOnly ? rows.length : records.length,
    download: { filename: `${stem}.${extension}`, mimeType: extension === 'fasta' ? 'text/x-fasta' : extension === 'tsv' ? 'text/tab-separated-values' : 'text/plain' }, streams,
    optionsUsed: { source: annotation, assembly, region: `${plan.region.chrom}:${plan.region.start}-${plan.region.end}`, selection: plan.selectionLabel } });
  value.retrievalSummary = report;
  value.retrievalFormat = extension === 'txt' ? 'report' : extension;
  value.regionMetadata = { assembly, annotation, matchedCount, geneCount, selectedCount: rows.length, returnedCount: records.length, urls: session.urls };
  if (records.length && ['fasta', 'gb', 'gp'].includes(extension)) value.streams.primary.workspaceImport = {
    kind: 'retrieved-sequence', format: extension, alphabet: plan.product === 'protein' ? 'protein' : 'dna-rna',
    source: annotation, url: plan.url, retrievedAt: new Date().toISOString(), download: value.download
  };
  return value;
}
