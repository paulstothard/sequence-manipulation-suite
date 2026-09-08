// Compact, task-oriented recipes. Each tool materializes only its selected output.
const input = () => ({ id: "input", type: "input", text: "" });
const tool = (id, toolId, from, selectStream, options) => ({
  id, type: "tool", toolId, input: { from, stream: "primary" }, selectStream, options
});
const digest = { enzyme1: "ecori", enzyme2: "", enzyme3: "", topology: "linear" };
const qpcr = { method: "efficiency", referenceGenes: "RPLP0,HPRT1", calibrator: "Control", missingPolicy: "strict", minReplicates: 3, comparisons: "welch" };

export const labWorkflowPresets = [
  {
    id: "haplotype-restriction-gel", name: "Haplotype restriction gel",
    summary: "Predict a PCR-RFLP pattern for one sample: reconstruct phased haplotypes, check a supplied primer pair, and digest the predicted PCR products. Supply reference FASTA and VCF separated by ##SMS3_VARIANTS##, then ##SMS3_PRIMERS## and primer FASTA. This recipe requires one exact-match product per haplotype. The pooled lane represents the sample; separate lanes explain each haplotype. The synthetic example is not a validated assay.",
    exampleId: "haplotype-restriction-gel",
    workflow: { steps: [input(),
      { id: "consensus-input", type: "text-section", label: "Read reference and variants", input: { from: "input" }, separator: "##SMS3_PRIMERS##", section: 0 },
      tool("haplotypes", "variant-consensus-builder", "consensus-input", "sequenceRecords", { sample: "Demo", sequenceMode: "both", phasePolicy: "continuous", outputFormat: "fasta" }),
      tool("lane-labels", "fasta-header-rename", "haplotypes", "sequenceRecords", { findText: "^([^|]+)\\|([^|]+)\\|(haplotype-[12])\\|(PS=.*)$", replaceText: "$3 | $1 | $2 | $4", findMode: "regex", regexFlags: "", safeIds: false, outputFormat: "fasta" }),
      { id: "primers", type: "text-section", label: "Read primer pair", input: { from: "input" }, separator: "##SMS3_PRIMERS##", section: 1 },
      { id: "pcr-input", type: "text-bundle", label: "Combine haplotypes and primers", input: { from: "lane-labels" }, other: { from: "primers" }, separator: "---" },
      tool("pcr", "in-silico-pcr", "pcr-input", "table", { topology: "linear", maxMismatches: 0, exactThreePrimeBases: 3, minProductLength: 100, maxProductLength: 2000, outputFormat: "tsv" }),
      { id: "amplicons", type: "pcr-product-sequences", input: { from: "pcr" }, templates: { from: "lane-labels" } },
      tool("digest", "restriction-digest", "amplicons", "gel", { ...digest, poolLinearMolecules: true, outputFormat: "svg-gel" }),
      { id: "fragment-sizes", type: "select-stream", fromStep: "digest", stream: "fragments" },
      { id: "gel", type: "select-stream", fromStep: "digest", stream: "gel" }
    ] }
  },
  {
    id: "compare-protein-digests", name: "Compare protein digest peptides",
    summary: "Compare the peptides predicted for related proteins or altered constructs. Paste protein FASTA records with distinct names. The table counts each peptide sequence in each protein; blank cells mean it was not produced within the chosen length range. The example compares beta-globin with an engineered K18A substitution. Masses and original positions are available under Step outputs; sequence differences alone do not establish experimental detectability.",
    exampleId: "compare-protein-digests",
    workflow: { steps: [input(),
      tool("peptides", "protein-digest", "input", "table", { enzyme: "trypsin", missedCleavages: 0, minLength: 7, maxLength: 35, massType: "monoisotopic", outputFormat: "table" }),
      tool("peptide-counts", "table-sql-query", "peptides", "table", { sqlQuery: 'SELECT "Peptide sequence" AS peptide, "Protein" AS protein, count(*) AS occurrences FROM table GROUP BY "Peptide sequence", "Protein"', outputFormat: "table" }),
      tool("comparison", "table-reshape", "peptide-counts", "table", { mode: "long-to-wide", idColumns: "peptide", namesFrom: "protein", valuesFrom: "occurrences", duplicateMode: "sum", outputFormat: "tsv" })
    ] }
  },
  {
    id: "qpcr-expression-heatmap", name: "qPCR expression heatmap",
    summary: "Compare the direction and size of expression changes across genes and conditions. Normalize a Cq table against validated reference genes and a control condition, then plot log2 fold changes on a scale centered at zero. Review technical replicates, confidence intervals and adjusted P values under Step outputs. The example contains simulated measurements from independent biological samples; color does not indicate statistical significance.",
    exampleId: "qpcr-expression-heatmap",
    workflow: { steps: [input(),
      tool("replicate-qc", "qpcr-analysis", "input", "technical", { ...qpcr, outputFormat: "technical" }),
      tool("expression", "qpcr-analysis", "input", "groups", { ...qpcr, outputFormat: "groups" }),
      tool("heatmap", "heatmap", "expression", "primary", { xColumn: "Condition", yColumn: "Target", valueColumn: "Log2 fold change", colorScale: "red-blue", categoryOrder: "input", showMissingCells: true, title: "qPCR log2 fold change relative to Control", outputFormat: "svg" })
    ] }
  },
  {
    id: "simulated-sequencing-run", name: "Simulated sequencing run",
    summary: "Explore how read count, read length and sequencing errors affect mapping and coverage. Simulate 1,000 single-end reads from a small reference with WGSIM, review FASTQ quality, then map them back with Minimap2. The example uses the human mitochondrial reference and a fixed seed for repeatable results. Quality scores follow WGSIM's simplified error model. FASTQ and QC results are available under Step outputs.",
    exampleId: "simulated-sequencing-run",
    workflow: { steps: [input(),
      tool("reads", "read-simulator", "input", "fastq", { readLayout: "single", readCount: 1000, readLength: 150, baseErrorPercent: 1, mutationPercent: 0, indelPercent: 0, seed: "42", outputFormat: "fastq" }),
      tool("read-qc", "fastq-summary", "reads", "table", { readLayout: "single", outputFormat: "tsv" }),
      { id: "mapping-input", type: "reference-reads-bundle", input: { from: "input", stream: "primary" }, reads: { from: "reads", stream: "primary" } },
      tool("coverage", "read-mapping-coverage", "mapping-input", "viewer", { readLayout: "single", alignmentEngine: "minimap2", minimap2Preset: "sr", minMapq: 20, minAlignedBases: 100, coverageWindowSize: 100, outputFormat: "interactive-viewer" })
    ] }
  },
  {
    id: "compare-fastq-trimming", name: "Check the effect of FASTQ trimming",
    summary: "Check whether quality trimming improves reads at an acceptable cost in retained reads and bases. Supply single-end Phred+33 FASTQ. The comparison shows before/after quality, length and retention; percentage changes are in percentage points. Positive changes are not automatically better. Review QC tables and download trimmed reads under Step outputs. The synthetic example includes good reads, low-quality tails, short reads and reads with too many N bases. Adapter trimming is not performed.",
    exampleId: "compare-fastq-trimming",
    workflow: { steps: [input(),
      tool("before-qc", "fastq-summary", "input", "table", { readLayout: "single", outputFormat: "tsv" }),
      tool("trimmed", "fastq-preprocess", "input", "fastq", { readLayout: "single", qualityCutoff: 20, maxLowQualityPercent: 40, minimumLength: 50, maximumNCount: 5, trimTailLowQuality: true, outputFormat: "fastq" }),
      tool("after-qc", "fastq-summary", "trimmed", "table", { readLayout: "single", outputFormat: "tsv" }),
      { id: "comparison", type: "compare-fastq-qc", input: { from: "after-qc" }, before: { from: "before-qc" } }
    ] }
  },
  {
    id: "review-target-variants", name: "Review variants in target intervals",
    summary: "Filter a VCF by quality and FILTER status, then count overlapping records for each matched target. Supply VCF, a standalone ##SMS3_TARGETS## line, then named BED or GFF/GTF intervals on the same reference assembly. The default keeps PASS or unfiltered records with QUAL ≥ 30. Variant-to-target matches and the filtered VCF are available under Step outputs. Counts use reference spans, including indel anchors; they are not allele counts or predictions of functional effects. Targets with no matches are omitted.",
    exampleId: "review-target-variants",
    workflow: { steps: [input(),
      { id: "variants", type: "text-section", label: "Read variant calls", input: { from: "input" }, separator: "##SMS3_TARGETS##", section: 0 },
      tool("filtered", "vcf-filter", "variants", "filteredVcf", { filterStatus: "pass", minQual: 30, variantType: "any", outputFormat: "filtered-vcf" }),
      { id: "targets", type: "text-section", label: "Read target intervals", input: { from: "input" }, separator: "##SMS3_TARGETS##", section: 1 },
      { id: "overlap-input", type: "text-bundle", label: "Combine variants and targets", input: { from: "filtered" }, other: { from: "targets" }, separator: "---" },
      tool("matches", "genomic-interval-operations", "overlap-input", "table", { operation: "intersect", intervalEngine: "bedtools", queryFormat: "vcf", referenceFormat: "auto", minOverlapBp: 1, minReciprocalOverlapPercent: 0, outputFormat: "interval-table" }),
      tool("counts", "table-sql-query", "matches", "table", { sqlQuery: 'SELECT "Partner record" AS "Chromosome", "Partner start" AS "Start", "Partner end" AS "End", "Partner name" AS "Target", count(*) AS "Overlapping records" FROM table GROUP BY "Partner record", "Partner start", "Partner end", "Partner name" ORDER BY "Chromosome", "Start"', outputFormat: "table" })
    ] }
  }
];
