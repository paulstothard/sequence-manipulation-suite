import { parseSequenceInput } from './fasta.js';
import { alignPairwiseAffine } from './pairwise-alignment.js';

export const SANGER_REFERENCE_LIMIT = 1_000_000;
const IUPAC = { A:'A', C:'C', G:'G', T:'T', R:'AG', Y:'CT', S:'CG', W:'AT', K:'GT', M:'AC', B:'CGT', D:'AGT', H:'ACT', V:'ACG', N:'ACGT' };
const COMPLEMENT = { A:'T', C:'G', G:'C', T:'A', R:'Y', Y:'R', S:'S', W:'W', K:'M', M:'K', B:'V', V:'B', D:'H', H:'D', N:'N' };
export const reverseSangerSequence = sequence => [...sequence].reverse().map(base => COMPLEMENT[base] ?? 'N').join('');

export function parseSangerReference(input, options = {}) {
  const records = parseSequenceInput(String(input ?? ''), 'reference');
  if (records.length !== 1 || !records[0].sequence) throw new Error('Provide exactly one reference DNA/RNA sequence.');
  const supplied = records[0].sequence.replace(/\s/g, '').toUpperCase();
  if (/[^ACGTURYSWKMBDHVN]/.test(supplied)) throw new Error('The reference contains unsupported sequence characters.');
  if (supplied.length > SANGER_REFERENCE_LIMIT) throw new Error('Use a reference of at most 1,000,000 bases.');
  const firstBase = Number(options.referenceStart ?? 1);
  if (!Number.isSafeInteger(firstBase) || firstBase < 1 || !Number.isSafeInteger(firstBase + supplied.length)) throw new Error('First reference base number must be a positive safe integer.');
  // A lightweight content fingerprint for accidental reference mismatch checks.
  // It is deliberately labelled by its algorithm rather than as a secure hash.
  let hash = 2166136261;
  for (const base of supplied) hash = Math.imul(hash ^ base.charCodeAt(0), 16777619) >>> 0;
  return { title:records[0].title, name:records[0].title, sequence:supplied.replaceAll('U','T'), alphabet:supplied.includes('U') ? 'RNA' : 'DNA', firstBase, lastBase:firstBase + supplied.length - 1, fingerprint:`fnv1a32:${hash.toString(16).padStart(8,'0')}` };
}

export const sangerReferenceBase = (reference, position) => reference.sequence[position - (reference.firstBase ?? 1)];

function expandSeed(sequence) {
  let words = [''];
  for (const base of sequence) {
    const choices = IUPAC[base] ?? 'ACGT';
    if (words.length * choices.length > 32) return [];
    words = words.flatMap(word => [...choices].map(choice => word + choice));
  }
  return words;
}

async function candidateWindows(reference, sequence, context) {
  const k = 11, seeds = new Map(), bins = new Map();
  for (let i = 0; i <= sequence.length - k; i += 5) {
    for (const word of expandSeed(sequence.slice(i, i + k))) {
      if (!seeds.has(word)) seeds.set(word, []);
      seeds.get(word).push(i);
    }
  }
  let hits = 0;
  for (let i = 0; i <= reference.length - k; i++) {
    if ((i & 32767) === 0) { context.throwIfCancelled?.(); await context.yieldIfNeeded?.(); }
    for (const queryIndex of seeds.get(reference.slice(i, i + k)) ?? []) {
      if (++hits > 100000) return { windows:[], exhausted:true };
      const diagonal = i - queryIndex;
      const key = Math.floor(diagonal / 32);
      const bin = bins.get(key) ?? { count:0, total:0 };
      bin.count++; bin.total += diagonal; bins.set(key, bin);
    }
  }
  const clusters = [];
  for (const bin of [...bins.values()].sort((a,b) => b.count - a.count)) {
    if (bin.count < 2) continue;
    const diagonal = Math.round(bin.total / bin.count);
    if (!clusters.some(existing => Math.abs(existing - diagonal) < 128)) clusters.push(diagonal);
  }
  if (clusters.length > 12) return { windows:[], exhausted:true };
  return { windows:clusters.map(diagonal => ({ start:Math.max(0, diagonal - 128), end:Math.min(reference.length, diagonal + sequence.length + 128) })).filter(window => window.end > window.start), exhausted:false };
}

