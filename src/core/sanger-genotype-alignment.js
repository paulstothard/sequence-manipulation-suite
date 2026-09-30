import { makeSangerReferenceAlignmentSvg } from './sanger-trace.js';
import { hasSangerGenotypeCandidates, SANGER_CANDIDATE_ALIGNMENT_CELL_LIMIT } from './sanger-genotype-candidates.js';

// Build from completed genotyping results; do not realign or resolve a second
// time. Candidate query coordinates point back to original trace base calls.
export function sangerGenotypeAlignmentModel(result) {
  const referenceAlignments = [], warnings = [];
  result.reads.forEach((read, index) => {
    const traceId = `Trace ${index + 1}`;
    const common = { query_type: 'trace', source_name: `${read.sample} / ${read.name}` };
    if (hasSangerGenotypeCandidates(read)) {
      read.resolution.components.forEach((component, candidate) => {
        const alignment = component.alignment;
        referenceAlignments.push({ ...common,
          query_name: `${traceId} · Candidate haplotype ${candidate + 1}`,
          orientation: read.resolution.orientation, source_orientation: read.resolution.orientation,
          phase: component.phase,
          reference_aligned: alignment.alignmentA, query_aligned: alignment.alignmentB,
          start_reference: alignment.startA, end_reference: alignment.endA,
          // sourcePositions already contains only the aligned candidate span.
          start_query: 1, end_query: component.sourcePositions.length,
          identity_percent: 100 * alignment.columns.filter(column =>
            column.sequence_a === column.sequence_b).length / alignment.columns.length,
          query_source_positions: component.sourcePositions.map(position => ({
            ...position, readPosition: position.readPosition + read.trim.start - 1,
          })),
        });
      });
    } else if (read.resolution?.evidenceAlignment) {
      const alignment = read.resolution.evidenceAlignment;
      const reversed = alignment.orientation === 'reverse-complement';
      referenceAlignments.push({ ...common, ...alignment,
        query_name: `${traceId} · Observed peak calls`, source_orientation: alignment.orientation,
        phase: read.reason || 'Haplotypes unresolved',
        query_source_positions: Array.from(read.trace.bases, (_, i) => {
          const sourceIndex = reversed ? read.trace.bases.length - i - 1 : i;
          return { readPosition: read.trim.start + sourceIndex, signalPosition: read.trace.basePositions[sourceIndex] };
        }),
      });
      warnings.push(`${traceId} (${read.sample} / ${read.name}): showing observed peak calls; ${read.reason || 'haplotypes unresolved'}.`);
    } else {
      warnings.push(`${traceId} (${read.sample} / ${read.name}): no alignment available; ${read.reason || 'insufficient usable signal'}.`);
    }
  });
  const cells = referenceAlignments.reduce((sum, alignment) => sum + 2 * alignment.reference_aligned.length, 0);
  if (cells > SANGER_CANDIDATE_ALIGNMENT_CELL_LIMIT) {
    throw new Error('Trace/reference alignment exceeds 20,000 cells. Use fewer traces for this figure; Analysis JSON retains the full results.');
  }
  return { task: 'compare', reference: result.reference, referenceAlignments, resolution: true, warnings,
    alignmentTitle: 'Sanger trace/reference alignment',
    alignmentFooter: 'Reference and original read coordinates. Candidate labels apply within each trace; IUPAC bases retain uncertain phase.',
  };
}

export function sangerGenotypeAlignmentSvg(result) {
  const model = sangerGenotypeAlignmentModel(result);
  return { svg: makeSangerReferenceAlignmentSvg(model), warnings: model.warnings };
}
