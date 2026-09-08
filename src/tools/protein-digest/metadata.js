import { proteases } from "../../core/protein-digest.js";
import { proteinDigestTableColumns } from "./run.js";

export const proteinDigestMetadata = {
  id: "protein-digest",
  name: "Protein Digest",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "FASTA", "enzyme", "digest", "coordinates", "map", "reference data"],
  summary: "Predict protease cleavage and export peptides with positions, lengths, masses, and missed-cleavage counts.",
  whenToUse: "Use this to predict peptides from a single-enzyme protein digest, inspect cleavage patterns, or prepare peptide FASTA for downstream analysis.",
  inputType: "Protein sequence",
  outputType: "Peptide table, FASTA, map",
  runInWorker: true,
  workerModule: "../tools/protein-digest/run.js",
  workerExport: "runProteinDigestWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "protein-digest-peptides", columns: proteinDigestTableColumns },
      { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" },
      { id: "map", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group", label: "Digestion", options: [
        {
          id: "enzyme", type: "select", label: "Protease", defaultValue: "trypsin",
          choices: proteases.map(record => ({ value: record.id, label: record.name })),
          help: proteases.map(record => `${record.name}: ${record.description}`).join("\n\n") + "\n\nThese are sequence-based predictions; experimental cleavage depends on conditions."
        },
        {
          id: "missedCleavages", type: "select", label: "Missed cleavages", defaultValue: 0,
          choices: [
            { value: "0", label: "0 — Complete digestion" },
            ...[1, 2, 3, 4, 5].map(count => ({ value: String(count), label: `Up to ${count} per peptide` }))
          ],
          help: "A missed cleavage is a predicted cut site left uncut inside a peptide. Zero assumes every predicted site is cut. Allowing one also includes peptides formed by joining two neighboring complete-digest fragments; allowing two includes joins of up to three fragments. The limit applies to each peptide, not to the whole protein. These are possible products, not predictions of which sites will be missed or how much of each peptide will form."
        }
      ]
    },
    {
      type: "group", label: "Peptides", options: [
        { id: "minLength", type: "number", label: "Minimum length (aa)", defaultValue: 1, min: 1, max: 200000, step: 1,
          help: "Filter peptides after digestion. Start/end positions remain 1-based and inclusive on the original protein." },
        { id: "maxLength", type: "number", label: "Maximum length (aa)", defaultValue: 200000, min: 1, max: 200000, step: 1 },
        { id: "massType", type: "radio", label: "Peptide mass", defaultValue: "monoisotopic",
          choices: [{ value: "monoisotopic", label: "Monoisotopic" }, { value: "average", label: "Average" }],
          help: "Neutral mass in Da: residue masses plus one water for free N/C termini. No modifications, disulfide correction, or added proton. B/J/X/Z/U/O are retained but peptides containing them have unavailable mass; nearby cleavage may be uncertain." }
      ]
    },
    {
      type: "group", label: "Output", options: [
        { id: "outputFormat", type: "radio", label: "Output format", defaultValue: "table",
          choices: [{ value: "table", label: "Peptide table" }, { value: "fasta", label: "Peptide FASTA" }, { value: "svg-map", label: "Peptide map" }],
          help: "Table and FASTA retain every peptide occurrence. Maps show peptide spans and coordinates; when missed cleavages are allowed, colors count predicted cut sites left uncut inside each peptide. Overlapping bars are alternative products. Runs support up to 200,000 residues and 50,000 peptides; maps support up to 12 proteins, 300 peptides, and 10,000 input residues. Use table or FASTA for larger digests." }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Digestion uses a single protease and assumes unmodified linear proteins. A single stop symbol (*) at the end of each sequence is automatically removed, with a warning. Internal stop symbols and gaps are not accepted."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nProtease cleavage rules: ExPASy PeptideCutter documentation.\n\nPeptide mass constants: NIST isotope data and SMS3 average residue masses.\n\nReference calculations: Pyteomics documentation."
    }
  ]
};
