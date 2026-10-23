import { splitPairedAnnotationAndFasta } from "./paired-annotation-input.js";
import { makeSequenceFeatureTracks } from "./sequence-feature-tracks.js";
import { parseDnaRnaSequenceOrFlatfile } from "./dna-input-records.js";
import { formatFastaRecord } from "./fasta.js";
import { parseBiologicalRecordInput } from "./biological-record-format-converter.js";

export function parsePcrTemplateInput(input, options = {}) {
  const text = String(input ?? "").replace(/\r\n?/g, "\n");
  const parts = splitPairedAnnotationAndFasta(text);
  if (!parts.paired) return parseDnaRnaSequenceOrFlatfile(text, options);

  const annotation = parts.annotationPart.trim();
  const fasta = parts.fastaPart.trim();
  if (!fasta.startsWith(">")) throw new Error("Provide matching template FASTA records with the annotation input.");
  const sequences = parseDnaRnaSequenceOrFlatfile(fasta, options);
  if (!annotation) return sequences;
  // Use the same cleaned sequence for feature coordinates and PCR analysis.
  const parsed = parseBiologicalRecordInput(`${annotation}\n##FASTA\n${sequences.records.map((record) => formatFastaRecord(record.title, record.sequence)).join("")}`);
  if (!parsed.records.length) throw new Error("Could not parse the template annotations. Use GFF3, GTF, or BED rows with matching FASTA records.");
  return {
    records: parsed.records.map((record) => ({ ...record, title: record.title || record.accession })),
    warnings: [...sequences.warnings, ...parsed.warnings],
    charactersRemoved: sequences.charactersRemoved,
    source: parsed.sourceFormat
  };
}

export function makePcrTemplateFeatureTracks(record) {
  return makeSequenceFeatureTracks(record, { idPrefix: "template", label: "Template features" });
}
