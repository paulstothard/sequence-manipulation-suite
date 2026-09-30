import { sangerReferenceOptions } from '../../core/sanger-reference.js';
import { SANGER_SESSION_SEPARATOR } from '../../core/sanger-trace.js';
import { sangerResolverColumns, SANGER_RESOLVER_LIMITS } from '../../core/resolve-mixed-sanger-trace.js';

export const resolveMixedSangerTraceMetadata = {
  id:'resolve-mixed-sanger-trace', name:'Resolve Mixed Sanger Trace', category:'Sanger Traces',
  tags:['DNA', 'FASTA', 'alignment', 'coordinates', 'map'],
  summary:'Reconstruct candidate haplotypes from a mixed Sanger trace and report their SNP and indel differences.',
  whenToUse:'Inspect a suspected two-template mixture, compare candidate haplotypes with a reference, and review sequence differences and unresolved phase.',
  inputType:'Sanger chromatogram trace and reference DNA',
  outputType:'candidate alignment, candidate FASTA, aligned FASTA, variant table, summary report, or analysis JSON',
  splitInput:{ separator:SANGER_SESSION_SEPARATOR, panels:[
    { id:'trace', label:'Trace', dropLabel:'Drop one AB1, SCF or Trace JSON file here', accept:'.ab1,.abi,.abif,.scf,.json,.txt' },
    { id:'reference', label:'Reference DNA', dropLabel:'Drop one reference DNA sequence or FASTA record here', accept:'.fa,.fasta,.fna,.txt' }
  ] },
  runInWorker:true, workerModule:'../tools/resolve-mixed-sanger-trace/run.js', workerExport:'runResolveMixedSangerTrace',
  workflow:{
    inputs:[{ id:'input', kind:'text', mediaType:'text/plain' }],
    outputs:[
      { id:'primary', kind:'text', mediaType:'text/plain' },
      { id:'report', kind:'text', mediaType:'text/plain', outputFormat:'report', label:'Summary report' },
      { id:'alignmentSvg', kind:'text', mediaType:'image/svg+xml', outputFormat:'alignment-svg', label:'Candidate alignment' },
      { id:'fasta', kind:'text', mediaType:'text/x-fasta', alphabet:'dna-rna', outputFormat:'fasta', label:'Candidate FASTA' },
      { id:'alignedFasta', kind:'text', mediaType:'text/x-fasta', alphabet:'dna-rna', outputFormat:'aligned-fasta', label:'Aligned FASTA' },
      { id:'table', kind:'table', schema:'sanger-resolver-differences', columns:sangerResolverColumns, outputFormat:'tsv', label:'Variant table' },
      { id:'analysisJson', kind:'text', mediaType:'application/json', outputFormat:'json', label:'Analysis JSON' },
      { id:'warnings', kind:'warnings' }
    ]
  },
  options:[
    sangerReferenceOptions,
    { type:'group', label:'Reconstruction', options:[
      { id:'assumedTemplateCount', type:'select', label:'Assumed template count', defaultValue:'auto', choices:[
        { value:'auto', label:'Automatic' }, { value:'2', label:'2' }, { value:'3', label:'3' }, { value:'4', label:'4' }
      ], help:'Automatic reconstructs up to two distinct sequences. Choose a count to specify how many templates you expect. For a clean trace, that count produces identical sequence copies. Mixed traces with three or four assumed templates remain unresolved.' },
      { id:'secondaryPeakPercent', type:'number', label:'Secondary peak threshold (%)', defaultValue:20, min:5, max:50, step:1,
        help:'Sets the minimum secondary peak height as a percentage of the strongest channel near each base call. Lower values include weaker peaks and more noise.' }
    ] },
    { type:'group', label:'Output format', options:[
      { id:'outputFormat', type:'select', label:'Output format', defaultValue:'alignment-svg', choices:[
        { value:'alignment-svg', label:'Candidate alignment' }, { value:'fasta', label:'Candidate FASTA' },
        { value:'aligned-fasta', label:'Aligned FASTA' }, { value:'tsv', label:'Variant table' },
        { value:'report', label:'Summary report' }, { value:'json', label:'Analysis JSON' }
      ] }
    ] },
    { type:'group', id:'limits', label:'Limits', collapsible:true, collapsed:true, options:[
      { id:'maxReadPositions', type:'limit-value', label:'Trace base calls', value:SANGER_RESOLVER_LIMITS.readPositions, help:'Fixed maximum for reconstruction; longer traces are rejected. At least 40 base calls are required.' },
      { id:'maxReferenceBases', type:'limit-value', label:'Reference bases', value:SANGER_RESOLVER_LIMITS.referenceBases, help:'Fixed tested reference-search capacity. Local alignment windows have a separate work budget. At least 40 reference bases are required.' },
      { id:'maxSignalSamples', type:'limit-value', label:'Signal measurements per channel', value:SANGER_RESOLVER_LIMITS.signalSamples, help:'Each A/C/G/T curve contains many intensity measurements between base calls. Rejects traces above this count in any channel.' },
      { id:'maxInputCharacters', type:'limit-value', label:'Input size', value:SANGER_RESOLVER_LIMITS.inputCharacters, help:'Total characters in the trace and reference input, including JSON or encoded binary data. Direct binary input counts bytes. Larger inputs are rejected.' }
    ] },
    { id:'methodNote', type:'note', text:'Attempts to reconstruct up to two distinct haplotypes and reports their SNP and indel differences. Use a reference close to at least one template. Multiple indels in the other template are supported; changes requiring gaps in both templates remain unresolved. IUPAC codes retain unphased bases, and phase between separate shifted regions remains uncertain. Experimental haplotype accuracy still needs validation.' },
    { id:'references', type:'note', text:'References:\n\nExternal comparison with Tracy: Rausch et al. 2020.\n\nRelated methods, Indelligent: Dmitriev and Rakitov 2008.\n\nRelated methods, Poly Peak Parser: Hill et al. 2014.' }
  ]
};
