import { regionSession, EUTILS, ENSEMBL, encodeUrl, requireData } from './region-common.js';
import catalogue from '../../reference-data/external-resources/catalogue.js';

// Convenience labels, not a taxonomic restriction. Other organisms are resolved
// through NCBI Taxonomy or Ensembl's current species catalogue on explicit search.
export const commonOrganisms = catalogue.organisms;
// Common choices verified against this service's species catalogue. Discovery
// still resolves the selected entry against the live catalogue before searching.
export const organismsFor = source => source === 'ensembl' ? commonOrganisms.filter(row => row.species) : commonOrganisms;
export const assemblySource = source => source === 'gdv' ? 'ncbi' : source;
export function bundledAssemblies(source, organism) {
  const taxId = typeof organism === 'object' ? organism?.taxId : knownOrganism(organism)?.taxId;
  return catalogue.assemblies.filter(row => row.source === assemblySource(source) && row.taxId === taxId).sort((a, b) => Number(Boolean(b.preferred)) - Number(Boolean(a.preferred)));
}
export function bundledAssembly(source, id, species) {
  return catalogue.assemblies.find(row => row.source === assemblySource(source) && row.id === id && (!species || row.source !== 'ensembl' || row.species === species));
}

export function knownOrganism(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return commonOrganisms.find(row => [row.label, row.name, row.common, row.taxId, row.species].some(item => item?.toLowerCase() === text));
}
export async function findOrganisms(query, source, client, signal) {
  const text = String(query ?? '').trim();
  requireData(text && text.length <= 200, 'Enter an organism name.');
  const session = regionSession(client, signal);
  if (source === 'ensembl') {
    const response = await session.json(`${ENSEMBL}/info/species?content-type=application/json`);
    requireData(Array.isArray(response.species));
    const words = text.toLowerCase().replaceAll('_', ' ').split(/\s+/);
    return response.species.filter(row => words.every(word => [row.name, row.display_name, row.taxon_id, ...(row.aliases ?? [])].join(' ').replaceAll('_', ' ').toLowerCase().includes(word))).map(row => ({
      name: row.name.replaceAll('_', ' '), label: `${row.display_name} — ${row.assembly}`, species: row.name, taxId: String(row.taxon_id), assembly: row.assembly
    }));
  }
  const value = await session.json(encodeUrl(`${EUTILS}esearch.fcgi`, { db: 'taxonomy', term: text, retmode: 'json', retmax: 20 }));
  const ids = value.esearchresult?.idlist;
  requireData(Array.isArray(ids) && ids.every(id => /^\d+$/.test(id)));
  if (!ids.length) return [];
  const summary = await session.json(encodeUrl(`${EUTILS}esummary.fcgi`, { db: 'taxonomy', id: ids.join(','), retmode: 'json' }));
  return ids.map(id => {
    const row = summary.result?.[id]; requireData(row?.scientificname);
    return { name: row.scientificname, taxId: id, species: row.scientificname.toLowerCase().replaceAll(' ', '_'), label: `${row.commonname ? `${row.commonname} — ` : ''}${row.scientificname}` };
  });
}

export async function resolveOrganism(organism, source, client, signal) {
  requireData(organism?.taxId && /^\d+$/.test(organism.taxId), 'Choose an organism.');
  if (source !== 'ensembl') return organism;
  const matches = await findOrganisms(organism.taxId, 'ensembl', client, signal);
  const exact = matches.find(row => row.taxId === organism.taxId && row.species === organism.species);
  const sameTaxon = matches.filter(row => row.taxId === organism.taxId);
  const resolved = exact || (sameTaxon.length === 1 ? sameTaxon[0] : null);
  requireData(resolved, sameTaxon.length > 1 ? 'Ensembl has several assemblies or strains for this organism. Choose Find another organism and select the specific entry.' : 'This organism is not available from the current Ensembl service. Choose NCBI or find another organism.');
  return { ...resolved, name: organism.name };
}
