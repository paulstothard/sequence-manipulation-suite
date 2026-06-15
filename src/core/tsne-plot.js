import { createBioWasmCli, requireBioWasmRuntime } from "./biowasm-runner.js";
import { axisRenderOptions, plotRowsToTsv, renderScatterSvg } from "./plot-tools.js";
import { isNumericStatisticsColumn, parseStatisticsNumber } from "./statistics-utils.js";
import { findColumn, parseColumnList, parseDelimitedTable } from "./table.js";

export const tsneEmbeddingColumns = [
  { id: "label", label: "Label", type: "string" },
  { id: "group", label: "Group", type: "string" },
  { id: "tsne_1", label: "t-SNE 1", type: "number" },
  { id: "tsne_2", label: "t-SNE 2", type: "number" },
  { id: "iteration", label: "Iteration", type: "number" },
  { id: "kl_divergence", label: "KL divergence", type: "number" }
];

const BIOWASM_BHTSNE_VERSION = "2016.08.22";
const MAX_ITER_MIN = 50;
const MAX_ITER_DEFAULT = 500;
const MAX_ITER_MAX = 2000;
const MAX_ROWS_DEFAULT = 500;
const MAX_ROWS_MAX = 2000;
const MAX_COLUMNS_DEFAULT = 100;
const MAX_COLUMNS_MAX = 500;

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleSd(values, valueMean = mean(values)) {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1));
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function cleanTsvField(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function generatedSeed() {
  const max = 2147483646;
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return (values[0] % max) + 1;
  }
  return Math.floor(Math.random() * max) + 1;
}

function normalizeSeed(value, warnings) {
  const text = String(value ?? "").trim();
  if (text === "") {
    const seed = generatedSeed();
    warnings.push(`Used generated random seed ${seed}; set Random seed for a reproducible t-SNE layout.`);
    return seed;
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) {
    const seed = generatedSeed();
    warnings.push(`Ignored invalid random seed "${text}" and used generated random seed ${seed}.`);
    return seed;
  }
  return Math.max(0, Math.min(2147483646, parsed));
}

function normalizePerplexity(value, rowCount, warnings) {
  const requested = clampNumber(value, 3, 1, 100);
  const max = Math.max(1, Math.floor((rowCount - 1) / 3));
  if (requested > max) {
    warnings.push(`Reduced perplexity from ${requested} to ${max} because Barnes-Hut t-SNE requires about three neighbors per perplexity unit for ${rowCount} rows.`);
    return max;
  }
  return requested;
}

