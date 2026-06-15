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
const PER_TRACE_SETTING_COUNT = 6;

const commonWorkflowInputs = [{ id: "input", kind: "text", mediaType: "text/plain" }];

const workflowOutputs = {
  primary: { id: "primary", kind: "text", mediaType: "text/plain" },
  report: { id: "report", kind: "text", mediaType: "text/plain" },
  table: { id: "table", kind: "table", schema: "sanger-base-calls", columns: sangerBaseCallColumns },
  traceSvg: { id: "traceSvg", kind: "text", mediaType: "image/svg+xml" },
  fasta: { id: "fasta", kind: "text", mediaType: "text/x-fasta", alphabet: "dna-rna" },
  fastq: { id: "fastq", kind: "text", mediaType: "text/x-fastq", alphabet: "dna-rna" },
  traceJson: { id: "traceJson", kind: "text", mediaType: "application/json" },
  sessionReport: { id: "sessionReport", kind: "text", mediaType: "text/plain" },
  consensusFasta: { id: "consensusFasta", kind: "text", mediaType: "text/x-fasta", alphabet: "dna-rna" },
  assemblyTextMap: { id: "assemblyTextMap", kind: "text", mediaType: "text/plain" },
  assemblyTraceMapSvg: { id: "assemblyTraceMapSvg", kind: "text", mediaType: "image/svg+xml" },
  referenceTraceMapSvg: { id: "referenceTraceMapSvg", kind: "text", mediaType: "image/svg+xml" },
  referenceDifferences: { id: "referenceDifferences", kind: "table", schema: "sanger-reference-differences", columns: sangerReferenceDifferenceColumns },
  referenceAlignmentSvg: { id: "referenceAlignmentSvg", kind: "text", mediaType: "image/svg+xml" },
  differenceReviewSvg: { id: "differenceReviewSvg", kind: "text", mediaType: "image/svg+xml" },
  warnings: { id: "warnings", kind: "warnings" }
};

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
      outputs: workflowOutputIds.map((outputId) => workflowOutputs[outputId])
    }
  };
}

function reviewSettingsGroup(includeAssemblyOrientation = false) {
  return {
    type: "group",
    id: "reviewSettings",
    label: "Trace settings",
    options: [
      {
        id: "lowQualityThreshold",
        type: "number",
        label: "Low-quality highlight cutoff",
        defaultValue: 20,
        min: 0,
        max: 93,
        step: 1,
        help: "Base calls below this Phred value are counted and highlighted; automatic end trimming is controlled in the Trimming section."
      },
      ...(includeAssemblyOrientation
        ? [{
            id: "assemblyTryReverseComplement",
            type: "checkbox",
            label: "Test reverse-complement orientation",
            defaultValue: true,
            help: "Allows forward/reverse Sanger reads to assemble without manually reverse-complementing one trace first."
          }]
        : [])
    ]
  };
}

function trimmingGroup(defaultTrimMethod = "manual", { includeReverseComplement = true } = {}) {
  return {
    type: "group",
    id: "trimming",
    label: "Trimming",
    collapsible: true,
    collapsed: true,
    options: [
      {
        id: "trimMethod",
        type: "select",
        label: "Quality trim method",
        defaultValue: defaultTrimMethod,
        choices: [
          { value: "manual", label: "Manual clip range" },
          { value: "mott", label: "Modified Mott quality trim" }
        ],
        help: "Modified Mott finds the highest-scoring contiguous Phred-quality region and clips low-quality bases from both ends. Manual clip coordinates below override automatic trimming."
      },
      {
        id: "mottErrorLimit",
        type: "number",
        label: "Mott error limit",
        defaultValue: 0.05,
        min: 0.000001,
        max: 0.5,
        step: 0.001,
        help: "Error-probability limit used by modified Mott trimming; 0.05 is the Biopython-style default and roughly corresponds to Q13 as the positive/negative scoring boundary."
      },
      {
        id: "clipStart",
        type: "number",
        label: "First base to keep",
        defaultValue: 1,
        min: 1,
        step: 1,
        help: "1-based base-call coordinate. The trace viewer also provides visual trim handles."
      },
      {
        id: "clipEnd",
        type: "number",
        label: "Last base to keep",
        defaultValue: 0,
        min: 0,
        step: 1,
        help: "Use 0 to keep through the final base call. The trace viewer also provides visual trim handles."
      }
    ].concat(includeReverseComplement
      ? [{
          id: "reverseComplement",
          type: "checkbox",
          label: "Show and export reverse complement",
          defaultValue: false,
          help: "The clipped region is reverse complemented after clipping. Original base-call coordinates remain in the table."
        }]
      : [])
  };
}

