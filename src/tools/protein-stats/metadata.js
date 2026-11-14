import { sequenceStatsProteinTableColumns } from "./run.js";
import { PROTEIN_STATS_DEFAULTS, PROTEIN_STATS_LIMITS as LIMITS } from "../../core/protein-stats-options.js";

export const sequenceStatsProteinMetadata = {
  id: "sequence-stats-protein",
  name: "Sequence Stats Protein",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "FASTA", "statistics"],
  summary:
    "Summarize protein length, residue counts, molecular weight, net charge, and estimated isoelectric point.",
  whenToUse: "Compare protein composition and estimate mass, net charge at a chosen pH, and isoelectric point across sequence records.",
  inputType: "Protein sequence or FASTA records",
  outputType: "Protein sequence statistics report, table",
  runInWorker: true,
  workerModule: "../tools/protein-stats/run.js",
  workerExport: "runSequenceStatsProteinWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain", outputFormat: "report" },
      { id: "table", kind: "table", schema: "sequence-stats-protein", outputFormat: "tsv", columns: sequenceStatsProteinTableColumns },
      { id: "statsRecords", kind: "stats-records", schema: "sequence-stats-protein", outputFormat: "stats-records" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Statistics",
      options: [
        {
          id: "chargePh",
          type: "number",
          label: "Net charge pH",
          defaultValue: PROTEIN_STATS_DEFAULTS.chargePh,
          min: 0,
          max: 14,
          step: 0.1,
          help: "pH used for the net-charge estimate. Values outside 0-14 are clamped to that range."
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
          defaultValue: PROTEIN_STATS_DEFAULTS.outputFormat,
          choices: [
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } }
          ]
        }
      ]
    },
    {
      type: "group", label: "Limits", collapsible: true, collapsed: true, options: [
        { id: "proteinStatsInput", type: "limit-value", label: "Input characters", value: LIMITS.inputCharacters, detail: "Pasted input and decoded files, including headers and whitespace (UTF-16 characters)." },
        { id: "proteinStatsRecords", type: "limit-value", label: "Protein records", value: LIMITS.records },
        { id: "proteinStatsOutput", type: "limit-value", label: "Output characters", value: LIMITS.outputCharacters },
        { id: "proteinStatsHeaders", type: "limit-value", label: "FASTA header characters", value: LIMITS.headerCharacters, detail: "Fixed per-record ceiling." }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Each record is modeled as one unmodified linear chain. Mass uses average peptide-residue masses plus one H2O; charge and pI use Henderson-Hasselbalch equations with EMBOSS Epk.dat pKa defaults and include termini."
    },
    {
      id: "interpretationNote", type: "note",
      text: "Length includes ambiguous, uncommon, and stop symbols. These symbols are excluded from mass, charge, and pI without creating extra termini. Combined totals sum record masses and charges; collection pI is undefined."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nProtein parameter formulas and constants: ExPASy ProtParam documentation.\n\nOracle/reference behavior: EMBOSS pepstats and iep documentation."
    }
  ]
};

export const proteinStatsMetadata = sequenceStatsProteinMetadata;
