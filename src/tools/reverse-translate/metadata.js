import { REVERSE_TRANSLATE_DEFAULTS as defaults, REVERSE_TRANSLATE_LIMITS as limits } from "../../core/reverse-translate-options.js";
import { listCodonUsageReferences } from "../../core/codon-reference.js";
import { geneticCodes } from "../../core/genetic-code.js";
import { reverseTranslateTableColumns } from "../../core/reverse-translate.js";
import { codonUsageReferences } from "../../reference-data/codon-usage/references.js";

const referenceChoices = listCodonUsageReferences(codonUsageReferences).map((reference) => ({
  value: reference.id,
  label: reference.name
}));
export const reverseTranslateMetadata = {
  id: "reverse-translate",
  name: "Reverse Translate",
  category: "Sequence Analysis",
  tags: ["DNA", "protein", "raw", "codon", "translation", "reference data"],
  summary: "Reverse translate protein sequences to DNA using bundled codon usage references or degenerate IUPAC codons.",
  whenToUse: "Construct candidate DNA from protein sequences for codon-reference comparisons or degenerate sequence design.",
  citations: [{ text: "NCBI Genetic Codes (https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi): ordinary codon assignments; initiation-specific recoding is not inferred." }],
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
      { id: "dnaRecords", outputFormat: "fasta", kind: "sequence-records", alphabet: "dna-rna", schema: "reverse-translated-dna-records" },
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
      defaultValue: defaults.mode,
      choices: [
        { value: "most-likely", label: "Most likely codons from reference" },
        { value: "degenerate", label: "Degenerate IUPAC codons" }
      ],
      help: "Reference mode chooses one codon per residue from the selected codon usage reference. Degenerate mode collapses candidate codons by position; the resulting IUPAC union can also encode other residues or stops."
    },
    {
      id: "referenceId",
      label: "Codon usage reference",
      type: "select",
      defaultValue: defaults.referenceId,
      choices: referenceChoices,
      visibleWhen: { option: "mode", value: "most-likely" },
      help: "Used in reference mode. Codons are ranked by within-family reference fraction, then per-1000 value, then genetic-code order. The selected reference also supplies its genetic code."
    },
    {
      id: "geneticCode",
      label: "Genetic code",
      type: "select",
      defaultValue: defaults.geneticCode,
      choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` })),
      visibleWhen: { option: "mode", value: "degenerate" },
      help: "Used in degenerate mode to determine the codons that belong to each amino acid. Probability plots use equal weights across candidate codons; they do not predict synthesis frequencies."
    },
    {
      id: "plotSettings",
      type: "group",
      label: "Plot settings",
      visibleWhen: { option: "outputFormat", value: "plot" },
      options: [
        {
          id: "plotResiduesPerRow",
          type: "number",
          label: "Residues per plot row",
          defaultValue: defaults.plotResiduesPerRow,
          min: 20,
          max: 40,
          step: 10,
          visibleWhen: { option: "outputFormat", value: "plot" },
          help: "Wraps each protein record across multiple plot rows so amino-acid and codon labels remain readable. Choose 20, 30, or 40 residues per row."
        },
        {
          id: "plotMaxResidues",
          type: "number",
          label: "Residues shown per protein record",
          defaultValue: defaults.plotMaxResidues,
          min: 10,
          max: 5000,
          step: 10,
          visibleWhen: { option: "outputFormat", value: "plot" },
          help: "Show the first N residues in the probability plot; longer records are reported as truncated."
        }
      ]
    },
    {
      id: "outputFormat",
      label: "Output format",
      type: "radio",
      defaultValue: defaults.outputFormat,
      choices: [
        { showcase: false, value: "fasta", label: "Reverse-translated DNA FASTA" },
        { showcase: "codon-base-probability-plot", value: "plot", label: "Codon base probability plot" },
        { showcase: false, value: "tsv", label: "Codon choice table" },
        { showcase: false, value: "report", label: "Summary report" }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "reverseInputLimit", type: "limit-value", label: "Input", value: `${limits.inputCharacters.toLocaleString()} characters; ${limits.records.toLocaleString()} records; ${limits.residues.toLocaleString()} residues`, detail: "Larger inputs are rejected; split them into smaller batches. Titles are limited to 500 characters." },
        { id: "reverseTableLimit", type: "limit-value", label: "Codon choice table", value: `${limits.tableRows.toLocaleString()} rows`, detail: "Larger tables are rejected; choose FASTA or report, or split the input." },
        { id: "reverseOutputLimit", type: "limit-value", label: "Selected output", value: `${limits.outputCharacters.toLocaleString()} characters`, detail: "Larger exports are rejected." },
        {
          id: "probabilityPlotLimitNote",
          type: "limit-value",
          label: "Codon base probability plot",
          value: "5,000 residues per protein record",
          detail: "At most 5,000 residues total across at most 12 records. Excess residues are omitted with a warning; excess record counts are rejected."
        }
      ]
    },
    {
      id: "note",
      type: "note",
      text: "Raw or FASTA protein input is cleaned by removing gaps and unsupported characters. Positions count retained residues and stop symbols (*); B means D/N, J means I/L, Z means E/Q, X covers sense codons, and U/O use NNN with a warning. Codon assignments follow NCBI Genetic Codes. Reverse translation constructs candidate DNA; multiple DNA sequences can encode the same protein."
    }
  ]
};
