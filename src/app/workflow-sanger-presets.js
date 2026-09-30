import { SANGER_SESSION_SEPARATOR } from '../core/sanger-trace.js';

const input = () => ({ id: 'input', type: 'input', text: '' });
const simulation = { outputFormat: 'trace-json', seed: 'sanger-workflow-2026', signalModel: 'measured', direction: 'forward', prefixBases: 0, suffixBases: 0, noise: 1, peakVariation: 25 };
const comparison = (id, name, summary) => ({
  id, name, summary, exampleId: id,
  workflow: { steps: [
    input(),
    { id: 'templates', type: 'text-section', label: 'Read template sequences', input: { from: 'input' }, separator: '##SMS3_REFERENCE##', section: 0 },
    { id: 'reference', type: 'text-section', label: 'Read reference sequence', input: { from: 'input' }, separator: '##SMS3_REFERENCE##', section: 1 },
    { id: 'trace', type: 'tool', toolId: 'simulate-sanger-trace', input: { from: 'templates' }, selectStream: 'traceJson', options: { ...simulation } },
    { id: 'comparison-input', type: 'text-bundle', label: 'Combine trace and reference', input: { from: 'trace' }, other: { from: 'reference' }, separator: SANGER_SESSION_SEPARATOR },
    { id: 'compare', type: 'tool', toolId: 'sanger-genotyper', selectStream: 'referenceAlignmentSvg', options: { trimMode: 'none', outputFormat: 'reference-alignment-svg' } }
  ] }
});

export const sangerWorkflowPresets = [
  {
    id: 'assemble-simulated-sanger-traces', name: 'Assemble simulated Sanger traces',
    summary: 'Simulate a separate chromatogram for each FASTA record, then assemble the traces. Supply overlapping read templates in their sequencing orientation. The example has two 600-base reads from opposite strands of a 900-base region, with a 300-base overlap. Trace signals and synthetic qualities are preserved; automatic orientation places the reverse read. Download the trace session under Step outputs.',
    exampleId: 'assemble-simulated-sanger-traces',
    workflow: { steps: [
      input(),
      { id: 'fragments', type: 'sanger-read-templates' },
      { id: 'traces', type: 'map', toolId: 'simulate-sanger-trace', selectStream: 'traceJson', options: { ...simulation } },
      { id: 'session', type: 'sanger-trace-bundle' },
      { id: 'assemble', type: 'tool', toolId: 'sanger-trace-assembly', selectStream: 'assemblyTraceMapSvg', options: { trimMode: 'none', assemblyMinOverlap: 100, assemblyMaxMismatchPercent: 5, outputFormat: 'assembly-trace-map-svg' } }
    ] }
  },
  comparison('compare-simulated-sanger-trace', 'Compare a simulated Sanger trace with a reference',
    'Simulate a chromatogram, call variants, and review its reference alignment. Supply template FASTA, a standalone ##SMS3_REFERENCE## line, then one reference FASTA record. The example has a SNP and a three-base deletion. The final alignment shows reference and original-read coordinates; choose Genotype table in the last step to inspect calls.'),
  comparison('mixed-sanger-indel-trace', 'Inspect a mixed Sanger indel trace',
    'Pool two template sequences into one simulated chromatogram and compare it with a reference. Supply template FASTA records, a standalone ##SMS3_REFERENCE## line, then one reference FASTA record. The example mixes equal amounts of alleles differing by a SNP and a three-base deletion. Genotyper reconstructs candidate haplotypes and places SNPs across the indel shift. The alignment retains original read coordinates; choose Genotype table in the last step to inspect calls.')
];
