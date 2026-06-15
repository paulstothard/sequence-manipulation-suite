const viewerSplitInput = {
  separator: "##FASTA",
  panels: [
    {
      id: "annotation",
      label: "Sequence, annotated record, or annotation rows",
      dropLabel: "Drop one plain-text DNA/RNA sequence, FASTA records, or annotated record here",
      accept: ".gb,.gbk,.genbank,.embl,.ddbj,.txt,.fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.gff,.gff3,.gtf,.bed",
      placeholder: "Paste one plain-text DNA/RNA sequence, FASTA records, GenBank, DDBJ, EMBL, GFF3, GTF, or BED record here. For paired GFF3 + FASTA, GTF + FASTA, or BED + FASTA, put only the annotation rows in this box."
    },
    {
      id: "fasta",
      label: "FASTA sequence for GFF3/GTF/BED pairs",
      dropLabel: "Drop matching FASTA for GFF3, GTF, or BED here",
      accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt",
      placeholder: "Paste the matching FASTA sequence here when viewing GFF3 + FASTA, GTF + FASTA, or BED + FASTA. Leave this empty for flatfile formats that already contain sequence."
    }
  ]
};

const inputFormatOption = {
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
        { value: "sequence", label: "Plain text DNA/RNA or FASTA" },
        { value: "genbank", label: "GenBank flatfile" },
        { value: "ddbj", label: "DDBJ flatfile" },
        { value: "embl", label: "EMBL flatfile" },
        { value: "gff3-fasta", label: "GFF3 + FASTA" },
        { value: "gtf-fasta", label: "GTF + FASTA" },
        { value: "bed-fasta", label: "BED + FASTA" }
      ],
      help: "Plain text and FASTA inputs are shown without annotation tracks. For GFF3 + FASTA, GTF + FASTA, or BED + FASTA, paste annotation rows in the first box and the matching FASTA sequence in the second box. GFF3/GTF coordinates are interpreted as 1-based inclusive; BED coordinates are interpreted as 0-based half-open."
    }
  ]
};

function makeOutputFormatOption(viewerLabel) {
  return {
    type: "group",
    label: "Output format",
    options: [
      {
        id: "outputFormat",
        type: "radio",
        label: "Output format",
        defaultValue: "interactive-viewer",
        choices: [
          { value: "interactive-viewer", label: viewerLabel },
          { value: "report", label: "Summary report" }
        ]
      }
    ]
  };
}

function makeViewerMetadata({
  id,
  name,
  summary,
  whenToUse,
  outputType,
  viewerLabel,
  workerExport
}) {
  return {
    id,
    name,
    category: "Viewers & Figures",
    tags: ["DNA", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "annotation", "coordinates", "map", "translation"],
    summary,
    whenToUse,
    inputType: "Plain-text DNA/RNA sequence, FASTA records, GenBank/DDBJ or EMBL nucleotide flatfile records, GFF3+FASTA, GTF+FASTA, or BED+FASTA",
    outputType,
    splitInput: viewerSplitInput,
    runInWorker: true,
    workerModule: "../tools/dna-sequence-viewer/run.js",
    workerExport,
    workflow: {
      inputs: [
        { id: "input", kind: "text", mediaType: "text/plain" },
        { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
      ],
      outputs: [
        { id: "primary", kind: "text", mediaType: "text/plain" },
        { id: "report", kind: "text", mediaType: "text/plain" },
        { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
        { id: "warnings", kind: "warnings" }
      ]
    },
    options: [inputFormatOption, makeOutputFormatOption(viewerLabel)]
  };
}

export const dnaSequenceViewerMetadata = makeViewerMetadata({
  id: "dna-sequence-viewer",
  name: "Linear DNA Sequence Viewer",
  summary: "Open plain, FASTA, or annotated nucleotide records in a linear interactive viewer with coordinates, strands, reading frames, and parsed feature tracks.",
  whenToUse: "Use this when you want to inspect an unannotated sequence or annotated nucleotide record along a linear coordinate axis.",
  outputType: "Linear DNA sequence viewer or summary report",
  viewerLabel: "Linear DNA sequence viewer",
  workerExport: "runLinearDnaSequenceViewer"
});

export const circularDnaSequenceViewerMetadata = makeViewerMetadata({
  id: "circular-dna-sequence-viewer",
  name: "Circular DNA Sequence Viewer",
  summary: "Open plain, FASTA, or annotated nucleotide records in a circular interactive viewer with coordinates, strands, reading frames, and parsed feature tracks.",
  whenToUse: "Use this when you want to inspect an unannotated circular sequence, plasmid, viral genome, or other circular nucleotide record as a circular map.",
  outputType: "Circular DNA sequence viewer or summary report",
  viewerLabel: "Circular DNA sequence viewer",
  workerExport: "runCircularDnaSequenceViewer"
});
