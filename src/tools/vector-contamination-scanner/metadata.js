import { FASTA_RECORD_SOURCE_LIMITS as sourceLimits } from "../../core/fasta-record-source.js";
import { vectorContaminationTableColumns } from "../../core/vector-contamination-scanner.js";
import vectorSummary from "../../reference-data/vector-contamination/summary.js";
import { VECTOR_CONTAMINATION_SVG_MAP_HIT_THRESHOLD } from "./run.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { VECTOR_INPUT_DEFAULTS as defaults, VECTOR_SENSITIVITY_PRESETS, VECTOR_SCAN_LIMITS as limits, VECTOR_MATCH_MODEL as model } from '../../core/vector-contamination-options.js';

export const vectorContaminationScannerMetadata = {
  id: "vector-contamination-scanner",
  name: "Vector Contamination Scanner",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "vector", "adapter", "contamination", "reference data"],
  summary: "Locate candidate vector matches in DNA/RNA sequences against bundled UniVec_Core references.",
  whenToUse: "Review candidate vector or adapter contamination in DNA/RNA records before deciding whether a matched region should be removed.",
  inputType: "DNA/RNA sequence, FASTA/FASTA.GZ, or indexed FASTA",
  outputType: "Report, table, text annotation map, linear contamination map, or linear/circular DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/vector-contamination-scanner/run.js",
  workerExport: "runVectorContaminationScanner",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", kind: "text", mediaType: "text/plain" },
      {
        id: "table",
        kind: "table",
        schema: "vector-contamination-scanner",
        columns: vectorContaminationTableColumns
      },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }),
    {
      id: "sensitivity",
      type: "select",
      label: "Sensitivity",
      defaultValue: defaults.sensitivity,
      help: Object.entries(VECTOR_SENSITIVITY_PRESETS).map(([name, value]) => `${name}: ${value.minimumAlignedLength} bases, ${value.minimumPercentIdentity}% identity`).join('; ') + `. Explicit numeric thresholds override the preset. Confidence tiers are local heuristics: strong requires at least ${model.strong.length} bases and ${model.strong.identity}% identity; moderate requires ${model.moderate.length} bases and ${model.moderate.identity}%; remaining hits are low.`,
      choices: [
        { value: "high-confidence", label: "High confidence" },
        { value: "balanced", label: "Balanced" },
        { value: "sensitive", label: "Sensitive" }
      ]
    },
    {
      id: "strand",
      type: "radio",
      label: "Strand",
      help: "U is compared as T. Only equal A/C/G/T symbols count as matches; ambiguity symbols count as mismatches and retain their positions.",
      defaultValue: defaults.strand,
      choices: [
        { value: "both", label: "Both strands" },
        { value: "forward", label: "Forward only" }
      ]
    },
    {
      id: "minimumAlignedLength",
      type: "number",
      label: "Minimum aligned length",
      defaultValue: defaults.minimumAlignedLength,
      placeholder: "From sensitivity",
      help: `Leave empty to use the selected sensitivity preset. Matches require an exact ${vectorSummary.kmerLength}-base A/C/G/T seed.`,
      min: 8,
      max: 500
    },
    {
      id: "minimumPercentIdentity",
      type: "number",
      label: "Minimum percent identity",
      defaultValue: defaults.minimumPercentIdentity,
      placeholder: "From sensitivity",
      step: "any",
      help: "Leave empty to use the selected sensitivity preset. The cutoff uses unrounded identity.",
      min: 70,
      max: 100
    },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      help: `Scanning is linear, including for the circular viewer; origin-spanning hits are not searched. Overlapping hits to the same reference and strand are consolidated at ${model.mergeOverlap * 100}% overlap of the shorter hit.`,
      defaultValue: defaults.outputFormat,
      choices: [
        { showcase: false, value: "report", label: "Summary report" },
        { showcase: false, value: "tsv", label: "Table", resultView: { kind: "table", streamId: "table" } },
        { showcase: false, value: "text-map", label: "Text annotation map" },
        { showcase: "linear-contamination-map", value: "svg-map", label: "Linear contamination map" },
        { showcase: "linear-dna-viewer", value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { showcase: "circular-dna-viewer", value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "vectorLargeSourceLimitNote", type: "note", text: `Scans are capped at ${limits.inputCharacters.toLocaleString("en-US")} non-whitespace input characters, ${sourceLimits.maxRecords.toLocaleString("en-US")} records, ${limits.queryWindows.toLocaleString("en-US")} A/C/G/T query windows, ${limits.seedExtensions.toLocaleString("en-US")} seed extensions, ${limits.candidateRows.toLocaleString("en-US")} candidate hits, and ${limits.outputCharacters.toLocaleString("en-US")} materialized-output characters. Report, table, and linear map outputs are available; text maps and viewers require bounded pasted input.` },
        {
          id: "maxHitsPerRecord",
          type: "number",
          label: "Maximum hits per record",
          defaultValue: defaults.maxHitsPerRecord,
          min: 1,
          max: 1000
        },
        {
          id: "vectorContaminationMapLimitNote",
          type: "note",
          text: `Linear contamination map output is capped at ${VECTOR_CONTAMINATION_SVG_MAP_HIT_THRESHOLD.toLocaleString()} shown hits. Table output contains all retained hit coordinates, subject to the per-record cap. ${STREAMED_FASTA_SCAN_NOTE}`
        }
      ]
    },
    {
      id: "databaseNote",
      type: "note",
      text: `${vectorSummary.sourceName} ${vectorSummary.sourceVersion}; ${vectorSummary.recordCount} records and ${vectorSummary.totalBases.toLocaleString()} bases. Candidates require an exact ${vectorSummary.kmerLength}-base seed and ungapped extension (+${model.matchScore} match, ${model.mismatchPenalty} mismatch; X-drop ${model.xDrop}). NCBI VecScreen classifications are not reproduced; indel-containing alignments can be missed.`
    }
  ]
};
