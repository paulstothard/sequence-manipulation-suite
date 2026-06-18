import { flatfileFeatureColumns } from "../../core/flatfile-records.js";

function makeBaseWorkflowOutputs(viewerType = "dna-sequence-viewer", { includeGenomeFigure = false } = {}) {
  return [
    { id: "primary", kind: "text", mediaType: "text/plain" },
    { id: "report", kind: "text", mediaType: "text/plain" },
    { id: "textMap", kind: "text", mediaType: "text/plain" },
    { id: "overview", kind: "text", mediaType: "image/svg+xml", label: "Feature map" },
    { id: "viewer", kind: "viewer", viewerType },
    ...(includeGenomeFigure ? [{ id: "figure", kind: "figure", figureType: "genome-figure", label: "Genome Figure" }] : []),
    { id: "featuresTsv", kind: "text", mediaType: "text/tab-separated-values" },
    { id: "table", kind: "table", schema: "flatfile-features", columns: flatfileFeatureColumns },
    { id: "selectedFeatureFasta", kind: "text", mediaType: "text/x-fasta", label: "Feature FASTA" },
    { id: "warnings", kind: "warnings" }
  ];
}

function makeFilterOptions({ includeStrand = true } = {}) {
  return [
    {
      id: "featureFilter",
      type: "text",
      label: "Feature types",
      help: "Optional comma-separated feature keys for the table, maps, Genome Figure, and feature FASTA export, for example CDS,gene,tRNA or CHAIN,DOMAIN,SITE. Leave blank to include all parsed features.",
      defaultValue: ""
    },
    ...(includeStrand ? [{
      id: "strandFilter",
      type: "select",
      label: "Feature strand",
      defaultValue: "all",
      choices: [
        { value: "all", label: "Both strands / not applicable" },
        { value: "+", label: "Forward only" },
        { value: "-", label: "Reverse only" }
      ]
    }] : []),
    {
      id: "coordinateStart",
      type: "number",
      label: "Feature range start",
      help: "Optional 1-based coordinate start. Features overlapping the selected coordinate range are kept.",
      min: 1,
      defaultValue: ""
    },
    {
      id: "coordinateEnd",
      type: "number",
      label: "Feature range end",
      help: "Optional 1-based coordinate end. Features overlapping the selected coordinate range are kept.",
      min: 1,
      defaultValue: ""
    },
    {
      id: "qualifierName",
      type: "text",
      label: "Qualifier name",
      help: "Optional qualifier key that must be present, for example gene, product, note, locus_tag, protein_id, or db_xref.",
      defaultValue: ""
    },
    {
      id: "qualifierValue",
      type: "text",
      label: "Qualifier contains",
      help: "Optional case-insensitive text that must occur in the selected qualifier, or in any qualifier when no qualifier name is supplied.",
      defaultValue: ""
    },
    {
      id: "featureText",
      type: "text",
      label: "Feature text contains",
      help: "Optional case-insensitive search across feature key, location, gene, locus tag, product, note, function, bound moiety, protein id, and qualifier text.",
      defaultValue: ""
    }
  ];
}

