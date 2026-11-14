import { getGeneticCode } from "./genetic-code.js";

export const ORF_DEFAULTS = Object.freeze({
  strand: "both", startMode: "start-codon", geneticCode: "1", minimumAminoAcids: 30,
  includePartial: true, nestedMode: "first-start", sortBy: "start",
  includeStopInProtein: false, outputFormat: "svg-overview"
});

export function normalizeOrfOptions(options = {}) {
  options ??= {};
  const choice = (id, values) => values.includes(options[id]) ? options[id] : ORF_DEFAULTS[id];
  const minimum = Number.parseInt(options.minimumAminoAcids, 10);
  return {
    strand: choice("strand", ["both", "forward", "reverse"]),
    startMode: choice("startMode", ["start-codon", "any-codon"]),
    geneticCode: getGeneticCode(options.geneticCode ?? ORF_DEFAULTS.geneticCode).id,
    minimumAminoAcids: Number.isFinite(minimum) ? Math.max(1, Math.min(1_000_000, minimum)) : ORF_DEFAULTS.minimumAminoAcids,
    includePartial: typeof options.includePartial === "boolean" ? options.includePartial : ORF_DEFAULTS.includePartial,
    nestedMode: choice("nestedMode", ["first-start", "all-starts"]),
    sortBy: choice("sortBy", ["start", "length-desc", "frame", "complete"]),
    includeStopInProtein: typeof options.includeStopInProtein === "boolean" ? options.includeStopInProtein : ORF_DEFAULTS.includeStopInProtein,
    outputFormat: choice("outputFormat", ["report", "tsv", "nucleotide-fasta", "protein-fasta", "svg-overview", "interactive-viewer", "interactive-circular-viewer", "orf-records"])
  };
}

export const ORF_OUTPUT_FORMATS_BY_STREAM = Object.freeze({
  report: "report", tsv: "tsv", table: "tsv", nucleotideFasta: "nucleotide-fasta",
  proteinFasta: "protein-fasta", overview: "svg-overview", viewer: "interactive-viewer", orfRecords: "orf-records"
});
