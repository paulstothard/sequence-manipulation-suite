import { applyOligoOptionDefinitions } from "../../core/primer-oligo-options.js";
import { OLIGO_INPUT_HELP } from "../primer-input-options.js";
import { primerOligoPropertyColumns, oligoPairColumns } from "../../core/primer-oligo-properties.js";

export const primerOligoPropertiesMetadata = {
  id: "primer-oligo-properties",
  name: "Primer / Oligo Basic Properties",
  category: "Restriction, PCR & Primers",
  tags: ["DNA", "RNA", "raw", "FASTA", "GC", "primer", "statistics"],
  summary: "Calculate DNA/RNA oligo composition and reverse complements, with approximate DNA melting temperatures and ambiguity bounds.",
  inputType: "DNA/RNA primer/oligo sequences, one per line, or FASTA records",
  outputType: "Oligo property report or table",
  fileInput: {
    dropLabel: "Drop primer/oligo FASTA or text file here",
    help: OLIGO_INPUT_HELP,
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
  },
  workflow: {
    inputs: [{ id: "input", kind: "text", mediaType: "text/plain" }],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "primer-oligo-properties", columns: primerOligoPropertyColumns },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "analysis", kind: "text", mediaType: "application/json" },
      { id: "pairs", kind: "table", schema: "oligo-pair-comparison", columns: oligoPairColumns },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/primer-oligo-properties/run.js",
  workerExport: "runPrimerOligoProperties",
  options: applyOligoOptionDefinitions([
    { id: "moleculeType", type: "radio", label: "Molecule type", choices: [
      { value: "auto", label: "Infer from T/U" },
      { value: "dna", label: "DNA" },
      { value: "rna", label: "RNA" }
    ], help: "Inference treats U-only records as RNA and other records as DNA; mixed T/U requires an explicit choice. Choosing DNA or RNA converts U or T respectively." },
    { id: "tmModel", type: "radio", label: "DNA melting model", choices: [
      { value: "basic", label: "Basic composition formulas" },
      { value: "nearest-neighbor", label: "Nearest-neighbor DNA/DNA" }
    ], help: "Nearest-neighbor mode models a perfectly matched DNA duplex with the entered concentrations. Ambiguous bases, RNA and modified oligos are unsupported." },
    { type: "group", label: "DNA duplex conditions", visibleWhen: { option: "tmModel", value: "nearest-neighbor" }, options: [
      { id: "sodiumMm", type: "number", label: "Na concentration (mM)" },
      { id: "magnesiumMm", type: "number", label: "Mg concentration (mM)" },
      { id: "dntpMm", type: "number", label: "Total dNTP concentration (mM)" },
      { id: "oligoNm", type: "number", label: "Each strand concentration (nM)", help: "Assumes equal concentrations of an oligo and its perfect complement. A self-complementary sequence is one species at this concentration." }
    ] },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Format",
          help: "Normalized sequence is your input oligo in 5′→3′ order after cleanup and any selected DNA/RNA conversion. Use this strand for the oligo you entered, including reverse primers. Reverse complement is the opposite strand, also written 5′→3′. Review each row's validity, warnings and notes before ordering.",
          choices: [
            { showcase: false, value: "report", label: "Summary report" },
            { showcase: false, value: "tsv", label: "Property table" },
            { showcase: false, value: "reverse-complement-fasta", label: "Reverse-complement FASTA" },
            { showcase: false, value: "pair-tsv", label: "Oligo pair Tm comparison", resultView: { kind: "table", streamId: "pairs" } },
            { showcase: false, value: "analysis-json", label: "Complete analysis JSON" }
          ]
        }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Basic DNA Tm uses Wallace below 14 nt and Marmur-Doty otherwise. Nearest-neighbor mode uses SantaLucia DNA/DNA parameters with entropy salt and sodium-equivalent Mg corrections. RNA Tm is unavailable. IUPAC formula bounds do not predict mixture melting. Pair comparison covers the first 1000 input-order pairs and does not assess hairpins or dimers. Gaps are removed; unsupported symbols invalidate a record."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nWallace rule Tm: Wallace et al. 1979.\n\nMarmur-Doty Tm approximation: Marmur and Doty 1962.\n\nDNA nearest-neighbor Tm: SantaLucia 1998; von Ahsen et al. 2001."
    }
  ])
};