function perTraceSettingsGroup() {
  const options = [{
    id: "perTraceSettingsNote",
    type: "note",
    text: "Use these only when one trace needs its own inclusion, orientation, or clip-range override. Leave clip coordinates at 0 to use the shared trimming settings."
  }];
  for (let traceIndex = 1; traceIndex <= PER_TRACE_SETTING_COUNT; traceIndex += 1) {
    options.push(
      {
        id: `trace${traceIndex}Included`,
        type: "checkbox",
        label: `Use trace ${traceIndex}`,
        defaultValue: true
      },
      {
        id: `trace${traceIndex}Orientation`,
        type: "select",
        label: `Trace ${traceIndex} orientation`,
        defaultValue: "auto",
        choices: [
          { value: "auto", label: "Auto" },
          { value: "forward", label: "Forward" },
          { value: "reverse-complement", label: "Reverse complement" }
        ]
      },
      {
        id: `trace${traceIndex}ClipStart`,
        type: "number",
        label: `Trace ${traceIndex} first base`,
        defaultValue: 0,
        min: 0,
        step: 1,
        help: "Optional 1-based first base to keep for this trace. Use 0 for automatic/global trimming."
      },
      {
        id: `trace${traceIndex}ClipEnd`,
        type: "number",
        label: `Trace ${traceIndex} last base`,
        defaultValue: 0,
        min: 0,
        step: 1,
        help: "Optional 1-based last base to keep for this trace. Use 0 for automatic/global trimming."
      }
    );
  }
  return {
    type: "group",
    id: "perTraceSettings",
    label: "Per-trace settings",
    collapsible: true,
    collapsed: true,
    options
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
        help: "Maximum mismatch percentage allowed in read overlaps for the small-fragment consensus."
      },
      {
        id: "assemblyUseAmbiguousIupacConsensus",
        type: "checkbox",
        label: "Use ambiguous IUPAC consensus bases",
        defaultValue: false,
        help: "When placed reads support more than one A/C/G/T base at a consensus position, write the matching IUPAC ambiguity code into consensus FASTA, text maps, and assembly trace maps."
      }
    ]
  };
}