function shiftAlignment(alignment, offset) {
  return { ...alignment, startA:alignment.startA + offset, endA:alignment.endA + offset,
    columns:alignment.columns.map(column => ({ ...column, sequence_a_position:column.sequence_a_position ? column.sequence_a_position + offset : column.sequence_a_position })) };
}

/** Returns a placement only when the bounded search has a unique best locus. */
export async function placeSangerRead(reference, sequence, options = {}, context = {}) {
  const scoring = { alphabet:'dna-rna', mode:'local', matchScore:5, similarScore:1, mismatchScore:-4, gapOpen:10, gapExtend:1, ...options, maxAlignmentCells:2_500_000 };
  const sequences = [sequence, reverseSangerSequence(sequence)];
  const candidates = [];
  let cells = 0;
  for (const [strand, query] of sequences.entries()) {
    if (strand && query === sequences[0]) continue;
    const search = reference.sequence.length <= 2000
      ? { windows:[{ start:0, end:reference.sequence.length }], exhausted:false }
      : await candidateWindows(reference.sequence, query, context);
    if (search.exhausted) return { status:'search-limit', reason:'Repeated seeds exceeded the reference-placement search budget.' };
    for (const window of search.windows) {
      const size = (window.end - window.start + 1) * (query.length + 1);
      cells += size;
      if (size > 2_500_000 || cells > 24_000_000) return { status:'search-limit', reason:'Reference placement exceeded the alignment work budget.' };
      const align = async (text, start) => {
        context.throwIfCancelled?.(); await context.yieldIfNeeded?.();
        const raw = await alignPairwiseAffine(text, query, scoring, context);
        if (raw.score > 0) candidates.push({ alignment:shiftAlignment(raw, start + (reference.firstBase ?? 1) - 1), orientation:strand ? 'reverse-complement' : 'forward' });
        return raw;
      };
      const raw = await align(reference.sequence.slice(window.start, window.end), window.start);
      // A second complete locus can share a seed window. Inspect both remaining
      // sides rather than accepting the first traceback from a repeated region.
      if (raw.score > 0) {
        for (const side of [{start:window.start,end:window.start + raw.startA - 1}, {start:window.start + raw.endA,end:window.end}]) {
          if (side.end - side.start < query.length * 0.8) continue;
          cells += (side.end - side.start + 1) * (query.length + 1);
          if (cells > 24_000_000) return { status:'search-limit', reason:'Reference placement exceeded the alignment work budget.' };
          await align(reference.sequence.slice(side.start,side.end), side.start);
        }
      }
    }
  }
  candidates.sort((a,b) => b.alignment.score - a.alignment.score);
  const best = candidates[0];
  if (!best) return { status:'unplaced', reason:'No supported seed match was found in the reference.' };
  const alternative = candidates.find(candidate => candidate !== best && (candidate.alignment.endA < best.alignment.startA || candidate.alignment.startA > best.alignment.endA || candidate.orientation !== best.orientation));
  if (alternative && best.alignment.score - alternative.alignment.score < Math.max(5, Math.abs(best.alignment.score) * 0.02)) {
    return { status:'ambiguous', reason:'Multiple reference placements have similar alignment scores.', alternatives:[best,alternative] };
  }
  return { status:'placed', ...best, searchedCells:cells };
}

export const sangerReferenceOptions = { type:'group', label:'Reference coordinates', options:[
  { id:'referenceStart', type:'number', label:'First reference base number', defaultValue:1, min:1, step:1, help:'Number assigned to the first base of the supplied reference. Use an offset when supplying a fragment of a longer sequence. All reference positions in results use this numbering.' }
] };
