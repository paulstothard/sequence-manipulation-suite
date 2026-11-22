import { TRANSLATE_DEFAULTS as defaults, TRANSLATE_LIMITS as limits } from "../../core/translate-options.js";
import { geneticCodes } from "../../core/genetic-code.js";
import { translationTableColumns } from "./run.js";

export const translateMetadata = {
  id: "translate",
  name: "Translate DNA/RNA",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "protein", "raw", "genetic code", "translation"],
  summary:
    "Translate DNA/RNA sequences using selectable NCBI genetic codes and forward or reverse reading frames.",
  whenToUse: "Inspect protein translations of DNA/RNA sequences in a chosen reading frame or compare all six frames.",
  citations: [{ text: "NCBI Genetic Codes (https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi): ordinary codon assignments; initiation-specific recoding is not inferred." }],
  inputType: "DNA/RNA sequence",
  outputType: "Protein FASTA, plain protein text, translation table, text annotation map",
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
      { id: "translations", outputFormat: "tsv", kind: "table", schema: "translate-dna-rna", columns: translationTableColumns },
      { id: "proteinRecords", outputFormat: "fasta", kind: "sequence-records", alphabet: "protein", schema: "translated-protein-records" },
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
          help: "Frame 1 starts at the first base, frame 2 at the second, and frame 3 at the third. Reverse frames translate the reverse complement. Uppercase text joins retained uppercase DNA/RNA letters before translation, including across lowercase regions.",
          defaultValue: defaults.frame,
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
          help: "Selects ordinary codon assignments. Translation starts at the chosen offset, without searching for a start codon or recoding alternative initiators as methionine. Stops remain as * and translation continues after them.",
          defaultValue: defaults.geneticCode,
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
          help: "The translation table counts all translated positions, including ambiguous X and stop * symbols.",
          defaultValue: defaults.outputFormat,
          choices: [
            { showcase: false, value: "fasta", label: "Protein FASTA" },
            { showcase: false, value: "plain", label: "Plain protein text" },
            { showcase: false, value: "tsv", label: "Translation table" },
            { showcase: false, value: "text-map", label: "Text annotation map" }
          ]
        }
      ]
    },
    {
      id: "advancedLimits", type: "group", label: "Limits", collapsible: true, collapsed: true,
      options: [
        {id: "translateInputLimit", type: "limit-value", label: "Input", value: `${limits.inputCharacters.toLocaleString()} characters; ${limits.records.toLocaleString()} records; ${limits.bases.toLocaleString()} cleaned bases`, detail: "Larger inputs are rejected. Titles are limited to 500 characters."},
        {id: "translateTableLimit", type: "limit-value", label: "Translation table", value: `${limits.tableRows.toLocaleString()} rows`, detail: "Each record produces one row per selected frame. Larger tables are rejected."},
        {id: "translateMapLimit", type: "limit-value", label: "Text annotation map", value: `${limits.mapBases.toLocaleString()} displayed bases across records and frames`, detail: "Larger maps are rejected; select fewer records or frames, or another output."},
        {id: "translateOutputLimit", type: "limit-value", label: "Selected output", value: `${limits.outputCharacters.toLocaleString()} characters`, detail: "Larger exports are rejected; split the input into smaller batches."}
      ]
    },
    {
      id: "cleaningNote",
      type: "note",
      text: "Input is cleaned to DNA/RNA IUPAC symbols before translation; U is read as T. Any codon containing ambiguity symbols becomes X, even if its expansions encode one amino acid. Incomplete terminal codons are omitted."
    }
  ]
};
