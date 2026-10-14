import { makeBiologicalRecordViewerRecords } from "./biological-record-format-converter.js";

/** Map imported annotations independently of each tool's computed tracks. */
export function makeSequenceFeatureTracks(record, { idPrefix = "source", label = "Source features" } = {}) {
  if (!record.features?.length) return [];
  return makeBiologicalRecordViewerRecords([{
    ...record,
    accession: record.title,
    molecule: "DNA"
  }])[0]?.tracks.filter(track => track.items.length > 0)
    .map(track => ({ ...track, id: `${idPrefix}-${track.id}`, label })) ?? [];
}
