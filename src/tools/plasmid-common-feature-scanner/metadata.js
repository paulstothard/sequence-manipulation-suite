import { FASTA_RECORD_SOURCE_LIMITS as sourceLimits } from "../../core/fasta-record-source.js";
import { PLASMID_FEATURE_DEFAULTS, PLASMID_FEATURE_LIMITS as limits } from "../../core/plasmid-common-feature-options.js";
import { plasmidCommonFeatureRecords, plasmidCommonFeatureProvenance } from "../../reference-data/plasmid-common-features/records.js";
import { plasmidCommonFeatureMatchColumns } from "../../core/plasmid-common-feature-scanner.js";
import {
  PLASMID_FEATURE_SVG_MAX_HITS_PER_RECORD,
  PLASMID_FEATURE_SVG_MAX_RECORDS,
  PLASMID_FEATURE_SVG_MAX_TOTAL_HITS
} from "./run.js";

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
  { value: "all", label: "All signatures in selected type", always: true },
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
  summary: "Scan plasmid or vector DNA for common promoter, primer, and operator sequences from bundled references.",
  whenToUse: "Locate candidate promoter, sequencing-primer and operator sites in plasmid or vector sequences using bundled signatures.",
  inputType: "DNA/RNA sequence or FASTA",
  outputType: "Report, table, text annotation map, linear feature map, or linear/circular DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/plasmid-common-feature-scanner/run.js",
  workerExport: "runPlasmidCommonFeatureScanner",
  workflow: {
    requestedOutputStreamsOption: "requestedPlasmidOutputs",
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      { id: "textMap", outputFormat: "text-map", kind: "text", mediaType: "text/plain" },
      { id: "overview", outputFormat: "svg-map", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", outputFormat: "interactive-viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      {
        id: "table",
        outputFormat: "tsv",
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
          defaultValue: PLASMID_FEATURE_DEFAULTS.featureType,
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
          help: "Choose one bundled signature to look for in your input DNA, or use All signatures in selected type to search for every signature in the selected feature type.",
          defaultValue: PLASMID_FEATURE_DEFAULTS.featureId,
          dependsOn: "featureType",
          choices: featureChoices
        },
        {
          id: "maxMismatches",
          type: "number",
          label: "Maximum mismatches",
          defaultValue: PLASMID_FEATURE_DEFAULTS.maxMismatches,
          min: 0,
          max: 10,
          step: 1,
          help: "Maximum unequal positions in a full-length ungapped signature. A hit must also meet Minimum identity %."
        },
        {
          id: "minIdentityPercent",
          type: "number",
          label: "Minimum identity %",
          help: "Equal positions divided by signature length, multiplied by 100. Both matching thresholds must pass.",
          defaultValue: PLASMID_FEATURE_DEFAULTS.minIdentityPercent,
          min: 50,
          max: 100,
          step: 0.5
        }
      ]
    },
    {
      id: "referencePreviewGroup",
      type: "group",
      layout: "reference",
      label: `Bundled signatures (${plasmidCommonFeatureRecords.length})`,
      help: "These are the bundled signatures searched in your input DNA. Choose one under Feature to search for only that signature; otherwise all signatures in the selected type are used.",
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
      defaultValue: PLASMID_FEATURE_DEFAULTS.outputFormat,
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Table", resultView: { kind: "table", streamId: "table" } },
        { value: "text-map", label: "Text annotation map" },
        { value: "svg-map", label: "Linear feature map" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        {
          id: "plasmidScanLimitNote", type: "note",
          text: `Scans support ${limits.maxInputCharacters.toLocaleString("en-US")} non-whitespace input characters, ${sourceLimits.maxRecords.toLocaleString("en-US")} records, ${limits.maxComparisons.toLocaleString("en-US")} symbol comparisons and ${limits.maxHits.toLocaleString("en-US")} hits. Retained hit text is limited to ${limits.maxRetainedCharacters.toLocaleString("en-US")} characters and the serialized result to ${limits.maxOutputCharacters.toLocaleString("en-US")} characters. Text maps support ${limits.textMapBases.toLocaleString("en-US")} bases and ${limits.textMapHits.toLocaleString("en-US")} hits. Source limits: ${sourceLimits.maxSourceBytes / 1048576} MiB file, ${sourceLimits.maxDecodedBytes / 1048576} MiB decoded text, ${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters per header and ${sourceLimits.maxTotalHeaderCharacters.toLocaleString("en-US")} header characters total. These limits remain fixed.`
        },
        {
          id: "plasmidFeatureMapLimitNote",
          type: "note",
          text: `Linear feature maps show up to ${PLASMID_FEATURE_SVG_MAX_RECORDS.toLocaleString()} records, ${PLASMID_FEATURE_SVG_MAX_TOTAL_HITS.toLocaleString()} hits total, and ${PLASMID_FEATURE_SVG_MAX_HITS_PER_RECORD.toLocaleString()} hits per record. Table output contains all hit coordinates.`
        }
      ]
    },
    {
      id: "databaseNote",
      type: "note",
      text: `Bundled reference set: ${plasmidCommonFeatureRecords.length} common-feature signatures (${plasmidCommonFeatureProvenance.version}). Different signatures can identify the same site.`
    },
    {
      id: "methodNote", type: "note",
      text: "Scans complete ungapped signatures on both strands and includes overlapping hits. Coordinates are 1-based inclusive on cleaned forward DNA; RNA U is treated as T. Ambiguous bases count as mismatches. Identity is the percentage of equal positions; score is identity minus mismatches. Only linear boundaries are scanned; circular viewers change the display."
    },
    {
      id: "referencesNote", type: "note",
      text: "References:\n\nSequencing-primer signatures: Addgene Sequencing Primers.\n\nOther signatures: SMS3 curated plasmid seed references."
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
