import {
  MULTIPLE_ALIGNMENT_ENGINES,
  multipleAlignmentDefaultLimits,
  multipleCodingDnaAlignmentTableColumns,
  multipleAlignmentDistanceTableColumns,
  multipleAlignmentIdentityTableColumns,
  multipleAlignmentTableColumns
} from "../../core/multiple-sequence-alignment.js";
import { pairwiseAlignmentDefaultLimits } from "../../core/pairwise-alignment.js";
import { geneticCodes } from "../../core/genetic-code.js";

function buildMetadata(alphabet) {
  const isProtein = alphabet === "protein";
  const isCodingDna = alphabet === "coding-dna";
  return {
    id: isCodingDna ? "multiple-align-coding-dna" : isProtein ? "multiple-align-protein" : "multiple-align-dna-rna",
    name: isCodingDna ? "Multiple Align Coding DNA" : isProtein ? "Multiple Align Protein" : "Multiple Align DNA/RNA",
    category: "Sequence Alignment & Assembly",
    tags: [isProtein ? "protein" : "DNA", "FASTA", "alignment", ...(isCodingDna ? ["codon", "translation"] : [])],
    summary: isCodingDna
      ? "Translate coding DNA/RNA, align the proteins with MUSCLE or the SMS3 progressive aligner, and project the alignment back to codons."
      : `Align multiple ${isProtein ? "protein" : "DNA/RNA"} FASTA records with MUSCLE or the SMS3 progressive aligner.`,
    inputType: `${isCodingDna ? "Coding DNA/RNA" : isProtein ? "Protein" : "DNA/RNA"} FASTA records`,
    outputType: isCodingDna
      ? "Multiple alignment report, aligned codon FASTA, aligned translated protein FASTA, CLUSTAL-format text, table, colored alignment, or neighbor-joining tree"
      : "Multiple alignment report, aligned FASTA, CLUSTAL-format text, table, colored alignment, or neighbor-joining tree",
    workflow: {
      inputs: [
        { id: "input", kind: "text", mediaType: "text/plain" },
        { id: "sequenceRecords", kind: "sequence-records", alphabet: isProtein ? "protein" : "dna-rna" }
      ],
      outputs: [
        { id: "primary", kind: "text", mediaType: "text/plain" },
        { id: "report", kind: "text", mediaType: "text/plain" },
        { id: "fasta", kind: "text", mediaType: "text/x-fasta" },
        ...(isCodingDna ? [{ id: "proteinFasta", kind: "text", mediaType: "text/x-fasta" }] : []),
        { id: "clustal", kind: "text", mediaType: "text/plain" },
        { id: "table", kind: "table", schema: isCodingDna ? "multiple-alignment-coding-dna" : isProtein ? "multiple-alignment-protein" : "multiple-alignment-dna-rna", columns: isCodingDna ? multipleCodingDnaAlignmentTableColumns : multipleAlignmentTableColumns },
        { id: "coloredSvg", kind: "text", mediaType: "image/svg+xml" },
        { id: "tree", kind: "text", mediaType: "text/plain" },
        { id: "treeSvg", kind: "text", mediaType: "image/svg+xml" },
        { id: "distanceTable", kind: "table", schema: isCodingDna ? "multiple-alignment-coding-dna-distances" : isProtein ? "multiple-alignment-protein-distances" : "multiple-alignment-dna-rna-distances", columns: multipleAlignmentDistanceTableColumns },
        { id: "identityMatrix", kind: "text", mediaType: "text/tab-separated-values" },
        { id: "identityPairs", kind: "table", schema: isCodingDna ? "multiple-alignment-coding-dna-identity" : isProtein ? "multiple-alignment-protein-identity" : "multiple-alignment-dna-rna-identity", columns: multipleAlignmentIdentityTableColumns },
        { id: "identityHeatmap", kind: "text", mediaType: "image/svg+xml" },
        { id: "warnings", kind: "warnings" }
      ]
    },
    runInWorker: true,
    workerModule: "../tools/multiple-sequence-alignment/run.js",
    workerExport: isCodingDna ? "runMultipleAlignCodingDna" : isProtein ? "runMultipleAlignProtein" : "runMultipleAlignDnaRna",
    options: [
      {
        id: "alignmentEngine",
        type: "radio",
        label: "Alignment engine",
        defaultValue: MULTIPLE_ALIGNMENT_ENGINES.muscle,
        choices: [
          { value: MULTIPLE_ALIGNMENT_ENGINES.muscle, label: "MUSCLE" },
          { value: MULTIPLE_ALIGNMENT_ENGINES.sms3, label: "SMS3 progressive" }
        ],
        help: "Browser runs use bundled local MUSCLE files for the MUSCLE engine. Select SMS3 progressive when you want the smaller deterministic teaching/review aligner."
      },
      ...(isProtein || isCodingDna ? [] : [
        { id: "matchScore", type: "number", label: "Match score", defaultValue: 5, step: 1, visibleWhen: { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 } },
        { id: "similarScore", type: "number", label: "Ambiguous overlap score", defaultValue: 1, step: 1, visibleWhen: { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 } },
        { id: "mismatchScore", type: "number", label: "Mismatch score", defaultValue: -4, step: 1, visibleWhen: { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 } }
      ]),
      ...(isCodingDna ? [
        {
          id: "geneticCode",
          type: "select",
          label: "Genetic code",
          defaultValue: "1",
          choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` })),
          help: "Used to translate complete codons before the protein-guided alignment. Stop and ambiguous codons are scored as X."
        }
      ] : []),
      { id: "gapOpen", type: "number", label: "Gap opening penalty", defaultValue: 10, min: 0, step: 1, visibleWhen: { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 } },
      { id: "gapExtend", type: "number", label: "Gap extension penalty", defaultValue: 1, min: 0, step: 1, visibleWhen: { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 } },
      {
        id: "outputFormat",
        type: "radio",
        label: "Output format",
        defaultValue: "svg-color",
        choices: [
          { value: "clustal", label: "CLUSTAL-format text alignment" },
          { value: "aligned-fasta", label: isCodingDna ? "Aligned codon FASTA" : "Aligned FASTA" },
          ...(isCodingDna ? [{ value: "translated-protein-fasta", label: "Aligned translated protein FASTA" }] : []),
          { value: "report", label: "Summary report" },
          { value: "tsv", label: "Alignment table" },
          { value: "svg-color", label: "Colored alignment" },
          { value: "nj-tree", label: "Neighbor-joining tree report" },
          { value: "nj-tree-svg", label: "Midpoint-rooted NJ tree" },
          { value: "identity-matrix", label: "Identity matrix table" },
          { value: "identity-heatmap", label: "Identity heatmap" }
        ],
        help: "Tree and identity outputs are selected materializations; they can require all-vs-all distance or identity calculations for every record pair."
      },
      {
        id: "advancedLimits",
        type: "group",
        label: "Limits",
        collapsible: true,
        collapsed: true,
        options: [
          {
            id: "maxSequences",
            type: "number",
            label: "Maximum records to align",
            defaultValue: multipleAlignmentDefaultLimits.maxSequences,
            min: 2,
            max: 1000,
            step: 1,
            help: "Only the first records up to this limit are aligned."
          },
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
            visibleWhen: { option: "alignmentEngine", value: MULTIPLE_ALIGNMENT_ENGINES.sms3 },
            help: "SMS3 progressive mode uses pairwise dynamic-programming alignments internally; this cap applies to each pairwise matrix."
          }
        ]
      },
      {
        id: "methodNote",
        type: "note",
        text: isCodingDna
          ? "Coding DNA/RNA is split into complete codons, translated, aligned in protein space, and projected back to codons. With the MUSCLE engine, SMS3 uses vendored BioWasm MUSCLE 5.1.0. Neighbor-joining and identity matrix distances are calculated from the projected nucleotide alignment to preserve synonymous-change resolution."
          : `With the MUSCLE engine, SMS3 uses vendored BioWasm MUSCLE 5.1.0. The SMS3 progressive engine chooses a center sequence from pairwise global alignments, then merges center-to-sequence alignments. ${isProtein ? "SMS3 progressive protein scoring uses BLOSUM62." : "SMS3 progressive DNA/RNA scoring uses identity plus ambiguous IUPAC overlap."} Neighbor-joining tree output is built from an alignment-derived p-distance matrix and is intended for quick review. Identity matrix outputs use all-vs-all optimal pairwise alignments.`
      },
      {
        id: "citationNote",
        type: "note",
        text: "Citations: MUSCLE v5, Edgar 2022. SMS3 progressive mode follows Needleman-Wunsch/Gotoh pairwise alignment plus Feng-Doolittle-style progressive alignment; protein scoring uses BLOSUM62."
      }
    ]
  };
}

export const multipleAlignDnaRnaMetadata = buildMetadata("dna-rna");
export const multipleAlignCodingDnaMetadata = buildMetadata("coding-dna");
export const multipleAlignProteinMetadata = buildMetadata("protein");
