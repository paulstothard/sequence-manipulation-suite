import { ENSEMBL, encodeUrl, requireData, stableId, versioned, checkSpan, overlap, checkTranscriptCount, selectTranscripts, regionResult } from './region-common.js';

const jsonUrl = (path, params) => encodeUrl(`${ENSEMBL}${path}`, { 'content-type': 'application/json', ...params });
async function lookup(ids, session, expand = false) {
  const found = new Map();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const data = await session.json(encodeUrl(`${ENSEMBL}/lookup/id`, { expand: expand ? 1 : 0 }), { json: { ids: batch } });
    for (const id of batch) { requireData(data[id]?.id === id); found.set(id, data[id]); }
  }
  return found;
}
export async function retrieveEnsemblRegion(plan, session) {
  session.progress('Checking the Ensembl assembly…');
  const info = await session.json(plan.url);
  const assembly = info.default_coord_system_version;
  requireData(typeof assembly === 'string' && typeof info.assembly_name === 'string');
  requireData(!plan.assembly || [assembly, info.assembly_name].includes(plan.assembly), `Ensembl currently annotates ${info.assembly_name} for this species. The requested assembly ${plan.assembly} does not match; coordinates were not reinterpreted.`);
  const chrom = info.top_level_region?.find(row => row.name === plan.region.chrom);
  requireData(chrom && Number.isSafeInteger(chrom.length) && plan.region.end <= chrom.length, 'The chromosome or interval is outside this Ensembl assembly. Check the species, assembly, and chromosome name.');
  session.progress('Finding overlapping Ensembl transcripts…');
  const raw = await session.json(jsonUrl(`/overlap/region/${plan.species}/${plan.region.chrom}:${plan.region.start}-${plan.region.end}`, { feature: 'transcript' }));
  requireData(Array.isArray(raw));
  const rows = checkTranscriptCount(raw.map(row => {
    requireData(row.feature_type === 'transcript' && stableId(row.id) && stableId(row.Parent) && row.assembly_name === assembly && row.seq_region_name === plan.region.chrom && Number.isInteger(row.version) && row.version > 0 && [0, 1].includes(row.is_canonical));
    const transcript = checkSpan({ id: versioned(row), stableId: row.id, version: row.version, geneId: row.Parent, name: row.external_name || '', start: row.start, end: row.end,
      strand: row.strand === -1 ? '-' : row.strand === 1 ? '+' : '', biotype: row.biotype, representative: row.is_canonical === 1 ? 'Ensembl Canonical' : '' });
    requireData(overlap(transcript, plan.region));
    return transcript;
  }));
  const warnings = [], selected = selectTranscripts(rows, plan.selection, warnings, 'Ensembl Canonical');
  if (!rows.length) warnings.push('No annotated transcripts overlap this region.');
  session.progress(`Reading annotations for ${selected.length} Ensembl transcript(s)…`);
  const models = await lookup(selected.map(row => row.stableId), session, true);
  const genes = await lookup([...new Set(selected.map(row => row.geneId))], session);
  for (const row of selected) {
    const transcript = models.get(row.stableId), gene = genes.get(row.geneId);
    requireData(transcript.object_type === 'Transcript' && transcript.version === row.version && transcript.Parent === row.geneId && transcript.assembly_name === assembly && transcript.seq_region_name === plan.region.chrom && transcript.start === row.start && transcript.end === row.end && transcript.strand === (row.strand === '+' ? 1 : -1));
    requireData(gene.object_type === 'Gene' && gene.assembly_name === assembly && gene.seq_region_name === plan.region.chrom);
    row.geneName = gene.display_name || '';
    row.length = transcript.length;
    requireData(Number.isSafeInteger(row.length) && row.length > 0 && Array.isArray(transcript.Exon) && transcript.Exon.length);
    row.exons = transcript.Exon.map(exon => {
      requireData(exon.seq_region_name === plan.region.chrom && exon.start >= row.start && exon.end <= row.end);
      return checkSpan({ start: exon.start, end: exon.end, strand: row.strand });
    }).sort((a, b) => a.start - b.start);
    requireData(row.exons.reduce((sum, exon) => sum + exon.end - exon.start + 1, 0) === row.length);
    if (transcript.Translation) {
      const protein = transcript.Translation;
      requireData(stableId(protein.id) && protein.Parent === row.stableId && Number.isInteger(protein.version) && protein.version > 0 && Number.isSafeInteger(protein.length) && protein.length > 0);
      row.proteinId = versioned(protein); row.proteinStableId = protein.id; row.proteinVersion = protein.version; row.proteinLength = protein.length;
    }
  }
  const codingOnly = ['protein', 'cds'].includes(plan.product);
  const products = codingOnly ? selected.filter(row => row.proteinId) : selected;
  if (codingOnly && products.length < selected.length) warnings.push(`${selected.length - products.length} selected transcript(s) have no annotated protein product and were excluded from ${plan.product === 'protein' ? 'protein' : 'CDS'} output.`);
  const records = [];
  if (!['summary', 'tsv'].includes(plan.format)) {
    for (let offset = 0; offset < products.length; offset += 50) {
      const batch = products.slice(offset, offset + 50), protein = plan.product === 'protein';
      session.progress(`Retrieving ${plan.product} sequences ${offset + 1}–${offset + batch.length} of ${products.length}…`);
      const ids = batch.map(row => protein ? row.proteinStableId : row.stableId);
      const response = await session.json(encodeUrl(`${ENSEMBL}/sequence/id`, { type: plan.product }), { json: { ids } });
      requireData(Array.isArray(response) && response.length === ids.length);
      const returned = new Map();
      for (const sequence of response) {
        requireData(ids.includes(sequence.query) && sequence.id === sequence.query && !returned.has(sequence.query));
        requireData(sequence.molecule === (protein ? 'protein' : 'dna') && typeof sequence.seq === 'string' && (protein ? /^[ACDEFGHIKLMNPQRSTVWYBXZJUO*]+$/i : /^[ACGTURYSWKMBDHVN]+$/i).test(sequence.seq));
        returned.set(sequence.query, sequence);
      }
      for (const row of batch) {
        const seq = returned.get(protein ? row.proteinStableId : row.stableId);
        requireData(seq && seq.version === (protein ? row.proteinVersion : row.version));
        if (plan.product !== 'cds') requireData(seq.seq.length === (protein ? row.proteinLength : row.length));
        records.push({ id: protein ? row.proteinId : row.id, transcriptId: row.id, geneId: row.geneId, description: row.name, sequence: seq.seq });
      }
    }
  }
  return regionResult(plan, { rows: selected, records, warnings, assembly: info.assembly_name, annotation: `Ensembl (${info.genebuild_last_geneset_update || 'current annotation'})`, matchedCount: rows.length, geneCount: new Set(rows.map(row => row.geneId)).size }, session);
}
