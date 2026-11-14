import { exportDelimitedTable } from "./table.js";
import { openCleanDnaRnaFastaSource } from "./fasta-dna-record-source.js";
import { getCodonsForCode } from "./genetic-code.js";
import { getCodonUsageReference } from "./codon-reference.js";
import { normalizeCodonAdaptationOptions } from "./codon-adaptation-options.js";

export const codonAdaptationIndexColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "reference_id", label: "Reference ID", type: "string" },
  { id: "reference_name", label: "Reference", type: "string" },
  { id: "codons_scored", label: "Codons scored", type: "number" },
  { id: "codons_ignored", label: "Codons ignored", type: "number" },
  { id: "cai", label: "CAI", type: "number" },
  { id: "geometric_mean_log", label: "Mean log weight", type: "number" },
  { id: "zero_weight_codons", label: "Zero-reference codons", type: "number" },
  { id: "record_index", label: "Record number", type: "number" }
];

export const codonAdaptationCodonColumns = [
  { id: "record", label: "Record", type: "string" },
  { id: "position", label: "Codon number", type: "number" },
  { id: "codon", label: "Codon", type: "string" },
  { id: "amino_acid", label: "Amino acid", type: "string" },
  { id: "relative_adaptiveness", label: "Relative adaptiveness", type: "number" },
  { id: "reference_count", label: "Reference count", type: "number" },
  { id: "note", label: "Note", type: "string" },
  { id: "record_index", label: "Record number", type: "number" }
];

// Sharp and Li 1987, p1285: exclude singleton families from L and use
// 0.5 for zero reference counts. https://doi.org/10.1093/nar/15.3.1281
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
    const maxCount = Math.max(...counts.map(count => count || 0.5));
    for (const codon of family) {
      const count = Number(reference?.codons?.[codon]?.count ?? 0);
      weights.set(codon, {
        aminoAcid: aa,
        count,
        weight: (count || 0.5) / maxCount,
        scorable: family.length > 1
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
    } else if (!weight.scorable) {
      accumulator.ignored += 1;
      note = "Single-codon amino-acid family; excluded from CAI";
    } else {
      accumulator.scored += 1;
      accumulator.logSum += Math.log(weight.weight);
      if (weight.count === 0) {
        accumulator.zeroWeight += 1;
        note = "Zero reference count; 0.5 pseudocount used";
      }
    }
    if (accumulator.includeCodonRows) {
      if (accumulator.codonRows.length >= accumulator.maxCodonRows) {
        throw new Error(`Per-codon CAI output exceeds the current limit of ${accumulator.maxCodonRows.toLocaleString()} rows. Choose the CAI summary table or summary report for larger inputs.`);
      }
      accumulator.codonRows.push({
        position: accumulator.codonPosition,
        codon,
        amino_acid: weight?.aminoAcid ?? "",
        relative_adaptiveness: weight ? weight.weight : 0,
        reference_count: weight?.count ?? 0,
        note
      });
    }
  }
  accumulator.carry = source.slice(usableLength);
}

export function finishCodonAdaptationAccumulator(accumulator, title, recordIndex = 1) {
  const meanLog = accumulator.scored > 0 ? accumulator.logSum / accumulator.scored : "";
  return {
    row: {
      record: title,
      reference_id: accumulator.reference.id,
      reference_name: accumulator.reference.name,
      codons_scored: accumulator.scored,
      codons_ignored: accumulator.ignored,
      cai: accumulator.scored > 0 ? Math.exp(meanLog) : "",
      geometric_mean_log: accumulator.scored > 0 ? meanLog : "",
      zero_weight_codons: accumulator.zeroWeight,
      record_index: recordIndex
    },
    codonRows: accumulator.codonRows.map((row) => ({ record: title, ...row, record_index: recordIndex })),
    trailingBases: accumulator.carry.length
  };
}

export function makeCodonAdaptationReport(reference, rows) {
  return [
    "Codon adaptation index",
    `Reference: ${reference.name} (${reference.id})`,
    "Method: geometric mean of codon relative adaptiveness weights as described by Sharp and Li (1987). Stop, ambiguous, and single-codon amino-acid families are excluded and counted as ignored. Zero reference counts use a 0.5 pseudocount.",
    "Interpretation: bundled organism references summarize CDS usage, not highly expressed gene subsets; scores measure similarity to that reference, not predicted expression. The equal-synonymous seed is illustrative.",
    "Citation: Sharp PM and Li WH. Nucleic Acids Res. 1987;15:1281-1295.",
    "",
    ...rows.map((row) => `Record ${row.record_index}: ${row.record}: CAI ${row.cai === "" ? "not calculated" : Number(row.cai.toPrecision(6))}; codons scored ${row.codons_scored}; ignored ${row.codons_ignored}`)
  ].join("\n") + "\n";
}

// One source/accumulator path for pasted, uploaded, gzip and indexed records.
export async function calculateCodonAdaptationIndex(input, references, options = {}, executionContext = {}) {
  let lastYield = 0;
  const context = {
    ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      // Source and scoring chunks share a slice so short records retain
      // cancellation polling without paying two browser timer delays each.
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    }
  };
  options = { ...options, ...normalizeCodonAdaptationOptions(options, references) };
  const reference = getCodonUsageReference(references, options.referenceId);
  const opened = await openCleanDnaRnaFastaSource(input, { ...options, strictHeaders: true }, context);
  const rows = [], codonRows = [], warnings = [];
  let current = null, basesProcessed = 0, charactersRemoved = 0;
  for await (const event of opened.events()) {
    context.throwIfCancelled?.();
    if (event.type === "record-start") {
      current = {
        title: event.title,
        accumulator: createCodonAdaptationAccumulator(reference, {
          includeCodonRows: options.outputFormat === "codon-tsv",
          maxCodonRows: Number.isSafeInteger(options.maxCodonRows)
            ? Math.max(0, options.maxCodonRows - codonRows.length) : undefined
        })
      };
    } else if (event.type === "sequence-chunk" && current) {
      // Keep computation cooperative even when a caller requests large source chunks.
      for (let start = 0; start < event.text.length; start += 65536) {
        context.throwIfCancelled?.();
        appendCodonAdaptationChunk(current.accumulator, event.text.slice(start, start + 65536));
        await context.yieldIfNeeded?.();
      }
      basesProcessed += event.text.length;
    } else if (event.type === "record-end" && current) {
      const scored = finishCodonAdaptationAccumulator(current.accumulator, current.title, rows.length + 1);
      rows.push(scored.row);
      // Avoid spreading up to 250,000 arguments into Array.push.
      for (const row of scored.codonRows) codonRows.push(row);
      charactersRemoved += event.removedCount;
      if (event.removedCount > 0) warnings.push(`${current.title}: removed ${event.removedCount} unsupported character(s) before CAI calculation.`);
      if (scored.trailingBases > 0) warnings.push(`${current.title}: ignored ${scored.trailingBases} trailing base(s) because the sequence length is not a multiple of three.`);
      current = null;
    }
  }
  warnings.push(...opened.warnings);
  if (rows.length === 0) warnings.unshift("No DNA/RNA records were found.");
  return {
    reference, rows, codonRows, warnings, recordsProcessed: rows.length, basesProcessed, charactersRemoved,
    ...(options.outputFormat === "report" ? { report: makeCodonAdaptationReport(reference, rows) } : {})
  };
}

export function tableToTsv(columns, rows) {
  return exportDelimitedTable(columns.map(column => ({ ...column, label: column.id })), rows, "\t");
}
