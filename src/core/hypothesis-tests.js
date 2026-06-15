import { findColumn, parseDelimitedTable } from "./table.js";
import { isNumericStatisticsColumn, parseStatisticsNumber } from "./statistics-utils.js";

export const hypothesisTestColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "group_column", label: "Group column", type: "string" },
  { id: "group_a", label: "Group A", type: "string" },
  { id: "group_b", label: "Group B", type: "string" },
  { id: "n_a", label: "n A", type: "number" },
  { id: "n_b", label: "n B", type: "number" },
  { id: "mean_a", label: "Mean A", type: "number" },
  { id: "mean_b", label: "Mean B", type: "number" },
  { id: "difference", label: "Mean difference", type: "number" },
  { id: "statistic", label: "t statistic", type: "number" },
  { id: "df", label: "df", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "variance_ratio", label: "Variance ratio", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const twoSampleTTestColumns = hypothesisTestColumns;

export const pairwiseTTestPostHocColumns = [
  { id: "comparison", label: "Comparison", type: "string" },
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "group_column", label: "Group column", type: "string" },
  { id: "group_a", label: "Group A", type: "string" },
  { id: "group_b", label: "Group B", type: "string" },
  { id: "n_a", label: "n A", type: "number" },
  { id: "n_b", label: "n B", type: "number" },
  { id: "mean_a", label: "Mean A", type: "number" },
  { id: "mean_b", label: "Mean B", type: "number" },
  { id: "difference", label: "Mean difference", type: "number" },
  { id: "statistic", label: "t statistic", type: "number" },
  { id: "df", label: "df", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "p_adjusted", label: "Adjusted p value", type: "number" },
  { id: "adjustment", label: "Adjustment", type: "string" },
  { id: "alpha", label: "Alpha", type: "number" },
  { id: "variance_ratio", label: "Variance ratio", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const oneWayAnovaColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "group_column", label: "Group column", type: "string" },
  { id: "group_count", label: "Groups", type: "number" },
  { id: "observation_count", label: "Observations", type: "number" },
  { id: "df_between", label: "df between", type: "number" },
  { id: "df_within", label: "df within", type: "number" },
  { id: "ms_between", label: "MS between", type: "number" },
  { id: "ms_within", label: "MS within", type: "number" },
  { id: "statistic", label: "F statistic", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "variance_ratio", label: "Variance ratio", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const kruskalWallisTestColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "group_column", label: "Group column", type: "string" },
  { id: "group_count", label: "Groups", type: "number" },
  { id: "observation_count", label: "Observations", type: "number" },
  { id: "statistic", label: "H statistic", type: "number" },
  { id: "df", label: "df", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "tie_correction", label: "Tie correction", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const pairedTTestColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "first_column", label: "First column", type: "string" },
  { id: "second_column", label: "Second column", type: "string" },
  { id: "pair_id_column", label: "Pair ID column", type: "string" },
  { id: "pair_count", label: "Pairs", type: "number" },
  { id: "mean_first", label: "Mean first", type: "number" },
  { id: "mean_second", label: "Mean second", type: "number" },
  { id: "mean_difference", label: "Mean difference", type: "number" },
  { id: "sd_difference", label: "SD difference", type: "number" },
  { id: "se_difference", label: "SE difference", type: "number" },
  { id: "statistic", label: "t statistic", type: "number" },
  { id: "df", label: "df", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const chiSquareTestColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "row_variable", label: "Row variable", type: "string" },
  { id: "column_variable", label: "Column variable", type: "string" },
  { id: "row_count", label: "Rows", type: "number" },
  { id: "column_count", label: "Columns", type: "number" },
  { id: "observation_count", label: "Total count", type: "number" },
  { id: "statistic", label: "Chi-square statistic", type: "number" },
  { id: "df", label: "df", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "min_expected", label: "Minimum expected", type: "number" },
  { id: "cells_expected_lt_5", label: "Cells expected < 5", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const chiSquareExpectedCountColumns = [
  { id: "row_category", label: "Row category", type: "string" },
  { id: "column_category", label: "Column category", type: "string" },
  { id: "observed", label: "Observed", type: "number" },
  { id: "expected", label: "Expected", type: "number" },
  { id: "contribution", label: "Chi-square contribution", type: "number" }
];

export const fisherExactTestColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "row_variable", label: "Row variable", type: "string" },
  { id: "column_variable", label: "Column variable", type: "string" },
  { id: "row_a", label: "Row A", type: "string" },
  { id: "row_b", label: "Row B", type: "string" },
  { id: "column_a", label: "Column A", type: "string" },
  { id: "column_b", label: "Column B", type: "string" },
  { id: "a", label: "Cell a", type: "number" },
  { id: "b", label: "Cell b", type: "number" },
  { id: "c", label: "Cell c", type: "number" },
  { id: "d", label: "Cell d", type: "number" },
  { id: "odds_ratio", label: "Odds ratio", type: "string" },
  { id: "alternative", label: "Alternative", type: "string" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const mannWhitneyUTestColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "group_column", label: "Group column", type: "string" },
  { id: "group_a", label: "Group A", type: "string" },
  { id: "group_b", label: "Group B", type: "string" },
  { id: "n_a", label: "n A", type: "number" },
  { id: "n_b", label: "n B", type: "number" },
  { id: "u_statistic", label: "U statistic", type: "number" },
  { id: "u_a", label: "U A", type: "number" },
  { id: "u_b", label: "U B", type: "number" },
  { id: "z", label: "z", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "alternative", label: "Alternative", type: "string" },
  { id: "tie_correction", label: "Tie correction", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const wilcoxonSignedRankTestColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "first_column", label: "First column", type: "string" },
  { id: "second_column", label: "Second column", type: "string" },
  { id: "pair_id_column", label: "Pair ID column", type: "string" },
  { id: "pair_count", label: "Pairs", type: "number" },
  { id: "nonzero_pair_count", label: "Nonzero pairs", type: "number" },
  { id: "positive_rank_sum", label: "Positive rank sum", type: "number" },
  { id: "negative_rank_sum", label: "Negative rank sum", type: "number" },
  { id: "statistic", label: "Statistic", type: "number" },
  { id: "z", label: "z", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "alternative", label: "Alternative", type: "string" },
  { id: "zero_difference_count", label: "Zero differences", type: "number" },
  { id: "tie_correction", label: "Tie correction", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const twoWayAnovaColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "factor_a_column", label: "Factor A column", type: "string" },
  { id: "factor_b_column", label: "Factor B column", type: "string" },
  { id: "source", label: "Source", type: "string" },
  { id: "levels", label: "Levels", type: "string" },
  { id: "df", label: "df", type: "number" },
  { id: "ss", label: "SS", type: "number" },
  { id: "ms", label: "MS", type: "number" },
  { id: "statistic", label: "F statistic", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const repeatedMeasuresAnovaColumns = [
  { id: "test", label: "Test", type: "string" },
  { id: "value_column", label: "Value column", type: "string" },
  { id: "subject_column", label: "Subject column", type: "string" },
  { id: "condition_column", label: "Condition column", type: "string" },
  { id: "subject_count", label: "Subjects", type: "number" },
  { id: "condition_count", label: "Conditions", type: "number" },
  { id: "complete_observation_count", label: "Complete observations", type: "number" },
  { id: "source", label: "Source", type: "string" },
  { id: "df", label: "df", type: "number" },
  { id: "ss", label: "SS", type: "number" },
  { id: "ms", label: "MS", type: "number" },
  { id: "statistic", label: "F statistic", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

function logGamma(z) {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  let x = 0.99999999999980993;
  const value = z - 1;
  for (let index = 0; index < coefficients.length; index += 1) {
    x += coefficients[index] / (value + index + 1);
  }
  const t = value + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (value + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a, b, x) {
  const maxIterations = 200;
  const epsilon = 3e-14;
  const fpMin = 1e-300;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpMin) d = fpMin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < epsilon) break;
  }
  return h;
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

export function studentTCdf(t, df) {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return Number.NaN;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

export function twoTailedPValue(t, df) {
  const tail = 1 - studentTCdf(Math.abs(t), df);
  return Math.min(1, Math.max(0, 2 * tail));
}

export function fCdf(value, df1, df2) {
  if (!Number.isFinite(value) || !Number.isFinite(df1) || !Number.isFinite(df2) || value < 0 || df1 <= 0 || df2 <= 0) {
    return Number.NaN;
  }
  const x = (df1 * value) / (df1 * value + df2);
  return regularizedIncompleteBeta(x, df1 / 2, df2 / 2);
}

function regularizedGammaP(a, x) {
  if (!Number.isFinite(a) || !Number.isFinite(x) || a <= 0 || x < 0) return Number.NaN;
  if (x === 0) return 0;
  if (x >= a + 1) return 1 - regularizedGammaQ(a, x);
  let sum = 1 / a;
  let term = sum;
  for (let n = 1; n <= 200; n += 1) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 3e-14) {
      break;
    }
  }
  return Math.min(1, Math.max(0, sum * Math.exp(-x + a * Math.log(x) - logGamma(a))));
}

function regularizedGammaQ(a, x) {
  if (!Number.isFinite(a) || !Number.isFinite(x) || a <= 0 || x < 0) return Number.NaN;
  if (x === 0) return 1;
  if (x < a + 1) return 1 - regularizedGammaP(a, x);
  const fpMin = 1e-300;
  let b = x + 1 - a;
  let c = 1 / fpMin;
  let d = 1 / Math.max(b, fpMin);
  let h = d;
  for (let i = 1; i <= 200; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpMin) d = fpMin;
    c = b + an / c;
    if (Math.abs(c) < fpMin) c = fpMin;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 3e-14) {
      break;
    }
  }
  return Math.min(1, Math.max(0, Math.exp(-x + a * Math.log(x) - logGamma(a)) * h));
}

