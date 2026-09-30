import { makeSangerPlotModel, renderSangerPlot } from '../../core/sanger-plot.js';
import { prepareSangerSimulation, simulateSangerTrace, encodeSimulatedScf, simulatedSangerColumns } from '../../core/simulate-sanger-trace.js';
import { resolveRandom } from '../../core/random-sequence.js';
import { encodeSimulatedAb1 } from '../../core/sanger-abif-export.js';
import { prepareSangerTrace, makeSangerTraceViewData } from '../../core/sanger-trace.js';
import { formatFastaRecord } from '../../core/fasta.js';
import { makeToolResult, makeTextStream, makeTableStream } from '../../core/workflow.js';

export async function runSimulateSangerTrace(input, options = {}, context = {}) {
  const format = options.outputFormat ?? 'interactive-trace';
  if (!['interactive-trace', 'svg-trace', 'trace-json', 'ab1', 'scf', 'tsv', 'fasta', 'fastq', 'template-fasta', 'report'].includes(format)) throw new Error('Choose a supported output format.');
  context.throwIfCancelled?.();
  const runOptions = { ...options, outputFormat: format };
  const simulation = ['report', 'template-fasta'].includes(format)
    ? { ...prepareSangerSimulation(input, runOptions), seed: resolveRandom(options).seed }
    : await simulateSangerTrace(input, runOptions, context);
  const { trace, templates, settings, seed, rows, readLength } = simulation;
  context.reportProgress?.({ phase: 'Building output', progress: 0.85 });
  await context.yieldIfNeeded?.(); context.throwIfCancelled?.();
  const report = [
    'Simulated Sanger trace',
    `Seed: ${seed}`,
    `Signal model: ${settings.signalModel === 'measured' ? 'Measured profile (public-ab1-profile-v1)' : 'Uniform peaks (v1)'}`,
    `Background noise: ${settings.noise * 100}%; peak-height variation: ${settings.peakVariation * 100}%`,
    `Direction: ${settings.direction === 'forward' ? '5′ end, as supplied' : '3′ end, reverse complement'}`,
    `Templates: ${templates.length}; read positions: ${readLength}`,
    `Added flanks: ${settings.prefixBases} leading, ${settings.suffixBases} trailing bases`,
    '',
    ...templates.map(t => `${t.id}: ${t.title} — ${t.sequence.length} bases; ${(t.fraction * 100).toFixed(3)}% of starting signal`),
    '',
    'Templates start together. Short templates stop contributing at their own end; indels are not aligned away.',
    'Synthetic signal and confidence scores; not measured data or calibrated Phred qualities.',
    'Measured profile approximates processed signal ranges in a small public AB1 panel; instrument chemistry and calibrated error probabilities are outside its scope.',
    'Trace JSON includes supplied and read-oriented template sequences, mixture proportions, settings, and seed.',
    '',
    'Signal profile sources: https://github.com/biopython/biopython/tree/biopython-186/Tests/Abi and https://bioconductor.org/packages/sangerseqR/',
    'Mixed-trace background: https://assets.thermofisher.com/TFS-Assets/LSG/manuals/MAN0014435_Trbleshoot_Sanger_seq_data_UB.pdf',
    'SCF format: https://staden.sourceforge.net/manual/formats_unix_2.html',
    'ABIF format: https://archive.gfjc.fiu.edu/workshops/resources/articles/ABIF_File_Format.pdf'
  ].join('\n');
  let output = report, filename = 'simulated-sanger-report.txt', mimeType = 'text/plain', visual;
  const streams = {}, downloads = [];
  if (format === 'interactive-trace' || format === 'svg-trace') {
    const prepared = prepareSangerTrace(JSON.stringify(trace), {});
    if (format === 'interactive-trace') {
      visual = { sangerTrace: makeSangerTraceViewData(prepared) };
      streams.report = makeTextStream(report);
    } else {
      const sangerPlot = makeSangerPlotModel("trace", {collection:{traces:[prepared]}}, prepared.options);
      output = renderSangerPlot(sangerPlot);
      filename = 'simulated-sanger.svg'; mimeType = 'image/svg+xml';
      visual = { svg: output, sangerPlot }; streams.traceSvg = makeTextStream(output, mimeType);
    }
  } else if (format === 'trace-json') {
    output = JSON.stringify(trace, null, 2); filename = 'simulated-sanger.json'; mimeType = 'application/json';
    streams.traceJson = makeTextStream(output, mimeType);
  } else if (format === 'scf' || format === 'ab1') {
    downloads.push({ label: `Download ${format.toUpperCase()}`, filename: `simulated-sanger.${format}`, mimeType: 'application/octet-stream', bytes: format === 'ab1' ? encodeSimulatedAb1(trace) : encodeSimulatedScf(trace) });
    streams.report = makeTextStream(report);
  } else if (format === 'tsv') {
    output = [simulatedSangerColumns.map(c => c.id).join('\t'), ...rows.map(row => simulatedSangerColumns.map(c => row[c.id]).join('\t'))].join('\n');
    filename = 'simulated-sanger-base-calls.tsv'; mimeType = 'text/tab-separated-values';
    streams.table = makeTableStream(simulatedSangerColumns, rows, 'simulated-sanger-base-calls');
  } else if (format === 'fasta') {
    output = formatFastaRecord(`simulated_sanger_trace seed=${seed}`, trace.bases);
    filename = 'simulated-sanger-base-calls.fasta'; mimeType = 'text/x-fasta'; streams.fasta = makeTextStream(output, mimeType);
  } else if (format === 'fastq') {
    output = `@simulated_sanger_trace synthetic_quality seed=${seed}\n${trace.bases}\n+\n${trace.qualities.map(q => String.fromCharCode(q + 33)).join('')}\n`;
    filename = 'simulated-sanger-base-calls.fastq'; mimeType = 'text/x-fastq'; streams.fastq = makeTextStream(output, mimeType);
  } else if (format === 'template-fasta') {
    output = templates.map(t => formatFastaRecord(`${t.id} ${t.title} direction=${settings.direction} fraction=${t.fraction}`, t.sequence)).join('');
    filename = 'simulated-sanger-templates.fasta'; mimeType = 'text/x-fasta';
    streams.templates = { kind: 'sequence-records', alphabet: 'dna-rna', records: templates.map(t => ({ title: `${t.id} ${t.title}`, sequence: t.sequence })) };
  } else streams.report = makeTextStream(report);
  context.throwIfCancelled?.(); context.reportProgress?.({ phase: 'Finished', progress: 1 });
  return makeToolResult({ output, download: { filename, mimeType }, downloads, visual, streams,
    warnings: simulation.warnings, charactersRemoved: simulation.charactersRemoved,
    recordsProcessed: templates.length, basesProcessed: templates.reduce((sum, t) => sum + t.sequence.length, 0),
    optionsUsed: { ...options, seed },
    sequenceSearch: mimeType === 'text/x-fasta' ? { format: 'fasta', alphabet: 'dna-rna' } : undefined
  });
}
