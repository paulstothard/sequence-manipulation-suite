import {
  cleanFilterDnaRnaMetadata,
  cleanFilterProteinMetadata
} from "./clean-filter-sequence/metadata.js";
import {
  runCleanFilterDnaRna,
  runCleanFilterProtein
} from "./clean-filter-sequence/run.js";
import { baseCompositionPlotMetadata } from "./base-composition-plot/metadata.js";
import { runBaseCompositionPlot } from "./base-composition-plot/run.js";
import { codonUsageMetadata } from "./codon-usage/metadata.js";
import { runCodonUsage } from "./codon-usage/run.js";
import { codonAdaptationIndexMetadata } from "./codon-adaptation-index/metadata.js";
import { runCodonAdaptationIndex } from "./codon-adaptation-index/run.js";
import {
  dnaRnaAlignmentDotPlotMetadata,
  proteinAlignmentDotPlotMetadata
} from "./alignment-dot-plot/metadata.js";
import {
  runDnaRnaAlignmentDotPlot,
  runProteinAlignmentDotPlot
} from "./alignment-dot-plot/run.js";
import { biologicalRecordFormatConverterMetadata } from "./biological-record-format-converter/metadata.js";
import { runBiologicalRecordFormatConverter } from "./biological-record-format-converter/run.js";
import { gffGtfFeatureExtractorMetadata } from "./gff-gtf-feature-extractor/metadata.js";
import { runGffGtfFeatureExtractor } from "./gff-gtf-feature-extractor/run.js";
import { genomicIntervalOperationsMetadata } from "./genomic-interval-operations/metadata.js";
import { runGenomicIntervalOperations } from "./genomic-interval-operations/run.js";
import { dnaRnaPatternFinderMetadata } from "./dna-rna-pattern-finder/metadata.js";
import { runDnaRnaPatternFinder } from "./dna-rna-pattern-finder/run.js";
import {
  circularDnaSequenceViewerMetadata,
  dnaSequenceViewerMetadata
} from "./dna-sequence-viewer/metadata.js";
import {
  runCircularDnaSequenceViewer,
  runLinearDnaSequenceViewer
} from "./dna-sequence-viewer/run.js";
import {
  circularDnaViewerExample,
  linearDnaViewerExample
} from "../examples/dna-viewer-examples.js";
import { proteinSequenceViewerMetadata } from "./protein-sequence-viewer/metadata.js";
import { runProteinSequenceViewer } from "./protein-sequence-viewer/run.js";
import { alignmentViewerMetadata } from "./alignment-viewer/metadata.js";
import { runAlignmentViewer } from "./alignment-viewer/run.js";
import { sequenceEditorMetadata } from "./sequence-editor/metadata.js";
import { runSequenceEditor } from "./sequence-editor/run.js";
import {
  sangerTraceAssemblyMetadata,
  sangerTraceReferenceComparisonMetadata,
  sangerTraceViewerMetadata
} from "./sanger-trace-viewer/metadata.js";
import {
  runSangerTraceAssembly,
  runSangerTraceReferenceComparison,
  runSangerTraceReviewEditor
} from "./sanger-trace-viewer/run.js";
import { proteinStructureViewerMetadata } from "./protein-structure-viewer/metadata.js";
import { runProteinStructureViewer } from "./protein-structure-viewer/run.js";
import { proteinConservationStructureViewerMetadata } from "./protein-conservation-structure-viewer/metadata.js";
import { runProteinConservationStructureViewer } from "./protein-conservation-structure-viewer/run.js";
import {
  circularGenomeFigureMetadata,
  genomeFigureMetadata,
  linearGenomeFigureMetadata
} from "./genome-figure/metadata.js";
import { runGenomeFigure } from "./genome-figure/run.js";
import { genomeComparisonPosterMetadata } from "./genome-comparison-poster/metadata.js";
import { runGenomeComparisonPoster } from "./genome-comparison-poster/run.js";
import {
  extractSubsequencesDnaRnaMetadata,
  extractSubsequencesProteinMetadata
} from "./extract-subsequences/metadata.js";
import {
  runExtractSubsequencesDnaRna,
  runExtractSubsequencesProtein
} from "./extract-subsequences/run.js";
import { fastaValidatorNormalizerMetadata } from "./fasta-validator-normalizer/metadata.js";
import { runFastaValidatorNormalizer } from "./fasta-validator-normalizer/run.js";
import { fastaIndexCreatorMetadata } from "./fasta-index-creator/metadata.js";
import { runFastaIndexCreator } from "./fasta-index-creator/run.js";
import { fastqSummaryMetadata } from "./fastq-summary/metadata.js";
import { runFastqSummary } from "./fastq-summary/run.js";
import { fastqPreprocessMetadata } from "./fastq-preprocess/metadata.js";
import { runFastqPreprocess } from "./fastq-preprocess/run.js";
import { fastqReadSamplerMetadata } from "./fastq-read-sampler/metadata.js";
import { runFastqReadSampler } from "./fastq-read-sampler/run.js";
import { inSilicoPcrMetadata } from "./in-silico-pcr/metadata.js";
import { runInSilicoPcr } from "./in-silico-pcr/run.js";
import { indexedFastaRegionExtractorMetadata } from "./indexed-fasta-region-extractor/metadata.js";
import { runIndexedFastaRegionExtractor } from "./indexed-fasta-region-extractor/run.js";
import { fastaHeaderRenameMetadata } from "./fasta-header-rename/metadata.js";
import { runFastaHeaderRename } from "./fasta-header-rename/run.js";
import { fastaLengthFilterMetadata } from "./fasta-length-filter/metadata.js";
import { runFastaLengthFilter } from "./fasta-length-filter/run.js";
import { fastaExtractByIdMetadata } from "./fasta-extract-by-id/metadata.js";
import { runFastaExtractById } from "./fasta-extract-by-id/run.js";
import {
  fastaToTableMetadata,
  tableToFastaMetadata
} from "./fasta-table-converter/metadata.js";
import {
  runFastaToTable,
  runTableToFasta
} from "./fasta-table-converter/run.js";
import {
  groupNumberDnaRnaMetadata,
  groupNumberProteinMetadata
} from "./group-number-sequence/metadata.js";
import {
  runGroupNumberDnaRna,
  runGroupNumberProtein
} from "./group-number-sequence/run.js";
import { lineListCleanerMetadata } from "./line-list-cleaner/metadata.js";
import { runLineListCleaner } from "./line-list-cleaner/run.js";
import { lightweightSequenceAssemblyMetadata } from "./lightweight-sequence-assembly/metadata.js";
import { runLightweightSequenceAssembly } from "./lightweight-sequence-assembly/run.js";
import { upsetPlotMetadata } from "./upset-plot/metadata.js";
import { runUpsetPlot } from "./upset-plot/run.js";
import { vennDiagramMetadata } from "./venn-diagram/metadata.js";
import { runVennDiagram } from "./venn-diagram/run.js";
import { markdownNotebookMetadata } from "./markdown-notebook/metadata.js";
import { runMarkdownNotebook } from "./markdown-notebook/run.js";
import { orfFinderMetadata } from "./orf-finder/metadata.js";
import { runOrfFinder } from "./orf-finder/run.js";
import {
  pairwiseAlignCodingDnaMetadata,
  pairwiseAlignDnaRnaMetadata,
  pairwiseAlignProteinMetadata
} from "./pairwise-alignment/metadata.js";
import {
  runPairwiseAlignCodingDna,
  runPairwiseAlignDnaRna,
  runPairwiseAlignProtein
} from "./pairwise-alignment/run.js";
import {
  dnaRnaMotifScannerMetadata,
  proteinMotifScannerMetadata
} from "./motif-scanner/metadata.js";
import {
  runDnaRnaMotifScanner,
  runProteinMotifScanner
} from "./motif-scanner/run.js";
import {
  multipleAlignCodingDnaMetadata,
  multipleAlignDnaRnaMetadata,
  multipleAlignProteinMetadata
} from "./multiple-sequence-alignment/metadata.js";
import {
  runMultipleAlignCodingDna,
  runMultipleAlignDnaRna,
  runMultipleAlignProtein
} from "./multiple-sequence-alignment/run.js";
import { phylogenyBuilderMetadata } from "./phylogeny-builder/metadata.js";
import { runPhylogenyBuilder } from "./phylogeny-builder/run.js";
import { technicalSequenceScannerMetadata } from "./technical-sequence-scanner/metadata.js";
import { plasmidCommonFeatureScannerMetadata } from "./plasmid-common-feature-scanner/metadata.js";
import { runPlasmidCommonFeatureScanner } from "./plasmid-common-feature-scanner/run.js";
import { vectorContaminationScannerMetadata } from "./vector-contamination-scanner/metadata.js";
import { vcfGenotypeTableMetadata } from "./vcf-genotype-table/metadata.js";
import { runVcfGenotypeTable } from "./vcf-genotype-table/run.js";
import { vcfFilterMetadata } from "./vcf-filter/metadata.js";
import { runVcfFilter } from "./vcf-filter/run.js";
import { vcfRandomSamplerMetadata } from "./vcf-random-sampler/metadata.js";
import { runVcfRandomSampler } from "./vcf-random-sampler/run.js";
import { samBamSummaryRegionViewerMetadata } from "./sam-bam-summary-region-viewer/metadata.js";
import { runSamBamSummaryRegionViewer } from "./sam-bam-summary-region-viewer/run.js";
import { proteinHydropathyMetadata } from "./protein-hydropathy/metadata.js";
import { runProteinHydropathy } from "./protein-hydropathy/run.js";
import { proteinPatternFinderMetadata } from "./protein-pattern-finder/metadata.js";
import { runProteinPatternFinder } from "./protein-pattern-finder/run.js";
import { sequenceStatsProteinMetadata } from "./protein-stats/metadata.js";
import { runSequenceStatsProtein } from "./protein-stats/run.js";
import {
  dnaRnaSequenceSetReciprocalBestMatchMetadata,
  proteomeReciprocalBestMatchMetadata
} from "./proteome-reciprocal-best-match/metadata.js";
import {
  runDnaRnaSequenceSetReciprocalBestMatch,
  runProteomeReciprocalBestMatch
} from "./proteome-reciprocal-best-match/run.js";
import { primerOligoPropertiesMetadata } from "./primer-oligo-properties/metadata.js";
import { runPrimerOligoProperties } from "./primer-oligo-properties/run.js";
import { pcrPrimerDesignMetadata } from "./pcr-primer-design/metadata.js";
import { runPcrPrimerDesign } from "./pcr-primer-design/run.js";
import { crisprGuideDesignMetadata } from "./crispr-guide-design/metadata.js";
import { runCrisprGuideDesign } from "./crispr-guide-design/run.js";
import { talenTargetFinderMetadata } from "./talen-target-finder/metadata.js";
import { runTalenTargetFinder } from "./talen-target-finder/run.js";
import { sirnaDesignMetadata } from "./sirna-design/metadata.js";
import { runSirnaDesign } from "./sirna-design/run.js";
import { reverseComplementMetadata } from "./reverse-complement/metadata.js";
import { runReverseComplement } from "./reverse-complement/run.js";
import {
  annotatedDnaRecordExtractorMetadata,
  annotatedProteinRecordExtractorMetadata
} from "./record-parser-extractor/metadata.js";
import {
  runAnnotatedDnaRecordExtractor,
  runAnnotatedProteinRecordExtractor
} from "./record-parser-extractor/run.js";
import { restrictionSummaryMetadata } from "./restriction-summary/metadata.js";
import { runRestrictionSummary } from "./restriction-summary/run.js";
import { restrictionDigestMetadata } from "./restriction-digest/metadata.js";
import { runRestrictionDigest } from "./restriction-digest/run.js";
import {
  mutateDnaRnaMetadata,
  mutateProteinMetadata,
  randomCodingDnaMetadata,
  randomDnaFragmenterMetadata,
  randomDnaRnaMetadata,
  randomDnaRnaRegionsMetadata,
  randomProteinMetadata,
  randomProteinRegionsMetadata,
  sampleDnaRnaMetadata,
  sampleProteinMetadata,
  shuffleDnaRnaMetadata,
  shuffleProteinMetadata
} from "./random-sequence/metadata.js";
import {
  runMutateDnaRna,
  runMutateProtein,
  runRandomCodingDna,
  runRandomDnaFragmenter,
  runRandomDnaRna,
  runRandomDnaRnaRegions,
  runRandomProtein,
  runRandomProteinRegions,
  runSampleDnaRna,
  runSampleProtein,
  runShuffleDnaRna,
  runShuffleProtein
} from "./random-sequence/run.js";
import { readSimulatorMetadata } from "./read-simulator/metadata.js";
import { runReadSimulator } from "./read-simulator/run.js";
import { readMappingCoverageMetadata } from "./read-mapping-coverage/metadata.js";
import { runReadMappingCoverage } from "./read-mapping-coverage/run.js";
import { readMappingCoverageExample } from "../examples/read-mapping-coverage-example.js";
import { randomRowsLinesMetadata } from "./random-rows-lines/metadata.js";
import { runRandomRowsLines } from "./random-rows-lines/run.js";
import { reverseTranslateMetadata } from "./reverse-translate/metadata.js";
import { runReverseTranslate } from "./reverse-translate/run.js";
import { sequenceStatsDnaRnaMetadata } from "./sequence-stats/metadata.js";
import { runSequenceStatsDnaRna } from "./sequence-stats/run.js";
import { tableViewerCleanerMetadata } from "./table-viewer-cleaner/metadata.js";
import { runTableViewerCleaner } from "./table-viewer-cleaner/run.js";
import { tableSummaryMetadata } from "./table-summary/metadata.js";
import { runTableSummary } from "./table-summary/run.js";
import { tableGroupSummaryMetadata } from "./table-group-summary/metadata.js";
import { runTableGroupSummary } from "./table-group-summary/run.js";
import { tableReshapeMetadata } from "./table-reshape/metadata.js";
import { runTableReshape } from "./table-reshape/run.js";
import { tableJoinMetadata } from "./table-join/metadata.js";
import { runTableJoin } from "./table-join/run.js";
import { tableColumnCalculatorMetadata } from "./table-column-calculator/metadata.js";
import { runTableColumnCalculator } from "./table-column-calculator/run.js";
import { tableColumnComparisonMetadata } from "./table-column-comparison/metadata.js";
import { runTableColumnComparison } from "./table-column-comparison/run.js";
import { tableDataFormatConverterMetadata } from "./table-data-format-converter/metadata.js";
import { runTableDataFormatConverter } from "./table-data-format-converter/run.js";
import { tableSqlQueryMetadata } from "./table-sql-query/metadata.js";
import { runTableSqlQuery } from "./table-sql-query/run.js";
import { tableDescriptiveStatisticsMetadata } from "./table-descriptive-statistics/metadata.js";
import { runTableDescriptiveStatistics } from "./table-descriptive-statistics/run.js";
import { tableCorrelationMatrixMetadata } from "./table-correlation-matrix/metadata.js";
import { runTableCorrelationMatrix } from "./table-correlation-matrix/run.js";
import { outlierDiagnosticsMetadata } from "./outlier-diagnostics/metadata.js";
import { runOutlierDiagnostics } from "./outlier-diagnostics/run.js";
import { simpleLinearRegressionMetadata } from "./simple-linear-regression/metadata.js";
import { runSimpleLinearRegressionTool } from "./simple-linear-regression/run.js";
import { multipleLinearRegressionMetadata } from "./multiple-linear-regression/metadata.js";
import { runMultipleLinearRegressionTool } from "./multiple-linear-regression/run.js";
import { chiSquareTestMetadata } from "./chi-square-test/metadata.js";
import { runChiSquareTestTool } from "./chi-square-test/run.js";
import { fisherExactTestMetadata } from "./fisher-exact-test/metadata.js";
import { runFisherExactTestTool } from "./fisher-exact-test/run.js";
import { mannWhitneyUTestMetadata } from "./mann-whitney-u-test/metadata.js";
import { runMannWhitneyUTestTool } from "./mann-whitney-u-test/run.js";
import { kruskalWallisTestMetadata } from "./kruskal-wallis-test/metadata.js";
import { runKruskalWallisTestTool } from "./kruskal-wallis-test/run.js";
import { twoSampleTTestMetadata } from "./two-sample-t-test/metadata.js";
import { runTwoSampleTTest } from "./two-sample-t-test/run.js";
import { pairwiseTTestPostHocMetadata } from "./pairwise-t-test-post-hoc/metadata.js";
import { runPairwiseTTestPostHocTool } from "./pairwise-t-test-post-hoc/run.js";
import { oneWayAnovaMetadata } from "./one-way-anova/metadata.js";
import { runOneWayAnovaTool } from "./one-way-anova/run.js";
import { pairedTTestMetadata } from "./paired-t-test/metadata.js";
import { runPairedTTestTool } from "./paired-t-test/run.js";
import { wilcoxonSignedRankTestMetadata } from "./wilcoxon-signed-rank-test/metadata.js";
import { runWilcoxonSignedRankTestTool } from "./wilcoxon-signed-rank-test/run.js";
import { twoWayAnovaMetadata } from "./two-way-anova/metadata.js";
import { runTwoWayAnovaTool } from "./two-way-anova/run.js";
import { repeatedMeasuresAnovaMetadata } from "./repeated-measures-anova/metadata.js";
import { runRepeatedMeasuresAnovaTool } from "./repeated-measures-anova/run.js";
import { twoGroupPermutationTestMetadata } from "./two-group-permutation-test/metadata.js";
import { runTwoGroupPermutationTestTool } from "./two-group-permutation-test/run.js";
import { pcaPlotMetadata } from "./pca-plot/metadata.js";
import { runPcaPlot } from "./pca-plot/run.js";
import { tsnePlotMetadata } from "./tsne-plot/metadata.js";
import { runTsnePlot } from "./tsne-plot/run.js";
import { scatterPlotMetadata } from "./scatter-plot/metadata.js";
import { runScatterPlot } from "./scatter-plot/run.js";
import { histogramMetadata } from "./histogram/metadata.js";
import { runHistogram } from "./histogram/run.js";
import { qqPlotMetadata } from "./qq-plot/metadata.js";
import { runQqPlot } from "./qq-plot/run.js";
import { manhattanPlotMetadata } from "./manhattan-plot/metadata.js";
import { runManhattanPlot } from "./manhattan-plot/run.js";
import { linePlotMetadata } from "./line-plot/metadata.js";
import { runLinePlot } from "./line-plot/run.js";
import { barPlotMetadata } from "./bar-plot/metadata.js";
import { runBarPlot } from "./bar-plot/run.js";
import { boxPlotMetadata } from "./box-plot/metadata.js";
import { runBoxPlot } from "./box-plot/run.js";
import { violinPlotMetadata } from "./violin-plot/metadata.js";
import { runViolinPlot } from "./violin-plot/run.js";
import { heatmapMetadata } from "./heatmap/metadata.js";
import { runHeatmap } from "./heatmap/run.js";
import { sankeyPlotMetadata } from "./sankey-plot/metadata.js";
import { runSankeyPlot } from "./sankey-plot/run.js";
import { volcanoPlotMetadata } from "./volcano-plot/metadata.js";
import { runVolcanoPlot } from "./volcano-plot/run.js";
import { textSearchReplaceMetadata } from "./text-search-replace/metadata.js";
import { runTextSearchReplace } from "./text-search-replace/run.js";
import { wordCloudMetadata } from "./word-cloud/metadata.js";
import { runWordCloud } from "./word-cloud/run.js";
import { translateMetadata } from "./translate/metadata.js";
import { runTranslate } from "./translate/run.js";
import {
  proteinRecordParserExample,
  recordParserExample
} from "../examples/record-parser-example.js";
import {
  multipleAlignDnaRnaExample,
  multipleAlignProteinExample
} from "../examples/multiple-alignment-examples.js";
import { alignmentViewerExample } from "../examples/alignment-viewer-example.js";
import { vcfExtractorExample } from "../examples/vcf-extractor-example.js";
import { genomeFigureExample } from "../examples/genome-figure-example.js";
import { genomeComparisonPosterExample } from "../examples/genome-comparison-poster-example.js";
import { crambinPdbExample } from "../examples/protein-structure-examples.js";
import { proteinConservationStructureExample } from "../examples/protein-conservation-structure-examples.js";
import {
  getSangerTraceAssemblyExample,
  getSangerTraceExample,
  getSangerTraceReferenceComparisonExample
} from "../examples/sanger-trace-example.js";

