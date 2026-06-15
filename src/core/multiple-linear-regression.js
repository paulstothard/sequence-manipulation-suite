import "../vendor/d3/d3.min.js";
import { fCdf, twoTailedPValue } from "./hypothesis-tests.js";
import { escapeXml } from "./plot-renderer.js";
import { parseStatisticsNumber } from "./statistics-utils.js";
import { findColumn, parseColumnList, parseDelimitedTable } from "./table.js";

export const multipleLinearRegressionModelColumns = [
  { id: "model", label: "Model", type: "string" },
  { id: "response_column", label: "Response column", type: "string" },
  { id: "predictor_columns", label: "Predictor columns", type: "string" },
  { id: "n", label: "n", type: "number" },
  { id: "predictor_count", label: "Predictors", type: "number" },
  { id: "df_model", label: "df model", type: "number" },
  { id: "df_residual", label: "df residual", type: "number" },
  { id: "r_squared", label: "R squared", type: "number" },
  { id: "adjusted_r_squared", label: "Adjusted R squared", type: "number" },
  { id: "residual_standard_error", label: "Residual standard error", type: "number" },
  { id: "f_statistic", label: "F statistic", type: "number" },
  { id: "f_p_value", label: "F p value", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" },
  { id: "suitability_notes", label: "Suitability notes", type: "string" }
];

export const multipleLinearRegressionCoefficientColumns = [
  { id: "term", label: "Term", type: "string" },
  { id: "estimate", label: "Estimate", type: "number" },
  { id: "standard_error", label: "Standard error", type: "number" },
  { id: "t_statistic", label: "t statistic", type: "number" },
  { id: "p_value", label: "p value", type: "number" },
  { id: "df", label: "df", type: "number" },
  { id: "interpretation", label: "Interpretation", type: "string" }
];

export const multipleLinearRegressionFitColumns = [
  { id: "row_index", label: "Source row", type: "number" },
  { id: "label", label: "Label", type: "string" },
  { id: "observed", label: "Observed", type: "number" },
  { id: "fitted", label: "Fitted", type: "number" },
  { id: "residual", label: "Residual", type: "number" }
];

function getD3() {
  return globalThis.d3 ?? null;
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rowsToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function multipleLinearRegressionModelRowsToTsv(rows) {
  return rowsToTsv(multipleLinearRegressionModelColumns, rows);
}

export function multipleLinearRegressionCoefficientRowsToTsv(rows) {
  return rowsToTsv(multipleLinearRegressionCoefficientColumns, rows);
}

export function multipleLinearRegressionFitRowsToTsv(rows) {
  return rowsToTsv(multipleLinearRegressionFitColumns, rows);
}

function invertMatrix(matrix, tolerance = 1e-12) {
  const size = matrix.length;
  const working = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, col) => (col === index ? 1 : 0))
  ]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(working[row][column]) > Math.abs(working[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(working[pivot][column]) <= tolerance) {
      return null;
    }
    [working[column], working[pivot]] = [working[pivot], working[column]];
    const pivotValue = working[column][column];
    for (let col = 0; col < size * 2; col += 1) {
      working[column][col] /= pivotValue;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = working[row][column];
      if (Math.abs(factor) <= tolerance) continue;
      for (let col = 0; col < size * 2; col += 1) {
        working[row][col] -= factor * working[column][col];
      }
    }
  }
  return working.map((row) => row.slice(size));
}

function fitOls(design, response) {
  const columnCount = design[0]?.length ?? 0;
  const xtx = Array.from({ length: columnCount }, () => Array(columnCount).fill(0));
  const xty = Array(columnCount).fill(0);
  for (let row = 0; row < design.length; row += 1) {
    for (let i = 0; i < columnCount; i += 1) {
      xty[i] += design[row][i] * response[row];
      for (let j = 0; j < columnCount; j += 1) {
        xtx[i][j] += design[row][i] * design[row][j];
      }
    }
  }
  const xtxInverse = invertMatrix(xtx);
  if (!xtxInverse) return null;
  const coefficients = xtxInverse.map((row) => row.reduce((sum, value, index) => sum + value * xty[index], 0));
  return { coefficients, xtxInverse };
}