const dnaOutputFormatOption = {
  id: "outputFormat",
  type: "radio",
  label: "Output format",
  defaultValue: "features-tsv",
  choices: [
    { value: "features-tsv", label: "Feature table" },
    { value: "linear-svg-map", label: "Linear feature map" },
    { value: "circular-svg-map", label: "Circular feature map" },
    { value: "linear-genome-figure", label: "Linear genome figure" },
    { value: "circular-genome-figure", label: "Circular genome figure" },
    { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
    { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" },
    { value: "whole-fasta", label: "Whole DNA/RNA FASTA" },
    { value: "cds-fasta", label: "CDS DNA/RNA FASTA" },
    { value: "protein-fasta", label: "CDS translation FASTA" },
    { value: "selected-feature-fasta", label: "Feature FASTA" },
    { value: "cds-uppercase-fasta", label: "CDS as uppercase FASTA" },
    { value: "gene-uppercase-fasta", label: "Gene as uppercase FASTA" },
    { value: "text-map", label: "Feature text map" },
    { value: "report", label: "Summary report" }
  ]
};

const proteinOutputFormatOption = {
  id: "outputFormat",
  type: "radio",
  label: "Output format",
  defaultValue: "features-tsv",
  choices: [
    { value: "features-tsv", label: "Feature table" },
    { value: "linear-svg-map", label: "Linear protein feature map" },
    { value: "interactive-viewer", label: "Protein sequence viewer" },
    { value: "protein-fasta", label: "Whole protein FASTA" },
    { value: "selected-feature-fasta", label: "Feature FASTA" },
    { value: "text-map", label: "Feature text map" },
    { value: "report", label: "Summary report" }
  ]
};

export const annotatedDnaRecordExtractorMetadata = {
  id: "annotated-dna-record-extractor",
  name: "Annotated DNA Record Extractor",
  category: "Annotated Records & Features",
  tags: ["DNA", "RNA", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "annotation", "coordinates", "format conversion", "map", "translation"],
  summary: "Extract nucleotide feature tables, maps, whole sequences, CDS DNA/RNA, and CDS translations from GenBank/DDBJ, EMBL, GFF3+FASTA, GTF+FASTA, or BED+FASTA records.",
  inputType: "GenBank/DDBJ or EMBL nucleotide flatfile records, GFF3+FASTA, GTF+FASTA, or BED+FASTA",
  outputType: "Feature table, linear or circular nucleotide feature map, editable genome figure, linear DNA sequence viewer, extracted FASTA, report",
  splitInput: {
    separator: "##FASTA",
    panels: [
      {
        id: "annotation",
        label: "Annotated flatfile record or annotation rows",
        dropLabel: "Drop GenBank, DDBJ, EMBL records, GFF3/GTF rows, or BED rows here",
        accept: ".gb,.gbk,.genbank,.embl,.ddbj,.txt,.gff,.gff3,.gtf,.bed",
        placeholder: "Paste a GenBank, DDBJ, EMBL, GFF3, GTF, or BED record here. For paired GFF3 + FASTA, GTF + FASTA, or BED + FASTA, put only the annotation rows in this box."
      },
      {
        id: "fasta",
        label: "FASTA sequence for GFF3/GTF/BED pairs",
        dropLabel: "Drop matching FASTA for GFF3, GTF, or BED here",
        accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt",
        placeholder: "Paste the matching FASTA sequence here when extracting from GFF3 + FASTA, GTF + FASTA, or BED + FASTA. Leave this empty for flatfile formats that already contain sequence."
      }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/record-parser-extractor/run.js",
  workerExport: "runAnnotatedDnaRecordExtractorWorker",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      ...makeBaseWorkflowOutputs("dna-sequence-viewer", { includeGenomeFigure: true }),
      { id: "wholeSequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "flatfile-whole-sequences" },
      { id: "cdsSequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "flatfile-cds-sequences" },
      { id: "proteinRecords", kind: "sequence-records", alphabet: "protein", schema: "flatfile-protein-sequences" },
      { id: "wholeFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "cdsFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "proteinFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "cdsContextFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "geneContextFasta", kind: "text", mediaType: "text/x-fasta" }
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
          label: "Input format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "genbank", label: "GenBank flatfile" },
            { value: "ddbj", label: "DDBJ flatfile" },
            { value: "embl", label: "EMBL flatfile" },
            { value: "gff3-fasta", label: "GFF3 + FASTA" },
            { value: "gtf-fasta", label: "GTF + FASTA" },
            { value: "bed-fasta", label: "BED + FASTA" }
          ],
          help: "For GFF3 + FASTA, GTF + FASTA, or BED + FASTA, paste annotation rows in the first box and the matching FASTA sequence in the second box. GFF3/GTF coordinates are interpreted as 1-based inclusive; BED coordinates are interpreted as 0-based half-open."
        }
      ]
    },
    ...makeFilterOptions(),
    {
      id: "contextFlankLength",
      type: "number",
      label: "Context flank bases",
      help: "Number of upstream/downstream bases to include for CDS-as-uppercase or gene-as-uppercase outputs.",
      min: 0,
      max: 5000,
      defaultValue: 30,
      visibleWhen: { option: "outputFormat", value: ["cds-uppercase-fasta", "gene-uppercase-fasta"] }
    },
    dnaOutputFormatOption
  ]
};

export const annotatedProteinRecordExtractorMetadata = {
  id: "annotated-protein-record-extractor",
  name: "Annotated Protein Record Extractor",
  category: "Annotated Records & Features",
  tags: ["protein", "FASTA", "GenPept", "UniProt", "annotation", "coordinates", "format conversion", "map"],
  summary: "Extract residue-coordinate feature tables, maps, whole proteins, and feature sequences from UniProt or GenPept flatfile records.",
  inputType: "UniProt or GenPept protein flatfile records",
  outputType: "Protein feature table, linear protein map, protein sequence viewer, extracted FASTA, report",
  runInWorker: true,
  workerModule: "../tools/record-parser-extractor/run.js",
  workerExport: "runAnnotatedProteinRecordExtractorWorker",
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      ...makeBaseWorkflowOutputs("protein-sequence-viewer"),
      { id: "proteinRecords", kind: "sequence-records", alphabet: "protein", schema: "flatfile-protein-sequences" },
      { id: "proteinFasta", kind: "text", mediaType: "text/x-fasta" }
    ]
  },
  options: [
    ...makeFilterOptions({ includeStrand: false }),
    proteinOutputFormatOption
  ]
};

export const recordParserExtractorMetadata = annotatedDnaRecordExtractorMetadata;
