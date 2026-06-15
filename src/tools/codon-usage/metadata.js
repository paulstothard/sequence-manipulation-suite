import { geneticCodes } from "../../core/genetic-code.js";
import { codonUsageTableColumns } from "./run.js";

export const codonUsageMetadata = {
  id: "codon-usage",
  name: "Codon Usage",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "FASTA", "codon", "statistics", "translation"],
  summary:
    "Calculate observed codon usage for coding DNA/RNA sequences using complete codons from the first base.",
  inputType: "Coding DNA/RNA sequence or FASTA records",
  outputType: "Codon usage table, plot, or summary report",
  fileInput: {
    dropLabel: "Drop one plain-text coding DNA/RNA sequence or FASTA records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
  },
  runInWorker: true,
  workerModule: "../tools/codon-usage/run.js",
  workerExport: "runCodonUsageWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" },
      { id: "orfRecords", kind: "orf-records", schema: "orf-finder" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "codon-usage", columns: codonUsageTableColumns },
      { id: "plot", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "geneticCode",
      type: "radio",
      label: "Genetic code",
      help: "Selects the codon table used to assign codons to amino acids and identify stop codons.",
      defaultValue: "1",
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
    },
    {
      id: "plotValue",
      type: "radio",
      label: "Plot value",
      help: "Choose whether bar height shows raw counts, codons per 1000 counted codons, or fraction within synonymous codons for each amino acid.",
      defaultValue: "count",
      choices: [
        { value: "count", label: "Count" },
        { value: "per_1000", label: "Per 1000" },
        { value: "fraction", label: "Fraction" }
      ],
      visibleWhen: { option: "outputFormat", value: "plot" }
    },
    {
      id: "showLegend",
      type: "checkbox",
      label: "Show plot legend",
      defaultValue: true,
      visibleWhen: { option: "outputFormat", value: "plot" }
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "table",
      choices: [
        { value: "table", label: "Codon usage table" },
        { value: "plot", label: "Codon usage plot" },
        { value: "report", label: "Summary report" }
      ]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is treated as coding sequence starting at the first base. Stop codons are counted, ambiguous codons are skipped, and trailing bases outside complete codons are ignored."
    }
  ]
};