export function chiSquareRightTailPValue(statistic, df) {
  if (!Number.isFinite(statistic) || !Number.isFinite(df) || statistic < 0 || df <= 0) return Number.NaN;
  return regularizedGammaQ(df / 2, statistic / 2);
}

function fRightTailPValue(value, df1, df2) {
  return Math.min(1, Math.max(0, 1 - fCdf(value, df1, df2)));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values, valueMean = mean(values)) {
  if (values.length < 2) return Number.NaN;
  return values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1);
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function complementaryErrorFunction(value) {
  if (!Number.isFinite(value)) return Number.NaN;
  if (value < 0) return 2 - complementaryErrorFunction(-value);
  const coefficients = [
    -1.3026537197817094,
    0.6419697923564903,
    0.019476473204185836,
    -0.00956151478680863,
    -0.000946595344482036,
    0.000366839497852761,
    0.000042523324806907,
    -0.000020278578112534,
    -0.000001624290004647,
    0.00000130365583558,
    0.000000015626441722,
    -0.000000085238095915,
    0.000000006529054439,
    0.000000005059343495,
    -0.000000000991364156,
    -0.000000000227365122,
    0.000000000096467911,
    0.000000000002394038,
    -0.000000000006886027,
    0.000000000000894487,
    0.000000000000313092,
    -0.000000000000112708,
    0.000000000000000381,
    0.000000000000007106,
    -0.000000000000001523,
    -0.000000000000000094,
    0.000000000000000121,
    -0.000000000000000028
  ];
  const t = 2 / (2 + value);
  const y = 4 * t - 2;
  let d = 0;
  let dd = 0;
  for (let index = coefficients.length - 1; index > 0; index -= 1) {
    const previous = d;
    d = y * d - dd + coefficients[index];
    dd = previous;
  }
  return t * Math.exp(-value * value + 0.5 * (coefficients[0] + y * d) - dd);
}

function normalCdf(value) {
  if (!Number.isFinite(value)) return Number.NaN;
  return 0.5 * complementaryErrorFunction(-value / Math.SQRT2);
}

function pValueFromNormalZ(z, alternative) {
  const cdf = normalCdf(z);
  if (!Number.isFinite(cdf)) return Number.NaN;
  if (alternative === "less") return Math.min(1, Math.max(0, cdf));
  if (alternative === "greater") return Math.min(1, Math.max(0, 1 - cdf));
  return Math.min(1, Math.max(0, 2 * Math.min(cdf, 1 - cdf)));
}

function alternativeLabel(alternative) {
  if (alternative === "less") return "less";
  if (alternative === "greater") return "greater";
  return "two-sided";
}

