import { parseSequenceInput, formatFastaRecord } from './fasta.js';

export const ALIGNED_SEQUENCE_LIMITS = Object.freeze({ input: 2_000_000, cells: 250_000, records: 1000, label: 500, displayedCells: 20_000 });
export const isAlignmentGap = symbol => symbol === '-' || symbol === '.';

// Interleaved CLUSTAL/MUSCLE blocks must have the same rows and width. Reject
// malformed lines and missing fragments rather than silently altering columns.
function parseClustal(source) {
  const records = [], byName = new Map();
  let block = [], expected;
  const flush = () => {
    if (!block.length) return;
    const names = block.map(row => row.title);
    if (new Set(names).size !== names.length) throw new Error('A CLUSTAL block contains duplicate sequence names.');
    if (block.some(row => row.sequence.length !== block[0].sequence.length)) throw new Error('CLUSTAL fragments in each block must have equal lengths.');
    if (expected && (expected.length !== names.length || expected.some(name => !names.includes(name)))) throw new Error('Every CLUSTAL block must contain the same sequence names.');
    expected ??= names;
    for (const row of block) {
      if (!byName.has(row.title)) { const record = { title: row.title, sequence: '' }; byName.set(row.title, record); records.push(record); }
      byName.get(row.title).sequence += row.sequence;
    }
    block = [];
  };
  for (const [index, line] of source.split('\n').entries()) {
    if (index === 0) continue;
    if (!line.trim()) { flush(); continue; }
    if (/^\s+[*:.\s]+$/.test(line)) continue;
    const match = /^\s*(\S+)\s+([A-Za-z*?.-]+)(?:\s+\d+)?\s*$/.exec(line);
    if (!match) throw new Error(`Invalid CLUSTAL line ${index + 1}.`);
    block.push({ title: match[1], sequence: match[2] });
  }
  flush();
  return records;
}

export function validateAlignedSequences(model) {
  if (!model || !['dna', 'rna', 'protein'].includes(model.alphabet) || !Array.isArray(model.records) || model.records.length < 1 || model.records.length > ALIGNED_SEQUENCE_LIMITS.records) throw new Error('Provide 1–1,000 aligned sequences.');
  const length = model.records[0]?.sequence?.length;
  if (!Number.isInteger(length) || length < 1 || length * model.records.length > ALIGNED_SEQUENCE_LIMITS.cells) throw new Error('Alignment exceeds 250,000 cells or has no columns.');
  const ids = new Set();
  for (const record of model.records) {
    if (typeof record.id !== 'string' || ids.has(record.id)) throw new Error('Alignment record IDs must be unique.');
    ids.add(record.id);
    if (typeof record.title !== 'string' || !record.title.trim() || record.title.length > ALIGNED_SEQUENCE_LIMITS.label || /[\r\n\u0000-\u001f]/.test(record.title)) throw new Error('Sequence names must contain 1–500 characters on one line.');
    if (typeof record.sequence !== 'string' || record.sequence.length !== length) throw new Error(`All aligned sequences must have equal lengths; check "${record.title}".`);
    const valid = model.alphabet === 'protein' ? /^[A-Za-z*?.-]+$/ : /^[ACGTURYSWKMBDHVN?.-]+$/i;
    if (!valid.test(record.sequence)) throw new Error(`Invalid ${model.alphabet} symbol in "${record.title}". Alignment symbols are preserved; correct the input or choose the appropriate alphabet.`);
    if (!Number.isSafeInteger(record.start) || Math.abs(record.start) > 1e9 || ![1, -1].includes(record.step)) throw new Error('Invalid sequence starting coordinate or direction.');
  }
  if (model.length !== length) throw new Error('Alignment column count does not match the sequences.');
  return model;
}

export function makeAlignedSequences(records, alphabet = 'auto', options = {}) {
  if (!Array.isArray(records) || !records.length) throw new Error('Provide aligned FASTA, CLUSTAL or GDE sequences.');
  if (!['auto', 'dna', 'rna', 'protein', 'dna-rna', 'coding-dna'].includes(alphabet)) throw new Error('Choose DNA, RNA or protein.');
  const symbols = records.map(row => String(row.sequence ?? row.aligned ?? '')).join('').toUpperCase();
  if (alphabet === 'auto' || alphabet === 'dna-rna' || alphabet === 'coding-dna') alphabet = alphabet !== 'auto' || /^[ACGTURYSWKMBDHVN?.-]+$/.test(symbols)
    ? symbols.includes('U') && !symbols.includes('T') ? 'rna' : 'dna' : 'protein';
  return validateAlignedSequences({ alphabet, length: String(records[0].sequence ?? records[0].aligned ?? '').length,
    provenance: String(options.provenance ?? '').slice(0, 2000),
    records: records.map((record, index) => ({ id: `sequence-${index + 1}`, title: record.title ?? record.label ?? `Sequence ${index + 1}`,
      sequence: String(record.sequence ?? record.aligned ?? ''), start: record.start ?? 1, step: record.step ?? 1 })) });
}

export async function parseAlignedSequences(input, options = {}, context = {}) {
  const source = String(input ?? '').replace(/\r\n?/g, '\n').trim();
  if (source.length > ALIGNED_SEQUENCE_LIMITS.input) throw new Error('Alignment input exceeds 2,000,000 characters.');
  context.throwIfCancelled?.();
  context.reportProgress?.({ phase: 'Reading aligned sequences', progress: 0.1 });
  let records;
  if (/^(CLUSTAL|MUSCLE)\b/i.test(source)) records = parseClustal(source);
  else if (/^[#%]/.test(source)) records = parseSequenceInput(source.replace(/^[#%]/gm, '>'), 'sequence', { strictHeaders: true });
  else if (source.startsWith('>')) records = parseSequenceInput(source, 'sequence', { strictHeaders: true });
  else throw new Error('Provide pre-aligned FASTA, CLUSTAL or GDE records with sequence names.');
  for (let i = 0; i < records.length; i += 100) {
    await context.yieldIfNeeded?.(); context.throwIfCancelled?.();
    context.reportProgress?.({ phase: 'Checking alignment columns', progress: 0.2 + 0.7 * i / records.length });
  }
  return makeAlignedSequences(records, options.alphabet ?? 'auto');
}

export function alignedSequencesFasta(model) {
  return model.records.map(row => formatFastaRecord(row.title, row.sequence, 60)).join('');
}
