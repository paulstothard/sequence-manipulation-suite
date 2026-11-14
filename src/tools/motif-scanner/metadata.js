import { DNA_RNA_MOTIF_DEFAULTS, PROTEIN_MOTIF_DEFAULTS, PROTEIN_MOTIF_LIMITS } from "../../core/motif-scanner-options.js";
import { motifMatchTableColumns } from "../../core/motif-scanner.js";
import dnaRnaMotifs from "../../reference-data/motifs/dna-rna-motifs.js";
import proteinMotifs from "../../reference-data/motifs/protein-motifs.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import {
  MOTIF_SVG_LABEL_MATCH_THRESHOLD,
  MOTIF_SVG_MAP_MATCH_THRESHOLD,
  MOTIF_SVG_RECORD_LABEL_THRESHOLD,
  MOTIF_SVG_RECORD_MATCH_THRESHOLD,
  MOTIF_TEXT_MAP_MATCH_THRESHOLD
} from "./run.js";

const databaseLabels = {
  "sms3-curated": "SMS3 curated consensus/pattern motifs",
  "jaspar-2024-core": "JASPAR 2024 CORE transcription-factor PWMs"
};

function makeDatabaseChoices(motifs) {
  return [
    { value: "all", label: "All bundled motif databases" },
    ...[...new Set(motifs.map((motif) => motif.database))]
      .filter(Boolean)
      .sort((left, right) => (databaseLabels[left] ?? left).localeCompare(databaseLabels[right] ?? right))
      .map((database) => ({
        value: database,
        label: `${databaseLabels[database] ?? database} (${motifs.filter((motif) => motif.database === database).length})`
      }))
  ];
}

function makeClassChoices(motifs) {
  return [
    { value: "all", label: "All classes" },
    ...[...new Map(motifs.map((motif) => [
      `${motif.database}:${motif.class}`,
      { value: motif.class, label: motif.class, dependsOnValue: motif.database }
    ])).values()]
      .sort((left, right) => left.label.localeCompare(right.label))
  ];
}

