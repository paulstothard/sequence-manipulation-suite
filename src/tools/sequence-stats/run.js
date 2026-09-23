import { parseSequenceInput } from "../../core/fasta.js";
import { openCleanDnaRnaFastaSource } from "../../core/fasta-dna-record-source.js";
import { cleanDnaRnaSequence, getDnaRnaStats } from "../../core/sequence.js";
import { makeTableStream, makeTextStream, makeToolResult } from "../../core/workflow.js";
import { applyDisabledFastaSourceLimits, effectiveToolLimit } from "../../core/tool-limit-policy.js";
import {
  sequenceStatsCountColumns,
  sequenceStatsTableColumns,
  sequenceStatsTsvColumns
} from "./table-columns.js";

const COUNT_COLUMNS = sequenceStatsCountColumns;
const TSV_COLUMNS = sequenceStatsTsvColumns;
const TABLE_COLUMNS = sequenceStatsTableColumns;
const MAX_MATERIALIZED_OUTPUT_CHARACTERS = 25 * 1024 * 1024;

function formatPercent(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
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

function finalizeStats(stats) {
  return {
    ...stats,
    gcPercent: stats.unambiguousBases > 0 ? (stats.gcCount / stats.unambiguousBases) * 100 : null,
    gapCount: 0
  };
}

function makeSequenceStatsResult(analyzedRecords, {
  outputFormat = "tsv",
  warnings = [],
  recordsProcessed = analyzedRecords.length,
  charactersRemoved = 0,
  limitOptions = {}
} = {}) {
  const total = makeEmptyTotal();
  for (const record of analyzedRecords) addStats(total, record.stats);
  const displayedRecords = [...analyzedRecords];
  if (displayedRecords.length > 1) {
    displayedRecords.push({ title: "Total", stats: finalizeStats(total) });
  }
  const normalizedOutputFormat = outputFormat === "report" ? "report" : "tsv";
  // Workflows may select either stream independently of the visible output
  // format. Both remain bounded by the record cap and fixed table schema.
  const reportOutput = makeReport(displayedRecords);
  const tableRows = makeTableRows(displayedRecords);
  const output = normalizedOutputFormat === "tsv" ? makeTsv(displayedRecords) : reportOutput;
  const maxOutputCharacters = effectiveToolLimit(limitOptions, "sequenceStatsOutput", MAX_MATERIALIZED_OUTPUT_CHARACTERS);
  if (output.length > maxOutputCharacters) {
    throw new Error(`Sequence statistics output contains ${output.length.toLocaleString()} characters, above the current materialized-output limit of ${maxOutputCharacters.toLocaleString()}.`);
  }

  return makeToolResult({
    output,
    download: {
      filename: `sequence-stats-dna-rna.${normalizedOutputFormat === "tsv" ? "tsv" : "txt"}`,
      mimeType:
        normalizedOutputFormat === "tsv"
          ? "text/tab-separated-values;charset=utf-8"
          : "text/plain;charset=utf-8"
    },
    warnings,
    recordsProcessed,
    basesProcessed: total.length,
    charactersRemoved,
    streams: {
      report: makeTextStream(reportOutput, "text/plain"),
      table: makeTableStream(TABLE_COLUMNS, tableRows, "sequence-stats-dna-rna"),
      statsRecords: {
        kind: "stats-records",
        schema: "sequence-stats-dna-rna",
        records: displayedRecords.map((record) => ({
          title: record.title,
          stats: record.stats
        }))
      }
    }
  });
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
    if (stats.gcPercent === null) warnings.push(`${record.title}: GC percent is undefined because there are no unambiguous A/C/G/T/U bases.`);
    analyzedRecords.push({ title: record.title, stats });
  }

  return makeSequenceStatsResult(analyzedRecords, {
    outputFormat: options.outputFormat,
    warnings,
    recordsProcessed: records.length,
    charactersRemoved,
    limitOptions: options
  });
}

export async function runSequenceStatsDnaRnaWorker(input, options = {}, context = {}) {
  context.reportProgress?.({ phase: "summarizing-sequences", progress: 0.1 });
  context.throwIfCancelled?.();
  await context.yieldIfNeeded?.();
  const sourceOptions = applyDisabledFastaSourceLimits(options, {
    maxSourceBytes: "sequenceStatsFile",
    maxDecodedSourceBytes: "sequenceStatsDecoded",
    maxSourceRecords: "sequenceStatsInput",
    maxSourceBases: "sequenceStatsInput"
  });
  const opened = await openCleanDnaRnaFastaSource(input, sourceOptions, context);
  const analyzedRecords = [];
  const warnings = [];
  let current = null;
  let charactersRemoved = 0;

  for await (const event of opened.events()) {
    if (event.type === "record-start") {
      current = { title: event.title, stats: makeEmptyTotal(), removedCount: 0 };
    } else if (event.type === "sequence-chunk" && current) {
      addStats(current.stats, getDnaRnaStats(event.text));
    } else if (event.type === "record-end" && current) {
      current.removedCount = event.removedCount;
      charactersRemoved += event.removedCount;
      const stats = finalizeStats(current.stats);
      if (event.removedCount > 0) {
        warnings.push(`${current.title}: removed ${event.removedCount} invalid or gap character(s).`);
      }
      if (stats.length === 0) {
        warnings.push(`${current.title}: no DNA/RNA sequence characters were found.`);
      }
      if (stats.gcPercent === null) {
        warnings.push(`${current.title}: GC percent is undefined because there are no unambiguous A/C/G/T/U bases.`);
      }
      analyzedRecords.push({ title: current.title, stats });
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
      warnings: [emptyWarning, ...warnings],
      recordsProcessed: 0,
      basesProcessed: 0,
      charactersRemoved
    });
    context.reportProgress?.({ phase: "finished", progress: 1 });
    return result;
  }

  const result = makeSequenceStatsResult(analyzedRecords, {
    outputFormat: options.outputFormat,
    warnings,
    recordsProcessed: analyzedRecords.length,
    charactersRemoved,
    limitOptions: options
  });
  context.reportProgress?.({ phase: "finished", progress: 1 });
  return result;
}