function extent(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [0, 1];
  const d3Extent = getD3()?.extent?.(finite);
  let min = Number.isFinite(d3Extent?.[0]) ? d3Extent[0] : Math.min(...finite);
  let max = Number.isFinite(d3Extent?.[1]) ? d3Extent[1] : Math.max(...finite);
  if (min === max) {
    min -= 0.5;
    max += 0.5;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  const d3 = getD3();
  if (d3?.scaleLinear) {
    return d3.scaleLinear().domain([domainMin, domainMax]).range([rangeMin, rangeMax])(value);
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
  return Number(value.toFixed(3)).toString();
}

function makeTicks(min, max, count = 5) {
  const d3 = getD3();
  if (d3?.scaleLinear) {
    const ticks = d3.scaleLinear().domain([min, max]).nice(count).ticks(count);
    if (ticks.length > 0) {
      return ticks;
    }
  }
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

export function renderMultipleRegressionResidualSvg(result, options = {}) {
  const rows = result.fitRows ?? [];
  const width = 900;
  const height = 480;
  const margin = { top: 70, right: 34, bottom: 68, left: 84 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const title = options.title || "Multiple linear regression residuals";
  if (rows.length === 0) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="300" viewBox="0 0 ${width} 300" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-residual-plot-svg" data-plot-renderer="sms3-d3">`,
      '<rect width="900" height="300" fill="white"/>',
      `<text x="34" y="42" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#263238">${escapeXml(title)}</text>`,
      '<text x="34" y="86" font-family="system-ui, sans-serif" font-size="14" fill="#455a64">No complete rows were available for residual plotting.</text>',
      "</svg>"
    ].join("");
  }
  const [xMin, xMax] = extent(rows.map((row) => row.fitted));
  const [rawYMin, rawYMax] = extent(rows.map((row) => row.residual));
  const yMaxAbs = Math.max(Math.abs(rawYMin), Math.abs(rawYMax), 1);
  const yMin = -yMaxAbs * 1.08;
  const yMax = yMaxAbs * 1.08;
  const xTicks = makeTicks(xMin, xMax).filter((tick) => tick >= xMin && tick <= xMax);
  const yTicks = makeTicks(yMin, yMax).filter((tick) => tick >= yMin && tick <= yMax);
  const zeroY = scale(0, yMin, yMax, plotHeight, 0);
  const maxPoints = Number.isFinite(Number(options.maxPlotPoints)) ? Math.max(0, Number(options.maxPlotPoints)) : 500;
  const drawnRows = rows.slice(0, maxPoints);
  const omitted = rows.length - drawnRows.length;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-residual-plot-svg" data-plot-renderer="sms3-d3">`,
    "<style>",
    ".title{font:700 20px system-ui,sans-serif;fill:#263238}",
    ".axis{stroke:#455a64;stroke-width:1.2}",
    ".grid{stroke:#d9e2e8;stroke-width:1}",
    ".zero{stroke:#111827;stroke-width:1.4;stroke-dasharray:5 4}",
    ".tick{font:11px system-ui,sans-serif;fill:#455a64}",
    ".label{font:13px system-ui,sans-serif;fill:#263238}",
    ".note{font:12px system-ui,sans-serif;fill:#607d8b}",
    "</style>",
    `<rect width="${width}" height="${height}" fill="white"/>`,
    `<text class="title" x="34" y="34">${escapeXml(title)}</text>`,
    `<text class="note" x="34" y="56">Residuals versus fitted values; ${escapeXml(String(rows.length))} complete row(s) fitted${omitted > 0 ? `, ${omitted} point(s) omitted from SVG` : ""}.</text>`,
    `<g transform="translate(${margin.left} ${margin.top})">`,
    ...xTicks.map((tick) => {
      const x = scale(tick, xMin, xMax, 0, plotWidth);
      return `<line class="grid" x1="${x}" x2="${x}" y1="0" y2="${plotHeight}"/><text class="tick" x="${x}" y="${plotHeight + 20}" text-anchor="middle">${escapeXml(niceNumber(tick))}</text>`;
    }),
    ...yTicks.map((tick) => {
      const y = scale(tick, yMin, yMax, plotHeight, 0);
      return `<line class="grid" x1="0" x2="${plotWidth}" y1="${y}" y2="${y}"/><text class="tick" x="-10" y="${y + 4}" text-anchor="end">${escapeXml(niceNumber(tick))}</text>`;
    }),
    `<line class="zero" x1="0" x2="${plotWidth}" y1="${zeroY}" y2="${zeroY}"/>`,
    `<line class="axis" x1="0" x2="${plotWidth}" y1="${plotHeight}" y2="${plotHeight}"/>`,
    `<line class="axis" x1="0" x2="0" y1="0" y2="${plotHeight}"/>`,
    ...drawnRows.map((row) => {
      const x = scale(row.fitted, xMin, xMax, 0, plotWidth);
      const y = scale(row.residual, yMin, yMax, plotHeight, 0);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="#2563eb" fill-opacity="0.72"><title>${escapeXml(`${row.label}: observed=${row.observed}, fitted=${row.fitted}, residual=${row.residual}`)}</title></circle>`;
    }),
    "</g>",
    `<text class="label" x="${width / 2}" y="${height - 18}" text-anchor="middle">Fitted value</text>`,
    `<text class="label" transform="translate(18 ${height / 2}) rotate(-90)" text-anchor="middle">Residual</text>`,
    "</svg>"
  ].join("");
}

export function calculateMultipleLinearRegression(input, options = {}) {
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  const warnings = [...table.warnings];
  const numericColumns = table.columns.filter((column) => column.type === "number");
  const responseColumn =
    findColumn(table.columns, options.responseColumn) ??
    findColumn(table.columns, "response") ??
    numericColumns[numericColumns.length - 1];
  const requestedPredictors = parseColumnList(options.predictorColumns);
  const requestedPredictorColumns = requestedPredictors.map((name) => findColumn(table.columns, name));
  const rawPredictorColumns = requestedPredictors.length > 0
    ? requestedPredictorColumns.filter(Boolean)
    : numericColumns.filter((column) => column.id !== responseColumn?.id).slice(0, 6);
  const predictorColumns = [];
  const seenPredictorIds = new Set();
  for (const column of rawPredictorColumns) {
    if (column.id === responseColumn?.id) {
      warnings.push(`Ignored predictor "${column.label}" because it is also the response column.`);
      continue;
    }
    if (seenPredictorIds.has(column.id)) {
      warnings.push(`Ignored duplicate predictor column "${column.label}".`);
      continue;
    }
    seenPredictorIds.add(column.id);
    predictorColumns.push(column);
  }
  const labelColumn = findColumn(table.columns, options.labelColumn) ?? table.columns[0] ?? null;
  if (requestedPredictors.length > 0 && requestedPredictorColumns.some((column) => !column)) {
    warnings.push("One or more requested predictor columns could not be found.");
  }
  if (!responseColumn || predictorColumns.length === 0) {
    warnings.push("A numeric response column and at least one numeric predictor column are required.");
    return { table, rows: [], coefficientRows: [], fitRows: [], warnings, report: makeMultipleLinearRegressionReport({ rows: [], coefficientRows: [], fitRows: [], warnings }), svg: renderMultipleRegressionResidualSvg({ fitRows: [] }, options) };
  }
  if (predictorColumns.length > 12) {
    warnings.push("At most 12 predictor columns are supported in the browser tool.");
    return { table, rows: [], coefficientRows: [], fitRows: [], warnings, report: makeMultipleLinearRegressionReport({ rows: [], coefficientRows: [], fitRows: [], warnings }), svg: renderMultipleRegressionResidualSvg({ fitRows: [] }, options) };
  }

  const design = [];
  const response = [];
  const labels = [];
  const sourceRowIndexes = [];
  let skipped = 0;
  for (let index = 0; index < table.rows.length; index += 1) {
    const row = table.rows[index];
    const y = parseStatisticsNumber(row[responseColumn.id]);
    const predictors = predictorColumns.map((column) => parseStatisticsNumber(row[column.id]));
    if (y === null || predictors.some((value) => value === null)) {
      skipped += 1;
      continue;
    }
    design.push([1, ...predictors]);
    response.push(y);
    labels.push(String(row[labelColumn?.id] ?? `Row ${index + 1}`));
    sourceRowIndexes.push(index + 1);
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) without complete numeric values for the selected response and predictors.`);
  }
  const parameterCount = predictorColumns.length + 1;
  const dfResidual = response.length - parameterCount;
  if (dfResidual <= 0) {
    warnings.push(`At least ${parameterCount + 1} complete rows are required for ${predictorColumns.length} predictor(s).`);
    return { table, rows: [], coefficientRows: [], fitRows: [], warnings, report: makeMultipleLinearRegressionReport({ rows: [], coefficientRows: [], fitRows: [], warnings }), svg: renderMultipleRegressionResidualSvg({ fitRows: [] }, options) };
  }

  const fit = fitOls(design, response);
  if (!fit) {
    warnings.push("The selected predictor columns are collinear or otherwise singular; remove redundant predictors and try again.");
    return { table, rows: [], coefficientRows: [], fitRows: [], warnings, report: makeMultipleLinearRegressionReport({ rows: [], coefficientRows: [], fitRows: [], warnings }), svg: renderMultipleRegressionResidualSvg({ fitRows: [] }, options) };
  }

  const fittedExact = design.map((row) => row.reduce((sum, value, index) => sum + value * fit.coefficients[index], 0));
  const residualExact = response.map((value, index) => value - fittedExact[index]);
  const yMean = mean(response);
  const sse = residualExact.reduce((sum, value) => sum + value ** 2, 0);
  const tss = response.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const mse = sse / dfResidual;
  const residualStandardError = Math.sqrt(mse);
  const rSquared = tss > 0 ? 1 - sse / tss : Number.NaN;
  const adjustedRSquared = Number.isFinite(rSquared)
    ? 1 - (1 - rSquared) * ((response.length - 1) / dfResidual)
    : Number.NaN;
  const dfModel = predictorColumns.length;
  const ssr = Math.max(0, tss - sse);
  const fStatistic = dfModel > 0 && mse > 0 ? (ssr / dfModel) / mse : Number.NaN;
  const fPValue = Number.isFinite(fStatistic) ? Math.min(1, Math.max(0, 1 - fCdf(fStatistic, dfModel, dfResidual))) : "";
  const coefficientRows = fit.coefficients.map((estimate, index) => {
    const se = Math.sqrt(Math.max(0, mse * fit.xtxInverse[index][index]));
    const tStatistic = se > 0 ? estimate / se : Number.NaN;
    const pValue = Number.isFinite(tStatistic) ? twoTailedPValue(tStatistic, dfResidual) : "";
    const significant = typeof pValue === "number" && Number.isFinite(pValue) && pValue < 0.05;
    return {
      term: index === 0 ? "Intercept" : predictorColumns[index - 1].label,
      estimate: round(estimate),
      standard_error: round(se),
      t_statistic: round(tStatistic),
      p_value: round(pValue, 8),
      df: dfResidual,
      interpretation: significant ? "Term p value is below 0.05." : "Term p value is not below 0.05."
    };
  });
  const fitRows = response.map((observed, index) => ({
    row_index: sourceRowIndexes[index],
    label: labels[index],
    observed: round(observed),
    fitted: round(fittedExact[index]),
    residual: round(residualExact[index])
  }));
  const suitabilityNotes = [
    response.length < 12 ? "Small sample size for a multi-predictor model; inspect residuals and overfitting risk." : "",
    predictorColumns.length > 6 ? "Many predictors can make interpretation unstable without enough rows." : "",
    "OLS assumes independent observations, approximately linear additive predictor effects, and roughly constant residual variance."
  ].filter(Boolean).join(" ");
  if (response.length < 12) warnings.push("Small sample size for a multi-predictor model; inspect residuals and overfitting risk.");
  const modelSignificant = typeof fPValue === "number" && Number.isFinite(fPValue) && fPValue < 0.05;
  const interpretation = modelSignificant
    ? "The overall model F-test p value is below 0.05."
    : "The overall model F-test p value is not below 0.05.";
  const rows = [{
    model: "Multiple linear regression",
    response_column: responseColumn.label,
    predictor_columns: predictorColumns.map((column) => column.label).join("; "),
    n: response.length,
    predictor_count: predictorColumns.length,
    df_model: dfModel,
    df_residual: dfResidual,
    r_squared: round(rSquared),
    adjusted_r_squared: round(adjustedRSquared),
    residual_standard_error: round(residualStandardError),
    f_statistic: round(fStatistic),
    f_p_value: round(fPValue, 8),
    interpretation,
    suitability_notes: suitabilityNotes
  }];
  const result = {
    table,
    responseColumn,
    predictorColumns,
    rows,
    coefficientRows,
    fitRows,
    warnings
  };
  return {
    ...result,
    report: makeMultipleLinearRegressionReport(result),
    svg: renderMultipleRegressionResidualSvg({ ...result, fitRows }, options)
  };
}

export function makeMultipleLinearRegressionReport(result) {
  const model = result.rows?.[0];
  if (!model) {
    return [
      "Multiple linear regression",
      "No model was fitted.",
      ...(result.warnings ?? []).map((warning) => `Warning: ${warning}`)
    ].join("\n").trimEnd() + "\n";
  }
  return [
    "Multiple linear regression",
    `Response column: ${model.response_column}`,
    `Predictor columns: ${model.predictor_columns}`,
    `Complete rows: ${model.n}`,
    `R squared: ${model.r_squared}`,
    `Adjusted R squared: ${model.adjusted_r_squared}`,
    `Residual standard error: ${model.residual_standard_error} on ${model.df_residual} df`,
    `Overall F(${model.df_model}, ${model.df_residual}) = ${model.f_statistic}, p = ${model.f_p_value}`,
    model.interpretation,
    `Suitability notes: ${model.suitability_notes}`,
    "Method note: ordinary least squares is fit with an intercept. Rows with missing or nonnumeric selected values are excluded before fitting."
  ].join("\n") + "\n";
}
