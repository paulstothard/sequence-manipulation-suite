import { PROTEIN_PATTERN_DEFAULTS as defaults, PROTEIN_PATTERN_LIMITS as limits } from "../../core/protein-pattern-options.js";
import {
  PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD,
  PROTEIN_PATTERN_SVG_MAP_MATCH_THRESHOLD,
  proteinPatternFinderTableColumns
} from "./run.js";

export const proteinPatternFinderMetadata = {
  id: "protein-pattern-finder",
  name: "Protein Pattern Finder",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "motif", "regex", "search"],
  summary:
    "Find plain-text, IUPAC, or regular-expression protein motifs and report match coordinates.",
  whenToUse: "Locate a specified peptide or sequence pattern in protein records and inspect its coordinates and surrounding sequence.",
  inputType: "Protein sequence",
  outputType: "Match report, table, pattern text map, linear pattern map, protein sequence viewer",
  runInWorker: true,
  workerModule: "../tools/protein-pattern-finder/run.js",
  workerExport: "runProteinPatternFinderWorker",
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records", alphabet: "protein" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "text/plain" },
      { id: "report", outputFormat: "report", kind: "text", mediaType: "text/plain" },
      { id: "textMap", outputFormat: "text-map", kind: "text", mediaType: "text/plain" },
      { id: "table", outputFormat: "tsv", kind: "table", schema: "protein-pattern-finder", columns: proteinPatternFinderTableColumns },
      { id: "overview", outputFormat: "svg-map", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", outputFormat: "interactive-viewer", kind: "viewer", viewerType: "protein-sequence-viewer" },
      { id: "matchedRegions", outputFormat: "matched-regions", kind: "sequence-records", alphabet: "protein", schema: "protein-pattern-finder" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "pattern",
      type: "text",
      label: "Pattern",
      help: "Enter the protein pattern to find. In IUPAC mode, ambiguity symbols such as B, Z, J, and X are interpreted as residue sets.",
      defaultValue: defaults.pattern
    },
    {
      id: "patternMode",
      type: "radio",
      label: "Pattern mode",
      help: "Plain text searches for exact characters. IUPAC motif matches intersecting residue sets in both pattern and sequence: B=D/N, J=I/L, Z=E/Q, X=the 20 standard residues; U, O and * match themselves. JavaScript regex uses the pattern as a regex source, without slash delimiters such as /K.D/i. See the JavaScript regex reference page for syntax and supported flags.",
      defaultValue: defaults.patternMode,
      choices: [
        { value: "plain", label: "Plain text" },
        { value: "iupac", label: "IUPAC motif" },
        { value: "regex", label: "JavaScript regex" }
      ]
    },
    { id: "caseInsensitive", type: "checkbox", label: "Case-insensitive search", defaultValue: defaults.caseInsensitive, help: "Treat uppercase and lowercase letters as equivalent during matching. In regex mode this controls JavaScript i-flag behavior; other regex flags are not user options in this tool." },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: defaults.allowOverlaps, help: "Allows matches that share one or more residue positions." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: defaults.outputFormat,
      choices: [
        { showcase: false, value: "report", label: "Summary report" },
        { showcase: false, value: "text-map", label: "Pattern text map" },
        { showcase: "linear-pattern-map", value: "svg-map", label: "Linear pattern map" },
        { showcase: "protein-sequence-viewer", value: "interactive-viewer", label: "Protein sequence viewer" },
        { showcase: false, value: "tsv", label: "Summary table", resultView: { kind: "table", streamId: "table" } }
      ]
    },
    {
      id: "advancedLimits",
      type: "group",
      label: "Limits",
      collapsible: true,
      collapsed: true,
      options: [
        { id: "proteinPatternInput", type: "limit-value", label: "Input text", value: `${limits.inputCharacters.toLocaleString("en-US")} characters` },
        { id: "proteinPatternRecords", type: "limit-value", label: "Protein records", value: limits.records },
        { id: "proteinPatternWork", type: "limit-value", label: "Scan work", value: `${limits.work.toLocaleString("en-US")} residue-pattern positions`, detail: "This estimate cannot bound JavaScript regex backtracking time." },
        { id: "proteinPatternHits", type: "limit-value", label: "Pattern hits", value: limits.hits },
        { id: "proteinPatternOutput", type: "limit-value", label: "Selected output", value: `${limits.outputCharacters.toLocaleString("en-US")} characters`, detail: "Matched sequence retention is limited to half this amount before output is built." },
        { id: "proteinPatternHeader", type: "limit-value", label: "FASTA header", value: `${limits.headerCharacters.toLocaleString("en-US")} characters` },
        { id: "proteinPatternLength", type: "limit-value", label: "Pattern", value: `${limits.patternCharacters.toLocaleString("en-US")} characters` },
        {
          id: "patternOutputLimitNote",
          type: "note",
          text: `Matched-region sequence streams are capped at ${PROTEIN_PATTERN_MATCHED_REGION_RECORD_THRESHOLD.toLocaleString()} records, and linear pattern maps are capped at ${PROTEIN_PATTERN_SVG_MAP_MATCH_THRESHOLD.toLocaleString()} shown matches. Table output contains all coordinates.`
        }
      ]
    },
    {
      id: "patternNote",
      type: "note",
      text: "Coordinates are 1-based and inclusive after alignment gaps (. and -) and invalid characters are removed. Stop symbols (*) retain their positions and can be matched by user patterns; regex anchors refer to the full record. Amino-acid symbols follow NCBI extended IUPAC notation; compatible-set matching and X covering the 20 standard residues are SMS3 search conventions."
    }
  ]
};
