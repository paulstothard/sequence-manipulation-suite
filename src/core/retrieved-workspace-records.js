import { parseSequenceInput } from './fasta.js';
import { parseFlatfileRecords } from './flatfile-records.js';
import { sequenceStreamRecordsToWorkspaceSequences } from './workspace.js';
import { viewerRecordToWorkspaceFeatureLayers } from './workspace-layers.js';

export function getRetrievedWorkspaceValues(value) {
  if (value?.kind === 'collection') return (value.items ?? []).flatMap(getRetrievedWorkspaceValues);
  return value?.kind === 'text' && value.workspaceImport?.kind === 'retrieved-sequence' ? [value] : [];
}

function flatfileRecords(text) {
  const sourceRecords = text.match(/[\s\S]*?^\/\/[^\S\r\n]*(?:\r?\n|$)/gm) ?? [];
  if (!sourceRecords.length) throw new Error('The original annotated record is incomplete. Retrieve it again.');
  const trailing = text.slice(sourceRecords.reduce((length, record) => length + record.length, 0));
  if (trailing.trim()) throw new Error('The original annotated record is incomplete. Retrieve it again.');
  sourceRecords[sourceRecords.length - 1] += trailing;
  return sourceRecords.map(sourceText => {
    const parsed = parseFlatfileRecords(sourceText);
    if (parsed.records.length !== 1 || !parsed.records[0].sequence) throw new Error('Could not import this annotated record. The original download is still available.');
    const record = parsed.records[0];
    const features = record.features.filter(feature => feature.parsedLocation.supported).map(feature => ({
      start: feature.parsedLocation.start, end: feature.parsedLocation.end,
      parts: feature.parsedLocation.ranges, strand: feature.parsedLocation.strand,
      label: feature.gene || feature.locus_tag || feature.product || feature.feature,
      type: feature.feature, location: feature.location, qualifiers: feature.qualifiers,
      length: feature.parsedLocation.ranges.reduce((sum, part) => sum + part.end - part.start + 1, 0)
    }));
    const omitted = record.features.length - features.length;
    return {
      ...record, title: `${record.accession} ${record.title}`.trim(), features, sourceText,
      warnings: [...parsed.warnings, ...(omitted ? [`${omitted} feature location(s) could not be shown; they remain in the original record.`] : [])]
    };
  });
}

function uniprotJsonRecord(text) {
  const entry = JSON.parse(text);
  const sequence = entry.sequence?.value;
  if (!entry.primaryAccession || !sequence || sequence.length !== entry.sequence.length) throw new Error('The UniProt entry has no complete sequence.');
  // UniProt JSON uses inclusive residue coordinates. Keep uncertain/isoform
  // locations in the source record instead of drawing them as exact spans.
  // Schema example: https://rest.uniprot.org/uniprotkb/P04637.json
  const features = (entry.features ?? []).flatMap(feature => {
    const { start, end, sequence: isoform } = feature.location ?? {};
    if (isoform || start?.modifier !== 'EXACT' || end?.modifier !== 'EXACT' ||
        !Number.isInteger(start.value) || !Number.isInteger(end.value) ||
        start.value < 1 || end.value < start.value || end.value > sequence.length) return [];
    return [{ start: start.value, end: end.value, type: feature.type,
      label: feature.description || feature.type, annotation: feature }];
  });
  const omitted = (entry.features?.length ?? 0) - features.length;
  return [{
    accession: entry.primaryAccession,
    title: `${entry.primaryAccession} ${entry.proteinDescription?.recommendedName?.fullName?.value || entry.uniProtkbId || ''}`.trim(),
    sequence, features, sourceText: text, organism: entry.organism?.scientificName ?? '',
    warnings: omitted ? [`${omitted} feature location(s) could not be shown; they remain in the original record.`] : []
  }];
}

// Run only when Save is chosen, in the shared worker. No network access here.
export function prepareRetrievedWorkspaceRecords(text, descriptor = {}) {
  const { format, alphabet } = descriptor;
  if (descriptor.kind !== 'retrieved-sequence' || !['dna-rna', 'protein'].includes(alphabet)) throw new Error('Unsupported Workspace import.');
  if (new TextEncoder().encode(text).byteLength > 10 * 1024 * 1024) throw new Error('Workspace retrieval import exceeds the 10 MiB limit.');
  const records = format === 'fasta' ? parseSequenceInput(text)
    : format === 'json' ? uniprotJsonRecord(text)
      : ['gb', 'gp', 'embl', 'uniprot'].includes(format) ? flatfileRecords(text) : [];
  if (!records.length) throw new Error('No sequence records are available to save.');
  const context = { sourceToolId: 'get-data', sourceToolName: 'Get Data', sourceStreamId: 'primary' };
  const groups = records.map(record => {
    const sequenceDraft = sequenceStreamRecordsToWorkspaceSequences({ alphabet, records: [record] }, context)[0];
    if (!sequenceDraft) throw new Error('The retrieved record has no sequence to save.');
    sequenceDraft.retrieval = { source: descriptor.source, url: descriptor.url, retrievedAt: descriptor.retrievedAt };
    if (record.sourceText) sequenceDraft.sourceRecord = { ...descriptor.download, format, text: record.sourceText };
    if (record.organism) sequenceDraft.organism = record.organism;
    const layerDrafts = viewerRecordToWorkspaceFeatureLayers({
      id: record.accession ?? record.title, title: record.title,
      tracks: [{ id: 'retrieved-features', type: 'features', label: `${descriptor.source} features`, items: record.features ?? [] }]
    }, { ...context, alphabet, warnings: record.warnings ?? [] });
    return { sequenceDraft, layerDrafts };
  });
  return { groups, warnings: [...new Set(records.flatMap(record => record.warnings ?? []))] };
}
