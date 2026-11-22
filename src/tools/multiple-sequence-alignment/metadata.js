import { ALIGNED_SEQUENCE_LIMITS } from "../../core/aligned-sequences.js";
import { MAX_HEATMAP_CELLS } from "../../core/plot-renderer.js";
import { DEFAULT_ALIGNMENT_SVG_CELL_LIMIT } from "../../core/alignment-svg.js";
import { MUSCLE_RUNTIME } from "../../vendor/biowasm/muscle-runtime.js";
import { MSA_DEFAULTS, MSA_STREAM_FORMATS } from "../../core/multiple-alignment-options.js";
import { treeDocumentContract } from "../../core/tree-document-stream.js";
import {
  MULTIPLE_ALIGNMENT_ENGINES,
  MAX_MSA_SEQUENCES,
  multipleAlignmentDefaultLimits,
  multipleCodingDnaAlignmentTableColumns,
  multipleAlignmentDistanceTableColumns,
  multipleAlignmentIdentityTableColumns,
  multipleAlignmentTableColumns
} from "../../core/multiple-sequence-alignment.js";
import { pairwiseAlignmentDefaultLimits } from "../../core/pairwise-alignment.js";
import { geneticCodes } from "../../core/genetic-code.js";

const identityOutputFormats = ["identity-matrix", "identity-heatmap"];
const alignmentOutputFormats = ["clustal", "aligned-fasta", "translated-protein-fasta", "report", "tsv", "svg-color", "aligned-sequence-viewer", "sequence-logo", "tree-viewer", "nj-tree", "nj-tree-svg"];
const pairwiseScoringVisibleWhen = {
  any: [
    { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 },
    { option: "outputFormat", value: identityOutputFormats }
  ]
};

