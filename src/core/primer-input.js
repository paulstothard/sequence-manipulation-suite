import { assertPlainSequenceOrFasta } from "./sequence-input-format.js";
import { parseSequenceInput } from "./fasta.js";
import { cleanDnaRnaSequence } from "./sequence.js";

// Plain primer/oligo lists use one sequence per nonempty line. FASTA sequences may wrap.
// Preserve the alphabet and ambiguous symbols for each tool's own analysis policy.
export function parsePrimerRecords(text, fallbackTitle = "Primer") {
  const source = String(text ?? "").replace(/\r\n?/g, "\n").trim();
  assertPlainSequenceOrFasta(source);
  return source.startsWith(">")
    ? parseSequenceInput(source, fallbackTitle)
    : source.split("\n").map((line) => line.replace(/\s+/g, "")).filter(Boolean)
      .map((sequence, index) => ({ title: `${fallbackTitle} ${index + 1}`, sequence, hadHeader: false }));
}

export function parsePrimerSequences(text, warnings = []) {
  const records = parsePrimerRecords(text);
  return records.map((record, index) => {
    const cleaned = cleanDnaRnaSequence(record.sequence, { preserveCase: false, keepGaps: false });
    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title || `Primer ${index + 1}`}: removed ${cleaned.removedCount} non-DNA/RNA character(s).`);
    }
    return {
      title: record.title || `Primer ${index + 1}`,
      sequence: cleaned.sequence.replaceAll("U", "T")
    };
  }).filter((primer) => primer.sequence.length > 0);
}
