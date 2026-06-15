import { findColumn, parseColumnList, parseDelimitedTable } from "./table.js";
import { renderHeatmapSvg, plotRowsToTsv } from "./plot-tools.js";
import { isNumericStatisticsColumn, parseStatisticsNumber } from "./statistics-utils.js";

export const tableCorrelationColumns = [
  { id: "row_column", label: "Row column", type: "string" },
  { id: "column", label: "Column", type: "string" },
  { id: "n", label: "Paired n", type: "number" },
  { id: "correlation", label: "Pearson r", type: "number" },
  { id: "spearman", label: "Spearman rho", type: "number" },
  { id: "kendall", label: "Kendall tau-b", type: "number" },
  { id: "covariance", label: "Sample covariance", type: "number" }
];

function asNumber(value) {
  return parseStatisticsNumber(value);
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values, valueMean = mean(values)) {
  if (values.length < 2) return Number.NaN;
  return values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1);
}

function sampleCovariance(xValues, yValues, xMean = mean(xValues), yMean = mean(yValues)) {
  if (xValues.length < 2 || yValues.length < 2 || xValues.length !== yValues.length) return Number.NaN;
  let total = 0;
  for (let index = 0; index < xValues.length; index += 1) {
    total += (xValues[index] - xMean) * (yValues[index] - yMean);
  }
  return total / (xValues.length - 1);
}

function pearsonCorrelation(xValues, yValues) {
  if (xValues.length < 2 || yValues.length < 2 || xValues.length !== yValues.length) return Number.NaN;
  const xMean = mean(xValues);
  const yMean = mean(yValues);
  const covariance = sampleCovariance(xValues, yValues, xMean, yMean);
  const denominator = Math.sqrt(sampleVariance(xValues, xMean) * sampleVariance(yValues, yMean));
  return denominator > 0 ? covariance / denominator : Number.NaN;
}

function averageRanks(values) {
  // Spearman's rho is Pearson correlation on ranks; tied values receive average ranks.
  // See Spearman C. 1904. The proof and measurement of association between two things.
  const sorted = values.map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value || left.index - right.index);
  const ranks = Array(values.length).fill(0);
  let index = 0;
  while (index < sorted.length) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) {
      end += 1;
    }
    const averageRank = (index + 1 + end) / 2;
    for (let offset = index; offset < end; offset += 1) {
      ranks[sorted[offset].index] = averageRank;
    }
    index = end;
  }
  return ranks;
}

function spearmanCorrelation(xValues, yValues) {
  if (xValues.length < 2 || yValues.length < 2 || xValues.length !== yValues.length) return Number.NaN;
  return pearsonCorrelation(averageRanks(xValues), averageRanks(yValues));
}

function kendallTauB(xValues, yValues) {
  // Kendall tau-b corrects for ties in either variable by separating concordant,
  // discordant, x-only tie, and y-only tie pairs. See Kendall MG. 1938.
  if (xValues.length < 2 || yValues.length < 2 || xValues.length !== yValues.length) return Number.NaN;
  let concordant = 0;
  let discordant = 0;
  let xOnlyTies = 0;
  let yOnlyTies = 0;
  for (let i = 0; i < xValues.length - 1; i += 1) {
    for (let j = i + 1; j < xValues.length; j += 1) {
      const xCompare = Math.sign(xValues[i] - xValues[j]);
      const yCompare = Math.sign(yValues[i] - yValues[j]);
      if (xCompare === 0 && yCompare === 0) continue;
      if (xCompare === 0) {
        xOnlyTies += 1;
      } else if (yCompare === 0) {
        yOnlyTies += 1;
      } else if (xCompare === yCompare) {
        concordant += 1;
      } else {
        discordant += 1;
      }
    }
  }
  const denominator = Math.sqrt((concordant + discordant + xOnlyTies) * (concordant + discordant + yOnlyTies));
  return denominator > 0 ? (concordant - discordant) / denominator : Number.NaN;
}

function pairedValues(rows, xColumn, yColumn) {
  const x = [];
  const y = [];
  for (const row of rows) {
    const xValue = asNumber(row[xColumn.id]);
    const yValue = asNumber(row[yColumn.id]);
    if (xValue === null || yValue === null) continue;
    x.push(xValue);
    y.push(yValue);
  }
  return { x, y };
}

