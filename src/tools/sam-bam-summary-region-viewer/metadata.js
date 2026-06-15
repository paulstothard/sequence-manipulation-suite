import {
  samAlignmentColumns,
  samCoverageColumns,
  samFlagColumns,
  samReferenceColumns
} from "../../core/sam-bam-summary.js";
import { makeOptionalReferenceGenomeOptionGroup } from "../reference-genome-options.js";

export const samBamSummaryRegionViewerMetadata = {
  id: "sam-bam-summary-region-viewer",
  name: "SAM/BAM Summary And Region Viewer",
  category: "High-Throughput Sequencing",
  tags: ["DNA", "RNA", "table", "SAM", "BAM", "alignment", "coordinates", "map", "statistics"],
  summary: "Summarize SAM/SAM.GZ alignments or query local indexed BAM/BAI files for coverage statistics, bounded region tables, region maps, or an alignment viewer.",
  inputType: "SAM text, SAM.GZ, or local indexed BAM plus BAI/CSI",
  outputType: "SAM report, coverage table, alignment tables, region map, or alignment viewer",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "alignments", kind: "table", schema: "sam-alignments", columns: samAlignmentColumns },
      { id: "references", kind: "table", schema: "sam-references", columns: samReferenceColumns },
      { id: "flags", kind: "table", schema: "sam-flags", columns: samFlagColumns },
      { id: "coverage", kind: "table", schema: "sam-coverage", columns: samCoverageColumns },
      { id: "regionSvg", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/sam-bam-summary-region-viewer/run.js",
  workerExport: "runSamBamSummaryRegionViewer",
  options: [
    {
      type: "group",
      id: "dataSource",
      label: "Data source",
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
      help: "Required for indexed BAM region queries and for SAM region tables, maps, viewers, and region-scoped coverage statistics. SAM text coverage uses whole references when @SQ lengths are available.",
      visibleWhen: { option: "outputFormat", value: ["coverage-tsv", "alignment-tsv", "region-svg", "interactive-viewer"] },
      options: [
        {
          id: "chromosome",
          type: "text",
          label: "Reference / chromosome",
          defaultValue: "NC_001422.1",
          suggestionsFrom: "sam-bam-references",
          help: "Reference name exactly as it appears in the SAM RNAME field or BAM header."
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
    makeOptionalReferenceGenomeOptionGroup(),
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output type",
          dependsOn: "dataSourceMode",
          defaultValue: "report",
          choices: [
            { value: "report", label: "Whole-file summary", dependsOnValue: "sam-text" },
            { value: "coverage-tsv", label: "Coverage statistics table", always: true },
            { value: "alignment-tsv", label: "Region alignment table", always: true },
            { value: "region-svg", label: "Region map", always: true },
            { value: "interactive-viewer", label: "Alignment viewer", always: true }
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
      visibleWhen: { option: "outputFormat", value: ["alignment-tsv", "region-svg", "interactive-viewer"] },
      options: [
        {
          id: "maxAlignments",
          type: "number",
          label: "Maximum alignments to show",
          defaultValue: 200,
          min: 1,
          max: 1000,
          step: 25,
          help: "Caps materialized region rows and region-map read glyphs. SAM text summaries still scan all supplied alignments; indexed BAM mode reads only the requested region."
        }
      ]
    },
    {
      id: "samBamScopeNote",
      type: "note",
      text: "Paste/upload mode scans supplied SAM/SAM.GZ alignments; indexed BAM mode reads only the selected region from BAM plus BAI/CSI."
    }
  ]
};
