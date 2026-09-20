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

export function makeRelativeWeights(reference) {
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

export function createCodonAdaptationAccumulator(reference, options = {}) {
  const maxCodonRows = Number.isSafeInteger(options.maxCodonRows) && options.maxCodonRows >= 0
    ? options.maxCodonRows
    : Number.MAX_SAFE_INTEGER;
  return {
    reference,
    weights: makeRelativeWeights(reference),
    includeCodonRows: options.includeCodonRows !== false,
    maxCodonRows,
    carry: "",
    codonPosition: 0,
    scored: 0,
    ignored: 0,
    zeroWeight: 0,
    logSum: 0,
    codonRows: []
  };
}

export function appendCodonAdaptationChunk(accumulator, sequence) {
  const source = `${accumulator.carry}${String(sequence ?? "").toUpperCase().replaceAll("U", "T")}`;
  const usableLength = source.length - (source.length % 3);
  for (let index = 0; index < usableLength; index += 3) {
    const codon = source.slice(index, index + 3);
    const weight = accumulator.weights.get(codon);
    accumulator.codonPosition += 1;
    let note = "";
    if (!weight) {
      accumulator.ignored += 1;
      note = "Ambiguous, stop, or unsupported codon";
    } else if (weight.weight <= 0) {
      accumulator.ignored += 1;
      accumulator.zeroWeight += 1;
      note = "Zero weight in selected reference";
    } else {
      accumulator.scored += 1;
      accumulator.logSum += Math.log(weight.weight);
    }
    if (accumulator.includeCodonRows) {
      if (accumulator.codonRows.length >= accumulator.maxCodonRows) {
        throw new Error(`Per-codon CAI output exceeds the current limit of ${accumulator.maxCodonRows.toLocaleString()} rows. Choose the CAI summary table or summary report for larger inputs.`);
      }
      accumulator.codonRows.push({
        position: accumulator.codonPosition,
        codon,
        amino_acid: weight?.aminoAcid ?? "",
        relative_adaptiveness: weight ? roundNumber(weight.weight, 6) : 0,
        reference_count: weight?.count ?? 0,
        note
      });
    }
  }
  accumulator.carry = source.slice(usableLength);
}

export function finishCodonAdaptationAccumulator(accumulator, title) {
  const meanLog = accumulator.scored > 0 ? accumulator.logSum / accumulator.scored : "";
  return {
    row: {
      record: title,
      reference_id: accumulator.reference.id,
      reference_name: accumulator.reference.name,
      codons_scored: accumulator.scored,
      codons_ignored: accumulator.ignored,
      cai: accumulator.scored > 0 ? roundNumber(Math.exp(meanLog), 6) : "",
      geometric_mean_log: accumulator.scored > 0 ? roundNumber(meanLog, 6) : "",
      zero_weight_codons: accumulator.zeroWeight
    },
    codonRows: accumulator.codonRows.map((row) => ({ record: title, ...row })),
    trailingBases: accumulator.carry.length
  };
}

export function makeCodonAdaptationReport(reference, rows) {
  return [
    "Codon adaptation index",
    `Reference: ${reference.name} (${reference.id})`,
    "Method: geometric mean of codon relative adaptiveness weights as described by Sharp and Li (1987). Stop, ambiguous, and zero-weight codons are excluded and counted as ignored.",
    "Citation: Sharp PM and Li WH. Nucleic Acids Res. 1987;15:1281-1295.",
    "",
    ...rows.map((row) => `${row.record}: CAI ${row.cai || "not calculated"}; codons scored ${row.codons_scored}; ignored ${row.codons_ignored}`)
  ].join("\n") + "\n";
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
      removed: cleaned.removedCount
    };
  });
}

export function calculateCodonAdaptationIndex(input, references, options = {}) {
  const reference = getCodonUsageReference(references, options.referenceId);
  const records = parseCodingRecords(input);
  const includeCodonRows = options.includeCodonRows !== false;
  const warnings = [];
  const rows = [];
  const codonRows = [];

  for (const record of records) {
    if (record.removed > 0) {
      warnings.push(makeWarning(`${record.title}: removed ${record.removed} unsupported character(s) before CAI calculation.`));
    }
    const remainingCodonRows = Number.isSafeInteger(options.maxCodonRows)
      ? Math.max(0, options.maxCodonRows - codonRows.length)
      : undefined;
    const accumulator = createCodonAdaptationAccumulator(reference, {
      includeCodonRows,
      maxCodonRows: remainingCodonRows
    });
    appendCodonAdaptationChunk(accumulator, record.sequence);
    const scored = finishCodonAdaptationAccumulator(accumulator, record.title);
    if (scored.trailingBases !== 0) {
      warnings.push(makeWarning(`${record.title}: ignored ${scored.trailingBases} trailing base(s) because the sequence length is not a multiple of three.`));
    }
    rows.push(scored.row);
    codonRows.push(...scored.codonRows);
  }

  if (records.length === 0) {
    warnings.push(makeWarning("No DNA/RNA records were found."));
  }

  const report = makeCodonAdaptationReport(reference, rows);
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
