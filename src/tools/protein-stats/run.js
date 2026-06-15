import { parseSequenceInput } from "../../core/fasta.js";
import {
  AMBIGUOUS_AMINO_ACIDS,
  STANDARD_AMINO_ACIDS,
  UNCOMMON_AMINO_ACIDS,
  cleanProteinSequence,
  getProteinStats
} from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";

const SEQUENCE_STATS_PROTEIN_SCHEMA = "sequence-stats-protein";
const COUNT_COLUMNS = [
  ...STANDARD_AMINO_ACIDS,
  ...AMBIGUOUS_AMINO_ACIDS,
  ...UNCOMMON_AMINO_ACIDS
];
const TSV_COLUMNS = [
  "title",
  "length",
  "standard_residues",
  "ambiguous_residues",
  "uncommon_residues",
  "stop_count",
  "molecular_weight_da",
  "average_residue_weight_da",
  "charge_ph",
  "net_charge",
  "isoelectric_point",
  ...COUNT_COLUMNS,
  "stops"
];
export const sequenceStatsProteinTableColumns = [
  { id: "title", label: "Title", type: "string" },
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
  return value === null ? "n/a" : value.toFixed(digits);
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

  for (const column of COUNT_COLUMNS) {
    total.counts[column] += stats.counts[column];
  }
  total.counts.stop += stats.counts.stop;
}

function finalizeTotal(total) {
  const stats = getProteinStats(
    COUNT_COLUMNS.map((residue) => residue.repeat(total.counts[residue])).join(""),
    { chargePh: total.chargePh }
  );
  stats.length = total.length;
  stats.stopCount = total.stopCount;
  stats.counts.stop = total.counts.stop;
  return stats;
}

function makeReport(records) {
  const lines = [];

  for (const record of records) {
    lines.push(`${record.title} stats`);
    lines.push(`Length: ${record.stats.length}`);
    lines.push(`Standard residues: ${record.stats.standardResidues}`);
    lines.push(`Ambiguous residues (B/J/X/Z): ${record.stats.ambiguousResidues}`);
    lines.push(`Uncommon residues (O/U): ${record.stats.uncommonResidues}`);
    lines.push(`Stop count: ${record.stats.stopCount}`);
    lines.push(`Molecular weight (Da): ${formatNumber(record.stats.molecularWeight, 2)}`);
    lines.push(`Average residue weight (Da): ${formatNumber(record.stats.averageResidueWeight, 2)}`);
    lines.push(`Net charge at pH ${formatNumber(record.stats.chargePh, 2)}: ${formatNumber(record.stats.charge, 3)}`);
    lines.push(`Estimated pI: ${formatNumber(record.stats.isoelectricPoint, 2)}`);
    lines.push(
      `Counts: ${COUNT_COLUMNS.map((column) => `${column}=${record.stats.counts[column]}`).join(", ")}, stops=${record.stats.counts.stop}`
    );
    lines.push(
      "Method: average peptide-residue masses plus H2O; EMBOSS Epk.dat pKa defaults with termini included."
    );
    lines.push("References: ExPASy ProtParam; EMBOSS pepstats and iep.");
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function makeTableRow(record) {
  return {
    title: record.title,
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

function makeTsv(records) {
  const rows = [TSV_COLUMNS.join("\t")];

  for (const record of records) {
    rows.push(
      [
        record.title,
        record.stats.length,
        record.stats.standardResidues,
        record.stats.ambiguousResidues,
        record.stats.uncommonResidues,
        record.stats.stopCount,
        formatNumber(record.stats.molecularWeight, 2),
        formatNumber(record.stats.averageResidueWeight, 2),
        formatNumber(record.stats.chargePh, 2),
        formatNumber(record.stats.charge, 3),
        formatNumber(record.stats.isoelectricPoint, 2),
        ...COUNT_COLUMNS.map((column) => record.stats.counts[column]),
        record.stats.counts.stop
      ].join("\t")
    );
  }

  return rows.join("\n");
}

function normalizeChargePh(value) {
  const chargePh = Number(value);

  if (!Number.isFinite(chargePh)) {
    return 7;
  }

  return Math.min(14, Math.max(0, chargePh));
}

export function runSequenceStatsProtein(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];
  const chargePh = normalizeChargePh(options.chargePh ?? 7);

  if (records.length === 0) {
    return makeToolResult({
      output: "",
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
    const cleaned = cleanProteinSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(`${record.title}: removed ${cleaned.removedCount} invalid or gap character(s).`);
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no protein sequence characters were found.`);
    }

    const stats = getProteinStats(cleaned.sequence, { chargePh });
    if (stats.ambiguousResidues > 0 || stats.uncommonResidues > 0 || stats.stopCount > 0) {
      warnings.push(
        `${record.title}: molecular weight, charge, and pI exclude ambiguous, uncommon, and stop symbols.`
      );
    }

    analyzedRecords.push({ title: record.title, stats });
    addStats(total, stats);
  }

  if (analyzedRecords.length > 1) {
    analyzedRecords.push({
      title: "Total",
      stats: finalizeTotal(total)
    });
  }

  const outputFormat = options.outputFormat === "tsv" ? "tsv" : "report";
  const reportOutput = makeReport(analyzedRecords);
  const tableRows = analyzedRecords.map((record) => makeTableRow(record));
  const output = outputFormat === "tsv" ? makeTsv(analyzedRecords) : reportOutput;

  return makeToolResult({
    output,
    download: {
      filename: `sequence-stats-protein.${outputFormat === "tsv" ? "tsv" : "txt"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed: records.length,
    basesProcessed: total.length,
    charactersRemoved,
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      table: makeTableStream(sequenceStatsProteinTableColumns, tableRows, SEQUENCE_STATS_PROTEIN_SCHEMA),
      statsRecords: {
        kind: "stats-records",
        schema: SEQUENCE_STATS_PROTEIN_SCHEMA,
        records: analyzedRecords.map((record) => ({
          title: record.title,
          stats: record.stats
        }))
      }
    }
  });
}

export function runProteinStats(input, options = {}) {
  return runSequenceStatsProtein(input, options);
}

export async function runSequenceStatsProteinWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "summarizing-proteins", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const result = runSequenceStatsProtein(input, options);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}

export async function runProteinStatsWorker(input, options = {}, context = {}) {
  return runSequenceStatsProteinWorker(input, options, context);
}
