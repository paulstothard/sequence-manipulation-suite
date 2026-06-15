import { findColumn, parseColumnList, parseDelimitedTable } from "./table.js";
import { studentTCdf } from "./hypothesis-tests.js";
import {
  countMissingOrNonnumeric,
  isStatisticsMissingValue,
  isNumericStatisticsColumn,
  parseStatisticsNumber
} from "./statistics-utils.js";

export const descriptiveStatisticsColumns = [
  { id: "column", label: "Column", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "missing", label: "Missing", type: "number" },
  { id: "sum", label: "Sum", type: "number" },
  { id: "mean", label: "Mean", type: "number" },
  { id: "trim_percent", label: "Trim percent", type: "number" },
  { id: "trimmed_mean", label: "Trimmed mean", type: "number" },
  { id: "mean_ci_95_low", label: "95% CI low", type: "number" },
  { id: "mean_ci_95_high", label: "95% CI high", type: "number" },
  { id: "median", label: "Median", type: "number" },
  { id: "sd", label: "SD", type: "number" },
  { id: "se", label: "SE", type: "number" },
  { id: "skewness", label: "Skewness", type: "number" },
  { id: "excess_kurtosis", label: "Excess kurtosis", type: "number" },
  { id: "cv_percent", label: "CV percent", type: "number" },
  { id: "min", label: "Min", type: "number" },
  { id: "q1", label: "Q1", type: "number" },
  { id: "q3", label: "Q3", type: "number" },
  { id: "max", label: "Max", type: "number" },
  { id: "range", label: "Range", type: "number" },
  { id: "iqr", label: "IQR", type: "number" },
  { id: "mad", label: "MAD", type: "number" },
  { id: "outlier_count_iqr", label: "IQR outliers", type: "number" }
];

