import { axisRenderOptions, renderScatterSvg } from "./plot-tools.js";
import { isNumericStatisticsColumn, parseStatisticsNumber } from "./statistics-utils.js";
import { findColumn, parseColumnList, parseDelimitedTable } from "./table.js";

export const pcaScoreColumns = [
  { id: "label", label: "Label", type: "string" },
  { id: "group", label: "Group", type: "string" },
  { id: "pc1", label: "PC1 score", type: "number" },
  { id: "pc2", label: "PC2 score", type: "number" }
];

export const pcaLoadingColumns = [
  { id: "variable", label: "Variable", type: "string" },
  { id: "pc1_loading", label: "PC1 loading", type: "number" },
  { id: "pc2_loading", label: "PC2 loading", type: "number" }
];

export const pcaVarianceColumns = [
  { id: "component", label: "Component", type: "string" },
  { id: "eigenvalue", label: "Eigenvalue", type: "number" },
  { id: "variance_percent", label: "Variance percent", type: "number" }
];

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : "";
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleSd(values, valueMean = mean(values)) {
  if (values.length < 2) return Number.NaN;
  const variance = values.reduce((sum, value) => sum + (value - valueMean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function identity(size) {
  return Array.from({ length: size }, (_, rowIndex) =>
    Array.from({ length: size }, (__, columnIndex) => (rowIndex === columnIndex ? 1 : 0))
  );
}

function jacobiEigenDecomposition(matrix) {
  const size = matrix.length;
  const working = matrix.map((row) => row.slice());
  const vectors = identity(size);
  const tolerance = 1e-12;
  const maxSweeps = 100;

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    let p = 0;
    let q = 1;
    let maxOffDiagonal = 0;
    for (let row = 0; row < size; row += 1) {
      for (let column = row + 1; column < size; column += 1) {
        const value = Math.abs(working[row][column]);
        if (value > maxOffDiagonal) {
          maxOffDiagonal = value;
          p = row;
          q = column;
        }
      }
    }
    if (maxOffDiagonal < tolerance) break;

    const app = working[p][p];
    const aqq = working[q][q];
    const apq = working[p][q];
    const angle = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    for (let row = 0; row < size; row += 1) {
      if (row === p || row === q) continue;
      const aip = working[row][p];
      const aiq = working[row][q];
      working[row][p] = c * aip - s * aiq;
      working[p][row] = working[row][p];
      working[row][q] = s * aip + c * aiq;
      working[q][row] = working[row][q];
    }

    working[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    working[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    working[p][q] = 0;
    working[q][p] = 0;

    for (let row = 0; row < size; row += 1) {
      const vip = vectors[row][p];
      const viq = vectors[row][q];
      vectors[row][p] = c * vip - s * viq;
      vectors[row][q] = s * vip + c * viq;
    }
  }

  return Array.from({ length: size }, (_, index) => ({
    value: Math.max(0, working[index][index]),
    vector: vectors.map((row) => row[index])
  })).sort((left, right) => right.value - left.value);
}

function orientEigenvector(vector) {
  let maxIndex = 0;
  for (let index = 1; index < vector.length; index += 1) {
    if (Math.abs(vector[index]) > Math.abs(vector[maxIndex])) {
      maxIndex = index;
    }
  }
  return vector[maxIndex] < 0 ? vector.map((value) => -value) : vector.slice();
}

function covarianceMatrix(centeredRows) {
  const rowCount = centeredRows.length;
  const columnCount = centeredRows[0]?.length ?? 0;
  return Array.from({ length: columnCount }, (_, row) =>
    Array.from({ length: columnCount }, (_, column) => {
      let total = 0;
      for (const values of centeredRows) {
        total += values[row] * values[column];
      }
      return total / Math.max(1, rowCount - 1);
    })
  );
}

function rowsToTsv(columns, rows) {
  return [
    columns.map((column) => column.id).join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column.id] ?? "").replace(/\t/g, " ")).join("\t"))
  ].join("\n");
}

export function pcaScoresToTsv(rows) {
  return rowsToTsv(pcaScoreColumns, rows);
}

export function pcaLoadingsToTsv(rows) {
  return rowsToTsv(pcaLoadingColumns, rows);
}

export function pcaVarianceToTsv(rows) {
  return rowsToTsv(pcaVarianceColumns, rows);
}

