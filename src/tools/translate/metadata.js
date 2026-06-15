import { geneticCodes } from "../../core/genetic-code.js";
import { translationTableColumns } from "./run.js";

export const translateMetadata = {
  id: "translate",
  name: "Translate DNA/RNA",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "protein", "raw", "genetic code", "translation"],
  summary:
    "Translate DNA/RNA sequences using selectable NCBI genetic codes and forward or reverse reading frames.",
  inputType: "DNA/RNA sequence",
  outputType: "Protein sequence",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "translate-dna-rna", columns: translationTableColumns },
      { id: "translations", kind: "table", schema: "translate-dna-rna", columns: translationTableColumns },
      { id: "proteinRecords", kind: "sequence-records", alphabet: "protein", schema: "translated-protein-records" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/translate/run.js",
  workerExport: "runTranslateWorker",
  options: [
    {
      type: "group",
      label: "Translation",
      options: [
        {
          id: "frame",
          type: "radio",
          label: "Reading frame",
          help: "Frame 1 starts at the first base, frame 2 at the second, and frame 3 at the third. Reverse frames translate the reverse complement. Uppercase text translates only uppercase DNA/RNA letters.",
          defaultValue: "1",
          choices: [
            { value: "1", label: "Forward frame 1" },
            { value: "2", label: "Forward frame 2" },
            { value: "3", label: "Forward frame 3" },
            { value: "uppercase", label: "Uppercase text" },
            { value: "all-forward", label: "All forward frames" },
            { value: "all-reverse", label: "All reverse-complement frames" },
            { value: "all-six", label: "All six frames" }
          ]
        },
        {
          id: "geneticCode",
          type: "radio",
          label: "Genetic code",
          help: "Selects the codon table used to translate codons and identify stop codons.",
          defaultValue: "1",
          choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
        }
      ]
    },
    {
      type: "group",
      label: "Output",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: "fasta",
          choices: [
            { value: "fasta", label: "Protein FASTA" },
            { value: "plain", label: "Plain protein text" },
            { value: "tsv", label: "Translation table" },
            { value: "text-map", label: "Text annotation map" }
          ]
        }
      ]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is cleaned to DNA/RNA IUPAC symbols before translation. Ambiguous codons translate as X."
    }
  ]
};
