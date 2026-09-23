// Compact display rows for legacy limit notes. The source notes remain in tool
// metadata for summaries; the registry test ensures every note is reviewed here.
import { MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS } from "../tools/fasta-input-policy.js";

const row = (id, label, value, detail = "") => ({ id, type: "limit-value", label, value, detail });
const richOutputPastedInput = `Up to ${MAX_PASTED_FASTA_CHARACTERS_FOR_RICH_OUTPUTS.toLocaleString("en-US")} pasted characters`;

const generatedOutput = [
  row("generatedRecords", "Generated FASTA records", "10,000 records"),
  row("generatedCharacters", "Generated FASTA text", "5,000,000 characters", "Requests above either bound are reduced with a warning.")
];
const mutationEvents = [
  row("mutationEvents", "Mutation events", "50,000 per input record", "Requests above this bound are reduced with a warning.")
];
const sampledRegions = [
  row("sampledRegions", "Random regions", "50,000 per input record", "Requests above this bound are reduced with a warning.")
];
const motifMap = [
  row("motifTextMap", "Motif text map", "5,000 matches"),
  row("motifLinearMap", "Linear motif map", "120 matches total · 30 per record"),
  row("motifMapLabels", "Linear motif map labels", "48 total · 12 per record", "The table contains all match coordinates.")
];
const seqAlign = [
  row("seqAlignMatrixCells", "seq-align matrix cells", "No fixed SMS3 ceiling", "Available browser memory may limit a run.")
];
const gcPlot = [
  row("preparedGcPlotPoints", "Prepared GC plot track", "About 5,000 points per sequence", "The window size increases for longer records.")
];

