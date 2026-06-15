import { exportDelimitedTable } from "./table.js";
import { makeUpsetStyleSvg } from "./upset-plot.js";
import { makeVennDiagramSvg, VENN_DIAGRAM_MAX_LISTS } from "./venn-diagram.js";

const CANCELLATION_CHECK_INTERVAL = 4096;

function checkCancellation(context, counter) {
  if (counter % CANCELLATION_CHECK_INTERVAL === 0) {
    context.throwIfCancelled?.();
  }
}

export const listOverlapColumns = [
  { id: "item", label: "Item", type: "string" },
  { id: "list_count", label: "List count", type: "number" },
  { id: "lists", label: "Lists", type: "string" },
  { id: "counts_by_list", label: "Counts by list", type: "string" },
  { id: "total_count", label: "Total count", type: "number" },
  { id: "membership_key", label: "Membership key", type: "string" },
  { id: "category", label: "Category", type: "string" }
];

export function listName(index) {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  return `L${index + 1}`;
}

function parseInputLists(input, separator) {
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  const lists = [[]];
  for (const line of lines) {
    if (line.trim() === separator) {
      lists.push([]);
    } else {
      lists[lists.length - 1].push(line);
    }
  }
  if (lists.length === 1) {
    return {
      lists,
      warnings: [`Separator line "${separator}" was not found; all input was treated as list A.`]
    };
  }
  return {
    lists,
    warnings: []
  };
}

function normalizeItem(item, options) {
  const trimmed = options.trimItems !== false ? String(item ?? "").trim() : String(item ?? "");
  return options.caseSensitive === true ? trimmed : trimmed.toLowerCase();
}

function countItems(lines, options, context = {}) {
  const counts = new Map();
  const labels = new Map();
  for (const [index, line] of lines.entries()) {
    checkCancellation(context, index);
    const label = options.trimItems !== false ? String(line ?? "").trim() : String(line ?? "");
    if (!label || (options.ignoreCommentLines !== false && label.startsWith("#"))) {
      continue;
    }
    const key = normalizeItem(label, options);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!labels.has(key)) {
      labels.set(key, label);
    }
  }
  return { counts, labels };
}

function orderedKeys(countSets, context = {}) {
  const keys = [];
  const seen = new Set();
  let checked = 0;
  for (const counts of countSets) {
    for (const key of counts.keys()) {
      checked += 1;
      checkCancellation(context, checked);
      if (!seen.has(key)) {
        keys.push(key);
        seen.add(key);
      }
    }
  }
  return keys;
}

export function compareLists(input, options = {}, context = {}) {
  context.throwIfCancelled?.();
  const separator = String(options.separator ?? "---").trim() || "---";
  const parsed = parseInputLists(input, separator);
  const lists = parsed.lists.map((list) => countItems(list, options, context));
  const rows = orderedKeys(lists.map((list) => list.counts), context).map((key, index) => {
    checkCancellation(context, index);
    const counts = lists.map((list) => list.counts.get(key) ?? 0);
    const presentIndexes = counts.map((count, index) => count > 0 ? index : -1).filter((index) => index >= 0);
    const item = lists.find((list) => list.labels.has(key))?.labels.get(key) ?? key;
    const listNames = presentIndexes.map(listName);
    const category = presentIndexes.length === lists.length
      ? "shared_all"
      : presentIndexes.length === 1
        ? `${listNames[0].toLowerCase()}_only`
        : `shared_${listNames.join("").toLowerCase()}`;
    return {
      item,
      list_count: presentIndexes.length,
      lists: listNames.join(","),
      counts_by_list: counts.map((count, index) => `${listName(index)}:${count}`).join("; "),
      total_count: counts.reduce((sum, count) => sum + count, 0),
      membership_key: lists.map((list, index) => list.counts.has(key) ? listName(index) : "-").join(""),
      category
    };
  });
  const shared = rows.filter((row) => row.category === "shared_all");
  const uniqueToOneList = rows.filter((row) => row.list_count === 1);
  const categoryRows = summarizeOverlapCategories(rows, lists.length);
  const perListLines = lists.map((list, index) => `List ${listName(index)} unique items: ${list.counts.size}`);
  const uniquePerListLines = lists.map((list, index) => {
    const name = listName(index);
    return `Unique to list ${name}: ${rows.filter((row) => row.lists === name).length}`;
  });
  const report = [
    "List overlap summary",
    "",
    `Lists compared: ${lists.length}`,
    ...perListLines,
    `Shared by all lists: ${shared.length}`,
    `Present in exactly one list: ${uniqueToOneList.length}`,
    ...uniquePerListLines,
    `Case-sensitive: ${options.caseSensitive === true ? "yes" : "no"}`
  ].join("\n");

  return {
    rows,
    shared,
    uniqueToOneList,
    aOnly: rows.filter((row) => row.category === "a_only"),
    bOnly: rows.filter((row) => row.category === "b_only"),
    categoryRows,
    listCount: lists.length,
    listSizes: lists.map((list) => list.counts.size),
    report,
    warnings: parsed.warnings
  };
}

function summarizeOverlapCategories(rows, listCount) {
  const byKey = new Map();
  for (const row of rows) {
    const key = row.membership_key;
    if (!byKey.has(key)) {
      byKey.set(key, {
        membership_key: key,
        lists: row.lists,
        list_count: row.list_count,
        item_count: 0,
        total_count: 0
      });
    }
    const summary = byKey.get(key);
    summary.item_count += 1;
    summary.total_count += row.total_count;
  }
  return [...byKey.values()].sort((left, right) =>
    right.item_count - left.item_count ||
    right.list_count - left.list_count ||
    left.membership_key.localeCompare(right.membership_key, undefined, { numeric: true })
  ).map((row) => ({
    ...row,
    membership: Array.from({ length: listCount }, (_, index) => row.membership_key[index] !== "-")
  }));
}

export function makeListOverlapTableTsv(rows) {
  return exportDelimitedTable(listOverlapColumns, rows, "\t");
}

export function formatItemList(rows) {
  return rows.map((row) => row.item).join("\n");
}

export function makeListOverlapVennSvg(result, options = {}) {
  const listCount = result.listCount ?? 2;
  return makeVennDiagramSvg({
    title: options.title || "Venn diagram",
    setLabels: Array.from({ length: listCount }, (_, index) => listName(index)),
    setSizes: result.listSizes ?? [],
    intersections: result.categoryRows ?? []
  });
}

export { VENN_DIAGRAM_MAX_LISTS };

export function makeListOverlapUpsetSvg(result, options = {}) {
  const listCount = result.listCount ?? 0;
  const maxIntersections = Math.max(1, Number.parseInt(options.maxIntersections ?? 24, 10) || 24);
  return makeUpsetStyleSvg({
    title: "List overlap UpSet-style plot",
    subtitle: "Top bars show set sizes; right bars show intersection sizes; dots show list membership.",
    setLabels: Array.from({ length: listCount }, (_, index) => listName(index)),
    setSizes: result.listSizes ?? [],
    intersections: (result.categoryRows ?? []).map((row) => ({
      membership: row.membership,
      count: row.item_count
    })),
    maxIntersections,
    scaleMode: options.scaleMode,
    ariaLabel: "UpSet-style list overlap plot"
  });
}
