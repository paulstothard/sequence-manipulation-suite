import { sequenceStatsProteinTableColumns } from "./run.js";

export const sequenceStatsProteinMetadata = {
  id: "sequence-stats-protein",
  name: "Sequence Stats Protein",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "statistics"],
  summary:
    "Summarize protein length, residue counts, molecular weight, net charge, and estimated isoelectric point.",
  inputType: "Protein sequence",
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
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "sequence-stats-protein", columns: sequenceStatsProteinTableColumns },
      { id: "statsRecords", kind: "stats-records", schema: "sequence-stats-protein" },
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
          defaultValue: 7,
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
          defaultValue: "report",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Table" }
          ]
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Molecular weight uses average peptide-residue masses plus one H2O. Charge and pI use Henderson-Hasselbalch equations with EMBOSS Epk.dat pKa defaults and include termini."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nProtein parameter formulas and constants: ExPASy ProtParam documentation.\n\nOracle/reference behavior: EMBOSS pepstats and iep documentation."
    }
  ]
};

export const proteinStatsMetadata = sequenceStatsProteinMetadata;