function numericValues(rows, columnId) {
  let missing = 0;
  let nonnumeric = 0;
  const values = [];
  for (const row of rows) {
    const text = row[columnId];
    if (isStatisticsMissingValue(text)) {
      missing += 1;
      continue;
    }
    const value = parseStatisticsNumber(text);
    if (value !== null) {
      values.push(value);
    } else {
      nonnumeric += 1;
    }
  }
  values.sort((a, b) => a - b);
  return { values, missing: missing + nonnumeric, nonnumeric };
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function round(value, digits = 6) {
  return value === "" || !Number.isFinite(value) ? "" : Number(value.toFixed(digits));
}

function sampleSd(values, mean) {
  if (values.length < 2) return "";
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function trimmedMean(sorted, trimProportion = 0.1) {
  if (sorted.length === 0) return "";
  const trimCount = Math.floor(sorted.length * trimProportion);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (trimmed.length === 0) return "";
  return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
}

function normalizeTrimPercent(value, warnings) {
  const raw = value === undefined || value === null || value === "" ? 10 : Number(value);
  if (!Number.isFinite(raw)) {
    warnings.push("Trim percent was not numeric; using the default 10% trim from each tail.");
    return 10;
  }
  if (raw < 0) {
    warnings.push("Trim percent was below 0; using 0%.");
    return 0;
  }
  if (raw > 45) {
    warnings.push("Trim percent was above 45; using 45% so at least some values remain after trimming.");
    return 45;
  }
  return raw;
}

function tCriticalTwoSided(confidence, df) {
  if (!Number.isFinite(df) || df <= 0) return "";
  const target = 1 - (1 - confidence) / 2;
  let low = 0;
  let high = 1;
  while (studentTCdf(high, df) < target && high < 1e6) {
    high *= 2;
  }
  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    if (studentTCdf(mid, df) < target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return high;
}

function adjustedSkewness(values, mean) {
  const count = values.length;
  if (count < 3) return "";
  const m2 = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
  if (m2 === 0) return "";
  const m3 = values.reduce((sum, value) => sum + (value - mean) ** 3, 0) / count;
  return (Math.sqrt(count * (count - 1)) / (count - 2)) * (m3 / (m2 ** 1.5));
}

function fisherExcessKurtosis(values, mean) {
  const count = values.length;
  if (count < 4) return "";
  const m2 = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
  if (m2 === 0) return "";
  const m4 = values.reduce((sum, value) => sum + (value - mean) ** 4, 0) / count;
  const biasedExcess = m4 / (m2 ** 2) - 3;
  return ((count - 1) / ((count - 2) * (count - 3))) * ((count + 1) * biasedExcess + 6);
}

export function summarizeDescriptiveStatistics(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const requestedColumns = parseColumnList(options.numericColumns);
  const columns = requestedColumns.length > 0
    ? requestedColumns.map((name) => findColumn(table.columns, name)).filter(Boolean)
    : table.columns.filter((column) => isNumericStatisticsColumn(table.rows, column.id));
  const warnings = [...table.warnings];
  const trimPercent = normalizeTrimPercent(options.trimPercent, warnings);
  const trimProportion = trimPercent / 100;
  if (requestedColumns.length > 0 && columns.length !== requestedColumns.length) {
    warnings.push("One or more requested numeric columns could not be found.");
  }
  if (columns.length === 0) {
    warnings.push("No numeric columns were available to summarize.");
  }
  const rows = columns.map((column) => {
    const { values, missing, nonnumeric } = numericValues(table.rows, column.id);
    const missingDetail = countMissingOrNonnumeric(table.rows, column.id);
    if (nonnumeric > 0) {
      warnings.push(`${column.label}: treated ${nonnumeric} nonnumeric value(s) as missing for descriptive statistics.`);
    }
    if (missingDetail.missing > 0 && requestedColumns.length === 0 && column.type !== "number") {
      warnings.push(`${column.label}: recognized ${missingDetail.missing} missing value(s) while treating this as a numeric column.`);
    }
    const count = values.length;
    const mean = count > 0 ? values.reduce((sum, value) => sum + value, 0) / count : "";
    const selectedTrimmedMean = trimmedMean(values, trimProportion);
    const total = count > 0 ? values.reduce((sum, value) => sum + value, 0) : "";
    const median = quantile(values, 0.5);
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const iqr = q1 !== "" && q3 !== "" ? q3 - q1 : "";
    const mad = median !== ""
      ? quantile(values.map((value) => Math.abs(value - median)).sort((a, b) => a - b), 0.5)
      : "";
    const min = count > 0 ? values[0] : "";
    const max = count > 0 ? values[count - 1] : "";
    const outlierCount = iqr !== ""
      ? values.filter((value) => value < q1 - 1.5 * iqr || value > q3 + 1.5 * iqr).length
      : "";
    const sd = count > 1 ? sampleSd(values, mean) : "";
    const se = count > 1 ? sd / Math.sqrt(count) : "";
    const meanCiMargin = count > 1 ? tCriticalTwoSided(0.95, count - 1) * se : "";
    const skewness = mean !== "" ? adjustedSkewness(values, mean) : "";
    const excessKurtosis = mean !== "" ? fisherExcessKurtosis(values, mean) : "";
    const cv = count > 1 && mean !== 0 ? (sd / Math.abs(mean)) * 100 : "";
    return {
      column: column.label,
      count,
      missing,
      sum: round(total),
      mean: round(mean),
      trim_percent: round(trimPercent),
      trimmed_mean: round(selectedTrimmedMean),
      mean_ci_95_low: meanCiMargin !== "" ? round(mean - meanCiMargin) : "",
      mean_ci_95_high: meanCiMargin !== "" ? round(mean + meanCiMargin) : "",
      median: round(median),
      sd: round(sd),
      se: round(se),
      skewness: round(skewness),
      excess_kurtosis: round(excessKurtosis),
      cv_percent: round(cv),
      min: round(min),
      q1: round(q1),
      q3: round(q3),
      max: round(max),
      range: count > 0 ? round(max - min) : "",
      iqr: round(iqr),
      mad: round(mad),
      outlier_count_iqr: outlierCount
    };
  });
  return { rows, warnings, sourceColumns: table.columns, sourceRows: table.rows, trimPercent };
}

export function makeDescriptiveStatisticsReport(result) {
  return [
    "Statistical summary",
    `Numeric columns summarized: ${result.rows.length}`,
    `Method: sample standard deviation uses n - 1; SE is SD / sqrt(n); 95% mean confidence intervals use the t distribution; trimmed mean removes floor(n x ${round((result.trimPercent ?? 10) / 100, 4)}) values from each tail; skewness is adjusted Fisher-Pearson sample skewness; excess kurtosis is unbiased Fisher excess kurtosis; CV is SD / abs(mean) * 100; IQR outliers use Q1 - 1.5 x IQR and Q3 + 1.5 x IQR; MAD is the unscaled median absolute deviation from the median.`,
    "",
    ...result.rows.map((row) =>
      `${row.column}: n=${row.count}, mean=${row.mean || "n/a"}, median=${row.median || "n/a"}, SD=${row.sd || "n/a"}, min=${row.min || "n/a"}, max=${row.max || "n/a"}`
    )
  ].join("\n").trimEnd() + "\n";
}

export function statisticsRowsToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}
