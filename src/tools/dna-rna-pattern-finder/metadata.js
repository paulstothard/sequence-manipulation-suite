import { dnaRnaPatternFinderTableColumns } from "./run.js";

export const dnaRnaPatternFinderMetadata = {
  id: "dna-rna-pattern-finder",
  name: "DNA/RNA Pattern Finder",
  category: "Sequence Analysis",
  tags: ["DNA", "RNA", "raw", "motif", "regex", "search"],
  summary:
    "Find plain-text, IUPAC, or regular-expression DNA/RNA motifs on one or both strands.",
  inputType: "DNA/RNA sequence",
  outputType: "Match report, table, pattern text map, linear pattern map, linear DNA sequence viewer",
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
      { id: "report", kind: "text", mediaType: "text/plain" },
      { id: "textMap", kind: "text", mediaType: "text/plain" },
      { id: "table", kind: "table", schema: "dna-rna-pattern-finder", columns: dnaRnaPatternFinderTableColumns },
      { id: "overview", kind: "text", mediaType: "image/svg+xml" },
      { id: "viewer", kind: "viewer", viewerType: "dna-sequence-viewer" },
      { id: "matchedRegions", kind: "sequence-records", alphabet: "dna-rna", schema: "dna-rna-pattern-finder" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  options: [
    {
      id: "pattern",
      type: "text",
      label: "Pattern",
      help: "Enter the sequence pattern to find. In IUPAC mode, ambiguity symbols such as N, R, and Y are interpreted biologically.",
      defaultValue: "ATGN"
    },
    {
      id: "patternMode",
      type: "radio",
      label: "Pattern mode",
      help: "Plain text searches for exact characters. IUPAC motif expands ambiguity codes. JavaScript regex uses the pattern as a regex source, without slash delimiters such as /ATG/i. See the JavaScript regex reference page for syntax and supported flags.",
      defaultValue: "iupac",
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
      defaultValue: "forward",
      choices: [
        { value: "forward", label: "Forward only" },
        { value: "both", label: "Both strands" }
      ]
    },
    { id: "caseInsensitive", type: "checkbox", label: "Case-insensitive search", defaultValue: true, help: "Treat uppercase and lowercase letters as equivalent during matching. In regex mode this controls JavaScript i-flag behavior; other regex flags are not user options in this tool." },
    { id: "allowOverlaps", type: "checkbox", label: "Allow overlapping matches", defaultValue: true, help: "Allows matches that share one or more sequence positions, such as finding ATA twice in ATATA." },
    {
      id: "outputFormat",
      type: "radio",
      label: "Output format",
      defaultValue: "report",
      choices: [
        { value: "report", label: "Summary report" },
        { value: "text-map", label: "Pattern text map" },
        { value: "svg-map", label: "Linear pattern map" },
        { value: "interactive-viewer", label: "Linear DNA sequence viewer" },
        { value: "interactive-circular-viewer", label: "Circular DNA sequence viewer" },
        { value: "tsv", label: "Table" }
      ]
    },
    {
      id: "patternNote",
      type: "note",
      text: "IUPAC motif mode treats ambiguity codes as matching symbols with overlapping possible bases. Regex mode uses JavaScript regular-expression source syntax; use the case-insensitive checkbox for i-flag behavior. Alignment gap characters (. and -) are removed before searching. Coordinates are 1-based and inclusive on the cleaned sequence."
    }
  ]
};