export function prepareTsneInput(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const warnings = [...table.warnings];
  const requested = parseColumnList(options.numericColumns);
  let columns = requested.length > 0
    ? requested.map((name) => findColumn(table.columns, name)).filter(Boolean)
    : table.columns.filter((column) => isNumericStatisticsColumn(table.rows, column.id));
  if (requested.length > 0 && columns.length !== requested.length) {
    warnings.push("One or more requested numeric columns could not be found.");
  }

  const maxNumericColumns = clampInteger(options.maxNumericColumns, MAX_COLUMNS_DEFAULT, 2, MAX_COLUMNS_MAX);
  if (columns.length > maxNumericColumns) {
    warnings.push(`Using the first ${maxNumericColumns.toLocaleString()} selected numeric column(s); increase Maximum numeric columns to include more.`);
    columns = columns.slice(0, maxNumericColumns);
  }

  const labelColumn = findColumn(table.columns, options.labelColumn) ?? table.columns[0] ?? null;
  const groupColumn = findColumn(table.columns, options.groupColumn);
  const scaleColumns = options.scaleColumns !== false;
  const completeRows = [];
  let skipped = 0;
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const row = table.rows[rowIndex];
    const values = columns.map((column) => parseStatisticsNumber(row[column.id]));
    if (values.some((value) => value === null)) {
      skipped += 1;
      continue;
    }
    completeRows.push({
      label: cleanTsvField(row[labelColumn?.id] || `Row ${rowIndex + 1}`),
      group: groupColumn ? cleanTsvField(row[groupColumn.id]) : "Data",
      values
    });
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) with missing or nonnumeric selected t-SNE values.`);
  }

  const maxRows = clampInteger(options.maxRows, MAX_ROWS_DEFAULT, 4, MAX_ROWS_MAX);
  const limitedRows = completeRows.slice(0, maxRows);
  if (completeRows.length > limitedRows.length) {
    warnings.push(`Using the first ${limitedRows.length.toLocaleString()} complete row(s); increase Maximum rows to include more.`);
  }
  if (columns.length < 2 || limitedRows.length < 4) {
    warnings.push("t-SNE requires at least two numeric columns and four complete rows.");
    return { table, columns, rows: [], warnings, sndText: "" };
  }

  const columnValues = columns.map((column, columnIndex) => limitedRows.map((row) => row.values[columnIndex]));
  const means = columnValues.map((values) => mean(values));
  const sds = columnValues.map((values, index) => sampleSd(values, means[index]));
  const usableIndexes = columns.map((column, index) => ({ column, index, sd: sds[index] }))
    .filter((item) => item.sd > 0 || !scaleColumns);
  const dropped = columns.length - usableIndexes.length;
  if (dropped > 0) {
    warnings.push(`Dropped ${dropped} zero-variance numeric column(s) before t-SNE.`);
  }
  const usableColumns = usableIndexes.map((item) => item.column);
  if (usableColumns.length < 2) {
    warnings.push("At least two nonconstant numeric columns are required after filtering.");
    return { table, columns: usableColumns, rows: [], warnings, sndText: "" };
  }

  const preparedRows = limitedRows.map((row) => ({
    label: row.label,
    group: row.group || "Data",
    values: usableIndexes.map((item) => {
      const centered = row.values[item.index] - means[item.index];
      return scaleColumns ? centered / item.sd : centered;
    })
  }));
  const header = ["#sample", ...usableColumns.map((column) => cleanTsvField(column.label))].join("\t");
  const sndText = [
    header,
    ...preparedRows.map((row) => [row.label, ...row.values.map((value) => String(round(value, 12)))].join("\t"))
  ].join("\n") + "\n";
  return { table, columns: usableColumns, rows: preparedRows, warnings, sndText, scaleColumns };
}

function parseStdoutRows(stdout, fallbackRows) {
  const lines = String(stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line, index) => {
    const [label = fallbackRows[index]?.label ?? `Row ${index + 1}`, x = "", y = ""] = line.split("\t");
    return {
      label,
      x: Number.parseFloat(x),
      y: Number.parseFloat(y)
    };
  });
}

function latestResultMessage(messages) {
  return [...messages].reverse().find((message) => message && Number.isFinite(message.iter) && message.data?.length);
}

export async function runTsneEmbedding(input, options = {}, context = {}) {
  requireBioWasmRuntime("t-SNE Plot bhtsne embedding");
  const prepared = prepareTsneInput(input, options);
  const warnings = [...prepared.warnings];
  if (!prepared.sndText) {
    return {
      ...prepared,
      embeddingRows: [],
      report: makeTsneReport({ ...prepared, embeddingRows: [], warnings }),
      svg: renderScatterSvg([], { title: options.title || "t-SNE plot" }),
      runOptions: {}
    };
  }

  const seed = normalizeSeed(options.seed, warnings);
  const maxIterations = clampInteger(options.maxIterations, MAX_ITER_DEFAULT, MAX_ITER_MIN, MAX_ITER_MAX);
  const perplexity = normalizePerplexity(options.perplexity, prepared.rows.length, warnings);
  const theta = clampNumber(options.theta, 0.5, 0, 1);
  const reportEvery = Math.min(50, Math.max(1, maxIterations));
  const messages = [];
  const cli = await createBioWasmCli({
    tool: "bhtsne",
    program: "bhtsne",
    version: BIOWASM_BHTSNE_VERSION,
    assetPath: "../vendor/biowasm/bhtsne/2016.08.22",
    callback: (value) => {
      messages.push(value);
      if (Number.isFinite(value?.iter)) {
        context.reportProgress?.({
          phase: "fitting-tsne",
          progress: Math.min(0.95, 0.2 + (value.iter / Math.max(1, maxIterations)) * 0.75),
          message: `t-SNE iteration ${value.iter}`
        });
      }
    }
  });

  context.throwIfCancelled?.();
  const [inputPath] = await cli.mount([{
    name: "input.snd",
    data: new Blob([prepared.sndText], { type: "text/tab-separated-values;charset=utf-8" })
  }]);
  const exec = await cli.exec("bhtsne", [
    "-d", "2",
    "-e", String(theta),
    "-p", String(perplexity),
    "-s", String(seed),
    "-n", String(maxIterations),
    "-r", String(reportEvery),
    inputPath
  ]);
  context.throwIfCancelled?.();

  const latest = latestResultMessage(messages);
  const stdoutRows = parseStdoutRows(exec.stdout, prepared.rows);
  const embeddingRows = prepared.rows.map((row, index) => {
    const callbackX = latest?.data?.[index * 2];
    const callbackY = latest?.data?.[index * 2 + 1];
    const stdout = stdoutRows[index];
    return {
      label: row.label,
      group: row.group,
      tsne_1: round(Number.isFinite(callbackX) ? callbackX : stdout?.x),
      tsne_2: round(Number.isFinite(callbackY) ? callbackY : stdout?.y),
      iteration: latest?.iter ?? "",
      kl_divergence: Number.isFinite(latest?.error) ? round(latest.error) : ""
    };
  }).filter((row) => row.tsne_1 !== "" && row.tsne_2 !== "");

  if (embeddingRows.length !== prepared.rows.length) {
    warnings.push("BioWasm bhtsne returned fewer embedded rows than expected.");
  }
  if (exec.stderr && /Perplexity too large|No data available|Usage:/i.test(exec.stderr)) {
    warnings.push(cleanTsvField(exec.stderr));
  }

  const pointLimit = clampInteger(options.maxPointsDrawn, 5000, 100, 50000);
  const svgRows = embeddingRows.slice(0, pointLimit).map((row) => ({
    label: row.label,
    group: row.group,
    x: Number(row.tsne_1),
    y: Number(row.tsne_2)
  }));
  if (embeddingRows.length > svgRows.length) {
    warnings.push(`t-SNE plot draws the first ${svgRows.length.toLocaleString()} point(s); embedding table contains all ${embeddingRows.length.toLocaleString()} rows.`);
  }

  const runOptions = { seed, maxIterations, perplexity, theta, version: BIOWASM_BHTSNE_VERSION };
  const report = makeTsneReport({
    ...prepared,
    warnings,
    embeddingRows,
    runOptions
  });
  const svg = renderScatterSvg(svgRows, {
    title: options.title || "t-SNE plot",
    xLabel: "t-SNE 1",
    yLabel: "t-SNE 2",
    showLegend: prepared.rows.some((row) => row.group !== "Data"),
    ...axisRenderOptions(options, warnings)
  });
  return { ...prepared, warnings, embeddingRows, report, svg, runOptions, stderr: exec.stderr };
}

export function tsneEmbeddingToTsv(rows) {
  return plotRowsToTsv(tsneEmbeddingColumns, rows);
}

export function makeTsneReport(result) {
  const runOptions = result.runOptions ?? {};
  return [
    "t-SNE plot",
    `Rows used: ${result.embeddingRows?.length ?? 0}`,
    `Variables used: ${result.columns?.map((column) => column.label).join(", ") || "none"}`,
    `Column scaling: ${result.scaleColumns === false ? "centered only" : "centered and scaled to sample standard deviation"}`,
    `Perplexity: ${runOptions.perplexity ?? "n/a"}`,
    `Approximation theta: ${runOptions.theta ?? "n/a"}`,
    `Iterations: ${runOptions.maxIterations ?? "n/a"}`,
    `Random seed: ${runOptions.seed ?? "n/a"}`,
    `Engine: bhtsne ${runOptions.version ?? BIOWASM_BHTSNE_VERSION} via vendored BioWasm/Aioli`,
    "Method note: rows are embedded with Barnes-Hut t-SNE after complete-row filtering and optional column scaling.",
    "References: van der Maaten and Hinton 2008; van der Maaten 2014; BioWasm/Aioli browser runtime."
  ].join("\n").trimEnd() + "\n";
}
