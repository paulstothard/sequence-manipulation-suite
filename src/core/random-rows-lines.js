import { parseDelimitedRows, parseDelimitedTable } from "./table.js";
import { resolveRandom, randomInteger } from "./random-sequence.js";

export const randomRowsLinesColumns = [
  { id: "sample_order", label: "Sample order", type: "number" },
  { id: "source_index", label: "Source index", type: "number" },
  { id: "source_label", label: "Source label", type: "string" },
  { id: "sampled_text", label: "Sampled text", type: "string" }
];

function makeWarning(message) {
  return message;
}

function delimiterValue(id) {
  if (id === "comma") return ",";
  if (id === "semicolon") return ";";
  if (id === "pipe") return "|";
  return "\t";
}

function normalizeLineInput(input) {
  return String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
}

function checkCancelled(context, counter = 0, interval = 2048) {
  if (counter % interval === 0) {
    context?.throwIfCancelled?.();
  }
}

function sampleIndexes(count, sampleSize, withReplacement, random, context) {
  if (count <= 0) {
    return [];
  }
  const requestedSize = Math.max(0, Number.parseInt(sampleSize, 10) || 0);
  const size = withReplacement ? requestedSize : Math.min(requestedSize, count);
  const indexes = [];
  if (withReplacement) {
    for (let index = 0; index < size; index += 1) {
      checkCancelled(context, index);
      indexes.push(randomInteger(random, count));
    }
    return indexes;
  }
  const pool = Array.from({ length: count }, (_, index) => index);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    checkCancelled(context, pool.length - index);
    const swap = randomInteger(random, index + 1);
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, size);
}

function tableToDelimited(columns, rows, delimiter) {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    if (text.includes(delimiter) || text.includes("\n") || text.includes('"')) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };
  return [
    columns.map((column) => escapeCell(column.label)).join(delimiter),
    ...rows.map((row) => columns.map((column) => escapeCell(row[column.id])).join(delimiter))
  ].join("\n");
}

export function sampleRandomRowsOrLines(input, options = {}, context = {}) {
  const mode = options.mode === "table" ? "table" : "lines";
  const sampleSize = Math.max(0, Number.parseInt(options.sampleSize, 10) || 0);
  const withReplacement = options.withReplacement === true;
  const includeHeader = options.includeHeader !== false;
  const { seed, random } = resolveRandom(options);
  const warnings = [];

  if (mode === "table") {
    const table = parseDelimitedTable(input, {
      delimiter: options.delimiter ?? "auto",
      hasHeader: options.hasHeader !== false
    });
    const indexes = sampleIndexes(table.rows.length, sampleSize, withReplacement, random, context);
    const sampledRows = indexes.map((index) => table.rows[index]).filter(Boolean);
    if (table.rows.length === 0) {
      warnings.push(makeWarning("No table rows were available to sample."));
    }
    if (!withReplacement && sampleSize > table.rows.length) {
      warnings.push(makeWarning(`Requested ${sampleSize} rows but only ${table.rows.length} data rows were available.`));
    }
    return {
      seed,
      mode,
      requestedSize: sampleSize,
      availableItems: table.rows.length,
      withReplacement,
      headerKept: options.hasHeader !== false,
      columns: table.columns,
      sampledRows,
      rows: indexes.map((sourceIndex, order) => ({
        sample_order: order + 1,
        source_index: sourceIndex + 1,
        source_label: `row ${sourceIndex + 1}`,
        sampled_text: table.columns.map((column) => table.rows[sourceIndex]?.[column.id] ?? "").join("\t")
      })),
      outputText: tableToDelimited(table.columns, sampledRows, delimiterValue(table.delimiterId)),
      warnings: [...table.warnings, ...warnings]
    };
  }

  const lines = normalizeLineInput(input);
  const header = includeHeader ? lines[0] ?? "" : "";
  const body = includeHeader ? lines.slice(1) : lines;
  const candidates = body.map((line, index) => ({ line, sourceIndex: includeHeader ? index + 2 : index + 1 }))
    .filter((item) => options.keepBlankLines === true || item.line.length > 0);
  const indexes = sampleIndexes(candidates.length, sampleSize, withReplacement, random, context);
  const sampledItems = indexes.map((index) => candidates[index]).filter(Boolean);
  if (candidates.length === 0) {
    warnings.push(makeWarning("No lines were available to sample."));
  }
  if (!withReplacement && sampleSize > candidates.length) {
    warnings.push(makeWarning(`Requested ${sampleSize} lines but only ${candidates.length} lines were available.`));
  }
  const outputLines = includeHeader && header ? [header, ...sampledItems.map((item) => item.line)] : sampledItems.map((item) => item.line);
  return {
    seed,
    mode,
    requestedSize: sampleSize,
    availableItems: candidates.length,
    withReplacement,
    headerKept: includeHeader,
    columns: randomRowsLinesColumns,
    sampledRows: sampledItems,
    rows: sampledItems.map((item, order) => ({
      sample_order: order + 1,
      source_index: item.sourceIndex,
      source_label: `line ${item.sourceIndex}`,
      sampled_text: item.line
    })),
    outputText: outputLines.join("\n"),
    warnings
  };
}

export function makeRandomRowsLinesReport(result) {
  return [
    "Random rows / lines",
    `Mode: ${result.mode}`,
    `Random seed: ${result.seed}`,
    `Available items: ${result.availableItems}`,
    `Requested sample size: ${result.requestedSize}`,
    `Items sampled: ${result.rows.length}`,
    `Sample with replacement: ${result.withReplacement ? "yes" : "no"}`,
    `Header preserved: ${result.headerKept ? "yes" : "no"}`,
    ...result.warnings.map((warning) => `Warning: ${warning}`)
  ].join("\n") + "\n";
}

export function makeRandomRowsLinesTsv(rows) {
  return [
    randomRowsLinesColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => randomRowsLinesColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}