function makeMotifChoices(motifs) {
  return [
    { value: "all", label: "All motifs" },
    ...motifs
      .map((motif) => ({ value: motif.id, label: motif.name, dependsOnValues: { motifDatabase: motif.database, motifClass: motif.class } }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ];
}

function makeWorkflow(alphabet, schema) {
  const outputs = [
    { id: "primary", kind: "text", mediaType: "text/plain" },
    { id: "report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
    { id: "table", outputFormat: "tsv", kind: "table", schema, columns: motifMatchTableColumns },
    { id: "warnings", kind: "warnings" }
  ];
  outputs.splice(2, 0, { id: "textMap", outputFormat: "text-map", kind: "text", mediaType: "text/plain" });
  outputs.splice(3, 0, { id: "overview", outputFormat: "svg-map", kind: "text", mediaType: "image/svg+xml" });
  if (alphabet === "dna-rna") {
    outputs.splice(4, 0, { id: "viewer", outputFormat: "interactive-viewer", kind: "viewer", viewerType: "dna-sequence-viewer" });
  } else if (alphabet === "protein") {
    outputs.splice(4, 0, { id: "viewer", outputFormat: "interactive-viewer", kind: "viewer", viewerType: "protein-sequence-viewer" });
  }
  return {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet }
    ],
    outputs
  };
}

const dnaRnaOutputOptions = [
  {
    id: "outputFormat",
    type: "radio",
    label: "Output format",
    defaultValue: DNA_RNA_MOTIF_DEFAULTS.outputFormat,
    choices: [
      { value: "report", label: "Summary report" },
      { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } },
      { value: "text-map", label: "Motif text map" },
      { value: "svg-map", label: "Linear motif map" },
      { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
      { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
    ]
  }
];

const proteinOutputOptions = [
  {
    id: "outputFormat",
    type: "radio",
    label: "Output format",
    defaultValue: PROTEIN_MOTIF_DEFAULTS.outputFormat,
    choices: [
      { value: "report", label: "Summary report" },
      { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } },
      { value: "text-map", label: "Motif text map" },
      { value: "svg-map", label: "Linear motif map" },
      { value: "interactive-viewer", label: "Protein sequence viewer" }
    ]
  }
];

const motifOutputLimitsGroup = {
  id: "advancedLimits",
  type: "group",
  label: "Limits",
  collapsible: true,
  collapsed: true,
  options: [
    {
      id: "motifOutputLimitNote",
      type: "note",
      text: `Motif text maps are capped at ${MOTIF_TEXT_MAP_MATCH_THRESHOLD.toLocaleString()} matches. Linear motif maps are capped at ${MOTIF_SVG_MAP_MATCH_THRESHOLD.toLocaleString()} shown matches, ${MOTIF_SVG_RECORD_MATCH_THRESHOLD.toLocaleString()} shown matches per record, ${MOTIF_SVG_LABEL_MATCH_THRESHOLD.toLocaleString()} labels total, and ${MOTIF_SVG_RECORD_LABEL_THRESHOLD.toLocaleString()} labels per record. Table output contains all coordinates.`
    }
  ]
};
const dnaRnaMotifLimitsGroup = {
  ...motifOutputLimitsGroup,
  options: [
    ...motifOutputLimitsGroup.options,
    { id: "streamedMotifLimitsNote", type: "note", text: "Pasted and file motif scans are capped at 50 million non-whitespace input characters, 10,000 records, 200 million motif-symbol scoring operations, 50,000 candidate hits, and 26,214,400 materialized-output characters. Source files are limited to 512 MiB and decoded text to 150 MiB. Select a motif or class when scanning large records. Report, table, and linear map outputs are available; text maps and sequence viewers require bounded pasted input." }
  ]
};

export const dnaRnaMotifScannerMetadata = {
  id: "dna-rna-motif-scanner",
  name: "DNA/RNA Motif Scanner",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "motif", "annotation", "reference data"],
  summary: "Find candidate DNA/RNA motif matches using curated patterns or JASPAR transcription-factor profiles, and review their positions in tables and sequence maps.",
  whenToUse: "Locate candidate regulatory or sequence motifs in DNA/RNA records and compare their positions using curated consensus patterns or transcription-factor profiles.",
  inputType: "DNA/RNA sequence, FASTA/FASTA.GZ, or indexed FASTA",
  outputType: "Report, table, motif text map, linear motif map, linear or circular DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/motif-scanner/run.js",
  workerExport: "runDnaRnaMotifScannerWorker",
  workflow: makeWorkflow("dna-rna", "dna-rna-motif-scanner"),
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }),
    {
      id: "motifDatabase",
      type: "select",
      label: "Motif database",
      help: "Choose the bundled motif database to scan. JASPAR profiles are scored PWMs/PSSMs; curated SMS3 DNA/RNA records are exact or IUPAC motifs.",
      defaultValue: DNA_RNA_MOTIF_DEFAULTS.motifDatabase,
      choices: makeDatabaseChoices(dnaRnaMotifs)
    },
    {
      id: "motifClass",
      type: "select",
      label: "Motif class",
      help: "Narrows the motif list to one class. All classes includes every class in the selected database. The Motif selector is limited by this choice.",
      defaultValue: DNA_RNA_MOTIF_DEFAULTS.motifClass,
      dependsOn: "motifDatabase",
      choices: makeClassChoices(dnaRnaMotifs)
    },
    {
      id: "motifId",
      type: "select",
      label: "Motif",
      help: "Choose a specific bundled motif within the selected class, or leave as All motifs to scan the whole selected class.",
      defaultValue: DNA_RNA_MOTIF_DEFAULTS.motifId,
      dependsOn: ["motifDatabase", "motifClass"],
      choices: makeMotifChoices(dnaRnaMotifs)
    },
    {
      id: "pwmThresholdPercent",
      type: "number",
      label: "PWM/PSSM threshold (%)",
      help: "Minimum relative PWM/PSSM score for JASPAR-style matrix motifs. Higher values are stricter. Relative score is scaled between the profile minimum and maximum; it is not a probability or p-value.",
      defaultValue: DNA_RNA_MOTIF_DEFAULTS.pwmThresholdPercent,
      min: 0,
      max: 100,
      step: 1
    },
    {
      id: "strand",
      type: "radio",
      label: "Strand",
      help: "Both strands searches the submitted DNA/RNA sequence and its reverse complement, while reporting 1-based inclusive coordinates on the cleaned submitted sequence.",
      defaultValue: DNA_RNA_MOTIF_DEFAULTS.strand,
      choices: [
        { value: "forward", label: "Forward only" },
        { value: "both", label: "Both strands" }
      ]
    },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: DNA_RNA_MOTIF_DEFAULTS.allowOverlaps, help: "Allows hits of the same motif on the same strand to share sequence positions. Different motifs and strands are assessed independently." },
    ...dnaRnaOutputOptions,
    dnaRnaMotifLimitsGroup,
    {
      id: "methodNote",
      type: "note",
      text: `RNA U is matched as T. IUPAC patterns accept compatible ambiguity symbols; PWM scoring skips ambiguous windows. Scans are linear, including in the circular viewer; origin-spanning sites are not searched. ${STREAMED_FASTA_SCAN_NOTE}`
    },
    {
      id: "databaseNote",
      type: "note",
      text: `Bundled database: ${dnaRnaMotifs.length} DNA/RNA motif records, including 2,346 JASPAR 2024 CORE profiles. Matches identify candidate sites; they do not establish function.`
    }
  ]
};

