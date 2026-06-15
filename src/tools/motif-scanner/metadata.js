import { motifMatchTableColumns } from "../../core/motif-scanner.js";
import dnaRnaMotifs from "../../reference-data/motifs/dna-rna-motifs.js";
import proteinMotifs from "../../reference-data/motifs/protein-motifs.js";

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
      .map((motif) => ({ value: motif.id, label: motif.name, dependsOnValue: motif.class }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ];
}

function makeWorkflow(alphabet, schema) {
  const outputs = [
    { id: "primary", kind: "text", mediaType: "text/plain" },
    { id: "report", kind: "text", mediaType: "text/plain" },
    { id: "table", kind: "table", schema, columns: motifMatchTableColumns },
    { id: "warnings", kind: "warnings" }
  ];
  outputs.splice(2, 0, { id: "textMap", kind: "text", mediaType: "text/plain" });
  outputs.splice(3, 0, { id: "overview", kind: "text", mediaType: "image/svg+xml" });
  if (alphabet === "dna-rna") {
    outputs.splice(4, 0, { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" });
  } else if (alphabet === "protein") {
    outputs.splice(4, 0, { id: "viewer", kind: "viewer", viewerType: "protein-sequence-viewer" });
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
    defaultValue: "report",
    choices: [
      { value: "report", label: "Summary report" },
      { value: "tsv", label: "Table" },
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
    defaultValue: "report",
    choices: [
      { value: "report", label: "Summary report" },
      { value: "tsv", label: "Table" },
      { value: "text-map", label: "Motif text map" },
      { value: "svg-map", label: "Linear motif map" },
      { value: "interactive-viewer", label: "Protein sequence viewer" }
    ]
  }
];

export const dnaRnaMotifScannerMetadata = {
  id: "dna-rna-motif-scanner",
  name: "DNA/RNA Motif Scanner",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "motif", "annotation", "reference data"],
  summary: "Scan DNA/RNA sequences against bundled named motif records with provenance.",
  inputType: "DNA/RNA sequence",
  outputType: "Report, table, motif text map, linear motif map, linear DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/motif-scanner/run.js",
  workerExport: "runDnaRnaMotifScannerWorker",
  workflow: makeWorkflow("dna-rna", "dna-rna-motif-scanner"),
  options: [
    {
      id: "motifDatabase",
      type: "select",
      label: "Motif database",
      help: "Choose the bundled motif database to scan. JASPAR profiles are scored PWMs/PSSMs; curated SMS3 records are exact, IUPAC, or regex motifs.",
      defaultValue: "sms3-curated",
      choices: makeDatabaseChoices(dnaRnaMotifs)
    },
    {
      id: "motifClass",
      type: "select",
      label: "Motif class",
      help: "Narrows the motif list to one class. Leave as All classes to scan every bundled motif. The Motif selector is limited by this choice.",
      defaultValue: "all",
      dependsOn: "motifDatabase",
      choices: makeClassChoices(dnaRnaMotifs)
    },
    {
      id: "motifId",
      type: "select",
      label: "Motif",
      help: "Choose a specific bundled motif within the selected class, or leave as All motifs to scan the whole selected class.",
      defaultValue: "all",
      dependsOn: "motifClass",
      choices: makeMotifChoices(dnaRnaMotifs)
    },
    {
      id: "pwmThresholdPercent",
      type: "number",
      label: "PWM/PSSM threshold (%)",
      help: "Minimum relative PWM/PSSM score for JASPAR-style matrix motifs. Higher values are stricter and reduce candidate TFBS hits.",
      defaultValue: 85,
      min: 50,
      max: 100,
      step: 1
    },
    {
      id: "strand",
      type: "radio",
      label: "Strand",
      help: "Both strands searches the submitted DNA/RNA sequence and its reverse complement, while reporting coordinates on the original submitted sequence.",
      defaultValue: "both",
      choices: [
        { value: "forward", label: "Forward only" },
        { value: "both", label: "Both strands" }
      ]
    },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: true, help: "Allows motif hits that share one or more sequence positions." },
    ...dnaRnaOutputOptions,
    {
      id: "methodNote",
      type: "note",
      text: "Bundled curated motifs are scanned as exact, IUPAC, or JavaScript-regex source patterns. JASPAR motifs are scored as PWM/PSSM profiles using the selected relative-score threshold."
    },
    {
      id: "databaseNote",
      type: "note",
      text: `Bundled database: ${dnaRnaMotifs.length} DNA/RNA motif records, including JASPAR CORE profiles when generated from the source cache. These are candidate matches, not functional annotation.`
    }
  ]
};

export const proteinMotifScannerMetadata = {
  id: "protein-motif-scanner",
  name: "Protein Motif Scanner",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "motif", "annotation", "reference data"],
  summary: "Scan protein sequences against bundled named motif records with provenance.",
  inputType: "Protein sequence",
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
      help: "Choose the bundled protein motif database to scan. Larger protein databases such as PROSITE and ELM need source-specific redistribution handling before wholesale bundling.",
      defaultValue: "sms3-curated",
      choices: makeDatabaseChoices(proteinMotifs)
    },
    {
      id: "motifClass",
      type: "select",
      label: "Motif class",
      help: "Narrows the motif list to one class. Leave as All classes to scan every bundled motif. The Motif selector is limited by this choice.",
      defaultValue: "all",
      dependsOn: "motifDatabase",
      choices: makeClassChoices(proteinMotifs)
    },
    {
      id: "motifId",
      type: "select",
      label: "Motif",
      help: "Choose a specific bundled motif within the selected class, or leave as All motifs to scan the whole selected class.",
      defaultValue: "all",
      dependsOn: "motifClass",
      choices: makeMotifChoices(proteinMotifs)
    },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: true, help: "Allows motif hits that share one or more residue positions." },
    ...proteinOutputOptions,
    {
      id: "methodNote",
      type: "note",
      text: "Bundled motifs are scanned as exact, IUPAC, or JavaScript-regex source patterns according to each motif record. This tool does not currently score profile/PSSM/HMM motifs or allow approximate mismatches."
    },
    {
      id: "databaseNote",
      type: "note",
      text: `Bundled database: ${proteinMotifs.length} cited protein motif records. Short protein motifs can produce many false positives. Treat matches as candidate sites, not functional annotation.`
    }
  ]
};
