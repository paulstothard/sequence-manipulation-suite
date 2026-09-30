import { parseSangerTraceInput, SANGER_SESSION_SEPARATOR } from './sanger-trace.js';
import { parseSangerReference, placeSangerRead, SANGER_REFERENCE_LIMIT } from './sanger-reference.js';
import { alignPairwiseAffine } from './pairwise-alignment.js';
import { effectiveToolLimit } from './tool-limit-policy.js';

export const SANGER_RESOLVER_LIMITS = { readPositions: 1200, referenceBases: SANGER_REFERENCE_LIMIT, signalSamples: 200000, inputCharacters: 8 * 1024 * 1024 };
const BASES = 'ACGT';
const COMPLEMENT = { A:'T', C:'G', G:'C', T:'A' };
const CODE = new Map(Object.entries({ A:'A', C:'C', G:'G', T:'T', AC:'M', AG:'R', AT:'W', CG:'S', CT:'Y', GT:'K', ACG:'V', ACT:'H', AGT:'D', CGT:'B', ACGT:'N' }));
const ambiguity = bases => CODE.get([...new Set(bases)].sort().join('')) ?? 'N';

export const sangerResolverColumns = [
  { id:'component', label:'Candidate', type:'string' },
  { id:'reference_position', label:'Reference position', type:'number' },
  { id:'reference_anchor', label:'Reference anchor', type:'number' },
  { id:'reference_base', label:'Reference base', type:'string' },
  { id:'candidate_base', label:'Candidate base', type:'string' },
  { id:'change', label:'Change', type:'string' },
  { id:'read_position', label:'Original read position', type:'number' },
  { id:'signal_position', label:'Original signal position', type:'number' },
  { id:'phase', label:'Phase', type:'string' }
];

