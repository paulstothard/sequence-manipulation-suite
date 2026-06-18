import { bedColumns, gff3Columns } from "../../core/biological-record-format-converter.js";
import { flatfileFeatureColumns } from "../../core/flatfile-records.js";

export const biologicalRecordFormatConverterMetadata = {
  id: "biological-record-format-converter",
  name: "Biological Record Format Converter",
  category: "Annotated Records & Features",
  tags: ["DNA", "RNA", "protein", "FASTA", "BED", "GFF", "GTF", "GenBank", "EMBL", "DDBJ", "UniProt", "annotation", "format conversion"],
  summary: "Convert GenBank, DDBJ, EMBL, GenPept, UniProt, GFF3+FASTA, GTF+FASTA, and BED+FASTA records into sequence, table, flatfile, interval, and viewer-ready outputs.",
  inputType: "GenBank, DDBJ, EMBL, GenPept, UniProt, GFF3+FASTA, GTF+FASTA, or BED+FASTA text",
  outputType: "FASTA, feature table, GenBank, EMBL, DDBJ, GFF3, BED, paired annotation+FASTA, or viewer data",
  splitInput: {
    separator: "##FASTA",
    panels: [
      {
        id: "annotation",
        label: "Flatfile record or annotation rows",
        dropLabel: "Drop GenBank, DDBJ, EMBL, GenPept, UniProt records, GFF3/GTF rows, or BED rows here",
        accept: ".gb,.gbk,.genbank,.embl,.ddbj,.gp,.gpep,.uniprot,.txt,.gff,.gff3,.gtf,.bed",
        placeholder: "Paste a GenBank, DDBJ, EMBL, GenPept, UniProt, GFF3, GTF, or BED record here. For paired GFF3 + FASTA, GTF + FASTA, or BED + FASTA, put only the annotation rows in this box."
      },
      {
        id: "fasta",
        label: "FASTA sequence for GFF3/GTF/BED pairs",
        dropLabel: "Drop matching FASTA for GFF3, GTF, or BED here",
        accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt",
        placeholder: "Paste the matching FASTA sequence here when converting GFF3 + FASTA, GTF + FASTA, or BED + FASTA. Leave this empty for flatfile formats that already contain sequence."
      }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "featureTable", kind: "table", schema: "flatfile-features", columns: flatfileFeatureColumns },
      { id: "gff3Table", kind: "table", schema: "gff3-like", columns: gff3Columns },
      { id: "bedTable", kind: "table", schema: "bed-like", columns: bedColumns },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/biological-record-format-converter/run.js",
  workerExport: "runBiologicalRecordFormatConverter",
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
            { value: "genpept", label: "GenPept flatfile" },
            { value: "uniprot", label: "UniProt flatfile" },
            { value: "gff3-fasta", label: "GFF3 + FASTA" },
            { value: "gtf-fasta", label: "GTF + FASTA" },
            { value: "bed-fasta", label: "BED + FASTA" }
          ],
          help: "For GFF3 + FASTA, GTF + FASTA, or BED + FASTA, paste annotation rows in the first box and the matching FASTA sequence in the second box. GFF3/GTF coordinates are interpreted as 1-based inclusive; BED coordinates are interpreted as 0-based half-open."
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
          defaultValue: "feature-tsv",
          choices: [
            { value: "whole-fasta", label: "Whole DNA/RNA FASTA" },
            { value: "cds-fasta", label: "CDS DNA/RNA FASTA" },
            { value: "protein-fasta", label: "Protein FASTA" },
            { value: "feature-tsv", label: "Feature table" },
            { value: "gff3", label: "GFF3-like feature rows" },
            { value: "gff3-bundle", label: "GFF3 + FASTA bundle" },
            { value: "genbank", label: "GenBank flatfile" },
            { value: "embl", label: "EMBL flatfile" },
            { value: "ddbj", label: "DDBJ-style flatfile" },
            { value: "bed", label: "BED-like interval rows" },
            { value: "bed-bundle", label: "BED + FASTA bundle" },
            { value: "report", label: "Summary report" }
          ],
          help: "Reconstructed flatfiles, GFF3, and BED are useful exchange formats, but they can lose unsupported qualifiers, references, fuzzy-location detail, dates, and some protein-feature semantics."
        }
      ]
    }
  ]
};
