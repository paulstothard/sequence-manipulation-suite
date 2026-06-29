import { vcfInfoTagColumns } from "../../core/vcf-genotype-table.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";
import {
  VCF_GENOTYPE_VIEWER_MAX_RECORDS,
  VCF_GENOTYPE_VIEWER_MAX_REGION_SPAN
} from "./run.js";

export const vcfGenotypeTableMetadata = {
  id: "vcf-genotype-table",
  name: "VCF Extractor",
  category: "High-Throughput Sequencing",
  tags: ["table", "VCF", "coordinates", "format conversion"],
  summary: "Extract VCF header definitions, sample names, variant tables, split-INFO tables, region-filtered genotype tables, Excel workbooks, or variant region viewer data.",
  inputType: "VCF text, VCF.GZ, or indexed VCF.GZ plus TBI/CSI",
  outputType: "VCF table, Excel workbook, report, or variant region viewer",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "vcf-extractor", columns: vcfInfoTagColumns },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/vcf-genotype-table/run.js",
  workerExport: "runVcfGenotypeTable",
  options: [
    {
      type: "group",
      id: "vcfSource",
      label: "VCF source",
      options: [
        {
          id: "vcfSourceMode",
          type: "radio",
          label: "Input mode",
          defaultValue: "paste-upload",
          choices: [
            { value: "paste-upload", label: "Paste/upload VCF" },
            { value: "indexed-vcf", label: "Indexed VCF for region queries" }
          ],
          help: "Use paste/upload mode for VCF text, .vcf, or ordinary .vcf.gz files that SMS3 scans in the browser. Use indexed mode for bgzip-compressed VCF.GZ plus a matching TBI or CSI index."
        }
      ]
    },
    {
      id: "vcfInputFile",
      type: "file",
      placement: "input",
      label: "VCF / VCF.GZ file",
      accept: ".vcf,.vcf.gz,.gz",
      defaultValue: null,
      dropLabel: "Drop VCF or VCF.GZ here",
      visibleWhen: { option: "vcfSourceMode", value: "paste-upload" },
      help: "Use a local VCF or gzip-compressed VCF file instead of pasting text for larger scans."
    },
    {
      id: "indexedVcfFile",
      type: "file",
      placement: "input",
      label: "Indexed VCF.GZ file",
      accept: ".vcf.gz,.bgz,.gz",
      defaultValue: null,
      dropLabel: "Drop bgzip VCF.GZ here",
      visibleWhen: { option: "vcfSourceMode", value: "indexed-vcf" },
      help: "Bgzip-compressed VCF file for an indexed browser-local region query."
    },
    {
      id: "indexFile",
      type: "file",
      placement: "input",
      label: "TBI or CSI index",
      accept: ".tbi,.csi",
      defaultValue: null,
      dropLabel: "Drop matching TBI or CSI index here",
      visibleWhen: { option: "vcfSourceMode", value: "indexed-vcf" },
      help: "Matching tabix .tbi or CSI .csi index for the selected VCF.GZ file."
    },
    {
      type: "select",
      id: "dataType",
      label: "VCF data",
      dependsOn: "vcfSourceMode",
      help: "Choose the VCF information to extract. Split-INFO table choices keep the fixed VCF fields and add one table column per declared or observed INFO tag. Region choices reveal coordinate controls and can also be shown as a variant region viewer.",
      defaultValue: "info-tags",
      choices: [
        { value: "metadata", label: "Header metadata", dependsOnValue: "paste-upload" },
        { value: "info-tags", label: "INFO definitions", dependsOnValue: "paste-upload" },
        { value: "format-fields", label: "FORMAT/sample-field definitions", dependsOnValue: "paste-upload" },
        { value: "samples", label: "Sample names", dependsOnValue: "paste-upload" },
        { value: "variants", label: "All variants", dependsOnValue: "paste-upload" },
        { value: "split-info-variants", label: "All variants as split-INFO table", dependsOnValue: "paste-upload" },
        { value: "genotypes", label: "Sample genotypes in region", always: true },
        { value: "region-variants", label: "Variants in region", always: true },
        { value: "region-split-info", label: "Variants in region as split-INFO table", always: true }
      ]
    },
    {
      type: "group",
      id: "vcfRegionToInspect",
      label: "Region to inspect",
      help: "Required for indexed VCF mode and for region-filtered tables or the variant region viewer. Paste/upload mode scans the supplied VCF to find records overlapping this region.",
      visibleWhen: { option: "dataType", value: ["genotypes", "region-variants", "region-split-info"] },
      options: [
        {
          id: "chromosome",
          type: "text",
          label: "Reference / chromosome",
          defaultValue: "",
          suggestionsFrom: "vcf-chromosomes",
          help: "Reference name exactly as it appears in the VCF CHROM column or ##contig header lines."
        },
        {
          id: "regionStart",
          type: "number",
          label: "Start position",
          defaultValue: "",
          min: 1,
          step: 1,
          help: "Optional 1-based inclusive start position."
        },
        {
          id: "regionEnd",
          type: "number",
          label: "End position",
          defaultValue: "",
          min: 1,
          step: 1,
          help: "Optional 1-based inclusive end position."
        },
        {
          id: "sampleNames",
          type: "text",
          label: "Samples",
          defaultValue: "",
          suggestionsFrom: "vcf-samples",
          visibleWhen: { option: "dataType", value: "genotypes" },
          placeholder: "optional comma-separated sample names",
          help: "Optional comma-separated sample names. Leave blank to include all samples."
        },
        {
          id: "maxVariants",
          type: "number",
          label: "Maximum variants to display",
          defaultValue: 500,
          min: 1,
          max: 10000,
          step: 100,
          help: "Caps materialized region rows and variant glyphs. Indexed mode reads only the requested region; paste/upload mode may still need to scan the file."
        }
      ]
    },
    {
      ...makeOptionalReferenceGenomeOptionGroup(),
      visibleWhen: { option: "outputFormat", value: "interactive-viewer" }
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "select",
          label: "Output format",
          dependsOn: "dataType",
          defaultValue: "tsv",
          choices: [
            { value: "tsv", label: "Table", dependsOnValue: ["metadata", "info-tags", "format-fields", "samples", "variants", "split-info-variants", "genotypes", "region-variants", "region-split-info"] },
            { value: "xlsx", label: "Excel workbook", dependsOnValue: ["metadata", "info-tags", "format-fields", "samples", "variants", "split-info-variants", "genotypes", "region-variants", "region-split-info"] },
            { value: "report", label: "Summary report", dependsOnValue: ["metadata", "info-tags", "format-fields", "samples", "variants", "split-info-variants", "genotypes", "region-variants", "region-split-info"] },
            { value: "interactive-viewer", label: "Variant region viewer", dependsOnValue: ["genotypes", "region-variants"] }
          ]
        }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "variantViewerLimitNote",
          type: "note",
          text: `Variant region viewer output is capped at ${VCF_GENOTYPE_VIEWER_MAX_RECORDS.toLocaleString()} contigs/chromosomes and ${VCF_GENOTYPE_VIEWER_MAX_REGION_SPAN.toLocaleString()} bp per displayed region. Table output contains the full selected row set up to the visible Maximum variants to display setting.`
        }
      ]
    },
    {
      id: "vcfScopeNote",
      type: "note",
      text: "Paste/upload mode scans the supplied VCF in the browser; indexed mode reads only the requested region from VCF.GZ plus TBI/CSI."
    }
  ]
};
