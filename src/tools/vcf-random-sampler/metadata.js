import { vcfRandomSamplerColumns } from "../../core/vcf-random-sampler.js";

export const vcfRandomSamplerMetadata = {
  id: "vcf-random-sampler",
  name: "VCF Random Sampler",
  category: "Random & Mutagenesis",
  tags: ["table", "VCF", "statistics"],
  summary: "Randomly sample variant records from a VCF with optional reproducible seeds and common variant filters.",
  whenToUse: "Use this when you need a smaller random VCF subset for testing, QC spot checks, teaching, or reproducible downstream examples.",
  inputType: "VCF text or VCF.GZ",
  outputType: "Sampled VCF, variant table, or summary report",
  fileInput: {
    accept: ".vcf,.vcf.gz,.gz",
    dropLabel: "Drop VCF or VCF.GZ here",
    directFileOption: "vcfInputFile"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "sampledVcf", kind: "text", mediaType: "text/vcf" },
      { id: "table", kind: "table", schema: "vcf-random-sampler", columns: vcfRandomSamplerColumns },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/vcf-random-sampler/run.js",
  workerExport: "runVcfRandomSampler",
  options: [
    {
      type: "group",
      label: "Sampling",
      help: "Candidates are filtered first, then sampled.",
      options: [
        {
          id: "sampleSize",
          type: "number",
          label: "Sample size",
          defaultValue: 5,
          min: 0,
          max: 100000,
          step: 1,
          help: "Number of variant records to sample from the candidate set."
        },
        {
          id: "withReplacement",
          type: "checkbox",
          label: "Sample with replacement",
          defaultValue: false,
          help: "Allows the same variant record to be drawn more than once. Without replacement, sampled records are returned in their original VCF order."
        },
        {
          id: "seed",
          type: "text",
          label: "Random seed",
          defaultValue: "",
          help: "Enter a seed to reproduce the same sampled records; leave empty for a new random draw."
        }
      ]
    },
    {
      type: "group",
      id: "variantFilters",
      label: "Variant filters",
      help: "Optional candidate filters applied before sampling.",
      options: [
        {
          id: "autosomesOnly",
          type: "checkbox",
          label: "Autosomes only",
          defaultValue: false,
          help: "Keeps chromosomes 1 through 22, with or without a chr prefix. Other contigs, sex chromosomes, mitochondrial records, and unplaced scaffolds are excluded."
        },
        {
          id: "biallelicOnly",
          type: "checkbox",
          label: "Biallelic-only sites",
          defaultValue: false,
          help: "Keeps records with exactly one ALT allele that is not missing. Multiallelic and symbolic records are excluded."
        },
        {
          id: "maxMissingGenotypeRate",
          type: "number",
          label: "Maximum missing genotype rate",
          defaultValue: "",
          min: 0,
          max: 1,
          step: 0.01,
          help: "Optional fraction from 0 to 1. Leave blank to ignore sample missingness. When set, records without evaluable FORMAT/GT sample genotypes fail this filter."
        },
        {
          id: "variantType",
          type: "select",
          label: "Variant type",
          defaultValue: "any",
          choices: [
            { value: "any", label: "Any type" },
            { value: "snv", label: "SNV" },
            { value: "mnv", label: "MNV" },
            { value: "indel", label: "Indel" },
            { value: "insertion", label: "Insertion" },
            { value: "deletion", label: "Deletion" },
            { value: "multiallelic", label: "Multiallelic" },
            { value: "symbolic", label: "Symbolic allele" }
          ],
          help: "Classifies records from REF and ALT allele lengths. Any type disables this filter."
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "sampled-vcf",
          choices: [
            { value: "sampled-vcf", label: "Sampled VCF" },
            { value: "variant-table", label: "Variant table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      type: "group",
      id: "limits",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "maxInputVariants",
          type: "number",
          label: "Maximum variants to scan",
          defaultValue: 100000,
          min: 1,
          max: 5000000,
          step: 1000,
          help: "Caps the number of VCF variant records scanned before sampling so accidental whole-genome pastes stay responsive."
        }
      ]
    }
  ]
};