export const proteinMotifScannerMetadata = {
  id: "protein-motif-scanner",
  name: "Protein Motif Scanner",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "motif", "annotation", "reference data"],
  summary: "Find candidate protein motif sites with bundled curated patterns, and review their positions in tables or sequence views.",
  whenToUse: "Locate candidate modification, targeting, interaction or cleavage motifs in protein records and inspect their sequence positions.",
  inputType: "Protein sequence or FASTA",
  outputType: "Report, table, motif text map, linear motif map, protein sequence viewer",
  runInWorker: true,
  workerModule: "../tools/motif-scanner/run.js",
  workerExport: "runProteinMotifScannerWorker",
  workflow: makeWorkflow("protein", "protein-motif-scanner"),
  options: [
    {
      id: "motifDatabase",
      type: "select",
      label: "Motif database",
      help: "Choose all bundled curated protein patterns or narrow the search by class and motif.",
      defaultValue: PROTEIN_MOTIF_DEFAULTS.motifDatabase,
      choices: makeDatabaseChoices(proteinMotifs)
    },
    {
      id: "motifClass",
      type: "select",
      label: "Motif class",
      help: "Narrows the motif list to one class. All classes includes every class in the selected database. The Motif selector is limited by this choice.",
      defaultValue: PROTEIN_MOTIF_DEFAULTS.motifClass,
      dependsOn: "motifDatabase",
      choices: makeClassChoices(proteinMotifs)
    },
    {
      id: "motifId",
      type: "select",
      label: "Motif",
      help: "Choose a specific bundled motif within the selected class, or leave as All motifs to scan the whole selected class.",
      defaultValue: PROTEIN_MOTIF_DEFAULTS.motifId,
      dependsOn: ["motifDatabase", "motifClass"],
      choices: makeMotifChoices(proteinMotifs)
    },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: PROTEIN_MOTIF_DEFAULTS.allowOverlaps, help: "Allows motif hits that share one or more residue positions." },
    ...proteinOutputOptions,
    { ...motifOutputLimitsGroup, options: [
      ...motifOutputLimitsGroup.options,
      { id: "proteinMotifInput", type: "limit-value", label: "Input text", value: `${PROTEIN_MOTIF_LIMITS.inputCharacters.toLocaleString("en-US")} characters` },
      { id: "proteinMotifRecords", type: "limit-value", label: "Protein records", value: PROTEIN_MOTIF_LIMITS.records },
      { id: "proteinMotifWork", type: "limit-value", label: "Scan work", value: `${PROTEIN_MOTIF_LIMITS.work.toLocaleString("en-US")} residue-pattern positions` },
      { id: "proteinMotifHits", type: "limit-value", label: "Candidate hits", value: PROTEIN_MOTIF_LIMITS.hits },
      { id: "proteinMotifOutput", type: "limit-value", label: "Retained rows and output", value: `${PROTEIN_MOTIF_LIMITS.outputCharacters.toLocaleString("en-US")} characters`, detail: "Matched sequence retention is limited to half this amount before rows are built." },
      { id: "proteinMotifHeaders", type: "limit-value", label: "FASTA header", value: `${PROTEIN_MOTIF_LIMITS.headerCharacters.toLocaleString("en-US")} characters` }
    ] },
    {
      id: "methodNote",
      type: "note",
      text: "Bundled residue patterns identify candidate sites without mismatch, profile or structure scoring. Gaps are removed; coordinates are 1-based and inclusive on the cleaned sequence, including retained stop positions. Stops separate peptide chains; terminal patterns apply to each chain. Ambiguity symbols are retained without expansion, so wildcard and negated-class hits can be uncertain."
    },
    {
      id: "databaseNote",
      type: "note",
      text: `Bundled database: ${proteinMotifs.length} cited protein motif records. Short patterns can match by chance; results do not establish modification, localization or function.\n\nReferences:\n\nPatterns: PROSITE documentation; Yaffe 1997; Swinkels 1991.`
    }
  ]
};
