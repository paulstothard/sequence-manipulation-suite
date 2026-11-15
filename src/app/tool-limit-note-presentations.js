import { VECTOR_SCAN_LIMITS as vectorLimits } from "../core/vector-contamination-options.js";
import { SEQUENCE_STATS_OUTPUT_CHARACTERS } from "../core/sequence-stats-options.js";
import { PLASMID_FEATURE_LIMITS as plasmidLimits } from "../core/plasmid-common-feature-options.js";
import { DNA_RNA_PATTERN_LIMITS as patternLimits } from "../core/dna-rna-pattern-options.js";
import { DNA_RNA_MOTIF_LIMITS as motifLimits } from "../core/motif-scanner-options.js";
import { CODON_USAGE_LIMITS as usageLimits } from "../core/codon-usage-options.js";
import { CODON_ADAPTATION_INDEX_LIMITS as caiLimits } from "../core/codon-adaptation-options.js";
import { BASE_COMPOSITION_LIMITS as compositionLimits } from "../core/base-composition-options.js";
import { FASTA_RECORD_SOURCE_LIMITS as sourceLimits } from "../core/fasta-record-source.js";
// Compact display rows for legacy limit notes. The source notes remain in tool
// metadata for summaries; the registry test ensures every note is reviewed here.
import { ASSEMBLY_LIMITS } from "../core/lightweight-assembly-options.js";
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
const gcPlot = [
  row("preparedGcPlotPoints", "Prepared GC plot track", "About 5,000 points per sequence", "The window size increases for longer records.")
];

