import { formatFixedNumber } from "../../core/number-display.js";
import { effectiveToolLimit } from "../../core/tool-limit-policy.js";
import { exportDelimitedTable } from "../../core/table.js";
import { parseSequenceInput } from "../../core/fasta.js";
import { normalizeProteinStatsOptions, PROTEIN_STATS_LIMITS as LIMITS } from "../../core/protein-stats-options.js";
import {
  AMBIGUOUS_AMINO_ACIDS,
  STANDARD_AMINO_ACIDS,
  UNCOMMON_AMINO_ACIDS,
  cleanProteinSequence,
  countProteinSymbols,
  getProteinStatsFromCounts
} from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const SEQUENCE_STATS_PROTEIN_SCHEMA = "sequence-stats-protein";
const COUNT_COLUMNS = [
  ...STANDARD_AMINO_ACIDS,
  ...AMBIGUOUS_AMINO_ACIDS,
  ...UNCOMMON_AMINO_ACIDS
];
export const sequenceStatsProteinTableColumns = [
  { id: "title", label: "Title", type: "string" },
  { id: "record_index", label: "Record number", type: "number" },
  { id: "is_total", label: "Combined total", type: "boolean" },
  { id: "length", label: "Length", type: "number" },
  { id: "standard_residues", label: "Standard residues", type: "number" },
  { id: "ambiguous_residues", label: "Ambiguous residues", type: "number" },
  { id: "uncommon_residues", label: "Uncommon residues", type: "number" },
  { id: "stop_count", label: "Stop count", type: "number" },
  { id: "molecular_weight_da", label: "Molecular weight (Da)", type: "number" },
  { id: "average_residue_weight_da", label: "Average residue weight (Da)", type: "number" },
  { id: "charge_ph", label: "Charge pH", type: "number" },
  { id: "net_charge", label: "Net charge", type: "number" },
  { id: "isoelectric_point", label: "Isoelectric point", type: "number" },
  ...COUNT_COLUMNS.map((column) => ({
    id: column,
    label: column,
    type: "number"
  })),
  { id: "stops", label: "Stops", type: "number" }
];
export const proteinStatsTableColumns = sequenceStatsProteinTableColumns;

function formatNumber(value, digits = 2) {
  return value === null ? "n/a" : formatFixedNumber(value, digits);
}

function makeEmptyTotal(chargePh) {
  const counts = Object.fromEntries(COUNT_COLUMNS.map((column) => [column, 0]));
  counts.stop = 0;

  return {
    length: 0,
    counts,
    standardResidues: 0,
    ambiguousResidues: 0,
    uncommonResidues: 0,
    stopCount: 0,
    molecularWeight: 0,
    averageResidueWeight: 0,
    chargePh,
    charge: null,
    isoelectricPoint: null
  };
}

function addStats(total, stats) {
  total.length += stats.length;
  total.standardResidues += stats.standardResidues;
  total.ambiguousResidues += stats.ambiguousResidues;
  total.uncommonResidues += stats.uncommonResidues;
  total.stopCount += stats.stopCount;
  total.molecularWeight += stats.molecularWeight;
  if (stats.charge !== null) total.charge = (total.charge ?? 0) + stats.charge;

  for (const column of COUNT_COLUMNS) {
    total.counts[column] += stats.counts[column];
  }
  total.counts.stop += stats.counts.stop;
}

function finalizeTotal(total) {
  // Records are independent molecules: retain each record's H2O and termini.
  // A collection has no single protein pI; do not synthesize a joined chain.
  return {
    ...total,
    gapCount: 0,
    averageResidueWeight: total.standardResidues > 0 ? total.molecularWeight / total.standardResidues : 0,
    isoelectricPoint: null
  };
}

