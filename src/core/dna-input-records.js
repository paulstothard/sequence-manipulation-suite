import { parseSequenceInput } from "./fasta.js";
import { parseFlatfileRecords } from "./flatfile-records.js";
import { cleanDnaRnaSequence } from "./sequence.js";

function looksLikeAnnotatedNucleotideFlatfile(text) {
  const source = String(text ?? "");
  return /^LOCUS\s/m.test(source) ||
    (/^ID\s/m.test(source) && /^SQ\s/m.test(source)) ||
    /\nFEATURES\s+Location\/Qualifiers\n/.test(source) ||
    /^FH\s|^FT\s/m.test(source);
}

function cleanRecordSequence(record, fallbackTitle, index, options, warnings) {
  const title = record.title || fallbackTitle || `Record ${index + 1}`;
  const cleaned = cleanDnaRnaSequence(record.sequence, {
    preserveCase: false,
    keepGaps: false
  });
  const sequence = options.convertUtoT === true
    ? cleaned.sequence.replaceAll("U", "T")
    : cleaned.sequence;
  if (cleaned.removedCount > 0) {
    warnings.push(`${title}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
  }
  if (sequence.length === 0) {
    warnings.push(`${title}: no DNA/RNA sequence characters were found.`);
  }
  return {
    ...record,
    title,
    sequence,
    removedCount: cleaned.removedCount
  };
}

export function parseDnaRnaSequenceOrFlatfile(input, options = {}) {
  const text = String(input ?? "");
  const fallbackTitle = options.fallbackTitle ?? "sequence";
  const label = options.label ?? "Input";
  const warnings = [];
  let charactersRemoved = 0;

  if (!text.trim()) {
    return { records: [], warnings, charactersRemoved, source: "empty" };
  }

  if (looksLikeAnnotatedNucleotideFlatfile(text)) {
    const flatfile = parseFlatfileRecords(text);
    const nucleotideRecords = flatfile.records
      .filter((record) => record.sequence && record.molecule !== "protein")
      .map((record, index) => cleanRecordSequence({
        title: record.accession || record.title || `${fallbackTitle} ${index + 1}`,
        sequence: record.sequence,
        sourceFormat: record.format,
        sourceTitle: record.title,
        topology: record.topology,
        features: record.features
      }, fallbackTitle, index, options, warnings))
      .filter((record) => record.sequence.length > 0);

    charactersRemoved = nucleotideRecords.reduce((sum, record) => sum + record.removedCount, 0);
    warnings.push(...flatfile.warnings);
    if (nucleotideRecords.length > 0) {
      warnings.push(`${label}: parsed ${nucleotideRecords.length.toLocaleString()} GenBank/DDBJ/EMBL nucleotide record(s).`);
      return { records: nucleotideRecords, warnings, charactersRemoved, source: "flatfile" };
    }
    warnings.push(`${label}: no GenBank/DDBJ/EMBL nucleotide records with sequence were found.`);
    return { records: [], warnings, charactersRemoved, source: "flatfile" };
  }

  const records = parseSequenceInput(text, fallbackTitle)
    .map((record, index) => cleanRecordSequence(record, fallbackTitle, index, options, warnings))
    .filter((record) => record.sequence.length > 0);
  charactersRemoved = records.reduce((sum, record) => sum + record.removedCount, 0);
  return { records, warnings, charactersRemoved, source: "sequence" };
}
