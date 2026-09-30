import { makeSangerPlotModel, renderSangerPlot, composeSangerSvg as composeSvg } from '../../core/sanger-plot.js';
import { prepareResolvedSangerSession, sangerResolvedFasta, sangerResolutionColumns, sangerResolvedDifferenceColumns } from '../../core/sanger-resolved-session.js';
import { sangerAssemblyResolutionColumns } from '../../core/sanger-denovo-session.js';
import { makeSangerAssemblyTraceMapSvg, makeSangerAssemblyTextMap, makeSangerReferenceTraceMapSvg,
  makeSangerReferenceAlignmentSvg, makeSangerDifferenceReviewSvg, makeSangerCollectionTraceSvg,
  makeSangerCollectionBaseCallRows, makeSangerCollectionFasta, makeSangerCollectionFastq,
  makeSangerTraceCollectionViewData, makeSangerTraceJson, sangerBaseCallColumns, sangerReferenceDifferenceColumns } from '../../core/sanger-trace.js';
import { makeAlignmentSvg } from '../../core/alignment-svg.js';
import { sangerCandidateColumnRelations } from '../../core/resolve-mixed-sanger-trace.js';
import { sangerGenotypeColumns } from '../../core/sanger-genotype.js';
import { formatFastaRecord } from '../../core/fasta.js';
import { makeToolResult, makeTableStream, makeTextStream } from '../../core/workflow.js';

const safe = value => String(value ?? '').replace(/[\t\r\n]/g, ' ');
const tsv = (columns, rows) => [columns.map(c => c.id).join('\t'), ...rows.map(row => columns.map(c => safe(row[c.id])).join('\t'))].join('\n');
const withSource = columns => [...columns, { id: 'source_trace', label: 'Source trace', type: 'string' }];

function report(session) {
  if (session.resolution.mode === 'draft-contigs') return assemblyReport(session);
  const r = session.resolution, sources = session.sourceCollection.traces;
  const lines = [session.task === 'assemble' ? 'Sanger trace assembly with resolving' : 'Sanger reference comparison with resolving',
    `Reference: ${session.reference.title}; bases ${session.reference.firstBase}–${session.reference.lastBase}`,
    `Input traces: ${sources.length}; candidate sequences: ${session.collection.traces.length}; excluded traces: ${r.rows.filter(row => row.status === 'unresolved').length}`,
    `Ploidy: ${r.ploidy}; secondary peak threshold: ${r.secondaryPeakPercent}%; unresolved traces: ${r.unresolvedTraceAction}`,
    'Method: reference-guided peak-set reconstruction. Automatic trimming uses combined peak signal; explicit clip coordinates are preserved.',
    'Candidate numbers are local to each trace. IUPAC codes retain uncertain bases; relative phase between separate regions and traces remains unconfirmed.',
    'Candidate bases have no independent Phred qualities. Original channels and qualities are retained as source evidence.', '', 'Source traces'];
  sources.forEach((source, i) => lines.push(`Trace ${i + 1}: ${safe(source.view.record)}; retained original bases ${source.view.clipStart}–${source.view.clipEnd}; ${source.view.orientation}; ${source.automaticTrim ? 'signal-aware Mott trimming' : 'manual clipping'}`));
  lines.push('', 'Sequences');
  for (const row of r.rows) lines.push(row.sequence_id
    ? `${row.sequence_id}: ${row.source_trace}; ${row.length} bases; reference ${row.reference_start}–${row.reference_end}; ${row.orientation}; ${row.phase}`
    : `${row.source_trace}: excluded; ${row.reason}`);
  for (const result of session.collection.traces) if (result.candidate.phaseBlocks.length)
    lines.push(`${result.candidate.id} phase blocks (original read bases): ${result.candidate.phaseBlocks.map(b => `${b.start}–${b.end}`).join(', ')}`);
  lines.push('', `Candidate/reference difference rows: ${session.referenceDifferences.length}`, '', ...session.warnings.map(w => `Note: ${w}`));
  return lines.join('\n');
}

