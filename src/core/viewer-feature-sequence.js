import { extractLocationSequence, parseInsdcLocation } from './flatfile-records.js';
import { complementDnaRnaSequence } from './sequence.js';
import { formatFastaRecord } from './fasta.js';

export function featureLocation(record, target) {
  // Never substitute a bounding span for an unsupported source join/order.
  if (target?.sequenceLocation) return target.sequenceLocation;
  if (target?.kind !== 'interval' || !target.start || !target.end) return null;
  const parts = target.parts?.length ? target.parts : target.start > target.end && record.topology === 'circular'
    ? [{ start: target.start, end: record.length }, { start: 1, end: target.end }] : [target];
  const body = parts.map(part => `${part.start}..${part.end}`).join(',');
  const joined = parts.length > 1 ? `join(${body})` : body;
  return parseInsdcLocation(target.strand === '-' && record.alphabet !== 'protein' ? `complement(${joined})` : joined);
}

// A source location is retained by annotated-region viewers. Extraction follows
// its actual join/complement expression, independently of the current zoom.
export function featureSequenceChoices(record, target) {
  const location = featureLocation(record, target);
  if (!location?.supported || !location.ranges?.length || !record.sequence) return [];
  if (location.ranges.some(part => part.start < 1 || part.end > record.sequence.length || part.end < part.start)) return [];
  const type = target.featureType || target.type;
  const joined = location.ranges.length > 1;
  const length = location.ranges.reduce((total, part) => total + part.end - part.start + 1, 0);
  if (record.alphabet === 'protein') return [{ id: 'residues', label: 'Feature protein', length, unit: 'aa', description: joined ? 'Joined annotated segments, N → C.' : 'Annotated residues, N → C.' }];
  const label = type === 'mRNA' ? 'Spliced transcript (cDNA)'
    : /RNA$/.test(type) ? 'Transcript DNA'
      : type === 'CDS' ? 'CDS DNA' : 'Feature DNA';
  const orientation = location.strand === '.' ? 'source location order' : 'feature strand, 5′ → 3′';
  const choices = [{ id: 'dna', label, length, unit: 'bp', description: `${joined ? 'Joined segments; ' : ''}${orientation}.` }];
  const span = location.end - location.start + 1;
  if (joined && span > length) choices.push({
    id: 'genomic', label: /RNA$/.test(type) || type === 'CDS' ? 'Genomic DNA (with introns)' : 'Genomic span (with gaps)', length: span, unit: 'bp',
    description: `Includes intervening DNA; ${location.strand === '.' ? 'reference orientation' : 'feature strand, 5′ → 3′'}.`
  });
  const translation = String(target.translation || '').replace(/\s+/g, '');
  if (type === 'CDS' && translation) choices.push({
    id: 'protein', label: 'Protein (annotation)', length: translation.length, unit: 'aa',
    description: 'Protein sequence supplied in the source annotation.'
  });
  return choices;
}

export function extractViewerFeatureSequence(record, target, product = 'dna') {
  const choice = featureSequenceChoices(record, target).find(entry => entry.id === product);
  if (!choice) throw new Error('This feature sequence is not available in the loaded record.');
  const location = featureLocation(record, target);
  let sequence;
  if (product === 'residues') sequence = location.ranges.map(part => record.sequence.slice(part.start - 1, part.end)).join('');
  else if (product === 'protein') sequence = String(target.translation).replace(/\s+/g, '').toUpperCase();
  else if (product === 'genomic') {
    sequence = record.sequence.slice(location.start - 1, location.end);
    if (location.strand === '-') sequence = complementDnaRnaSequence(sequence, { preserveCase: false }).split('').reverse().join('');
  } else sequence = extractLocationSequence(record.sequence, location);
  const identifier = (product === 'protein' ? target.proteinId : target.transcriptId) || target.label || target.name || target.featureId || 'feature';
  const title = [identifier, target.featureType || target.type, `product=${product}`,
    `length=${sequence.length}${choice.unit}`, `strand=${target.genomicStrand || target.strand || location.strand}`,
    product === 'genomic' ? target.genomicSpan || target.genomicCoordinates : target.genomicCoordinates, location.partial ? 'partial_feature=true' : '',
    `record=${record.title || record.id || 'sequence'}`
  ].filter(Boolean).join(' ').replace(/[\r\n\s]+/g, ' ').trim();
  return { sequence: sequence.toUpperCase(), title, identifier, product, partial: location.partial === true };
}

export function viewerFeatureFasta(record, target, product = 'dna') {
  const extracted = extractViewerFeatureSequence(record, target, product);
  return formatFastaRecord(extracted.title, extracted.sequence);
}
