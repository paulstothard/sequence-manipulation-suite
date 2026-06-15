export const proteinSequenceViewerMetadata = {
  id: "protein-sequence-viewer",
  name: "Protein Sequence Viewer",
  category: "Viewers & Figures",
  tags: ["protein", "raw", "FASTA", "GenPept", "UniProt", "annotation", "coordinates", "map"],
  summary: "Explore protein sequences or annotated UniProt/GenPept records in an interactive zoomable viewer with residue coordinates and feature tracks.",
  whenToUse: "Use this when you want to inspect plain protein sequences, protein FASTA records, or UniProt/GenPept residue features in an interactive coordinate viewer.",
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
