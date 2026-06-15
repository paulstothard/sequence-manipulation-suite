import { genomeFigureFeatureColumns } from "../../core/genome-figure-data.js";

const genomeFigureTags = ["DNA", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "annotation", "coordinates", "map", "plot"];

const genomeFigureSplitInput = {
  separator: "##FASTA",
  panels: [
    {
      id: "annotation",
      label: "Annotated flatfile record or annotation rows",
      dropLabel: "Drop GenBank, DDBJ, EMBL, GFF3, GTF, BED, or FASTA record here",
      accept: ".gb,.gbk,.genbank,.embl,.ddbj,.txt,.gff,.gff3,.gtf,.bed,.fa,.fasta,.fna,.ffn",
      placeholder: "Paste a GenBank, DDBJ, EMBL, GFF3, GTF, BED, or FASTA record here. For paired GFF3 + FASTA, GTF + FASTA, or BED + FASTA, put only the annotation rows in this box."
    },
    {
      id: "fasta",
      label: "FASTA sequence for GFF3/GTF/BED pairs",
      dropLabel: "Drop matching FASTA for GFF3, GTF, or BED here",
      accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt",
      placeholder: "Paste the matching FASTA sequence here when drawing GFF3 + FASTA, GTF + FASTA, or BED + FASTA. Leave this empty for flatfile formats that already contain sequence."
    }
  ]
};

const genomeFigureWorkflow = {
  inputs: [
    { id: "input", kind: "text", mediaType: "text/plain" },
    { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
  ],
  outputs: [
    { id: "primary", kind: "text", mediaType: "text/plain" },
    { id: "report", kind: "text", mediaType: "text/plain" },
    { id: "figure", kind: "figure", figureType: "genome-figure" },
    { id: "table", kind: "table", schema: "genome-figure-features", columns: genomeFigureFeatureColumns },
    { id: "warnings", kind: "warnings" }
  ]
};

const inputOptionsGroup = {
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
        { value: "sequence", label: "Plain sequence or FASTA" },
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
};

function makeOutputFormatOption(defaultValue, figureLabel, includeBothLayouts = false) {
  const layoutChoices = includeBothLayouts
    ? [
        { value: "circular", label: "Circular genome figure" },
        { value: "linear", label: "Wrapped linear genome figure" }
      ]
    : [{ value: defaultValue, label: figureLabel }];
  return {
    id: "outputFormat",
    type: "radio",
    label: "Output format",
    defaultValue,
    choices: [
      ...layoutChoices,
      { value: "report", label: "Summary report" }
    ]
  };
}

function makeGenomeFigureMetadata({
  id,
  name,
  summary,
  whenToUse,
  outputType,
  defaultOutputFormat,
  outputLabel,
  includeBothLayouts = false,
  hiddenFromToolList = false
}) {
  return {
    id,
    name,
    category: "Viewers & Figures",
    tags: genomeFigureTags,
    summary,
    whenToUse,
    inputType: "GenBank/DDBJ or EMBL nucleotide flatfile records, GFF3+FASTA, GTF+FASTA, BED+FASTA, or FASTA sequence",
    outputType,
    splitInput: genomeFigureSplitInput,
    runInWorker: true,
    workerModule: "../tools/genome-figure/run.js",
    workerExport: "runGenomeFigure",
    workflow: genomeFigureWorkflow,
    hiddenFromToolList,
    options: [
      inputOptionsGroup,
      makeOutputFormatOption(defaultOutputFormat, outputLabel, includeBothLayouts)
    ]
  };
}

export const circularGenomeFigureMetadata = makeGenomeFigureMetadata({
  id: "circular-genome-figure",
  name: "Circular Genome Figure",
  summary: "Create editable publication-style circular genome figures from annotated DNA records, paired annotation inputs, or FASTA sequences.",
  whenToUse: "Use this when you want a publication-style circular map for a plasmid, viral genome, organellar genome, or other circular DNA record.",
  outputType: "Editable circular genome figure or summary report",
  defaultOutputFormat: "circular",
  outputLabel: "Circular genome figure"
});

export const linearGenomeFigureMetadata = makeGenomeFigureMetadata({
  id: "linear-genome-figure",
  name: "Linear Genome Figure",
  summary: "Create editable publication-style wrapped linear genome figures from annotated DNA records, paired annotation inputs, or FASTA sequences.",
  whenToUse: "Use this when you want a publication-style wrapped linear map for a chromosome, contig set, or selected sequence region.",
  outputType: "Editable wrapped linear genome figure or summary report",
  defaultOutputFormat: "linear",
  outputLabel: "Wrapped linear genome figure"
});

export const genomeFigureMetadata = makeGenomeFigureMetadata({
  id: "genome-figure",
  name: "Genome Figure",
  summary: "Create editable publication-style circular or wrapped linear genome figures from annotated DNA records, paired annotation inputs, or FASTA sequences.",
  outputType: "Editable genome figure, feature table, or summary report",
  defaultOutputFormat: "circular",
  outputLabel: "Circular genome figure",
  includeBothLayouts: true,
  hiddenFromToolList: true
});