export function calculateTableCorrelationMatrix(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const requestedColumns = parseColumnList(options.numericColumns);
  const columns = requestedColumns.length > 0
    ? requestedColumns.map((name) => findColumn(table.columns, name)).filter(Boolean)
    : table.columns.filter((column) => isNumericStatisticsColumn(table.rows, column.id));
  const warnings = [...table.warnings];
  if (requestedColumns.length > 0 && columns.length !== requestedColumns.length) {
    warnings.push("One or more requested numeric columns could not be found.");
  }
  if (columns.length < 2) {
    warnings.push("At least two numeric columns are required for pairwise statistics.");
  }
  for (const column of columns) {
    const values = table.rows.map((row) => asNumber(row[column.id])).filter((value) => value !== null);
    const missing = table.rows.length - values.length;
    const variance = sampleVariance(values);
    if (missing > 0) {
      warnings.push(`${column.label}: skipped ${missing} missing or nonnumeric value(s) in pairwise calculations.`);
    }
    if (values.length >= 2 && variance === 0) {
      warnings.push(`${column.label}: zero variance; correlations involving this column are reported as n/a when the statistic is undefined.`);
    }
  }

  const rows = [];
  for (const rowColumn of columns) {
    for (const column of columns) {
      const { x, y } = pairedValues(table.rows, rowColumn, column);
      const xMean = x.length > 0 ? mean(x) : Number.NaN;
      const yMean = y.length > 0 ? mean(y) : Number.NaN;
      const covariance = sampleCovariance(x, y, xMean, yMean);
      rows.push({
        row_column: rowColumn.label,
        column: column.label,
        n: x.length,
        correlation: round(pearsonCorrelation(x, y)),
        spearman: round(spearmanCorrelation(x, y)),
        kendall: round(kendallTauB(x, y)),
        covariance: round(covariance)
      });
    }
  }
  return { table, columns, rows, warnings };
}

export function makeCorrelationReport(result) {
  return [
    "Correlation / covariance matrix",
    `Numeric columns compared: ${result.columns.length}`,
    `Pairwise comparisons: ${result.rows.length}`,
    "Method: Pearson r, Spearman rho, Kendall tau-b, and sample covariance use pairwise-complete numeric observations for each column pair. Spearman uses average ranks for ties; Kendall uses the tau-b tie correction.",
    "",
    ...result.rows
      .filter((row) => row.row_column !== row.column)
      .slice(0, 12)
      .map((row) => `${row.row_column} vs ${row.column}: n=${row.n}, Pearson r=${row.correlation || "n/a"}, Spearman rho=${row.spearman || "n/a"}, Kendall tau-b=${row.kendall || "n/a"}, covariance=${row.covariance || "n/a"}`)
  ].join("\n").trimEnd() + "\n";
}

export function makeCorrelationHeatmap(result, options = {}) {
  const metric = ["covariance", "spearman", "kendall"].includes(options.metric) ? options.metric : "correlation";
  const metricLabels = {
    correlation: "Pearson r",
    spearman: "Spearman rho",
    kendall: "Kendall tau-b",
    covariance: "Sample covariance"
  };
  const valueLabel = metricLabels[metric];
  const defaultTitle = metric === "covariance" ? "Covariance heatmap" : `${valueLabel} heatmap`;
  const isCorrelationMetric = metric !== "covariance";
  return renderHeatmapSvg(
    result.rows.map((row) => ({
      x: row.column,
      y: row.row_column,
      value: row[metric] === "" ? Number.NaN : row[metric],
      count: row.n
    })),
    {
      title: options.title || defaultTitle,
      xLabel: "Column",
      yLabel: "Column",
      valueLabel,
      colorDomain: isCorrelationMetric ? [-1, 1] : undefined,
      colorScale: isCorrelationMetric ? "red-blue" : "blue"
    }
  );
}

export function correlationRowsToTsv(rows) {
  return plotRowsToTsv(tableCorrelationColumns, rows);
}
