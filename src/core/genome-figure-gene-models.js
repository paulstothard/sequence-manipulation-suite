import { prepareViewerAnnotationTracks } from './viewer-annotation-models.js';

const transcriptType = type => /^(mRNA|transcript|ncRNA|lnc_RNA|rRNA|tRNA)$/i.test(type);
const partsOf = feature => feature.parts?.length ? feature.parts : [feature];
const idsOf = feature => feature.sourceFeatureIds ?? [feature.id];

function mergeParts(features) {
  const sorted = features.flatMap(partsOf).map(part => ({ ...part })).sort((a, b) => a.start - b.start || a.end - b.end);
  const parts = [];
  for (const part of sorted) {
    const last = parts.at(-1);
    if (last && part.start <= last.end + 1) last.end = Math.max(last.end, part.end);
    else parts.push(part);
  }
  return parts;
}

function compound(feature, members, parts = mergeParts(members)) {
  return { ...feature, parts, start: Math.min(...parts.map(p => p.start)), end: Math.max(...parts.map(p => p.end)),
    sequenceLocation: { supported: members.every(item => item.sequenceLocation?.supported !== false),
      partial: members.some(item => item.sequenceLocation?.partial) },
    sourceFeatureIds: [...new Set(members.flatMap(idsOf))] };
}

// GFF3 normally uses separate child rows; GTF may omit the transcript row.
// Resolve only explicit relationships. Names and spatial overlap are not IDs.
function transcriptCandidates(features) {
  const transcripts = features.filter(feature => transcriptType(feature.type));
  const exonGroups = new Map();
  for (const exon of features.filter(feature => feature.type.toLowerCase() === 'exon')) {
    for (const parent of exon.parentIds?.length ? exon.parentIds : exon.transcriptId ? [exon.transcriptId] : []) {
      const key = `${parent}\0${exon.strand}`;
      if (!exonGroups.has(key)) exonGroups.set(key, []);
      exonGroups.get(key).push(exon);
    }
  }
  const declared = new Set(transcripts.flatMap(t => [t.featureId, t.transcriptId]).filter(Boolean));
  const claimed = new Set();
  const result = transcripts.map(transcript => {
    const key = `${transcript.transcriptId || transcript.featureId}\0${transcript.strand}`;
    const exons = exonGroups.get(key);
    if (!exons?.length || exons.some(exon => exon.start < transcript.start || exon.end > transcript.end)) return transcript;
    claimed.add(key);
    return compound(transcript, [transcript, ...exons], mergeParts(exons));
  });
  for (const [key, exons] of exonGroups) {
    if (claimed.has(key)) continue;
    const parent = key.split('\0')[0];
    // A declared but incompatible parent must not be silently replaced.
    if (declared.has(parent)) continue;
    const first = exons[0];
    result.push(compound({ ...first, id: `transcript:${parent}`, featureId: parent, transcriptId: parent,
      type: 'transcript', label: first.geneQualifier ? `${first.geneQualifier} (${parent})` : parent,
      inferredFromExons: true }, exons));
  }
  return result;
}

function codingCandidates(features) {
  const grouped = new Map(), independent = [];
  for (const feature of features.filter(feature => feature.type === 'CDS')) {
    const parents = feature.parentIds?.length ? feature.parentIds : feature.transcriptId ? [feature.transcriptId] : [];
    if (!parents.length) { independent.push(feature); continue; }
    for (const parent of parents) {
      const key = `${parent}\0${feature.strand}\0${feature.proteinId || ''}`;
      if (!grouped.has(key)) grouped.set(key, { parent, members: [] });
      grouped.get(key).members.push(feature);
    }
  }
  return [...independent, ...[...grouped.values()].map(({ parent, members }) => compound({
    ...members[0], id: `${members[0].id}:transcript:${parent}`, parentIds: [parent]
  }, members, members.length === 1 ? partsOf(members[0]) : mergeParts(members)))];
}

