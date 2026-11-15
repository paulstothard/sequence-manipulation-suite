import { FASTA_RECORD_SOURCE_LIMITS as sourceLimits } from "../../core/fasta-record-source.js";
import { DNA_RNA_PATTERN_DEFAULTS as defaults, DNA_RNA_PATTERN_LIMITS as limits } from "../../core/dna-rna-pattern-options.js";
import {
  DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD,
  DNA_RNA_PATTERN_SVG_MAP_MATCH_THRESHOLD,
  dnaRnaPatternFinderTableColumns
} from "./run.js";
import { STREAMED_FASTA_SCAN_NOTE } from "../fasta-input-policy.js";
import { makeFastaSourceInputOptions } from "../fasta-source-options.js";

export const dnaRnaPatternFinderMetadata = {
  id: "dna-rna-pattern-finder",
  name: "DNA/RNA Pattern Finder",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "motif", "regex", "search"],
  summary:
    "Find plain-text, IUPAC, or regular-expression DNA/RNA patterns on one or both strands.",
  whenToUse: "Locate a specified nucleotide pattern and inspect its coordinates, strand and surrounding sequence.",
  inputType: "DNA/RNA sequence, FASTA/FASTA.GZ, or indexed FASTA",
  outputType: "Match report, table, pattern text map, linear pattern map, linear or circular DNA sequence viewer",
  runInWorker: true,
  workerModule: "../tools/dna-rna-pattern-finder/run.js",
  workerExport: "runDnaRnaPatternFinderWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "dna-rna" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      { id: "textMap", outputFormat: "text-map", kind: "text", mediaType: "text/plain" },
      { id: "table", outputFormat: "tsv", kind: "table", schema: "dna-rna-pattern-finder", columns: dnaRnaPatternFinderTableColumns },
      { id: "overview", outputFormat: "svg-map", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", outputFormat: "interactive-viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "matchedRegions", outputFormat: "matched-regions", kind: "sequence-records", alphabet: "dna-rna", schema: "dna-rna-pattern-finder" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    ...makeFastaSourceInputOptions({ includeStreamedFile: true, alphabet: "dna-rna", allowPlainSequence: true }),
    {
      id: "pattern",
      type: "text",
      label: "Pattern",
      help: "Enter the sequence pattern to find. In IUPAC mode, ambiguity symbols such as N, R, and Y are interpreted biologically.",
      defaultValue: defaults.pattern
    },
    {
      id: "patternMode",
      type: "radio",
      label: "Pattern mode",
      help: "Plain text searches for exact characters. IUPAC motif expands ambiguity codes. JavaScript regex uses the pattern as a regex source, without slash delimiters such as /ATG/i. See the JavaScript regex reference page for syntax and supported flags.",
      defaultValue: defaults.patternMode,
      choices: [
        { value: "plain", label: "Plain text" },
        { value: "iupac", label: "IUPAC motif" },
        { value: "regex", label: "JavaScript regex" }
      ]
    },
    {
      id: "strand",
      type: "radio",
      label: "Strand",
      help: "Both strands searches the submitted sequence and its reverse complement, while reporting coordinates on the original submitted sequence.",
      defaultValue: defaults.strand,
      choices: [
        { value: "forward", label: "Forward only" },
        { value: "both", label: "Both strands" }
      ]
    },
    { id: "caseInsensitive", type: "checkbox", label: "Case-insensitive search", defaultValue: defaults.caseInsensitive, help: "Treat uppercase and lowercase letters as equivalent during matching. Turn off to match the original input case. In regex mode this controls JavaScript i-flag behavior; other regex flags are not user options in this tool." },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: defaults.allowOverlaps, help: "Allows matches that share one or more sequence positions, such as finding ATA twice in ATATA." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: defaults.outputFormat,
      choices: [
        { value: "report", label: "Summary report" },
        { value: "text-map", label: "Pattern text map" },
        { value: "svg-map", label: "Linear pattern map" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" },
        { value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } }
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
          id: "patternOutputLimitNote",
          type: "note",
          text: `Plain/IUPAC scans support patterns up to ${limits.patternCharacters.toLocaleString("en-US")} characters, ${limits.inputCharacters.toLocaleString("en-US")} non-whitespace input characters, ${sourceLimits.maxRecords.toLocaleString("en-US")} records, ${limits.work.toLocaleString("en-US")} symbol comparisons, and ${limits.hits.toLocaleString("en-US")} candidate hits. Retained hit data and selected output are limited to ${limits.outputCharacters.toLocaleString("en-US")} characters. Use report, table, or linear map output; text maps, sequence viewers, and JavaScript regex require bounded pasted input. Matched regions requested in workflows are capped at ${DNA_RNA_PATTERN_MATCHED_REGION_RECORD_THRESHOLD.toLocaleString()} records; linear maps show at most ${DNA_RNA_PATTERN_SVG_MAP_MATCH_THRESHOLD.toLocaleString()} matches.`
        }
      ]
    },
    {
      id: "patternNote",
      type: "note",
      text: `IUPAC mode finds compatible possible bases, treats T/U as equivalent, and accepts X as N. Plain text and regex distinguish T/U; reverse complements use DNA T. Gap characters (. and -) are removed. Coordinates are 1-based inclusive on the cleaned direct strand; table context shows that strand, while workflow matched regions follow the searched strand. Circular viewers display a linear scan, so origin-spanning matches are not searched. Regex uses source syntax and the case checkbox controls its i flag. ${STREAMED_FASTA_SCAN_NOTE}`
    },
    {
      id: "patternReferences",
      type: "note",
      text: "References:\n\nAmbiguity symbols: Cornish-Bowden 1985.\n\nRegular expressions: ECMAScript documentation."
    }
  ]
};
