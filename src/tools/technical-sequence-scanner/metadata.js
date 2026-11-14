import { TECHNICAL_SEQUENCE_DEFAULTS as defaults } from "../../core/technical-sequence-options.js";
import {
  TECHNICAL_SEQUENCE_SVG_MAX_HITS_PER_RECORD,
  TECHNICAL_SEQUENCE_SVG_MAX_RECORDS,
  TECHNICAL_SEQUENCE_SVG_MAX_TOTAL_HITS,
  technicalSequenceTableColumns
} from "./run.js";
import technicalSequenceSummary from "../../reference-data/technical-sequences/summary.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

function makeClassChoices(records) {
  return [
    { value: "all", label: "All bundled classes" },
    ...[...new Set(records.map((record) => record.class))]
      .sort((left, right) => left.localeCompare(right))
      .map((recordClass) => ({ value: recordClass, label: recordClass })),
    { value: "custom", label: "Custom technical sequences" }
  ];
}

function makeBundledClassValues(records) {
  return [
    "all",
    ...[...new Set(records.map((record) => record.class))]
      .sort((left, right) => left.localeCompare(right))
  ];
}

function makeSequenceChoices(records) {
  return [
    { value: "all", label: "All bundled sequences" },
    ...records
      .map((record) => ({ value: record.id, label: record.name, dependsOnValue: record.class }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ];
}

export const technicalSequenceScannerMetadata = {
  id: "technical-sequence-scanner",
  name: "Technical Sequence Scanner",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "technical sequence", "adapter", "primer", "contamination", "reference data"],
  summary: "Scan DNA/RNA sequences for bundled or custom primers, adapters, and other technical sequences.",
  whenToUse: "Locate known primer or adapter sequences and terminal fragments in DNA/RNA records before reviewing contamination or preparing downstream analysis.",
  inputType: "DNA/RNA sequence, FASTA/FASTA.GZ, or indexed FASTA",
  outputType: "Report, table, text annotation map, linear technical-sequence map, or linear/circular DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/technical-sequence-scanner/run.js",
  workerExport: "runTechnicalSequenceScanner",
  workflow: {
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
        schema: "technical-sequence-scanner",
        columns: technicalSequenceTableColumns
      },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }),
    {
      id: "sequenceClass",
      type: "select",
      label: "Sequence class",
      defaultValue: defaults.sequenceClass,
      choices: makeClassChoices(technicalSequenceSummary)
    },
    {
      id: "sequenceId",
      type: "select",
      label: "Bundled sequence",
      defaultValue: defaults.sequenceId,
      dependsOn: "sequenceClass",
      visibleWhen: { option: "sequenceClass", value: makeBundledClassValues(technicalSequenceSummary) },
      choices: makeSequenceChoices(technicalSequenceSummary)
    },
    {
      id: "strand",
      type: "radio",
      label: "Strand",
      defaultValue: defaults.strand,
      choices: [
        { value: "both", label: "Both strands" },
        { value: "forward", label: "Forward only" }
      ]
    },
    {
      id: "matchMode",
      type: "select",
      label: "Match mode",
      defaultValue: defaults.matchMode,
      choices: [
        { value: "full", label: "Full sequence only" },
        { value: "mismatch-tolerant", label: "Mismatch-tolerant full sequence" },
        { value: "partial-ends", label: "Partial at sequence ends" },
        { value: "full-or-partial", label: "Full or partial" }
      ],
      help: "Full/partial modes match bundled sequences literally and custom IUPAC sequences by compatible base sets. Mismatch mode uses IUPAC compatibility (X as N); identity counts compatible positions and mismatch positions follow the technical sequence 5' to 3'. All modes treat U and T equivalently."
    },
    {
      id: "maxMismatches",
      type: "number",
      label: "Maximum mismatches",
      defaultValue: defaults.maxMismatches,
      min: 0,
      max: 10,
      step: 1,
      visibleWhen: { option: "matchMode", value: "mismatch-tolerant" },
      help: "Used only for mismatch-tolerant full-sequence matching. Mismatches are counted against IUPAC base sets; indels are not allowed."
    },
    {
      id: "requireExactThreePrime",
      type: "checkbox",
      label: "Require exact 3' end",
      defaultValue: defaults.requireExactThreePrime,
      visibleWhen: { option: "matchMode", value: "mismatch-tolerant" },
      help: "Used only for mismatch-tolerant matching. Requires IUPAC-compatible bases in the selected 3' tail of the technical sequence."
    },
    {
      id: "exactThreePrimeBases",
      type: "number",
      label: "Exact 3' bases",
      defaultValue: defaults.exactThreePrimeBases,
      min: 1,
      max: 20,
      step: 1,
      visibleWhen: [
        { option: "matchMode", value: "mismatch-tolerant" },
        { option: "requireExactThreePrime", value: true }
      ]
    },
    {
      id: "minimumPartialLength",
      type: "number",
      label: "Minimum partial length",
      defaultValue: defaults.minimumPartialLength,
      min: 4,
      max: 100,
      visibleWhen: { option: "matchMode", value: ["partial-ends", "full-or-partial"] }
    },
    {
      id: "customSequences",
      type: "textarea",
      label: "Custom technical sequences",
      defaultValue: defaults.customSequences,
      rows: 6,
      visibleWhen: { option: "sequenceClass", value: "custom" },
      help: "Paste FASTA records or one sequence per line/comma. Select Sequence class: Custom technical sequences to scan these records."
    },
    {
      id: "allowOverlaps",
      type: "checkbox",
      label: "Allow overlapping matches",
      defaultValue: defaults.allowOverlaps
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: defaults.outputFormat,
      choices: [
        { value: "report", label: "Summary report" },
        { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } },
        { value: "text-map", label: "Text annotation map" },
        { value: "svg-map", label: "Linear technical-sequence map" },
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
          id: "technicalLargeSourceLimitNote",
          type: "limit-value",
          label: "Scan source",
          value: "50 million non-whitespace input characters",
          detail: "All sources: 50 million non-whitespace input characters, 10,000 records; 150 MiB decoded text and 512 MiB source file. Fixed metadata bounds: 10,000 characters per header, 5 million total header characters, 16 MiB sidecar indexes."
        },
        {
          id: "technicalComparisonLimits",
          type: "limit-value",
          label: "Scan work",
          value: "500M full-match · 200M mismatch · 20M terminal comparisons",
          detail: "The matching mode determines which comparison budget applies."
        },
        {
          id: "technicalCandidateHitLimit",
          type: "limit-value",
          label: "Candidate hits",
          value: "50,000 hits"
        },
        {
          id: "technicalOutputLimit",
          type: "limit-value",
          label: "Materialized result",
          value: "26,214,400 serialized characters"
        },
        {
          id: "technicalPatternLimit",
          type: "limit-value",
          label: "Selected technical sequences",
          value: "32,000 bases per pattern · 1,000 patterns",
          detail: "Custom source text is limited to 1,000,000 characters."
        },
        {
          id: "technicalTextMapViewerSource",
          type: "limit-value",
          label: "Text maps and sequence viewers",
          value: "Pasted input up to 1,000,000 characters",
          detail: "Large FASTA file scans offer report, table, and linear map output."
        },
        {
          id: "technicalSequenceMapLimitNote",
          type: "limit-value",
          label: "Linear technical-sequence map",
          value: `${TECHNICAL_SEQUENCE_SVG_MAX_RECORDS.toLocaleString()} records · ${TECHNICAL_SEQUENCE_SVG_MAX_TOTAL_HITS.toLocaleString()} hits total · ${TECHNICAL_SEQUENCE_SVG_MAX_HITS_PER_RECORD.toLocaleString()} hits per record`,
          detail: "The map shows a subset when any bound is reached; the table contains all hit coordinates."
        },
        {
          id: "technicalIndexedHeaderLimit",
          type: "limit-value",
          label: "FAI-backed source metadata",
          value: "Indexed sequence names",
          detail: "Full FASTA header descriptions and line formatting are unavailable."
        }
      ]
    },
    {
      id: "databaseNote",
      type: "note",
      text: `Bundled reference: ${technicalSequenceSummary.length} cited primer/adapter sequences. Hits are candidate technical sequences. Coordinates are 1-based on the cleaned input strand; partial mode keeps the longest qualifying match at each oriented end. Scans are linear and ungapped, including when displayed in a circular viewer.`
    }
  ]
};