function connectors(parts, length, circular) {
  const result = [];
  for (let index = 1; index < parts.length; index++) {
    const previous = parts[index - 1], next = parts[index];
    if (next.start > previous.end + 1) result.push({ start: previous.end + 1, end: next.start - 1 });
    else if (circular && next.start < previous.start) {
      if (previous.end < length) result.push({ start: previous.end + 1, end: length });
      if (next.start > 1) result.push({ start: 1, end: next.start - 1 });
    }
  }
  return result;
}

function connectedModel(transcript, cds, record) {
  // The viewer pairs two separate marks; a figure model is already one mark.
  const { candidateIndex, layoutGroup, displayParts, connectParts, ...source } = transcript;
  const exons = partsOf(transcript);
  const utrs = transcript.geneModel?.utrs;
  const parts = cds
    ? [...utrs.map(part => ({ ...part, role: part.type, colorType: 'mRNA' })),
      ...partsOf(cds).map(part => ({ ...part, role: 'CDS', colorType: 'CDS', sourceLocation: cds.source }))]
    : exons.map(part => ({ ...part, role: transcript.type === 'CDS' ? 'CDS' : 'Exon', colorType: transcript.type === 'CDS' ? 'CDS' : 'mRNA' }));
  parts.sort((a, b) => a.start - b.start || a.end - b.end);
  return { ...source, geneModel: true, parts,
    sourceFeatureIds: [...new Set([...idsOf(transcript), ...(cds ? idsOf(cds) : [])])],
    connectors: connectors(exons, record.length, record.topology === 'circular').map(part => ({ ...part,
      role: transcript.type === 'CDS' ? 'Gap between CDS segments' : 'Intron' })),
    // Direction belongs to the whole model, not every block or a clipped edge.
    terminal: transcript.strand === '-' ? exons[0].start : exons.at(-1).end };
}

export function genomeFigureDisplayFeatures(record, visibleTypes) {
  const features = record.features ?? [];
  const visible = feature => !visibleTypes || visibleTypes.has(feature.type)
    || (feature.inferredFromExons && visibleTypes.has('exon'));
  const safe = feature => feature.sequenceLocation?.supported !== false && !/\border\(/.test(feature.source || '')
    && ['+', '-'].includes(feature.strand) && partsOf(feature).every(part => !part.strand || part.strand === feature.strand);
  const transcripts = transcriptCandidates(features).filter(feature => visible(feature) && safe(feature));
  const coding = codingCandidates(features).filter(feature => visible(feature) && safe(feature));
  const candidates = [...transcripts, ...coding].map((feature, candidateIndex) => ({ ...feature, candidateIndex }));
  // The shared UTR resolver uses linear coordinates; keep origin-spanning
  // joins connected independently rather than misassigning 5′/3′ sides.
  const wraps = feature => partsOf(feature).some((part, index, parts) => index && part.start < parts[index - 1].start);
  const tracks = prepareViewerAnnotationTracks([{ id: 'figure', type: 'features', items: candidates.filter(feature => !wraps(feature)) }]);
  const used = new Set(), pairedCandidates = new Set(), models = [];
  const paired = tracks.flatMap(track => track.items ?? []).filter(item => item.layoutGroup);
  for (let index = 0; index < paired.length; index += 2) {
    const transcript = paired[index], cds = paired[index + 1];
    const model = connectedModel(transcript, cds, record);
    models.push(model);
    pairedCandidates.add(transcript.candidateIndex);
    pairedCandidates.add(cds.candidateIndex);
    model.sourceFeatureIds.forEach(id => used.add(id));
  }
  for (const feature of candidates) {
    // Sharing an exon with another isoform must not suppress this transcript.
    if (pairedCandidates.has(feature.candidateIndex)) continue;
    if (partsOf(feature).length < 2 && idsOf(feature).length < 2 && !feature.inferredFromExons) continue;
    models.push(connectedModel(feature, null, record));
    idsOf(feature).forEach(id => used.add(id));
  }
  return [...features.filter(feature => visible(feature) && !used.has(feature.id)), ...models];
}
