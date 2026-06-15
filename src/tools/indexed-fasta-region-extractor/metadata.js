import { indexedFastaRegionColumns } from "../../core/indexed-genomics/indexed-fasta-reader.js";
import { INDEXED_FASTA_BUNDLE_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const indexedFastaRegionExtractorMetadata = {
  id: "indexed-fasta-region-extractor",
  name: "FASTA Region Extractor",
  category: "FASTA",
  tags: ["DNA", "RNA", "protein", "FASTA", "coordinates", "format conversion", "map"],
  summary: "Extract coordinate ranges from pasted/uploaded FASTA records, uncompressed indexed FASTA, or BGZF indexed FASTA.",
  inputType: "FASTA records, FASTA+FAI, or BGZF FASTA+FAI+GZI",
  outputType: "Extracted FASTA, region table, DNA region viewer, or report",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "regionTable", kind: "table", schema: "indexed-fasta-regions", columns: indexedFastaRegionColumns },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "indexed-fasta-regions" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/indexed-fasta-region-extractor/run.js",
  workerExport: "runIndexedFastaRegionExtractor",
  options: [
    ...makeFastaSourceInputOptions(),
    {
      id: "rangeText",
      type: "textarea",
      label: "Regions",
      rows: 5,
      defaultValue: "chr1:5-24 demo_chr1_region\nchr2\t3\t18\tsecond_region",
      help: "Enter one region per line as seqid:start-end or tab-separated seqid, start, end, optional title. Coordinates are 1-based inclusive. For pasted FASTA, seqid matches the first FASTA title word or a title without spaces."
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "select",
          label: "Output format",
          defaultValue: "fasta",
          choices: [
            { value: "fasta", label: "Extracted FASTA" },
            { value: "table-tsv", label: "Region table" },
            { value: "interactive-viewer", label: "DNA region viewer" },
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
          id: "maxBasesPerRegion",
          type: "number",
          label: "Maximum bases per region",
          defaultValue: 1000000,
          min: 1,
          step: 1000,
          help: "Indexed regions longer than this cap are skipped with a warning before SMS3 reads sequence from the FASTA bundle."
        }
      ]
    },
    {
      id: "indexedFastaNote",
      type: "note",
      text: `Paste/upload mode scans loaded FASTA records. ${INDEXED_FASTA_BUNDLE_NOTE}`
    }
  ]
};
