import { pseudomoleculeMappingColumns } from "../../core/pseudomolecule-builder.js";

export const pseudomoleculeBuilderMetadata = {
  id: "pseudomolecule-builder",
  name: "Pseudomolecule Builder",
  category: "Annotated Records & Features",
  tags: ["DNA", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "assembly", "annotation", "coordinates", "format conversion"],
  summary: "Join DNA records with explicit N gaps while preserving a source-to-pseudomolecule coordinate map and remapping annotations.",
  whenToUse: "Use this when downstream software needs one artificial chromosome assembled from ordered contigs, with auditable source coordinates and optional remapped annotation.",
  inputType: "DNA FASTA, GenBank/DDBJ or EMBL records, GFF3+FASTA, GTF+FASTA, or BED+FASTA",
  outputType: "Joined DNA FASTA, annotated GenBank/EMBL/DDBJ, remapped GFF3/BED bundles, record JSON, coordinate map, or report",
  splitInput: {
    separator: "##FASTA",
    panels: [
      {
        id: "annotation",
        label: "DNA records or annotation rows",
        dropLabel: "Drop DNA FASTA records, GenBank, DDBJ, EMBL records, GFF3/GTF rows, or BED rows here",
        accept: ".gb,.gbk,.genbank,.embl,.ddbj,.txt,.gff,.gff3,.gtf,.bed,.fa,.fasta,.fna,.ffn",
        placeholder: "Paste DNA FASTA, GenBank, DDBJ, EMBL, GFF3, GTF, or BED input here. For paired GFF3 + FASTA, GTF + FASTA, or BED + FASTA, put only the annotation rows in this box."
      },
      {
        id: "fasta",
        label: "Matching FASTA records for GFF3/GTF/BED pairs",
        dropLabel: "Drop matching FASTA for GFF3, GTF, or BED here",
        accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt",
        placeholder: "Paste matching FASTA here for paired GFF3, GTF, or BED input. Leave this empty for FASTA or flatfile records in the first box."
      }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/pseudomolecule-builder/run.js",
  workerExport: "runPseudomoleculeBuilder",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "genbank", kind: "text", mediaType: "text/plain" },
      { id: "embl", kind: "text", mediaType: "text/plain" },
      { id: "ddbj", kind: "text", mediaType: "text/plain" },
      { id: "gff3Bundle", kind: "text", mediaType: "text/plain" },
      { id: "bedBundle", kind: "text", mediaType: "text/plain" },
      { id: "recordJson", kind: "text", mediaType: "application/json" },
      { id: "mappingTable", kind: "table", schema: "pseudomolecule-coordinate-map", columns: pseudomoleculeMappingColumns },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "pseudomolecule-sequence" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Input",
      options: [
        {
          id: "inputFormat",
          type: "select",
          placement: "input",
          tabOnly: true,
          label: "Input format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "sequence", label: "Plain DNA or FASTA" },
            { value: "genbank", label: "GenBank flatfile" },
            { value: "ddbj", label: "DDBJ flatfile" },
            { value: "embl", label: "EMBL flatfile" },
            { value: "gff3-fasta", label: "GFF3 + FASTA" },
            { value: "gtf-fasta", label: "GTF + FASTA" },
            { value: "bed-fasta", label: "BED + FASTA" }
          ],
          help: "GFF3/GTF coordinates are read as 1-based inclusive; BED coordinates are read as 0-based half-open. Protein records are skipped."
        }
      ]
    },
    {
      type: "group",
      label: "Pseudomolecule",
      options: [
        {
          id: "pseudomoleculeName",
          type: "text",
          label: "Output sequence ID",
          defaultValue: "pseudomolecule",
          help: "The first whitespace-delimited token becomes the FASTA ID and GFF3 seqid; unsupported punctuation is replaced with underscores."
        },
        {
          id: "recordOrder",
          type: "select",
          label: "Sequence order",
          defaultValue: "input",
          choices: [
            { value: "input", label: "Input order" },
            { value: "length-desc", label: "Length, longest first" },
            { value: "name", label: "Name" }
          ]
        },
        {
          id: "gapLength",
          type: "number",
          label: "N bases between sequences",
          defaultValue: 100,
          min: 0,
          max: 1000000,
          step: 1,
          help: "Each artificial join receives exactly this many N bases. A gap length of zero places records directly beside one another."
        },
        {
          id: "reverseComplementIds",
          type: "textarea",
          label: "Reverse-complement sequence IDs",
          defaultValue: "",
          rows: 3,
          placeholder: "Optional IDs, separated by commas or lines",
          help: "Match an accession, the first FASTA title word, or a complete title. Mapping rows record the resulting minus orientation and annotations are flipped to the opposite strand."
        },
        {
          id: "coordinateNote",
          type: "note",
          text: "The coordinate map uses 1-based inclusive source and pseudomolecule positions. Source records remain distinct in the mapping even though sequence and annotations are exported on one artificial molecule."
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "select",
          label: "Format",
          defaultValue: "fasta",
          choices: [
            { value: "fasta", label: "Joined DNA FASTA" },
            { value: "genbank", label: "Annotated GenBank flatfile" },
            { value: "embl", label: "Annotated EMBL flatfile" },
            { value: "ddbj", label: "Annotated DDBJ-style flatfile" },
            { value: "gff3-bundle", label: "Remapped GFF3 + FASTA" },
            { value: "bed-bundle", label: "Remapped BED + FASTA" },
            { value: "record-json", label: "Annotated record JSON" },
            { value: "mapping-table", label: "Coordinate mapping table" },
            { value: "report", label: "Summary report" }
          ],
          help: "GenBank, EMBL, DDBJ, GFF3, and record JSON retain remapped annotations. BED is interval-oriented and FASTA contains sequence only; the coordinate map remains the audit trail for source placement."
        }
      ]
    }
  ]
};