function assemblyReport(session) {
  const r = session.resolution;
  const lines = ['Sanger trace assembly with resolving',
    `Input traces: ${session.sourceCollection.traces.length}; candidate sequences: ${session.collection.traces.filter(t=>t.candidate.kind==='candidate-haplotype').length}; reliable fragments: ${session.collection.traces.filter(t=>t.candidate.kind==='reliable-fragment').length}`,
    `Draft contigs: ${r.drafts.length}; ploidy: ${r.ploidy}; secondary peak threshold: ${r.secondaryPeakPercent}%`,
    'Drafts are assembled once from reliable unambiguous regions with exact overlaps. Other traces must support the draft across mixed positions before reconstruction is accepted.',
    'Unresolved mixtures and poor signal split reads into separate fragments. Isolated mixed SNPs retain IUPAC codes. Retained fragments require at least 20 bases and the selected minimum overlap length.',
    'Draft coordinates belong to this run. Candidate numbers apply within each source trace; global phase remains unconfirmed.', '', 'Source traces'];
  session.sourceCollection.traces.forEach((source,i)=>lines.push(`Trace ${i+1}: ${safe(source.view.record)}; retained original bases ${source.view.clipStart}–${source.view.clipEnd}; ${source.view.orientation}`));
  lines.push('', 'Assembly sequences');
  for (const row of r.rows) lines.push(row.sequence_id
    ? `${row.sequence_id}: ${row.source_trace}; ${row.sequence_kind}; ${row.length} bases; original bases ${row.source_start}–${row.source_end}; ${row.orientation}${row.draft_contig ? `; ${row.draft_contig} bases ${row.draft_start}–${row.draft_end}` : ''}; ${row.phase}`
    : `${row.source_trace}: excluded; ${row.reason}`);
  lines.push('', 'Excluded regions within clipped input');
  for (const e of r.exclusions) lines.push(`${e.source_trace}: original bases ${e.ranges.map(r=>`${r.start}–${r.end}`).join(', ')}; ${e.reason}`);
  if (!r.exclusions.length) lines.push('None.');
  lines.push('', `Conditional contigs: ${session.assembly.contigs.length}`,
    `Minimum overlap: ${session.assembly.options.minOverlap}; maximum overlap mismatch: ${session.assembly.options.maxMismatchPercent}%; overlapping retained bases must also share an IUPAC allele.`,
    'Alternatives from one trace stay in separate contigs. Each sequence is placed once; shared reads may extend only one compatible contig.');
  for (const contig of session.assembly.contigs) lines.push(`${contig.title}: ${contig.sequence.length} bases; ${contig.sourceTraces.length} source traces; sequences ${contig.sequenceIds.join(', ')}`);
  lines.push('', ...session.warnings.map(w=>`Note: ${w}`));
  return lines.join('\n');
}

function assemblyInputFasta(session, candidatesOnly = false) {
  return session.collection.traces.filter(r=>!candidatesOnly || r.candidate.kind==='candidate-haplotype').map(result=>{
    const c=result.candidate, positions=c.sourcePositions.map(p=>p.readPosition);
    return formatFastaRecord(`${c.id} source_trace=${c.sourceIndex+1}; source_name=${safe(c.sourceName)}; type=${c.kind}; original_span=${Math.min(...positions)}-${Math.max(...positions)}; orientation=${c.orientation}; ${c.draft ? `draft=${c.draft}; span=${c.component.referenceStart}-${c.component.referenceEnd}; ` : ''}${c.phase}`,result.sequence);
  }).join('');
}


