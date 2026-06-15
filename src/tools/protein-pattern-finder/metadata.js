import { proteinPatternFinderTableColumns } from "./run.js";

export const proteinPatternFinderMetadata = {
  id: "protein-pattern-finder",
  name: "Protein Pattern Finder",
  category: "Sequence Analysis",
  tags: ["protein", "raw", "motif", "regex", "search"],
  summary:
    "Find plain-text, IUPAC, or regular-expression protein motifs and report match coordinates.",
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
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "protein-pattern-finder", columns: proteinPatternFinderTableColumns },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "protein-sequence-viewer" },
      { id: "matchedRegions", kind: "sequence-records", alphabet: "protein", schema: "protein-pattern-finder" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "pattern",
      type: "text",
      label: "Pattern",
      help: "Enter the protein pattern to find. In IUPAC mode, ambiguity symbols such as B, Z, J, and X are interpreted as residue sets.",
      defaultValue: "KDD"
    },
    {
      id: "patternMode",
      type: "radio",
      label: "Pattern mode",
      help: "Plain text searches for exact characters. IUPAC motif expands protein ambiguity symbols. JavaScript regex uses the pattern as a regex source, without slash delimiters such as /K.D/i. See the JavaScript regex reference page for syntax and supported flags.",
      defaultValue: "plain",
      choices: [
        { value: "plain", label: "Plain text" },
        { value: "iupac", label: "IUPAC motif" },
        { value: "regex", label: "JavaScript regex" }
      ]
    },
    { id: "caseInsensitive", type: "checkbox", label: "Case-insensitive search", defaultValue: true, help: "Treat uppercase and lowercase letters as equivalent during matching. In regex mode this controls JavaScript i-flag behavior; other regex flags are not user options in this tool." },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: true, help: "Allows matches that share one or more residue positions." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "report",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "text-map", label: "Pattern text map" },
        { value: "svg-map", label: "Linear pattern map" },
        { value: "interactive-viewer", label: "Protein sequence viewer" },
        { value: "tsv", label: "Table" }
      ]
    },
    {
      id: "patternNote",
      type: "note",
      text: "IUPAC motif mode treats B, J, Z, and X as ambiguity symbols. Regex mode uses JavaScript regular-expression source syntax; use the case-insensitive checkbox for i-flag behavior. Alignment gap characters (. and -) are removed before searching. Coordinates are 1-based and inclusive on the cleaned sequence."
    }
  ]
};
