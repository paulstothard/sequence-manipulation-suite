import { parseFlatfileRecords, parseGenbankRegion } from '../../core/flatfile-records.js';
import { makeBiologicalRecordViewerRecords } from '../../core/biological-record-format-converter.js';
import { makeDnaViewerData, makeDnaViewerStream } from '../../core/dna-viewer-data.js';
import { makeToolResult } from '../../core/workflow.js';
import { transcriptUtrParts } from '../../core/transcript-coding-model.js';
import { geneFeatureClass, GENE_FEATURE_STYLES } from '../../core/gene-viewer-feature-style.js';

const first = (feature, key) => feature.qualifiers?.[key]?.[0] || '';
const supported = feature => feature.feature !== 'source' && feature.parsedLocation?.supported && feature.parsedLocation.start && feature.parsedLocation.end;
const transcriptType = type => /RNA$/.test(type) || type === 'transcript';

export function genomicFeatureCoordinates(item, region) {
  const coordinate = position => region.strand === '-' ? region.end - position + 1 : region.start + position - 1;
  return (item.parts?.length ? item.parts : [item]).map(part => {
    const a = coordinate(part.start), b = coordinate(part.end);
    return `${region.accession}:${Math.min(a, b)}–${Math.max(a, b)}`;
  }).join('; ');
}

