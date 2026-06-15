import { primerOligoPropertyColumns } from "../../core/primer-oligo-properties.js";

export const primerOligoPropertiesMetadata = {
  id: "primer-oligo-properties",
  name: "Primer / Oligo Basic Properties",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "RNA", "raw", "FASTA", "GC", "primer", "statistics"],
  summary: "Calculate basic DNA/RNA oligo length, base counts, GC percent, simple Tm estimate, and reverse complement.",
  inputType: "DNA/RNA primer/oligo sequence or FASTA records",
  outputType: "Oligo property report or table",
  fileInput: {
    dropLabel: "Drop one plain-text DNA/RNA primer/oligo sequence or FASTA records here",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "primer-oligo-properties", columns: primerOligoPropertyColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/primer-oligo-properties/run.js",
  workerExport: "runPrimerOligoProperties",
  options: [
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          defaultValue: "report",
          choices: [
            { value: "report", label: "Summary report" },
            { value: "tsv", label: "Property table" }
          ]
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Tm uses the Wallace rule for oligos shorter than 14 nt and a Marmur-Doty approximation for longer oligos; it is a quick screening estimate, not a nearest-neighbor design calculation."
    },
    {
      id: "citationNote",
      type: "note",
      text: "Citations: Wallace RB et al. Nucleic Acids Res. 1979; Marmur J and Doty P. J Mol Biol. 1962."
    }
  ]
};
