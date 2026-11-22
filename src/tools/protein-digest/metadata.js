import { PROTEIN_DIGEST_LIMITS, proteases } from "../../core/protein-digest.js";
import { PROTEIN_DIGEST_DEFAULTS } from "../../core/protein-digest-options.js";
import { proteinDigestTableColumns } from "./run.js";

export const proteinDigestMetadata = {
  id: "protein-digest",
  name: "Protein Digest",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "FASTA", "enzyme", "digest", "coordinates", "map", "reference data"],
  summary: "Predict protease cleavage and export peptides with positions, lengths, masses, and missed-cleavage counts.",
  whenToUse: "Predict peptides from a single-enzyme protein digest, inspect cleavage patterns or export peptide sequences in FASTA format.",
  inputType: "Protein sequence",
  outputType: "Peptide table, FASTA, map",
  runInWorker: true,
  workerModule: "../tools/protein-digest/run.js",
  workerExport: "runProteinDigestWorker",
  workflow: {
    requestedOutputStreamsOption: "requestedDigestOutputs",
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "table", label: "Peptide table", outputFormat: "table", kind: "table", schema: "protein-digest-peptides", columns: proteinDigestTableColumns },
      { id: "fasta", label: "Peptide FASTA", outputFormat: "fasta", kind: "text", mediaType: "text/x-fasta" },
      { id: "sequenceRecords", label: "Peptide sequences", outputFormat: "fasta", kind: "sequence-records", alphabet: "protein" },
      { id: "map", label: "Peptide map", outputFormat: "svg-map", kind: "text", mediaType: "image/svg+xml" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group", label: "Digestion", options: [
        {
          id: "enzyme", type: "select", label: "Protease", defaultValue: PROTEIN_DIGEST_DEFAULTS.enzyme,
          choices: proteases.map(record => ({ value: record.id, label: record.name })),
          help: proteases.map(record => `${record.name}: ${record.description}`).join("\n\n") + "\n\nThese are sequence-based predictions; experimental cleavage depends on conditions."
        },
        {
          id: "missedCleavages", type: "select", label: "Missed cleavages", defaultValue: PROTEIN_DIGEST_DEFAULTS.missedCleavages,
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
        { id: "minLength", type: "number", label: "Minimum length (aa)", defaultValue: PROTEIN_DIGEST_DEFAULTS.minLength, min: 1, max: PROTEIN_DIGEST_LIMITS.residues, step: 1,
          help: "Filter peptides after digestion. Start/end positions remain 1-based and inclusive on the original protein." },
        { id: "maxLength", type: "number", label: "Maximum length (aa)", defaultValue: PROTEIN_DIGEST_DEFAULTS.maxLength, min: 1, max: PROTEIN_DIGEST_LIMITS.residues, step: 1 },
        { id: "massType", type: "radio", label: "Peptide mass", defaultValue: PROTEIN_DIGEST_DEFAULTS.massType,
          choices: [{ value: "monoisotopic", label: "Monoisotopic" }, { value: "average", label: "Average" }],
          help: "Neutral mass in Da: residue masses plus one water for free N/C termini. No modifications, disulfide correction, or added proton. B/J/X/Z/U/O are retained but peptides containing them have unavailable mass; nearby cleavage may be uncertain." }
      ]
    },
    {
      type: "group", label: "Output", options: [
        { id: "outputFormat", type: "radio", label: "Output format", defaultValue: PROTEIN_DIGEST_DEFAULTS.outputFormat,
          choices: [{ showcase: false, value: "table", label: "Peptide table" }, { showcase: false, value: "fasta", label: "Peptide FASTA" }, { showcase: "peptide-map", value: "svg-map", label: "Peptide map" }],
          help: "Table and FASTA retain every peptide occurrence. Maps show peptide spans and coordinates; when missed cleavages are allowed, colors count predicted cut sites left uncut inside each peptide. Overlapping bars are alternative products. Use table or FASTA for larger digests." }
      ]
    },
    {
      id: "advancedLimits", type: "group", label: "Limits", collapsible: true, collapsed: true,
      options: [
        { id: "maxInputCharacters", type: "limit-value", label: "Input characters", value: PROTEIN_DIGEST_LIMITS.inputCharacters },
        { id: "maxProteinRecords", type: "limit-value", label: "Protein records", value: PROTEIN_DIGEST_LIMITS.records },
        { id: "maxInputResidues", type: "limit-value", label: "Input residues", value: PROTEIN_DIGEST_LIMITS.residues },
        { id: "maxPeptides", type: "limit-value", label: "Peptides", value: PROTEIN_DIGEST_LIMITS.peptides },
        { id: "maxExportedResidues", type: "limit-value", label: "Exported peptide residues", value: PROTEIN_DIGEST_LIMITS.exportedResidues },
        { id: "maxHeaderCharacters", type: "limit-value", label: "FASTA header characters", value: 500 },
        { type: "note", text: `Peptide maps support up to ${PROTEIN_DIGEST_LIMITS.mapRecords} proteins, ${PROTEIN_DIGEST_LIMITS.mapPeptides} peptides, and ${PROTEIN_DIGEST_LIMITS.mapResidues.toLocaleString()} input residues.` }
      ]
    },
    {
      id: "methodNote",
      type: "note",
      text: "Digestion uses a single protease and assumes unmodified linear proteins. A single stop symbol (*) at the end of each sequence is automatically removed and recorded in Output details. Internal stop symbols and gaps are not accepted."
    },
    {
      id: "citationNote",
      type: "note",
      text: "References:\n\nProtease cleavage rules: ExPASy PeptideCutter documentation.\n\nPeptide mass constants: NIST isotope data and SMS3 average residue masses.\n\nReference calculations: Pyteomics documentation."
    }
  ]
};
