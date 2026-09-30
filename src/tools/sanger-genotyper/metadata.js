import { sangerTrimmingGroup } from '../sanger-trimming-options.js';
import { SANGER_SESSION_SEPARATOR } from "../../core/sanger-trace.js";
import {
  sangerReferenceOptions,
  SANGER_REFERENCE_LIMIT,
} from "../../core/sanger-reference.js";
import {
  sangerGenotypeColumns,
  SANGER_GENOTYPE_LIMITS,
} from "../../core/sanger-genotype.js";
import { sangerHaplotypeColumns, sangerCandidateColumnsOption } from "../../core/sanger-genotype-candidates.js";
export const sangerGenotyperMetadata = {
  id: "sanger-genotyper",
  name: "Sanger Genotyper",
  category: "Sanger Traces",
  tags: ["DNA", "RNA", "VCF", "alignment", "coordinates", "map"],
  summary:
    "Call SNP and indel genotypes across Sanger samples and review trace alignments and candidate haplotypes.",
  whenToUse:
    "Compare samples at discovered or specified sites, group replicate traces, and inspect trace and candidate haplotype alignments against a reference.",
  inputType: "Sanger chromatogram traces and reference DNA/RNA",
  outputType:
    "Genotype table, trace/reference alignment map, variant review plot, coverage plot, VCF, analysis JSON, or summary report",
  sangerTraceTask: "compare",
  sangerSampleInputs: true,
  splitInput: {
    separator: SANGER_SESSION_SEPARATOR,
    customRenderer: "sanger-trace-workspace",
    panels: [
      {
        id: "trace-set",
        label: "Trace",
        dropLabel: "Drop one AB1, SCF or Trace JSON file here",
        accept: ".ab1,.abi,.abif,.scf,.json,.txt",
      },
      {
        id: "reference",
        label: "Reference DNA/RNA",
        dropLabel: "Drop one reference DNA/RNA sequence or FASTA record here",
        accept: ".fa,.fasta,.fna,.txt",
      },
    ],
  },
  runInWorker: true,
  workerModule: "../tools/sanger-genotyper/run.js",
  workerExport: "runSangerGenotyper",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      {
        id: "table",
        kind: "table",
        schema: "sanger-genotypes",
        columns: sangerGenotypeColumns,
        optionalColumns: sangerHaplotypeColumns,
        outputFormat: "tsv", label: "Genotype table",
      },
      {
        id: 'referenceAlignmentSvg', kind: 'text', mediaType: 'image/svg+xml',
        outputFormat: 'reference-alignment-svg', label: 'Trace/reference alignment map',
      },
      {
        id: "reviewSvg",
        kind: "text",
        mediaType: "image/svg+xml",
        outputFormat: "review-svg", label: "Variant review plot",
      },
      {
        id: "coverageSvg",
        kind: "text",
        mediaType: "image/svg+xml",
        outputFormat: "coverage-svg", label: "Coverage plot",
      },
      { id: "vcf", kind: "text", mediaType: "text/vcf", outputFormat: "vcf", label: "VCF" },
      {
        id: "analysisJson",
        kind: "text",
        mediaType: "application/json",
        outputFormat: "json", label: "Analysis JSON",
      },
      {
        id: "report",
        kind: "text",
        mediaType: "text/plain",
        outputFormat: "report", label: "Summary report",
      },
      { id: "warnings", kind: "warnings" },
    ],
  },
  options: [
    sangerReferenceOptions,
    {
      type: "group",
      label: "Genotyping",
      options: [
        {
          id: "ploidy",
          type: "select",
          label: "Ploidy",
          defaultValue: "2",
          choices: [1, 2, 3, 4].map((value) => ({
            value: String(value),
            label: String(value),
          })),
          help: "Expected allele copies per sample. Haploid and diploid calls use the peak signals; mixed haploid evidence remains missing. At ploidy 3 or 4, clean traces can support identical copies; mixed dosage remains missing.",
        },
        {
          id: "siteMode",
          type: "select",
          label: "Sites to report",
          defaultValue: "variants",
          choices: [
            { value: "variants", label: "Discovered variants" },
            { value: "specified", label: "Specified sites" },
            { value: "all", label: "All covered sites" },
          ],
          help: "Discovered variants are collected across samples, then every sample is evaluated at each site. Specified sites include missing calls for samples without usable coverage.",
        },
        {
          id: "sites",
          type: "text",
          label: "Reference positions or ranges",
          defaultValue: "",
          help: "For Specified sites, enter positions or ranges such as 120, 240-260. Use the displayed reference numbering.",
        },
        sangerCandidateColumnsOption,
        {
          id: "minimumScoreMargin",
          type: "number",
          label: "Minimum model score margin",
          defaultValue: 4,
          min: 0,
          max: 100,
          step: 1,
          help: "Minimum difference between the two best-fitting SNP genotype scores. Higher values require clearer evidence and produce more missing calls. Error rates for this score still need validation.",
        },
      ],
    },
    sangerTrimmingGroup({ includeMottSettings: false, signalAware: true }),
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "select",
          label: "Output format",
          defaultValue: "tsv",
          choices: [
            { value: "tsv", label: "Genotype table" },
            { value: 'reference-alignment-svg', label: 'Trace/reference alignment map' },
            { value: "review-svg", label: "Variant review plot" },
            { value: "coverage-svg", label: "Coverage plot" },
            { value: "vcf", label: "VCF" },
            { value: "json", label: "Analysis JSON" },
            { value: "report", label: "Summary report" },
          ],
        },
      ],
    },
    {
      type: "group",
      id: "limits",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "maxReferenceBases",
          type: "limit-value",
          label: "Reference bases",
          value: SANGER_REFERENCE_LIMIT,
          help: "Fixed tested search capacity. Read placement uses bounded local alignment windows.",
        },
        {
          id: "maxTraces",
          type: "limit-value",
          label: "Traces",
          value: SANGER_GENOTYPE_LIMITS.traces,
          help: "Fixed multi-sample analysis scope.",
        },
        {
          id: "maxReadPositions",
          type: "limit-value",
          label: "Base calls per trace",
          value: 1200,
          help: "Fixed reconstruction scope; at least 40 calls are required.",
        },
        {
          id: "maxSignalSamples",
          type: "limit-value",
          label: "Signal measurements per channel",
          value: 200000,
          help: "Each A/C/G/T curve contains intensity measurements between base calls. Larger channels are rejected while enforced.",
        },
        {
          id: "maxInputCharacters",
          type: "limit-value",
          label: "Input size",
          value: SANGER_GENOTYPE_LIMITS.inputCharacters,
          help: "Combined input characters, or bytes for binary trace data. Larger input is rejected while enforced.",
        },
        {
          id: "maxSites",
          type: "limit-value",
          label: "Reported sites",
          value: 20000,
        },
        {
          id: 'maxCandidateAlignmentCells', type: 'limit-value', label: 'Trace/reference alignment cells', value: 20000,
          help: 'Fixed figure-density limit. Use fewer traces for this view; Analysis JSON retains the full results.',
        },
        {
          type: "limit-value",
          id: "maxPlotPanels",
          label: "Trace panels in a review plot",
          value: 200,
          help: "Fixed figure-density limit across all displayed sites and traces.",
        },
        {
          id: "maxPlotSites",
          type: "limit-value",
          label: "Sites in a review plot",
          value: 40,
          help: "Fixed figure-density limit. Choose Specified sites to inspect a smaller set; tables retain the full requested result.",
        },
      ],
    },
    {
      id: "methodNote",
      type: "note",
      text: "Calls SNP and indel genotypes and attempts to reconstruct up to two distinct haplotypes per trace. Indel shifts are resolved before SNPs are assigned to reference positions. Alignments retain reference and original-read coordinates. Uncertain calls remain missing; IUPAC codes retain unphased candidate bases. Phase between separate shifted regions remains uncertain. Model score error rates still need validation. Simulated traces contain generated quality values.",
    },
    {
      id: "references",
      type: "note",
      text: "References:\n\nSanger SNP genotyping: Stephens et al. 2006 (PolyPhred).\n\nTrace decomposition comparison: Rausch et al. 2020 (Tracy).\n\nQuantitative peak analysis: Carr et al. 2009 (QSVanalyzer).",
    },
  ],
};