function numericEditGroup() {
  return {
    type: "group",
    id: "numericEdit",
    label: "Advanced numeric edit",
    collapsible: true,
    collapsed: true,
    options: [
      {
        id: "editPosition",
        type: "number",
        label: "Jump/edit base number",
        defaultValue: 0,
        min: 0,
        step: 1,
        help: "Optional 1-based input base-call coordinate for numeric editing. Normal editing should happen in the trace viewer."
      },
      {
        id: "editBase",
        type: "select",
        label: "Replacement base",
        defaultValue: "",
        choices: [
          { value: "", label: "No numeric edit" },
          { value: "A", label: "A" },
          { value: "C", label: "C" },
          { value: "G", label: "G" },
          { value: "T", label: "T" },
          { value: "N", label: "N" }
        ]
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

function limitsGroup() {
  return {
    type: "group",
    id: "limits",
    label: "Limits",
    collapsible: true,
    collapsed: true,
    options: [
      {
        id: "maxSessionTraces",
        type: "number",
        label: "Maximum traces to process",
        defaultValue: 20,
        min: 1,
        max: 100,
        step: 1,
        help: "Caps larger trace-session inputs before assembly and reference comparison."
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
    outputType: "Trace editor, chromatogram plot, base-call table, clipped FASTA/FASTQ, or summary report",
    task: "edit",
    workerExport: "runSangerTraceReviewEditor",
    workflowOutputIds: ["primary", "report", "table", "traceSvg", "fasta", "fastq", "traceJson", "warnings"]
  }),
  options: [
    reviewSettingsGroup(false),
    trimmingGroup("manual"),
    numericEditGroup(),
    outputFormatGroup("interactive-trace", [
      { value: "interactive-trace", label: "Trace editor" },
      { value: "svg-trace", label: "Chromatogram plot" },
      { value: "tsv", label: "Base-call table" },
      { value: "fasta", label: "Clipped FASTA" },
      { value: "fastq", label: "Clipped FASTQ" },
      { value: "report", label: "Summary report" }
    ]),
    limitsGroup()
  ]
};

export const sangerTraceAssemblyMetadata = {
  ...commonToolFields({
    id: "sanger-trace-assembly",
    name: "Sanger Trace Assembly",
    summary: "Assemble clipped Sanger trace reads into a small consensus and inspect read placement.",
    whenToUse: "Use this when forward, reverse, or tiled Sanger traces need to be combined into a small consensus sequence.",
    inputType: "Two or more Sanger chromatogram traces or base-call sequences",
    outputType: "Assembly trace map, assembly text map, consensus FASTA, or assembly report",
    task: "assemble",
    workerExport: "runSangerTraceAssembly",
    workflowOutputIds: ["primary", "report", "table", "sessionReport", "consensusFasta", "assemblyTextMap", "assemblyTraceMapSvg", "traceJson", "warnings"],
    splitInput: assemblySplitInput
  }),
  options: [
    reviewSettingsGroup(true),
    trimmingGroup("mott", { includeReverseComplement: false }),
    perTraceSettingsGroup(),
    assemblyGroup(),
    outputFormatGroup("assembly-trace-map-svg", [
      { value: "assembly-trace-map-svg", label: "Assembly trace map" },
      { value: "assembly-text-map", label: "Assembly text map" },
      { value: "consensus-fasta", label: "Consensus FASTA" },
      { value: "session-report", label: "Summary report" }
    ]),
    limitsGroup()
  ]
};

export const sangerTraceReferenceComparisonMetadata = {
  ...commonToolFields({
    id: "sanger-trace-reference-comparison",
    name: "Sanger Trace Reference Comparison",
    summary: "Align clipped Sanger traces to a fixed reference DNA sequence and review base differences in trace context.",
    whenToUse: "Use this when trace reads need to be placed on an expected reference and checked for mismatches, indels, strand, or mixed peak evidence.",
    inputType: "Sanger chromatogram trace set and reference DNA",
    outputType: "Reference trace map, difference review map, trace/reference alignment map, reference-difference table, or summary report",
    task: "compare",
    workerExport: "runSangerTraceReferenceComparison",
    workflowOutputIds: [
      "primary",
      "report",
      "table",
      "sessionReport",
      "referenceTraceMapSvg",
      "referenceDifferences",
      "referenceAlignmentSvg",
      "differenceReviewSvg",
      "traceJson",
      "warnings"
    ]
  }),
  options: [
    reviewSettingsGroup(false),
    trimmingGroup("mott", { includeReverseComplement: false }),
    perTraceSettingsGroup(),
    outputFormatGroup("reference-trace-map-svg", [
      { value: "reference-trace-map-svg", label: "Reference trace map" },
      { value: "difference-review-svg", label: "Difference review map" },
      { value: "reference-alignment-svg", label: "Trace/reference alignment map" },
      { value: "reference-differences-tsv", label: "Reference differences table" },
      { value: "session-report", label: "Summary report" }
    ]),
    limitsGroup()
  ]
};

export const sangerTraceViewerMetadata = sangerTraceReviewEditorMetadata;