export function makePcaPlot(input, options = {}) {
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
      label: String(row[labelColumn?.id] ?? `Row ${rowIndex + 1}`),
      group: groupColumn ? String(row[groupColumn.id] ?? "") : "Data",
      values
    });
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) with missing or nonnumeric selected PCA values.`);
  }
  if (columns.length < 2 || completeRows.length < 2) {
    warnings.push("PCA requires at least two numeric columns and two complete rows.");
    return { table, rows: [], loadingRows: [], varianceRows: [], warnings, report: makePcaReport({ columns: [], rows: [], varianceRows: [], warnings }), svg: renderScatterSvg([], { title: options.title || "PCA plot" }) };
  }

  const columnValues = columns.map((column, columnIndex) => completeRows.map((row) => row.values[columnIndex]));
  const means = columnValues.map((values) => mean(values));
  const sds = columnValues.map((values, index) => sampleSd(values, means[index]));
  const usableIndexes = columns.map((column, index) => ({ column, index, sd: sds[index] }))
    .filter((item) => item.sd > 0 || !scaleColumns);
  const dropped = columns.length - usableIndexes.length;
  if (dropped > 0) {
    warnings.push(`Dropped ${dropped} zero-variance numeric column(s) before PCA.`);
  }
  columns = usableIndexes.map((item) => item.column);
  if (columns.length < 2) {
    warnings.push("At least two nonconstant numeric columns are required after filtering.");
    return { table, rows: [], loadingRows: [], varianceRows: [], warnings, report: makePcaReport({ columns, rows: [], varianceRows: [], warnings }), svg: renderScatterSvg([], { title: options.title || "PCA plot" }) };
  }

  const centeredRows = completeRows.map((row) => usableIndexes.map((item) => {
    const centered = row.values[item.index] - means[item.index];
    return scaleColumns ? centered / item.sd : centered;
  }));
  const eigenPairs = jacobiEigenDecomposition(covarianceMatrix(centeredRows));
  const pc1 = orientEigenvector(eigenPairs[0].vector);
  const pc2 = orientEigenvector(eigenPairs[1].vector);
  const totalVariance = eigenPairs.reduce((sum, pair) => sum + pair.value, 0);
  const scoreRows = completeRows.map((row, rowIndex) => {
    const centered = centeredRows[rowIndex];
    return {
      label: row.label,
      group: row.group || "Data",
      pc1: round(centered.reduce((sum, value, index) => sum + value * pc1[index], 0)),
      pc2: round(centered.reduce((sum, value, index) => sum + value * pc2[index], 0))
    };
  });
  const loadingRows = columns.map((column, index) => ({
    variable: column.label,
    pc1_loading: round(pc1[index]),
    pc2_loading: round(pc2[index])
  }));
  const varianceRows = eigenPairs.slice(0, Math.min(6, eigenPairs.length)).map((pair, index) => ({
    component: `PC${index + 1}`,
    eigenvalue: round(pair.value),
    variance_percent: totalVariance > 0 ? round((pair.value / totalVariance) * 100, 3) : ""
  }));
  const pc1Percent = varianceRows[0]?.variance_percent || 0;
  const pc2Percent = varianceRows[1]?.variance_percent || 0;
  const pointLimit = Math.max(100, Math.min(50000, Number.parseInt(options.maxPointsDrawn, 10) || 5000));
  const svgRows = scoreRows.slice(0, pointLimit).map((row) => ({
    label: row.label,
    x: row.pc1,
    y: row.pc2,
    group: row.group
  }));
  if (scoreRows.length > svgRows.length) {
    warnings.push(`PCA SVG draws the first ${svgRows.length.toLocaleString()} point(s); score TSV contains all ${scoreRows.length.toLocaleString()} complete rows.`);
  }
  return {
    table,
    rows: scoreRows,
    loadingRows,
    varianceRows,
    columns,
    warnings,
    report: makePcaReport({ columns, rows: scoreRows, varianceRows, warnings, scaleColumns }),
    svg: renderScatterSvg(svgRows, {
      title: options.title || "PCA plot",
      xLabel: `PC1 (${pc1Percent}%)`,
      yLabel: `PC2 (${pc2Percent}%)`,
      showLegend: groupColumn !== null,
      ...axisRenderOptions(options, warnings)
    })
  };
}

export function makePcaReport(result) {
  return [
    "PCA plot",
    `Rows used: ${result.rows?.length ?? 0}`,
    `Variables used: ${result.columns?.map((column) => column.label).join(", ") || "none"}`,
    `Column scaling: ${result.scaleColumns === false ? "centered only" : "centered and scaled to sample standard deviation"}`,
    "Explained variance:",
    ...((result.varianceRows ?? []).slice(0, 4).map((row) => `${row.component}: ${row.variance_percent}%`)),
    "Method note: PCA is calculated from the covariance matrix of complete rows after centering and optional column scaling."
  ].join("\n").trimEnd() + "\n";
}
