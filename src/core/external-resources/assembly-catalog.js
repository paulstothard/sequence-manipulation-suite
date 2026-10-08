import { regionSession, DATASETS, ENSEMBL, encodeUrl, requireData } from './region-common.js';
import { resolveOrganism, knownOrganism } from './organisms.js';

export async function findAssemblies({ source, organism, pageToken = '' }, client, signal) {
  organism = typeof organism === 'string' ? knownOrganism(organism) : organism;
  requireData(organism?.taxId && /^\d+$/.test(organism.taxId), 'Choose an organism to find assemblies.');
  const session = regionSession(client, signal);
  if (source === 'ncbi') {
    const value = await session.json(encodeUrl(`${DATASETS}/genome/taxon/${organism.taxId}/dataset_report`, { 'filters.reference_only': 'true', page_size: 20, page_token: pageToken }));
    requireData(Array.isArray(value.reports) || value.total_count === 0);
    return { rows: (value.reports ?? []).filter(row => row.accession === row.current_accession && /^GCF_/.test(row.accession)).map(row => ({
      id: row.accession, label: `${row.organism.organism_name} — ${row.assembly_info.assembly_name} (${row.accession})`,
      organism: row.organism.organism_name, assemblyName: row.assembly_info.assembly_name, title: row.assembly_info.assembly_level,
      length: Number(row.assembly_stats?.total_sequence_length) || null, status: 'Current RefSeq reference assembly', sequenceCount: row.assembly_stats?.number_of_contigs
    })), nextPageToken: value.next_page_token || '', total: value.total_count };
  }
  if (source === 'ensembl') {
    const species = await resolveOrganism(organism, source, client, signal);
    const info = await session.json(`${ENSEMBL}/info/assembly/${species.species}?content-type=application/json`);
    requireData(info.assembly_name && info.default_coord_system_version);
    return { rows: [{ id: info.default_coord_system_version, label: `${organism.name} — ${info.assembly_name}`, species: species.species }], total: 1 };
  }
  requireData(source === 'ucsc', 'Choose NCBI, Ensembl, or UCSC for assembly discovery.');
  const value = await session.json('https://api.genome.ucsc.edu/list/ucscGenomes');
  requireData(value.ucscGenomes && typeof value.ucscGenomes === 'object');
  const rows = Object.entries(value.ucscGenomes).filter(([, row]) => String(row.taxId) === organism.taxId).map(([id, row]) => ({ id, label: `${row.organism} — ${row.description} (${id})` }));
  return { rows, total: rows.length };
}
