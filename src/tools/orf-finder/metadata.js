import { geneticCodes } from "../../core/genetic-code.js";
import { orfTableColumns } from "./run.js";

export const orfFinderMetadata = {
  id: "orf-finder",
  name: "ORF Finder",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "ORF", "genetic code", "translation"],
  summary:
    "Find open reading frames on forward and reverse-complement strands with selectable genetic codes and length filters.",
  inputType: "DNA/RNA sequence",
  outputType: "ORF report, table, FASTA, overview, or linear DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/orf-finder/run.js",
  workerExport: "runOrfFinderWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "tsv", kind: "text", mediaType: "text/tab-separated-values" },
      { id: "table", kind: "table", schema: "orf-finder", columns: orfTableColumns },
      { id: "nucleotideFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "proteinFasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "orfRecords", kind: "orf-records", schema: "orf-finder" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "strand",
      type: "radio",
      label: "Strand",
      help: "Reverse-complement hits are reported using coordinates on the original submitted sequence.",
      defaultValue: "both",
      choices: [
        { value: "both", label: "Both strands" },
        { value: "forward", label: "Forward only" },
        { value: "reverse", label: "Reverse complement only" }
      ]
    },
    {
      id: "startMode",
      type: "radio",
      label: "ORF start",
      help: "Require start codon looks for ORFs that begin with a start codon in the selected genetic code. Any codon to stop reports every stop-delimited coding segment.",
      defaultValue: "start-codon",
      choices: [
        { value: "start-codon", label: "Require start codon" },
        { value: "any-codon", label: "Any codon to stop" }
      ]
    },
    {
      id: "geneticCode",
      type: "radio",
      label: "Genetic code",
      help: "Selects the codon table used to identify start codons, stop codons, and translated amino acids.",
      defaultValue: "1",
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` }))
    },
    {
      id: "minimumAminoAcids",
      type: "number",
      label: "Minimum amino acids",
      help: "Filters ORFs by translated protein length. Terminal stop symbols are not counted as amino acids.",
      defaultValue: 30,
      min: 1,
      max: 1000000
    },
    { id: "includePartial", type: "checkbox", label: "Include ORFs without terminal stop", defaultValue: true, help: "Reports ORFs that reach the sequence end before a stop codon is found." },
    {
      id: "nestedMode",
      type: "radio",
      label: "Nested ORFs",
      help: "When several start codons occur before the same stop codon, choose whether to report only the first start or every possible nested ORF.",
      defaultValue: "first-start",
      choices: [
        { value: "first-start", label: "First start codon per stop region" },
        { value: "all-starts", label: "All start codons to the next stop" }
      ]
    },
    {
      id: "sortBy",
      type: "radio",
      label: "Sort ORFs",
      help: "Changes the displayed ORF order and ORF numbering in reports, tables, FASTA, maps, and viewers. Coordinates and ORF sequences are not recalculated.",
      defaultValue: "start",
      choices: [
        { value: "start", label: "Start coordinate" },
        { value: "length-desc", label: "Length descending" },
        { value: "frame", label: "Strand/frame then start" },
        { value: "complete", label: "Complete ORFs first" }
      ]
    },
    { id: "includeStopInProtein", type: "checkbox", label: "Include stop symbol in protein FASTA", defaultValue: false, visibleWhen: { option: "outputFormat", value: "protein-fasta" }, help: "Adds an asterisk at the end of complete translated ORFs in protein FASTA output." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "report",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Table" },
        { value: "nucleotide-fasta", label: "Nucleotide FASTA" },
        { value: "protein-fasta", label: "Protein FASTA" },
        { value: "svg-overview", label: "ORF overview plot" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is cleaned to DNA/RNA IUPAC symbols before ORFs are found. Ambiguous codons are translated as X and do not count as starts or stops."
    }
  ]
};
