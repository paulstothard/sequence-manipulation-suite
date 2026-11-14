import { formatFixedNumber } from "../../core/number-display.js";
import { exportDelimitedTable } from "../../core/table.js";
import { normalizeSequenceStatsOptions, SEQUENCE_STATS_OUTPUT_CHARACTERS } from "../../core/sequence-stats-options.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { getDnaRnaStats } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";
import {
  sequenceStatsCountColumns,
  sequenceStatsTableColumns
} from "./table-columns.js";

const COUNT_COLUMNS = sequenceStatsCountColumns;
const TABLE_COLUMNS = sequenceStatsTableColumns;


function formatPercent(value) {
  return Number.isFinite(value) ? formatFixedNumber(value, 2) : "n/a";
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
    lines.push(record.isTotal ? "Combined total stats" : `Record ${record.index}: ${record.title} stats`);
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
    record_index: record.index,
    is_total: record.isTotal === true,
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

function makeTsv(rows) {
  return exportDelimitedTable(TABLE_COLUMNS.map(column => ({ ...column, label: column.id })), rows);
}

function finalizeStats(stats) {
  return {
    ...stats,
    gcPercent: stats.unambiguousBases > 0 ? (stats.gcCount / stats.unambiguousBases) * 100 : null,
    gapCount: 0
  };
}

function makeSequenceStatsResult(analyzedRecords, {
  outputFormat,
  optionsUsed,
  warnings = [],
  notes = [],
  recordsProcessed = analyzedRecords.length,
  charactersRemoved = 0,
  limitOptions = {}
} = {}) {
  const total = makeEmptyTotal();
  for (const record of analyzedRecords) addStats(total, record.stats);
  const displayedRecords = [...analyzedRecords];
  if (displayedRecords.length > 1) {
    displayedRecords.push({ title: "Total", index: null, isTotal: true, stats: finalizeStats(total) });
  }
  const streams = {};
  let output;
  if (outputFormat === "tsv") {
    const rows = makeTableRows(displayedRecords);
    output = makeTsv(rows);
    streams.table = makeTableStream(TABLE_COLUMNS, rows, "sequence-stats-dna-rna");
  } else if (outputFormat === "stats-records") {
    const records = displayedRecords.map(record => ({
      title: record.title, record_index: record.index, is_total: record.isTotal === true, stats: record.stats
    }));
    streams.statsRecords = { kind: "stats-records", schema: "sequence-stats-dna-rna", records };
    output = JSON.stringify(records);
  } else {
    output = makeReport(displayedRecords);
    streams.report = makeTextStream(output, "text/plain");
  }
  const maxOutputCharacters = effectiveToolLimit(limitOptions, "sequenceStatsOutput", SEQUENCE_STATS_OUTPUT_CHARACTERS);
  if (output.length > maxOutputCharacters) {
    throw new Error(`Sequence statistics output contains ${output.length.toLocaleString()} characters, above the current materialized-output limit of ${maxOutputCharacters.toLocaleString()}.`);
  }

  return makeToolResult({
    output,
    optionsUsed,
    download: {
      filename: `sequence-stats-dna-rna.${outputFormat === "tsv" ? "tsv" : outputFormat === "stats-records" ? "json" : "txt"}`,
      mimeType:
        outputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : outputFormat === "stats-records" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8"
    },
    warnings,
    notes,
    recordsProcessed,
    basesProcessed: total.length,
    charactersRemoved,
    streams
  });
}

export async function runSequenceStatsDnaRna(input, options = {}, executionContext = {}) {
  let lastYield = 0;
  const context = {
    ...executionContext,
    async yieldIfNeeded() {
      executionContext.throwIfCancelled?.();
      // Short records should share a scheduling slice instead of paying one
      // browser timer delay per record. Source chunks still check cancellation.
      if (Date.now() - lastYield >= 8) {
        await executionContext.yieldIfNeeded?.();
        lastYield = Date.now();
      }
    }
  };
  options ??= {};
  const settings = normalizeSequenceStatsOptions(options);
  context.reportProgress?.({ phase: "summarizing-sequences", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const sourceOptions = applyDisabledFastaSourceLimits({ ...options, ...settings }, {
    maxSourceBytes: "sequenceStatsFile",
    maxDecodedSourceBytes: "sequenceStatsDecoded",
    maxSourceRecords: "sequenceStatsInput",
    maxSourceBases: "sequenceStatsInput"
  });
  const opened = await openCleanDnaRnaFastaSource(input, {
    ...sourceOptions,
    strictHeaders: true,
    onSourceChunk(text) {
      for (const character of text) if (character === "." || character === "-") current.gaps += 1;
    }
  }, context);
  const optionsUsed = { ...settings, limits: Object.fromEntries(Object.entries({ ...opened.source.limits, outputCharacters: effectiveToolLimit(settings, "sequenceStatsOutput", SEQUENCE_STATS_OUTPUT_CHARACTERS) }).map(([key, value]) => [key, value === Infinity ? "disabled" : value])) };
  const analyzedRecords = [];
  const warnings = [];
  const notes = [];
  let current = null;
  let charactersRemoved = 0;

  for await (const event of opened.events()) {
    if (event.type === "record-start") {
      current = { index: event.record, title: event.title, stats: makeEmptyTotal(), gaps: 0 };
    } else if (event.type === "sequence-chunk" && current) {
      addStats(current.stats, getDnaRnaStats(event.text));
    } else if (event.type === "record-end" && current) {
      charactersRemoved += event.removedCount;
      const stats = finalizeStats(current.stats);
      const label = `Record ${current.index} (${current.title})`;
      if (current.gaps) notes.push(`${label}: removed ${current.gaps} alignment gap character(s).`);
      const invalid = event.removedCount - current.gaps;
      if (invalid > 0) warnings.push(`${label}: removed ${invalid} invalid character(s).`);
      if (stats.length === 0) {
        warnings.push(`${label}: no DNA/RNA sequence characters were found.`);
      }
      if (stats.gcPercent === null) {
        warnings.push(`${label}: GC percent is undefined because there are no unambiguous A/C/G/T/U bases.`);
      }
      analyzedRecords.push({ index: current.index, title: current.title, stats });
      current = null;
    }
  }

  warnings.push(...opened.warnings);
  if (analyzedRecords.length === 0) {
    const emptyWarning = opened.source.stats.inputProvided
      ? "No DNA/RNA records were found."
      : "No sequence input was provided.";
    const result = makeToolResult({
      output: "",
      optionsUsed,
      warnings: [emptyWarning, ...warnings],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved
    });
    context.reportProgress?.({ phase: "finished", progress: 1 });
    return result;
  }

  const result = makeSequenceStatsResult(analyzedRecords, {
    outputFormat: settings.outputFormat,
    optionsUsed,
    warnings,
    notes,
    recordsProcessed: analyzedRecords.length,
    charactersRemoved,
    limitOptions: options
  });
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}

export const runSequenceStatsDnaRnaWorker = runSequenceStatsDnaRna;
