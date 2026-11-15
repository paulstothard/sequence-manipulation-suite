import { reverseComplementDnaRnaSequence, translateSequence } from './translation.js';
import { formatFastaRecord } from './fasta.js';
import { ORF_LIMITS } from './orf.js';

export const ORF_EXPLORER_PAGE_SIZE = 25;
export const ORF_SEQUENCE_PAGE_SIZE = 600;
export const ORF_FRAMES = ['+1', '+2', '+3', '-1', '-2', '-3'];

// Pack the displayed intervals, including enlarged targets for tiny ORFs.
// The caller bounds the mark count; nested ORFs always keep separate lanes.
export function packOrfOverviewMarks(marks, gap = 3) {
  const laneEnds = [];
  const packed = [...marks]
    .sort((a, b) => a.x1 - b.x1 || b.x2 - a.x2 || a.index - b.index)
    .map(mark => {
      let lane = laneEnds.findIndex(end => mark.x1 > end + gap);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = mark.x2;
      return { ...mark, lane };
    });
  return { marks: packed, laneCount: Math.max(1, laneEnds.length) };
}

export function makeOrfExplorerData(records, options) {
  return {
    viewerType: 'orf-explorer', title: 'ORF explorer', alphabet: 'dna-rna',
    options: { geneticCode: options.geneticCode, startMode: options.startMode },
    records: records.map(record => ({
      title: record.title, recordIndex: record.recordIndex,
      sequence: record.sequence.toUpperCase().replaceAll('U', 'T'),
      length: record.sequence.length,
      // Stable identity is assigned before any viewer sorting or paging.
      orfs: record.orfs.map(({ nucleotide, protein, ...orf }, index) => ({ ...orf, id: index + 1 }))
    }))
  };
}

export function orfFastaHeader(record, orf) {
  return `record=${record.title} orf=${orf.id} strand=${orf.strand} frame=${orf.frame} start=${orf.start} end=${orf.end} aa_length=${orf.aaLength} complete=${orf.complete ? 'yes' : 'no'} record_index=${record.recordIndex}`;
}

export function orfDnaSlice(record, orf, offset = 0, length = orf.ntLength) {
  const end = Math.min(orf.ntLength, offset + length);
  return orf.strand === '-'
    ? reverseComplementDnaRnaSequence(record.sequence.slice(orf.end - end, orf.end - offset))
    : record.sequence.slice(orf.start - 1 + offset, orf.start - 1 + end);
}

export function orfSequencePage(record, orf, options, page = 0) {
  const pageCount = Math.max(1, Math.ceil(orf.ntLength / ORF_SEQUENCE_PAGE_SIZE));
  const currentPage = Math.max(0, Math.min(pageCount - 1, page));
  const offset = currentPage * ORF_SEQUENCE_PAGE_SIZE;
  const dna = orfDnaSlice(record, orf, offset, ORF_SEQUENCE_PAGE_SIZE);
  // The final stop is part of the DNA, but never part of the protein.
  const proteinDna = dna.slice(0, Math.max(0, Math.min(dna.length, orf.aaLength * 3 - offset)));
  let protein = translateSequence(proteinDna, options).protein;
  if (offset === 0 && options.startMode === 'start-codon' && protein) protein = 'M' + protein.slice(1);
  return { dna, protein, offset, page: currentPage, pageCount };
}

export function getOrfExplorerRows(record, { frame = 'all', status = 'all', sort = 'id', descending = false } = {}) {
  const rows = record.orfs.filter(orf => (frame === 'all' || orf.frame === frame)
    && (status === 'all' || orf.complete === (status === 'complete')));
  const direction = descending ? -1 : 1;
  return rows.sort((a, b) => {
    const difference = typeof a[sort] === 'number' ? a[sort] - b[sort] : String(a[sort]).localeCompare(String(b[sort]));
    return direction * difference || a.id - b.id;
  });
}

// Explicit export actions use the ordinary worker transport. Check the entire
// requested size before expanding nested intervals; never return a partial file.
export async function exportOrfExplorerSequences(input, options = {}, context = {}) {
  const { records, geneticCode, startMode } = input ?? {};
  const molecule = options.molecule;
  if (!Array.isArray(records) || !['dna', 'protein'].includes(molecule)) throw new Error('Choose ORF DNA or protein sequences to export.');
  const fasta = options.fasta !== false;
  let lastYield = 0;
  let lastProgress = 0;
  async function checkpoint() {
    context.throwIfCancelled?.();
    if (Date.now() - lastYield >= 8) {
      await context.yieldIfNeeded?.();
      lastYield = Date.now();
    }
  }
  let estimated = 0;
  let count = 0;
  for (const record of records) {
    if (typeof record.sequence !== 'string' || !Array.isArray(record.orfs)) throw new Error('Invalid ORF record.');
    for (const orf of record.orfs) {
      if (++count > ORF_LIMITS.maxOrfs || !Number.isInteger(orf.start) || !Number.isInteger(orf.end)
        || orf.start < 1 || orf.end > record.sequence.length || orf.end < orf.start
        || orf.ntLength !== orf.end - orf.start + 1 || !['+', '-'].includes(orf.strand)
        || !Number.isInteger(orf.aaLength) || orf.aaLength < 0 || orf.aaLength * 3 !== orf.ntLength - (orf.complete ? 3 : 0)) {
        throw new Error('Invalid ORF coordinates or lengths.');
      }
      const length = molecule === 'dna' ? orf.ntLength : orf.aaLength;
      estimated += length + (fasta ? orfFastaHeader(record, orf).length + Math.ceil(length / 60) + 3 : 0);
      if (estimated > ORF_LIMITS.maxOutputCharacters) throw new Error(`This export exceeds the ${ORF_LIMITS.maxOutputCharacters.toLocaleString('en-US')}-character limit. Export one sequence record or an individual ORF.`);
    }
    await checkpoint();
  }
  if (!fasta && count !== 1) throw new Error('Copy sequence requires exactly one ORF.');
  const parts = [];
  let processed = 0;
  for (const record of records) {
    for (const orf of record.orfs) {
      const chunks = [];
      for (let offset = 0; offset < orf.ntLength; offset += 60_000) {
        await checkpoint();
        const dna = orfDnaSlice(record, orf, offset, 60_000);
        if (molecule === 'dna') chunks.push(dna);
        else {
          let protein = translateSequence(dna.slice(0, Math.max(0, Math.min(dna.length, orf.aaLength * 3 - offset))), { geneticCode }).protein;
          if (!offset && startMode === 'start-codon' && protein) protein = 'M' + protein.slice(1);
          chunks.push(protein);
        }
      }
      const sequence = chunks.join('');
      parts.push(fasta ? formatFastaRecord(orfFastaHeader(record, orf), sequence, 60) : sequence);
      processed++;
      if (processed === count || Date.now() - lastProgress >= 32) {
        context.reportProgress?.({ phase: 'building-output', progress: processed / count });
        lastProgress = Date.now();
      }
    }
  }
  context.throwIfCancelled?.();
  return { output: parts.join('\n') };
}
