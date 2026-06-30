import { proteinHydropathyTableColumns } from "./run.js";

export const proteinHydropathyMetadata = {
  id: "protein-hydropathy",
  name: "Protein Hydropathy",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "hydropathy", "plot"],
  summary:
    "Calculate Kyte-Doolittle GRAVY and sliding-window hydropathy profiles for protein sequences.",
  inputType: "Protein sequence",
  outputType: "Hydropathy report, table, plot",
  runInWorker: true,
  workerModule: "../tools/protein-hydropathy/run.js",
  workerExport: "runProteinHydropathyWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "protein-hydropathy", columns: proteinHydropathyTableColumns },
      { id: "plot", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "windowSize",
      type: "number",
      label: "Window size",
      help: "Residues per sliding window. The default of 19 is useful for broad hydrophobic or transmembrane-scale regions; smaller windows show more local variation.",
      defaultValue: 19,
      min: 1,
      max: 1001,
      step: 1
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "svg-plot",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Table" },
        { value: "svg-plot", label: "Protein hydropathy plot" }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "GRAVY and profile values use the Kyte-Doolittle hydropathy scale. Windows are averaged over standard residues only."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nKyte-Doolittle hydropathy scale: Kyte and Doolittle 1982.\n\nScale values: ExPASy ProtScale."
    }
  ]
};