function makeReport(records) {
  const lines = [];

  for (const record of records) {
    lines.push(record.isTotal ? "Combined total stats" : `Record ${record.index}: ${record.title} stats`);
    lines.push(`Length: ${record.stats.length}`);
    lines.push(`Standard residues: ${record.stats.standardResidues}`);
    lines.push(`Ambiguous residues (B/J/X/Z): ${record.stats.ambiguousResidues}`);
    lines.push(`Uncommon residues (O/U): ${record.stats.uncommonResidues}`);
    lines.push(`Stop count: ${record.stats.stopCount}`);
    lines.push(`Molecular weight (Da): ${formatNumber(record.stats.molecularWeight, 2)}`);
    lines.push(`Average residue weight (Da): ${formatNumber(record.stats.averageResidueWeight, 2)}`);
    lines.push(`Net charge at pH ${record.stats.chargePh}: ${formatNumber(record.stats.charge, 3)}`);
    lines.push(`Estimated pI: ${formatNumber(record.stats.isoelectricPoint, 2)}`);
    lines.push(
      `Counts: ${COUNT_COLUMNS.map((column) => `${column}=${record.stats.counts[column]}`).join(", ")}, stops=${record.stats.counts.stop}`
    );
    lines.push(record.isTotal
      ? "Total: sum of record masses and charges; average residue weight is total mass / standard residues; collection pI is undefined."
      : "Method: average peptide-residue masses plus H2O; EMBOSS Epk.dat pKa defaults with termini included."
    );
    lines.push("References:");
    lines.push("");
    lines.push("Protein parameter formulas and constants: ExPASy ProtParam documentation.");
    lines.push("Oracle/reference behavior: EMBOSS pepstats and iep documentation.");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function makeTableRow(record) {
  return {
    title: record.title,
    record_index: record.index,
    is_total: record.isTotal === true,
    length: record.stats.length,
    standard_residues: record.stats.standardResidues,
    ambiguous_residues: record.stats.ambiguousResidues,
    uncommon_residues: record.stats.uncommonResidues,
    stop_count: record.stats.stopCount,
    molecular_weight_da: record.stats.molecularWeight,
    average_residue_weight_da: record.stats.averageResidueWeight,
    charge_ph: record.stats.chargePh,
    net_charge: record.stats.charge,
    isoelectric_point: record.stats.isoelectricPoint,
    ...Object.fromEntries(COUNT_COLUMNS.map((column) => [column, record.stats.counts[column]])),
    stops: record.stats.counts.stop
  };
}

function makeTsv(rows) {
  return exportDelimitedTable(sequenceStatsProteinTableColumns.map(column => ({ ...column, label: column.id })), rows);
}

export async function runSequenceStatsProtein(input, options = {}, executionContext = {}) {
  const settings = normalizeProteinStatsOptions(options);
  const limits = {
    inputCharacters: effectiveToolLimit(settings, "proteinStatsInput", LIMITS.inputCharacters),
    records: effectiveToolLimit(settings, "proteinStatsRecords", LIMITS.records),
    outputCharacters: effectiveToolLimit(settings, "proteinStatsOutput", LIMITS.outputCharacters),
    headerCharacters: LIMITS.headerCharacters
  };
  const optionsUsed = { ...settings, limits: Object.fromEntries(Object.entries(limits).map(([key,value])=>[key,value === Infinity ? "disabled" : value])) };
  let lastYield = 0;
  async function checkpoint() {
    executionContext.throwIfCancelled?.();
    if (Date.now() - lastYield >= 8) { await executionContext.yieldIfNeeded?.(); lastYield = Date.now(); }
  }
  executionContext.reportProgress?.({ phase: "summarizing-proteins", progress: 0.1 });
  await checkpoint();
  const source = String(input ?? "");
  if (source.length > limits.inputCharacters) throw new Error(`Protein statistics input exceeds ${LIMITS.inputCharacters.toLocaleString()} characters.`);
  const records = parseSequenceInput(source, "sequence", { strictHeaders: true });
  if (records.length > limits.records) throw new Error(`Protein statistics input exceeds ${LIMITS.records.toLocaleString()} records.`);
  if (records.some(record=>record.title.length > limits.headerCharacters)) throw new Error(`Protein statistics FASTA headers must not exceed ${LIMITS.headerCharacters.toLocaleString()} characters.`);
  const warnings = [];
  const notes = [];
  const { chargePh, outputFormat } = optionsUsed;

  if (records.length === 0) {
    return makeToolResult({
      output: "",
      optionsUsed,
      processedUnitLabel: "residue",
      warnings: ["No sequence input was provided."],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved: 0
    });
  }

  const analyzedRecords = [];
  const total = makeEmptyTotal(chargePh);
  let charactersRemoved = 0;

  for (const record of records) {
    const counts = countProteinSymbols("");
    let removedCount = 0, gapCount = 0;
    for (let start = 0; start < record.sequence.length;) {
      await checkpoint();
      let end = Math.min(record.sequence.length, start + 65_536);
      if (end < record.sequence.length && /[\uD800-\uDBFF]/.test(record.sequence[end-1]) && /[\uDC00-\uDFFF]/.test(record.sequence[end])) end += 1;
      const sourceChunk = record.sequence.slice(start,end);
      for (const character of sourceChunk) if (character === "." || character === "-") gapCount += 1;
      const chunk = cleanProteinSequence(sourceChunk, { preserveCase: false, keepGaps: false });
      countProteinSymbols(chunk.sequence, counts);
      removedCount += chunk.removedCount;
      start = end;
      if (record.sequence.length >= 65_536) executionContext.reportProgress?.({ phase: "counting-protein", processedCharacters: start, totalCharacters: record.sequence.length });
    }
    await checkpoint();
    const stats = getProteinStatsFromCounts(counts, { chargePh });
    charactersRemoved += removedCount;
    const label = `Record ${analyzedRecords.length + 1} (${record.title})`;
    if (gapCount) notes.push(`${label}: removed ${gapCount} alignment gap character(s).`);
    if (removedCount > gapCount) warnings.push(`${label}: removed ${removedCount-gapCount} invalid character(s).`);

    if (stats.length === 0) {
      warnings.push(`${label}: no protein sequence characters were found.`);
    }

    if (stats.ambiguousResidues > 0 || stats.uncommonResidues > 0 || stats.stopCount > 0) {
      warnings.push(
        `${label}: molecular weight, charge, and pI exclude ambiguous, uncommon, and stop symbols.`
      );
    }

    analyzedRecords.push({ title: record.title, index: analyzedRecords.length + 1, stats });
    addStats(total, stats);
  }

  if (analyzedRecords.length > 1) {
    notes.push("Combined total sums record masses and charges with independent termini; average residue weight is total mass / standard residues; collection pI is undefined.");
    analyzedRecords.push({
      title: "Total",
      index: null,
      isTotal: true,
      stats: finalizeTotal(total)
    });
  }

  const streams = {};
  const parts = [];
  let outputLength = 0;
  function append(text) {
    outputLength += text.length;
    if (outputLength > limits.outputCharacters) throw new Error(`Protein statistics output exceeds ${LIMITS.outputCharacters.toLocaleString()} characters.`);
    parts.push(text);
  }
  let output;
  if (outputFormat === "tsv") {
    const rows = [];
    append(makeTsv([]));
    for (const record of analyzedRecords) {
      await checkpoint();
      const row = makeTableRow(record);
      const serialized = makeTsv([row]);
      append("\n" + serialized.slice(serialized.indexOf("\n") + 1));
      rows.push(row);
    }
    streams.table = makeTableStream(sequenceStatsProteinTableColumns, rows, SEQUENCE_STATS_PROTEIN_SCHEMA);
  } else if (outputFormat === "stats-records") {
    const records = [];
    append("[");
    for (const record of analyzedRecords) {
      await checkpoint();
      const value = { title: record.title, record_index: record.index, is_total: record.isTotal === true, stats: record.stats };
      append((records.length ? "," : "") + JSON.stringify(value));
      records.push(value);
    }
    append("]");
    streams.statsRecords = { kind: "stats-records", schema: SEQUENCE_STATS_PROTEIN_SCHEMA, records };
  } else {
    for (const record of analyzedRecords) {
      await checkpoint();
      append((parts.length ? "\n\n" : "") + makeReport([record]));
    }
  }
  output = parts.join("");
  if (outputFormat === "report") streams.report = makeTextStream(output, "text/plain");
  executionContext.reportProgress?.({ phase: "finished", progress: 1 });

  return makeToolResult({
    output,
    optionsUsed,
    download: {
      filename: `sequence-stats-protein.${outputFormat === "tsv" ? "tsv" : outputFormat === "stats-records" ? "json" : "txt"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : outputFormat === "stats-records" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings,
    notes,
    processedUnitLabel: total.stopCount ? "character" : "residue",
    recordsProcessed: records.length,
    basesProcessed: total.length,
    charactersRemoved,
    streams
  });
}

export const runProteinStats = runSequenceStatsProtein;
export const runSequenceStatsProteinWorker = runSequenceStatsProtein;
export const runProteinStatsWorker = runSequenceStatsProtein;
