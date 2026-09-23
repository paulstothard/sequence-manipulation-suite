export const DISABLED_TOOL_LIMIT_IDS_OPTION = "disabledToolLimitIds";

const SHARED_LIMIT_POLICIES = Object.freeze({
  standardFileUploadLimit: Object.freeze({}),
  decodedTextImportLimit: Object.freeze({}),
  workbookImportLimit: Object.freeze({})
});

// A limit belongs here only after its complete enforcement path has been
// audited. Rows omitted from this map remain informational, fixed ceilings.
// In particular, structural requirements and visual-density caps are not
// disableable even when SMS3 controls their numeric value.
const TOOL_LIMIT_POLICIES = Object.freeze({
  "base-composition-plot": Object.freeze({
    compositionInput: Object.freeze({}),
    compositionWindows: Object.freeze({}),
    compositionOutput: Object.freeze({})
  }),
  "codon-usage": Object.freeze({
    codonUsageInput: Object.freeze({}),
    codonUsageOutput: Object.freeze({})
  }),
  "codon-adaptation-index": Object.freeze({
    caiInput: Object.freeze({}),
    caiRows: Object.freeze({}),
    caiOutput: Object.freeze({})
  }),
  "dna-rna-pattern-finder": Object.freeze({
    patternLength: Object.freeze({}),
    patternSource: Object.freeze({}),
    patternWork: Object.freeze({}),
    patternHits: Object.freeze({}),
    patternRegionStream: Object.freeze({}),
    patternOutput: Object.freeze({})
  }),
  "dna-rna-motif-scanner": Object.freeze({
    motifSource: Object.freeze({}),
    motifScoring: Object.freeze({}),
    motifCandidates: Object.freeze({}),
    motifOutput: Object.freeze({})
  }),
  "technical-sequence-scanner": Object.freeze({
    technicalLargeSourceLimitNote: Object.freeze({}),
    technicalComparisonLimits: Object.freeze({}),
    technicalCandidateHitLimit: Object.freeze({}),
    technicalOutputLimit: Object.freeze({})
  }),
  "vector-contamination-scanner": Object.freeze({
    vectorSource: Object.freeze({}),
    vectorWindows: Object.freeze({}),
    vectorSeedExtensions: Object.freeze({}),
    vectorCandidates: Object.freeze({}),
    vectorOutput: Object.freeze({}),
    maxHitsPerRecord: Object.freeze({})
  }),
  "restriction-summary": Object.freeze({
    restrictionSource: Object.freeze({}),
    restrictionWork: Object.freeze({}),
    restrictionSites: Object.freeze({}),
    restrictionRows: Object.freeze({}),
    restrictionOutput: Object.freeze({})
  }),
  "fasta-validator-normalizer": Object.freeze({
    fastaSourceFile: Object.freeze({}),
    fastaDecodedText: Object.freeze({}),
    fastaRecords: Object.freeze({}),
    fastaOutput: Object.freeze({})
  }),
  "fasta-length-filter": Object.freeze({
    filterSourceFile: Object.freeze({}),
    filterDecodedText: Object.freeze({}),
    filterRecords: Object.freeze({}),
    filterOutput: Object.freeze({})
  }),
  "sequence-stats-dna-rna": Object.freeze({
    sequenceStatsFile: Object.freeze({}),
    sequenceStatsDecoded: Object.freeze({}),
    sequenceStatsInput: Object.freeze({}),
    sequenceStatsOutput: Object.freeze({})
  }),
  "qpcr-analysis": Object.freeze({
    maxReactions: Object.freeze({}),
    maxInputCharacters: Object.freeze({}),
    maxInputTable: Object.freeze({}),
    maxAnalysisDimensions: Object.freeze({}),
    maxSampleResults: Object.freeze({})
  }),
  "protein-digest": Object.freeze({
    maxInputCharacters: Object.freeze({}),
    maxProteinRecords: Object.freeze({}),
    maxInputResidues: Object.freeze({ unlocksOptionIds: Object.freeze(["minLength", "maxLength"]) }),
    maxPeptides: Object.freeze({}),
    maxExportedResidues: Object.freeze({})
  }),
  "proteome-reciprocal-best-match": Object.freeze({
    maxProteinsPerProteome: Object.freeze({}),
    maxSequenceLength: Object.freeze({}),
    maxPairwiseAlignments: Object.freeze({})
  }),
  "dna-rna-set-reciprocal-best-match": Object.freeze({
    maxProteinsPerProteome: Object.freeze({}),
    maxSequenceLength: Object.freeze({}),
    maxPairwiseAlignments: Object.freeze({})
  }),
  "mutate-dna-rna": Object.freeze({
    mutationEvents: Object.freeze({ unlocksOptionIds: Object.freeze(["mutationCount", "insertionCount", "deletionCount"]) })
  }),
  "mutate-protein": Object.freeze({
    mutationEvents: Object.freeze({ unlocksOptionIds: Object.freeze(["mutationCount", "insertionCount", "deletionCount"]) })
  }),
  "random-coding-dna": Object.freeze({
    generatedRecords: Object.freeze({ unlocksOptionIds: Object.freeze(["sequenceCount"]) }),
    generatedCharacters: Object.freeze({ unlocksOptionIds: Object.freeze(["codonCount"]) })
  }),
  "random-dna-rna": Object.freeze({
    generatedRecords: Object.freeze({ unlocksOptionIds: Object.freeze(["sequenceCount"]) }),
    generatedCharacters: Object.freeze({ unlocksOptionIds: Object.freeze(["sequenceLength"]) })
  }),
  "random-protein": Object.freeze({
    generatedRecords: Object.freeze({ unlocksOptionIds: Object.freeze(["sequenceCount"]) }),
    generatedCharacters: Object.freeze({ unlocksOptionIds: Object.freeze(["sequenceLength"]) })
  }),
  "sample-dna-rna": Object.freeze({
    generatedRecords: Object.freeze({ unlocksOptionIds: Object.freeze(["samplesPerRecord"]) }),
    generatedCharacters: Object.freeze({ unlocksOptionIds: Object.freeze(["sampleLength"]) })
  }),
  "sample-protein": Object.freeze({
    generatedRecords: Object.freeze({ unlocksOptionIds: Object.freeze(["samplesPerRecord"]) }),
    generatedCharacters: Object.freeze({ unlocksOptionIds: Object.freeze(["sampleLength"]) })
  }),
  "random-dna-rna-regions": Object.freeze({
    sampledRegions: Object.freeze({ unlocksOptionIds: Object.freeze(["regionCount"]) })
  }),
  "random-protein-regions": Object.freeze({
    sampledRegions: Object.freeze({ unlocksOptionIds: Object.freeze(["regionCount"]) })
  }),
  "random-dna-fragmenter": Object.freeze({
    randomFragments: Object.freeze({ unlocksOptionIds: Object.freeze(["fragmentCount"]) })
  }),
  "extract-subsequences-dna-rna": Object.freeze({
    outputRecordLimitNote: Object.freeze({})
  }),
  "extract-subsequences-protein": Object.freeze({
    outputRecordLimitNote: Object.freeze({})
  }),
  "genomic-interval-operations": Object.freeze({
    maxQueryIntervals: Object.freeze({}),
    maxReferenceIntervals: Object.freeze({}),
    maxOutputRows: Object.freeze({}),
    maxInputCharacters: Object.freeze({})
  }),
  "gff-gtf-feature-extractor": Object.freeze({
    maxFeatures: Object.freeze({}),
    maxOutputRecords: Object.freeze({}),
    maxInputBases: Object.freeze({})
  }),
  "read-mapping-coverage": Object.freeze({
    maxReferenceBases: Object.freeze({}),
    maxReads: Object.freeze({}),
    maxReportedAlignments: Object.freeze({})
  }),
  "fasta-index-creator": Object.freeze({ maxInputCharacters: Object.freeze({}) }),
  "genome-comparison-poster": Object.freeze({
    maxBlocks: Object.freeze({}),
    maxReferenceLength: Object.freeze({}),
    maxComparisonLength: Object.freeze({})
  }),
  "indexed-fasta-region-extractor": Object.freeze({ maxBasesPerRegion: Object.freeze({}) }),
  "in-silico-pcr": Object.freeze({
    maxBindingSitesPerTemplate: Object.freeze({}),
    maxProducts: Object.freeze({})
  }),
  "lightweight-sequence-assembly": Object.freeze({ maxAssemblyRecords: Object.freeze({}) }),
  "table-sql-query": Object.freeze({
    maxInputRows: Object.freeze({}),
    maxOutputRows: Object.freeze({})
  }),
  "table-column-comparison": Object.freeze({
    maxPairRows: Object.freeze({})
  }),
  "tsne-plot": Object.freeze({
    maxRows: Object.freeze({}),
    maxNumericColumns: Object.freeze({})
  }),
  "two-group-permutation-test": Object.freeze({
    maxExactPermutations: Object.freeze({})
  }),
  "protein-pattern-finder": Object.freeze({
    proteinPatternRegions: Object.freeze({})
  }),
  "pcr-primer-design": Object.freeze({
    maxTemplateLength: Object.freeze({}),
    maxPairsToEvaluate: Object.freeze({}),
    maxReferenceRecordLength: Object.freeze({}),
    maxIndexedReferenceBases: Object.freeze({})
  }),
  "crispr-guide-design": Object.freeze({
    maxCandidatesPerRecord: Object.freeze({}),
    maxOffTargetMatchesPerGuide: Object.freeze({}),
    maxOffTargetRows: Object.freeze({}),
    maxReferenceRecordLength: Object.freeze({}),
    maxIndexedReferenceBases: Object.freeze({})
  }),
  "sirna-design": Object.freeze({
    maxCandidatesPerRecord: Object.freeze({}),
    maxOffTargetMatchesPerCandidate: Object.freeze({}),
    maxOffTargetRows: Object.freeze({}),
    maxReferenceRecordLength: Object.freeze({}),
    maxIndexedReferenceBases: Object.freeze({})
  }),
  "talen-target-finder": Object.freeze({
    maxPairsPerRecord: Object.freeze({}),
    maxRecordLength: Object.freeze({}),
    maxCandidateWindows: Object.freeze({}),
    maxReferenceRecordLength: Object.freeze({}),
    maxIndexedReferenceBases: Object.freeze({})
  }),
  "variant-consensus-builder": Object.freeze({
    maxVariants: Object.freeze({}),
    maxInputCharacters: Object.freeze({}),
    maxReferenceBases: Object.freeze({}),
    maxOutputBases: Object.freeze({}),
    maxSamplesAndContigs: Object.freeze({}),
    maxIdentifierLength: Object.freeze({}),
    maxPhaseBlocks: Object.freeze({}),
    maxOutputRecords: Object.freeze({}),
    maxTableCharacters: Object.freeze({})
  }),
  "vcf-filter": Object.freeze({ maxVariants: Object.freeze({}) }),
  "vcf-random-sampler": Object.freeze({ maxInputVariants: Object.freeze({}) }),
  "multiple-align-coding-dna": Object.freeze({
    maxAlignmentRecords: Object.freeze({}),
    maxTotalSymbols: Object.freeze({}),
    maxAlignmentCells: Object.freeze({})
  }),
  "multiple-align-dna-rna": Object.freeze({
    maxAlignmentRecords: Object.freeze({}),
    maxTotalSymbols: Object.freeze({}),
    maxAlignmentCells: Object.freeze({})
  }),
  "multiple-align-protein": Object.freeze({
    maxAlignmentRecords: Object.freeze({}),
    maxTotalSymbols: Object.freeze({}),
    maxAlignmentCells: Object.freeze({})
  }),
  "phylogeny-builder": Object.freeze({
    maxAlignmentRecords: Object.freeze({}),
    maxTotalSymbols: Object.freeze({}),
    maxAlignmentCells: Object.freeze({})
  }),
  "pairwise-align-coding-dna": Object.freeze({ maxAlignmentCells: Object.freeze({}) }),
  "pairwise-align-dna-rna": Object.freeze({ maxAlignmentCells: Object.freeze({}) }),
  "pairwise-align-protein": Object.freeze({ maxAlignmentCells: Object.freeze({}) }),
  "fastq-preprocess": Object.freeze({
    maxReads: Object.freeze({}),
    maxInputBases: Object.freeze({}),
    maxInputBytes: Object.freeze({})
  }),
  "fastq-read-sampler": Object.freeze({
    maxInputReads: Object.freeze({}),
    maxOutputBytes: Object.freeze({})
  }),
  "fastq-summary": Object.freeze({
    maxReads: Object.freeze({}),
    maxInputCharacters: Object.freeze({}),
    maxDuplicateSequences: Object.freeze({})
  }),
  "read-simulator": Object.freeze({
    maxReads: Object.freeze({ unlocksOptionIds: Object.freeze(["readCount"]) }),
    maxReferenceLength: Object.freeze({})
  })
});

export function getToolLimitPolicy(toolId, limitId) {
  return TOOL_LIMIT_POLICIES[toolId]?.[limitId] ?? SHARED_LIMIT_POLICIES[limitId] ?? null;
}

export function normalizeDisabledToolLimitIds(toolId, value) {
  const ids = Array.isArray(value) ? value : [];
  return [...new Set(ids
    .map((id) => String(id ?? ""))
    .filter((id) => getToolLimitPolicy(toolId, id)))];
}

export function isToolLimitDisabled(options, limitId) {
  return Array.isArray(options?.[DISABLED_TOOL_LIMIT_IDS_OPTION]) &&
    options[DISABLED_TOOL_LIMIT_IDS_OPTION].includes(limitId);
}

export function effectiveToolLimit(options, limitId, enforcedValue) {
  return isToolLimitDisabled(options, limitId) ? Infinity : enforcedValue;
}

export function applyDisabledFastaSourceLimits(options, limitIdsByOption = {}) {
  const effective = { ...options };
  for (const [optionId, limitId] of Object.entries(limitIdsByOption)) {
    if (isToolLimitDisabled(options, limitId)) effective[optionId] = Infinity;
  }
  return effective;
}