export async function runGeneViewer(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const text = String(input ?? '');
  if (text.length > 25 * 1024 * 1024) throw new Error('Gene Viewer accepts at most 25 MiB of annotated sequence.');
  context.reportProgress?.({ phase: 'Reading gene annotations', progress: 0.1 });
  await context.yieldIfNeeded?.();
  const parsed = parseFlatfileRecords(text), region = parseGenbankRegion(text);
  if (parsed.records.length !== 1 || !region) throw new Error('Gene Viewer needs one annotated NCBI genomic region with its original coordinates.');
  const record = parsed.records[0], gene = options.geneContext ?? {};
  if (!record.sequence || record.sequence.length !== region.end - region.start + 1 || record.sequence.length > 1_000_000) throw new Error('The genomic interval must contain its complete sequence and at most 1,000,000 bases.');
  if (gene.chrom && (gene.chrom !== region.accession || gene.start !== region.start || gene.end !== region.end || gene.strand !== region.strand)) throw new Error('Gene metadata and downloaded genomic coordinates do not match.');
  if ((gene.transcripts?.length ?? 0) > 1000) throw new Error('Gene Viewer accepts at most 1,000 transcript metadata records.');
  const warnings = [...parsed.warnings];
  const features = record.features.filter(supported);
  const omitted = record.features.filter(feature => feature.feature !== 'source' && !supported(feature)).length;
  if (omitted) warnings.push(`${omitted} feature(s) have unsupported locations and cannot be drawn. The original annotations remain in the GenBank download.`);
  const viewerRecord = makeBiologicalRecordViewerRecords([record], { topology: 'linear', compositionControls: { enabled: true, showGcPercent: false, showGcSkew: false } })[0];
  const items = viewerRecord.tracks[0].items;
  const rows = new Map((gene.transcripts ?? []).map(row => [row.id, row]));
  const entries = features.map((feature, index) => {
    const item = items[index], transcriptId = first(feature, 'transcript_id');
    const featureClass = geneFeatureClass(feature.feature);
    if (featureClass) Object.assign(item, { geneFeatureClass: featureClass, color: GENE_FEATURE_STYLES[featureClass].color });
    const row = rows.get(transcriptId);
    const genomicStrand = region.strand === '-' ? (item.strand === '-' ? '+' : item.strand === '+' ? '-' : item.strand) : item.strand;
    Object.assign(item, {
      transcriptId, featureId: feature.id, source: 'NCBI',
      sequenceLocation: feature.parsedLocation,
      label: transcriptId || item.proteinId || item.label,
      genomicCoordinates: genomicFeatureCoordinates(item, region),
      genomicSpan: genomicFeatureCoordinates({ ...item, parts: undefined }, region),
      genomicStrand,
      details: [
        ['Genomic strand', genomicStrand], ['Transcript', transcriptId], ['Representative', row?.representative],
        ['Assembly', gene.assembly], ['Annotation', gene.annotation],
        ['Local location', feature.location],
        ['Partial feature', feature.parsedLocation.partial ? 'Clipped or incomplete in the source record' : ''],
        ...Object.entries(feature.qualifiers ?? {}).filter(([key]) => key !== 'translation').map(([key, values]) => [key.replaceAll('_', ' '), values.join('; ')])
      ].filter(([, value]) => value)
    });
    return { feature, item, row, transcriptId };
  });
  const tracks = [], assigned = new Set();
  function addTrack(id, label, group, visibilityGroup = { id, label }) {
    if (!group.length) return;
    tracks.push({ id, type: 'features', label, visibilityGroup, layout: 'stacked', items: group.map(entry => entry.item) });
    group.forEach(entry => assigned.add(entry));
  }
  addTrack('genes', 'Genes', entries.filter(entry => entry.feature.feature === 'gene'));
  const transcripts = entries.filter(entry => transcriptType(entry.feature.feature)).sort((a, b) => Number(Boolean(b.row?.representative)) - Number(Boolean(a.row?.representative)) || a.transcriptId.localeCompare(b.transcriptId));
  const cdsByProtein = new Map();
  for (const entry of entries.filter(entry => entry.feature.feature === 'CDS')) {
    const protein = entry.item.proteinId;
    if (protein) cdsByProtein.set(protein, [...(cdsByProtein.get(protein) ?? []), entry]);
  }
  for (const [index, entry] of transcripts.entries()) {
    context.throwIfCancelled?.();
    const cds = entry.row?.proteinId ? (cdsByProtein.get(entry.row.proteinId) ?? []).filter(candidate =>
      candidate.item.strand === entry.item.strand && (candidate.item.parts ?? []).every(part =>
        (entry.item.parts ?? []).some(exon => exon.start <= part.start && exon.end >= part.end))) : [];
    entry.item.slot = 0;
    entry.item.connectParts = true;
    const utrs = cds.length === 1 ? transcriptUtrParts(entry.item, cds[0].item) : null;
    if (utrs) {
      entry.item.geneModel = { role: 'transcript', utrs };
      // Keep the source exon parts for sequence extraction and intron joins.
      // Only UTR pieces are drawn for this item; the linked CDS draws coding blocks.
      entry.item.displayParts = utrs;
      for (const type of ['5′ UTR', '3′ UTR']) {
        const parts = utrs.filter(part => part.type === type);
        if (parts.length) entry.item.details.push([type, genomicFeatureCoordinates({ parts }, region)]);
      }
    }
    cds.forEach((candidate, index) => { candidate.item = {
      ...candidate.item, transcriptId: entry.transcriptId, slot: utrs ? 0 : index + 1, connectParts: !utrs,
      geneModel: utrs ? { role: 'CDS' } : undefined
    }; });
    addTrack(`transcript-${index}`, `${entry.transcriptId || entry.item.label}${entry.row?.representative ? ` · ${entry.row.representative}` : ''}`, [entry, ...cds], { id: 'transcripts', label: 'Transcripts & CDS' });
    if (utrs) Object.assign(tracks.at(-1), { allowFixedSlotOverlaps: true, featureOpacity: 1 });
    if (index % 25 === 0) await context.yieldIfNeeded?.();
  }
  const remaining = new Map();
  for (const entry of entries.filter(entry => !assigned.has(entry))) {
    const type = entry.feature.feature;
    remaining.set(type, [...(remaining.get(type) ?? []), entry]);
  }
  const labels = { CDS: 'Coding regions', regulatory: 'Regulatory regions', repeat_region: 'Repeats', variation: 'Annotated variation', misc_feature: 'Other annotated features', rep_origin: 'Replication origins', misc_recomb: 'Recombination regions', mat_peptide: 'Mature peptides' };
  for (const [type, group] of remaining) addTrack(`features-${type}`, labels[type] || type, group);
  viewerRecord.tracks = tracks;
  viewerRecord.geneFeatureLegend = Object.entries(GENE_FEATURE_STYLES)
    .filter(([kind]) => entries.some(entry => entry.item.geneFeatureClass === kind))
    .map(([, style]) => ({ ...style }));
  viewerRecord.sequencePosition = 'top';
  viewerRecord.compactLayout = true;
  viewerRecord.hideRulers = true;
  viewerRecord.title = [gene.symbol, gene.assembly, `${region.accession}:${region.start}–${region.end}`, region.strand === '-' ? 'reverse complement' : 'reference (+)'].filter(Boolean).join(' · ');
  const viewer = makeDnaViewerData([viewerRecord], { title: gene.symbol ? `${gene.symbol} — Gene Viewer` : 'Gene Viewer', layout: 'linear' });
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: 'Preparing gene viewer', progress: 0.9 });
  await context.yieldIfNeeded?.();
  const result = makeToolResult({
    output: JSON.stringify(viewer),
    download: { filename: 'gene-viewer.json', mimeType: 'application/json;charset=utf-8' },
    warnings, recordsProcessed: 1, basesProcessed: record.sequence.length, charactersRemoved: 0,
    streams: { viewer: makeDnaViewerStream(viewer) }, visual: { viewer }
  });
  result.geneViewerSummary = { features: features.length, transcripts: transcripts.length, region };
  return result;
}