function numberOption(value, fallback, min, max, label) {
  const number = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be from ${min} to ${max}.`);
  return number;
}

function checkInputSize(size, options) {
  if (size > effectiveToolLimit(options, 'maxInputCharacters', SANGER_RESOLVER_LIMITS.inputCharacters)) {
    throw new Error('Resolver input exceeds 8,388,608 characters (or bytes for binary trace data).');
  }
}

export function parseSangerResolverInput(input, options = {}) {
  if (typeof input === 'object' && input?.trace && typeof input.reference === 'string') {
    const traceInput = typeof input.trace === 'string' || ArrayBuffer.isView(input.trace) || input.trace instanceof ArrayBuffer ? input.trace : JSON.stringify(input.trace);
    checkInputSize((typeof traceInput === 'string' ? traceInput.length : traceInput.byteLength) + input.reference.length, options);
    return { traceInput, referenceInput: input.reference };
  }
  const text = String(input ?? '');
  checkInputSize(text.length, options);
  if (text.trim().startsWith('{') && !text.includes(SANGER_SESSION_SEPARATOR)) {
    const json = JSON.parse(text);
    if (json.format === 'sms3-sanger-trace-session-v1') {
      if (json.traces?.length !== 1) throw new Error('Provide exactly one mixed trace and one reference.');
      return { traceInput: typeof json.traces[0] === 'string' ? json.traces[0] : JSON.stringify(json.traces[0]), referenceInput: typeof json.reference === 'string' ? json.reference : json.reference?.sequence ?? '' };
    }
  }
  const parts = text.split(SANGER_SESSION_SEPARATOR);
  if (parts.length !== 2) throw new Error('Provide one AB1, SCF or Trace JSON input and one reference DNA sequence.');
  return { traceInput: parts[0].trim(), referenceInput: parts[1].trim() };
}

export function extractSangerEvidence(record, ratio) {
  return record.baseCalls.map((call, index) => {
    const position = call.originalTracePosition - 1;
    const previous = record.baseCalls[index - 1]?.originalTracePosition - 1;
    const next = record.baseCalls[index + 1]?.originalTracePosition - 1;
    const spacing = Math.max(2, Math.min(Number.isFinite(previous) ? position - previous : 16, Number.isFinite(next) ? next - position : 16));
    const radius = Math.max(1, Math.min(3, Math.floor(spacing / 4)));
    const intensities = {};
    for (const base of BASES) {
      const channel = record.traces[base];
      let peak = 0;
      for (let sample = Math.max(0, position - radius); sample <= Math.min(channel.length - 1, position + radius); sample++) peak = Math.max(peak, channel[sample]);
      // These are processed channels. Midpoints can still contain substantial
      // signal from this peak and its neighbors, so subtracting them as a noise
      // floor can erase genuine minority peaks. Use local channel maxima;
      // weak-secondary and extra-channel guards retain noisy-input refusals.
      intensities[base] = peak;
    }
    const ranked = [...BASES].sort((a,b) => intensities[b] - intensities[a]);
    const maximum = intensities[ranked[0]];
    const active = maximum > 0 ? ranked.filter(base => intensities[base] >= maximum * ratio) : [];
    return { readPosition: index + 1, signalPosition: call.originalTracePosition, intensities, ranked, active, code: ambiguity(active),
      secondaryRatio: maximum > 0 ? intensities[ranked[1]] / maximum : 0 };
  });
}

export function reverseSangerEvidence(evidence) {
  return evidence.slice().reverse().map(item => ({ ...item,
    intensities: Object.fromEntries([...BASES].map(base => [base, item.intensities[COMPLEMENT[base]]])),
    ranked: item.ranked.map(base => COMPLEMENT[base]), active: item.active.map(base => COMPLEMENT[base]), code: ambiguity(item.active.map(base => COMPLEMENT[base]))
  }));
}

const alignmentOptions = { mode:'local', matchScore:5, similarScore:5, mismatchScore:-5, gapOpen:10, gapExtend:2, maxAlignmentCells:2500000 };
const align = (reference, sequence, context) => alignPairwiseAffine(reference, sequence, alignmentOptions, context);

function alignmentEvidence(alignment, length) {
  const columns = alignment.columns.filter(column => column.sequence_a !== '-' || column.sequence_b !== '-');
  const matches = columns.filter(column => column.sequence_a === column.sequence_b).length;
  return { identity: matches / Math.max(1, columns.length), coverage: (alignment.endB - alignment.startB + 1) / Math.max(1, length) };
}

function referenceMap(alignment) {
  const map = new Map();
  for (const column of alignment.columns) if (column.sequence_b_position) map.set(column.sequence_b_position - 1, column.sequence_a_position || null);
  return map;
}

export function mergeResolverAlignments(reference, components) {
  if (!components.length) return [];
  const start = Math.min(...components.map(component => component.alignment.startA));
  const end = Math.max(...components.map(component => component.alignment.endA));
  const projections = components.map(component => {
    const bases = new Map(), insertions = new Map();
    let anchor = component.alignment.startA - 1;
    for (const column of component.alignment.columns) {
      if (column.sequence_a !== '-') { anchor = column.sequence_a_position; bases.set(anchor, column.sequence_b); }
      else insertions.set(anchor, (insertions.get(anchor) ?? '') + column.sequence_b);
    }
    return { bases, insertions };
  });
  const rows = ['', ...components.map(() => '')];
  for (let position = start - 1; position <= end; position++) {
    if (position >= start) {
      rows[0] += reference[position - 1];
      projections.forEach((projection, i) => { rows[i + 1] += projection.bases.get(position) ?? '-'; });
    }
    const insertionLength = Math.max(0, ...projections.map(projection => (projection.insertions.get(position) ?? '').length));
    rows[0] += '-'.repeat(insertionLength);
    projections.forEach((projection, i) => { rows[i + 1] += (projection.insertions.get(position) ?? '').padEnd(insertionLength, '-'); });
  }
  return [{ label:'Reference', aligned:rows[0], start }, ...components.map((component, i) => ({ label:component.name, aligned:rows[i + 1], start:1 }))];
}

export async function resolveMixedSangerTrace(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const { traceInput, referenceInput } = parseSangerResolverInput(input, options);
  if (typeof traceInput === 'string' && /^[\s]*[\[{]/.test(traceInput)) {
    const raw = JSON.parse(traceInput);
    const records = Array.isArray(raw) ? raw : Array.isArray(raw.records) ? raw.records : Array.isArray(raw.traces) ? raw.traces : null;
    if (records && records.length !== 1) throw new Error('Provide exactly one mixed trace.');
  }
  const referenceRecord = parseSangerReference(referenceInput, options);
  const reference = referenceRecord.sequence;
  if (reference.length < 40) throw new Error('Use a reference with at least 40 bases.');
  const record = parseSangerTraceInput(traceInput);
  if (record.traceMode === 'base-call-preview') throw new Error('Measured or simulated A/C/G/T channels are required. Base-call FASTA alone cannot resolve a mixed trace.');
  if (record.baseCalls.length < 40 || record.baseCalls.length > SANGER_RESOLVER_LIMITS.readPositions) throw new Error('Use a trace with 40–1,200 read positions.');
  if (record.sampleCount > effectiveToolLimit(options, 'maxSignalSamples', SANGER_RESOLVER_LIMITS.signalSamples)) {
    throw new Error('Trace exceeds 200,000 signal measurements per channel.');
  }
  const ratio = numberOption(options.secondaryPeakPercent, 20, 5, 50, 'Secondary peak threshold') / 100;
  const assumedCount = options.assumedTemplateCount == null || options.assumedTemplateCount === 'auto' ? null : Number(options.assumedTemplateCount);
  if (assumedCount !== null && ![2,3,4].includes(assumedCount)) throw new Error('Choose automatic inference or an assumed count of 2, 3 or 4.');
  const warnings = [...record.warnings];
  if (record.traceMode === 'simulated-channels') warnings.push('Input signals and qualities are simulated. Simulation template identities are not used.');
  const originalTrace = { format:'sms3-sanger-trace-v1', traceMode:record.traceMode, name:record.name,
    bases:record.baseCalls.map(call => call.base).join(''), basePositions:record.baseCalls.map(call => call.originalTracePosition),
    qualities:record.baseCalls.map(call => call.quality), traces:record.traces };
  const result = { format:'sms3-sanger-resolution-v1', method:'Reference-guided peak-set affine decomposition',
    status:'unresolved', reference:referenceRecord, originalTrace,
    assumedTemplateCount:assumedCount, components:[], differences:[], alignmentRows:[], phaseBlocks:[], diagnostics:{}, warnings };
  const evidence = extractSangerEvidence(record, ratio);
  const reverse = reverseSangerEvidence(evidence);
  context.reportProgress?.({ phase:'Aligning channel evidence to the reference', progress:0.1 });
  await context.yieldIfNeeded?.();
  const located = await placeSangerRead({ ...referenceRecord, firstBase:1 }, evidence.map(item => item.code).join(''), alignmentOptions, context);
  if (located.status !== 'placed') { result.warnings.push(located.reason); result.diagnostics.placementStatus = located.status; return result; }
  const placement = located.alignment;
  const reversed = located.orientation === 'reverse-complement';
  // Retain the observed peak-code placement even when reconstruction is
  // withheld. Genotyper's alignment review reuses this completed analysis.
  result.evidenceAlignment = {
    reference_aligned: placement.alignmentA, query_aligned: placement.alignmentB,
    start_reference: placement.startA + referenceRecord.firstBase - 1,
    end_reference: placement.endA + referenceRecord.firstBase - 1,
    start_query: placement.startB, end_query: placement.endB,
    identity_percent: placement.identityPercent, orientation: located.orientation,
  };
  const windowStart = Math.max(0, placement.startA - 129);
  const windowEnd = Math.min(reference.length, placement.endA + 128);
  const alignCandidate = async sequence => {
    const aligned = await align(reference.slice(windowStart, windowEnd), sequence, context);
    aligned.startA += windowStart; aligned.endA += windowStart;
    for (const column of aligned.columns) if (column.sequence_a_position) column.sequence_a_position += windowStart;
    return aligned;
  };
  const oriented = reversed ? reverse : evidence;
  const region = oriented.slice(placement.startB - 1, placement.endB);
  result.orientation = reversed ? 'reverse-complement' : 'forward';
  const coverage = region.length / evidence.length;
  const mixed = region.filter(item => item.active.length === 2).length;
  const complex = region.filter(item => item.active.length > 2).length;
  const weak = region.filter(item => item.secondaryRatio >= 0.075 && item.secondaryRatio < ratio).length;
  result.diagnostics = { analyzedReadPositions:region.length, inputReadPositions:evidence.length, coverage, mixedPositions:mixed, moreThanTwoPeaks:complex, weakSecondaryPositions:weak, secondaryPeakPercent:ratio * 100 };
  function unresolved(message) { warnings.push(message); return result; }
  if (region.length < 40 || coverage < 0.8) return unresolved('The reference does not explain enough of this trace. Haplotype reconstruction was withheld.');
  if (complex) return unresolved('More than two strong channels occur at one or more positions. Additional templates or poor signal may be present; two-template reconstruction was withheld.');
  if (mixed && assumedCount > 2) return unresolved('Reconstruction currently supports at most two distinct sequences. This mixed trace cannot establish the requested three or four templates.');
  if (weak > region.length * 0.1) return unresolved('Repeated weak secondary signals may indicate a low-abundance template or noise. No unique sequence decomposition is reported.');
  const primaryMap = referenceMap(placement);
  const first = [], second = [];
  for (let i = 0; i < region.length; i++) {
    const item = region[i], refPosition = primaryMap.get(placement.startB - 1 + i);
    const refBase = reference[refPosition - 1];
    const base = item.active.includes(refBase) ? refBase : item.ranked[0];
    first.push(item.active.length ? base : 'N');
    second.push(item.active.length > 2 ? 'N' : item.active.find(other => other !== base) ?? base);
  }
  context.reportProgress?.({ phase:'Checking candidate sequences', progress:0.5 });
  const sequences = mixed ? [first.join(''), second.join('')] : [first.join('')];
  const alignments = [];
  for (const sequence of sequences) alignments.push(await alignCandidate(sequence));
  const fits = alignments.map((alignment, i) => alignmentEvidence(alignment, sequences[i].length));
  result.diagnostics.candidateFits = fits;
  if (mixed && alignments[0].gaps > 0) return unresolved('The reference-compatible component itself requires gaps. This method cannot reliably phase changes in both templates; reconstruction was withheld.');
  if (fits.some(fit => fit.coverage < 0.8 || fit.identity < 0.85)) return unresolved('Candidate sequences do not both align sufficiently well to the reference. The mixture may contain unrelated templates, complex changes or poor signal; reconstruction was withheld.');
  if (mixed && alignments.some(alignment => region.some((item, index) => item.active.length === 2 && (index + 1 < alignment.startB || index + 1 > alignment.endB)))) {
    return unresolved('Mixed signals extend beyond a candidate alignment. Terminal haplotype bases cannot be placed reliably; reconstruction was withheld.');
  }
  const maps = alignments.map(referenceMap);
  const unresolvedPositions = new Set();
  if (mixed) {
    let block = null;
    for (let i = 0; i < region.length; i++) {
      const a = maps[0].get(i), b = maps[1].get(i);
      const shifted = a && b && a !== b;
      if (a && a === b && first[i] !== second[i]) unresolvedPositions.add(i);
      if (shifted) {
        if (!block) block = { startReadPosition:region[i].readPosition, endReadPosition:region[i].readPosition, phase:'reference-guided' };
        block.endReadPosition = region[i].readPosition;
      } else if (block) { result.phaseBlocks.push(block); block = null; }
    }
    if (block) result.phaseBlocks.push(block);
    for (const block of result.phaseBlocks) [block.startReadPosition, block.endReadPosition] = [Math.min(block.startReadPosition, block.endReadPosition), Math.max(block.startReadPosition, block.endReadPosition)];
    // One heterozygous site with no indels determines an unordered allele pair.
    // Ambiguity is about linkage to other differences, not the arbitrary labels.
    if (mixed === 1 && alignments.every(alignment => alignment.gaps === 0)) unresolvedPositions.clear();
    for (const index of unresolvedPositions) first[index] = second[index] = ambiguity([first[index], second[index]]);
    warnings.push('Rows are reference-guided candidate sequences. Relative phase between separate shifted regions is not established; mixture fractions and confidence probabilities are not estimated.');
    if (unresolvedPositions.size) warnings.push(`${unresolvedPositions.size} mixed position(s) lack phase information and remain IUPAC ambiguity codes in both candidates.`);
  }
  const finalSequences = [first.join(''), second.join('')];
  const count = mixed ? 2 : assumedCount ?? 1;
  for (let index = 0; index < count; index++) {
    const sequenceIndex = mixed ? index : 0;
    const rawAlignment = alignments[sequenceIndex];
    const alignment = Object.fromEntries(['startA','endA','startB','endB','alignmentA','alignmentB','columns'].map(key => [key, structuredClone(rawAlignment[key])]));
    for (const column of alignment.columns) if (column.sequence_b_position) {
      column.sequence_b = finalSequences[sequenceIndex][column.sequence_b_position - 1];
      column.relation = column.sequence_a === '-' || column.sequence_b === '-' ? 'gap' : column.sequence_a === column.sequence_b ? 'match' : /^[ACGT]$/.test(column.sequence_b) ? 'mismatch' : 'similar';
      column.score = null;
      column.marker = column.relation === 'match' ? '|' : column.relation === 'similar' ? ':' : column.relation === 'gap' ? ' ' : '.';
    }
    alignment.alignmentB = alignment.columns.map(column => column.sequence_b).join('');
    const source = region.slice(alignment.startB - 1, alignment.endB);
    const component = { id:`candidate_${index + 1}`, name:mixed ? `Candidate ${index + 1}` : count > 1 ? `Assumed copy ${index + 1}` : 'Sequence',
      sequence:finalSequences[sequenceIndex].slice(alignment.startB - 1, alignment.endB),
      phase:mixed ? 'reference-guided; global phase unconfirmed' : count > 1 ? 'copy count supplied' : 'single distinguishable sequence',
      referenceStart:alignment.startA, referenceEnd:alignment.endA,
      sourcePositions:source.map(item => ({ readPosition:item.readPosition, signalPosition:item.signalPosition })), alignment };
    result.components.push(component);
    let anchor = alignment.startA - 1;
    for (const column of alignment.columns) {
      if (column.sequence_a_position) anchor = column.sequence_a_position;
      if (column.sequence_a === column.sequence_b) continue;
      const sourceIndex = column.sequence_b_position ? column.sequence_b_position - 1 : null;
      const item = sourceIndex === null ? null : region[sourceIndex];
      result.differences.push({ component:component.name, reference_position:column.sequence_a_position || null, reference_anchor:anchor,
        reference_base:column.sequence_a, candidate_base:column.sequence_b,
        change:column.sequence_a === '-' ? 'insertion' : column.sequence_b === '-' ? 'deletion' : unresolvedPositions.has(sourceIndex) ? 'unphased mixed base' : 'substitution',
        read_position:item?.readPosition ?? null, signal_position:item?.signalPosition ?? null,
        phase:unresolvedPositions.has(sourceIndex) ? 'unresolved' : mixed ? 'reference-guided' : 'single sequence' });
    }
    // Public candidate coordinates index the retained sequence/sourcePositions,
    // not the longer temporary sequence used by local alignment above.
    const queryOffset = alignment.startB - 1;
    for (const column of alignment.columns) if (column.sequence_b_position) column.sequence_b_position -= queryOffset;
    alignment.startB = 1;
    alignment.endB = component.sequence.length;
  }
  result.status = mixed ? unresolvedPositions.size ? 'partially-resolved' : 'candidate-haplotypes' : 'single-sequence';
  result.diagnostics.unphasedPositions = unresolvedPositions.size;
  result.diagnostics.distinguishableSequences = mixed ? 2 : 1;
  if (!mixed && assumedCount) warnings.push(`One distinguishable sequence; ${assumedCount} copies are assumed from the supplied count, not inferred from the trace.`);
  if (record.traceMode === 'measured-channels') warnings.push('This initial method has synthetic and external-tool benchmark coverage; independently verified experimental haplotype accuracy has not yet been established.');
  result.alignmentRows = mergeResolverAlignments(reference, result.components);
  const offset = referenceRecord.firstBase - 1;
  result.alignmentRows[0].start += offset;
  for (const component of result.components) {
    component.referenceStart += offset; component.referenceEnd += offset;
    component.alignment.startA += offset; component.alignment.endA += offset;
    for (const column of component.alignment.columns) if (column.sequence_a_position) column.sequence_a_position += offset;
  }
  for (const row of result.differences) {
    if (row.reference_position !== null) row.reference_position += offset;
    row.reference_anchor += offset;
  }
  context.throwIfCancelled?.(); context.reportProgress?.({ phase:'Finished reconstruction', progress:0.9 });
  return result;
}

export function sangerCandidateColumnRelations(rows) {
  return Array.from(rows[0]?.aligned ?? '', (_, index) => {
    const symbols = rows.map(row => row.aligned[index]);
    if (symbols.includes('-')) return 'gap';
    if (symbols.some(symbol => !/^[ACGT]$/.test(symbol))) return 'similar';
    return new Set(symbols).size === 1 ? 'match' : 'mismatch';
  });
}
