import { geneFeatureClass, GENE_FEATURE_STYLES } from './gene-viewer-feature-style.js';
import { transcriptUtrParts } from './transcript-coding-model.js';

// Build a model only when the source identifies the pair, or when a shared gene
// and compatible exon boundaries identify exactly one pair in both directions.
function explicitPair(transcript, cds) {
  return Boolean((transcript.transcriptId && transcript.transcriptId === cds.transcriptId)
    || (transcript.featureId && cds.parentIds?.includes(transcript.featureId))
    || (transcript.proteinId && transcript.proteinId === cds.proteinId));
}
function compatiblePair(transcript, cds) {
  const explicit = explicitPair(transcript, cds);
  if (!explicit && (cds.parentIds?.length || cds.transcriptId)) return false;
  const gene = transcript.geneQualifier || transcript.gene || transcript.locus_tag;
  if (!explicit && (!gene || gene !== (cds.geneQualifier || cds.gene || cds.locus_tag))) return false;
  return transcriptUtrParts(transcript, cds) !== null;
}

export function prepareViewerAnnotationTracks(tracks = []) {
  return tracks.flatMap(track => {
    if (track.type !== 'features' || track.visibilityGroup || track.items?.some(item => item.geneModel)) return [track];
    const items = track.items ?? [];
    const transcripts = items.filter(item => item.type === 'mRNA' || item.type === 'transcript');
    const coding = items.filter(item => item.type === 'CDS');
    if (!transcripts.length || !coding.length) return [track];
    const indexBy = new Map();
    const keys = item => [
      item.transcriptId && `transcript:${item.transcriptId}`,
      item.proteinId && `protein:${item.proteinId}`,
      (item.geneQualifier || item.gene || item.locus_tag) && `gene:${item.geneQualifier || item.gene || item.locus_tag}`
    ].filter(Boolean);
    for (const cds of coding) for (const key of [...keys(cds), ...(cds.parentIds ?? []).map(id => `parent:${id}`)]) {
      if (!indexBy.has(key)) indexBy.set(key, []);
      indexBy.get(key).push(cds);
    }
    const pairs = new Map(), uses = new Map();
    for (const transcript of transcripts) {
      const candidates = new Set([...keys(transcript), `parent:${transcript.featureId}`].flatMap(key => indexBy.get(key) ?? []));
      const compatible = [...candidates].filter(cds => compatiblePair(transcript, cds));
      pairs.set(transcript, compatible);
      for (const cds of compatible) uses.set(cds, (uses.get(cds) ?? 0) + 1);
    }
    const used = new Set(), models = [];
    for (const [index, transcript] of transcripts.entries()) {
      const candidates = pairs.get(transcript);
      if (candidates.length !== 1) continue;
      const cds = candidates[0];
      if (used.has(cds) || (!explicitPair(transcript, cds) && uses.get(cds) !== 1)) continue;
      const utrs = transcriptUtrParts(transcript, cds);
      const details = [...(transcript.details ?? []), ...['5′ UTR', '3′ UTR'].map(type => [type,
        utrs.filter(part => part.type === type).map(part => `${part.start}–${part.end}`).join('; ')]).filter(([, value]) => value)];
      models.push({ ...track, id: `${track.id}-transcript-${index}`, label: transcript.transcriptId || transcript.label || 'Transcript',
        layout: 'stacked', allowFixedSlotOverlaps: true, featureOpacity: 1, summary: undefined,
        items: [
          { ...transcript, slot: 0, connectParts: true, displayParts: utrs, geneModel: { role: 'transcript', utrs }, details },
          { ...cds, slot: 0, connectParts: false, geneModel: { role: 'CDS' } }
        ]
      });
      used.add(transcript); used.add(cds);
    }
    if (!models.length) return [track];
    const rest = items.filter(item => !used.has(item));
    return [...models, ...(rest.length ? [{ ...track, items: rest, summary: undefined }] : [])];
  });
}

export function viewerGeneFeatureLegend(tracks = []) {
  const classes = new Set(tracks.flatMap(track => (track.items ?? []).map(item => geneFeatureClass(item.type))));
  return Object.entries(GENE_FEATURE_STYLES).filter(([kind]) => classes.has(kind)).map(([, style]) => ({ ...style }));
}
