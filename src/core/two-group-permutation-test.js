import { resolveRandom, randomInteger } from "./random-sequence.js";
import { findColumn, parseDelimitedTable } from "./table.js";
import { escapeXml } from "./plot-renderer.js";
import { isNumericStatisticsColumn, parseStatisticsNumber } from "./statistics-utils.js";

export const permutationTestResultColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "group_column", label: "Group column", type: "string" },
  { id: "group_a", label: "Group A", type: "string" },
  { id: "group_b", label: "Group B", type: "string" },
  { id: "n_a", label: "n A", type: "number" },
  { id: "n_b", label: "n B", type: "number" },
  { id: "statistic_name", label: "Statistic", type: "string" },
  { id: "observed_statistic", label: "Observed statistic", type: "number" },
  { id: "permutations", label: "Permutations", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "method", label: "Method", type: "string" },
  { id: "seed", label: "Seed", type: "string" },
  { id: "interpretation", label: "Interpretation", type: "string" }
];

export const permutationNullDistributionColumns = [
  { id: "permutation", label: "Permutation", type: "number" },
  { id: "statistic", label: "Statistic", type: "number" }
];

function asNumber(value) {
  return parseStatisticsNumber(value);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function statistic(valuesA, valuesB, statisticName) {
  if (statisticName === "median-difference") {
    return median(valuesA) - median(valuesB);
  }
  return mean(valuesA) - mean(valuesB);
}

function chooseGroups(groups, options = {}) {
  const names = [...groups.keys()];
  const groupA = options.groupA && groups.has(options.groupA) ? options.groupA : names[0];
  const groupB = options.groupB && groups.has(options.groupB) ? options.groupB : names.find((name) => name !== groupA);
  return { groupA, groupB };
}

function numericGroups(table, valueColumn, groupColumn) {
  const groups = new Map();
  let skipped = 0;
  for (const row of table.rows) {
    const group = String(row[groupColumn.id] ?? "").trim();
    const value = asNumber(row[valueColumn.id]);
    if (!group || value === null) {
      skipped += 1;
      continue;
    }
    groups.set(group, [...(groups.get(group) ?? []), value]);
  }
  return { groups, skipped };
}

function combinationCount(n, k) {
  if (k < 0 || k > n) return 0;
  const effective = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= effective; index += 1) {
    result = (result * (n - effective + index)) / index;
    if (result > Number.MAX_SAFE_INTEGER) return Number.POSITIVE_INFINITY;
  }
  return Math.round(result);
}

function* combinations(n, k, start = 0, prefix = []) {
  if (prefix.length === k) {
    yield prefix;
    return;
  }
  const remaining = k - prefix.length;
  for (let index = start; index <= n - remaining; index += 1) {
    yield* combinations(n, k, index + 1, [...prefix, index]);
  }
}

function splitByIndexes(values, indexes, groupSize) {
  const selected = new Set(indexes);
  const left = [];
  const right = [];
  for (let index = 0; index < values.length; index += 1) {
    (selected.has(index) && left.length < groupSize ? left : right).push(values[index]);
  }
  return [left, right];
}

