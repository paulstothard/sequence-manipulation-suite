import { effectiveToolLimit } from './tool-limit-policy.js';
import { prepareSangerAlleleCollection } from './sanger-allele-preparation.js';
import { genotypeSangerTraces } from './sanger-genotype.js';
import { hasSangerGenotypeCandidates } from './sanger-genotype-candidates.js';
import { formatFastaRecord } from './fasta.js';
import { prepareSangerTrace, prepareSangerTraceSession, makeSangerTraceJson } from './sanger-trace.js';

export const sangerResolutionColumns = [
  ['sequence_id', 'Sequence ID'], ['source_trace', 'Source trace'], ['source_name', 'Source name'],
  ['candidate', 'Candidate haplotype'], ['status', 'Status'], ['length', 'Sequence length'],
  ['reference_start', 'Reference start'], ['reference_end', 'Reference end'],
  ['orientation', 'Orientation to reference'], ['ploidy', 'Ploidy'], ['phase', 'Phase'], ['reason', 'Reason'],
].map(([id, label]) => ({ id, label, type: ['length', 'reference_start', 'reference_end', 'ploidy'].includes(id) ? 'number' : 'string' }));

export const sangerResolvedDifferenceColumns = [
  { id: 'reference_anchor', label: 'Reference anchor', type: 'number' },
  { id: 'source_trace', label: 'Source trace', type: 'string' },
  { id: 'source_name', label: 'Source name', type: 'string' },
  { id: 'candidate_id', label: 'Candidate haplotype ID', type: 'string' },
  { id: 'source_orientation', label: 'Source orientation to reference', type: 'string' },
  { id: 'original_read_position', label: 'Original read position', type: 'number' },
  { id: 'original_signal_position', label: 'Original signal position', type: 'number' },
  { id: 'phase', label: 'Phase', type: 'string' },
];

const direction = (a, b) => (a === 'reverse-complement') !== (b === 'reverse-complement') ? 'reverse-complement' : 'forward';
const cleanName = name => String(name).replace(/[\t\r\n]/g, ' ');

// Compare reference-anchored allele paths, including insertion/deletion columns.
// Alternatives from the same physical trace stay in separate contigs. Unphased
// ambiguity must agree exactly; it cannot choose a cross-trace phase assignment.
export function sangerCandidatesCompatible(a, b) {
  if (a.sourceTrace === b.sourceTrace) return false;
  const first = Math.max(a.component.referenceStart, b.component.referenceStart);
  const last = Math.min(a.component.referenceEnd, b.component.referenceEnd);
  if (last < first) return true;
  for (let position = first; position <= last; position++) {
    if (a.referenceBases.get(position) !== b.referenceBases.get(position)) return false;
    if (position < last && (a.insertions.get(position) ?? '') !== (b.insertions.get(position) ?? '')) return false;
  }
  return true;
}

export function candidateRecord(component, read, prepared, traceIndex, candidateIndex) {
  const id = `trace${traceIndex + 1}_candidate${candidateIndex + 1}`;
  const label = `Trace ${traceIndex + 1} / candidate haplotype ${candidateIndex + 1}`;
  const mapping = component.sourcePositions.map(source => {
    const call = prepared.view.baseCalls[source.readPosition - 1];
    return { readPosition: call.originalIndex, signalPosition: call.originalTracePosition,
      sourceDisplayIndex: call.displayIndex, sourceTracePosition: call.tracePosition };
  });
  const candidate = { id, label, sourceTrace: `Trace ${traceIndex + 1}`, sourceIndex: traceIndex,
    sourceName: prepared.view.record, ploidy: read.ploidy, phase: component.phase,
    orientation: direction(prepared.view.orientation, read.orientation), component,
    sourcePositions: mapping, referenceBases: new Map(), insertions: new Map(), coordinates: [],
    phaseBlocks: (read.resolution.phaseBlocks ?? []).map(block => ({
      start: prepared.view.baseCalls[block.startReadPosition - 1].originalIndex,
      end: prepared.view.baseCalls[block.endReadPosition - 1].originalIndex,
    })).map(block => ({ start: Math.min(block.start, block.end), end: Math.max(block.start, block.end) })),
  };
  let anchor = component.referenceStart - 1;
  for (const column of component.alignment.columns) {
    if (column.sequence_a_position) {
      anchor = column.sequence_a_position;
      candidate.referenceBases.set(anchor, column.sequence_b);
    } else candidate.insertions.set(anchor, (candidate.insertions.get(anchor) ?? '') + column.sequence_b);
    if (column.sequence_b_position) candidate.coordinates.push(column.sequence_a_position
      ? `r${anchor}` : `i${anchor}:${candidate.insertions.get(anchor).length}`);
  }
  // Inferred bases have no independently calibrated Phred qualities or channel
  // arrays. Original signal stays in sourceCollection and sourcePositions.
  const result = prepareSangerTrace(formatFastaRecord(label, component.sequence), { trimMethod: 'manual' });
  result.candidate = candidate;
  result.view.traces = { A: [], C: [], G: [], T: [] };
  result.view.sampleCount = 0;
  result.view.baseCalls = result.view.baseCalls.map((call, i) => ({ ...call, quality: null,
    originalIndex: mapping[i].readPosition, originalTracePosition: mapping[i].signalPosition }));
  result.warnings = [];
  return result;
}