// Entries follow the order of note options within each tool's Limits group.
export const TOOL_LIMIT_NOTE_PRESENTATIONS = {
  "plate-layout-planner": [[
    row("plateCount", "Plates per run", "20"),
    row("plateSampleRows", "Sample rows per run", "2,000"),
    row("plateAssignments", "Assignments per run", "7,680"),
    row("plateInputText", "Input text", "1,000,000 characters"),
    row("plateExpandedAssignments", "Expanded assignment data", "8 MB"),
    row("plateEditorDisplay", "Plate editor display", "1 plate at a time")
  ]],
  "variant-consensus-builder": [[]],
  "qpcr-analysis": [[]],
  "base-composition-plot": [[
    row("compositionInput", "Accepted FASTA input", "100 million bases · 10,000 records"),
    row("compositionWindows", "Calculated windows", "50,000 per run"),
    row("compositionPlotWindows", "Windows shown in plot", "5,000", "Increase the step size or select fewer records for a larger run."),
    row("compositionOutput", "Materialized output", "25 MiB")
  ]],
  "codon-usage": [[
    row("codonUsageInput", "Accepted coding input", "1,000 records · 100 million source characters"),
    row("codonUsagePlot", "Records in plot", "20", "Use the table or report for larger collections."),
    row("codonUsageOutput", "Materialized output", "25 MiB")
  ]],
  "codon-adaptation-index": [[
    row("caiInput", "Summary and report input", "10,000 records · 100 million source characters"),
    row("caiRows", "Per-codon output", "250,000 rows"),
    row("caiOutput", "Materialized output", "25 MiB")
  ]],
  "dna-rna-pattern-finder": [[
    row("patternLength", "Plain/IUPAC pattern in large FASTA scans", "1,000 bases"),
    row("patternSource", "Large FASTA scan source", "50 million bases"),
    row("patternWork", "Large FASTA scan work", "500 million symbol comparisons"),
    row("patternHits", "Large FASTA candidate hits", "100,000"),
    row("patternRegionStream", "Matched-region stream", "5,000 records"),
    row("patternOutput", "Materialized output", "25 MiB"),
    row("patternLinearMap", "Linear pattern map", "5,000 matches shown"),
    row("patternBoundedInput", "Text maps, viewers, and JavaScript regex", richOutputPastedInput)
  ]],
  "sequence-editor": [[]],
  "circular-genome-figure": [gcPlot],
  "linear-genome-figure": [gcPlot],
  "genome-figure": [gcPlot],
  "dna-rna-motif-scanner": [motifMap, [
    row("motifSource", "Large FASTA motif scan", "50 million bases"),
    row("motifScoring", "Motif scoring work", "200 million symbol operations"),
    row("motifCandidates", "Candidate hits", "50,000"),
    row("motifOutput", "Materialized output", "25 MiB", "Select a motif or class for larger scans."),
    row("motifBoundedInput", "Text maps and sequence viewers", richOutputPastedInput)
  ]],
  "plasmid-common-feature-scanner": [[
    row("plasmidFeatureMap", "Linear feature map", "12 records · 240 hits total · 80 per record", "The table contains all hit coordinates.")
  ]],
  "table-correlation-matrix": [[]],
  "simple-linear-regression": [[]],
  "multiple-linear-regression": [[]],
  "histogram": [[]],
  "heatmap": [[]],
  "vcf-genotype-table": [[
    row("variantViewerContigs", "Variant region viewer", "12 contigs or chromosomes"),
    row("variantViewerBases", "Displayed region", "1,000,000 bp")
  ]],
  "venn-diagram": [[row("vennLists", "Venn diagram", "3 lists", "Use UpSet Plot for larger comparisons.")]],
  "vector-contamination-scanner": [[
    row("vectorSource", "Large FASTA scan source", "10 million bases"),
    row("vectorWindows", "A/C/G/T query windows", "5 million"),
    row("vectorSeedExtensions", "Seed extensions", "100,000"),
    row("vectorCandidates", "Candidate hits", "20,000"),
    row("vectorOutput", "Materialized output", "25 MiB"),
    row("vectorBoundedInput", "Text maps and sequence viewers", richOutputPastedInput)
  ], [
    row("vectorLinearMap", "Linear contamination map", "5,000 hits shown", "The table contains all hit coordinates."),
    row("vectorIndexedHeader", "FAI-backed source metadata", "Indexed sequence names", "Full FASTA header descriptions and line formatting are unavailable.")
  ]],
  "restriction-summary": [[
    row("restrictionSource", "Large FASTA scan source", "50 million bases"),
    row("restrictionWork", "Enzyme-window evaluations", "1 billion"),
    row("restrictionSites", "Retained sites", "100,000"),
    row("restrictionRows", "Summary rows", "50,000"),
    row("restrictionOutput", "Materialized output", "25 MiB"),
    row("restrictionSingleMap", "Single-line map", "5,000 sites shown"),
    row("restrictionBoundedInput", "FASTA text maps, detailed maps, and viewers", richOutputPastedInput)
  ]],
  "restriction-digest": [[]],
  "mutate-dna-rna": [mutationEvents],
  "mutate-protein": [mutationEvents],
  "random-coding-dna": [generatedOutput],
  "random-dna-rna": [generatedOutput],
  "random-dna-fragmenter": [[
    row("randomFragments", "Random fragments", "20,000 per input record", "Requests above this bound are reduced with a warning.")
  ]],
  "random-dna-rna-regions": [sampledRegions],
  "random-protein": [generatedOutput],
  "random-protein-regions": [sampledRegions],
  "sample-dna-rna": [generatedOutput],
  "sample-protein": [generatedOutput],
  "fasta-validator-normalizer": [[
    row("fastaSourceFile", "Source file", "512 MiB"),
    row("fastaDecodedText", "Decoded text", "150 MiB"),
    row("fastaRecords", "Accepted FASTA", "10,000 records · 100 million sequence characters"),
    row("fastaHeader", "FASTA header", "10,000 characters each · 5 million total"),
    row("fastaSidecars", "FAI and GZI sidecars", "16 MiB each"),
    row("fastaOutput", "Materialized output", "26,214,400 characters"),
    row("fastaReverseDuplicateCheck", "Reverse-complement duplicate check", "25 million bases")
  ]],
  "fasta-length-filter": [[
    row("filterSourceFile", "Source file", "512 MiB"),
    row("filterDecodedText", "Decoded text", "150 MiB"),
    row("filterRecords", "Accepted FASTA", "10,000 records · 100 million sequence characters"),
    row("filterHeader", "FASTA header", "10,000 characters each · 5 million total"),
    row("filterSidecars", "FAI and GZI sidecars", "16 MiB each"),
    row("filterSelectionText", "Sequence filter text", "10,000 characters"),
    row("filterOutput", "Selected output", "26,214,400 characters")
  ]],
  "protein-digest": [[
    row("peptideMap", "Peptide map", "12 proteins · 300 peptides · 10,000 input residues")
  ]],
  "protein-hydropathy": [[]],
  "protein-pattern-finder": [[
    row("proteinPatternRegions", "Matched-region stream", "5,000 records"),
    row("proteinPatternMap", "Linear pattern map", "5,000 matches shown", "The table contains all match coordinates.")
  ]],
  "protein-motif-scanner": [motifMap],
  "pairwise-align-dna-rna": [seqAlign],
  "pairwise-align-coding-dna": [seqAlign],
  "pairwise-align-protein": [seqAlign],
  "sequence-stats-dna-rna": [[
    row("sequenceStatsFile", "Source file", "512 MiB"),
    row("sequenceStatsDecoded", "Decoded text", "150 MiB"),
    row("sequenceStatsInput", "Accepted input", "10,000 records · 100 million source characters"),
    row("sequenceStatsOutput", "Materialized report or table", "25 MiB")
  ]],
  "orf-finder": [[]]
};

export function presentToolLimitNote(metadataId, noteIndex) {
  return TOOL_LIMIT_NOTE_PRESENTATIONS[metadataId]?.[noteIndex] ?? null;
}
