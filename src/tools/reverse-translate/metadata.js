import { listCodonUsageReferences } from "../../core/codon-reference.js";
import { geneticCodes } from "../../core/genetic-code.js";
import { reverseTranslateTableColumns } from "../../core/reverse-translate.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

const referenceChoices = listCodonUsageReferences(codonUsageReferences).map((reference) => ({
  value: reference.id,
  label: reference.name
}));
const defaultReferenceId =
  referenceChoices.find((reference) => reference.value === "ecoli-k12-mg1655-refseq")?.value ??
  referenceChoices[0]?.value ??
  "";

export const reverseTranslateMetadata = {
  id: "reverse-translate",
  name: "Reverse Translate",
  category: "Sequence Analysis",
  tags: ["DNA", "protein", "raw", "codon", "translation", "reference data"],
  summary: "Reverse translate protein sequences to DNA using bundled codon usage references or degenerate IUPAC codons.",
  inputType: "Protein sequence",
  outputType: "DNA FASTA, codon choice table, codon base probability plot, summary report",
  runInWorker: true,
  workerModule: "../tools/reverse-translate/run.js",
  workerExport: "runReverseTranslate",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "proteinRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "dnaRecords", kind: "sequence-records", alphabet: "dna-rna", schema: "reverse-translated-dna-records" },
      { id: "table", kind: "table", schema: "reverse-translate", columns: reverseTranslateTableColumns },
      { id: "plot", kind: "text", mediaType: "image/svg+xml", label: "Codon base probability plot" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "mode",
      label: "Codon choice method",
      type: "radio",
      defaultValue: "most-likely",
      choices: [
        { value: "most-likely", label: "Most likely codons from reference" },
        { value: "degenerate", label: "Degenerate IUPAC codons" }
      ],
      help: "Reference mode chooses one codon per residue from the selected codon usage reference. Degenerate mode encodes all possible codons from the selected genetic code using IUPAC ambiguity symbols."
    },
    {
      id: "referenceId",
      label: "Codon usage reference",
      type: "select",
      defaultValue: defaultReferenceId,
      choices: referenceChoices,
      visibleWhen: { option: "mode", value: "most-likely" },
      help: "Used in reference mode. Codons are ranked by within-family reference fraction, then per-1000 value, then genetic-code order. The selected reference also supplies its genetic code."
    },
    {
      id: "geneticCode",
      label: "Genetic code",
      type: "select",
      defaultValue: "1",
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` })),
      visibleWhen: { option: "mode", value: "degenerate" },
      help: "Used in degenerate mode to determine the codons that belong to each amino acid."
    },
    {
      id: "outputFormat",
      label: "Output format",
      type: "radio",
      defaultValue: "fasta",
      choices: [
        { value: "fasta", label: "Reverse-translated DNA FASTA" },
        { value: "plot", label: "Codon base probability plot" },
        { value: "tsv", label: "Codon choice table" },
        { value: "report", label: "Summary report" }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      visibleWhen: { option: "outputFormat", value: "plot" },
      options: [
        {
          id: "plotResiduesPerRow",
          type: "number",
          label: "Residues per plot row",
          defaultValue: 60,
          min: 20,
          max: 160,
          step: 10,
          help: "Wraps each protein record across multiple plot rows so longer sequences remain readable."
        },
        {
          id: "plotMaxResidues",
          type: "number",
          label: "Maximum plotted residues per record",
          defaultValue: 1000,
          min: 10,
          max: 5000,
          step: 50,
          help: "Safety cap for very large proteins. The plot wraps rows before this cap is reached."
        }
      ]
    },
    {
      id: "note",
      type: "note",
      text: "Reverse translation is a deterministic construction, not a unique biological inference. FASTA titles and tables include the codon-choice policy and reference provenance."
    }
  ]
};
