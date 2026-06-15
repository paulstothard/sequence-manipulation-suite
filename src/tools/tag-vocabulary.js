export const toolTagVocabulary = [
  "DNA",
  "RNA",
  "protein",
  "table",
  "text",
  "raw",
  "FASTA",
  "FASTQ",
  "SAM",
  "BAM",
  "BED",
  "GFF",
  "GTF",
  "VCF",
  "CSV",
  "TSV",
  "Excel",
  "GenBank",
  "GenPept",
  "EMBL",
  "DDBJ",
  "UniProt",
  "GC",
  "ORF",
  "adapter",
  "alignment",
  "phylogeny",
  "assembly",
  "annotation",
  "cleaning",
  "codon",
  "composition",
  "contamination",
  "coordinates",
  "digest",
  "enzyme",
  "format conversion",
  "genetic code",
  "hydropathy",
  "map",
  "motif",
  "plasmid",
  "plot",
  "primer",
  "reference data",
  "regex",
  "restriction",
  "search",
  "statistics",
  "technical sequence",
  "translation",
  "validation",
  "vector"
];

export const toolTagVocabularySet = new Set(toolTagVocabulary);

const toolTagOrderGroups = [
  ["DNA", "RNA", "protein", "table", "text"],
  ["raw", "FASTA", "FASTQ", "SAM", "BAM", "BED", "GFF", "GTF", "VCF", "CSV", "TSV", "Excel", "GenBank", "GenPept", "EMBL", "DDBJ", "UniProt"],
  [
    "GC",
    "composition",
    "ORF",
    "genetic code",
    "technical sequence",
    "vector",
    "adapter",
    "alignment",
    "phylogeny",
    "assembly",
    "primer",
    "contamination",
    "restriction",
    "enzyme",
    "digest",
    "motif",
    "annotation",
    "plasmid",
    "codon",
    "hydropathy",
    "validation"
  ],
  ["cleaning", "coordinates", "format conversion", "map", "plot", "regex", "search", "statistics", "translation"],
  ["reference data"]
];

const toolTagOrderRank = new Map(
  toolTagOrderGroups.flatMap((group, groupIndex) =>
    group.map((tag, tagIndex) => [tag, groupIndex * 100 + tagIndex])
  )
);

export function validateToolTags(metadata) {
  const tags = metadata.tags ?? [];
  const errors = [];
  const seen = new Set();
  let previousRank = -1;
  for (const tag of tags) {
    if (!toolTagVocabularySet.has(tag)) {
      errors.push(`${metadata.id}: unsupported tag "${tag}"`);
    }
    if (seen.has(tag)) {
      errors.push(`${metadata.id}: duplicate tag "${tag}"`);
    }
    const rank = toolTagOrderRank.get(tag);
    if (rank !== undefined && rank < previousRank) {
      errors.push(`${metadata.id}: tag "${tag}" is out of order`);
    }
    previousRank = Math.max(previousRank, rank ?? previousRank);
    seen.add(tag);
  }
  return errors;
}
