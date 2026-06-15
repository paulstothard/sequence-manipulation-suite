export const DEFAULT_TABLE_FULL_RENDER_ROW_LIMIT = 1000;
export const DEFAULT_TABLE_FULL_RENDER_CELL_LIMIT = 20000;

export function compareTableValues(left, right, type) {
  if (type === "number") {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
  }
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

export function getTableColumns(stream) {
  const rows = stream?.rows ?? [];
  return stream?.columns?.length > 0
    ? stream.columns
    : Object.keys(rows[0] ?? {}).map((id) => ({ id, label: id }));
}

export function getVisibleTableColumns(columns, hiddenColumns = new Set()) {
  const visibleColumns = columns.filter((column) => !hiddenColumns.has(column.id));
  return visibleColumns.length > 0 ? visibleColumns : columns;
}

export function getSortedTableRows(rows, columns, { sortColumn = null, sortDirection = "asc" } = {}) {
  if (!sortColumn) {
    return rows;
  }
  const column = columns.find((item) => item.id === sortColumn);
  if (!column) {
    return rows;
  }
  const direction = sortDirection === "desc" ? -1 : 1;
  return [...rows].sort((left, right) =>
    compareTableValues(left[sortColumn], right[sortColumn], column.type) * direction
  );
}

export function getTableDisplayInfo(
  sortedRows,
  visibleColumns,
  {
    rowLimit = DEFAULT_TABLE_FULL_RENDER_ROW_LIMIT,
    cellLimit = DEFAULT_TABLE_FULL_RENDER_CELL_LIMIT
  } = {}
) {
  const cellCount = sortedRows.length * Math.max(1, visibleColumns.length);
  const isPreview = sortedRows.length > rowLimit || cellCount > cellLimit;
  if (!isPreview) {
    return {
      displayedRows: sortedRows,
      isPreview,
      displayLimit: sortedRows.length,
      cellCount
    };
  }

  const rowLimitFromCells = Math.max(1, Math.floor(cellLimit / Math.max(1, visibleColumns.length)));
  const displayLimit = Math.min(rowLimit, rowLimitFromCells);
  return {
    displayedRows: sortedRows.slice(0, displayLimit),
    isPreview,
    displayLimit,
    cellCount
  };
}

export function getTableViewData(stream, tableState = {}) {
  const rows = stream?.rows ?? [];
  const columns = getTableColumns(stream);
  const visibleColumns = getVisibleTableColumns(columns, tableState.hiddenColumns ?? new Set());
  const sortedRows = getSortedTableRows(rows, visibleColumns, tableState);
  const displayInfo = getTableDisplayInfo(sortedRows, visibleColumns);
  return { rows, columns, visibleColumns, sortedRows, ...displayInfo };
}

export function getColumnPresetDefinitions(columns) {
  const ids = new Set(columns.map((column) => column.id));
  const presets = [{ id: "all", label: "All columns", columnIds: columns.map((column) => column.id) }];
  if (columns.length > 6) {
    presets.push({
      id: "summary",
      label: "Summary",
      columnIds: columns.slice(0, Math.min(6, columns.length)).map((column) => column.id)
    });
  }
  const coordinateIds = columns
    .filter((column) => /(^|_)(start|end|length|strand|frame|position|query|reference|ref)/i.test(column.id))
    .map((column) => column.id);
  if (coordinateIds.length > 0 && coordinateIds.length < columns.length) {
    presets.push({ id: "coordinates", label: "Coordinates", columnIds: coordinateIds });
  }
  const referenceIds = columns
    .filter((column) => /(motif|reference|source|database|class|name|id)/i.test(column.id))
    .map((column) => column.id);
  if (referenceIds.length > 0 && referenceIds.length < columns.length) {
    presets.push({ id: "reference", label: "Reference", columnIds: referenceIds });
  }
  return presets.filter((preset, index, all) =>
    preset.columnIds.length > 0 &&
    preset.columnIds.every((id) => ids.has(id)) &&
    all.findIndex((item) => item.id === preset.id) === index
  );
}

export function getHiddenColumnsForPreset(columns, presetId) {
  const presets = getColumnPresetDefinitions(columns);
  const selected = presets.find((item) => item.id === presetId) ?? presets[0];
  const visibleIds = new Set(selected.columnIds);
  return {
    preset: selected,
    hiddenColumns: new Set(columns.map((column) => column.id).filter((id) => !visibleIds.has(id)))
  };
}

export function getTableActionScopeText({ isPreview, hasHiddenColumns }) {
  if (isPreview) {
    return "previewed rows and visible columns";
  }
  if (hasHiddenColumns) {
    return "all rows and visible columns";
  }
  return "the full table";
}
