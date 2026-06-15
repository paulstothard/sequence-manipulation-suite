import { gffGtfFeatureColumns } from "../../core/gff-gtf-feature-extractor.js";

export const gffGtfFeatureExtractorMetadata = {
  id: "gff-gtf-feature-extractor",
  name: "GFF/GTF Feature Extractor",
  category: "Annotated Records & Features",
  tags: ["DNA", "RNA", "protein", "FASTA", "annotation", "coordinates", "format conversion", "translation"],
  summary: "Extract feature tables, transcript FASTA, CDS FASTA, protein FASTA, and normalized GFF3 from GFF3 or GTF annotation plus matching FASTA.",
  inputType: "GFF3 or GTF annotation plus matching FASTA",
  outputType: "Feature table, transcript FASTA, CDS FASTA, protein FASTA, normalized GFF3, or summary report",
  runtime: {
    browserBioWasm: { required: true, tool: "gffread" }
  },
  splitInput: {
    separator: "##FASTA",
    panels: [
      {
        id: "annotation",
        label: "Annotation",
        dropLabel: "Drop GFF3 or GTF annotation here",
        accept: ".gff,.gff3,.gtf,.txt",
        placeholder: "Paste GFF3 or GTF annotation rows here."
      },
      {
        id: "fasta",
        label: "Matching FASTA",
        dropLabel: "Drop matching FASTA records here",
        accept: ".fa,.fasta,.fna,.ffn,.txt",
        placeholder: "Paste the matching genome or transcript FASTA records here. Sequence record names must match the annotation seqid column."
      }
    ]
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "gff-gtf-features", columns: gffGtfFeatureColumns, label: "Feature table" },
      { id: "transcriptFasta", kind: "text", mediaType: "text/plain", label: "Transcript FASTA" },
      { id: "cdsFasta", kind: "text", mediaType: "text/plain", label: "CDS DNA/RNA FASTA" },
      { id: "proteinFasta", kind: "text", mediaType: "text/plain", label: "Protein FASTA" },
      { id: "gff3", kind: "text", mediaType: "text/plain", label: "Normalized GFF3" },
      { id: "report", kind: "text", mediaType: "text/plain", label: "Summary report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/gff-gtf-feature-extractor/run.js",
  workerExport: "runGffGtfFeatureExtractor",
  options: [
    {
      type: "group",
      label: "Input",
      options: [
        {
          id: "inputFormat",
          type: "select",
          label: "Annotation format",
          defaultValue: "auto",
          choices: [
            { value: "auto", label: "Auto detect" },
            { value: "gff3", label: "GFF3" },
            { value: "gtf", label: "GTF" }
          ]
        },
        {
          id: "featureTypes",
          type: "text",
          label: "Feature types to include",
          defaultValue: "",
          placeholder: "Optional, e.g. gene,mRNA,exon,CDS",
          help: "Leave blank to include all annotation rows in the feature table and normalized GFF3 output. FASTA extraction still uses transcript, exon, and CDS rows."
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
          label: "Output format",
          defaultValue: "feature-table",
          choices: [
            { value: "feature-table", label: "Feature table" },
            { value: "transcript-fasta", label: "Transcript FASTA" },
            { value: "cds-fasta", label: "CDS DNA/RNA FASTA" },
            { value: "protein-fasta", label: "Protein FASTA" },
            { value: "gff3", label: "Normalized GFF3" },
            { value: "report", label: "Summary report" }
          ]
        }
      ]
    },
    {
      id: "limits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "maxFeatures",
          type: "number",
          label: "Maximum parsed features",
          defaultValue: 50000,
          min: 1,
          max: 1000000
        },
        {
          id: "maxOutputRecords",
          type: "number",
          label: "Maximum FASTA output records",
          defaultValue: 5000,
          min: 1,
          max: 1000000
        },
        {
          id: "maxInputBases",
          type: "number",
          label: "Maximum input characters",
          defaultValue: 20000000,
          min: 1000,
          max: 2000000000
        }
      ]
    },
    {
      id: "methodsAndCitations",
      type: "note",
      text: "Uses local gffread for GFF3/GTF normalization and sequence extraction. Feature coordinates are reported as 1-based inclusive."
    }
  ]
};
