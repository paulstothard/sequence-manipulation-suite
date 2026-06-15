import { samAlignmentColumns } from "../../core/sam-bam-summary.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

function makeAlignmentViewerReferenceGenomeOptionGroup() {
  const group = makeOptionalReferenceGenomeOptionGroup({
    help: "Optional reference sequence used to replace placeholder bases and mark read-base mismatches in the alignment viewer."
  });
  return {
    ...group,
    options: (group.options ?? []).map((option) => {
      if (option.id === "referenceGenomeMode") {
        return {
          ...option,
          defaultValue: "loaded",
          choices: [
            { value: "none", label: "None" },
            { value: "loaded", label: "Plain sequence or FASTA" },
            { value: "flatfile", label: "Single annotated record" },
            { value: "gff3-fasta", label: "GFF3 + FASTA" },
            { value: "gtf-fasta", label: "GTF + FASTA" },
            { value: "bed-fasta", label: "BED + FASTA" },
            { value: "indexed", label: "FASTA + FAI" },
            { value: "bgzf", label: "BGZF FASTA + FAI + GZI" }
          ]
        };
      }
      if (option.type === "file") {
        return {
          ...option,
          placement: "input",
          visibleWhen: option.id === "referenceGenomeFastaFile"
            ? { option: "referenceGenomeMode", value: ["loaded", "indexed", "bgzf"] }
            : option.visibleWhen,
          ...(option.id === "referenceGenomeFastaFile"
            ? {
              pasteArea: true,
              pasteName: "alignment-viewer-reference.fasta",
              pasteRows: 8,
              pastePlaceholder: "Paste reference FASTA here"
            }
            : {})
        };
      }
      return option;
    })
  };
}

export const alignmentViewerMetadata = {
  id: "alignment-viewer",
  name: "Alignment Viewer",
  category: "Viewers & Figures",
  tags: ["DNA", "RNA", "FASTA", "SAM", "BAM", "VCF", "alignment", "coordinates", "map"],
  summary: "Inspect a bounded SAM/BAM alignment region in the interactive DNA viewer, with optional VCF variant markers and optional reference genome bases.",
  whenToUse: "Use this when you want to visually review mapped reads across a specific reference region, with supplied variants and reference bases overlaid.",
  inputType: "SAM/SAM.GZ text or local indexed BAM plus optional VCF and reference FASTA",
  outputType: "Alignment viewer, region alignment table, or summary report",
  splitInput: {
    customRenderer: "alignment-viewer-workspace",
    separator: "##VCF",
    panels: [
      {
        id: "alignments",
        label: "SAM alignments",
        dropLabel: "Drop SAM or SAM.GZ here",
        accept: ".sam,.sam.gz,.gz,.txt",
        placeholder: "Paste SAM text here, or choose SAM/SAM.GZ or indexed BAM files below."
      },
      {
        id: "variants",
        label: "Optional VCF variants",
        dropLabel: "Drop optional VCF or VCF.GZ here",
        accept: ".vcf,.vcf.gz,.gz,.txt",
        placeholder: "Paste optional VCF text here to overlay variant sites in the alignment viewer. Leave blank when no VCF is available."
      }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "alignments", kind: "table", schema: "sam-alignments", columns: samAlignmentColumns },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/alignment-viewer/run.js",
  workerExport: "runAlignmentViewer",
  options: [
    {
      type: "group",
      id: "alignmentSource",
      label: "Alignment source",
      options: [
        {
          id: "dataSourceMode",
          type: "radio",
          label: "Input mode",
          defaultValue: "sam-text",
          choices: [
            { value: "sam-text", label: "SAM / SAM.GZ text file" },
            { value: "indexed-bam", label: "Indexed BAM region file" }
          ],
          help: "Use SAM mode for pasted or uploaded text alignments. Use indexed BAM mode for a local BAM file plus its BAI or CSI index."
        }
      ]
    },
    {
      id: "samInputFile",
      type: "file",
      placement: "input",
      label: "SAM / SAM.GZ file",
      accept: ".sam,.sam.gz,.gz",
      defaultValue: null,
      dropLabel: "Drop SAM or SAM.GZ here",
      visibleWhen: { option: "dataSourceMode", value: "sam-text" },
      help: "Use a local SAM or gzip-compressed SAM file instead of pasting text for larger scans."
    },
    {
      id: "indexedBamFile",
      type: "file",
      placement: "input",
      label: "BAM file",
      accept: ".bam",
      defaultValue: null,
      dropLabel: "Drop BAM file here",
      visibleWhen: { option: "dataSourceMode", value: "indexed-bam" },
      help: "Local BAM file for an indexed browser-local region query."
    },
    {
      id: "bamIndexFile",
      type: "file",
      placement: "input",
      label: "BAI or CSI index",
      accept: ".bai,.csi",
      defaultValue: null,
      dropLabel: "Drop matching BAI or CSI index here",
      visibleWhen: { option: "dataSourceMode", value: "indexed-bam" },
      help: "Matching .bai or .csi index created for the selected BAM file."
    },
    {
      type: "group",
      id: "regionToInspect",
      label: "Region to inspect",
      help: "The alignment viewer is intentionally bounded. Choose one reference/chromosome and coordinate range to render.",
      options: [
        {
          id: "chromosome",
          type: "text",
          label: "Reference / chromosome",
          defaultValue: "NC_001422.1",
          suggestionsFrom: "sam-bam-references",
          help: "Reference name exactly as it appears in the SAM RNAME field, BAM header, or VCF CHROM column."
        },
        {
          id: "regionStart",
          type: "number",
          label: "Start position",
          defaultValue: 3920,
          min: 1,
          step: 1
        },
        {
          id: "regionEnd",
          type: "number",
          label: "End position",
          defaultValue: 4130,
          min: 1,
          step: 1
        }
      ]
    },
    {
      type: "group",
      id: "variantOverlay",
      label: "Variant overlay",
      collapsible: true,
      collapsed: false,
      options: [
        {
          id: "vcfSourceMode",
          type: "radio",
          label: "VCF source",
          defaultValue: "paste-upload",
          choices: [
            { value: "paste-upload", label: "Paste/upload VCF" },
            { value: "indexed-vcf", label: "Indexed VCF region file" }
          ],
          help: "Optional. Pasted/uploaded VCF is scanned for the selected region; indexed VCF.GZ plus TBI/CSI is best for larger variant files."
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
      dropLabel: "Drop optional VCF or VCF.GZ here",
      visibleWhen: { option: "vcfSourceMode", value: "paste-upload" },
      help: "Use a local VCF or gzip-compressed VCF file instead of the optional VCF text panel."
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
    makeAlignmentViewerReferenceGenomeOptionGroup(),
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "interactive-viewer",
          choices: [
            { value: "interactive-viewer", label: "Alignment viewer" },
            { value: "alignment-tsv", label: "Region alignment table" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      type: "group",
      id: "advancedLimits",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "maxAlignments",
          type: "number",
          label: "Maximum alignments to show",
          defaultValue: 200,
          min: 1,
          max: 1000,
          step: 25,
          help: "Caps materialized region rows and viewer read glyphs. Indexed BAM mode reads only the requested region."
        },
        {
          id: "maxVariants",
          type: "number",
          label: "Maximum variants to show",
          defaultValue: 500,
          min: 1,
          max: 10000,
          step: 100,
          visibleWhen: { option: "vcfSourceMode", value: ["paste-upload", "indexed-vcf"] },
          help: "Caps variant markers in the viewer and any region variant extraction used to build them."
        }
      ]
    }
  ]
};
