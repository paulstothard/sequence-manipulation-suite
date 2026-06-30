import {
  MULTIPLE_ALIGNMENT_ENGINES,
  multipleAlignmentDefaultLimits
} from "../../core/multiple-sequence-alignment.js";
import { pairwiseAlignmentDefaultLimits } from "../../core/pairwise-alignment.js";
import {
  PHYLOGENY_OUTPUT_FORMATS,
  PHYLOGENY_SEQUENCE_TYPES,
  phylogenyDistanceTableColumns
} from "../../core/phylogeny-builder.js";
import { geneticCodes } from "../../core/genetic-code.js";

export const phylogenyBuilderMetadata = {
  id: "phylogeny-builder",
  name: "Phylogeny Builder",
  category: "Sequence Alignment & Assembly",
  tags: ["DNA", "RNA", "protein", "FASTA", "alignment", "phylogeny", "plot"],
  summary: "Build a quick neighbor-joining phylogeny from multiple FASTA records, aligning unaligned input with MUSCLE by default.",
  inputType: "DNA/RNA, protein, or coding DNA/RNA FASTA records",
  outputType: "Phylogeny tree plot, tree report, distance table, aligned FASTA, or alignment report",
  fileInput: {
    accept: ".txt,.fa,.fasta,.fna,.faa",
    dropLabel: "Drop DNA/RNA or protein FASTA records here"
  },
  workflow: {
    inputs: [
      { id: "input", kind: "text", mediaType: "text/plain" },
      { id: "sequenceRecords", kind: "sequence-records" }
    ],
    outputs: [
      { id: "primary", kind: "text", mediaType: "image/svg+xml" },
      { id: "plot", kind: "text", mediaType: "image/svg+xml", label: "Phylogeny tree plot" },
      { id: "tree", kind: "text", mediaType: "text/plain", label: "Tree report" },
      {
        id: "distanceTable",
        kind: "table",
        schema: "phylogeny-distance-table",
        label: "Distance table",
        columns: phylogenyDistanceTableColumns
      },
      { id: "alignedFasta", kind: "text", mediaType: "text/x-fasta", label: "Aligned FASTA" },
      { id: "alignmentReport", kind: "text", mediaType: "text/plain", label: "Alignment report" },
      { id: "warnings", kind: "warnings" }
    ]
  },
  runInWorker: true,
  workerModule: "../tools/phylogeny-builder/run.js",
  workerExport: "runPhylogenyBuilder",
  options: [
    {
      id: "sequenceSetup",
      type: "group",
      label: "Sequences",
      options: [
        {
          id: "sequenceType",
          type: "radio",
          label: "Sequence type",
          defaultValue: PHYLOGENY_SEQUENCE_TYPES.dnaRna,
          choices: [
            { value: PHYLOGENY_SEQUENCE_TYPES.dnaRna, label: "DNA/RNA" },
            { value: PHYLOGENY_SEQUENCE_TYPES.protein, label: "Protein" },
            { value: PHYLOGENY_SEQUENCE_TYPES.codingDna, label: "Coding DNA/RNA" }
          ],
          help: "Coding DNA/RNA is translated, aligned in protein space, and projected back to codons before the tree is built."
        },
        {
          id: "geneticCode",
          type: "select",
          label: "Genetic code",
          defaultValue: "1",
          choices: geneticCodes.map((code) => ({ value: code.id, label: `${code.id}. ${code.name}` })),
          visibleWhen: { option: "sequenceType", value: PHYLOGENY_SEQUENCE_TYPES.codingDna },
          help: "Used only for coding DNA/RNA input."
        }
      ]
    },
    {
      id: "alignmentSetup",
      type: "group",
      label: "Alignment",
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
        }
      ]
    },
    {
      type: "group",
      label: "Output format",
      options: [
        {
          id: "outputFormat",
          type: "radio",
          label: "Output format",
          defaultValue: PHYLOGENY_OUTPUT_FORMATS.treePlot,
          choices: [
            { value: PHYLOGENY_OUTPUT_FORMATS.treePlot, label: "Phylogeny tree plot" },
            { value: PHYLOGENY_OUTPUT_FORMATS.treeReport, label: "Tree report" },
            { value: PHYLOGENY_OUTPUT_FORMATS.distanceTable, label: "Distance table" },
            { value: PHYLOGENY_OUTPUT_FORMATS.alignedFasta, label: "Aligned FASTA" },
            { value: PHYLOGENY_OUTPUT_FORMATS.alignmentReport, label: "Alignment report" }
          ],
          help: "The tree uses neighbor joining from alignment-derived p-distance values. The distance table and aligned FASTA are useful for checking the tree input."
        }
      ]
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
          help: "Only the first records up to this limit are aligned before tree construction."
        },
        {
          id: "maxTotalSymbols",
          type: "number",
          label: "Maximum alignment input symbols",
          defaultValue: multipleAlignmentDefaultLimits.maxTotalSymbols,
          min: 1000,
          max: 1000000,
          step: 1000,
          help: "Cap on the summed cleaned sequence length before alignment."
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
      id: "methodsAndCitations",
      type: "note",
      text: "References:\n\nMUSCLE v5: Edgar 2022.\n\nSMS3 progressive alignment: Needleman and Wunsch 1970; Gotoh 1982; Feng and Doolittle 1987.\n\nNeighbor joining: Saitou and Nei 1987 using alignment-derived p-distance values. Use the tree as a quick local review or teaching phylogeny; full phylogenetic inference may need model selection, bootstrapping, and external validation."
    }
  ]
};