function comparisonForCandidate(result, reference) {
  const c = result.candidate, a = c.component.alignment;
  const provenance = { source_trace: c.sourceTrace, source_name: c.sourceName, candidate_id: c.id, source_orientation: c.orientation, phase: c.phase };
  const common = { query_type: 'candidate haplotype', query_name: c.label, orientation: 'forward', reference: reference.title, ...provenance };
  let anchor = a.startA - 1;
  const differences = a.columns.flatMap(column => {
    if (column.sequence_a_position) anchor = column.sequence_a_position;
    if (column.sequence_a === column.sequence_b) return [];
    const source = column.sequence_b_position ? c.sourcePositions[column.sequence_b_position - 1] : null;
    return [{ ...common, reference_anchor: anchor, alignment_column: column.alignment_position, reference_position: column.sequence_a_position || '',
      query_position: column.sequence_b_position || '', reference_base: column.sequence_a, query_base: column.sequence_b,
      relation: column.sequence_a === '-' || column.sequence_b === '-' ? 'gap' : column.relation === 'similar' ? 'unphased' : 'mismatch',
      quality: '', original_read_position: source?.readPosition ?? '', original_signal_position: source?.signalPosition ?? '' }];
  });
  const identity = 100 * a.columns.filter(column => column.sequence_a === column.sequence_b).length / a.columns.length;
  return {
    alignment: { ...common, reference_aligned: a.alignmentA, query_aligned: a.alignmentB,
      start_reference: a.startA, end_reference: a.endA, start_query: 1, end_query: c.component.sequence.length, identity_percent: identity },
    summary: { ...common, reference_start: a.startA, reference_end: a.endA, query_start: 1, query_end: c.component.sequence.length,
      identity_percent: identity, aligned_length: a.columns.length, mismatches: differences.filter(row => row.relation !== 'gap').length,
      gaps: differences.filter(row => row.relation === 'gap').length },
    differences,
  };
}

