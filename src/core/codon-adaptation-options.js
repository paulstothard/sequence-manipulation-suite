import { codonUsageReferences } from "../reference-data/codon-usage/references.js";

export const CAI_ZERO_REFERENCE_COUNT = 0.5;
export const CODON_ADAPTATION_INDEX_LIMITS = Object.freeze({ maxCodonRows: 250_000, maxMaterializedOutputCharacters: 25 * 1024 * 1024, maxRecords: 10_000 });


export const CODON_ADAPTATION_DEFAULTS = Object.freeze({
  referenceId: "ecoli-k12-mg1655-refseq",
  outputFormat: "summary-tsv"
});

export function normalizeCodonAdaptationOptions(options = {}, references = codonUsageReferences) {
  options ??= {};
  return {
    referenceId: references.some(reference => reference.id === options.referenceId)
      ? options.referenceId
      : references.find(reference => reference.id === CODON_ADAPTATION_DEFAULTS.referenceId)?.id ?? references[0]?.id,
    outputFormat: ["summary-tsv", "codon-tsv", "report"].includes(options.outputFormat)
      ? options.outputFormat : CODON_ADAPTATION_DEFAULTS.outputFormat
  };
}
