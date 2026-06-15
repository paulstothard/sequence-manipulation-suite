export const STATISTICS_MISSING_VALUE_TOKENS = new Set(["", "NA", "N/A", "na", "n/a", "null", "NULL", "-"]);

export function normalizeStatisticsCell(value) {
  return String(value ?? "").trim();
}

export function isStatisticsMissingValue(value) {
  return STATISTICS_MISSING_VALUE_TOKENS.has(normalizeStatisticsCell(value));
}

export function parseStatisticsNumber(value) {
  if (isStatisticsMissingValue(value)) {
    return null;
  }
  const numeric = Number(normalizeStatisticsCell(value));
  return Number.isFinite(numeric) ? numeric : null;
}

export function isNumericStatisticsColumn(rows, columnId) {
  let numericCount = 0;
  for (const row of rows) {
    const text = normalizeStatisticsCell(row[columnId]);
    if (isStatisticsMissingValue(text)) {
      continue;
    }
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) {
      return false;
    }
    numericCount += 1;
  }
  return numericCount > 0;
}

export function countMissingOrNonnumeric(rows, columnId) {
  let missing = 0;
  let nonnumeric = 0;
  for (const row of rows) {
    const text = normalizeStatisticsCell(row[columnId]);
    if (isStatisticsMissingValue(text)) {
      missing += 1;
      continue;
    }
    if (!Number.isFinite(Number(text))) {
      nonnumeric += 1;
    }
  }
  return { missing, nonnumeric };
}