export async function prepareResolvedSangerSession(input, options = {}, context = {}) {
  if (options.task === 'assemble') {
    const { prepareDeNovoSangerSession } = await import('./sanger-denovo-session.js');
    return prepareDeNovoSangerSession(input, options, context);
  }
  const ploidy = Number(options.ploidy ?? 2);
  if (![1, 2, 3, 4].includes(ploidy)) throw new Error('Choose ploidy 1, 2, 3 or 4.');
  const source = typeof input === 'string' ? input : JSON.stringify({ ...input, format: 'sms3-sanger-trace-session-v1' });
  if (source.length > effectiveToolLimit(options, 'maxInputCharacters', 33554432)) throw new Error('Resolving input exceeds 33,554,432 characters.');
  const sourceCollection = prepareSangerAlleleCollection(source, { ...options, resolveSequences: true, maxSessionTraces: 20 });
  if (!sourceCollection.reference) throw new Error('Supply a reference DNA sequence to resolve traces for reference comparison.');
  for (const prepared of sourceCollection.traces) {
    if (prepared.trace.sampleCount > effectiveToolLimit(options, 'maxSignalSamples', 200000))
      throw new Error('Resolving supports 200,000 signal measurements per channel while this limit is enforced.');
  }
  if (sourceCollection.traces.length > 20) throw new Error('Resolving supports at most 20 input traces.');
  const eligible = [], excluded = new Map();
  sourceCollection.traces.forEach((prepared, index) => {
    const reason = prepared.trace.traceMode === 'base-call-preview' ? 'A/C/G/T channels are required for resolving.'
      : prepared.sequence.length < 40 || prepared.sequence.length > 1200 ? 'Resolving requires 40–1,200 retained base calls.' : '';
    if (reason) excluded.set(index, reason);
    else eligible.push({ sample: `Trace ${index + 1}`, trace: JSON.parse(makeSangerTraceJson(prepared)) });
  });
  const analysis = eligible.length ? await genotypeSangerTraces({
    reference: sourceCollection.reference, traces: eligible,
  }, { ...options, siteMode: 'variants', ploidy, trimMode: 'none', autoTrim: false, clipStart: 0, clipEnd: 0 }, context) : null;
  const reads = new Map((analysis?.reads ?? []).map(read => [read.sample, read]));
  const traces = [], resolutions = [], warnings = [...sourceCollection.warnings];
  for (const [index, prepared] of sourceCollection.traces.entries()) {
    context.throwIfCancelled?.(); await context.yieldIfNeeded?.();
    const read = reads.get(`Trace ${index + 1}`);
    const resolution = read?.resolution;
    let reason = excluded.get(index) || (read && !hasSangerGenotypeCandidates(read)
      ? read.reason || `Candidate haplotypes are unsupported for ploidy ${ploidy}.` : '');
    if (!resolution?.components.length && !reason) reason = 'No supported candidate sequence.';
    const base = { source_trace: `Trace ${index + 1}`, source_name: prepared.view.record, ploidy };
    if (reason) {
      if (options.unresolvedTraceAction === 'error') throw new Error(`${base.source_trace} (${base.source_name}): ${reason}`);
      warnings.push(`${base.source_trace} (${base.source_name}) excluded from sequence analysis: ${reason}`);
      resolutions.push({ ...base, sequence_id: '', candidate: '', status: 'unresolved', reason });
      continue;
    }
    // Identical candidates (including fully unphased SNP strings) represent one
    // distinguishable sequence. Retain the phase limitation in its provenance.
    const unique = resolution.components.filter((component, i, all) => all.findIndex(other =>
      other.sequence === component.sequence && other.alignment.alignmentA === component.alignment.alignmentA && other.referenceStart === component.referenceStart) === i);
    unique.forEach((component, i) => {
      const result = candidateRecord(component, read, prepared, index, i);
      traces.push(result);
      resolutions.push({ ...base, sequence_id: result.candidate.id, candidate: `Candidate haplotype ${i + 1}`,
        status: resolution.status, length: result.sequence.length, reference_start: component.referenceStart,
        reference_end: component.referenceEnd, orientation: result.candidate.orientation, phase: component.phase, reason: '' });
    });
    warnings.push(...resolution.warnings.map(warning => `${base.source_trace}: ${warning}`));
  }
  const candidatesByLabel = new Map(traces.map(result => [result.view.record, result.candidate]));
  const session = await prepareSangerTraceSession('', { ...options, assemblyTryReverseComplement: false }, {
    ...context,
    canCombineReads: (placed, read) => placed.every(other =>
      sangerCandidatesCompatible(candidatesByLabel.get(other.title), candidatesByLabel.get(read.title))),
    canPlaceRead: (contig, placement) => contig.reads.every(other => {
      const otherStart = other.start + placement.shift;
      const first = Math.max(otherStart, placement.start);
      const last = Math.min(other.end + placement.shift, placement.end);
      const a = candidatesByLabel.get(other.title), b = candidatesByLabel.get(placement.read.title);
      for (let position = first; position <= last; position++)
        if (a.coordinates[position - otherStart] !== b.coordinates[position - placement.start]) return false;
      return true;
    }),
  }, { ...sourceCollection, reference: null, traces, warnings: [] });
  session.collection.reference = sourceCollection.reference;
  session.reference = sourceCollection.reference;
  session.sourceCollection = sourceCollection;
  session.resolution = { enabled: true, ploidy, secondaryPeakPercent: Number(options.secondaryPeakPercent ?? 20),
    unresolvedTraceAction: options.unresolvedTraceAction ?? 'exclude', rows: resolutions, analysis };
  session.comparisonSummaries = []; session.referenceAlignments = []; session.referenceDifferences = [];
  for (const result of traces) {
    const comparison = comparisonForCandidate(result, session.reference);
    session.comparisonSummaries.push(comparison.summary);
    session.referenceAlignments.push(comparison.alignment);
    session.referenceDifferences.push(...comparison.differences);
  }
  for (const contig of session.assembly.contigs) {
    contig.sourceTraces = [...new Set(contig.reads.map(read => candidatesByLabel.get(read.title).sourceTrace))];
    contig.candidateIds = contig.reads.map(read => candidatesByLabel.get(read.title).id);
  }
  session.warnings = [...new Set([...warnings, ...session.warnings.filter(warning => !warning.startsWith('No reference sequence'))])];
  return session;
}

export function sangerResolvedFasta(session, lineWidth = 60) {
  return session.collection.traces.map(result => {
    const c = result.candidate;
    return formatFastaRecord(`${c.id} source_trace=${c.sourceIndex + 1}; source_name=${cleanName(c.sourceName)}; reference=${cleanName(session.reference.title)}; span=${c.component.referenceStart}-${c.component.referenceEnd}; ploidy=${c.ploidy}; ${c.phase}`, result.sequence, lineWidth);
  }).join('');
}
