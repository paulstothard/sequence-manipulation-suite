import { sangerTrimmingGroup } from '../sanger-trimming-options.js';
import { sangerResolvedDifferenceColumns } from '../../core/sanger-resolved-session.js';
import { sangerReferenceOptions, SANGER_REFERENCE_LIMIT } from '../../core/sanger-reference.js';
import {
  SANGER_SESSION_SEPARATOR,
  sangerBaseCallColumns,
  sangerReferenceDifferenceColumns
} from "../../core/sanger-trace.js";

const SANGER_TRACE_CATEGORY = "Sanger Traces";

function makeSangerSplitInput({ includeReference = true } = {}) {
  const panels = [
    {
      id: "trace-set",
      label: "Trace",
      dropLabel: "Drop AB1, SCF, base-call sequence, or FASTA record here",
      accept: ".ab1,.abi,.abif,.scf,.json,.txt,.fa,.fasta",
    }
  ];
  if (includeReference) {
    panels.push({
      id: "reference",
      label: "Reference DNA",
      dropLabel: "Drop one reference DNA sequence or FASTA record here",
      accept: ".fa,.fasta,.fna,.txt"
    });
  }
  return {
    separator: SANGER_SESSION_SEPARATOR,
    customRenderer: "sanger-trace-workspace",
    panels
  };
}

const commonSplitInput = makeSangerSplitInput();
const assemblySplitInput = makeSangerSplitInput({ includeReference: false });

const commonWorkflowInputs = [{ id: "input", kind: "text", mediaType: "text/plain" }];