function shuffledIndexes(count, selectedCount, random) {
  const indexes = Array.from({ length: count }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swap = randomInteger(random, index + 1);
    [indexes[index], indexes[swap]] = [indexes[swap], indexes[index]];
  }
  return indexes.slice(0, selectedCount);
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function niceCountStep(maxCount, targetTickCount = 4) {
  const roughStep = Math.max(1, maxCount / targetTickCount);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

function countAxis(maxCount) {
  const upper = Math.max(1, Math.ceil(maxCount));
  const step = niceCountStep(upper);
  const niceUpper = Math.ceil(upper / step) * step;
  const ticks = [];
  for (let value = 0; value <= niceUpper; value += step) {
    ticks.push(value);
  }
  return { upper: niceUpper, ticks };
}

function makeHistogram(values, observed, title = "Permutation null distribution") {
  const width = 760;
  const height = 450;
  const margin = { top: 94, right: 34, bottom: 66, left: 78 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}"><text x="24" y="40" font-size="18" font-family="Arial, sans-serif">${escapeXml(title)}</text><text x="24" y="80" font-size="13" font-family="Arial, sans-serif">No permutation values were available.</text></svg>`;
  }
  let rawMin = Math.min(...finite, observed);
  let rawMax = Math.max(...finite, observed);
  let min = rawMin;
  let max = rawMax;
  if (min === max) {
    min -= 0.5;
    max += 0.5;
    rawMin = min;
    rawMax = max;
  }
  const domainPadding = (max - min) * 0.05;
  min -= domainPadding;
  max += domainPadding;
  const binCount = Math.max(8, Math.min(40, Math.ceil(Math.sqrt(finite.length))));
  const binWidth = (max - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: min + index * binWidth,
    end: min + (index + 1) * binWidth,
    count: 0
  }));
  for (const value of finite) {
    const binIndex = Math.max(0, Math.min(binCount - 1, Math.floor((value - min) / binWidth)));
    bins[binIndex].count += 1;
  }
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));
  const yAxis = countAxis(maxCount);
  const x = (value) => margin.left + ((value - min) / (max - min)) * plotWidth;
  const y = (count) => margin.top + plotHeight - (count / yAxis.upper) * plotHeight;
  const observedX = x(observed);
  const bars = bins.map((bin) => {
    const x1 = x(bin.start);
    const x2 = x(bin.end);
    const barY = y(bin.count);
    return `<rect x="${x1.toFixed(2)}" y="${barY.toFixed(2)}" width="${Math.max(1, x2 - x1 - 1).toFixed(2)}" height="${(margin.top + plotHeight - barY).toFixed(2)}" fill="#93c5fd"/>`;
  }).join("");
  const ticks = Array.from({ length: 5 }, (_, index) => rawMin + ((rawMax - rawMin) * index) / 4);
  const tickMarks = ticks.map((tick) => {
    const tickX = x(tick);
    return `<line x1="${tickX.toFixed(2)}" y1="${margin.top + plotHeight}" x2="${tickX.toFixed(2)}" y2="${margin.top + plotHeight + 6}" stroke="#475569"/><text x="${tickX.toFixed(2)}" y="${margin.top + plotHeight + 24}" text-anchor="middle" font-size="11" font-family="Arial, sans-serif" fill="#334155">${escapeXml(round(tick, 3))}</text>`;
  }).join("");
  const yTickMarks = yAxis.ticks.map((tick) => {
    const tickY = y(tick);
    return `<line x1="${margin.left}" y1="${tickY.toFixed(2)}" x2="${margin.left + plotWidth}" y2="${tickY.toFixed(2)}" stroke="#e2e8f0"/><line x1="${margin.left - 6}" y1="${tickY.toFixed(2)}" x2="${margin.left}" y2="${tickY.toFixed(2)}" stroke="#475569"/><text data-y-axis-tick="true" x="${margin.left - 12}" y="${(tickY + 4).toFixed(2)}" text-anchor="end" font-size="11" font-family="Arial, sans-serif" fill="#334155">${tick}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="24" y="32" font-size="18" font-family="Arial, sans-serif" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>
  <text x="24" y="52" font-size="12" font-family="Arial, sans-serif" fill="#475569">Bars show permuted statistics; the red marker shows the observed statistic.</text>
  ${yTickMarks}
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#475569"/>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#475569"/>
  ${bars}
  <line data-observed-statistic-marker="true" x1="${observedX.toFixed(2)}" y1="${margin.top}" x2="${observedX.toFixed(2)}" y2="${margin.top + plotHeight}" stroke="#dc2626" stroke-width="2"/>
  <text x="${observedX.toFixed(2)}" y="${margin.top - 8}" text-anchor="middle" font-size="11" font-family="Arial, sans-serif" fill="#dc2626">observed</text>
  ${tickMarks}
  <text x="${margin.left + plotWidth / 2}" y="${height - 16}" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="#334155">Permuted statistic</text>
  <text x="18" y="${margin.top + plotHeight / 2}" transform="rotate(-90 18 ${margin.top + plotHeight / 2})" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="#334155">Count</text>
</svg>`;
}

function makeReport(result) {
  if (!result.resultRow) {
    return [
      "Two-group permutation test",
      "No permutation test result was calculated.",
      ...result.warnings.map((warning) => `Warning: ${warning}`)
    ].join("\n") + "\n";
  }
  const row = result.resultRow;
  return [
    "Two-group permutation test",
    `Value column: ${row.value_column}`,
    `Group column: ${row.group_column}`,
    `Groups: ${row.group_a} (n=${row.n_a}) vs ${row.group_b} (n=${row.n_b})`,
    `Statistic: ${row.statistic_name}`,
    `Observed statistic: ${row.observed_statistic}`,
    `Permutations: ${row.permutations}`,
    `P value: ${row.p_value}`,
    `Method: ${row.method}`,
    `Seed: ${row.seed}`,
    `Interpretation: ${row.interpretation}`,
    ...result.warnings.map((warning) => `Warning: ${warning}`)
  ].join("\n") + "\n";
}

export function runTwoGroupPermutationTest(input, options = {}, context = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "value") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "group") ??
    findColumn(table.columns, "treatment") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number");
  if (!valueColumn || !groupColumn) {
    return { table, warnings: [...warnings, "A numeric value column and a group column are required."], resultRows: [], nullRows: [], report: "", svg: "" };
  }
  const grouped = numericGroups(table, valueColumn, groupColumn);
  if (grouped.skipped > 0) {
    warnings.push(`Skipped ${grouped.skipped} row(s) with missing group labels or nonnumeric values.`);
  }
  const { groupA, groupB } = chooseGroups(grouped.groups, options);
  const valuesA = grouped.groups.get(groupA) ?? [];
  const valuesB = grouped.groups.get(groupB) ?? [];
  if (valuesA.length < 1 || valuesB.length < 1) {
    return { table, warnings: [...warnings, "Two groups with at least one numeric observation each are required."], resultRows: [], nullRows: [], report: "", svg: "" };
  }
  const statisticName = options.statistic === "median-difference" ? "median difference" : "mean difference";
  const statisticId = options.statistic === "median-difference" ? "median-difference" : "mean-difference";
  const observed = statistic(valuesA, valuesB, statisticId);
  const combined = [...valuesA, ...valuesB];
  const groupSize = valuesA.length;
  const possible = combinationCount(combined.length, groupSize);
  const maxExact = Math.max(1, Number.parseInt(options.maxExactPermutations ?? 10000, 10) || 10000);
  const requestedIterations = Math.max(1, Math.min(100000, Number.parseInt(options.iterations ?? 5000, 10) || 5000));
  const useExact = possible <= maxExact;
  const { seed, random } = resolveRandom(options);
  const nullValues = [];
  if (useExact) {
    let index = 0;
    for (const selected of combinations(combined.length, groupSize)) {
      const [left, right] = splitByIndexes(combined, selected, groupSize);
      nullValues.push(statistic(left, right, statisticId));
      index += 1;
      if ((index & 255) === 0) {
        context.throwIfCancelled?.();
      }
    }
  } else {
    for (let index = 0; index < requestedIterations; index += 1) {
      const selected = shuffledIndexes(combined.length, groupSize, random);
      const [left, right] = splitByIndexes(combined, selected, groupSize);
      nullValues.push(statistic(left, right, statisticId));
      if ((index & 511) === 0) {
        context.throwIfCancelled?.();
      }
    }
  }
  const extreme = nullValues.filter((value) => Math.abs(value) >= Math.abs(observed) - 1e-12).length;
  const pValue = useExact ? extreme / nullValues.length : (extreme + 1) / (nullValues.length + 1);
  const method = useExact ? "exact enumeration" : "seeded random permutation";
  const resultRow = {
    test: "Two-group permutation test",
    value_column: valueColumn.label,
    group_column: groupColumn.label,
    group_a: groupA,
    group_b: groupB,
    n_a: valuesA.length,
    n_b: valuesB.length,
    statistic_name: statisticName,
    observed_statistic: round(observed),
    permutations: nullValues.length,
    p_value: round(pValue),
    method,
    seed: useExact ? "" : seed,
    interpretation: pValue < 0.05
      ? "The permutation p value is below 0.05 for the selected groups."
      : "The permutation p value is not below 0.05 for the selected groups."
  };
  const nullRows = nullValues.map((value, index) => ({
    permutation: index + 1,
    statistic: round(value)
  }));
  const result = {
    table,
    warnings,
    resultRow,
    resultRows: [resultRow],
    nullRows,
    report: "",
    svg: makeHistogram(nullValues, observed)
  };
  result.report = makeReport(result);
  return result;
}

export function rowsToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column.id] ?? "").replaceAll("\t", " ")).join("\t"))
  ].join("\n") + "\n";
}
