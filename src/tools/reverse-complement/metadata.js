export const reverseComplementMetadata = {
  id: "reverse-complement",
  name: "Reverse Complement",
  category: "Sequence Utilities",
  tags: ["DNA", "RNA", "raw", "FASTA", "format conversion"],
  summary:
    "Reverse, complement, or reverse-complement DNA/RNA sequences while preserving ambiguous IUPAC symbols.",
  inputType: "DNA/RNA sequence",
  outputType: "DNA/RNA sequence",
  fileInput: {
    dropLabel: "Drop one plain-text DNA/RNA sequence or FASTA records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
  },
  runInWorker: true,
  workerModule: "../tools/reverse-complement/run.js",
  workerExport: "runReverseComplementWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "reverse-complement-dna-rna" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "operation",
      type: "radio",
      label: "Operation",
      help: "Reverse complement changes both order and bases. Reverse changes only order. Complement changes bases without reversing order.",
      defaultValue: "reverse-complement",
      choices: [
        { value: "reverse-complement", label: "Reverse complement" },
        { value: "reverse", label: "Reverse" },
        { value: "complement", label: "Complement" }
      ]
    },
    { id: "preserveCase", type: "checkbox", label: "Preserve input case", defaultValue: true },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is cleaned to IUPAC DNA/RNA characters before output is generated."
    }
  ]
};