const samBamSummaryRegionViewerExample = alignmentViewerExample.split(/\n##VCF\n/u)[0];

function runWorkerOnlyTool() {
  throw new Error("This tool runs in a Web Worker. Use the app worker runner or provide a workflow runTool callback.");
}

function lazyExampleTool({ metadata, run, getExample }) {
  const tool = { metadata, run };
  Object.defineProperty(tool, "example", {
    enumerable: true,
    get: getExample
  });
  return tool;
}

const fastqQcExampleLengths = [
  70,
  71,
  72, 72,
  73, 73, 73,
  74, 74, 74, 74,
  75, 75, 75, 75, 75, 75, 75,
  76, 76, 76, 76, 76, 76, 76, 76, 76,
  77, 77, 77, 77, 77, 77, 77, 77, 77, 77,
  78, 78, 78, 78, 78, 78, 78, 78,
  79, 79, 79, 79, 79, 79,
  80, 80, 80, 80,
  81, 81, 81,
  82,
  83
];

function makeFastqQcSequence(length, index) {
  const motifs = [
    "ACGTGATCTGACCTGATCGTACGATGCT",
    "GCGGCCGCGTGGCGGATCCGCGTACGGC",
    "ATTAATATTTACAAATTAATATTAACAT",
    "TGCAGTTGACCGATACCTGATGGCATTA",
    "CCGTAAGGTTACCGTACGATTCGGAACC"
  ];
  const motif = motifs[index % motifs.length];
  let sequence = "";
  while (sequence.length < length) {
    sequence += motif;
  }
  sequence = sequence.slice(index % motif.length, index % motif.length + length);
  if (sequence.length < length) {
    sequence = `${sequence}${motif}`.slice(0, length);
  }
  if (index === 13 || index === 41) {
    const start = Math.floor(length * 0.42);
    sequence = `${sequence.slice(0, start)}NNNNNNNNNNNN${sequence.slice(start + 12)}`;
  } else if (index === 28 || index === 57) {
    const start = Math.floor(length * 0.36);
    sequence = `${sequence.slice(0, start)}NNNNNNNNNNNNNNNNNN${sequence.slice(start + 18)}`;
  } else if (index % 19 === 0) {
    const start = Math.max(8, Math.floor(length * 0.62));
    sequence = `${sequence.slice(0, start)}NN${sequence.slice(start + 2)}`;
  } else if (index % 23 === 0) {
    sequence = `${sequence.slice(0, length - 4)}NNNN`;
  }
  return sequence;
}

function makeFastqQcQuality(length, index) {
  let quality = "";
  for (let position = 0; position < length; position += 1) {
    const tailPenalty = Math.max(0, position - Math.floor(length * 0.72)) * 0.45;
    const readPenalty = index % 7;
    const outlierPenalty = index % 17 === 0 ? 8 : 0;
    const cycleBump = position % 11 === 0 ? -1 : 0;
    const q = Math.max(12, Math.min(40, Math.round(38 - tailPenalty - readPenalty - outlierPenalty + cycleBump)));
    quality += String.fromCharCode(q + 33);
  }
  return quality;
}

function makeFastqQcExample() {
  return fastqQcExampleLengths.map((length, index) => {
    const title = `@qc_amplicon_${String(index + 1).padStart(2, "0")}_len${length}`;
    const sequence = makeFastqQcSequence(length, index);
    const quality = makeFastqQcQuality(length, index);
    return `${title}\n${sequence}\n+\n${quality}`;
  }).join("\n");
}

export const tools = [
  {
    metadata: reverseComplementMetadata,
    run: runReverseComplement,
    example: `>NM_000546.6_p53_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
>IUPAC_control_fragment
ACGTRYSWKMBDHVN`
  },
  {
    metadata: cleanFilterDnaRnaMetadata,
    run: runCleanFilterDnaRna,
    example: `>NM_007294.4_BRCA1_messy_fragment
Atg gat tta tct gct ctt cgc gtt gaa gaa gta caa aat gtc attaatgctNNN123`
  },
  {
    metadata: cleanFilterProteinMetadata,
    run: runCleanFilterProtein,
    example: `>NP_000537.3_p53_messy_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP XZ* 789`
  },
  {
    metadata: baseCompositionPlotMetadata,
    run: runBaseCompositionPlot,
    example: `>seqA
GCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGC
GGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCC
GCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGC
GGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCC
GCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCATATATTAATATATTAATAT
ATTAATATATTAATATATTAATATATTAATATATTAATATATTAATATATTAATATATTA
ATATATTAATATATTAATATATTAATATATTAATATATTAATATATTAATATATTAATAT
ATTAATATATTAATATATTAATATATTAATATATTAATATATTAATATATTAATATATTA
GCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCG
CGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGC
GCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCG
CGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGC
GCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGCGCCGCGGC
>seqB
GGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGG
ATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGC
GGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGG
ATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGCGGGGATGC
CCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCC
GCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTA
CCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCC
GCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTACCCCGCTA
ACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGT
NNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRY
ACGTNNRYACGTNNRYACGTNNRYACGTNNRYACGTNNRYGCGTACGAGCGTACGAGCGT
ACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGA
GCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGT
ACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGAGCGTACGA
>seqC
ATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGC
GTACATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGCGTAC
ATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGCGTACATGC
GTACATGCGTACATGCGTACGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGC
GCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGG
CCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGC
GCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGG
CCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGC
GCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCGCGGCCGCAAATTTAAAAATTTAAAAAT
TTAAAAATTTAAAAATTTAAAAATTTAAAAATTTAAAAATTTAAAAATTTAAAAATTTAA
AAATTTAAAAATTTAAAAATTTAAAAATTTAAAAATTTAAAAATTTAAAAATTTAAAAAT
TTAAAAATTTAAAAATTTAACGCGATATCGCGATATCGCGATATCGCGATATCGCGATAT
CGCGATATCGCGATATCGCGATATCGCGATATCGCGATATCGCGATATCGCGATATCGCG
ATATCGCGATATCGCGATATCGCGATATCGCGATATCGCGATATCGCGATATCGCGATAT
CGCGATATCGCGATATCGCGATATCGCGATATCGCGATAT`
  },
  {
    metadata: codonUsageMetadata,
    run: runCodonUsage,
    example: `>NM_000546.6_TP53_CDS_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
ATGGAAACTACTTCCTGAAAACAACGTTCTGTCCCCCTTGCCGTCCCAAGCAATGGATGATTTGAT
GCTGTCCCCGGACGATATTGAACAATGGTTCACTGAAGACCCAGGTCCAGATGAAGCTCCCAGAAT
GCCAGAGGCTGCTCCCCCCGTGGCCCCTGCACCAGCAGCTCCTACACCGGCGGCCCCTGCACCA
>NC_001416.1_lambda_cI_CDS_fragment
ATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGACGCACGTCGCCTTAAAGCAAT
TTATGAAAAAGAAAAAGATGAGTTTATTGAAGCTGCGCTGAAAGCGGCGGTGAAAGAGTTGCTG
GCAGCAAAACGTCTGAAAGAAAAACAGGAAACGCTGGCGCATGGTGCGCGTCTGAAAGAAAAA
>AY457914.1_EGFP_CDS_fragment
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGAC
GTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACC
CTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGAC
CTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCC`
  },
  {
    metadata: codonAdaptationIndexMetadata,
    run: runCodonAdaptationIndex,
    example: `>AY457914.1_EGFP_CDS_fragment
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGAC
GTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACC
CTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGAC
CTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCC
>NC_001416.1_lambda_cI_CDS_fragment
ATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGACGCACGTCGCCTTAAAGCAAT
TTATGAAAAAGAAAAAGATGAGTTTATTGAAGCTGCGCTGAAAGCGGCGGTGAAAGAGTTGCTG
GCAGCAAAACGTCTGAAAGAAAAACAGGAAACGCTGGCGCATGGTGCGCGTCTGAAAGAAAAA`
  },
  {
    metadata: dnaRnaPatternFinderMetadata,
    run: runDnaRnaPatternFinder,
    example: `>NM_000546.6_TP53_fragment_pattern_example
GATGGGATTGGGGTTTTCCCCTCCCATGTGCTCAAGACTGGCGCTAAAAGTTTTGAGGACTGGGGC
AGGTTGGTATGAGCCGCCTGAGGTTGGCTCTGACTGTACCACCATCCACTACAACTACATGTGTA
ACAGTTCCTGCATGGGCGGCATGAACCGGAGGCCCATCCTCACCATCATCACACTGGAAGACTCC
AGTGGTAATCTACTGGGACGGAACAGCTTTGAGGTGCGTGTTTGTGCCTGTCCTGGGAGAGACCG
GCGCACAGAGGAAGAGAATCTCCGCAAGAAAGGGGAGCCTCACCACGAGCTGCCCCCAGGGAGCA
>NC_001416.1_lambda_region_pattern_example
TTGACGGCTAGCTCAGTCCTAGGTACCGGATCCGATGCTAGCGGGAATTCGAGCTCGGTACCAA
GCTTACGCGTATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGACGCACGTCGC
CTTAAAGCAATTTATGAAAAAGAAAAAGATGAGTTTATTGAAGCTGCGCTGAAAGCGGCGGTGA
AAGAGTTGCTGGCAGCAAAACGTCTGAAAGAAAAACAGGAAACGCTGGCGCATGGTGCGCGTCT
GAAAGAAAAATAGGCGTTCGACTTCCCGGTTTACGACGTTGAAAACGACGGCCAGTGAATTCCCA
>ambiguous_consensus_pattern_example
ATGNNNACGTRYSWKMCCCATGRYSWKMBDHVNNNNATGAAATAGGGGATGCCCTAATGNNNCCG
TTTACGTNNNNRYSWKMBDHVATGCGTACGTACGTNNNNATGAAACCCGGGTTTAAACCCGGG`
  },
  {
    metadata: dnaSequenceViewerMetadata,
    run: runLinearDnaSequenceViewer,
    example: linearDnaViewerExample
  },
  {
    metadata: circularDnaSequenceViewerMetadata,
    run: runCircularDnaSequenceViewer,
    example: circularDnaViewerExample
  },
  {
    metadata: proteinSequenceViewerMetadata,
    run: runProteinSequenceViewer,
    example: proteinRecordParserExample
  },
  {
    metadata: alignmentViewerMetadata,
    run: runAlignmentViewer,
    example: alignmentViewerExample
  },
  {
    metadata: sequenceEditorMetadata,
    run: runSequenceEditor,
    example: `>NM_000546.6_p53_editing_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
GGGCAACTGACCGTGCAAGTCACAGACTTGGCTGTCCCAGAATGCAAGAAGCCCAGACGGAAACCG`
  },
  lazyExampleTool({
    metadata: sangerTraceViewerMetadata,
    run: runSangerTraceReviewEditor,
    getExample: getSangerTraceExample
  }),
  lazyExampleTool({
    metadata: sangerTraceAssemblyMetadata,
    run: runSangerTraceAssembly,
    getExample: getSangerTraceAssemblyExample
  }),
  lazyExampleTool({
    metadata: sangerTraceReferenceComparisonMetadata,
    run: runSangerTraceReferenceComparison,
    getExample: getSangerTraceReferenceComparisonExample
  }),
  {
    metadata: proteinStructureViewerMetadata,
    run: runProteinStructureViewer,
    example: crambinPdbExample
  },
  {
    metadata: proteinConservationStructureViewerMetadata,
    run: runProteinConservationStructureViewer,
    example: proteinConservationStructureExample
  },
  {
    metadata: circularGenomeFigureMetadata,
    run: runGenomeFigure,
    example: genomeFigureExample
  },
  {
    metadata: linearGenomeFigureMetadata,
    run: runGenomeFigure,
    example: genomeFigureExample
  },
  {
    metadata: genomeFigureMetadata,
    run: runGenomeFigure,
    example: genomeFigureExample
  },
  {
    metadata: genomeComparisonPosterMetadata,
    run: runGenomeComparisonPoster,
    example: genomeComparisonPosterExample
  },
  {
    metadata: fastqPreprocessMetadata,
    run: runFastqPreprocess,
    example: `@read_high_quality
ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@read_low_tail
TGCATGCATGCATGCATGCATGCATGCATGCATGCATGCA
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII!!!!
@read_many_n
ACGTNNNNNNACGTACGTACGTACGTACGTACGTACGTAC
+
IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII
@read_short_after_trim
GATTACAGATTACAGATTACAGATTACAGATTACA
+
IIIIIIIIIIIIIIIIIIII!!!!!!!!!!!!!!!`
  },
  {
    metadata: fastqReadSamplerMetadata,
    run: runFastqReadSampler,
    example: `@sample_read_001
ACGTACGTACGTACGTACGT
+
IIIIIIIIIIIIIIIIIIII
@sample_read_002
TGCATGCATGCATGCATGCA
+
HHHHHHHHHHHHHHHHHHHH
@sample_read_003
GGGGCCCCAAAATTTTGGGG
+
FFFFFFFFFFFFFFFFFFFF
@sample_read_004
NNNNACGTACGTNNNNTTAA
+
????????????????????
@sample_read_005
CATCATCATCATCATCATCA
+
IIIIIIIIIIIIIIIIIIII
@sample_read_006
GATCGATCGATCGATCGATC
+
HHHHHHHHHHHHHHHHHHHH
@sample_read_007
ATATATATATATATATATAT
+
FFFFFFFFFFFFFFFFFFFF
@sample_read_008
CGCGCGCGCGCGCGCGCGCG
+
????????????????????`
  },
  {
    metadata: dnaRnaMotifScannerMetadata,
    run: runDnaRnaMotifScanner,
    example: `>regulatory motif example
GCCRCCATGGTTAGGAGGTTATAATGTTGACAAATAAATATAAT
>polyA reverse example
TTTATTCCCGGGTTGACATATAAT
>lambda_promoter_like_region
TTGACATGCTAGCTAGCTATAATGCCGCCRCCATGGTTAGGAGGACCTATAAAAGGTTGACA
>synthetic_mrna_leader_candidates
GGGGCCACCATGGCTAGGAGGTTTTATAWAAGGCCAATAAAGGGTATAATTTGACA`
  },
  {
    metadata: multipleAlignDnaRnaMetadata,
    run: runMultipleAlignDnaRna,
    example: multipleAlignDnaRnaExample
  },
  {
    metadata: multipleAlignCodingDnaMetadata,
    run: runMultipleAlignCodingDna,
    example: multipleAlignDnaRnaExample
  },
  {
    metadata: phylogenyBuilderMetadata,
    run: runPhylogenyBuilder,
    example: multipleAlignDnaRnaExample
  },
  {
    metadata: dnaRnaAlignmentDotPlotMetadata,
    run: runDnaRnaAlignmentDotPlot,
    example: `>NC_001416.1_lambda_region_A
TTGACGGCTAGCTCAGTCCTAGGTACCGGATCCGATGCTAGCGGGAATTCGAGCTCGGTACCAA
GCTTACGCGTATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGACGCACGTCGC
CTTAAAGCAATTTATGAAAAAGAAAAAGATGAGTTTATTGAAGCTGCGCTGAAAGCGGCGGTGA
AAGAGTTGCTGGCAGCAAAACGTCTGAAAGAAAAACAGGAAACGCTGGCGCATGGTGCGCGTCT
GAAAGAAAAATAGGCGTTCGACTTCCCGGTTTACGACGTTGAAAACGACGGCCAGTGAATTCCCA
>lambda_region_B_with_inversion
TTGACGGCTAGCTCAGTCCTAGGTACCGGATCCGATGCTAGCGGGAATTCGAGCTCGGTACCAA
GCTTACGCGTATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGACGCACGTCGC
CTTAAAGCAATTTATGAAAAAGAAAAAGATGAGTTTATTGAAGCTGCGCTGAAAGCGGCGGTGA
TGGGAATTCACAGCCGTCGTTTTCAACGTCGTAAACCGGGAAGTCGAACGCCTATTTTTCTTTC
AGACGCGCACCATGCGCCAGCGTTTCCTGTTTTTCTTTCAGACGTTTTGCTGCCAGCAACTCTT`
  },
  {
    metadata: proteinAlignmentDotPlotMetadata,
    run: runProteinAlignmentDotPlot,
    example: `>protein_A
MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAG
QEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDL
>protein_B
MTEYKLVVVGAGGIGKSALTIQLIQNHFVEEYDPTIEDSYRKQVVIDGETCLLDILDTAG
QEEYSAMRDQYMRAGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDL`
  },
  {
    metadata: dnaRnaSequenceSetReciprocalBestMatchMetadata,
    run: runDnaRnaSequenceSetReciprocalBestMatch,
    example: `>A_lacZ_alpha_fragment
ATGACCATGATTACGGATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCG
TTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGAGG
>A_gfp_fragment
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCG
ACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGC
>A_orphan_fragment
GGGATATATATCCCGCGCGCGGATATATATCCCGCGCGCGGATATATATCCCGCGCGCG
---
>B_lacZ_alpha_like_fragment
ATGACCATGATTACGGATTCACTGGCCGTCGTTTTACAACGTCGTGACTGGGAAAACCCTGGCG
TTACCCAACTTAATCGCCTTGCAGCACATCCCCCTTTCGCCAGCTGGCGTAATAGCGAAGACG
>B_gfp_like_fragment
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCA
ACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGC
>B_unrelated_fragment
TTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGGTTTTCCCCAAAAGGGG`
  },
  {
    metadata: proteomeReciprocalBestMatchMetadata,
    run: runProteomeReciprocalBestMatch,
    example: `>A_lacZ_alpha_fragment
MTMITPSAQLTLTKGNKSWSAAPDQLTQSPSSLSVSPSSWPRPWLPLGRRRRPGQV
>A_green_fluorescent_protein_fragment
MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTT
>A_serine_threonine_kinase_fragment
MELRVLVKLLGKGTFGKVILVKEKATGRYYAMKILKKDVVIQDDDVECTMTEKRILALARK
>A_short_secreted_protein
MKAILVVLLYTAVAGQAAAPGDVEKGKKIFIMKCSQCHTVEKGGKHKTGP
---
>B_lacZ_alpha_like_fragment
MTMITPAAQLTLTKGNKSWSAAPDQVTQSPSSLSVSPSSWPRPWLPLGRKRRPGQV
>B_gfp_like_fragment
MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFIGTTGKLPVPWPTLVTT
>B_serine_threonine_kinase_like_fragment
MELRVLVKLLGKGTFGKVILVKERATGRYYAMKILKKDVVIQDDDVECTMTEKRILALAKK
>B_kinase_paralog_fragment
MELKVLVKLLGKGSFGKVILVKEKADGRYYAMKMLKKDVVIQDDDVECAMSEKRILALAKQ`
  },
  {
    metadata: technicalSequenceScannerMetadata,
    run: runWorkerOnlyTool,
    example: `>adapter and primer example
AAATGTAAAACGACGGCCAGTCCCTTTAGATCGGAAGAGCACACGTCTGAACTCCAGTCACTGTCTCTTATACACATCT
>reverse adapter example
TTTGACTGGAGTTCAGACGTGTGCTCTTCCGATCTAAAGGGGATGTGTATAAGAGACAG`
  },
  {
    metadata: plasmidCommonFeatureScannerMetadata,
    run: runPlasmidCommonFeatureScanner,
    example: `>plasmid_control_region_example
GCGGCCGCTAATACGACTCACTATAGGGTTTTGTAAAACGACGGCCAGTGACGTCGACAATTGTGAGCGGATAACAATTGGATCCATTTAGGTGACACTATAGGCGCGC`
  },
  {
    metadata: tableViewerCleanerMetadata,
    run: runTableViewerCleaner,
    example: `sample,group,gc_percent,notes
A1,control,51.2,"clear, usable row"
A2,control,47.8,
B1,treatment,63.4,"quoted ""high GC"" note"
B1,treatment,63.4,"quoted ""high GC"" note"
B2,treatment,58.1,"contains	tab text"`
  },
  {
    metadata: tableSummaryMetadata,
    run: runTableSummary,
    example: `sample_id,collection_date,treatment,replicate,concentration_ng_ul,od260_280,qc_pass,notes
SRR2584863,2024-01-12,control,1,38.4,1.91,true,bulk RNA replicate
SRR2584864,2024-01-12,control,2,42.1,1.87,true,bulk RNA replicate
SRR2584865,2024-01-13,heat_shock,1,55.8,1.83,true,30 minute heat shock
SRR2584866,2024-01-13,heat_shock,2,NA,1.79,false,low concentration
SRR2584867,2024-01-14,recovery,1,47.5,1.88,true,2 hour recovery
SRR2584868,2024-01-14,recovery,2,49.2,1.90,true,2 hour recovery
SRR2584869,2024-01-15,control,3,39.7,1.92,true,library repeated
SRR2584870,2024-01-15,heat_shock,3,57.3,1.81,true,library repeated`
  },
  {
    metadata: tableDescriptiveStatisticsMetadata,
    run: runTableDescriptiveStatistics,
    example: `sample_id,treatment,replicate,concentration_ng_ul,od260_280,rin
SRR2584863,control,1,38.4,1.91,8.2
SRR2584864,control,2,42.1,1.87,8.0
SRR2584869,control,3,39.7,1.92,8.4
SRR2584865,treatment,1,55.8,1.83,7.6
SRR2584866,treatment,2,52.6,1.79,7.1
SRR2584870,treatment,3,57.3,1.81,7.4
SRR2584867,recovery,1,47.5,1.88,7.9
SRR2584868,recovery,2,49.2,1.90,8.1`
  },
  {
    metadata: tableCorrelationMatrixMetadata,
    run: runTableCorrelationMatrix,
    example: `sample_id,treatment,concentration_ng_ul,od260_280,rin,library_yield_ng
SRR2584863,control,38.4,1.91,8.2,420
SRR2584864,control,42.1,1.87,8.0,438
SRR2584869,control,39.7,1.92,8.4,431
SRR2584865,treatment,55.8,1.83,7.6,612
SRR2584866,treatment,52.6,1.79,7.1,574
SRR2584870,treatment,57.3,1.81,7.4,635
SRR2584867,recovery,47.5,1.88,7.9,502
SRR2584868,recovery,49.2,1.90,8.1,519`
  },
  {
    metadata: outlierDiagnosticsMetadata,
    run: runOutlierDiagnostics,
    example: `sample_id,condition,measurement
QC_001,control,38.4
QC_002,control,42.1
QC_003,control,39.7
QC_004,control,41.0
QC_005,control,37.9
QC_006,control,40.3
QC_007,control,43.2
QC_008,control,98.0
QC_009,treatment,55.8
QC_010,treatment,52.6
QC_011,treatment,57.3
QC_012,treatment,54.9
QC_013,treatment,56.1
QC_014,treatment,53.7
QC_015,treatment,81.5
QC_016,treatment,NA`
  },
  {
    metadata: simpleLinearRegressionMetadata,
    run: runSimpleLinearRegressionTool,
    example: `sample_id,condition,dose_uM,response
DOSE_001,vehicle,0,4.8
DOSE_002,vehicle,0,5.1
DOSE_003,low,0.5,6.2
DOSE_004,low,0.5,6.0
DOSE_005,medium,1,7.4
DOSE_006,medium,1,7.8
DOSE_007,medium,2,10.2
DOSE_008,medium,2,9.7
DOSE_009,high,4,14.5
DOSE_010,high,4,15.0
DOSE_011,high,8,24.8
DOSE_012,high,8,25.6`
  },
  {
    metadata: multipleLinearRegressionMetadata,
    run: runMultipleLinearRegressionTool,
    example: `sample_id,input_ng,fragment_kb,gc_percent,cycle_count,yield_ng
LIB_001,50,2.1,48.2,12,265
LIB_002,55,2.0,49.1,12,282
LIB_003,60,1.8,51.4,11,309
LIB_004,45,2.7,43.6,13,218
LIB_005,70,2.4,46.9,11,324
LIB_006,80,1.6,55.2,10,382
LIB_007,65,3.1,42.4,12,278
LIB_008,90,2.2,50.1,10,419
LIB_009,75,1.9,53.8,11,361
LIB_010,40,2.8,44.7,13,204
LIB_011,85,2.5,47.5,10,389
LIB_012,95,1.7,56.1,9,452
LIB_013,58,2.3,49.9,12,296
LIB_014,72,2.6,45.8,11,331
LIB_015,88,1.9,54.6,10,428`
  },
  {
    metadata: chiSquareTestMetadata,
    run: runChiSquareTestTool,
    example: `phenotype,control,treatment
normal_growth,42,31
slow_growth,12,25
no_growth,6,14`
  },
  {
    metadata: fisherExactTestMetadata,
    run: runFisherExactTestTool,
    example: `phenotype,control,treatment
response,1,9
no_response,11,3`
  },
  {
    metadata: twoSampleTTestMetadata,
    run: runTwoSampleTTest,
    example: `sample_id,treatment,replicate,concentration_ng_ul,od260_280
SRR2584863,control,1,38.4,1.91
SRR2584864,control,2,42.1,1.87
SRR2584869,control,3,39.7,1.92
SRR2584865,treatment,1,55.8,1.83
SRR2584866,treatment,2,52.6,1.79
SRR2584870,treatment,3,57.3,1.81
SRR2584867,recovery,1,47.5,1.88
SRR2584868,recovery,2,49.2,1.90`
  },
  {
    metadata: pairwiseTTestPostHocMetadata,
    run: runPairwiseTTestPostHocTool,
    example: `sample,condition,expression
HBB_HUMAN_1,adult,12.4
HBB_HUMAN_2,adult,12.9
HBB_HUMAN_3,adult,11.8
HBB_HUMAN_4,adult,13.1
HBB_HUMAN_5,adult,12.6
HBB_FETAL_1,fetal,18.7
HBB_FETAL_2,fetal,19.4
HBB_FETAL_3,fetal,17.9
HBB_FETAL_4,fetal,20.1
HBB_FETAL_5,fetal,18.9
HBB_STRESS_1,stress,15.0
HBB_STRESS_2,stress,15.6
HBB_STRESS_3,stress,14.7
HBB_STRESS_4,stress,15.3
HBB_STRESS_5,stress,16.2
HBB_KD_1,knockdown,7.8
HBB_KD_2,knockdown,8.3
HBB_KD_3,knockdown,7.4
HBB_KD_4,knockdown,8.0
HBB_KD_5,knockdown,7.1`
  },
  {
    metadata: mannWhitneyUTestMetadata,
    run: runMannWhitneyUTestTool,
    example: `sample,condition,expression
C1,control,8.1
C2,control,7.9
C3,control,8.4
C4,control,8.0
C5,control,8.3
C6,control,7.7
T1,treatment,10.0
T2,treatment,9.7
T3,treatment,10.4
T4,treatment,9.9
T5,treatment,10.2
T6,treatment,9.6`
  },
  {
    metadata: kruskalWallisTestMetadata,
    run: runKruskalWallisTestTool,
    example: `sample,condition,expression
C1,control,8.1
C2,control,7.9
C3,control,8.4
C4,control,8.0
C5,control,8.3
H1,heat_shock,11.4
H2,heat_shock,10.9
H3,heat_shock,11.8
H4,heat_shock,10.7
H5,heat_shock,11.2
R1,recovery,9.2
R2,recovery,9.0
R3,recovery,9.6
R4,recovery,9.3
R5,recovery,9.1`
  },
  {
    metadata: pairedTTestMetadata,
    run: runPairedTTestTool,
    example: `sample,before,after,batch
RNA_001,38.4,44.2,A
RNA_002,42.1,45.0,A
RNA_003,39.7,43.6,A
RNA_004,41.0,46.4,B
RNA_005,37.9,41.8,B
RNA_006,40.3,44.9,B
RNA_007,43.2,48.1,B
RNA_008,39.1,42.7,C`
  },
  {
    metadata: wilcoxonSignedRankTestMetadata,
    run: runWilcoxonSignedRankTestTool,
    example: `sample,before,after,batch
RNA_001,38.4,44.2,A
RNA_002,42.1,45.0,A
RNA_003,39.7,43.6,A
RNA_004,41.0,46.4,B
RNA_005,37.9,41.8,B
RNA_006,40.3,44.9,B
RNA_007,43.2,48.1,B
RNA_008,39.1,42.7,C`
  },
  {
    metadata: oneWayAnovaMetadata,
    run: runOneWayAnovaTool,
    example: `sample_id,treatment,replicate,concentration_ng_ul,od260_280
SRR2584863,control,1,38.4,1.91
SRR2584864,control,2,42.1,1.87
SRR2584869,control,3,39.7,1.92
SRR2584865,treatment,1,55.8,1.83
SRR2584866,treatment,2,52.6,1.79
SRR2584870,treatment,3,57.3,1.81
SRR2584867,recovery,1,47.5,1.88
SRR2584868,recovery,2,49.2,1.90`
  },
  {
    metadata: twoWayAnovaMetadata,
    run: runTwoWayAnovaTool,
    example: `sample,genotype,treatment,expression
S01,wild_type,control,10.0
S02,wild_type,control,11.0
S03,wild_type,control,9.0
S04,wild_type,drug,13.0
S05,wild_type,drug,14.0
S06,wild_type,drug,12.0
S07,mutant,control,8.0
S08,mutant,control,7.0
S09,mutant,control,9.0
S10,mutant,drug,16.0
S11,mutant,drug,17.0
S12,mutant,drug,15.0`
  },
  {
    metadata: repeatedMeasuresAnovaMetadata,
    run: runRepeatedMeasuresAnovaTool,
    example: `subject,condition,expression
Mouse_01,baseline,8.1
Mouse_01,drug,10.2
Mouse_01,washout,8.7
Mouse_02,baseline,7.9
Mouse_02,drug,9.8
Mouse_02,washout,8.4
Mouse_03,baseline,8.4
Mouse_03,drug,10.9
Mouse_03,washout,9.1
Mouse_04,baseline,8.0
Mouse_04,drug,10.0
Mouse_04,washout,8.5
Mouse_05,baseline,8.3
Mouse_05,drug,10.7
Mouse_05,washout,8.9
Mouse_06,baseline,7.7
Mouse_06,drug,9.5
Mouse_06,washout,8.2`
  },
  {
    metadata: twoGroupPermutationTestMetadata,
    run: runTwoGroupPermutationTestTool,
    example: `sample,condition,expression
C1,control,8.2
C2,control,7.9
C3,control,8.4
C4,control,8.0
T1,treated,10.3
T2,treated,9.8
T3,treated,10.7
T4,treated,9.9`
  },
  {
    metadata: pcaPlotMetadata,
    run: runPcaPlot,
    example: `sample_id,condition,gene_A,gene_B,gene_C,gene_D,gene_E
SRR2584863,control,18.4,5.2,44.1,3.1,21.4
SRR2584864,control,19.7,4.8,41.9,3.4,22.1
SRR2584869,control,18.9,5.0,43.2,3.2,21.9
SRR2584865,heat_shock,31.2,6.1,60.5,82.2,24.6
SRR2584866,heat_shock,29.4,5.7,58.6,79.5,24.1
SRR2584870,heat_shock,32.6,6.4,63.1,88.4,25.0
SRR2584867,recovery,23.6,5.9,49.8,22.4,23.2
SRR2584868,recovery,24.1,6.0,50.5,20.7,23.6
SRR2584871,recovery,22.8,5.6,48.7,18.9,22.8
SRR2584872,stress_variant,34.8,4.9,55.1,64.0,30.2
SRR2584873,stress_variant,35.4,5.1,56.7,66.8,31.0
SRR2584874,stress_variant,33.9,4.7,54.9,61.5,29.7`
  },
  {
    metadata: tsnePlotMetadata,
    run: runTsnePlot,
    example: `sample_id,condition,gene_A,gene_B,gene_C,gene_D,gene_E,gene_F
SRR2584863,control,18.4,5.2,44.1,3.1,21.4,6.2
SRR2584864,control,19.7,4.8,41.9,3.4,22.1,6.0
SRR2584869,control,18.9,5.0,43.2,3.2,21.9,6.4
SRR2584875,control,19.1,5.1,42.8,3.0,21.7,6.1
SRR2584865,heat_shock,31.2,6.1,60.5,82.2,24.6,8.9
SRR2584866,heat_shock,29.4,5.7,58.6,79.5,24.1,8.1
SRR2584870,heat_shock,32.6,6.4,63.1,88.4,25.0,9.3
SRR2584876,heat_shock,30.7,6.0,59.9,84.6,24.8,8.7
SRR2584867,recovery,23.6,5.9,49.8,22.4,23.2,7.3
SRR2584868,recovery,24.1,6.0,50.5,20.7,23.6,7.0
SRR2584871,recovery,22.8,5.6,48.7,18.9,22.8,7.2
SRR2584877,recovery,24.5,6.2,51.0,21.5,23.9,7.4
SRR2584872,stress_variant,34.8,4.9,55.1,64.0,30.2,5.5
SRR2584873,stress_variant,35.4,5.1,56.7,66.8,31.0,5.7
SRR2584874,stress_variant,33.9,4.7,54.9,61.5,29.7,5.4
SRR2584878,stress_variant,36.1,5.0,57.4,68.2,31.4,5.9`
  },
  {
    metadata: scatterPlotMetadata,
    run: runScatterPlot,
    example: `sample_id,treatment,concentration_ng_ul,od260_280,library_yield_ng
SRR2584863,control,38.4,1.91,420
SRR2584864,control,42.1,1.87,438
SRR2584869,control,39.7,1.92,431
SRR2584865,treatment,55.8,1.83,612
SRR2584866,treatment,52.6,1.79,574
SRR2584870,treatment,57.3,1.81,635
SRR2584867,recovery,47.5,1.88,502
SRR2584868,recovery,49.2,1.90,519`
  },
  {
    metadata: histogramMetadata,
    run: runHistogram,
    example: `read_id,read_length,mean_quality
SRR2584863.1,151,36.8
SRR2584863.2,149,35.9
SRR2584863.3,151,37.2
SRR2584863.4,142,31.6
SRR2584863.5,147,34.4
SRR2584863.6,151,36.1
SRR2584863.7,138,30.2
SRR2584863.8,150,35.6
SRR2584863.9,151,36.9
SRR2584863.10,145,33.0
SRR2584863.11,151,37.1
SRR2584863.12,144,32.7`
  },
  {
    metadata: qqPlotMetadata,
    run: runQqPlot,
    example: `sample_id,condition,normalized_expression
SRR2584863,control,8.14
SRR2584864,control,7.96
SRR2584869,control,8.32
SRR2584865,heat_shock,10.88
SRR2584866,heat_shock,11.35
SRR2584870,heat_shock,11.82
SRR2584867,recovery,9.21
SRR2584868,recovery,9.05
SRR2584871,recovery,9.63
SRR2584872,stress_variant,12.44
SRR2584873,stress_variant,12.08
SRR2584874,stress_variant,11.71
SRR2584875,control,8.28
SRR2584876,recovery,9.48
SRR2584877,heat_shock,10.72`
  },
  {
    metadata: manhattanPlotMetadata,
    run: runManhattanPlot,
    example: `CHR,BP,SNP,P,BETA
chr1,10544,rs_demo_1_001,0.42,0.02
chr1,82412,rs_demo_1_002,0.019,0.11
chr1,184991,rs_demo_1_003,0.00024,0.31
chr1,321004,rs_demo_1_peak,0.000000018,0.78
chr1,512300,rs_demo_1_005,0.14,-0.05
chr2,22018,rs_demo_2_001,0.38,0.03
chr2,119400,rs_demo_2_002,0.0062,-0.24
chr2,276810,rs_demo_2_003,0.00091,-0.33
chr2,411205,rs_demo_2_peak,0.00000062,-0.68
chr2,615300,rs_demo_2_005,0.071,0.08
chr3,30444,rs_demo_3_001,0.54,-0.01
chr3,93312,rs_demo_3_002,0.023,0.13
chr3,211880,rs_demo_3_peak,0.0000035,0.51
chr3,390104,rs_demo_3_004,0.0048,0.22
chr3,589222,rs_demo_3_005,0.31,-0.04
chr4,18400,rs_demo_4_001,0.76,0.00
chr4,144820,rs_demo_4_002,0.041,-0.09
chr4,245119,rs_demo_4_peak,0.000000004,0.88
chr4,501220,rs_demo_4_004,0.012,0.18
chr4,802410,rs_demo_4_005,0.22,-0.06
chr5,55001,rs_demo_5_001,0.49,0.02
chr5,160400,rs_demo_5_002,0.018,0.12
chr5,260780,rs_demo_5_peak,0.00000021,-0.74
chr5,444110,rs_demo_5_004,0.0038,-0.27
chr5,703350,rs_demo_5_005,0.19,0.05
chrX,42050,rs_demo_x_001,0.29,-0.03
chrX,188420,rs_demo_x_peak,0.000011,0.44
chrX,321760,rs_demo_x_003,0.061,0.07
chrY,31020,rs_demo_y_001,0.33,0.02
chrY,129880,rs_demo_y_peak,0.00029,-0.30
chrMT,1200,rs_demo_mt_001,0.48,0.01
chrMT,8150,rs_demo_mt_peak,0.00082,0.26`
  },
  {
    metadata: linePlotMetadata,
    run: runLinePlot,
    example: `sample_id,condition,time_hr,mean_tpm
SRR2584863_control_0h,control,0,18.4
SRR2584863_control_1h,control,1,20.1
SRR2584863_control_2h,control,2,21.8
SRR2584863_control_4h,control,4,22.4
SRR2584865_heat_0h,heat_shock,0,18.9
SRR2584865_heat_1h,heat_shock,1,31.2
SRR2584865_heat_2h,heat_shock,2,47.6
SRR2584865_heat_4h,heat_shock,4,34.3`
  },
  {
    metadata: barPlotMetadata,
    run: runBarPlot,
    example: `gene_id,condition,mean_tpm
TP53,control,18.4
BRCA1,control,5.2
MYC,control,44.1
TP53,heat_shock,31.2
BRCA1,heat_shock,6.1
MYC,heat_shock,60.5
TP53,recovery,23.6
BRCA1,recovery,5.9
MYC,recovery,49.8`
  },
  {
    metadata: boxPlotMetadata,
    run: runBoxPlot,
    example: `sample_id,treatment,rin
SRR2584863,control,8.2
SRR2584864,control,8.0
SRR2584869,control,8.4
SRR2584865,heat_shock,7.6
SRR2584866,heat_shock,7.1
SRR2584870,heat_shock,7.4
SRR2584867,recovery,7.9
SRR2584868,recovery,8.1
SRR2584871,recovery,7.8`
  },
  {
    metadata: violinPlotMetadata,
    run: runViolinPlot,
    example: `sample_id,condition,expression
RNA_001,control,8.1
RNA_002,control,7.9
RNA_003,control,8.4
RNA_004,control,8.0
RNA_005,control,8.3
RNA_006,control,7.7
RNA_007,control,8.2
RNA_008,control,8.5
RNA_009,heat_shock,10.9
RNA_010,heat_shock,11.4
RNA_011,heat_shock,11.8
RNA_012,heat_shock,10.7
RNA_013,heat_shock,12.0
RNA_014,heat_shock,11.2
RNA_015,heat_shock,10.8
RNA_016,heat_shock,11.6
RNA_017,recovery,9.2
RNA_018,recovery,9.0
RNA_019,recovery,9.6
RNA_020,recovery,9.3
RNA_021,recovery,9.1
RNA_022,recovery,9.8
RNA_023,recovery,9.4
RNA_024,recovery,9.5`
  },
  {
    metadata: heatmapMetadata,
    run: runHeatmap,
    example: `gene_id,sample_id,tpm
TP53,SRR2584863,18.4
TP53,SRR2584864,19.7
TP53,SRR2584865,31.2
TP53,SRR2584866,29.4
BRCA1,SRR2584863,5.2
BRCA1,SRR2584864,4.8
BRCA1,SRR2584865,6.1
BRCA1,SRR2584866,5.7
MYC,SRR2584863,44.1
MYC,SRR2584864,41.9
MYC,SRR2584865,60.5
MYC,SRR2584866,58.6
HSPA1A,SRR2584863,3.1
HSPA1A,SRR2584864,3.4
HSPA1A,SRR2584865,82.2
HSPA1A,SRR2584866,79.5`
  },
  {
    metadata: volcanoPlotMetadata,
    run: runVolcanoPlot,
    example: `gene_id,log2_fold_change,p_value,adjusted_p_value
HSPA1A,3.4,0.0000004,0.000006
DNAJB1,2.1,0.0003,0.004
FOS,1.5,0.002,0.018
TP53,0.4,0.08,0.21
BRCA1,-0.8,0.03,0.09
MYC,1.2,0.04,0.07
GAPDH,0.05,0.62,0.81
RPL13A,-0.2,0.48,0.72
COL1A1,-2.4,0.00008,0.0012
MMP9,-1.8,0.0009,0.009
IL6,2.8,0.00002,0.0005
ACTB,0.1,0.55,0.78`
  },
  {
    metadata: sankeyPlotMetadata,
    run: runSankeyPlot,
    example: `source,target,reads_million
raw reads,trimmed reads,18.2
raw reads,adapter/quality removed,1.6
trimmed reads,genome aligned,15.1
trimmed reads,rRNA or contaminant,0.8
trimmed reads,unmapped,2.3
genome aligned,exonic,10.4
genome aligned,intronic,2.1
genome aligned,intergenic,2.6
exonic,protein coding,8.7
exonic,lncRNA,1.1
exonic,other annotation,0.6`
  },
  {
    metadata: tableGroupSummaryMetadata,
    run: runTableGroupSummary,
    example: `sample_id,collection_date,treatment,replicate,concentration_ng_ul,od260_280,qc_pass,notes
SRR2584863,2024-01-12,control,1,38.4,1.91,true,bulk RNA replicate
SRR2584864,2024-01-12,control,2,42.1,1.87,true,bulk RNA replicate
SRR2584865,2024-01-13,heat_shock,1,55.8,1.83,true,30 minute heat shock
SRR2584866,2024-01-13,heat_shock,2,NA,1.79,false,low concentration
SRR2584867,2024-01-14,recovery,1,47.5,1.88,true,2 hour recovery
SRR2584868,2024-01-14,recovery,2,49.2,1.90,true,2 hour recovery
SRR2584869,2024-01-15,control,3,39.7,1.92,true,library repeated
SRR2584870,2024-01-15,heat_shock,3,57.3,1.81,true,library repeated`
  },
  {
    metadata: tableReshapeMetadata,
    run: runTableReshape,
    example: `sample_id,treatment,gene_id,tpm
SRR2584863,control,TP53,18.4
SRR2584863,control,BRCA1,5.2
SRR2584863,control,MYC,44.1
SRR2584864,control,TP53,19.7
SRR2584864,control,BRCA1,4.8
SRR2584864,control,MYC,41.9
SRR2584865,heat_shock,TP53,31.2
SRR2584865,heat_shock,BRCA1,6.1
SRR2584865,heat_shock,MYC,60.5`
  },
  {
    metadata: tableJoinMetadata,
    run: runTableJoin,
    example: `sample_id,treatment,replicate,status
SRR2584863,control,1,pass
SRR2584864,control,2,pass
SRR2584865,heat_shock,1,review
SRR2584865,heat_shock,2,review
SRR2584867,recovery,1,pass
---
sample_id,status,fastq_1,fastq_2,read_pairs_millions
SRR2584863,available,SRR2584863_R1.fastq.gz,SRR2584863_R2.fastq.gz,18.2
SRR2584864,available,SRR2584864_R1.fastq.gz,SRR2584864_R2.fastq.gz,17.9
SRR2584865,available,SRR2584865_L001_R1.fastq.gz,SRR2584865_L001_R2.fastq.gz,11.2
SRR2584865,available,SRR2584865_L002_R1.fastq.gz,SRR2584865_L002_R2.fastq.gz,11.2
SRR2584868,available,SRR2584868_R1.fastq.gz,SRR2584868_R2.fastq.gz,19.1`
  },
  {
    metadata: tableColumnCalculatorMetadata,
    run: runTableColumnCalculator,
    example: `sample_id,total_reads,mapped_reads,duplicate_reads
SRR2584863,18200000,17654000,1250000
SRR2584864,17900000,17084000,1180000
SRR2584865,22400000,21123000,1740000
SRR2584866,21800000,19876000,2010000
SRR2584867,19100000,18312000,1325000`
  },
  {
    metadata: tableColumnComparisonMetadata,
    run: runTableColumnComparison,
    example: `sample_id,treatment,library_type,concentration_ng_ul,rin,passed_qc
SRR2584863,control,polyA,38.4,8.9,true
SRR2584864,control,polyA,42.1,8.7,true
SRR2584865,heat_shock,polyA,55.8,7.4,true
SRR2584866,heat_shock,ribo_depleted,52.6,6.9,false
SRR2584867,recovery,ribo_depleted,47.5,8.1,true
SRR2584868,recovery,polyA,49.2,8.4,true
SRR2584869,control,ribo_depleted,39.7,9.1,true
SRR2584870,heat_shock,polyA,57.3,7.2,true
SRR2584871,recovery,ribo_depleted,45.9,8.0,true
SRR2584872,control,polyA,,8.8,false
SRR2584873,heat_shock,ribo_depleted,54.4,,false
SRR2584874,recovery,polyA,48.6,8.3,true`
  },
  {
    metadata: tableDataFormatConverterMetadata,
    run: runTableDataFormatConverter,
    example: `sample_id,treatment,concentration_ng_ul,od260_280
SRR2584863,control,38.4,1.91
SRR2584864,control,42.1,1.87
SRR2584865,treatment,55.8,1.83
SRR2584866,treatment,52.6,1.79`
  },
  {
    metadata: tableSqlQueryMetadata,
    run: runTableSqlQuery,
    example: `sample_id,treatment,replicate,concentration_ng_ul,od260_280,qc_pass
SRR2584863,control,1,38.4,1.91,true
SRR2584864,control,2,42.1,1.87,true
SRR2584865,heat_shock,1,55.8,1.83,true
SRR2584866,heat_shock,2,52.6,1.79,false
SRR2584867,recovery,1,47.5,1.88,true
SRR2584868,recovery,2,49.2,1.90,true
SRR2584869,control,3,39.7,1.92,true
SRR2584870,heat_shock,3,57.3,1.81,true`
  },
  {
    metadata: vcfGenotypeTableMetadata,
    run: runVcfGenotypeTable,
    example: vcfExtractorExample
  },
  {
    metadata: vcfFilterMetadata,
    run: runVcfFilter,
    example: `##fileformat=VCFv4.2
##source=SMS3 VCF filter example
##contig=<ID=chr7,length=159345973,assembly=GRCh38>
##FILTER=<ID=PASS,Description="All filters passed">
##FILTER=<ID=lowQD,Description="Low quality by depth">
##INFO=<ID=DP,Number=1,Type=Integer,Description="Total read depth">
##INFO=<ID=AF,Number=A,Type=Float,Description="Allele frequency">
##INFO=<ID=ANN,Number=.,Type=String,Description="Functional annotation">
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Genotype quality">
##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read depth">
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	tumor	normal
chr7	55019017	EGFR_snv	A	G	92	PASS	DP=82;AF=0.42;ANN=missense	GT:GQ:DP	0/1:64:41	0/0:58:38
chr7	55019222	EGFR_del	CT	C	61	PASS	DP=55;AF=0.31;ANN=frameshift	GT:GQ:DP	0/1:50:27	0/0:55:28
chr7	55019621	EGFR_lowq	G	T	12	lowQD	DP=18;AF=0.08;ANN=intron	GT:GQ:DP	0/1:16:9	0/0:45:9
chr7	55020111	.	G	GA	44	PASS	DP=37;AF=0.18;ANN=inframe_insertion	GT:GQ:DP	0/1:39:19	0/0:48:18
chr7	55020654	EGFR_hom_alt	C	T	78	PASS	DP=73;AF=0.67;ANN=stop_gained	GT:GQ:DP	1/1:71:35	0/1:52:33`
  },
  {
    metadata: samBamSummaryRegionViewerMetadata,
    run: runSamBamSummaryRegionViewer,
    example: samBamSummaryRegionViewerExample
  },
  {
    metadata: lineListCleanerMetadata,
    run: runLineListCleaner,
    example: `sample10
sample2
sample1
Sample2

sample10
  sample3  `
  },
  {
    metadata: randomRowsLinesMetadata,
    run: runRandomRowsLines,
    example: `sample_id	treatment	concentration_ng_ul	notes
SRR2584863	control	38.4	bulk RNA replicate
SRR2584864	control	42.1	bulk RNA replicate
SRR2584865	heat_shock	55.8	30 minute heat shock
SRR2584866	heat_shock	52.6	repeat extraction
SRR2584867	recovery	47.5	2 hour recovery
SRR2584868	recovery	49.2	2 hour recovery
SRR2584869	control	39.7	library repeated
SRR2584870	heat_shock	57.3	library repeated`
  },
  {
    metadata: vcfRandomSamplerMetadata,
    run: runVcfRandomSampler,
    example: `##fileformat=VCFv4.2
##source=SMS3 VCF random sampler example
##contig=<ID=chr1,length=248956422,assembly=GRCh38>
##contig=<ID=chr2,length=242193529,assembly=GRCh38>
##contig=<ID=chr3,length=198295559,assembly=GRCh38>
##contig=<ID=chr7,length=159345973,assembly=GRCh38>
##contig=<ID=chr12,length=133275309,assembly=GRCh38>
##contig=<ID=chrX,length=156040895,assembly=GRCh38>
##FILTER=<ID=PASS,Description="All filters passed">
##FILTER=<ID=lowQD,Description="Low quality by depth">
##INFO=<ID=DP,Number=1,Type=Integer,Description="Total read depth">
##INFO=<ID=AF,Number=A,Type=Float,Description="Allele frequency">
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Genotype quality">
##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read depth">
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	tumor	normal	control
chr1	1010	rs_sampler_snv	A	G	91	PASS	DP=84;AF=0.33	GT:GQ:DP	0/1:60:35	0/0:58:33	./.:.:0
chr1	2050	rs_sampler_del	AT	A	72	PASS	DP=61;AF=0.21	GT:GQ:DP	0/1:50:28	0/0:57:30	0/0:54:26
chr2	3300	rs_sampler_ins	C	CT	68	PASS	DP=58;AF=0.18	GT:GQ:DP	0/1:46:22	0/0:52:25	0/0:49:24
chr2	4100	rs_sampler_multi	G	A,C	54	PASS	DP=69;AF=0.12,0.07	GT:GQ:DP	1/2:44:25	0/1:41:21	0/0:50:23
chr3	5200	rs_sampler_lowq	T	C	12	lowQD	DP=30;AF=0.09	GT:GQ:DP	0/1:16:10	0/0:43:11	./.:.:0
chr7	55019017	EGFR_snv	A	G	92	PASS	DP=82;AF=0.42	GT:GQ:DP	0/1:64:41	0/0:58:38	0/1:55:37
chr12	7600	rs_sampler_symbolic	N	<DEL>	38	PASS	DP=40;AF=0.14	GT:GQ:DP	0/1:32:18	0/0:45:20	0/0:40:19
chrX	900	rs_sampler_x	C	T	70	PASS	DP=44;AF=0.22	GT:GQ:DP	0/1:48:19	0/0:52:21	0/0:47:18
chrM	150	rs_sampler_mt	A	G	65	PASS	DP=35;AF=0.19	GT:GQ:DP	0/1:38:15	0/0:44:18	0/0:42:17`
  },
  {
    metadata: readSimulatorMetadata,
    run: runReadSimulator,
    example: `>phiX174_testing_reference
GAGTTTTATCGCTTCCATGACGCAGAAGTTAACACTTTCGATCAGTTCGAGGACGACGACAGTATCG
GTTGACTGTTGACACCGTTAACGCCGATGTTGCTGACGTTGACGACTACGATGGTGTTGACGCTGAA
CTGCTGAAAGACGTTGACGGTATCGCTGAAGGTGTTGATGACGCTGTTGACGAACTGATCGACGCTA
ACGGTGATGTTGACGGTGAACTGATCGCTGATGACGTTGCTGACGGTATCGATGAACTGACCGTTGA
GCTGATCGACGTTGACGCTGAAGGTGATGTTGACGCTGACGACTTCGCTGATGACGGTGAACTGACC
GTTGATGCTGACGTTGAACTGATCGCTGACGGTGTTGACGACTACGCTGAAGACGTTGCTGACGGTGA
TACCGTTGAACTGATCGACGTTGACGCTGAAGGTGATGTTGACGCTGACGACTTCGCTGATGACGGTG`
  },
  {
    metadata: readMappingCoverageMetadata,
    run: runReadMappingCoverage,
    example: readMappingCoverageExample
  },
  {
    metadata: upsetPlotMetadata,
    run: runUpsetPlot,
    example: `# List A: RNA-seq differential-expression hits
TP53
MYC
EGFR
BRCA1
CDKN1A
MDM2
KRAS
CCND1
BCL2
JUN
ERBB2
PTEN
RB1
CHEK2
FOS
E2F1
GATA3
ESR1
SMAD4
ATM
NFKB1
SOX2
TERT
CCNE1
---
# List B: ATAC-linked genes
TP53
MYC
EGFR
BRCA1
CDKN1A
MDM2
KRAS
CCND1
MAPK1
STAT3
ERBB2
PTEN
RB1
CHEK2
PIK3CA
AKT1
MTOR
CTNNB1
NOTCH1
RELA
AURKA
CDK4
FOXM1
---
# List C: ChIP-seq promoter targets
TP53
MYC
EGFR
BRCA1
CDKN1A
MDM2
BCL2
JUN
MAPK1
STAT3
FOS
E2F1
GATA3
PIK3CA
AKT1
MTOR
VEGFA
HIF1A
PROM1
CXCL8
IL6
---
# List D: CRISPR screen hits
TP53
MYC
EGFR
CCND1
KRAS
BCL2
JUN
MAPK1
STAT3
ESR1
SMAD4
CTNNB1
NOTCH1
VEGFA
HIF1A
CASP3
BAX
CDH1`
  },
  {
    metadata: vennDiagramMetadata,
    run: runVennDiagram,
    example: `# List A: RNA-seq differential-expression hits
TP53
MYC
EGFR
BRCA1
CDKN1A
MDM2
KRAS
CCND1
BCL2
JUN
ERBB2
PTEN
RB1
CHEK2
FOS
E2F1
GATA3
ESR1
SMAD4
ATM
NFKB1
SOX2
TERT
CCNE1
---
# List B: ATAC-linked genes
TP53
MYC
EGFR
BRCA1
CDKN1A
MDM2
KRAS
CCND1
MAPK1
STAT3
ERBB2
PTEN
RB1
CHEK2
PIK3CA
AKT1
MTOR
CTNNB1
NOTCH1
RELA
AURKA
CDK4
FOXM1
---
# List C: ChIP-seq promoter targets
TP53
MYC
EGFR
BRCA1
CDKN1A
MDM2
BCL2
JUN
MAPK1
STAT3
FOS
E2F1
GATA3
PIK3CA
AKT1
MTOR
VEGFA
HIF1A
PROM1
CXCL8
IL6`
  },
  {
    metadata: textSearchReplaceMetadata,
    run: runTextSearchReplace,
    example: `sample_001	control	51.2
sample_002	treatment	63.4
blank row
sample_010	treatment	58.1`
  },
  {
    metadata: wordCloudMetadata,
    run: runWordCloud,
    example: `The ligation control produced a strong colony count, while the insert ligation produced fewer colonies.
Colony PCR confirmed the expected insert in most colonies, but two colonies showed the empty-vector band.
The sequencing reads had strong signal through the promoter, coding sequence, and terminator, although one read
showed lower quality near the final repeat. Follow-up analysis should compare the confirmed insert sequence with
the design sequence and check the restriction sites used for cloning.`
  },
  {
    metadata: markdownNotebookMetadata,
    run: runMarkdownNotebook,
    example: `# EGFP restriction digest notes

Date: 2026-05-11

## Question

Will EcoRI and HindIII release the expected insert?

## Results

- Paste SMS3 digest fragment tables or viewer links here.
- Record any gel lane notes and follow-up decisions.`
  },
  {
    metadata: vectorContaminationScannerMetadata,
    run: runWorkerOnlyTool,
    example: `>cloning_read_vector_tail
ATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGATCGTACCCCGATCGGGAGCTCCCATGGGGCCATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGAAAGGAGAGGACGCTGTCAGAGGACGGTTACGAACGTAGGACAGAAGGGAGAGATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGATCGTACCCCGATCGGGAGCTC
>reverse_oriented_vector_tail
ATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGATCGTACCCCGATCGCTCTCCCTTCTGTCCTACGTTCGTAACCGTCCTCTGACAGCGTCCTCTCCTTGCTAGTACCGTACGATCGTACGATCGGATATCGTACGATCGTACCCCGATCGGGAGCTCCCAT`
  },
  {
    metadata: restrictionSummaryMetadata,
    run: runRestrictionSummary,
    example: `>pUC19 restriction-screening region
TTGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTCGTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAAGCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCTTTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTATTGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTCACTCAAAGGCGGTAATACGGTTATCCACAGAATCAGGGGATAACGCAGGAAAGAACATGTGAGCAAAAGGCCAGCAAAAGGCCAGGAACCGTAAAAAGGCCGCGTTGCTGGCGTTTTTCCATAGGCTCCGCCCCCCTGACGAGCATCACAAAAATCGACGCTCAAGTCAGAGGTGGCGAAACCCGACAGGACTATAAAGATACCAGGCGTTTCCCCCTGGAAGCTCCCTCGTGCGCTCTCCTGTTCCGACCCTGCCGCTTACCGGATACCTGTCCGCCTTTCTCCCTTCGGGAAGCGTGGCGCTTTCTCATAGCTCACGCTGTAGGTATCTCAGTTCGGTGTAGGTCGTTCGCTCCAAGCTGGGCTGTGTGCACGAACCCCCCGTTCAGCCCGACCGCTGCGCCTTATCCGGTAACTATCGTCTTGAGTCCAACCCGGTAAGACACGACTTATCGCCACTGGCAGCAGCCACTGGTAACAGGATTAGCAGAGCGAGGTATGTAGGCGGTGCTACAGAGTTCTTGAAGTGGTGGCCTAACTACGGCTACACTAGAAGAACAGTATTTGGTATCTGCGCTCTGCTGAAGCCAGTTACCTTCGGAAAAAGAGTTGGTAGCTCTTGATCCGGCAAACAAACCACCGCTGGTAGCGGTGGTTTTTTTGTTTGCAAGCAGCAGATTACGCGCAGAAAAAAAGGATCTCAAGAAGATCCTTTGATCTTTTCTACGGGGTCTGACGCTCAGTGGAACGAAAACTCACGTTAAGGGATTTTGGTCATGAGATTATCAAAAAGGATCTTCACCTAGATCCTTTTAAATTAAAAATGAAGTTTTAAATCAATCTAAAGTATATATGAGTAAACTTGGTCTGACAGTTACCAATGCTTAATCAGTGAGGCACCTATCTCAGCGATCTGTCTATTTCGTTCATCCATAGTTGCCTGACTCCCCGTCGTGTAGATAACTACGATACGGGAGGGCTTACCATCTGGCCCCAGTGCTGCAATGATACCGCGAGACCCACGCTCACCGGCTCCAGATTTATCAGCAATAAACCAGCCAGCCGGAAGGGCCGAGCGCAGAAGTGGTCCTGCAACTTTATCCGCCTCCATCCAGTCTATTAATTGTTGCCGGGAAGCTAGAGTAAGTAGTTCGCCAGTTAATAGTTTGCGCAACGTTGTTGCCATTGCTACAGGCATCGTGGTGTCACGCTCGTCGTTTGGTATGGCTTCATTCAGCTCCGGTTCCCAACGATCAAGGCGAGTTACATGATCCCCCATGTTGTGCAAAAAAGCGGTTAGCTCCTTCGGTCCTCCGATCGTTGTCAGAAGTAAGTTGGCCGCAGTGTTATCACTCATGGTTATGGCAGCACTGCATAATTCTCTTACTGTCATGCCATCCGTAAGATGCTTTTCTGTGACTGGTGAGTACTCAACCAAGTCATTCTGAGAATAGTGTATGCGGCGACCGAGTTGCTCTTGCCCGGCGTCAATACGGGATAATACCGCGCCACATAGCAGAACTTTAAAAGTGCTCATCATTGGAAAACGTTCTTCGGGGCGAAAACTCTCAAGGATCTTACCGCTGTTGAGATCCAGTTCGATGTAACCCACTCGTGCACCCAACTGATCTTCAGCATCTTTTACTTTCACCAGCGTTTCTGGGTGAGCAAAAACAGGAAGGCAAAATGCCGCAAAAAAGGGAATAAGGGCGACACGGAAATGTTGAATACTCATACTCTTCCTTTTTCAATATTATTGAAGCATTTATCAGGGTTATTGTCTCATGAGCGGATACATATTTGAATGTATTTAGAAAAATAAACAAATAGGGGTTCCGCGCACATTTCCCCGAAAAGTGCCACCTGACGTCTAAGAAACCATTATTATCATGACATTAACCTATAAAAATAGGCGTATCACGAGGCCCTTTCGTC
>synthetic ambiguous-region example
ATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGANTCGTACGATCGTACCCCGANTCGGGAGCTCCCATGGGGCCATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGANTCGTACGATCGTAC`
  },
  {
    metadata: restrictionDigestMetadata,
    run: runRestrictionDigest,
    example: `>pUC19 multiple-cloning-site region
TTGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTCGTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAAGCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCTTTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTATTGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTCACTCAAAGGCGGTAATACGGTTATCCACAGAATCAGGGGATAACGCAGGAAAGAACATGTGAGCAAAAGGCCAGCAAAAGGCCAGGAACCGTAAAAAGGCCGCGTTGCTGGCGTTTTTCCATAGGCTCCGCCCCCCTGACGAGCATCACAAAAATCGACGCTCAAGTCAGAGGTGGCGAAACCCGACAGGACTATAAAGATACCAGGCGTTTCCCCCTGGAAGCTCCCTCGTGCGCTCTCCTGTTCCGACCCTGCCGCTTACCGGATACCTGTCCGCCTTTCTCCCTTCGGGAAGCGTGGCGCTTTCTCATAGCTCACGCTGTAGGTATCTCAGTTCGGTGTAGGTCGTTCGCTCCAAGCTGGGCTGTGTGCACGAACCCCCCGTTCAGCCCGACCGCTGCGCCTTATCCGGTAACTATCGTCTTGAGTCCAACCCGGTAAGACACGACTTATCGCCACTGGCAGCAGCCACTGGTAACAGGATTAGCAGAGCGAGGTATGTAGGCGGTGCTACAGAGTTCTTGAAGTGGTGGCCTAACTACGGCTACACTAGAAGAACAGTATTTGGTATCTGCGCTCTGCTGAAGCCAGTTACCTTCGGAAAAAGAGTTGGTAGCTCTTGATCCGGCAAACAAACCACCGCTGGTAGCGGTGGTTTTTTTGTTTGCAAGCAGCAGATTACGCGCAGAAAAAAAGGATCTCAAGAAGATCCTTTGATCTTTTCTACGGGGTCTGACGCTCAGTGGAACGAAAACTCACGTTAAGGGATTTTGGTCATGAGATTATCAAAAAGGATCTTCACCTAGATCCTTTTAAATTAAAAATGAAGTTTTAAATCAATCTAAAGTATATATGAGTAAACTTGGTCTGACAGTTACCAATGCTTAATCAGTGAGGCACCTATCTCAGCGATCTGTCTATTTCGTTCATCCATAGTTGCCTGACTCCCCGTCGTGTAGATAACTACGATACGGGAGGGCTTACCATCTGGCCCCAGTGCTGCAATGATACCGCGAGACCCACGCTCACCGGCTCCAGATTTATCAGCAATAAACCAGCCAGCCGGAAGGGCCGAGCGCAGAAGTGGTCCTGCAACTTTATCCGCCTCCATCCAGTCTATTAATTGTTGCCGGGAAGCTAGAGTAAGTAGTTCGCCAGTTAATAGTTTGCGCAACGTTGTTGCCATTGCTACAGGCATCGTGGTGTCACGCTCGTCGTTTGGTATGGCTTCATTCAGCTCCGGTTCCCAACGATCAAGGCGAGTTACATGATCCCCCATGTTGTGCAAAAAAGCGGTTAGCTCCTTCGGTCCTCCGATCGTTGTCAGAAGTAAGTTGGCCGCAGTGTTATCACTCATGGTTATGGCAGCACTGCATAATTCTCTTACTGTCATGCCATCCGTAAGATGCTTTTCTGTGACTGGTGAGTACTCAACCAAGTCATTCTGAGAATAGTGTATGCGGCGACCGAGTTGCTCTTGCCCGGCGTCAATACGGGATAATACCGCGCCACATAGCAGAACTTTAAAAGTGCTCATCATTGGAAAACGTTCTTCGGGGCGAAAACTCTCAAGGATCTTACCGCTGTTGAGATCCAGTTCGATGTAACCCACTCGTGCACCCAACTGATCTTCAGCATCTTTTACTTTCACCAGCGTTTCTGGGTGAGCAAAAACAGGAAGGCAAAATGCCGCAAAAAAGGGAATAAGGGCGACACGGAAATGTTGAATACTCATACTCTTCCTTTTTCAATATTATTGAAGCATTTATCAGGGTTATTGTCTCATGAGCGGATACATATTTGAATGTATTTAGAAAAATAAACAAATAGGGGTTCCGCGCACATTTCCCCGAAAAGTGCCACCTGACGTCTAAGAAACCATTATTATCATGACATTAACCTATAAAAATAGGCGTATCACGAGGCCCTTTCGTC
>synthetic comparison region
ATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGATCGTACGATCGTACATGCGTACGTTAGCTAGTACCGTACGATCGTACGATCGGATATCGTACGATCGTACGATCGTAC`
  },
  {
    metadata: annotatedDnaRecordExtractorMetadata,
    run: runAnnotatedDnaRecordExtractor,
    example: recordParserExample
  },
  {
    metadata: annotatedProteinRecordExtractorMetadata,
    run: runAnnotatedProteinRecordExtractor,
    example: proteinRecordParserExample
  },
  {
    metadata: biologicalRecordFormatConverterMetadata,
    run: runBiologicalRecordFormatConverter,
    example: recordParserExample
  },
  {
    metadata: gffGtfFeatureExtractorMetadata,
    run: runGffGtfFeatureExtractor,
    example: `##gff-version 3
chr_demo	SMS3	gene	7	132	.	+	.	ID=geneA;Name=demo_gene_A
chr_demo	SMS3	mRNA	7	132	.	+	.	ID=txA;Parent=geneA;Name=demo_transcript_A
chr_demo	SMS3	exon	7	60	.	+	.	Parent=txA
chr_demo	SMS3	exon	90	132	.	+	.	Parent=txA
chr_demo	SMS3	CDS	13	60	.	+	0	Parent=txA;product=demo_peptide_A
chr_demo	SMS3	CDS	90	125	.	+	0	Parent=txA;product=demo_peptide_A
chr_demo	SMS3	gene	145	198	.	-	.	ID=geneB;Name=demo_gene_B
chr_demo	SMS3	mRNA	145	198	.	-	.	ID=txB;Parent=geneB;Name=demo_transcript_B
chr_demo	SMS3	exon	145	198	.	-	.	Parent=txB
chr_demo	SMS3	CDS	151	195	.	-	0	Parent=txB;product=demo_peptide_B
##FASTA
>chr_demo
TTTTTTATGGCTGCTGCTGAACTGAAACCGTTTAAACCGGCTGATGCTGCTGCTTAATTTTTTT
GGGGGGGGGGATGACCGGTACCGCTGCTGATGAAGCTGCTGCTGCTGCTGCTGCTTAATTTTTT
CCCCCCATGAAAGGTGCTGATGCTGCTGCTGCTGCTGCTGCTTAAAGGATCCGGATCCGGATCC`
  },
  {
    metadata: genomicIntervalOperationsMetadata,
    run: runGenomicIntervalOperations,
    example: `chr1	9	28	enhancer_window
chr1	44	78	promoter_window
chr1	130	180	downstream_window
chr2	4	24	secondary_window
---
##gff-version 3
chr1	SMS3	regulatory_region	15	35	.	+	.	ID=regA;Name=proximal_enhancer
chr1	SMS3	gene	50	95	.	+	.	ID=geneA;Name=lac_control_gene
chr1	SMS3	gene	120	170	.	-	.	ID=geneB;Name=antisense_feature
chr2	SMS3	gene	8	20	.	+	.	ID=geneC;Name=secondary_feature`
  },
  {
    metadata: mutateDnaRnaMetadata,
    run: runMutateDnaRna,
    example: `>NM_000546.6_TP53_coding_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
ATGGAAACTACTTCCTGAAAACAACGTTCTGTCCCCCTTGCCGTCCCAAGCAATGGATGATTTGAT
GCTGTCCCCGGACGATATTGAACAATGGTTCACTGAAGACCCAGGTCCAGATGAAGCTCCCAGAAT
>synthetic_RNA_transcript_fragment
AUGGCUACUGGUGGUAACUUUCCCAAAGGUUCUUCUGAAAUCGAUGCUGCUGGUGGUAAAUAA`
  },
  {
    metadata: mutateProteinMetadata,
    run: runMutateProtein,
    example: `>HBB_HUMAN_beta_globin_with_stop_marker
MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH*`
  },
  {
    metadata: randomCodingDnaMetadata,
    run: runRandomCodingDna,
    example: `Random coding DNA generator. Input text is ignored; set length, count, genetic code, and optional seed in the options.`
  },
  {
    metadata: randomDnaRnaMetadata,
    run: runRandomDnaRna,
    example: `Random DNA/RNA generator. Input text is ignored; set length, count, and optional seed in the options.`
  },
  {
    metadata: randomDnaFragmenterMetadata,
    run: runRandomDnaFragmenter,
    example: `>NC_001416.1_lambda_fragment
GGGCGGCGACCTCGCGGGTTTTCGCTATTTATGAAAATTTTCCGGTTTAAGGCGTTTCCGTTCTTCTTCGTCATAACTTAATGTTTTTATTTAAAATACCCTCTGAAAAGAAAGGAAACGACAGGTGCTGAAAGCGAGGCTTTTTGGCTGAACGAACTGTTTCGTCAGCTTGCTGAAAAAGTTACCCAGATGGGTGAAACAGCTTTTACGCTGGCTTTGCTGATGTTTCTGCTGCTGCTTTTCCGTTTACGCTGGTGAAACGCTG`
  },
  {
    metadata: randomDnaRnaRegionsMetadata,
    run: runRandomDnaRnaRegions,
    example: `>NM_000546.6_p53_region_replacement_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT`
  },
  {
    metadata: randomProteinMetadata,
    run: runRandomProtein,
    example: `Random protein generator. Input text is ignored; set length, count, and optional seed in the options.`
  },
  {
    metadata: randomProteinRegionsMetadata,
    run: runRandomProteinRegions,
    example: `>NP_000537.3_p53_region_replacement_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP`
  },
  {
    metadata: sampleDnaRnaMetadata,
    run: runSampleDnaRna,
    example: `>NM_000546.6_p53_base_sampling_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT`
  },
  {
    metadata: sampleProteinMetadata,
    run: runSampleProtein,
    example: `>NP_000537.3_p53_residue_sampling_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP`
  },
  {
    metadata: shuffleDnaRnaMetadata,
    run: runShuffleDnaRna,
    example: `>NM_007294.4_BRCA1_shuffle_fragment
ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTA`
  },
  {
    metadata: shuffleProteinMetadata,
    run: runShuffleProtein,
    example: `>NP_000537.3_p53_shuffle_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP`
  },
  {
    metadata: extractSubsequencesDnaRnaMetadata,
    run: runExtractSubsequencesDnaRna,
    example: `>NM_000546.6_p53_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
>IUPAC_control_fragment
ACGTRYSWKMBDHVN`
  },
  {
    metadata: extractSubsequencesProteinMetadata,
    run: runExtractSubsequencesProtein,
    example: `>NP_000537.3_p53_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP
>UniProt_P04637_region
SDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFT`
  },
  {
    metadata: fastaValidatorNormalizerMetadata,
    run: runFastaValidatorNormalizer,
    example: `>NM_000546.6_TP53_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
ATGGAAACTACTTCCTGAAAACAACGTTCTGTCCCCCTTGCCGTCCCAAGCAATGGATGATTTGAT
>NM_000546.6_TP53_fragment_duplicate_title
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
>spacing_issue_example
ACGT ACGT NNNN

>protein_like_record
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDL`
  },
  {
    metadata: fastaIndexCreatorMetadata,
    run: runFastaIndexCreator,
    example: `>chr1 synthetic reference segment
ACGTACGTACGTACGT
ACGTACGTACGTACGT
ACGTACGT
>plasmid_insert_A
GATTACAGATTACA
GATTACA`
  },
  {
    metadata: fastqSummaryMetadata,
    run: runFastqSummary,
    example: makeFastqQcExample()
  },
  {
    metadata: inSilicoPcrMetadata,
    run: runInSilicoPcr,
    example: `>pUC19_lac_mcs_region
TTGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTC
GTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAA
GCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCT
TTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTAT
TGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTC
>no_amplicon_control_region
ACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACACAC
>mini_circular_origin_test
GATCGTACGTTAGCCATGACCTGAAGTCCGATCGTTAACCGGATGCTAGTCCGATACGATTCGACCTAGGTCAC
GTAAGCTTAGCGTACGATC
---
>lac_forward_20
TTGACCATGATTACGCCAAG
>lac_reverse_20
GCGAGGAAGCGGAAGAGCGC
>mcs_forward_20
AGAGGATCCCCGGGTACCGA
>mcs_reverse_20
CAGGAAACAGCTATGACCAT
>circular_forward_20
GTCACGTAAGCTTAGCGTAC
>circular_reverse_20
GTTAACGATCGGACTTCAGG`
  },
  {
    metadata: pcrPrimerDesignMetadata,
    run: runPcrPrimerDesign,
    example: `>pUC19_lac_fragment_primer_design
TTGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTC
GTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAA
GCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCT
TTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTAT
TGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTC`
  },
  {
    metadata: crisprGuideDesignMetadata,
    run: runCrisprGuideDesign,
    example: `>pUC19_lac_crispr_review_region
TTGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTC
GTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAA
GCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCT
TTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTAT
TGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTC`
  },
  {
    metadata: talenTargetFinderMetadata,
    run: runTalenTargetFinder,
    example: `>pUC19_lac_talen_review_region
GGGTTACGTCGATCGATCGATTGACGTAACCGGTTTCAGGCTACGATCAGACCGGTTACCGTTA
TTATGACTGGTGGACAGCAAATGGGTCGCGGATCCGTCGACCTGCAGGCATGCAAGCTTGGCGTA
>reverse_orientation_talen_control
TAACGGTGATCGTACGATCGAACCGGTTACGTCAAATCGATCGATCGACGTAA`
  },
  {
    metadata: sirnaDesignMetadata,
    run: runSirnaDesign,
    example: `>NM_000546.6_TP53_mRNA_fragment
AUGGAGGAGCCGCAGUCAGAUCCUAGCGUCGAGCCCCCUCUGAGUCAGGAAACAUUUUCAGACCU
AUGGAAACUACUUCCUGAAAACAACGUUCUGUCCCCCUUGCCGUCCCAAGCAAUGGAUGAUUUGA
UGCUGUCCCCGGACGAUAUUGAACAAUGGUUCACUGAAGACCCAGGUCCAGAUGAAGCUCCCAGA
AUGCCAGAGGCUGCUCCCCCCGUGGCCCCUGCACCAGCAGCUCCUACACCGGCGGCCCCUGCACC`
  },
  {
    metadata: indexedFastaRegionExtractorMetadata,
    run: runIndexedFastaRegionExtractor,
    example: `>chr1
ACGTACGTACGTACGTACGTACGTACGTACGT
>chr2
TTTTCCCCAAAAGGGGNNNNACGTACGT`
  },
  {
    metadata: lightweightSequenceAssemblyMetadata,
    run: runLightweightSequenceAssembly,
    example: `>pUC19_lac_forward_1_160
TTGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCCCCGGGTACCGAGCTCGAATTCGTAATC
ATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAAGCATAAAGTGTA
>pUC19_lac_internal_121_280
ACAATTCCACACAACATACGAGCCGGAAGCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAAT
TGCGTTGCGCTCACTGCCCGCTTTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGA
>pUC19_lac_reverse_241_370
GAGCTGATACCGCTCGCCGCAGCCGAACGACCGAGCGCAGCGAGTCAGTGAGCGAGGAAGCGGAAGAGCGCCCAATACGC
AAACCGCCTCTCCCCGCGCGTTGGCCGATTCATTAATGCAGCTGGCACGA
>pUC19_lac_contained_check_181_230
GTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCTTTCCAGTC`
  },
  {
    metadata: fastaLengthFilterMetadata,
    run: runFastaLengthFilter,
    example: `>short_insert
ACGTTGCA
>NM_000546.6_TP53_CDS_fragment_polyA
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCTAAAAAAAAAAAA
>NM_007294.4_BRCA1_CDS_fragment_5prime_polyT
TTTTTTTTTTTTATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTA
>NM_002467.6_MYC_CDS_fragment
ATGCCCCTCAACGTTAGCTTCACCAACAGGAACTATGACCTCGACTACGACTCGGTGCAGCCGTATTTCTACTGCGACGAGGAG
>empty_record`
  },
  {
    metadata: fastaExtractByIdMetadata,
    run: runFastaExtractById,
    example: `>NM_000546.6 Homo sapiens tumor protein p53 transcript variant 1
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
ATGGAAACTACTTCCTGAAAACAACGTTCTGTCCCCCTTGCCGTCCCAAGCAATGGATGATTTGAT
>NM_007294.4 Homo sapiens BRCA1 DNA repair associated transcript variant 1
ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTA
GAGTGTCCCATCTGTCTGGAGTTGATCAAGGAACCTGTCTCCACAAAGTGTGACCACATATTTTGC
>NM_002467.6 Homo sapiens MYC proto-oncogene transcript variant 1
ATGCCCCTCAACGTTAGCTTCACCAACAGGAACTATGACCTCGACTACGACTCGGTGCAGCCGTAT
TTCTACTGCGACGAGGAGGAGAATGTCAAGAGGCGAACACACAACGTCTTGGAGCGCCAGAGGAGG
---
NM_007294.4
NM_000546.6`
  },
  {
    metadata: fastaToTableMetadata,
    run: runFastaToTable,
    example: `>NM_000546.6 Homo sapiens tumor protein p53 transcript variant 1
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
>NM_007294.4 Homo sapiens BRCA1 DNA repair associated transcript variant 1
ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTA
>NM_002467.6 Homo sapiens MYC proto-oncogene transcript variant 1
ATGCCCCTCAACGTTAGCTTCACCAACAGGAACTATGACCTCGACTACGACTCGGTGCAGCCGTAT`
  },
  {
    metadata: tableToFastaMetadata,
    run: runTableToFasta,
    example: `title,sequence
NM_000546.6 Homo sapiens tumor protein p53 transcript variant 1,ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
NM_007294.4 Homo sapiens BRCA1 DNA repair associated transcript variant 1,ATGGATTTATCTGCTCTTCGCGTTGAAGAAGTACAAAATGTCATTAATGCTATGCAGAAAATCTTA
NM_002467.6 Homo sapiens MYC proto-oncogene transcript variant 1,ATGCCCCTCAACGTTAGCTTCACCAACAGGAACTATGACCTCGACTACGACTCGGTGCAGCCGTAT`
  },
  {
    metadata: fastaHeaderRenameMetadata,
    run: runFastaHeaderRename,
    example: `>sample 1 / forward read
ACGTACGTACGT
>sample 2 / reverse read
TTTTCCCCAAAAGGGG
>sample 10 / control read
GATTACAGATTACA`
  },
  {
    metadata: groupNumberDnaRnaMetadata,
    run: runGroupNumberDnaRna,
    example: `>NM_000546.6_p53_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
ATGGAAACTACTTCCTGAAAACAACGTTCTGTCCCCCTTGCCGTCCCAAGCAATGGATGATTTGAT
GCTGTCCCCGGACGATATTGAACAATGGTTCACTGAAGACCCAGGTCCAGATGAAGCTCCCAGAA`
  },
  {
    metadata: groupNumberProteinMetadata,
    run: runGroupNumberProtein,
    example: `>NP_000537.3_p53_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP
DEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTA
KSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHH`
  },
  {
    metadata: proteinHydropathyMetadata,
    run: runProteinHydropathy,
    example: `>seqA
MKTIIALSYIFCLVFADYKDDDDKGGGGSSSSNNNNQQQQEEEEDDDD
VVVVVVVVVVLLLLLLLLLLIIIIIIIIIIFFFFFFFFFFGGGGKKKK
>seqB
MSSGNTSTNNQSDEEDKRKQLEEELAKLRQQLGADGAVVLGAGGVGKS
ALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYS`
  },
  {
    metadata: proteinPatternFinderMetadata,
    run: runProteinPatternFinder,
    example: `>NP_000537.3_p53_fragment_pattern_example
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP
DEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTA
KSVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHH
ERCSDSDGLAPPQHLIRVEGNLRVEYLDDRNTFRHSVVVPYEPPEVGSDCTTIHYNYMCN
SSCMGGMNRRPILTIITLEDS
>P01116_KRAS_fragment_pattern_example
MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAG
QEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDL
AARTVESRQAQDLARSYGIPYIETSAKTRQGVDDAFYTLVREIRQHKLRKLNPPDESGPG
CMSCKCVLS
>signal_tag_glycosylation_pattern_example
MKTIIALSYIFCLVFADYKDDDDKGGGGSSSSNNSTPAANVTKNNSSKQQQQEEEEDDDD`
  },
  {
    metadata: proteinMotifScannerMetadata,
    run: runProteinMotifScanner,
    example: `>motif-rich protein
MAAKKKKGGNNSTAGTAREGAASTDEAAASKL
>candidate myristoylation
MGNNSTAA
>NP_000537.3_p53_motif_region
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP
DEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTA
>P01116_KRAS_motif_region
MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAG
QEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDL`
  },
  {
    metadata: multipleAlignProteinMetadata,
    run: runMultipleAlignProtein,
    example: multipleAlignProteinExample
  },
  {
    metadata: primerOligoPropertiesMetadata,
    run: runPrimerOligoProperties,
    example: `>TP53_exon4_forward_primer
GAGGAGCCGCAGTCAGATC
>TP53_exon4_reverse_primer
CTGACAGGGGCTCGACTAC
>BRCA1_fragment_screening_primer
TGTGACCACATATTTTGCAA`
  },
  {
    metadata: pairwiseAlignDnaRnaMetadata,
    run: runPairwiseAlignDnaRna,
    example: `>sequence one
ATGGCTGCTGCTGGTGGTAAATTTCCCAAAGGTTCTTCTGAAATCGATGCTGCTGGTGGTAAATTTCCCAAATAA
>sequence two
ATGGCTGCTGGTGGTAAATTTCCCAAAGGTTCTTCTGAAATCGACGCTGCTGGTGGTAAATTTCCCAAATAA`
  },
  {
    metadata: pairwiseAlignCodingDnaMetadata,
    run: runPairwiseAlignCodingDna,
    example: `>coding sequence one
ATGGCTGCTGCTGGTGGTAAATTTCCCAAAGGTTCTTCTGAAATCGATGCTGCTGGTGGTAAATTTCCCAAAGCT
>coding sequence two
ATGGCTGCTGGTGGTAAATTTCCCAAAGGTTCTTCTGAAATCGACGCTGCTGGTGGTAAATTTCCCAAAGCT`
  },
  {
    metadata: pairwiseAlignProteinMetadata,
    run: runPairwiseAlignProtein,
    example: `>human_like
MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGE
>related
MTEYKLVVVGAGGIGKSALTIQLIQNHFVEEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRAGE`
  },
  {
    metadata: sequenceStatsProteinMetadata,
    run: runSequenceStatsProtein,
    example: `>NP_000537.3_p53_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP
>protein_ambiguity_control
ACDEFGHIKLMNPQRSTVWYBXZOU*`
  },
  {
    metadata: reverseTranslateMetadata,
    run: runReverseTranslate,
    example: `>NP_000537.3_p53_plot_fragment
MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGP
DEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKTYQGSYGFRLGFLHSGTAK
SVTCTYSPALNKMFCQLAKTCPVQLWVDSTPPPGTRVRAMAIYKQSQHMTEVVRRCPHHE
RCSDSDGLAPPQHLIRVEGNL
>P01116_KRAS_plot_fragment
MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAG
QEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDL
PSRTVDTKQAQDLARSYGIPFIETSAKTRQG`
  },
  {
    metadata: translateMetadata,
    run: runTranslate,
    example: `>NM_000546.6_p53_cds_fragment
ATGGAGGAGCCGCAGTCAGATCCTAGCGTCGAGCCCCCTCTGAGTCAGGAAACATTTTCAGACCT
>RNA_ambiguity_control
augcccnnnuua`
  },
  {
    metadata: sequenceStatsDnaRnaMetadata,
    run: runSequenceStatsDnaRna,
    example: `>mixed DNA
ACGTACGTNNNNRYSWKMBDHVX
>RNA_ambiguity_control
augcaunn`
  },
  {
    metadata: orfFinderMetadata,
    run: runOrfFinder,
    example: `>NC_001422.1_phiX174_fragment
AAAGTTTATCGCTTCCATGACGCAGAAGTTAACACTTTCGGTGGAAATGTTGATGGAGTTC
ATGCCCGGTGATGACGATGAGGCTACTGCTGACTCTCAACATTCTACTCCTCCAAAAAAGA
AGAGAAAGGTAGAAGACCCCAAGGACTTTCCTTCAGAATTGCTAAGTTTTTTGAGTCATGCTAA`
  }
];
