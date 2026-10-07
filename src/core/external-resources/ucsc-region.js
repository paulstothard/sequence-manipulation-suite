import { EUTILS, encodeUrl, requireData, accession, checkSpan, overlap, checkTranscriptCount, regionResult, MAX_REGION_TRANSCRIPTS } from './region-common.js';
import { parseFlatfileRecords } from '../flatfile-records.js';
import { validateAnnotatedDownload } from './record-validation.js';

function trackUrl(plan, track) {
  return encodeUrl('https://api.genome.ucsc.edu/getData/track', { genome: plan.assembly, track, chrom: plan.region.chrom, start: plan.region.start - 1, end: plan.region.end, maxItemsOutput: MAX_REGION_TRANSCRIPTS + 1 });
}
async function readTrack(plan, track, session) {
  const response = await session.json(trackUrl(plan, track));
  const rows = response[track];
  requireData(response.genome === plan.assembly && response.chrom === plan.region.chrom && response.track === track && Array.isArray(rows) && response.itemsReturned === rows.length);
  requireData(!response.maxItemsLimit && rows.length <= MAX_REGION_TRANSCRIPTS, 'The UCSC region contains too many transcripts. Request a smaller interval; no truncated result was returned.');
  return { rows, date: response.dataTime || '' };
}
function readTranscript(row, plan) {
  requireData(accession(row.name) && /^(?:NM|NR|XM|XR)_/.test(row.name), 'This UCSC RefSeq track contains a transcript without a supported versioned RefSeq accession. Use NCBI or Ensembl for this region.');
  requireData(row.chrom === plan.region.chrom && Number.isSafeInteger(row.txStart) && row.txStart >= 0);
  const model = checkSpan({ id: row.name, geneId: '', geneName: row.name2 || '', name: row.name2 || '', chromosome: row.chrom,
    start: row.txStart + 1, end: row.txEnd, strand: row.strand,
    biotype: row.cdsStart < row.cdsEnd ? 'protein_coding' : 'non_coding', representative: '' });
  requireData(overlap(model, plan.region));
  const positions = value => { requireData(typeof value === 'string'); return value.replace(/,$/, '').split(',').map(Number); };
  const starts = positions(row.exonStarts), ends = positions(row.exonEnds);
  requireData(Number.isSafeInteger(row.exonCount) && row.exonCount > 0 && starts.length === row.exonCount && ends.length === row.exonCount);
  model.exons = starts.map((start, i) => checkSpan({ start: start + 1, end: ends[i], strand: row.strand }));
  requireData(model.exons.every((exon, i) => exon.start >= model.start && exon.end <= model.end && (!i || exon.start > model.exons[i - 1].end)));
  // UCSC exon spans describe alignments to the genome; they are deliberately
  // not treated as the exact length of the original RefSeq transcript.
  return model;
}
export async function retrieveUcscRegion(plan, session) {
  session.progress('Finding transcripts in the UCSC NCBI RefSeq track…');
  const all = await readTrack(plan, 'ncbiRefSeq', session);
  const rows = checkTranscriptCount(all.rows.map(row => readTranscript(row, plan))), warnings = [];
  let selected = rows;
  if (plan.selection === 'canonical') {
    const select = await readTrack(plan, 'ncbiRefSeqSelect', session);
    const selectedRows = checkTranscriptCount(select.rows.map(row => readTranscript(row, plan)));
    for (const row of selectedRows) requireData(rows.some(all => all.id === row.id && all.start === row.start && all.end === row.end && all.strand === row.strand), 'The UCSC RefSeq and RefSeq Select tracks disagree. Please try again later.');
    const ids = new Set(selectedRows.map(row => row.id));
    selected = rows.filter(row => ids.has(row.id));
    for (const row of selected) row.representative = 'RefSeq Select / MANE';
    const missing = new Set(rows.map(row => row.geneName)).size - new Set(selected.map(row => row.geneName)).size;
    if (missing) warnings.push(`${missing} matching gene(s) have no RefSeq Select transcript overlapping this interval. No substitute transcript was chosen.`);
  }
  if (!rows.length) warnings.push('No transcripts in the UCSC NCBI RefSeq track overlap this interval.');
  const records = [];
  if (!['summary', 'tsv'].includes(plan.format)) {
    let noProduct = 0;
    for (let offset = 0; offset < selected.length; offset += 50) {
      const batch = selected.slice(offset, offset + 50);
      session.progress(`Retrieving the exact RefSeq transcript records ${offset + 1}–${offset + batch.length} of ${selected.length}…`);
      const text = await session.request(encodeUrl(`${EUTILS}efetch.fcgi`, { db: 'nuccore', id: batch.map(row => row.id).join(','), rettype: 'gbwithparts', retmode: 'text' }));
      await validateAnnotatedDownload(text, 'gb', session.signal);
      const parsed = parseFlatfileRecords(text).records;
      requireData(parsed.length === batch.length);
      const returned = new Map();
      for (const record of parsed) {
        requireData(batch.some(row => row.id === record.accession) && !returned.has(record.accession) && record.molecule !== 'protein' && /^[ACGTURYSWKMBDHVN]+$/i.test(record.sequence));
        returned.set(record.accession, record);
      }
      for (const row of batch) {
        const record = returned.get(row.id); requireData(record);
        row.length = record.sequence.length;
        const cds = record.features.filter(feature => feature.feature === 'CDS');
        if (plan.product === 'cdna') {
          records.push({ id: row.id, transcriptId: row.id, geneName: row.geneName, description: record.title, sequence: record.sequence });
          continue;
        }
        if (!cds.length) { noProduct++; continue; }
        for (const feature of cds) {
          requireData(accession(feature.protein_id), 'A RefSeq coding feature has no versioned protein ID; a partial product set was not returned.');
          const sequence = plan.product === 'protein' ? feature.translation : feature.nucleotide;
          requireData(sequence && (plan.product === 'protein' ? /^[ACDEFGHIKLMNPQRSTVWYBXZJUO*]+$/i : /^[ACGTURYSWKMBDHVN]+$/i).test(sequence), 'A RefSeq coding feature has no complete, supported sequence or annotated translation. No partial product set was returned.');
          row.proteinId = feature.protein_id; row.proteinLength = feature.translation?.length;
          const id = plan.product === 'protein' ? feature.protein_id : `${row.id}_cds_${feature.protein_id}`;
          const previous = records.find(record => record.id === id);
          if (previous) { requireData(previous.sequence === sequence); previous.transcriptId += `,${row.id}`; }
          else records.push({ id, transcriptId: row.id, geneName: row.geneName, description: feature.product, sequence });
        }
      }
    }
    if (noProduct) warnings.push(`${noProduct} selected transcript(s) have no annotated coding sequence and were excluded from ${plan.product === 'protein' ? 'protein' : 'CDS'} output.`);
  }
  return regionResult(plan, { rows: selected, records, warnings, assembly: plan.assembly,
    annotation: `UCSC NCBI RefSeq${all.date ? ` (${all.date})` : ''}; sequence records: NCBI RefSeq`,
    matchedCount: rows.length, geneCount: new Set(rows.map(row => row.geneName)).size }, session);
}