// Entries follow the order of note options within each tool's Limits group.
export const TOOL_LIMIT_NOTE_PRESENTATIONS = {
  "lightweight-sequence-assembly": [[
    row("assemblyInputLimits", "Fixed input allocation", `${ASSEMBLY_LIMITS.inputCharacters.toLocaleString("en-US")} characters · ${ASSEMBLY_LIMITS.inputRecords.toLocaleString("en-US")} records`, "These ceilings remain enforced when the normal read/contig cap is disabled."),
    row("assemblyReadLimits", "Individual read", `${ASSEMBLY_LIMITS.readBases.toLocaleString("en-US")} bases · ${ASSEMBLY_LIMITS.readCharacters.toLocaleString("en-US")} source characters`),
    row("assemblyTotalBases", "Total input bases", ASSEMBLY_LIMITS.totalBases.toLocaleString("en-US")),
    row("assemblyTitleLimit", "Individual title", `${ASSEMBLY_LIMITS.titleCharacters.toLocaleString("en-US")} characters`),
    row("assemblyWorkLimits", "Assembly work", `${ASSEMBLY_LIMITS.readTrials.toLocaleString("en-US")} read trials · ${ASSEMBLY_LIMITS.comparisons.toLocaleString("en-US")} base comparisons`),
    row("assemblyOutputLimits", "Generated output", `${ASSEMBLY_LIMITS.mapCells.toLocaleString("en-US")} text-map cells · ${ASSEMBLY_LIMITS.outputCharacters.toLocaleString("en-US")} characters`)
  ]],
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
    row("compositionInput", "Accepted FASTA input", `${sourceLimits.maxAcceptedBases / 1e6} million bases · ${sourceLimits.maxRecords.toLocaleString("en-US")} records`),
    row("compositionWindows", "Calculated windows", `${compositionLimits.windowRows.toLocaleString("en-US")} per run`),
    row("compositionPlotWindows", "Windows shown in plot", compositionLimits.plotWindows.toLocaleString("en-US"), "Increase the step size or select fewer records for a larger run."),
    row("compositionOutput", "Materialized output", `${compositionLimits.outputCharacters.toLocaleString("en-US")} characters`, "Output above this ceiling is rejected.")
  ]],
  "codon-usage": [[
    row("codonUsageInput", "Accepted coding input", `${usageLimits.maxRecords.toLocaleString("en-US")} records · ${sourceLimits.maxAcceptedBases / 1e6} million non-whitespace sequence characters · ${sourceLimits.maxSourceBytes / 1048576} MiB file · ${sourceLimits.maxDecodedBytes / 1048576} MiB decoded text`),
    row("codonUsagePlot", "Records in plot", String(usageLimits.maxPlotRecords), "Use the table or report for larger collections."),
    row("codonUsageOutput", "Materialized output", `${usageLimits.maxMaterializedOutputCharacters.toLocaleString("en-US")} characters`),
    row("codonUsageHeader", "Individual FASTA header", `${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters`),
    row("codonUsageHeaders", "Combined FASTA headers", `${sourceLimits.maxTotalHeaderCharacters / 1e6} million characters`),
    row("codonUsageIndex", "Index files", `${sourceLimits.maxIndexBytes / 1048576} MiB each`)
  ]],
  "codon-adaptation-index": [[
    row("caiInput", "Input source", `${caiLimits.maxRecords.toLocaleString("en-US")} records · ${sourceLimits.maxAcceptedBases / 1e6} million non-whitespace sequence characters · ${sourceLimits.maxSourceBytes / 1048576} MiB file · ${sourceLimits.maxDecodedBytes / 1048576} MiB decoded text`, "Input above any of these ceilings is rejected."),
    row("caiRows", "Per-codon output", `${caiLimits.maxCodonRows.toLocaleString("en-US")} rows`, "Larger codon tables are rejected; select a summary table or report."),
    row("caiOutput", "Materialized output", `${caiLimits.maxMaterializedOutputCharacters.toLocaleString("en-US")} characters`, "Output above this ceiling is rejected."),
    row("caiHeader", "Individual FASTA header", `${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters`, "Longer headers are rejected."),
    row("caiHeaders", "Combined FASTA headers", `${sourceLimits.maxTotalHeaderCharacters / 1e6} million characters`, "Input above this ceiling is rejected."),
    row("caiIndex", "Index files", `${sourceLimits.maxIndexBytes / 1048576} MiB each`, "Larger index files are rejected.")
  ]],
  "dna-rna-pattern-finder": [[
    row("patternLength", "Plain/IUPAC pattern", `${patternLimits.patternCharacters.toLocaleString("en-US")} characters`, "Fixed scanner window bounds still apply when this ceiling is disabled."),
    row("patternSource", "Pattern input", `${patternLimits.inputCharacters / 1e6} million non-whitespace input characters · ${sourceLimits.maxRecords.toLocaleString("en-US")} records`, `Applies to pasted and file input. Source files: ${sourceLimits.maxSourceBytes / 1048576} MiB; decoded text: ${sourceLimits.maxDecodedBytes / 1048576} MiB. Headers: ${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters each, ${sourceLimits.maxTotalHeaderCharacters / 1e6} million total; indexes: ${sourceLimits.maxIndexBytes / 1048576} MiB (fixed).`),
    row("patternWork", "Plain/IUPAC scan work", `${patternLimits.work / 1e6} million symbol comparisons`),
    row("patternHits", "Candidate hits", patternLimits.hits.toLocaleString("en-US"), "Both strands combined; fixed-width candidates are counted before removing overlaps."),
    row("patternRegionStream", "Matched regions in workflows", `${patternLimits.regionRecords.toLocaleString("en-US")} records`),
    row("patternOutput", "Materialized output", `${patternLimits.outputCharacters.toLocaleString("en-US")} characters`, "Applies to retained hit rows, regex matched sequence and the selected output."),
    row("patternLinearMap", "Linear pattern map", `${patternLimits.mapMatches.toLocaleString("en-US")} matches shown`),
    row("patternBoundedInput", "Text maps, viewers, and JavaScript regex", richOutputPastedInput)
  ]],
  "sequence-editor": [[]],
  "circular-genome-figure": [gcPlot],
  "linear-genome-figure": [gcPlot],
  "genome-figure": [gcPlot],
  "dna-rna-motif-scanner": [motifMap, [
    row("motifSource", "Motif input", `${motifLimits.inputCharacters / 1e6} million non-whitespace input characters · ${sourceLimits.maxRecords.toLocaleString("en-US")} records`, `Applies to pasted and file input. Source files: ${sourceLimits.maxSourceBytes / 1048576} MiB; decoded text: ${sourceLimits.maxDecodedBytes / 1048576} MiB. Headers: ${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters each, ${sourceLimits.maxTotalHeaderCharacters / 1e6} million total; indexes: ${sourceLimits.maxIndexBytes / 1048576} MiB (fixed).`),
    row("motifScoring", "Motif scoring work", `${motifLimits.work / 1e6} million symbol operations`),
    row("motifCandidates", "Candidate hits", motifLimits.hits.toLocaleString("en-US")),
    row("motifOutput", "Materialized output", `${motifLimits.outputCharacters.toLocaleString("en-US")} characters`, "Applies to retained hit rows and the selected output. Select a motif or class for larger scans."),
    row("motifBoundedInput", "Text maps and sequence viewers", richOutputPastedInput)
  ]],
  "plasmid-common-feature-scanner": [[
    row("plasmidInput", "Scan input", `${plasmidLimits.maxInputCharacters.toLocaleString("en-US")} non-whitespace characters · ${sourceLimits.maxRecords.toLocaleString("en-US")} records`),
    row("plasmidWork", "Scan work", `${plasmidLimits.maxComparisons.toLocaleString("en-US")} symbol comparisons`),
    row("plasmidHits", "Retained hits", `${plasmidLimits.maxHits.toLocaleString("en-US")} hits`),
    row("plasmidOutput", "Retained hit text and serialized result", `${plasmidLimits.maxRetainedCharacters.toLocaleString("en-US")} retained-hit characters · ${plasmidLimits.maxOutputCharacters.toLocaleString("en-US")} serialized-result characters`),
    row("plasmidTextMap", "Text annotation map", `${plasmidLimits.textMapBases.toLocaleString("en-US")} bases · ${plasmidLimits.textMapHits.toLocaleString("en-US")} hits`),
    row("plasmidSourceFile", "Scan source file", `${sourceLimits.maxSourceBytes / 1048576} MiB`, "The shared text upload ceiling also applies."),
    row("plasmidDecodedSource", "Decoded scan source", `${sourceLimits.maxDecodedBytes / 1048576} MiB`, "The shared decoded text ceiling also applies."),
    row("plasmidHeader", "Individual FASTA header", `${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters`),
    row("plasmidHeaders", "Combined FASTA headers", `${sourceLimits.maxTotalHeaderCharacters.toLocaleString("en-US")} characters`)
  ], [
    row("plasmidFeatureMap", "Linear feature map", `${plasmidLimits.mapRecords} records · ${plasmidLimits.mapTotalHits} hits total · ${plasmidLimits.mapRecordHits} per record`, "The table contains all hit coordinates.")
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
    row("vectorSource", "Scan source", `${vectorLimits.inputCharacters / 1e6} million non-whitespace characters · ${sourceLimits.maxRecords.toLocaleString("en-US")} records`, `All sources; file size ${sourceLimits.maxSourceBytes / 1048576} MiB, decoded text ${sourceLimits.maxDecodedBytes / 1048576} MiB. Fixed metadata bounds: ${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters per header, ${sourceLimits.maxTotalHeaderCharacters / 1e6} million total header characters, ${sourceLimits.maxIndexBytes / 1048576} MiB sidecar indexes.`),
    row("vectorWindows", "A/C/G/T query windows", `${vectorLimits.queryWindows / 1e6} million`),
    row("vectorSeedExtensions", "Seed extensions", vectorLimits.seedExtensions.toLocaleString("en-US")),
    row("vectorCandidates", "Candidate hits", vectorLimits.candidateRows.toLocaleString("en-US")),
    row("vectorOutput", "Materialized output", `${vectorLimits.outputCharacters.toLocaleString("en-US")} characters`, "Applies to retained candidate rows and the serialized selected result."),
    row("vectorBoundedInput", "Text maps and sequence viewers", richOutputPastedInput)
  ], [
    row("vectorLinearMap", "Linear contamination map", `${vectorLimits.mapHits.toLocaleString("en-US")} hits shown`, "The table contains all retained hit coordinates, subject to the per-record cap."),
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
  "sequence-stats-dna-rna": [[
    row("sequenceStatsFile", "Source file", `${sourceLimits.maxSourceBytes / 1048576} MiB`),
    row("sequenceStatsDecoded", "Decoded text", `${sourceLimits.maxDecodedBytes / 1048576} MiB`),
    row("sequenceStatsInput", "Accepted input", `${sourceLimits.maxRecords.toLocaleString("en-US")} records · ${sourceLimits.maxAcceptedBases / 1e6} million source characters`),
    row("sequenceStatsOutput", "Selected output", `${SEQUENCE_STATS_OUTPUT_CHARACTERS.toLocaleString("en-US")} characters`),
    row("sequenceStatsHeaders", "FASTA headers", `${sourceLimits.maxHeaderCharacters.toLocaleString("en-US")} characters each · ${sourceLimits.maxTotalHeaderCharacters.toLocaleString("en-US")} total`),
    row("sequenceStatsIndex", "Each index sidecar", `${sourceLimits.maxIndexBytes / 1048576} MiB`)
  ]],
  "orf-finder": [[]]
};

export function presentToolLimitNote(metadataId, noteIndex) {
  return TOOL_LIMIT_NOTE_PRESENTATIONS[metadataId]?.[noteIndex] ?? null;
}
