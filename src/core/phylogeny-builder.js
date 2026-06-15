import {
  MULTIPLE_ALIGNMENT_ENGINES,
  alignMultipleCodingDna,
  alignMultipleSequences,
  buildNeighborJoiningTree,
  makeMultipleAlignmentDistanceRows,
  makeMultipleAlignmentFasta,
  makeMultipleAlignmentReport,
  makeMultipleAlignmentTreeReport,
  makeMultipleAlignmentTreeSvg,
  multipleAlignmentDistanceTableColumns
} from "./multiple-sequence-alignment.js";

export const PHYLOGENY_SEQUENCE_TYPES = {
  dnaRna: "dna-rna",
  protein: "protein",
  codingDna: "coding-dna"
};

export const PHYLOGENY_OUTPUT_FORMATS = {
  treePlot: "tree-plot",
  treeReport: "tree-report",
  distanceTable: "distance-table",
  alignedFasta: "aligned-fasta",
  alignmentReport: "alignment-report"
};

export const phylogenyDistanceTableColumns = multipleAlignmentDistanceTableColumns;

export function normalizePhylogenyOptions(options = {}) {
  const sequenceType = Object.values(PHYLOGENY_SEQUENCE_TYPES).includes(options.sequenceType)
    ? options.sequenceType
    : PHYLOGENY_SEQUENCE_TYPES.dnaRna;
  const outputFormat = Object.values(PHYLOGENY_OUTPUT_FORMATS).includes(options.outputFormat)
    ? options.outputFormat
    : PHYLOGENY_OUTPUT_FORMATS.treePlot;
  return {
    ...options,
    sequenceType,
    outputFormat,
    alignmentEngine: options.alignmentEngine === MULTIPLE_ALIGNMENT_ENGINES.sms3
      ? MULTIPLE_ALIGNMENT_ENGINES.sms3
      : MULTIPLE_ALIGNMENT_ENGINES.muscle,
    geneticCode: options.geneticCode ?? "1"
  };
}

export async function alignPhylogenyInput(input, rawOptions = {}, context = {}) {
  const options = normalizePhylogenyOptions(rawOptions);
  if (options.sequenceType === PHYLOGENY_SEQUENCE_TYPES.codingDna) {
    return alignMultipleCodingDna(input, options, context);
  }
  return alignMultipleSequences(input, {
    ...options,
    alphabet: options.sequenceType === PHYLOGENY_SEQUENCE_TYPES.protein ? "protein" : "dna-rna"
  }, context);
}

export function makePhylogenyDistanceTsv(distanceRows) {
  const headers = phylogenyDistanceTableColumns.map((column) => column.id);
  return [
    headers.join("\t"),
    ...distanceRows.map((row) => headers.map((header) => String(row[header] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function makePhylogenySummaryReport(prepared) {
  if (!prepared?.alignment) {
    return "";
  }
  const { alignment, options } = prepared;
  const treeReport = makeMultipleAlignmentTreeReport(alignment);
  const alignmentReport = makeMultipleAlignmentReport(prepared);
  const newick = buildNeighborJoiningTree(alignment);
  const alphabetLabel = alignment.alphabet === PHYLOGENY_SEQUENCE_TYPES.codingDna
    ? "coding DNA/RNA"
    : alignment.alphabet === PHYLOGENY_SEQUENCE_TYPES.protein
      ? "protein"
      : "DNA/RNA";
  return [
    "Phylogeny builder report",
    "",
    `Sequences: ${alignment.titles.length}`,
    `Input type: ${alphabetLabel}`,
    `Alignment engine: ${alignment.engine === MULTIPLE_ALIGNMENT_ENGINES.muscle ? `MUSCLE ${alignment.engineVersion || "5.1.0"}` : "SMS3 progressive"}`,
    `Tree method: neighbor joining from alignment-derived p-distance values`,
    ...(alignment.alphabet === PHYLOGENY_SEQUENCE_TYPES.codingDna
      ? [`Genetic code: ${alignment.geneticCode?.id ?? options?.geneticCode ?? "1"}. ${alignment.geneticCode?.name ?? "Standard"}`]
      : []),
    "",
    "Newick:",
    newick,
    "",
    "Alignment summary:",
    alignmentReport,
    "",
    "Tree details:",
    treeReport
  ].join("\n");
}

export function makePhylogenyArtifacts(prepared) {
  if (!prepared?.alignment) {
    return {
      treeSvg: "",
      treeReport: "",
      alignmentReport: "",
      distanceRows: [],
      distanceTsv: "",
      alignedFasta: ""
    };
  }
  const alignment = prepared.alignment;
  const distanceRows = makeMultipleAlignmentDistanceRows(alignment);
  return {
    treeSvg: makeMultipleAlignmentTreeSvg(alignment),
    treeReport: makePhylogenySummaryReport(prepared),
    alignmentReport: makeMultipleAlignmentReport(prepared),
    distanceRows,
    distanceTsv: makePhylogenyDistanceTsv(distanceRows),
    alignedFasta: makeMultipleAlignmentFasta(alignment)
  };
}
