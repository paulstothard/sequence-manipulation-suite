import { geneticCodes } from "../../core/genetic-code.js";
import { sequenceEditorSummaryColumns } from "../../core/sequence-editor.js";

const sequenceEditorSplitInput = {
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
      placeholder: "Paste the matching FASTA sequence here when editing GFF3 + FASTA, GTF + FASTA, or BED + FASTA. Leave this empty for flatfile formats that already contain sequence."
    }
  ]
};

export const sequenceEditorMetadata = {
  id: "sequence-editor",
  name: "Sequence Editor",
  category: "Viewers & Figures",
  tags: ["DNA", "RNA", "raw", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "annotation", "coordinates", "map", "translation"],
  summary: "Load DNA/RNA sequences or annotated nucleotide records into an interactive editor with synchronized coordinates, translations, feature tracks, restriction-site feedback, search, range tools, undo/redo, and FASTA export.",
  whenToUse: "Use this when you want to inspect and edit one DNA/RNA sequence after loading it through the standard SMS3 input workflow.",
  inputType: "Plain-text DNA/RNA sequence, FASTA records, GenBank/DDBJ or EMBL nucleotide flatfile records, GFF3+FASTA, GTF+FASTA, or BED+FASTA",
  outputType: "Live sequence editor or summary report",
  splitInput: sequenceEditorSplitInput,
  runInWorker: true,
  workerModule: "../tools/sequence-editor/run.js",
  workerExport: "runSequenceEditor",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "summaryTable", kind: "table", schema: "sequence-editor-summary", columns: sequenceEditorSummaryColumns },
      { id: "cleanedRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "sequence-editor-cleaned-records" },
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
          label: "Input format",
          defaultValue: "sequence",
          choices: [
            { value: "sequence", label: "Plain text DNA/RNA or FASTA" },
            { value: "auto", label: "Auto detect annotated record" },
            { value: "genbank", label: "GenBank flatfile" },
            { value: "ddbj", label: "DDBJ flatfile" },
            { value: "embl", label: "EMBL flatfile" },
            { value: "gff3-fasta", label: "GFF3 + FASTA" },
            { value: "gtf-fasta", label: "GTF + FASTA" },
            { value: "bed-fasta", label: "BED + FASTA" }
          ],
          help: "Plain text and FASTA inputs open without annotation tracks. For GFF3 + FASTA, GTF + FASTA, or BED + FASTA, paste annotation rows in the first box and the matching FASTA sequence in the second box."
        }
      ]
    },
    {
      type: "group",
      label: "Editor",
      options: [
        {
          id: "geneticCode",
          type: "select",
          label: "Genetic code",
          defaultValue: "1",
          choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` })),
          help: "Used by the live viewer when translating displayed frames."
        },
        {
          id: "viewerLayout",
          type: "radio",
          label: "Viewer layout",
          defaultValue: "linear",
          choices: [
            { value: "linear", label: "Linear" },
            { value: "circular", label: "Circular" }
          ],
          help: "Controls the live editor viewer and viewer JSON output. It does not change the underlying sequence text."
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
          defaultValue: "editor",
          choices: [
            { value: "editor", label: "Sequence editor" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    }
  ]
};
