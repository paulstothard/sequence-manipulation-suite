import { featureLocation } from './viewer-feature-sequence.js';
import { locationSequenceSegments } from './flatfile-records.js';
import { geneticCodes, makeCodonMap, getStartCodons } from './genetic-code.js';
import { complementDnaRnaSequence } from './sequence.js';

export const isCdsFeature = item => String(item.type || item.featureType).toUpperCase() === 'CDS';
const unavailable = reason => ({ available: false, reason });

// /codon_start is relative to the joined CDS, including on the reverse strand:
// https://www.ncbi.nlm.nih.gov/genbank/eukaryotic_genome_submission_annotation/
export function makeCdsTranslationModel(record, item, fallbackCode = '1') {
  if (record.alphabet === 'protein' || !record.sequence || !isCdsFeature(item)) return unavailable('No nucleotide CDS sequence.');
  if (item.translationMappingIssue) return unavailable(item.translationMappingIssue);
  if (item.editStatus && item.editStatus !== 'unchanged') return unavailable('CDS annotations changed after a sequence edit; translation placement requires a reviewed annotation.');
  const location = featureLocation(record, { kind: 'interval', ...item });
  const parts = locationSequenceSegments(location);
  if (!parts.length || parts.some(part => part.start < 1 || part.end > record.sequence.length)) return unavailable('The complete CDS location is unavailable.');
  const codonStart = Number(item.codonStart || 1);
  if (![1, 2, 3].includes(codonStart)) return unavailable('Invalid CDS codon_start.');
  let length = 0;
  const segments = parts.map(part => {
    const segment = { ...part, offset: length };
    length += part.end - part.start + 1;
    return segment;
  });
  const offset = codonStart - 1, count = Math.max(0, Math.floor((length - offset) / 3));
  const protein = String(item.translation || '').replace(/\s+/g, '').toUpperCase();
  const table = String(item.translationTable || fallbackCode || '1');
  const code = geneticCodes.find(code => code.id === table);
  if (protein && (protein.length > count || protein.length < count - 1)) return unavailable('The annotated protein does not map one-to-one to the loaded CDS codons.');
  if (!protein && (item.pseudo || item.translationExceptions?.length || item.translationException)) return unavailable('This exceptional CDS needs an annotated protein to place amino acids reliably.');
  if (!protein && !code) return unavailable(`Genetic code ${table} is not available for computing CDS translation.`);
  return {
    available: count > 0, segments, offset, count, protein, table,
    sequence: record.sequence, codonMap: code ? makeCodonMap(code) : null,
    startCodons: code ? getStartCodons(code) : new Set(),
    completeStart: !parts[0].partialStart && offset === 0,
    source: protein ? 'Annotated protein' : `Computed from spliced CDS · genetic code ${table}`
  };
}

function baseAtOffset(model, offset) {
  let lo = 0, hi = model.segments.length - 1;
  while (lo < hi) {
    const middle = Math.ceil((lo + hi) / 2);
    if (model.segments[middle].offset <= offset) lo = middle; else hi = middle - 1;
  }
  const part = model.segments[lo], local = offset - part.offset;
  const position = part.strand === '-' ? part.end - local : part.start + local;
  const raw = model.sequence[position - 1];
  const base = part.strand === '-' ? complementDnaRnaSequence(raw, { preserveCase: false }) : raw;
  return { position, base: base.toUpperCase().replaceAll('U', 'T'), strand: part.strand };
}

export function cdsTranslationCodon(model, index) {
  if (!model.available || index < 0 || index >= model.count) return null;
  const bases = [0, 1, 2].map(n => baseAtOffset(model, model.offset + index * 3 + n));
  const positions = bases.map(base => base.position), codon = bases.map(base => base.base).join('');
  let aminoAcid = model.protein[index];
  if (!aminoAcid) {
    const computed = model.codonMap?.get(codon) ?? 'X';
    // Annotation normally omits the terminal stop; append it only when verified.
    if (model.protein && computed !== '*') return null;
    aminoAcid = index === 0 && model.completeStart && model.startCodons.has(codon) ? 'M' : computed;
  }
  const parts = [];
  for (const [i, base] of bases.entries()) {
    const previous = parts.at(-1);
    if (previous && base.strand === previous.strand && base.position === positions[i - 1] + (base.strand === '-' ? -1 : 1)) {
      previous.start = Math.min(previous.start, base.position);
      previous.end = Math.max(previous.end, base.position);
      previous.hasMiddle ||= i === 1;
    } else parts.push({ start: base.position, end: base.position, strand: base.strand, hasMiddle: i === 1 });
  }
  return { index: index + 1, aminoAcid, codon, positions, parts, split: parts.length > 1,
    source: model.protein && index >= model.protein.length ? 'Computed terminal stop' : model.source };
}

// Only visit codons intersecting the visible feature piece, even for a huge CDS.
// Bounds are zero-based half-open; returned genomic positions are one-based.
export function visibleCdsTranslationCodons(model, start, end) {
  if (!model.available || end <= start) return [];
  const indices = new Set();
  for (const part of model.segments) {
    const first = Math.max(part.start, Math.floor(start) + 1), last = Math.min(part.end, Math.ceil(end));
    if (last < first) continue;
    const a = part.offset + (part.strand === '-' ? part.end - last : first - part.start);
    const b = part.offset + (part.strand === '-' ? part.end - first : last - part.start);
    const from = Math.max(0, Math.floor((a - model.offset) / 3));
    const to = Math.min(model.count - 1, Math.floor((b - model.offset) / 3));
    for (let index = from; index <= to; index++) indices.add(index);
  }
  return [...indices].sort((a, b) => a - b).map(index => cdsTranslationCodon(model, index)).filter(Boolean);
}
