import { regionSession, encodeUrl, requireData } from './region-common.js';
import { knownOrganism } from './organisms.js';

// RCSB Search API: https://search.rcsb.org/ (GET JSON queries and pagination).
// AlphaFold name discovery uses UniProt identities, then the existing AlphaFold
// prediction endpoint. A UniProt match does not promise a model is available.
export async function searchStructures(plan, client, signal) {
  const page = Number(plan.page ?? 0);
  requireData(Number.isInteger(page) && page >= 0 && page <= 499, 'Choose a valid results page.');
  const organism = knownOrganism(plan.organism), session = regionSession(client, signal);
  if (plan.source === 'alphafold') {
    const query = `(${plan.query})${organism ? ` AND organism_id:${organism.taxId}` : ''}`;
    const response = await session.json(encodeUrl('https://rest.uniprot.org/uniprotkb/search', { query, format: 'json', size: 20, fields: 'accession,protein_name,organism_name,length,reviewed', ...(plan.cursor ? { cursor: plan.cursor } : {}) }));
    requireData(Array.isArray(response.results));
    return { matches: response.results.map(row => ({ id: row.primaryAccession, title: row.proteinDescription?.recommendedName?.fullName?.value || row.proteinDescription?.submissionNames?.[0]?.fullName?.value || '', organism: row.organism?.scientificName, length: row.sequence?.length, molecule: 'protein', status: 'Predicted model (AlphaFold); availability checked on retrieval' })), total: null };
  }
  let query = { type: 'terminal', service: 'full_text', parameters: { value: plan.query } };
  if (organism) query = { type: 'group', logical_operator: 'and', nodes: [query, { type: 'terminal', service: 'text', parameters: { attribute: 'rcsb_entity_source_organism.taxonomy_lineage.name', operator: 'exact_match', value: organism.name } }] };
  const search = await session.json(encodeUrl('https://search.rcsb.org/rcsbsearch/v2/query', { json: JSON.stringify({ query, return_type: 'entry', request_options: { paginate: { start: page * 10, rows: 10 }, results_content_type: ['experimental'] } }) }));
  requireData(Array.isArray(search.result_set) && Number.isSafeInteger(search.total_count));
  const matches = [];
  for (const hit of search.result_set) {
    requireData(/^(?:[1-9][A-Z0-9]{3}|PDB_[A-Z0-9]{8})$/i.test(hit.identifier));
    const row = await session.json(`https://data.rcsb.org/rest/v1/core/entry/${hit.identifier}`);
    requireData(row.rcsb_id === hit.identifier);
    matches.push({ id: row.rcsb_id, title: row.struct?.title || '', organism: organism?.name || '',
      status: row.rcsb_entry_info?.structure_determination_methodology || 'Experimental',
      method: row.exptl?.map(item => item.method).join(', '), resolution: row.rcsb_entry_info?.resolution_combined?.map(n => `${n} Å`).join(', ') });
  }
  return { matches, total: search.total_count, page, pageSize: 10 };
}
