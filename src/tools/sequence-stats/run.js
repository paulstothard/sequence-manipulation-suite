import { parseSequenceInput } from "../../core/fasta.js";
import { cleanDnaRnaSequence, getDnaRnaStats } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import {
  sequenceStatsCountColumns,
  sequenceStatsTableColumns,
  sequenceStatsTsvColumns
} from "./table-columns.js";

const COUNT_COLUMNS = sequenceStatsCountColumns;
const TSV_COLUMNS = sequenceStatsTsvColumns;
const TABLE_COLUMNS = sequenceStatsTableColumns;

function formatPercent(value) {
  return value.toFixed(2);
}

function addStats(total, stats) {
  total.length += stats.length;
  total.gcCount += stats.gcCount;
  total.unambiguousBases += stats.unambiguousBases;
  total.ambiguityCount += stats.ambiguityCount;
  total.nCount += stats.nCount;
  total.xCount += stats.xCount;

  for (const column of COUNT_COLUMNS) {
    total.counts[column] += stats.counts[column];
  }
}

function makeEmptyTotal() {
  const counts = Object.fromEntries(COUNT_COLUMNS.map((column) => [column, 0]));

  return {
    length: 0,
    counts,
    gcCount: 0,
    unambiguousBases: 0,
    ambiguityCount: 0,
    nCount: 0,
    xCount: 0
  };
}

function makeReport(records) {
  const lines = [];

  for (const record of records) {
    lines.push(`${record.title} stats`);
    lines.push(`Length: ${record.stats.length}`);
    lines.push(`Unambiguous bases (A/C/G/T/U): ${record.stats.unambiguousBases}`);
    lines.push(`GC count: ${record.stats.gcCount}`);
    lines.push(`GC percent: ${formatPercent(record.stats.gcPercent)}`);
    lines.push(`Ambiguous symbols: ${record.stats.ambiguityCount}`);
    lines.push(`N count: ${record.stats.nCount}`);
    lines.push(`X count: ${record.stats.xCount}`);
    lines.push(
      `Counts: ${COUNT_COLUMNS.map((column) => `${column}=${record.stats.counts[column]}`).join(", ")}`
    );
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function makeTableRow(record) {
  return {
    title: record.title,
    length: record.stats.length,
    unambiguous_bases: record.stats.unambiguousBases,
    gc_count: record.stats.gcCount,
    gc_percent: record.stats.gcPercent,
    ambiguous_symbols: record.stats.ambiguityCount,
    n_count: record.stats.nCount,
    x_count: record.stats.xCount,
    ...Object.fromEntries(COUNT_COLUMNS.map((column) => [column, record.stats.counts[column]]))
  };
}

function makeTableRows(records) {
  return records.map((record) => makeTableRow(record));
}

function makeTsv(records) {
  const rows = [TSV_COLUMNS.join("\t")];

  for (const record of records) {
    rows.push(
      [
        record.title,
        record.stats.length,
        record.stats.unambiguousBases,
        record.stats.gcCount,
        formatPercent(record.stats.gcPercent),
        record.stats.ambiguityCount,
        record.stats.nCount,
        record.stats.xCount,
        ...COUNT_COLUMNS.map((column) => record.stats.counts[column])
      ].join("\t")
    );
  }

  return rows.join("\n");
}

export function runSequenceStatsDnaRna(input, options = {}) {
  const records = parseSequenceInput(input, "sequence");
  const warnings = [];

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
  const total = makeEmptyTotal();
  let charactersRemoved = 0;

  for (const record of records) {
    const cleaned = cleanDnaRnaSequence(record.sequence, {
      preserveCase: false,
      keepGaps: false
    });
    charactersRemoved += cleaned.removedCount;

    if (cleaned.removedCount > 0) {
      warnings.push(
        `${record.title}: removed ${cleaned.removedCount} invalid or gap character(s).`
      );
    }

    if (cleaned.sequence.length === 0) {
      warnings.push(`${record.title}: no DNA/RNA sequence characters were found.`);
    }

    const stats = getDnaRnaStats(cleaned.sequence);
    analyzedRecords.push({ title: record.title, stats });
    addStats(total, stats);
  }

  if (analyzedRecords.length > 1) {
    analyzedRecords.push({
      title: "Total",
      stats: {
        ...total,
        gcPercent: total.unambiguousBases > 0 ? (total.gcCount / total.unambiguousBases) * 100 : 0
      }
    });
  }

  const outputFormat = options.outputFormat === "tsv" ? "tsv" : "report";
  const reportOutput = makeReport(analyzedRecords);
  const tableRows = makeTableRows(analyzedRecords);
  const output = outputFormat === "tsv" ? makeTsv(analyzedRecords) : reportOutput;

  return makeToolResult({
    output,
    download: {
      filename: `sequence-stats-dna-rna.${outputFormat === "tsv" ? "tsv" : "txt"}`,
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
      table: makeTableStream(TABLE_COLUMNS, tableRows, "sequence-stats-dna-rna"),
      statsRecords: {
        kind: "stats-records",
        schema: "sequence-stats-dna-rna",
        records: analyzedRecords.map((record) => ({
          title: record.title,
          stats: record.stats
        }))
      }
    }
  });
}

export async function runSequenceStatsDnaRnaWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "summarizing-sequences", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const result = runSequenceStatsDnaRna(input, options);
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
