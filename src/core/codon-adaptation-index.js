import { parseSequenceInput } from "./fasta.js";
import { cleanSequence } from "./sequence.js";
import { getCodonsForCode } from "./genetic-code.js";
import { getCodonUsageReference } from "./codon-reference.js";

export const codonAdaptationIndexColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "reference_id", label: "Reference ID", type: "string" },
  { id: "reference_name", label: "Reference", type: "string" },
  { id: "codons_scored", label: "Codons scored", type: "number" },
  { id: "codons_ignored", label: "Codons ignored", type: "number" },
  { id: "cai", label: "CAI", type: "number" },
  { id: "geometric_mean_log", label: "Mean log weight", type: "number" },
  { id: "zero_weight_codons", label: "Zero-weight codons", type: "number" }
];

export const codonAdaptationCodonColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "position", label: "Position", type: "number" },
  { id: "codon", label: "Codon", type: "string" },
  { id: "amino_acid", label: "Amino acid", type: "string" },
  { id: "relative_adaptiveness", label: "Relative adaptiveness", type: "number" },
  { id: "reference_count", label: "Reference count", type: "number" },
  { id: "note", label: "Note", type: "string" }
];

function roundNumber(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function makeWarning(message) {
  return message;
}

function makeRelativeWeights(reference) {
  const codeId = reference?.geneticCode?.id ?? "1";
  const codons = getCodonsForCode(codeId).filter((item) => item.aa !== "*");
  const byAminoAcid = new Map();
  for (const item of codons) {
    byAminoAcid.set(item.aa, [...(byAminoAcid.get(item.aa) ?? []), item.codon]);
  }
  const weights = new Map();
  for (const [aa, family] of byAminoAcid) {
    const counts = family.map((codon) => Number(reference?.codons?.[codon]?.count ?? 0));
    const maxCount = Math.max(...counts, 0);
    for (const codon of family) {
      const count = Number(reference?.codons?.[codon]?.count ?? 0);
      weights.set(codon, {
        aminoAcid: aa,
        count,
        weight: maxCount > 0 ? count / maxCount : 0
      });
    }
  }
  return weights;
}

function parseCodingRecords(input) {
  return parseSequenceInput(input).map((record, index) => {
    const cleaned = cleanSequence(record.sequence, {
      alphabet: "dna-rna",
      preserveCase: false,
      keepGaps: false
    });
    return {
      title: record.title || `Record ${index + 1}`,
      sequence: cleaned.sequence.replace(/U/g, "T"),
      removed: cleaned.removed
    };
  });
}

export function calculateCodonAdaptationIndex(input, references, options = {}) {
  const reference = getCodonUsageReference(references, options.referenceId);
  const weights = makeRelativeWeights(reference);
  const records = parseCodingRecords(input);
  const includeCodonRows = options.includeCodonRows !== false;
  const warnings = [];
  const rows = [];
  const codonRows = [];

  for (const record of records) {
    if (record.removed > 0) {
      warnings.push(makeWarning(`${record.title}: removed ${record.removed} unsupported character(s) before CAI calculation.`));
    }
    const usableLength = record.sequence.length - (record.sequence.length % 3);
    if (record.sequence.length % 3 !== 0) {
      warnings.push(makeWarning(`${record.title}: ignored ${record.sequence.length % 3} trailing base(s) because the sequence length is not a multiple of three.`));
    }
    let scored = 0;
    let ignored = 0;
    let zeroWeight = 0;
    let logSum = 0;
    for (let index = 0; index < usableLength; index += 3) {
      const codon = record.sequence.slice(index, index + 3);
      const weight = weights.get(codon);
      let note = "";
      if (!weight) {
        ignored += 1;
        note = "Ambiguous, stop, or unsupported codon";
      } else if (weight.weight <= 0) {
        ignored += 1;
        zeroWeight += 1;
        note = "Zero weight in selected reference";
      } else {
        scored += 1;
        logSum += Math.log(weight.weight);
      }
      if (includeCodonRows) {
        codonRows.push({
          record: record.title,
          position: index / 3 + 1,
          codon,
          amino_acid: weight?.aminoAcid ?? "",
          relative_adaptiveness: weight ? roundNumber(weight.weight, 6) : 0,
          reference_count: weight?.count ?? 0,
          note
        });
      }
    }
    // CAI follows Sharp and Li 1987: geometric mean of relative synonymous codon adaptiveness weights.
    const meanLog = scored > 0 ? logSum / scored : "";
    rows.push({
      record: record.title,
      reference_id: reference.id,
      reference_name: reference.name,
      codons_scored: scored,
      codons_ignored: ignored,
      cai: scored > 0 ? roundNumber(Math.exp(meanLog), 6) : "",
      geometric_mean_log: scored > 0 ? roundNumber(meanLog, 6) : "",
      zero_weight_codons: zeroWeight
    });
  }

  if (records.length === 0) {
    warnings.push(makeWarning("No DNA/RNA records were found."));
  }

  const report = [
    "Codon adaptation index",
    `Reference: ${reference.name} (${reference.id})`,
    "Method: geometric mean of codon relative adaptiveness weights as described by Sharp and Li (1987). Stop, ambiguous, and zero-weight codons are excluded and counted as ignored.",
    "Citation: Sharp PM and Li WH. Nucleic Acids Res. 1987;15:1281-1295.",
    "",
    ...rows.map((row) => `${row.record}: CAI ${row.cai || "not calculated"}; codons scored ${row.codons_scored}; ignored ${row.codons_ignored}`)
  ].join("\n") + "\n";
  return { reference, records, rows, codonRows, warnings, report };
}

function escapeTsv(value) {
  return String(value ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

export function tableToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => escapeTsv(row[column.id])).join("\t"))
  ].join("\n");
}
