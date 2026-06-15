import { vcfFilterVariantColumns } from "../../core/vcf-filter.js";

export const vcfFilterMetadata = {
  id: "vcf-filter",
  name: "VCF Filter",
  category: "High-Throughput Sequencing",
  tags: ["table", "VCF", "validation", "coordinates"],
  summary: "Filter VCF records by region, FILTER status, QUAL, allele type, INFO values, predicted consequences, sample columns, and genotype fields.",
  whenToUse: "Use this when you need to keep a biologically meaningful subset of variants from a VCF while preserving a valid filtered VCF or producing a compact review table.",
  inputType: "VCF text, VCF.GZ, or indexed VCF.GZ plus TBI/CSI",
  outputType: "Filtered VCF, variant table, or summary report",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "filteredVcf", kind: "text", mediaType: "text/vcf" },
      { id: "table", kind: "table", schema: "vcf-filter", columns: vcfFilterVariantColumns },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/vcf-filter/run.js",
  workerExport: "runVcfFilter",
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
            { value: "indexed-vcf", label: "Indexed VCF region file" }
          ],
          help: "Paste/upload mode scans VCF text, .vcf, or ordinary .vcf.gz files in the browser. Indexed mode uses a bgzip VCF.GZ with TBI/CSI for bounded region reads."
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
      help: "Use a local VCF or gzip-compressed VCF file instead of pasted text."
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
      help: "Bgzip-compressed VCF file for a browser-local indexed region query."
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
      type: "group",
      id: "vcfRegionFilter",
      label: "Region filters",
      help: "Add a chromosome and optional 1-based inclusive coordinates to restrict variants by position. Leave all fields blank to apply no region filter in paste/upload mode; indexed VCF mode requires a chromosome.",
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
          help: "Optional 1-based inclusive start coordinate. Leave blank to keep variants from the beginning of the selected reference."
        },
        {
          id: "regionEnd",
          type: "number",
          label: "End position",
          defaultValue: "",
          min: 1,
          step: 1,
          help: "Optional 1-based inclusive end coordinate. Leave blank to keep variants through the end of the selected reference."
        }
      ]
    },
    {
      type: "group",
      id: "variantFilters",
      label: "Variant record filters",
      help: "These filters apply to whole VCF records. Defaults keep PASS or unfiltered records with QUAL at least 20; set FILTER status to Any status and clear Minimum QUAL for a pass-through variant filter.",
      options: [
        {
          id: "variantFilterDefaultsNote",
          type: "note",
          text: "Defaults are active filters: FILTER must be PASS or . and QUAL must be at least 20. Empty optional fields do not filter."
        },
        {
          id: "filterStatus",
          type: "select",
          label: "FILTER status",
          defaultValue: "pass",
          choices: [
            { value: "any", label: "Any status" },
            { value: "pass", label: "PASS or ." },
            { value: "non-pass", label: "Non-PASS only" },
            { value: "named", label: "Named filter(s)" }
          ],
          help: "Uses the VCF FILTER column. PASS or . keeps records marked as passing or unfiltered; Any status disables this filter."
        },
        {
          id: "filterNames",
          type: "text",
          label: "Named FILTER values",
          defaultValue: "",
          visibleWhen: { option: "filterStatus", value: "named" },
          placeholder: "q10, LowQual",
          help: "Comma- or whitespace-separated FILTER names to keep when FILTER status is set to Named filter(s)."
        },
        {
          id: "minQual",
          type: "number",
          label: "Minimum QUAL",
          defaultValue: 20,
          min: 0,
          step: 1,
          help: "Default keeps records with QUAL >= 20. Leave blank to disable the QUAL cutoff; records with missing QUAL are removed only when a minimum is set."
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
        },
        {
          id: "idMode",
          type: "select",
          label: "Variant ID",
          defaultValue: "any",
          choices: [
            { value: "any", label: "Any ID state" },
            { value: "has-id", label: "Has ID" },
            { value: "missing-id", label: "Missing ID" }
          ],
          help: "Uses the VCF ID column. Any ID state keeps records with IDs and records with . IDs."
        },
        {
          id: "infoFilters",
          type: "textarea",
          label: "INFO filters",
          defaultValue: "",
          placeholder: "DP>=20; AF>=0.05",
          help: "Optional semicolon- or line-separated INFO comparisons. Leave blank to skip INFO filtering. Supported operators are =, !=, <, <=, >, and >=."
        }
      ]
    },
    {
      type: "group",
      id: "consequenceFilters",
      label: "Consequence filters",
      help: "Optional filters for ANN or CSQ INFO annotations. Leave all fields at their defaults to skip predicted-consequence filtering; a record is kept when at least one annotation matches every filled consequence field.",
      collapsible: true,
      collapsedByDefault: true,
      options: [
        {
          id: "consequenceField",
          type: "select",
          label: "Annotation field",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto-detect ANN or CSQ" },
            { value: "ANN", label: "ANN" },
            { value: "CSQ", label: "CSQ" }
          ],
          help: "ANN is used by SnpEff-style annotations and CSQ is commonly used by VEP. Auto-detect checks ANN first, then CSQ."
        },
        {
          id: "consequenceImpact",
          type: "select",
          label: "Impact",
          defaultValue: "any",
          choices: [
            { value: "any", label: "Any impact" },
            { value: "HIGH", label: "HIGH" },
            { value: "MODERATE", label: "MODERATE" },
            { value: "LOW", label: "LOW" },
            { value: "MODIFIER", label: "MODIFIER" }
          ],
          help: "Matches ANN Annotation_Impact or CSQ IMPACT. Any impact disables this consequence filter."
        },
        {
          id: "consequenceTerms",
          type: "text",
          label: "Consequence terms",
          defaultValue: "",
          placeholder: "missense_variant, frameshift_variant",
          help: "Optional comma- or whitespace-separated consequence terms. Terms are matched against ANN Annotation or CSQ Consequence values."
        },
        {
          id: "consequenceGenes",
          type: "text",
          label: "Gene names or IDs",
          defaultValue: "",
          suggestionsFrom: "vcf-genes",
          placeholder: "EGFR, TP53",
          help: "Optional gene symbols or gene IDs to keep. Matches common ANN and CSQ gene-name/gene-ID fields."
        },
        {
          id: "consequenceTranscripts",
          type: "text",
          label: "Transcript IDs",
          defaultValue: "",
          placeholder: "ENST000...",
          help: "Optional transcript or feature IDs to keep from ANN Feature_ID or CSQ Feature."
        },
        {
          id: "aminoAcidChanges",
          type: "text",
          label: "Amino-acid changes",
          defaultValue: "",
          placeholder: "p.Gly12Asp, G12D",
          help: "Optional amino-acid change text to find in HGVS.p/HGVSp or Amino_acids annotation fields."
        }
      ]
    },
    {
      type: "group",
      id: "sampleColumnFilters",
      label: "Sample columns",
      help: "Optionally keep or remove sample columns from filtered VCF output. This changes the #CHROM header and every kept data row so the emitted VCF remains valid.",
      collapsible: true,
      collapsedByDefault: true,
      options: [
        {
          id: "sampleSelectionMode",
          type: "select",
          label: "Sample output",
          defaultValue: "all",
          choices: [
            { value: "all", label: "Keep all samples" },
            { value: "keep", label: "Keep listed samples" },
            { value: "remove", label: "Remove listed samples" }
          ],
          help: "Controls which sample columns are written to Filtered VCF output. Keep all samples leaves the sample columns unchanged."
        },
        {
          id: "sampleSelectionNames",
          type: "text",
          label: "Samples to keep/remove",
          defaultValue: "",
          suggestionsFrom: "vcf-samples",
          placeholder: "tumor, normal",
          visibleWhen: { option: "sampleSelectionMode", value: ["keep", "remove"] },
          help: "Comma- or whitespace-separated sample names for the selected keep/remove action."
        }
      ]
    },
    {
      type: "group",
      id: "sampleGenotypeFilters",
      label: "Genotype filters",
      help: "These filters apply to FORMAT/sample fields. With the defaults, genotypes do not restrict records; blank numeric fields do not filter.",
      collapsible: true,
      collapsedByDefault: false,
      options: [
        {
          id: "sampleNames",
          type: "text",
          label: "Samples to evaluate",
          defaultValue: "",
          suggestionsFrom: "vcf-samples",
          placeholder: "optional comma-separated sample names",
          help: "Optional comma- or whitespace-separated sample names used for genotype filters. Leave blank to evaluate the output sample set, or all samples when sample-column filtering is not used."
        },
        {
          id: "siteGenotypeMode",
          type: "select",
          label: "Site genotype pattern",
          defaultValue: "any",
          choices: [
            { value: "any", label: "Any site pattern" },
            { value: "all-called", label: "All evaluated samples called" },
            { value: "any-missing", label: "At least one evaluated sample missing" },
            { value: "all-hom-ref", label: "All evaluated samples homozygous reference" },
            { value: "all-reference", label: "All evaluated samples reference only" }
          ],
          help: "Applies a per-site rule across evaluated samples. All-called excludes ./.; any-missing keeps sites with at least one missing GT; reference-only choices require called reference genotypes."
        },
        {
          id: "maxMissingGenotypeRate",
          type: "number",
          label: "Maximum missing genotype rate",
          defaultValue: "",
          min: 0,
          max: 1,
          step: 0.01,
          help: "Optional per-site missing GT fraction from 0 to 1 across evaluated samples. Leave blank to skip missing-rate filtering."
        },
        {
          id: "genotypeMode",
          type: "select",
          label: "Matching sample genotype",
          defaultValue: "any",
          choices: [
            { value: "any", label: "Any genotype" },
            { value: "called", label: "Called genotype" },
            { value: "variant", label: "Any alternate allele" },
            { value: "heterozygous", label: "Heterozygous" },
            { value: "homozygous-alt", label: "Homozygous alternate" },
            { value: "missing", label: "Missing genotype" }
          ],
          help: "Uses each selected sample's GT field. Any genotype disables genotype-state filtering; other choices require at least one selected sample to match."
        },
        {
          id: "minSampleDepth",
          type: "number",
          label: "Minimum sample DP",
          defaultValue: "",
          min: 0,
          step: 1,
          help: "Optional cutoff on the FORMAT/DP value for matching samples. Leave blank to skip sample depth filtering; samples with missing DP fail only when a cutoff is set."
        },
        {
          id: "minSampleGq",
          type: "number",
          label: "Minimum sample GQ",
          defaultValue: "",
          min: 0,
          step: 1,
          help: "Optional cutoff on the FORMAT/GQ value for matching samples. Leave blank to skip genotype-quality filtering; samples with missing GQ fail only when a cutoff is set."
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
          defaultValue: "filtered-vcf",
          choices: [
            { value: "filtered-vcf", label: "Filtered VCF" },
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
          id: "maxVariants",
          type: "number",
          label: "Maximum variants to keep",
          defaultValue: 10000,
          min: 1,
          max: 100000,
          step: 1000,
          help: "Caps materialized filtered VCF rows and table rows so accidental whole-genome scans stay responsive."
        }
      ]
    },
    {
      id: "vcfFilterScopeNote",
      type: "note",
      text: "Paste/upload mode scans the supplied VCF in the browser; indexed mode reads only the selected region from VCF.GZ plus TBI/CSI."
    }
  ]
};
