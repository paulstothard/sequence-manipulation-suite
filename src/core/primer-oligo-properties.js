import { parseSequenceInput } from "./fasta.js";
import { complementDnaRnaSequence } from "./sequence.js";
import { exportDelimitedTable } from "./table.js";

export const primerOligoPropertyColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "length", label: "Length", type: "number" },
  { id: "gc_percent", label: "GC percent", type: "number" },
  { id: "a_count", label: "A count", type: "number" },
  { id: "c_count", label: "C count", type: "number" },
  { id: "g_count", label: "G count", type: "number" },
  { id: "t_count", label: "T/U count", type: "number" },
  { id: "n_count", label: "N/other count", type: "number" },
  { id: "tm_c", label: "Tm C", type: "number" },
  { id: "tm_method", label: "Tm method", type: "string" },
  { id: "reverse_complement", label: "Reverse complement", type: "string" }
];

function roundNumber(value, digits = 2) {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(digits));
}

function countBases(sequence) {
  const counts = { A: 0, C: 0, G: 0, T: 0, N: 0 };
  for (const base of String(sequence ?? "").toUpperCase().replace(/U/g, "T")) {
    if (counts[base] !== undefined) {
      counts[base] += 1;
    } else {
      counts.N += 1;
    }
  }
  return counts;
}

function estimateTm(counts, length) {
  // Short-oligo Wallace rule: Wallace RB et al. Nucleic Acids Res. 1979.
  // Longer-oligo approximation is the Marmur-Doty GC formula as implemented
  // by Biopython Tm_GC valueset 1: 69.3 + 0.41(%GC) - 650/N.
  if (length === 0) {
    return "";
  }
  if (length < 14) {
    return 2 * (counts.A + counts.T) + 4 * (counts.G + counts.C);
  }
  return 69.3 + 0.41 * (((counts.G + counts.C) / length) * 100) - 650 / length;
}

function getTmMethod(length) {
  if (length === 0) {
    return "";
  }
  return length < 14 ? "Wallace" : "Marmur-Doty GC";
}

export function analyzePrimerOligos(input) {
  const records = parseSequenceInput(input, "oligo");
  const warnings = [];
  const rows = records.map((record) => {
    const sequence = record.sequence.toUpperCase().replace(/U/g, "T");
    const counts = countBases(sequence);
    const gc = counts.G + counts.C;
    if (counts.N > 0) {
      warnings.push(`${record.title}: ${counts.N} ambiguous or non-ACGT/U symbol(s) make the Tm estimate approximate.`);
    }
    return {
      record: record.title,
      length: sequence.length,
      gc_percent: sequence.length > 0 ? roundNumber((gc / sequence.length) * 100) : 0,
      a_count: counts.A,
      c_count: counts.C,
      g_count: counts.G,
      t_count: counts.T,
      n_count: counts.N,
      tm_c: roundNumber(estimateTm(counts, sequence.length)),
      tm_method: getTmMethod(sequence.length),
      reverse_complement: complementDnaRnaSequence(sequence).split("").reverse().join("")
    };
  });
  const report = [
    "Primer / oligo basic properties",
    "",
    `Records: ${records.length}`,
    "Tm method: Wallace rule for oligos shorter than 14 nt; Marmur-Doty GC approximation for longer oligos.",
    "Citations: Wallace RB et al. Nucleic Acids Res. 1979; Marmur J and Doty P. J Mol Biol. 1962.",
    "",
    ...rows.map((row) => `${row.record}: ${row.length} nt, GC ${row.gc_percent}%, Tm ${row.tm_c} C (${row.tm_method})`)
  ].join("\n");
  return { records, rows, report, warnings };
}

export function makePrimerOligoPropertiesTsv(rows) {
  return exportDelimitedTable(primerOligoPropertyColumns, rows, "\t");
}
