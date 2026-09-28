import { runSangerGenotyper } from '../sanger-genotyper/run.js';
import { parseSangerResolverInput } from '../../core/resolve-mixed-sanger-trace.js';
import { resolveMixedSangerTrace, sangerResolverColumns, sangerCandidateColumnRelations } from '../../core/resolve-mixed-sanger-trace.js';
import { makeAlignmentSvg } from '../../core/alignment-svg.js';
import { prepareSangerTrace, makeSangerTraceSvg } from '../../core/sanger-trace.js';
import { formatFastaRecord } from '../../core/fasta.js';
import { makeToolResult, makeTextStream, makeTableStream } from '../../core/workflow.js';

const FORMATS = new Set(['alignment-svg','fasta','aligned-fasta','tsv','svg-trace','report','json']);
export async function runResolveMixedSangerTrace(input, options = {}, context = {}) {
  if (options.outputFormat === 'genotypes-tsv') {
    const parsed = parseSangerResolverInput(input, options);
    const result = await runSangerGenotyper({traces:[parsed.traceInput],reference:parsed.referenceInput}, {...options,outputFormat:'tsv',ploidy:options.assumedTemplateCount === 'auto' ? 2 : options.assumedTemplateCount ?? 2,autoTrim:false}, context);
    result.streams.genotypes = result.streams.table;
    delete result.streams.table;
    return result;
  }
  const format = options.outputFormat ?? 'alignment-svg';
  if (!FORMATS.has(format)) throw new Error('Choose a supported output format.');
  const result = await resolveMixedSangerTrace(input, options, context);
  const status = { unresolved:'Unresolved', 'single-sequence':'One distinguishable sequence', 'partially-resolved':'Partially resolved; unphased bases retained', 'candidate-haplotypes':'Reference-guided candidate haplotypes' }[result.status];
  const report = [
    'Mixed Sanger trace reconstruction', `Status: ${status}`, `Method: ${result.method}`,
    `Reference: ${result.reference.name}`, `Read orientation: ${result.orientation ?? 'undetermined'}`,
    `Assumed templates: ${result.assumedTemplateCount ?? 'automatic; up to two distinct sequences'}`,
    `Analyzed read positions: ${result.diagnostics.analyzedReadPositions} of ${result.diagnostics.inputReadPositions}`,
    `Mixed positions: ${result.diagnostics.mixedPositions}; positions with more than two strong channels: ${result.diagnostics.moreThanTwoPeaks}`,
    '', ...result.components.map(component => `${component.name}: ${component.sequence.length} bases; reference ${component.referenceStart}–${component.referenceEnd}; ${component.phase}`),
    '', 'Original chromatogram signals are preserved. Gaps occur only in inferred alignments. IUPAC bases retain unresolved phase.',
    'Reference coordinates are 1-based on the supplied strand. Read and signal positions refer to the original trace, including for reverse reads.',
    '', ...result.warnings.map(warning => `Note: ${warning}`)
  ].join('\n');
  let output = report, filename = 'sanger-resolution-report.txt', mimeType = 'text/plain', visual;
  const streams = {};
  context.throwIfCancelled?.(); await context.yieldIfNeeded?.();
  if (format === 'json') {
    // Compact encoding keeps the preserved four-channel signal arrays bounded.
    output = JSON.stringify(result); filename = 'sanger-resolution.json'; mimeType = 'application/json';
    streams.analysisJson = makeTextStream(output, mimeType);
  } else if (format === 'tsv') {
    output = [sangerResolverColumns.map(column => column.id).join('\t'), ...result.differences.map(row => sangerResolverColumns.map(column => row[column.id] ?? '').join('\t'))].join('\n');
    filename = 'sanger-resolution-variants.tsv'; mimeType = 'text/tab-separated-values';
    streams.table = makeTableStream(sangerResolverColumns, result.differences, 'sanger-resolver-differences');
  } else if (format === 'svg-trace') {
    output = makeSangerTraceSvg(prepareSangerTrace(JSON.stringify(result.originalTrace), {}));
    filename = 'sanger-original-chromatogram.svg'; mimeType = 'image/svg+xml';
    visual = { svg:output }; streams.traceSvg = makeTextStream(output, mimeType);
  } else if (result.components.length && format === 'alignment-svg') {
    const columnRelations = sangerCandidateColumnRelations(result.alignmentRows);
    output = makeAlignmentSvg({ title:'Candidate haplotype alignment', rows:result.alignmentRows, showConsensusLine:false,
      columnRelations,
      note:status, summary:'Reference-guided candidates; global phase unconfirmed for mixtures. IUPAC codes mark unphased bases. Terminal gaps may represent unsequenced coverage.',
      legend:'Teal: exact agreement; blue: ambiguous base; peach: substitution; gray: gap. Reference coordinates follow the supplied strand. Candidate coordinates count inferred bases; original read and signal positions are in Variant table and Analysis JSON.',
      ariaLabel:'Candidate haplotype alignment' });
    filename = 'sanger-candidate-alignment.svg'; mimeType = 'image/svg+xml';
    visual = { svg:output }; streams.alignmentSvg = makeTextStream(output, mimeType);
  } else if (result.components.length && format === 'fasta') {
    output = result.components.map(component => formatFastaRecord(`${component.id} ${component.phase}; reference=${component.referenceStart}-${component.referenceEnd}`, component.sequence)).join('');
    filename = 'sanger-candidates.fasta'; mimeType = 'text/x-fasta'; streams.fasta = makeTextStream(output, mimeType);
  } else if (result.components.length && format === 'aligned-fasta') {
    output = result.alignmentRows.map((row, index) => {
      const component = result.components[index - 1];
      const header = component ? `${component.id} ${component.phase}` : 'reference supplied DNA';
      return formatFastaRecord(`${header}; start=${row.start}; status=${result.status}`, row.aligned);
    }).join('');
    filename = 'sanger-candidates-aligned.fasta'; mimeType = 'text/x-fasta'; streams.alignedFasta = makeTextStream(output, mimeType);
  }
  if (format === 'report' || mimeType === 'text/plain') streams.report = makeTextStream(report);
  context.throwIfCancelled?.(); context.reportProgress?.({ phase:'Finished', progress:1 });
  return makeToolResult({ output, download:{ filename,mimeType }, streams, visual, warnings:result.warnings,
    recordsProcessed:1, basesProcessed:result.originalTrace.bases.length, charactersRemoved:0,
    sequenceSearch:mimeType === 'text/x-fasta' ? { format:'fasta',alphabet:'dna-rna' } : mimeType === 'text/plain' ? false : undefined });
}
