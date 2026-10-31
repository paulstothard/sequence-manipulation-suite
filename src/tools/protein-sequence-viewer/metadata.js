import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
export const proteinSequenceViewerMetadata = {
  id: "protein-sequence-viewer",
  name: "Protein Sequence Viewer",
  category: "Viewers & Figures",
  tags: ["protein", "raw", "FASTA", "GenPept", "UniProt", "annotation", "coordinates", "map"],
  summary: "Explore protein sequences from text, files, or UniProt/NCBI protein accessions in an interactive viewer with range focus, residue coordinates, and feature tracks.",
  whenToUse: "Inspect protein sequences and UniProt/GenPept residue features in an interactive coordinate viewer.",
  inputType: "Protein sequence or annotated protein flatfile",
  outputType: "Protein sequence viewer or summary report",
  fileInput: {
    dropLabel: "Drop one plain-text protein sequence, FASTA records, UniProt, or GenPept record here",
    accept: ".fa,.fasta,.faa,.fa.gz,.fasta.gz,.faa.gz,.gz,.txt,.seq,.gp,.gpep,.uniprot"
  },
  runInWorker: true,
  workerModule: "../tools/protein-sequence-viewer/run.js",
  workerExport: "runProteinSequenceViewer",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "viewer", kind: "viewer", viewerType: "protein-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    ...makeFastaSourceInputOptions({ includeIndexed: false, alphabet: "protein", allowPlainSequence: true, annotatedRecords: true, featurePolicy: "viewer" }),
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "interactive-viewer",
      choices: [
        { value: "interactive-viewer", label: "Protein sequence viewer" },
        { value: "report", label: "Summary report" }
      ]
    }
  ]
};