function rankValues(items, valueAccessor) {
  const sorted = items
    .map((item, index) => ({ item, index, value: valueAccessor(item) }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(items.length).fill(0);
  const tieGroups = [];
  let position = 0;
  while (position < sorted.length) {
    let end = position + 1;
    while (end < sorted.length && sorted[end].value === sorted[position].value) {
      end += 1;
    }
    const rank = (position + 1 + end) / 2;
    for (let index = position; index < end; index += 1) {
      ranks[sorted[index].index] = rank;
    }
    const tieSize = end - position;
    if (tieSize > 1) tieGroups.push(tieSize);
    position = end;
  }
  return { ranks, tieGroups };
}

function numericGroups(table, valueColumn, groupColumn) {
  const groups = new Map();
  let skipped = 0;
  for (const row of table.rows) {
    const group = String(row[groupColumn.id] ?? "").trim();
    const value = parseStatisticsNumber(row[valueColumn.id]);
    if (!group || value === null) {
      skipped += 1;
      continue;
    }
    groups.set(group, [...(groups.get(group) ?? []), value]);
  }
  return { groups, skipped };
}

function getVarianceRatio(variances) {
  const finite = variances.filter((value) => Number.isFinite(value) && value >= 0);
  if (finite.length === 0) return Number.NaN;
  const max = Math.max(...finite);
  const positive = finite.filter((value) => value > 0);
  if (positive.length === 0) return 1;
  const min = Math.min(...positive);
  return max / min;
}

function makeSuitabilityNotes({ test, varianceRatio, groupSizes }) {
  const notes = [];
  if (Number.isFinite(varianceRatio) && varianceRatio > 4) {
    notes.push(`Group variances differ by about ${round(varianceRatio, 3)}x.`);
  }
  if (test === "student" && Number.isFinite(varianceRatio) && varianceRatio > 4) {
    notes.push("Student's two-sample t-test assumes equal variances; Welch is usually safer for these groups.");
  }
  const minSize = Math.min(...groupSizes);
  const maxSize = Math.max(...groupSizes);
  if (minSize > 0 && maxSize / minSize > 2) {
    notes.push("Group sizes are uneven, so assumptions and outliers deserve extra review.");
  }
  if (minSize < 3) {
    notes.push("At least one group has fewer than three observations.");
  }
  return notes.join(" ");
}

function chooseGroups(groups, options = {}) {
  const names = [...groups.keys()];
  const groupA = options.groupA && groups.has(options.groupA) ? options.groupA : names[0];
  const groupB = options.groupB && groups.has(options.groupB) ? options.groupB : names.find((name) => name !== groupA);
  return { groupA, groupB };
}

function adjustPValues(values, method) {
  if (method === "none") {
    return values.map((value) => Math.min(1, Math.max(0, value)));
  }
  const count = values.length;
  if (method === "bonferroni") {
    return values.map((value) => Math.min(1, Math.max(0, value * count)));
  }
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const adjusted = Array(count).fill(1);
  let previous = 0;
  for (let rank = 0; rank < sorted.length; rank += 1) {
    const candidate = Math.min(1, sorted[rank].value * (count - rank));
    previous = Math.max(previous, candidate);
    adjusted[sorted[rank].index] = previous;
  }
  return adjusted;
}

function adjustmentLabel(method) {
  if (method === "bonferroni") return "Bonferroni";
  if (method === "none") return "None";
  return "Holm";
}

function matrixRank(matrix, tolerance = 1e-10) {
  if (matrix.length === 0 || matrix[0]?.length === 0) return 0;
  const working = matrix.map((row) => row.slice());
  const rowCount = working.length;
  const columnCount = working[0].length;
  let rank = 0;
  for (let column = 0; column < columnCount && rank < rowCount; column += 1) {
    let pivot = rank;
    for (let row = rank + 1; row < rowCount; row += 1) {
      if (Math.abs(working[row][column]) > Math.abs(working[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(working[pivot][column]) <= tolerance) continue;
    [working[rank], working[pivot]] = [working[pivot], working[rank]];
    const pivotValue = working[rank][column];
    for (let col = column; col < columnCount; col += 1) {
      working[rank][col] /= pivotValue;
    }
    for (let row = 0; row < rowCount; row += 1) {
      if (row === rank) continue;
      const factor = working[row][column];
      if (Math.abs(factor) <= tolerance) continue;
      for (let col = column; col < columnCount; col += 1) {
        working[row][col] -= factor * working[rank][col];
      }
    }
    rank += 1;
  }
  return rank;
}

function selectIndependentColumns(matrix) {
  const selected = [];
  let rank = 0;
  const columnCount = matrix[0]?.length ?? 0;
  for (let column = 0; column < columnCount; column += 1) {
    const candidate = [...selected, column];
    const candidateMatrix = matrix.map((row) => candidate.map((index) => row[index]));
    const candidateRank = matrixRank(candidateMatrix);
    if (candidateRank > rank) {
      selected.push(column);
      rank = candidateRank;
    }
  }
  return {
    rank,
    matrix: matrix.map((row) => selected.map((index) => row[index]))
  };
}

function solveLinearSystem(matrix, vector, tolerance = 1e-10) {
  const n = matrix.length;
  const working = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(working[row][column]) > Math.abs(working[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(working[pivot][column]) <= tolerance) {
      return null;
    }
    [working[column], working[pivot]] = [working[pivot], working[column]];
    const pivotValue = working[column][column];
    for (let col = column; col <= n; col += 1) {
      working[column][col] /= pivotValue;
    }
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = working[row][column];
      if (Math.abs(factor) <= tolerance) continue;
      for (let col = column; col <= n; col += 1) {
        working[row][col] -= factor * working[column][col];
      }
    }
  }
  return working.map((row) => row[n]);
}

function leastSquaresFit(design, values) {
  const independent = selectIndependentColumns(design);
  const x = independent.matrix;
  const rank = independent.rank;
  if (rank === 0) return { rank: 0, rss: Number.NaN };
  const xtx = Array.from({ length: rank }, () => Array(rank).fill(0));
  const xty = Array(rank).fill(0);
  for (let row = 0; row < x.length; row += 1) {
    for (let i = 0; i < rank; i += 1) {
      xty[i] += x[row][i] * values[row];
      for (let j = 0; j < rank; j += 1) {
        xtx[i][j] += x[row][i] * x[row][j];
      }
    }
  }
  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return { rank, rss: Number.NaN };
  let rss = 0;
  for (let row = 0; row < x.length; row += 1) {
    const fitted = coefficients.reduce((sum, coefficient, index) => sum + coefficient * x[row][index], 0);
    rss += (values[row] - fitted) ** 2;
  }
  return { rank, rss };
}

export function runTwoGroupTTest(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "concentration_ng_ul") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "treatment") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number") ??
    table.columns.find((column) => column.id !== valueColumn?.id);
  if (!valueColumn || !groupColumn) {
    return { rows: [], warnings: [...warnings, "A numeric value column and a group column are required."], table };
  }
  const grouped = numericGroups(table, valueColumn, groupColumn);
  const groups = grouped.groups;
  if (grouped.skipped > 0) {
    warnings.push(`Skipped ${grouped.skipped} row(s) with missing group labels or nonnumeric values.`);
  }
  const { groupA, groupB } = chooseGroups(groups, options);
  const valuesA = groups.get(groupA) ?? [];
  const valuesB = groups.get(groupB) ?? [];
  if (valuesA.length < 2 || valuesB.length < 2) {
    return { rows: [], warnings: [...warnings, "Two groups with at least two numeric observations each are required."], table };
  }

  const meanA = mean(valuesA);
  const meanB = mean(valuesB);
  const varianceA = sampleVariance(valuesA, meanA);
  const varianceB = sampleVariance(valuesB, meanB);
  const test = options.test === "student" ? "Student two-sample t-test" : "Welch two-sample t-test";
  const varianceRatio = getVarianceRatio([varianceA, varianceB]);
  const suitabilityNotes = makeSuitabilityNotes({
    test: options.test === "student" ? "student" : "welch",
    varianceRatio,
    groupSizes: [valuesA.length, valuesB.length]
  });
  if (suitabilityNotes && options.test === "student") {
    warnings.push(suitabilityNotes);
  }
  let statistic;
  let df;
  if (options.test === "student") {
    const pooled = ((valuesA.length - 1) * varianceA + (valuesB.length - 1) * varianceB) / (valuesA.length + valuesB.length - 2);
    statistic = (meanA - meanB) / Math.sqrt(pooled * (1 / valuesA.length + 1 / valuesB.length));
    df = valuesA.length + valuesB.length - 2;
  } else {
    const seA = varianceA / valuesA.length;
    const seB = varianceB / valuesB.length;
    statistic = (meanA - meanB) / Math.sqrt(seA + seB);
    df = ((seA + seB) ** 2) / ((seA ** 2) / (valuesA.length - 1) + (seB ** 2) / (valuesB.length - 1));
  }
  const pValue = twoTailedPValue(statistic, df);
  const interpretation = pValue < 0.05
    ? "The two-sided p value is below 0.05 for the selected groups."
    : "The two-sided p value is not below 0.05 for the selected groups.";
  const rows = [{
    test,
    value_column: valueColumn.label,
    group_column: groupColumn.label,
    group_a: groupA,
    group_b: groupB,
    n_a: valuesA.length,
    n_b: valuesB.length,
    mean_a: round(meanA),
    mean_b: round(meanB),
    difference: round(meanA - meanB),
    statistic: round(statistic),
    df: round(df),
    p_value: round(pValue, 8),
    variance_ratio: round(varianceRatio),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    warnings,
    table,
    report: [
      "Hypothesis test",
      `Test: ${test}`,
      `Value column: ${valueColumn.label}`,
      `Group column: ${groupColumn.label}`,
      `${groupA}: n=${valuesA.length}, mean=${round(meanA)}`,
      `${groupB}: n=${valuesB.length}, mean=${round(meanB)}`,
      `t=${round(statistic)}, df=${round(df)}, two-sided p=${round(pValue, 8)}`,
      `Variance ratio: ${round(varianceRatio) || "n/a"}`,
      interpretation,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: no obvious variance or group-size warning from the selected checks.",
      "Method note: Welch's test does not assume equal variances; Student's two-sample test assumes equal group variances."
    ].join("\n") + "\n"
  };
}

export function hypothesisRowsToTsv(rows) {
  return [
    hypothesisTestColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => hypothesisTestColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function pairwiseTTestPostHocRowsToTsv(rows) {
  return [
    pairwiseTTestPostHocColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => pairwiseTTestPostHocColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function runPairwiseTTestPostHoc(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "expression") ??
    findColumn(table.columns, "concentration_ng_ul") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "treatment") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number") ??
    table.columns.find((column) => column.id !== valueColumn?.id);
  if (!valueColumn || !groupColumn) {
    return { rows: [], warnings: [...warnings, "A numeric value column and a group column are required."], table };
  }

  const grouped = numericGroups(table, valueColumn, groupColumn);
  if (grouped.skipped > 0) {
    warnings.push(`Skipped ${grouped.skipped} row(s) with missing group labels or nonnumeric values.`);
  }
  const usableGroups = [...grouped.groups.entries()].filter(([, values]) => values.length >= 2);
  const omittedSmallGroups = [...grouped.groups.entries()].filter(([, values]) => values.length < 2);
  if (omittedSmallGroups.length > 0) {
    warnings.push(`Skipped ${omittedSmallGroups.length} group(s) with fewer than two numeric observations.`);
  }
  const maxGroups = 30;
  if (usableGroups.length < 2) {
    return { rows: [], warnings: [...warnings, "At least two groups with at least two numeric observations each are required."], table };
  }
  if (usableGroups.length > maxGroups) {
    return {
      rows: [],
      warnings: [...warnings, `Found ${usableGroups.length} usable groups; reduce to ${maxGroups} or fewer groups before running all pairwise tests.`],
      table
    };
  }

  const alpha = Number.isFinite(Number(options.alpha)) && Number(options.alpha) > 0 && Number(options.alpha) < 1
    ? Number(options.alpha)
    : 0.05;
  const adjustment = ["holm", "bonferroni", "none"].includes(options.adjustment) ? options.adjustment : "holm";
  const pendingRows = [];

  for (let aIndex = 0; aIndex < usableGroups.length - 1; aIndex += 1) {
    const [groupA, valuesA] = usableGroups[aIndex];
    for (let bIndex = aIndex + 1; bIndex < usableGroups.length; bIndex += 1) {
      const [groupB, valuesB] = usableGroups[bIndex];
      const meanA = mean(valuesA);
      const meanB = mean(valuesB);
      const varianceA = sampleVariance(valuesA, meanA);
      const varianceB = sampleVariance(valuesB, meanB);
      const seA = varianceA / valuesA.length;
      const seB = varianceB / valuesB.length;
      const seSum = seA + seB;
      let statistic = Number.NaN;
      let df = Number.NaN;
      let pValue = Number.NaN;
      if (seSum === 0) {
        statistic = meanA === meanB ? 0 : (meanA > meanB ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
        df = valuesA.length + valuesB.length - 2;
        pValue = meanA === meanB ? 1 : 0;
      } else {
        statistic = (meanA - meanB) / Math.sqrt(seSum);
        df = ((seSum) ** 2) / ((seA ** 2) / (valuesA.length - 1) + (seB ** 2) / (valuesB.length - 1));
        pValue = twoTailedPValue(statistic, df);
      }
      const varianceRatio = getVarianceRatio([varianceA, varianceB]);
      const suitabilityNotes = makeSuitabilityNotes({
        test: "welch",
        varianceRatio,
        groupSizes: [valuesA.length, valuesB.length]
      });
      pendingRows.push({
        comparison: `${groupA} vs ${groupB}`,
        test: "Pairwise Welch t-test",
        value_column: valueColumn.label,
        group_column: groupColumn.label,
        group_a: groupA,
        group_b: groupB,
        n_a: valuesA.length,
        n_b: valuesB.length,
        mean_a: round(meanA),
        mean_b: round(meanB),
        difference: round(meanA - meanB),
        statistic: round(statistic),
        df: round(df),
        p_value_raw: pValue,
        p_value: round(pValue, 8),
        adjustment: adjustmentLabel(adjustment),
        alpha: round(alpha),
        variance_ratio: round(varianceRatio),
        suitability_notes: suitabilityNotes
      });
    }
  }

  const adjusted = adjustPValues(pendingRows.map((row) => row.p_value_raw), adjustment);
  const rows = pendingRows.map((row, index) => {
    const pAdjusted = adjusted[index];
    return {
      ...row,
      p_adjusted: round(pAdjusted, 8),
      interpretation: pAdjusted < alpha
        ? `Adjusted p value is below ${round(alpha)} for this comparison.`
        : `Adjusted p value is not below ${round(alpha)} for this comparison.`
    };
  }).map(({ p_value_raw, ...row }) => row);
  const significant = rows.filter((row) => Number(row.p_adjusted) < alpha).length;
  return {
    rows,
    warnings,
    table,
    report: [
      "Pairwise t-test post-hoc comparisons",
      `Test: pairwise Welch t-tests`,
      `Value column: ${valueColumn.label}`,
      `Group column: ${groupColumn.label}`,
      `Groups compared: ${usableGroups.map(([name]) => name).join(", ")}`,
      `Comparisons: ${rows.length}`,
      `Adjustment: ${adjustmentLabel(adjustment)}`,
      `Alpha: ${round(alpha)}`,
      `Significant comparisons after adjustment: ${significant}`,
      "Method note: Welch's t-test is used for each pair, then p values are adjusted across all reported comparisons. Review study design, distribution shape, outliers, and whether these post-hoc comparisons were planned."
    ].join("\n") + "\n"
  };
}

export function runOneWayAnova(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "concentration_ng_ul") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "treatment") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number") ??
    table.columns.find((column) => column.id !== valueColumn?.id);
  if (!valueColumn || !groupColumn) {
    return { rows: [], warnings: [...warnings, "A numeric value column and a group column are required."], table };
  }
  const grouped = numericGroups(table, valueColumn, groupColumn);
  const groups = grouped.groups;
  if (grouped.skipped > 0) {
    warnings.push(`Skipped ${grouped.skipped} row(s) with missing group labels or nonnumeric values.`);
  }
  const usableGroups = [...groups.entries()].filter(([, values]) => values.length >= 2);
  if (usableGroups.length < 2) {
    return { rows: [], warnings: [...warnings, "At least two groups with at least two numeric observations each are required."], table };
  }
  const allValues = usableGroups.flatMap(([, values]) => values);
  const grandMean = mean(allValues);
  const groupStats = usableGroups.map(([name, values]) => {
    const groupMean = mean(values);
    const variance = sampleVariance(values, groupMean);
    return { name, values, mean: groupMean, variance };
  });
  const ssBetween = groupStats.reduce((sum, group) => sum + group.values.length * (group.mean - grandMean) ** 2, 0);
  const ssWithin = groupStats.reduce(
    (sum, group) => sum + group.values.reduce((inner, value) => inner + (value - group.mean) ** 2, 0),
    0
  );
  const dfBetween = groupStats.length - 1;
  const dfWithin = allValues.length - groupStats.length;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const statistic = msWithin > 0 ? msBetween / msWithin : Number.POSITIVE_INFINITY;
  const pValue = Number.isFinite(statistic) ? fRightTailPValue(statistic, dfBetween, dfWithin) : 0;
  const varianceRatio = getVarianceRatio(groupStats.map((group) => group.variance));
  const suitabilityNotes = makeSuitabilityNotes({
    test: "anova",
    varianceRatio,
    groupSizes: groupStats.map((group) => group.values.length)
  });
  if (suitabilityNotes) {
    warnings.push(suitabilityNotes);
  }
  const interpretation = pValue < 0.05
    ? "The one-way ANOVA p value is below 0.05 for the selected groups."
    : "The one-way ANOVA p value is not below 0.05 for the selected groups.";
  const rows = [{
    test: "One-way ANOVA",
    value_column: valueColumn.label,
    group_column: groupColumn.label,
    group_count: groupStats.length,
    observation_count: allValues.length,
    df_between: dfBetween,
    df_within: dfWithin,
    ms_between: round(msBetween),
    ms_within: round(msWithin),
    statistic: round(statistic),
    p_value: round(pValue, 8),
    variance_ratio: round(varianceRatio),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    warnings,
    table,
    report: [
      "One-way ANOVA",
      `Value column: ${valueColumn.label}`,
      `Group column: ${groupColumn.label}`,
      `Groups: ${groupStats.map((group) => `${group.name} (n=${group.values.length}, mean=${round(group.mean)})`).join("; ")}`,
      `F(${dfBetween}, ${dfWithin})=${round(statistic)}, p=${round(pValue, 8)}`,
      `Variance ratio: ${round(varianceRatio) || "n/a"}`,
      interpretation,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: no obvious variance or group-size warning from the selected checks.",
      "Method note: one-way ANOVA tests whether the group means differ under the usual independence, approximate normality, and variance assumptions."
    ].join("\n") + "\n"
  };
}

export function anovaRowsToTsv(rows) {
  return [
    oneWayAnovaColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => oneWayAnovaColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function runKruskalWallisTest(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "expression") ??
    findColumn(table.columns, "value") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "group") ??
    findColumn(table.columns, "treatment") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number") ??
    table.columns.find((column) => column.id !== valueColumn?.id);
  if (!valueColumn || !groupColumn) {
    return { rows: [], warnings: [...warnings, "A numeric value column and a group column are required."], table };
  }
  const grouped = numericGroups(table, valueColumn, groupColumn);
  if (grouped.skipped > 0) {
    warnings.push(`Skipped ${grouped.skipped} row(s) with missing group labels or nonnumeric values.`);
  }
  const usableGroups = [...grouped.groups.entries()].filter(([, values]) => values.length > 0);
  if (usableGroups.length < 2) {
    return { rows: [], warnings: [...warnings, "At least two groups with numeric observations are required."], table };
  }
  const observations = [];
  for (const [group, values] of usableGroups) {
    for (const value of values) {
      observations.push({ group, value });
    }
  }
  const { ranks, tieGroups } = rankValues(observations, (observation) => observation.value);
  const rankSums = new Map(usableGroups.map(([group]) => [group, 0]));
  observations.forEach((observation, index) => {
    rankSums.set(observation.group, (rankSums.get(observation.group) ?? 0) + ranks[index]);
  });
  const totalN = observations.length;
  const rawH = (12 / (totalN * (totalN + 1))) * usableGroups.reduce((sum, [group, values]) => {
    const rankSum = rankSums.get(group) ?? 0;
    return sum + (rankSum ** 2) / values.length;
  }, 0) - 3 * (totalN + 1);
  const tieSum = tieGroups.reduce((sum, size) => sum + size ** 3 - size, 0);
  const tieCorrection = totalN > 1 ? 1 - tieSum / (totalN ** 3 - totalN) : 1;
  const statistic = tieCorrection > 0 ? rawH / tieCorrection : Number.NaN;
  const df = usableGroups.length - 1;
  const pValue = Number.isFinite(statistic) ? chiSquareRightTailPValue(statistic, df) : Number.NaN;
  const smallGroups = usableGroups.filter(([, values]) => values.length < 5).length;
  const suitabilityNotes = [
    "Kruskal-Wallis is a rank-based test for independent groups; it tests for distributional differences and is often used as a nonparametric alternative to one-way ANOVA.",
    smallGroups > 0 ? `${smallGroups} group(s) have fewer than five observations; chi-square approximation may be rough.` : "",
    tieGroups.length > 0 ? "Tied values are present; SMS3 applies the standard tie correction." : ""
  ].filter(Boolean).join(" ");
  if (smallGroups > 0 || tieGroups.length > 0) {
    warnings.push(suitabilityNotes);
  }
  const interpretation = Number.isFinite(pValue)
    ? pValue < 0.05
      ? "The Kruskal-Wallis p value is below 0.05 for the selected groups."
      : "The Kruskal-Wallis p value is not below 0.05 for the selected groups."
    : "The Kruskal-Wallis p value could not be calculated for the selected groups.";
  const rows = [{
    test: "Kruskal-Wallis test",
    value_column: valueColumn.label,
    group_column: groupColumn.label,
    group_count: usableGroups.length,
    observation_count: totalN,
    statistic: round(statistic),
    df,
    p_value: round(pValue, 8),
    tie_correction: round(tieCorrection),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    warnings,
    table,
    report: [
      "Kruskal-Wallis Test",
      `Value column: ${valueColumn.label}`,
      `Group column: ${groupColumn.label}`,
      `Groups: ${usableGroups.map(([group, values]) => `${group} (n=${values.length})`).join("; ")}`,
      `H(${df})=${round(statistic)}, p=${round(pValue, 8) || "n/a"}`,
      `Tie correction: ${round(tieCorrection) || "n/a"}`,
      interpretation,
      `Suitability notes: ${suitabilityNotes}`,
      "Method note: pooled observations are ranked with average ranks for ties; p values use the chi-square approximation with k - 1 degrees of freedom."
    ].join("\n") + "\n"
  };
}

export function kruskalWallisRowsToTsv(rows) {
  return [
    kruskalWallisTestColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => kruskalWallisTestColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

function makeTwoWayDesign(observations, levelsA, levelsB, terms) {
  return observations.map((observation) => {
    const row = [1];
    if (terms.includes("a")) {
      for (const level of levelsA.slice(1)) {
        row.push(observation.factorA === level ? 1 : 0);
      }
    }
    if (terms.includes("b")) {
      for (const level of levelsB.slice(1)) {
        row.push(observation.factorB === level ? 1 : 0);
      }
    }
    if (terms.includes("interaction")) {
      for (const levelA of levelsA.slice(1)) {
        for (const levelB of levelsB.slice(1)) {
          row.push(observation.factorA === levelA && observation.factorB === levelB ? 1 : 0);
        }
      }
    }
    return row;
  });
}

export function runTwoWayAnova(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "expression") ??
    findColumn(table.columns, "value") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const factorAColumn =
    findColumn(table.columns, options.factorAColumn) ??
    findColumn(table.columns, "genotype") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number");
  const factorBColumn =
    findColumn(table.columns, options.factorBColumn) ??
    findColumn(table.columns, "treatment") ??
    findColumn(table.columns, "condition") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.id !== factorAColumn?.id && column.type !== "number");
  if (!valueColumn || !factorAColumn || !factorBColumn) {
    return { rows: [], warnings: [...warnings, "A numeric value column and two categorical factor columns are required."], table };
  }

  const observations = [];
  let skipped = 0;
  for (const row of table.rows) {
    const value = parseStatisticsNumber(row[valueColumn.id]);
    const factorA = String(row[factorAColumn.id] ?? "").trim();
    const factorB = String(row[factorBColumn.id] ?? "").trim();
    if (value === null || !factorA || !factorB) {
      skipped += 1;
      continue;
    }
    observations.push({ value, factorA, factorB });
  }
  if (skipped > 0) warnings.push(`Skipped ${skipped} row(s) with missing factors or nonnumeric values.`);
  const levelsA = [...new Set(observations.map((observation) => observation.factorA))];
  const levelsB = [...new Set(observations.map((observation) => observation.factorB))];
  if (levelsA.length < 2 || levelsB.length < 2 || observations.length < 4) {
    return { rows: [], warnings: [...warnings, "At least two levels for each factor and enough numeric observations are required."], table };
  }

  const values = observations.map((observation) => observation.value);
  const models = {
    intercept: leastSquaresFit(makeTwoWayDesign(observations, levelsA, levelsB, []), values),
    a: leastSquaresFit(makeTwoWayDesign(observations, levelsA, levelsB, ["a"]), values),
    ab: leastSquaresFit(makeTwoWayDesign(observations, levelsA, levelsB, ["a", "b"]), values),
    full: leastSquaresFit(makeTwoWayDesign(observations, levelsA, levelsB, ["a", "b", "interaction"]), values)
  };
  if (!Object.values(models).every((model) => Number.isFinite(model.rss))) {
    return { rows: [], warnings: [...warnings, "The two-way ANOVA design matrix could not be solved for the selected columns."], table };
  }
  const dfResidual = observations.length - models.full.rank;
  if (dfResidual <= 0) {
    return { rows: [], warnings: [...warnings, "The selected two-way ANOVA model has no residual degrees of freedom. Add replicated observations per factor combination or simplify the design."], table };
  }

  const cellCounts = new Map();
  for (const observation of observations) {
    const key = `${observation.factorA}\u0000${observation.factorB}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
  }
  const expectedCellCount = levelsA.length * levelsB.length;
  const observedCellCounts = [...cellCounts.values()];
  const missingCells = expectedCellCount - cellCounts.size;
  const minCellCount = observedCellCounts.length > 0 ? Math.min(...observedCellCounts) : 0;
  const maxCellCount = observedCellCounts.length > 0 ? Math.max(...observedCellCounts) : 0;
  const suitabilityNotes = [
    missingCells > 0 ? `${missingCells} factor combination(s) have no observations; sequential Type I sums of squares may be hard to interpret.` : "",
    minCellCount < 2 ? "At least one observed factor combination has fewer than two replicate observations." : "",
    minCellCount > 0 && maxCellCount > minCellCount ? "Cell counts are unbalanced; SMS3 reports sequential Type I sums of squares in Factor A then Factor B order." : "",
    levelsA.length > 10 || levelsB.length > 10 ? "Many factor levels can make ANOVA tables and interpretation difficult." : ""
  ].filter(Boolean).join(" ");
  if (suitabilityNotes) warnings.push(suitabilityNotes);

  const ssA = models.intercept.rss - models.a.rss;
  const dfA = models.a.rank - models.intercept.rank;
  const ssB = models.a.rss - models.ab.rss;
  const dfB = models.ab.rank - models.a.rank;
  const ssInteraction = models.ab.rss - models.full.rss;
  const dfInteraction = models.full.rank - models.ab.rank;
  const ssResidual = models.full.rss;
  const msResidual = ssResidual / dfResidual;
  const terms = [
    { source: factorAColumn.label, levels: levelsA.join("; "), df: dfA, ss: ssA },
    { source: factorBColumn.label, levels: levelsB.join("; "), df: dfB, ss: ssB },
    { source: `${factorAColumn.label} x ${factorBColumn.label}`, levels: `${levelsA.length} x ${levelsB.length}`, df: dfInteraction, ss: ssInteraction },
    { source: "Residual", levels: "", df: dfResidual, ss: ssResidual }
  ];
  const rows = terms.map((term) => {
    const ms = term.df > 0 ? term.ss / term.df : Number.NaN;
    const statistic = term.source === "Residual" || msResidual <= 0 ? Number.NaN : ms / msResidual;
    const pValue = Number.isFinite(statistic) ? fRightTailPValue(statistic, term.df, dfResidual) : Number.NaN;
    const interpretation = term.source === "Residual"
      ? "Residual error term."
      : pValue < 0.05
        ? "The sequential two-way ANOVA p value is below 0.05 for this source."
        : "The sequential two-way ANOVA p value is not below 0.05 for this source.";
    return {
      test: "Two-way ANOVA",
      value_column: valueColumn.label,
      factor_a_column: factorAColumn.label,
      factor_b_column: factorBColumn.label,
      source: term.source,
      levels: term.levels,
      df: term.df,
      ss: round(Math.max(0, term.ss)),
      ms: round(ms),
      statistic: round(statistic),
      p_value: round(pValue, 8),
      interpretation,
      suitability_notes: suitabilityNotes
    };
  });
  return {
    rows,
    warnings,
    table,
    report: [
      "Two-Way ANOVA",
      `Value column: ${valueColumn.label}`,
      `Factor A: ${factorAColumn.label} (${levelsA.join(", ")})`,
      `Factor B: ${factorBColumn.label} (${levelsB.join(", ")})`,
      `Complete observations: ${observations.length}`,
      `Model: sequential Type I sums of squares in Factor A then Factor B order, including the interaction term.`,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: all observed factor combinations are replicated and balanced.",
      "Method note: p values are right-tailed F tests using the residual mean square from the full model with interaction."
    ].join("\n") + "\n"
  };
}

export function twoWayAnovaRowsToTsv(rows) {
  return [
    twoWayAnovaColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => twoWayAnovaColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function runRepeatedMeasuresAnova(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "expression") ??
    findColumn(table.columns, "value") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const subjectColumn =
    findColumn(table.columns, options.subjectColumn) ??
    findColumn(table.columns, "subject") ??
    findColumn(table.columns, "sample") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number");
  const conditionColumn =
    findColumn(table.columns, options.conditionColumn) ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "time") ??
    findColumn(table.columns, "treatment") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.id !== subjectColumn?.id && column.type !== "number");
  if (!valueColumn || !subjectColumn || !conditionColumn) {
    return { rows: [], warnings: [...warnings, "A numeric value column, subject column, and repeated condition column are required."], table };
  }

  const subjectConditionValues = new Map();
  const conditionOrder = [];
  let skipped = 0;
  let duplicateCells = 0;
  for (const row of table.rows) {
    const value = parseStatisticsNumber(row[valueColumn.id]);
    const subject = String(row[subjectColumn.id] ?? "").trim();
    const condition = String(row[conditionColumn.id] ?? "").trim();
    if (value === null || !subject || !condition) {
      skipped += 1;
      continue;
    }
    if (!conditionOrder.includes(condition)) conditionOrder.push(condition);
    if (!subjectConditionValues.has(subject)) subjectConditionValues.set(subject, new Map());
    const conditionMap = subjectConditionValues.get(subject);
    const values = conditionMap.get(condition) ?? [];
    if (values.length > 0) duplicateCells += 1;
    values.push(value);
    conditionMap.set(condition, values);
  }
  if (skipped > 0) warnings.push(`Skipped ${skipped} row(s) with missing subject, condition, or nonnumeric values.`);
  if (duplicateCells > 0) warnings.push(`Averaged ${duplicateCells} duplicate subject-condition measurement(s) before repeated-measures ANOVA.`);

  const completeSubjects = [];
  const excludedSubjects = [];
  for (const [subject, conditionMap] of subjectConditionValues.entries()) {
    if (conditionOrder.every((condition) => conditionMap.has(condition))) {
      completeSubjects.push(subject);
    } else {
      excludedSubjects.push(subject);
    }
  }
  if (excludedSubjects.length > 0) {
    warnings.push(`Excluded ${excludedSubjects.length} subject(s) without every repeated condition: ${excludedSubjects.slice(0, 8).join(", ")}${excludedSubjects.length > 8 ? ", ..." : ""}.`);
  }
  if (completeSubjects.length < 2 || conditionOrder.length < 2) {
    return { rows: [], warnings: [...warnings, "At least two complete subjects and two repeated conditions are required."], table };
  }

  const matrix = completeSubjects.map((subject) => {
    const conditionMap = subjectConditionValues.get(subject);
    return conditionOrder.map((condition) => mean(conditionMap.get(condition)));
  });
  const subjectCount = matrix.length;
  const conditionCount = conditionOrder.length;
  const allValues = matrix.flat();
  const grandMean = mean(allValues);
  const subjectMeans = matrix.map((row) => mean(row));
  const conditionMeans = conditionOrder.map((_, conditionIndex) => mean(matrix.map((row) => row[conditionIndex])));
  const ssTotal = allValues.reduce((sum, value) => sum + (value - grandMean) ** 2, 0);
  const ssSubjects = conditionCount * subjectMeans.reduce((sum, value) => sum + (value - grandMean) ** 2, 0);
  const ssCondition = subjectCount * conditionMeans.reduce((sum, value) => sum + (value - grandMean) ** 2, 0);
  const ssError = Math.max(0, ssTotal - ssSubjects - ssCondition);
  const dfCondition = conditionCount - 1;
  const dfSubjects = subjectCount - 1;
  const dfError = dfCondition * dfSubjects;
  const msCondition = ssCondition / dfCondition;
  const msSubjects = ssSubjects / dfSubjects;
  const msError = ssError / dfError;
  const statistic = msError > 0
    ? msCondition / msError
    : msCondition === 0 ? 0 : Number.POSITIVE_INFINITY;
  const pValue = Number.isFinite(statistic)
    ? fRightTailPValue(statistic, dfCondition, dfError)
    : statistic === Number.POSITIVE_INFINITY ? 0 : Number.NaN;
  const suitabilityNotes = [
    "One-factor repeated-measures ANOVA uses only subjects with all selected repeated conditions.",
    conditionCount > 2 ? "No sphericity correction is applied; review this assumption for more than two conditions." : "",
    duplicateCells > 0 ? "Duplicate subject-condition measurements were averaged before testing." : ""
  ].filter(Boolean).join(" ");
  const interpretation = Number.isFinite(pValue)
    ? pValue < 0.05
      ? "The repeated-measures ANOVA p value is below 0.05 for the condition effect."
      : "The repeated-measures ANOVA p value is not below 0.05 for the condition effect."
    : "The repeated-measures ANOVA p value could not be calculated for the condition effect.";
  const common = {
    test: "Repeated-measures ANOVA",
    value_column: valueColumn.label,
    subject_column: subjectColumn.label,
    condition_column: conditionColumn.label,
    subject_count: subjectCount,
    condition_count: conditionCount,
    complete_observation_count: allValues.length,
    suitability_notes: suitabilityNotes
  };
  const rows = [
    {
      ...common,
      source: conditionColumn.label,
      df: dfCondition,
      ss: round(ssCondition),
      ms: round(msCondition),
      statistic: round(statistic),
      p_value: round(pValue, 8),
      interpretation
    },
    {
      ...common,
      source: subjectColumn.label,
      df: dfSubjects,
      ss: round(ssSubjects),
      ms: round(msSubjects),
      statistic: "",
      p_value: "",
      interpretation: "Subject blocking term."
    },
    {
      ...common,
      source: "Residual",
      df: dfError,
      ss: round(ssError),
      ms: round(msError),
      statistic: "",
      p_value: "",
      interpretation: "Residual error term for the condition effect."
    }
  ];
  return {
    rows,
    warnings,
    table,
    report: [
      "Repeated-Measures ANOVA",
      `Value column: ${valueColumn.label}`,
      `Subject column: ${subjectColumn.label}`,
      `Condition column: ${conditionColumn.label}`,
      `Complete subjects: ${subjectCount}`,
      `Conditions: ${conditionOrder.join(", ")}`,
      `F(${dfCondition}, ${dfError})=${round(statistic)}, p=${round(pValue, 8) || "n/a"}`,
      interpretation,
      `Suitability notes: ${suitabilityNotes}`,
      "Method note: one-factor repeated-measures ANOVA partitions total variation into condition, subject, and residual terms after complete-case subject filtering."
    ].join("\n") + "\n"
  };
}

export function repeatedMeasuresAnovaRowsToTsv(rows) {
  return [
    repeatedMeasuresAnovaColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => repeatedMeasuresAnovaColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function runPairedTTest(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const firstColumn =
    findColumn(table.columns, options.firstColumn) ??
    findColumn(table.columns, "before") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const secondColumn =
    findColumn(table.columns, options.secondColumn) ??
    findColumn(table.columns, "after") ??
    table.columns.find((column) => column.id !== firstColumn?.id && isNumericStatisticsColumn(table.rows, column.id));
  const pairIdColumn = findColumn(table.columns, options.pairIdColumn) ?? findColumn(table.columns, "sample") ?? null;
  if (!firstColumn || !secondColumn) {
    return { rows: [], warnings: [...warnings, "Two numeric paired measurement columns are required."], table };
  }

  const pairs = [];
  let skipped = 0;
  for (const row of table.rows) {
    const first = parseStatisticsNumber(row[firstColumn.id]);
    const second = parseStatisticsNumber(row[secondColumn.id]);
    if (first === null || second === null) {
      skipped += 1;
      continue;
    }
    pairs.push({
      pairId: pairIdColumn ? String(row[pairIdColumn.id] ?? "").trim() : "",
      first,
      second,
      difference: second - first
    });
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) with missing or nonnumeric paired values.`);
  }
  if (pairs.length < 2) {
    return { rows: [], warnings: [...warnings, "At least two complete numeric pairs are required."], table };
  }

  const firstValues = pairs.map((pair) => pair.first);
  const secondValues = pairs.map((pair) => pair.second);
  const differences = pairs.map((pair) => pair.difference);
  const meanFirst = mean(firstValues);
  const meanSecond = mean(secondValues);
  const meanDifference = mean(differences);
  const sdDifference = sampleVariance(differences, meanDifference) ** 0.5;
  const seDifference = sdDifference / Math.sqrt(pairs.length);
  const df = pairs.length - 1;
  let statistic = Number.NaN;
  let pValue = Number.NaN;
  if (seDifference > 0) {
    statistic = meanDifference / seDifference;
    pValue = twoTailedPValue(statistic, df);
  } else {
    warnings.push("All paired differences are identical, so the paired t statistic and p value are undefined.");
  }
  const suitabilityNotes = [
    pairs.length < 5 ? "There are fewer than five complete pairs; inspect the paired differences carefully." : "",
    seDifference === 0 ? "The paired differences have zero variance." : ""
  ].filter(Boolean).join(" ");
  if (suitabilityNotes) {
    warnings.push(suitabilityNotes);
  }
  const interpretation = Number.isFinite(pValue)
    ? pValue < 0.05
      ? "The paired two-sided p value is below 0.05 for the selected columns."
      : "The paired two-sided p value is not below 0.05 for the selected columns."
    : "The paired t-test p value could not be calculated for the selected columns.";
  const rows = [{
    test: "Paired t-test",
    first_column: firstColumn.label,
    second_column: secondColumn.label,
    pair_id_column: pairIdColumn?.label ?? "",
    pair_count: pairs.length,
    mean_first: round(meanFirst),
    mean_second: round(meanSecond),
    mean_difference: round(meanDifference),
    sd_difference: round(sdDifference),
    se_difference: round(seDifference),
    statistic: round(statistic),
    df,
    p_value: round(pValue, 8),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    warnings,
    table,
    pairs,
    report: [
      "Paired t-Test",
      `First column: ${firstColumn.label}`,
      `Second column: ${secondColumn.label}`,
      pairIdColumn ? `Pair ID column: ${pairIdColumn.label}` : "Pair ID column: not selected",
      `Complete pairs: ${pairs.length}`,
      `Mean first: ${round(meanFirst)}`,
      `Mean second: ${round(meanSecond)}`,
      `Mean difference (second - first): ${round(meanDifference)}`,
      `t(${df})=${round(statistic)}, two-sided p=${round(pValue, 8) || "n/a"}`,
      interpretation,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: no obvious small-pair or zero-difference-variance warning from the selected checks.",
      "Method note: the paired t-test applies a one-sample t-test to row-wise differences, here calculated as second column minus first column."
    ].join("\n") + "\n"
  };
}

export function pairedTTestRowsToTsv(rows) {
  return [
    pairedTTestColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => pairedTTestColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

function parseColumnList(value) {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function runChiSquareTest(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  if (table.columns.length < 3) {
    return { rows: [], expectedRows: [], warnings: [...warnings, "A contingency count table needs one row-label column and at least two numeric count columns."], table };
  }

  const rowLabelColumn = findColumn(table.columns, options.rowLabelColumn) ?? table.columns[0];
  const requestedCountColumns = parseColumnList(options.countColumns);
  let countColumns = requestedCountColumns.length > 0
    ? requestedCountColumns.map((name) => findColumn(table.columns, name)).filter(Boolean)
    : table.columns.filter((column) => column.id !== rowLabelColumn.id);
  if (requestedCountColumns.length > 0 && countColumns.length < 2) {
    const inferredCountColumns = table.columns.filter((column) =>
      column.id !== rowLabelColumn.id &&
      table.rows.some((row) => parseStatisticsNumber(row[column.id]) !== null)
    );
    if (inferredCountColumns.length >= 2) {
      warnings.push(
        `Requested count columns (${requestedCountColumns.join(", ")}) did not match at least two columns; using numeric columns ${inferredCountColumns.map((column) => column.label).join(", ")}.`
      );
      countColumns = inferredCountColumns;
    }
  }
  if (countColumns.length < 2) {
    return { rows: [], expectedRows: [], warnings: [...warnings, "At least two count columns are required for a chi-square test of independence."], table };
  }

  const matrix = [];
  const rowLabels = [];
  let skippedRows = 0;
  for (const [rowIndex, row] of table.rows.entries()) {
    const counts = [];
    let valid = true;
    for (const column of countColumns) {
      const value = parseStatisticsNumber(row[column.id]);
      if (value === null || value < 0) {
        valid = false;
        break;
      }
      counts.push(value);
    }
    if (!valid) {
      skippedRows += 1;
      continue;
    }
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      skippedRows += 1;
      continue;
    }
    matrix.push(counts);
    rowLabels.push(String(row[rowLabelColumn.id] ?? "").trim() || `Row ${rowIndex + 1}`);
  }
  if (skippedRows > 0) {
    warnings.push(`Skipped ${skippedRows} row(s) with missing, negative, nonnumeric, or all-zero count values.`);
  }
  if (matrix.length < 2) {
    return { rows: [], expectedRows: [], warnings: [...warnings, "At least two non-empty row categories are required."], table };
  }

  const rowTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = countColumns.map((_, columnIndex) => matrix.reduce((sum, row) => sum + row[columnIndex], 0));
  const total = rowTotals.reduce((sum, value) => sum + value, 0);
  if (columnTotals.filter((value) => value > 0).length < 2) {
    return { rows: [], expectedRows: [], warnings: [...warnings, "At least two count columns must have nonzero totals."], table };
  }

  let statistic = 0;
  let minExpected = Number.POSITIVE_INFINITY;
  let cellsExpectedLt5 = 0;
  const expectedRows = [];
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < countColumns.length; columnIndex += 1) {
      const observed = matrix[rowIndex][columnIndex];
      const expected = (rowTotals[rowIndex] * columnTotals[columnIndex]) / total;
      if (expected <= 0) continue;
      const contribution = ((observed - expected) ** 2) / expected;
      statistic += contribution;
      minExpected = Math.min(minExpected, expected);
      if (expected < 5) cellsExpectedLt5 += 1;
      expectedRows.push({
        row_category: rowLabels[rowIndex],
        column_category: countColumns[columnIndex].label,
        observed: round(observed),
        expected: round(expected),
        contribution: round(contribution)
      });
    }
  }
  const df = (matrix.length - 1) * (countColumns.length - 1);
  const pValue = chiSquareRightTailPValue(statistic, df);
  const suitabilityNotes = [
    cellsExpectedLt5 > 0 ? `${cellsExpectedLt5} expected cell count(s) are below 5; consider exact or simulation-based tests for sparse tables.` : "",
    total < 20 ? "The total count is small, so asymptotic chi-square assumptions deserve extra review." : ""
  ].filter(Boolean).join(" ");
  if (suitabilityNotes) {
    warnings.push(suitabilityNotes);
  }
  const interpretation = pValue < 0.05
    ? "The chi-square test p value is below 0.05 for the selected contingency table."
    : "The chi-square test p value is not below 0.05 for the selected contingency table.";
  const rows = [{
    test: "Pearson chi-square test of independence",
    row_variable: rowLabelColumn.label,
    column_variable: countColumns.map((column) => column.label).join("; "),
    row_count: matrix.length,
    column_count: countColumns.length,
    observation_count: round(total),
    statistic: round(statistic),
    df,
    p_value: round(pValue, 8),
    min_expected: round(minExpected),
    cells_expected_lt_5: cellsExpectedLt5,
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    expectedRows,
    warnings,
    table,
    report: [
      "Chi-Square Test",
      `Row category column: ${rowLabelColumn.label}`,
      `Count columns: ${countColumns.map((column) => column.label).join(", ")}`,
      `Rows: ${matrix.length}`,
      `Columns: ${countColumns.length}`,
      `Total count: ${round(total)}`,
      `X^2(${df})=${round(statistic)}, p=${round(pValue, 8)}`,
      `Minimum expected count: ${round(minExpected)}`,
      interpretation,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: no expected-count warning from the selected checks.",
      "Method note: Pearson's chi-square test compares observed counts with row-total by column-total expected counts under independence."
    ].join("\n") + "\n"
  };
}

export function chiSquareRowsToTsv(rows) {
  return [
    chiSquareTestColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => chiSquareTestColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function chiSquareExpectedRowsToTsv(rows) {
  return [
    chiSquareExpectedCountColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => chiSquareExpectedCountColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

function logChoose(n, k) {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

function fisherHypergeometricProbability(a, row1Total, row2Total, column1Total, total) {
  return Math.exp(
    logChoose(column1Total, a) +
    logChoose(total - column1Total, row1Total - a) -
    logChoose(total, row1Total)
  );
}

function fisherExactPValue(a, b, c, d, alternative) {
  const row1Total = a + b;
  const row2Total = c + d;
  const column1Total = a + c;
  const total = row1Total + row2Total;
  const minA = Math.max(0, column1Total - row2Total);
  const maxA = Math.min(row1Total, column1Total);
  const observedProbability = fisherHypergeometricProbability(a, row1Total, row2Total, column1Total, total);
  let pValue = 0;
  for (let value = minA; value <= maxA; value += 1) {
    const probability = fisherHypergeometricProbability(value, row1Total, row2Total, column1Total, total);
    if (alternative === "less" && value <= a) {
      pValue += probability;
    } else if (alternative === "greater" && value >= a) {
      pValue += probability;
    } else if (alternative !== "less" && alternative !== "greater" && probability <= observedProbability + 1e-12) {
      pValue += probability;
    }
  }
  return Math.min(1, Math.max(0, pValue));
}

function formatOddsRatio(a, b, c, d) {
  const numerator = a * d;
  const denominator = b * c;
  if (denominator === 0) {
    return numerator === 0 ? "undefined" : "Infinity";
  }
  return String(round(numerator / denominator));
}

export function runFisherExactTest(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  if (table.columns.length < 3) {
    return { rows: [], warnings: [...warnings, "A 2 x 2 count table needs one row-label column and two count columns."], table };
  }

  const rowLabelColumn = findColumn(table.columns, options.rowLabelColumn) ?? table.columns[0];
  const requestedCountColumns = parseColumnList(options.countColumns);
  const countColumns = requestedCountColumns.length > 0
    ? requestedCountColumns.map((name) => findColumn(table.columns, name)).filter(Boolean)
    : table.columns.filter((column) => column.id !== rowLabelColumn.id);
  if (countColumns.length !== 2) {
    return { rows: [], warnings: [...warnings, "Fisher's exact test currently requires exactly two selected count columns."], table };
  }

  const matrix = [];
  const rowLabels = [];
  let skippedRows = 0;
  for (const [rowIndex, row] of table.rows.entries()) {
    const counts = [];
    let valid = true;
    for (const column of countColumns) {
      const value = parseStatisticsNumber(row[column.id]);
      if (value === null || value < 0 || !Number.isInteger(value)) {
        valid = false;
        break;
      }
      counts.push(value);
    }
    if (!valid || counts.reduce((sum, value) => sum + value, 0) <= 0) {
      skippedRows += 1;
      continue;
    }
    matrix.push(counts);
    rowLabels.push(String(row[rowLabelColumn.id] ?? "").trim() || `Row ${rowIndex + 1}`);
  }
  if (skippedRows > 0) {
    warnings.push(`Skipped ${skippedRows} row(s) with missing, negative, noninteger, nonnumeric, or all-zero count values.`);
  }
  if (matrix.length !== 2) {
    return { rows: [], warnings: [...warnings, "Fisher's exact test currently requires exactly two non-empty row categories."], table };
  }

  const [[a, b], [c, d]] = matrix;
  const alternative = alternativeLabel(options.alternative);
  const pValue = fisherExactPValue(a, b, c, d, alternative);
  const oddsRatio = formatOddsRatio(a, b, c, d);
  const total = a + b + c + d;
  const suitabilityNotes = total > 1000
    ? "The table is large for an exact enumerated calculation; consider whether an asymptotic test is more appropriate for exploratory work."
    : "";
  if (suitabilityNotes) warnings.push(suitabilityNotes);
  const interpretation = pValue < 0.05
    ? "The Fisher exact-test p value is below 0.05 for the selected 2 x 2 table."
    : "The Fisher exact-test p value is not below 0.05 for the selected 2 x 2 table.";
  const rows = [{
    test: "Fisher exact test",
    row_variable: rowLabelColumn.label,
    column_variable: countColumns.map((column) => column.label).join("; "),
    row_a: rowLabels[0],
    row_b: rowLabels[1],
    column_a: countColumns[0].label,
    column_b: countColumns[1].label,
    a,
    b,
    c,
    d,
    odds_ratio: oddsRatio,
    alternative,
    p_value: round(pValue, 8),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    warnings,
    table,
    report: [
      "Fisher Exact Test",
      `Row category column: ${rowLabelColumn.label}`,
      `Count columns: ${countColumns.map((column) => column.label).join(", ")}`,
      `2 x 2 table: [[${a}, ${b}], [${c}, ${d}]]`,
      `Alternative: ${alternative}`,
      `Odds ratio: ${oddsRatio}`,
      `p=${round(pValue, 8)}`,
      interpretation,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: exact test used for a 2 x 2 count table.",
      "Method note: Fisher's exact test uses fixed row and column margins and sums hypergeometric table probabilities under the selected alternative."
    ].join("\n") + "\n"
  };
}

export function fisherExactRowsToTsv(rows) {
  return [
    fisherExactTestColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => fisherExactTestColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function runMannWhitneyUTest(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "expression") ??
    findColumn(table.columns, "value") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const groupColumn =
    findColumn(table.columns, options.groupColumn) ??
    findColumn(table.columns, "condition") ??
    findColumn(table.columns, "group") ??
    table.columns.find((column) => column.id !== valueColumn?.id && column.type !== "number") ??
    table.columns.find((column) => column.id !== valueColumn?.id);
  if (!valueColumn || !groupColumn) {
    return { rows: [], warnings: [...warnings, "A numeric value column and a group column are required."], table };
  }

  const grouped = numericGroups(table, valueColumn, groupColumn);
  if (grouped.skipped > 0) {
    warnings.push(`Skipped ${grouped.skipped} row(s) with missing group labels or nonnumeric values.`);
  }
  const { groupA, groupB } = chooseGroups(grouped.groups, options);
  const valuesA = grouped.groups.get(groupA) ?? [];
  const valuesB = grouped.groups.get(groupB) ?? [];
  if (valuesA.length < 1 || valuesB.length < 1) {
    return { rows: [], warnings: [...warnings, "Two groups with at least one numeric observation each are required."], table };
  }

  const observations = [
    ...valuesA.map((value) => ({ group: "A", value })),
    ...valuesB.map((value) => ({ group: "B", value }))
  ];
  const { ranks, tieGroups } = rankValues(observations, (observation) => observation.value);
  const rankSumA = observations.reduce((sum, observation, index) => sum + (observation.group === "A" ? ranks[index] : 0), 0);
  const uA = rankSumA - (valuesA.length * (valuesA.length + 1)) / 2;
  const uB = valuesA.length * valuesB.length - uA;
  const meanU = (valuesA.length * valuesB.length) / 2;
  const totalN = observations.length;
  const tieSum = tieGroups.reduce((sum, size) => sum + size ** 3 - size, 0);
  const tieCorrection = totalN > 1 ? tieSum / (totalN * (totalN - 1)) : 0;
  const variance = (valuesA.length * valuesB.length * (totalN + 1 - tieCorrection)) / 12;
  const alternative = alternativeLabel(options.alternative);
  const useContinuity = options.continuityCorrection !== false;
  let corrected = uA - meanU;
  if (useContinuity && corrected !== 0) {
    corrected += alternative === "less" ? 0.5 : alternative === "greater" ? -0.5 : -Math.sign(corrected) * 0.5;
  }
  const z = variance > 0 ? corrected / Math.sqrt(variance) : Number.NaN;
  const pValue = pValueFromNormalZ(z, alternative);
  const suitabilityNotes = [
    tieGroups.length > 0 ? "Tied values are present; SMS3 applies the normal approximation with tie correction." : "",
    Math.min(valuesA.length, valuesB.length) < 5 ? "At least one group has fewer than five observations; exact small-sample inference is not implemented in this tool." : ""
  ].filter(Boolean).join(" ");
  if (suitabilityNotes) warnings.push(suitabilityNotes);
  const interpretation = Number.isFinite(pValue)
    ? pValue < 0.05
      ? "The Mann-Whitney U p value is below 0.05 for the selected groups."
      : "The Mann-Whitney U p value is not below 0.05 for the selected groups."
    : "The Mann-Whitney U p value could not be calculated for the selected groups.";
  const rows = [{
    test: "Mann-Whitney U test",
    value_column: valueColumn.label,
    group_column: groupColumn.label,
    group_a: groupA,
    group_b: groupB,
    n_a: valuesA.length,
    n_b: valuesB.length,
    u_statistic: round(alternative === "two-sided" ? Math.min(uA, uB) : uA),
    u_a: round(uA),
    u_b: round(uB),
    z: round(z),
    p_value: round(pValue, 8),
    alternative,
    tie_correction: round(tieCorrection),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    warnings,
    table,
    report: [
      "Mann-Whitney U Test",
      `Value column: ${valueColumn.label}`,
      `Group column: ${groupColumn.label}`,
      `${groupA}: n=${valuesA.length}`,
      `${groupB}: n=${valuesB.length}`,
      `Alternative: ${alternative}`,
      `U_A=${round(uA)}, U_B=${round(uB)}, z=${round(z)}, p=${round(pValue, 8) || "n/a"}`,
      interpretation,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: no ties or small-group warning from the selected checks.",
      "Method note: the Mann-Whitney U test ranks pooled observations and uses a normal approximation with tie correction."
    ].join("\n") + "\n"
  };
}

export function mannWhitneyRowsToTsv(rows) {
  return [
    mannWhitneyUTestColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => mannWhitneyUTestColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function runWilcoxonSignedRankTest(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const firstColumn =
    findColumn(table.columns, options.firstColumn) ??
    findColumn(table.columns, "before") ??
    table.columns.find((column) => isNumericStatisticsColumn(table.rows, column.id));
  const secondColumn =
    findColumn(table.columns, options.secondColumn) ??
    findColumn(table.columns, "after") ??
    table.columns.find((column) => column.id !== firstColumn?.id && isNumericStatisticsColumn(table.rows, column.id));
  const pairIdColumn = findColumn(table.columns, options.pairIdColumn) ?? findColumn(table.columns, "sample") ?? null;
  if (!firstColumn || !secondColumn) {
    return { rows: [], warnings: [...warnings, "Two numeric paired measurement columns are required."], table };
  }

  const pairs = [];
  let skipped = 0;
  let zeroDifferences = 0;
  for (const row of table.rows) {
    const first = parseStatisticsNumber(row[firstColumn.id]);
    const second = parseStatisticsNumber(row[secondColumn.id]);
    if (first === null || second === null) {
      skipped += 1;
      continue;
    }
    const difference = second - first;
    if (difference === 0) {
      zeroDifferences += 1;
      continue;
    }
    pairs.push({
      pairId: pairIdColumn ? String(row[pairIdColumn.id] ?? "").trim() : "",
      first,
      second,
      difference,
      absoluteDifference: Math.abs(difference)
    });
  }
  if (skipped > 0) warnings.push(`Skipped ${skipped} row(s) with missing or nonnumeric paired values.`);
  if (zeroDifferences > 0) warnings.push(`Removed ${zeroDifferences} zero-difference pair(s) before ranking.`);
  if (pairs.length < 1) {
    return { rows: [], warnings: [...warnings, "At least one nonzero paired difference is required."], table };
  }

  const { ranks, tieGroups } = rankValues(pairs, (pair) => pair.absoluteDifference);
  let positiveRankSum = 0;
  let negativeRankSum = 0;
  for (let index = 0; index < pairs.length; index += 1) {
    if (pairs[index].difference > 0) positiveRankSum += ranks[index];
    else negativeRankSum += ranks[index];
  }
  const n = pairs.length;
  const meanRankSum = (n * (n + 1)) / 4;
  const tieSum = tieGroups.reduce((sum, size) => sum + size ** 3 - size, 0);
  const variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48;
  const alternative = alternativeLabel(options.alternative);
  const useContinuity = options.continuityCorrection !== false;
  let corrected = positiveRankSum - meanRankSum;
  if (useContinuity && corrected !== 0) {
    corrected += alternative === "less" ? 0.5 : alternative === "greater" ? -0.5 : -Math.sign(corrected) * 0.5;
  }
  const z = variance > 0 ? corrected / Math.sqrt(variance) : Number.NaN;
  const pValue = pValueFromNormalZ(z, alternative);
  const suitabilityNotes = [
    tieGroups.length > 0 ? "Tied absolute differences are present; SMS3 applies the normal approximation with tie correction." : "",
    n < 10 ? "There are fewer than ten nonzero pairs; exact small-sample inference is not implemented in this tool." : ""
  ].filter(Boolean).join(" ");
  if (suitabilityNotes) warnings.push(suitabilityNotes);
  const interpretation = Number.isFinite(pValue)
    ? pValue < 0.05
      ? "The Wilcoxon signed-rank p value is below 0.05 for the selected paired columns."
      : "The Wilcoxon signed-rank p value is not below 0.05 for the selected paired columns."
    : "The Wilcoxon signed-rank p value could not be calculated for the selected paired columns.";
  const rows = [{
    test: "Wilcoxon signed-rank test",
    first_column: firstColumn.label,
    second_column: secondColumn.label,
    pair_id_column: pairIdColumn?.label ?? "",
    pair_count: pairs.length + zeroDifferences,
    nonzero_pair_count: pairs.length,
    positive_rank_sum: round(positiveRankSum),
    negative_rank_sum: round(negativeRankSum),
    statistic: round(alternative === "two-sided" ? Math.min(positiveRankSum, negativeRankSum) : positiveRankSum),
    z: round(z),
    p_value: round(pValue, 8),
    alternative,
    zero_difference_count: zeroDifferences,
    tie_correction: round(tieSum / 48),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  return {
    rows,
    warnings,
    table,
    pairs,
    report: [
      "Wilcoxon Signed-Rank Test",
      `First column: ${firstColumn.label}`,
      `Second column: ${secondColumn.label}`,
      pairIdColumn ? `Pair ID column: ${pairIdColumn.label}` : "Pair ID column: not selected",
      `Nonzero pairs: ${pairs.length}`,
      `Alternative: ${alternative}`,
      `W+=${round(positiveRankSum)}, W-=${round(negativeRankSum)}, z=${round(z)}, p=${round(pValue, 8) || "n/a"}`,
      interpretation,
      suitabilityNotes ? `Suitability notes: ${suitabilityNotes}` : "Suitability notes: no tie or small-pair warning from the selected checks.",
      "Method note: the Wilcoxon signed-rank test ranks absolute paired differences after removing zero differences; positive differences are second column minus first column."
    ].join("\n") + "\n"
  };
}

export function wilcoxonSignedRankRowsToTsv(rows) {
  return [
    wilcoxonSignedRankTestColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => wilcoxonSignedRankTestColumns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}
