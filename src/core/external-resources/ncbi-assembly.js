import { url } from './catalog.js';
import { MAX_ASSEMBLY_SEQUENCES } from './limits.js';
import { parseSequenceInput } from '../fasta.js';

export function assemblyReportUrl(accession, pageToken = '') {
  return url(`https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/${accession}/sequence_reports`, {
    page_size: MAX_ASSEMBLY_SEQUENCES, page_token: pageToken
  });
}

// Datasets supplies the actual assembly members, their versions and lengths.
// In particular, never substitute the paired GCA/GCF assembly or a WGS master.
export async function readAssemblySequences(plan, firstPage, client, signal) {
  const sequences = [], ids = new Set(), tokens = new Set();
  let page = firstPage, total;
  while (true) {
    if (signal?.aborted) throw new DOMException('Retrieval cancelled.', 'AbortError');
    const count = Number(page?.total_count);
    if (page?.error || !Number.isSafeInteger(count) || count < 1 || !Array.isArray(page?.reports) || !page.reports.length) {
      throw new Error(`NCBI has no sequence report for ${plan.query}. Check the assembly accession and version.`);
    }
    if (count > MAX_ASSEMBLY_SEQUENCES) throw new Error(`This assembly has ${count.toLocaleString('en-US')} sequences; Get Data supports at most ${MAX_ASSEMBLY_SEQUENCES.toLocaleString('en-US')} per assembly. Download the full assembly from NCBI Datasets.`);
    if (total !== undefined && count !== total) throw new Error('The assembly sequence report changed during retrieval. Please retrieve it again.');
    total = count;
    if (sequences.length + page.reports.length > total) throw new Error('NCBI returned more assembly sequences than its reported total.');
    for (const row of page.reports) {
      const id = plan.query.startsWith('GCF_') ? row?.refseq_accession : row?.genbank_accession;
      if (row?.assembly_accession !== plan.query || !/^[A-Z][A-Z0-9_]*\d\.\d+$/.test(id ?? '') || ids.has(id) || !Number.isSafeInteger(row.length) || row.length < 1) {
        throw new Error('NCBI returned incomplete or inconsistent assembly sequence metadata. No partial assembly was returned.');
      }
      ids.add(id);
      sequences.push({ id, length: row.length, name: row.sequence_name || '', molecule: row.assigned_molecule_location_type || '', role: row.role || '' });
    }
    const token = page.next_page_token;
    if (!token) break;
    if (typeof token !== 'string' || tokens.has(token) || sequences.length >= total) throw new Error('NCBI returned an inconsistent assembly sequence page. No partial assembly was returned.');
    tokens.add(token);
    const text = await client.request(assemblyReportUrl(plan.query, token), signal);
    try { page = JSON.parse(text); } catch { throw new Error('NCBI returned invalid assembly metadata. Please try again later.'); }
  }
  if (sequences.length !== total) throw new Error('NCBI returned an incomplete assembly sequence report. No partial assembly was returned.');
  return sequences;
}

// Run after ordinary FASTA/GenBank validation. A valid record is insufficient:
// every requested member must be present exactly once with the expected length.
export function verifyAssemblyRecords(text, format, expected) {
  const actual = format === 'fasta'
    ? parseSequenceInput(text).map(record => ({ id: record.title.split(/\s+/)[0], length: record.sequence.length }))
    : [...text.matchAll(/^LOCUS[ \t]+\S+[ \t]+(\d+)[ \t]+bp\b[\s\S]*?^VERSION[ \t]+(\S+)/gm)].map(match => ({ id: match[2], length: Number(match[1]) }));
  const remaining = new Map(expected.map(record => [record.id, record.length]));
  if (actual.length !== expected.length || actual.some(record => {
    if (remaining.get(record.id) !== record.length) return true;
    remaining.delete(record.id);
    return false;
  })) throw new Error('NCBI returned missing, duplicate, or mismatched assembly sequences. No partial assembly was returned.');
}