const alleleOptions = {type:'group', id:'resolver', label:'Resolver', options:[
  {id:'resolveSequences',type:'checkbox',label:'Use resolved sequences',defaultValue:false,
    help:'Reconstruct candidate haplotypes from each trace before reference comparison. Requires reference DNA and A/C/G/T signal channels.'},
  {id:'ploidy',visibleWhen:{option:'resolveSequences',value:true},type:'select',label:'Ploidy',defaultValue:'2',choices:[1,2,3,4].map(value=>({value:String(value),label:String(value)})),
    help:'Supplied template-copy count. Mixed traces support two distinct candidates at ploidy 2. Clean traces yield one distinguishable sequence at any ploidy; mixed traces at ploidy 3 or 4 remain unresolved.'},
  {id:'secondaryPeakPercent',visibleWhen:{option:'resolveSequences',value:true},type:'number',label:'Secondary peak threshold (%)',defaultValue:20,min:5,max:45,step:1,
    help:'Minimum secondary signal relative to the strongest peak. Lower values include weaker alleles and more background signal.'},
  {id:'unresolvedTraceAction',visibleWhen:{option:'resolveSequences',value:true},type:'select',label:'Unresolved traces',defaultValue:'exclude',choices:[{value:'exclude',label:'Exclude and report'},{value:'error',label:'Stop the run'}],
    help:'Applies when Use resolved sequences is enabled. Excluded traces remain in the source evidence and sequence summary, with a reason.'},
]};
const resolverNote = {type:'note',visibleWhen:{option:'resolveSequences',value:true},text:'Resolving uses the reference to reconstruct up to two related sequences per trace. Candidate numbers apply within each trace; uncertain phase is retained as IUPAC bases. Source chromatograms remain available alongside candidate maps. Automatic trimming preserves usable mixed peaks.'};
const workflowOutputs = {
  analysisJson: {id:'analysisJson',kind:'text',mediaType:'application/json',label:'Analysis JSON'},
  primary: { id: "primary", kind: "text", mediaType: "text/plain" },
  report: { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
  table: { id: "table", kind: "table", schema: "sanger-base-calls", columns: sangerBaseCallColumns, optionalColumns: [{id:'source_trace',label:'Source trace',type:'string'}], label: "Base-call table" },
  traceSvg: { id: "traceSvg", kind: "text", mediaType: "image/svg+xml", label: "Chromatogram plot" },
  fasta: { id: "fasta", kind: "text", mediaType: "text/x-fasta", alphabet: "dna-rna", label: "Clipped FASTA" },
  fastq: { id: "fastq", kind: "text", mediaType: "text/x-fastq", alphabet: "dna-rna", label: "Clipped FASTQ" },
  sessionReport: { id: "sessionReport", kind: "text", mediaType: "text/plain", label: "Summary report" },
  consensusFasta: { id: "consensusFasta", kind: "text", mediaType: "text/x-fasta", alphabet: "dna-rna", label: "Consensus FASTA" },
  assemblyTextMap: { id: "assemblyTextMap", kind: "text", mediaType: "text/plain", label: "Assembly text map" },
  assemblyTraceMapSvg: { id: "assemblyTraceMapSvg", kind: "text", mediaType: "image/svg+xml", label: "Assembly trace map" },
  referenceTraceMapSvg: { id: "referenceTraceMapSvg", kind: "text", mediaType: "image/svg+xml", label: "Reference trace map" },
  referenceDifferences: { id: "referenceDifferences", kind: "table", schema: "sanger-reference-differences", columns: sangerReferenceDifferenceColumns, optionalColumns: sangerResolvedDifferenceColumns, label: "Reference differences table" },
  referenceAlignmentSvg: { id: "referenceAlignmentSvg", kind: "text", mediaType: "image/svg+xml", label: "Trace/reference alignment map" },
  differenceReviewSvg: { id: "differenceReviewSvg", kind: "text", mediaType: "image/svg+xml", label: "Difference review map" },
  warnings: { id: "warnings", kind: "warnings" }
};

const workflowFormats = {report:'report',fasta:'fasta',fastq:'fastq',analysisJson:'analysis-json',table:'tsv',sessionReport:'session-report',
  consensusFasta:'consensus-fasta',assemblyTextMap:'assembly-text-map',assemblyTraceMapSvg:'assembly-trace-map-svg',
  referenceTraceMapSvg:'reference-trace-map-svg',referenceDifferences:'reference-differences-tsv',referenceAlignmentSvg:'reference-alignment-svg',differenceReviewSvg:'difference-review-svg'};
for (const [id,outputFormat] of Object.entries(workflowFormats)) workflowOutputs[id].outputFormat=outputFormat;

function commonToolFields({ id, name, summary, whenToUse, inputType, outputType, task, workerExport, workflowOutputIds, splitInput = commonSplitInput }) {
  return {
    id,
    name,
    category: SANGER_TRACE_CATEGORY,
    tags: task === "assemble"
      ? ["DNA", "FASTA", "assembly", "map"]
      : task === "compare"
        ? ["DNA", "FASTA", "alignment", "coordinates", "map"]
        : ["DNA", "FASTA", "coordinates", "map"],
    summary,
    whenToUse,
    inputType,
    outputType,
    sangerTraceTask: task,
    splitInput,
    runInWorker: true,
    workerModule: "../tools/sanger-trace-viewer/run.js",
    workerExport,
    workflow: {
      inputs: commonWorkflowInputs,
      outputs: workflowOutputIds.map(outputId => workflowOutputs[outputId])
    }
  };
}

function assemblyGroup() {
  return {
    type: "group",
    id: "assembly",
    label: "Assembly",
    options: [
      {
        id: "assemblyMinOverlap",
        type: "number",
        label: "Minimum read overlap",
        defaultValue: 20,
        min: 6,
        step: 1,
        help: "Minimum overlap used when assembling multiple clipped trace reads into a small consensus."
      },
      {
        id: "assemblyMaxMismatchPercent",
        type: "number",
        label: "Maximum overlap mismatch %",
        defaultValue: 8,
        min: 0,
        max: 40,
        step: 1,
        help: "Maximum mismatch percentage allowed in read overlaps."
      },
      {
        id: "assemblyUseAmbiguousIupacConsensus",
        type: "checkbox",
        label: "Use ambiguous IUPAC consensus bases",
        defaultValue: false,
        help: "Checked: combine A/C/G/T bases supported by placed reads into IUPAC codes, such as R for A/G. Unchecked: conflicting bases in joined overlaps become N; reads contained within a contig leave its existing consensus unchanged. Applies to consensus sequences and maps."
      }
    ]
  };
}

function outputFormatGroup(defaultValue, choices) {
  return {
    type: "group",
    label: "Output format",
    options: [
      {
        id: "outputFormat",
        type: choices.length > 3 ? "select" : "radio",
        label: "Output format",
        defaultValue,
        choices
      }
    ]
  };
}

function limitsGroup(resolver = false, assembly = false) {
  return {
    type: "group",
    id: "limits",
    label: "Limits",
    collapsible: true,
    collapsed: true,
    options: [
      ...(resolver ? [
        {id:'maxResolvingTraces',type:'limit-value',label:'Traces with resolving',value:20,help:'Fixed reconstruction scope. Larger input is rejected.'},
        {id:'maxReadPositions',type:'limit-value',label:'Retained base calls for resolving',value:'40–1,200 per trace',help:'Traces outside this reconstruction scope are reported as unresolved.'},
        {id:'maxSignalSamples',type:'limit-value',label:'Signal measurements per channel',value:200000,help:'For resolving: intensity measurements along each A/C/G/T curve. Larger channels are rejected while enforced.'},
        {id:'maxInputCharacters',type:'limit-value',label:'Input characters for resolving',value:33554432,help:'Larger resolving input is rejected while enforced.'},
        {id:'maxCandidateAlignmentCells',type:'limit-value',label:'Resolved figure alignment cells',value:20000,help:'Fixed density limit across candidate panels. Use tables or Analysis JSON for larger results.'}
      ] : []),
      ...(assembly ? [{id:'maxAssemblyReads',type:'limit-value',label:'Reads in an assembly',value:20,help:'Fixed assembly capacity.'}] : [{ id:'maxReferenceBases', type:'limit-value', label:'Reference bases', value:SANGER_REFERENCE_LIMIT, help:'Fixed tested reference-search capacity. Reference placement uses bounded local alignment windows.' }]),
      {
        id: "maxSessionTraces",
        type: "number",
        label: "Maximum traces to process",
        defaultValue: 20,
        min: 1,
        max: assembly ? 20 : 100,
        step: 1,
        help: "Maximum number of input traces to process."
      }
    ]
  };
}

export const sangerTraceReviewEditorMetadata = {
  ...commonToolFields({
    id: "sanger-trace-viewer",
    name: "Sanger Trace Review / Editor",
    summary: "Review AB1/ABIF, SCF, or base-call sequence traces, edit base calls, trim reads, and export cleaned trace-derived sequences.",
    whenToUse: "Use this when you need to inspect chromatogram peaks, adjust base calls or trim ranges, and export a reviewed Sanger read.",
    inputType: "Sanger chromatogram trace or base-call sequence",
    outputType: "Trace editor, base-call table, or clipped FASTA/FASTQ",
    task: "edit",
    workerExport: "runSangerTraceReviewEditor",
    splitInput: assemblySplitInput,
    workflowOutputIds: ["primary", "report", "table", "fasta", "fastq", "warnings"]
  }),
  showcaseOutputs: [
    {
      id: "interactive-trace-editor",
      label: "Trace editor",
      options: { outputFormat: "interactive-trace" }
    }
  ],
  options: [
    sangerTrimmingGroup({ defaultMode: 'none', includeReverseComplement: true }),
    outputFormatGroup("interactive-trace", [
      { value: "interactive-trace", label: "Trace editor" },
      { value: "tsv", label: "Base-call table" },
      { value: "fasta", label: "Clipped FASTA" },
      { value: "fastq", label: "Clipped FASTQ" },
    ]),
    { ...limitsGroup(), options: limitsGroup().options.filter(option => option.id === "maxSessionTraces") }
  ]
};

export const sangerTraceAssemblyMetadata = {
  ...commonToolFields({
    id: "sanger-trace-assembly",
    name: "Sanger Trace Assembly",
    summary: "Assemble trimmed Sanger reads into consensus sequences with automatic read orientation.",
    whenToUse: "Use this when forward, reverse, or tiled Sanger traces need to be combined into a small consensus sequence.",
    inputType: "Sanger chromatogram traces or base-call sequences",
    outputType: "Assembly trace map, assembly text map, consensus FASTA, analysis JSON, or summary report",
    task: "assemble",
    workerExport: "runSangerTraceAssembly",
    workflowOutputIds: ["primary", "sessionReport", "consensusFasta", "assemblyTextMap", "assemblyTraceMapSvg", "analysisJson", "warnings"],
    splitInput: assemblySplitInput
  }),
  options: [
    sangerTrimmingGroup(),
    assemblyGroup(),
    outputFormatGroup("assembly-trace-map-svg", [
      { value: "assembly-trace-map-svg", label: "Assembly trace map" },
      { value: "assembly-text-map", label: "Assembly text map" },
      { value: "consensus-fasta", label: "Consensus FASTA" },
      { value: "session-report", label: "Summary report" },
      { value: "analysis-json", label: "Analysis JSON" }
    ]),
    limitsGroup(false, true)
  ]
};

export const sangerTraceReferenceComparisonMetadata = {
  ...commonToolFields({
    id: "sanger-trace-reference-comparison",
    name: "Sanger Trace Reference Comparison",
    summary: "Align Sanger traces or resolved candidate haplotypes to reference DNA and review differences with trace evidence.",
    whenToUse: "Use this when trace reads need to be placed on an expected reference and checked for mismatches, indels, strand, or mixed peak evidence.",
    inputType: "Sanger chromatogram trace set and reference DNA",
    outputType: "Reference trace map, difference review map, trace/reference alignment map, reference differences table, analysis JSON, or summary report",
    task: "compare",
    workerExport: "runSangerTraceReferenceComparison",
    workflowOutputIds: [
      "primary",
      "sessionReport",
      "referenceTraceMapSvg",
      "referenceDifferences",
      "referenceAlignmentSvg",
      "differenceReviewSvg",
      "analysisJson",
      "warnings"
    ]
  }),
  options: [
    sangerReferenceOptions,
    sangerTrimmingGroup({ signalAware: true }),
    alleleOptions,
    outputFormatGroup("reference-trace-map-svg", [
      { value: "reference-trace-map-svg", label: "Reference trace map" },
      { value: "difference-review-svg", label: "Difference review map" },
      { value: "reference-alignment-svg", label: "Trace/reference alignment map" },
      { value: "reference-differences-tsv", label: "Reference differences table" },
      { value: "session-report", label: "Summary report" },
      { value: "analysis-json", label: "Analysis JSON" }
    ]),
    limitsGroup(true),
    resolverNote
  ]
};

export const sangerTraceViewerMetadata = sangerTraceReviewEditorMetadata;
