import { plasmidCommonFeatureRecords, plasmidCommonFeatureProvenance } from "../../reference-data/plasmid-common-features/records.js";
import { plasmidCommonFeatureMatchColumns } from "../../core/plasmid-common-feature-scanner.js";

const featureTypes = [...new Set(plasmidCommonFeatureRecords.map((record) => record.type))].sort((left, right) =>
  left.localeCompare(right)
);

function featureTypeLabel(type) {
  return String(type).replace(/(^|-)([a-z])/g, (match) => match.toUpperCase());
}

function countRecords(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.type, (counts.get(record.type) ?? 0) + 1);
  }
  return counts;
}

const featureTypeCounts = countRecords(plasmidCommonFeatureRecords);

const featureChoices = [
  { value: "all", label: "All selected feature records", always: true },
  ...plasmidCommonFeatureRecords.map((record) => ({
    value: record.id,
    label: `${record.name} (${featureTypeLabel(record.type)})`,
    dependsOnValue: record.type
  }))
];

const referencePreviewRows = plasmidCommonFeatureRecords.map((record) => [
  record.id,
  record.name,
  featureTypeLabel(record.type),
  record.sequence,
  record.source?.name ?? ""
]);

export const plasmidCommonFeatureScannerMetadata = {
  id: "plasmid-common-feature-scanner",
  name: "Plasmid Common Feature Scanner",
  category: "Sequence Analysis",
  tags: ["DNA", "raw", "FASTA", "primer", "annotation", "plasmid", "search", "reference data"],
  summary: "Scan plasmid or vector DNA for provenance-bearing common promoter, primer, and operator signatures.",
  inputType: "DNA/RNA sequence or FASTA",
  outputType: "Report, table, text annotation map, linear feature map, or linear DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/plasmid-common-feature-scanner/run.js",
  workerExport: "runPlasmidCommonFeatureScanner",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      {
        id: "table",
        kind: "table",
        schema: "plasmid-common-feature-scanner",
        columns: plasmidCommonFeatureMatchColumns
      },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      type: "group",
      label: "Matching",
      options: [
        {
          id: "featureType",
          type: "select",
          label: "Feature type",
          defaultValue: "all",
          choices: [
            { value: "all", label: `All bundled feature types (${plasmidCommonFeatureRecords.length})` },
            ...featureTypes.map((type) => ({
              value: type,
              label: `${featureTypeLabel(type)} (${featureTypeCounts.get(type) ?? 0})`
            }))
          ]
        },
        {
          id: "featureId",
          type: "select",
          label: "Feature",
          help: "Choose one bundled feature signature, or leave as All selected feature records to scan the selected type.",
          defaultValue: "all",
          dependsOn: "featureType",
          choices: featureChoices
        },
        {
          id: "maxMismatches",
          type: "number",
          label: "Maximum mismatches",
          defaultValue: 1,
          min: 0,
          max: 10,
          step: 1,
          help: "Uses ungapped exact or near-exact matching against bundled common-feature signatures. Indels and partial local-alignment verification remain planned for a larger future database."
        },
        {
          id: "minIdentityPercent",
          type: "number",
          label: "Minimum identity %",
          defaultValue: 95,
          min: 50,
          max: 100,
          step: 0.5
        }
      ]
    },
    {
      id: "referencePreviewGroup",
      type: "group",
      label: `Bundled feature records (${plasmidCommonFeatureRecords.length})`,
      help: "Shows the exact bundled signatures used by this tool. Use the Feature selector above to scan one record.",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "referencePreview",
          type: "reference-table",
          columns: ["ID", "Feature", "Type", "Sequence", "Source"],
          rows: referencePreviewRows
        }
      ]
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "report",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Table" },
        { value: "text-map", label: "Text annotation map" },
        { value: "svg-map", label: "Linear feature map" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "databaseNote",
      type: "note",
      text: `Bundled reference set: ${plasmidCommonFeatureRecords.length} provenance-bearing common-feature signatures (${plasmidCommonFeatureProvenance.version}). The collection is visible above. This is a focused local scanner, not a complete PlasMapper-style annotation database.`
    }
  ],
  examples: [
    {
      label: "Plasmid control-region seed hits",
      input:
        ">plasmid_control_region_example\n" +
        "GCGGCCGCTAATACGACTCACTATAGGGTTTTGTAAAACGACGGCCAGTGACGTCGACAATTGTGAGCGGATAACAATTGGATCCATTTAGGTGACACTATAGGCGCGC\n"
    }
  ]
};