function buildMetadata(alphabet) {
  const isProtein = alphabet === "protein";
  const isCodingDna = alphabet === "coding-dna";
  return {
    id: isCodingDna ? "multiple-align-coding-dna" : isProtein ? "multiple-align-protein" : "multiple-align-dna-rna",
    name: isCodingDna ? "Multiple Align Coding DNA" : isProtein ? "Multiple Align Protein" : "Multiple Align DNA/RNA",
    category: "Sequence Alignment & Assembly",
    tags: [isProtein ? "protein" : "DNA", "FASTA", "alignment", ...(isCodingDna ? ["codon", "translation"] : [])],
    summary: isCodingDna
      ? "Align coding DNA/RNA through translated proteins, project the alignment back to codons, and report nucleotide identities or build neighbor-joining trees."
      : `Align multiple ${isProtein ? "protein" : "DNA/RNA"} sequences supplied as FASTA or retrieved by ${isProtein ? "UniProt or NCBI protein" : "NCBI nucleotide"} accession, using MUSCLE or the SMS3 progressive aligner.`,
    whenToUse: isCodingDna
      ? "Compare homologous coding sequences supplied in the same orientation and reading frame while preserving whole codons."
      : `Compare homologous ${isProtein ? "protein" : "DNA/RNA"} sequences by aligned positions, pairwise identity or an exploratory neighbor-joining tree.`,
    inputType: `${isCodingDna ? "Coding DNA/RNA" : isProtein ? "Protein" : "DNA/RNA"} FASTA records`,
    outputType: isCodingDna
      ? "Multiple alignment report, aligned codon FASTA, aligned translated protein FASTA, CLUSTAL-format text, table, colored alignment, coding-DNA sequence logo, or neighbor-joining tree in Tree Viewer"
      : "Multiple alignment report, aligned FASTA, CLUSTAL-format text, table, colored alignment, sequence logo, or neighbor-joining tree in Tree Viewer",
    workflow: {
      requestedOutputStreamsOption: "requestedAlignmentOutputs",
      inputs: [
        { id: "input", kind: "text", mediaType: "text/plain" },
        { id: "sequenceRecords", kind: "sequence-records", alphabet: isProtein ? "protein" : "dna-rna", minRecords: 2 }
      ],
      outputs: [
        treeDocumentContract,
        { id: "newick", kind: "text", mediaType: "text/x-newick" },
        { id: "primary", kind: "text", mediaType: "text/plain" },
        { id: "report", kind: "text", mediaType: "text/plain" },
        { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
        ...(isCodingDna ? [{ id: "proteinFasta", kind: "text", mediaType: "text/x-fasta" }] : []),
        { id: "clustal", kind: "text", mediaType: "text/plain" },
        { id: "table", kind: "table", schema: isCodingDna ? "multiple-alignment-coding-dna" : isProtein ? "multiple-alignment-protein" : "multiple-alignment-dna-rna", columns: isCodingDna ? multipleCodingDnaAlignmentTableColumns : multipleAlignmentTableColumns },
        { id: "coloredSvg", kind: "text", mediaType: "image/svg+xml" },
        { id: "alignmentDocument", kind: "text", mediaType: "application/json", label: "Aligned sequence viewer", outputFormat: "aligned-sequence-viewer" },
        { id: "sequenceLogo", kind: "figure", figureType: "sequence-logo", label: "Sequence logo" },
        { id: "tree", kind: "text", mediaType: "text/plain" },
        { id: "treeSvg", kind: "text", mediaType: "image/svg+xml" },
        { id: "distanceTable", kind: "table", schema: isCodingDna ? "multiple-alignment-coding-dna-distances" : isProtein ? "multiple-alignment-protein-distances" : "multiple-alignment-dna-rna-distances", columns: multipleAlignmentDistanceTableColumns },
        { id: "identityMatrix", kind: "text", mediaType: "text/tab-separated-values" },
        { id: "identityMatrixTable", kind: "table", schema: `multiple-alignment-${alphabet}-identity-matrix`, dynamicColumns: true, label: "Identity matrix table" },
        { id: "identityPairs", kind: "table", schema: isCodingDna ? "multiple-alignment-coding-dna-identity" : isProtein ? "multiple-alignment-protein-identity" : "multiple-alignment-dna-rna-identity", columns: multipleAlignmentIdentityTableColumns },
        { id: "identityHeatmap", kind: "text", mediaType: "image/svg+xml" },
        { id: "warnings", kind: "warnings" }
      ].map(contract => ({ ...contract, ...(MSA_STREAM_FORMATS[contract.id] ? { outputFormat: MSA_STREAM_FORMATS[contract.id] } : {}) }))
    },
    runInWorker: true,
    workerModule: "../tools/multiple-sequence-alignment/run.js",
    workerExport: isCodingDna ? "runMultipleAlignCodingDna" : isProtein ? "runMultipleAlignProtein" : "runMultipleAlignDnaRna",
    options: [
      {
        id: "alignmentEngine",
        type: "radio",
        label: "Alignment engine",
        defaultValue: MSA_DEFAULTS.alignmentEngine,
        visibleWhen: { option: "outputFormat", value: alignmentOutputFormats },
        choices: [
          { value: MULTIPLE_ALIGNMENT_ENGINES.muscle, label: "MUSCLE" },
          { value: MULTIPLE_ALIGNMENT_ENGINES.sms3, label: "SMS3 progressive" }
        ],
        help: "MUSCLE aligns the translated proteins for coding DNA/RNA and the submitted symbols for other sequence types. SMS3 progressive merges global alignments to a selected center sequence."
      },
      ...(isProtein || isCodingDna ? [] : [
        { id: "matchScore", type: "number", label: "Match score", defaultValue: MSA_DEFAULTS.matchScore, step: 1, visibleWhen: pairwiseScoringVisibleWhen },
        { id: "similarScore", type: "number", label: "Ambiguous overlap score", defaultValue: MSA_DEFAULTS.similarScore, step: 1, visibleWhen: pairwiseScoringVisibleWhen },
        { id: "mismatchScore", type: "number", label: "Mismatch score", defaultValue: MSA_DEFAULTS.mismatchScore, step: 1, visibleWhen: pairwiseScoringVisibleWhen }
      ]),
      ...(isCodingDna ? [
        {
          id: "geneticCode",
          type: "select",
          label: "Genetic code",
          defaultValue: MSA_DEFAULTS.geneticCode,
          choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` })),
          help: "Used to translate complete codons before the protein-guided alignment. Stop and ambiguous codons are scored as X."
        }
      ] : []),
      { id: "gapOpen", type: "number", label: "Gap opening penalty", defaultValue: MSA_DEFAULTS.gapOpen, min: 0, step: 1, visibleWhen: pairwiseScoringVisibleWhen },
      { id: "gapExtend", type: "number", label: "Gap extension penalty", defaultValue: MSA_DEFAULTS.gapExtend, min: 0, step: 1, visibleWhen: pairwiseScoringVisibleWhen },
      {
        id: "showConsensusLine",
        type: "checkbox",
        label: "Show consensus line",
        defaultValue: MSA_DEFAULTS.showConsensusLine,
        visibleWhen: { option: "outputFormat", value: "svg-color" },
        help: "Shows the per-column conservation symbols beneath each block of the colored alignment figure. This changes only the figure display; alignment data and other output formats are unchanged."
      },
      {
        id: "outputFormat",
        type: "radio",
        label: "Output format",
        defaultValue: MSA_DEFAULTS.outputFormat,
        choices: [
          { showcase: false, value: "clustal", label: "CLUSTAL-format text alignment" },
          { showcase: false, value: "aligned-fasta", label: isCodingDna ? "Aligned codon FASTA" : "Aligned FASTA" },
          ...(isCodingDna ? [{ showcase: false, value: "translated-protein-fasta", label: "Aligned translated protein FASTA" }] : []),
          { showcase: false, value: "report", label: "Summary report" },
          { showcase: false, value: "tsv", label: "Alignment table" },
          { showcase: "colored-alignment", value: "svg-color", label: "Colored alignment" },
          { showcase: "aligned-sequence-viewer", value: "aligned-sequence-viewer", label: "Aligned sequence viewer" },
          { showcase: "sequence-logo", value: "sequence-logo", label: isCodingDna ? "Aligned coding-DNA sequence logo" : "Sequence logo" },
          { showcase: "tree-viewer", value: "tree-viewer", label: "Tree Viewer" },
          { showcase: false, value: "nj-tree", label: "Neighbor-joining tree report" },
          { showcase: "tree-figure", value: "nj-tree-svg", label: "Midpoint-rooted NJ tree" },
          { showcase: false, value: "identity-matrix", label: "Identity matrix table", resultView: { kind: "table", streamId: "identityMatrixTable" } },
          { showcase: "sequence-identity-heatmap", value: "identity-heatmap", label: "Identity heatmap" }
        ],
        help: "Tree outputs use the selected alignment engine. Identity matrix and heatmap outputs instead use all-vs-all SMS3 affine pairwise alignments with the scoring controls shown for those outputs."
      },
      {
        id: "advancedLimits",
        type: "group",
        label: "Limits",
        collapsible: true,
        collapsed: true,
        options: [
          { id: "alignedSequenceFigureCells", type: "limit-value", label: "Aligned sequence viewer cells", value: ALIGNED_SEQUENCE_LIMITS.displayedCells, visibleWhen: { option: "outputFormat", value: "aligned-sequence-viewer" }, help: "Complete alignment length × displayed sequences, including gaps. Larger alignments remain available as FASTA or alignment tables." },
          { id: "coloredAlignmentCells", type: "limit-value", label: "Maximum colored alignment cells", value: DEFAULT_ALIGNMENT_SVG_CELL_LIMIT, visibleWhen: { option: "outputFormat", value: "svg-color" }, help: "Fixed display-density ceiling. Larger alignments remain available as FASTA or alignment tables." },
          { id: "identityHeatmapCells", type: "limit-value", label: "Maximum identity heatmap cells", value: MAX_HEATMAP_CELLS, visibleWhen: { option: "outputFormat", value: "identity-heatmap" }, help: "Fixed display-density ceiling. Use Identity matrix table for larger comparisons." },
          { id: "maxAlignmentRecords", type: "limit-value", label: "Maximum input records", value: MAX_MSA_SEQUENCES },
          {
            id: "maxTotalSymbols",
            type: "number",
            label: isCodingDna ? "Maximum input bases in complete codons" : "Maximum input symbols",
            defaultValue: multipleAlignmentDefaultLimits.maxTotalSymbols,
            min: 1000,
            max: 1000000,
            step: 1000,
            help: isCodingDna
              ? "Cap on cleaned complete-codon input bases before protein-guided alignment."
              : "Cap on the summed cleaned sequence length before alignment."
          },
          {
            id: "maxAlignmentCells",
            type: "number",
            label: "Maximum pairwise alignment cells",
            defaultValue: pairwiseAlignmentDefaultLimits.maxAlignmentCells,
            min: 1000,
            max: pairwiseAlignmentDefaultLimits.maxAlignmentCells * 10,
            step: 100000,
            visibleWhen: pairwiseScoringVisibleWhen,
            help: "SMS3 progressive mode uses pairwise dynamic-programming alignments internally; this cap applies to each pairwise matrix."
          }
        ]
      },
      {
        id: "methodNote",
        type: "note",
        visibleWhen: { option: "outputFormat", value: alignmentOutputFormats },
        text: isCodingDna
          ? "Supply homologous coding sequences in the same orientation and frame, starting at the first codon base. Complete codons are translated with the selected genetic code, aligned, and projected back to nucleotides; frameshifts are not inferred. Uracil becomes thymine and existing gaps are removed. Stop and ambiguous codons use X in the aligned protein output. Trees use nucleotide p-distance with pairwise gap deletion."
          : `With the MUSCLE engine, SMS3 uses MUSCLE ${MUSCLE_RUNTIME.versionLabel}. The SMS3 progressive engine chooses a center sequence from pairwise global alignments, then merges center-to-sequence alignments. ${isProtein ? "SMS3 progressive protein scoring uses BLOSUM62." : "SMS3 progressive DNA/RNA scoring uses identity plus ambiguous IUPAC overlap."} Neighbor-joining tree output is built from an alignment-derived p-distance matrix and is intended for quick review. Identity matrix outputs use all-vs-all optimal pairwise alignments.`
      },
      {
        id: "citationNote",
        type: "note",
        visibleWhen: { option: "outputFormat", value: alignmentOutputFormats },
        text: "References:\n\nMUSCLE v5: Edgar 2022.\n\nSMS3 progressive mode: Needleman and Wunsch 1970; Gotoh 1982; Feng and Doolittle 1987. Protein and coding-DNA scoring use BLOSUM62 (Henikoff and Henikoff 1992)."
      },
      {
        id: "identityMethodNote",
        type: "note",
        visibleWhen: { option: "outputFormat", value: identityOutputFormats },
        text: `Identity outputs use all-vs-all SMS3 affine global pairwise alignments. ${isCodingDna ? "Coding sequences are translated first and aligned in protein space before identity is measured on the projected nucleotides." : isProtein ? "Protein substitutions use BLOSUM62." : "DNA/RNA matches use identity and IUPAC ambiguity overlap scoring."} Gap columns are excluded from identity percentages; ambiguity symbols are compared literally. References: Needleman and Wunsch 1970; Gotoh 1982${isProtein || isCodingDna ? "; Henikoff and Henikoff 1992" : ""}.`
      }
    ]
  };
}

export const multipleAlignDnaRnaMetadata = buildMetadata("dna-rna");
export const multipleAlignCodingDnaMetadata = buildMetadata("coding-dna");
export const multipleAlignProteinMetadata = buildMetadata("protein");