function candidateAlignment(session) {
  const figures = [];
  for (const [i, source] of session.sourceCollection.traces.entries()) {
    const results = session.collection.traces.filter(r => r.candidate.sourceIndex === i && r.candidate.component);
    if (!results.length) continue;
    const read = session.resolution.analysis.reads.find(r => r.sample === `Trace ${i + 1}`);
    const rows = [{ ...read.resolution.alignmentRows[0], ...(session.resolution.mode === 'draft-contigs' ? {label:results[0].candidate.draft} : {}) }, ...results.map(result => {
      const index = read.resolution.components.indexOf(result.candidate.component);
      return { ...read.resolution.alignmentRows[index + 1], label: result.candidate.id };
    })];
    figures.push(makeAlignmentSvg({ title: `Trace ${i + 1}: candidate haplotypes`, summary: `Source: ${source.view.record}; ${session.resolution.mode === 'draft-contigs' ? `draft contig: ${results[0].candidate.draft}` : `reference: ${session.reference.title}`}`,
      rows, columnRelations: sangerCandidateColumnRelations(rows), showConsensusLine: false,
      note: 'Candidates share one source trace. IUPAC bases retain uncertainty; global phase remains unconfirmed.' }));
  }
  if (!figures.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="100" viewBox="0 0 1000 100"><text x="24" y="42" font-family="Arial, sans-serif" font-size="16">No supported candidate haplotypes. Inspect retained fragments in the assembly outputs.</text></svg>';
  return composeSvg(figures);
}

function evidenceSession(session) {
  // Candidate query indexes point back to the original prepared trace. Only the
  // lookup table changes; every displayed channel measurement remains original.
  const traces = session.collection.traces.map(result => {
    const c = result.candidate, source = session.sourceCollection.traces[c.sourceIndex];
    return { ...result, view: { ...source.view, record: result.view.record,
      baseCalls: c.sourcePositions.map((position, i) => ({ ...source.view.baseCalls[position.sourceDisplayIndex - 1], displayIndex: i + 1 })),
    } };
  });
  return { ...session, collection: { ...session.collection, traces } };
}

function analysisJson(session, options) {
  return JSON.stringify({ format: 'sms3-sanger-resolved-session-v1', task: session.task,
    reference: session.reference, settings: { resolveSequences: true, ploidy: session.resolution.ploidy, referenceStart:session.reference?.firstBase ?? null,
      mottErrorLimit:Number(options.mottErrorLimit ?? 0.05), secondaryPeakPercent:session.resolution.secondaryPeakPercent,
      trimMode: options.trimMode ?? null, trimMethod: options.trimMode ? (options.trimMode === 'auto' ? 'mott' : 'manual') : options.trimMethod ?? 'mott',
      unresolvedTraceAction: session.resolution.unresolvedTraceAction },
    sourceTraces: session.sourceCollection.traces.map((source, i) => ({ id: `Trace ${i + 1}`, trace: source.trace,
      retained: { start: source.view.clipStart, end: source.view.clipEnd, orientation: source.view.orientation },
      preparedCalls:source.view.baseCalls.map(call=>({base:call.base,originalIndex:call.originalIndex,originalTracePosition:call.originalTracePosition,quality:call.quality})) })),
    resolutions: session.resolution.rows, drafts: session.resolution.drafts ?? [], excludedRegions: session.resolution.exclusions ?? [],
    sequences: session.collection.traces.map(result => ({ id: result.candidate.id, sequence: result.sequence,
      sourceTrace: result.candidate.sourceTrace, sourceName: result.candidate.sourceName,
      kind: result.candidate.kind ?? 'candidate-haplotype', draft: result.candidate.draft ?? null, phase: result.candidate.phase, phaseBlocks: result.candidate.phaseBlocks,
      sourcePositions: result.candidate.sourcePositions, alignment: result.candidate.component?.alignment ?? null,
      orientation: result.candidate.orientation })),
    assembly: session.assembly, referenceAlignments: session.referenceAlignments,
    referenceDifferences: session.referenceDifferences, genotypes: session.resolution.analysis?.rows ?? [], warnings: session.warnings,
  });
}

export async function runResolvedSangerSession(input, options, context = {}) {
  const session = await prepareResolvedSangerSession(input, options, context);
  const format = options.outputFormat ?? (options.task === 'assemble' ? 'assembly-trace-map-svg' : 'reference-trace-map-svg');
  const deNovo = session.resolution.mode === 'draft-contigs';
  const resolutionSchema = deNovo ? 'sanger-assembly-resolution' : 'sanger-resolution';
  const resolutionColumns = deNovo ? sangerAssemblyResolutionColumns : sangerResolutionColumns;
  const genotypeColumns = deNovo ? sangerGenotypeColumns.map(c=>c.id==='reference'?{...c,label:'Draft contig'}:c) : sangerGenotypeColumns;
  let summary;
  const getSummary = () => summary ??= report(session);
  const baseRows = format === 'tsv' ? session.sourceCollection.traces.flatMap((source, i) =>
    makeSangerCollectionBaseCallRows({ traces: [source] }).map(row => ({ source_trace: `Trace ${i + 1}`, ...row }))) : [];
  const streams = {};
  let output, mimeType = 'text/plain', filename = 'sanger-resolution-report.txt', visual, sequenceSearch;
  const textOutput = (value, key, mime, extension) => {
    output = value; mimeType = mime; filename = `sanger-${key}.${extension}`;
    streams[key] = makeTextStream(output, mime);
  };
  const tableOutput = (columns, rows, key, schema) => {
    output = tsv(columns, rows); mimeType = 'text/tab-separated-values'; filename = `sanger-${key}.tsv`;
    streams[key] = makeTableStream(columns, rows, schema);
  };
  const visualFormats = ['candidate-alignment-svg', 'assembly-trace-map-svg', 'reference-trace-map-svg', 'reference-alignment-svg', 'difference-review-svg'];
  if (visualFormats.includes(format)) {
    const cells = session.collection.traces.reduce((n, result) => n + (result.candidate.component?.alignment.columns.length ?? result.sequence.length) * 2, 0);
    if (cells > 20000) throw new Error('Resolved figures support 20,000 alignment cells. Use sequence, table or Analysis JSON output for the complete result.');
  }
  if (format === 'assembly-input-fasta' && deNovo) textOutput(assemblyInputFasta(session), 'assemblyInputFasta', 'text/x-fasta', 'fasta');
  else if (['candidate-fasta', 'fasta'].includes(format)) {
    if (session.collection.traces.length || format === 'fasta' || deNovo)
      textOutput(format === 'fasta' ? makeSangerCollectionFasta(session.sourceCollection) : deNovo ? assemblyInputFasta(session, true) : sangerResolvedFasta(session), format === 'fasta' ? 'fasta' : 'candidateFasta', 'text/x-fasta', 'fasta');
  } else if (format === 'fastq') textOutput(makeSangerCollectionFastq(session.sourceCollection), 'fastq', 'text/x-fastq', 'fastq');
  else if (format === 'analysis-json') textOutput(analysisJson(session, options), 'analysisJson', 'application/json', 'json');
  else if (format === 'trace-json') textOutput(JSON.stringify({ format:'sms3-sanger-trace-session-result-v1', traces:session.sourceCollection.traces.map(source=>JSON.parse(makeSangerTraceJson(source))), reference:session.reference, traceCount:session.sourceCollection.traces.length }), 'traceJson', 'application/json', 'json');
  else if (format === 'resolution-tsv') tableOutput(resolutionColumns, session.resolution.rows, 'resolution', resolutionSchema);
  else if (format === 'tsv') tableOutput(withSource(sangerBaseCallColumns), baseRows, 'table', 'sanger-base-calls');
  else if (format === 'genotypes-tsv') tableOutput(genotypeColumns, session.resolution.analysis?.rows ?? [], 'genotypes', 'sanger-genotypes');
  else if (format === 'reference-differences-tsv') tableOutput([...sangerReferenceDifferenceColumns, ...sangerResolvedDifferenceColumns], session.referenceDifferences, 'referenceDifferences', 'sanger-reference-differences');
  else if (format === 'consensus-fasta' && session.assembly.contigs.length) {
    textOutput(session.assembly.contigs.map(contig => {
      const names = contig.sourceTraces.map(id => { const index = Number(id.split(' ')[1]); return `trace_${index}=${JSON.stringify(session.sourceCollection.traces[index - 1].view.record)}`; }).join('; ');
      return formatFastaRecord(`${contig.title} sources=${contig.sourceTraces.length}; ${names}; sequences=${(contig.sequenceIds ?? contig.candidateIds).join(',')}; conditional_consensus; global_phase_unconfirmed`, contig.sequence);
    }).join(''), 'consensusFasta', 'text/x-fasta', 'fasta');
  } else if (format === 'consensus-fasta') textOutput('', 'consensusFasta', 'text/x-fasta', 'fasta');
  else if (format === 'assembly-text-map') {
    textOutput(makeSangerAssemblyTextMap(session) + '\n' + getSummary(), 'assemblyTextMap', 'text/plain', 'txt');
    sequenceSearch = { format: 'assembly', alphabet: 'dna-rna' };
    streams.assemblyTextMap.sequenceSearch = sequenceSearch;
  } else if (visualFormats.includes(format) && (session.collection.traces.length || deNovo)) {
    const renderers = {
      'candidate-alignment-svg': [candidateAlignment, 'candidateAlignmentSvg'],
      'assembly-trace-map-svg': [makeSangerAssemblyTraceMapSvg, 'assemblyTraceMapSvg'],
      'reference-trace-map-svg': [makeSangerReferenceTraceMapSvg, 'referenceTraceMapSvg'],
      'reference-alignment-svg': [makeSangerReferenceAlignmentSvg, 'referenceAlignmentSvg'],
      'difference-review-svg': [s => makeSangerDifferenceReviewSvg(evidenceSession(s)), 'differenceReviewSvg'],
    };
    const [render, key] = renderers[format];
    let svg;
    let sangerPlot;
    if (['assembly-trace-map-svg', 'reference-trace-map-svg'].includes(format)) {
      sangerPlot = makeSangerPlotModel(format === 'assembly-trace-map-svg' ? 'assembly' : 'reference', session, options);
      svg = renderSangerPlot(sangerPlot);
    } else svg = render(session, options);
    textOutput(svg, key, 'image/svg+xml', 'svg'); visual = { svg, sangerPlot };
  } else if (format === 'svg-trace') {
    const svg = makeSangerCollectionTraceSvg(session.sourceCollection);
    textOutput(svg, 'traceSvg', 'image/svg+xml', 'svg'); visual = { svg };
  } else if (format === 'interactive-trace') visual = { sangerTrace: makeSangerTraceCollectionViewData(session.sourceCollection) };
  if (output === undefined) output = getSummary();
  if (format === 'session-report') streams.sessionReport = makeTextStream(output);
  if (mimeType === 'text/plain' && format !== 'assembly-text-map') sequenceSearch = false;
  if (mimeType === 'text/x-fasta') sequenceSearch = { format:'fasta', alphabet:'dna-rna' };
  context.throwIfCancelled?.();
  return makeToolResult({ output, download: { filename, mimeType }, streams, visual, sequenceSearch,
    warnings: session.warnings, recordsProcessed: session.sourceCollection.traces.length,
    basesProcessed: session.sourceCollection.traces.reduce((n, r) => n + r.trace.baseCalls.length, 0), processedUnitLabel: 'base call' });
}
