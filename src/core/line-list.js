const SPLIT_DELIMITERS = {
  lines: /\r\n?|\n/u,
  comma: /,/u,
  semicolon: /;/u,
  tab: /\t/u,
  whitespace: /\s+/u
};

const JOIN_DELIMITERS = {
  lines: "\n",
  comma: ", ",
  semicolon: "; ",
  tab: "\t"
};

const CANCELLATION_CHECK_INTERVAL = 4096;

function checkCancellation(context, counter) {
  if (counter % CANCELLATION_CHECK_INTERVAL === 0) {
    context.throwIfCancelled?.();
  }
}

function normalizeForCompare(value, caseSensitive) {
  return caseSensitive ? value : value.toLowerCase();
}

function parseNumber(value) {
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

function compareItems(left, right, sortMode, caseSensitive) {
  if (sortMode === "numeric") {
    const leftNumber = parseNumber(left);
    const rightNumber = parseNumber(right);
    if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    if (leftNumber !== null && rightNumber === null) {
      return -1;
    }
    if (leftNumber === null && rightNumber !== null) {
      return 1;
    }
  }

  return normalizeForCompare(left, caseSensitive).localeCompare(
    normalizeForCompare(right, caseSensitive),
    undefined,
    {
      numeric: sortMode === "natural",
      sensitivity: caseSensitive ? "variant" : "base"
    }
  );
}

function splitItems(input, splitMode) {
  const delimiter = SPLIT_DELIMITERS[splitMode] ?? SPLIT_DELIMITERS.lines;
  return String(input ?? "").split(delimiter);
}

function normalizeItems(items, options, warnings, context = {}) {
  const normalized = [];
  let removed = 0;
  for (const [index, rawItem] of items.entries()) {
    checkCancellation(context, index);
    let item = String(rawItem ?? "");
    if (options.trimItems !== false) {
      item = item.trim();
    }
    if (options.collapseInternalSpaces === true) {
      item = item.replace(/ {2,}/g, " ");
    }
    if (options.removeBlankItems !== false && item === "") {
      removed += 1;
      continue;
    }
    normalized.push(item);
  }
  if (removed > 0) {
    warnings.push(`${removed} blank item${removed === 1 ? "" : "s"} removed.`);
  }
  return normalized;
}

function uniqueItems(items, caseSensitive, context = {}) {
  const seen = new Set();
  const unique = [];
  for (const [index, item] of items.entries()) {
    checkCancellation(context, index);
    const key = normalizeForCompare(item, caseSensitive);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

function countItems(items, caseSensitive, context = {}) {
  const rows = [];
  const indexByKey = new Map();
  for (const [index, item] of items.entries()) {
    checkCancellation(context, index);
    const key = normalizeForCompare(item, caseSensitive);
    const rowIndex = indexByKey.get(key);
    if (rowIndex === undefined) {
      indexByKey.set(key, rows.length);
      rows.push({ item, count: 1 });
    } else {
      rows[rowIndex].count += 1;
    }
  }
  return rows;
}

function makeDelimitedOutput(items, delimiterMode) {
  const delimiter = JOIN_DELIMITERS[delimiterMode] ?? JOIN_DELIMITERS.lines;
  return items.join(delimiter);
}

export const lineListCountColumns = [
  { id: "item", label: "Item", type: "string" },
  { id: "count", label: "Count", type: "number" }
];

export function processLineList(input, options = {}, context = {}) {
  const warnings = [];
  const splitMode = options.splitMode ?? "lines";
  const operation = options.operation ?? "clean";
  const caseSensitive = options.caseSensitive === true;
  const sortMode = options.sortMode ?? "natural";
  const sortDirection = options.sortDirection === "desc" ? "desc" : "asc";
  const legacyOperation = ["sort", "unique", "sort-unique", "count"].includes(operation);
  const removeDuplicates = options.removeDuplicates === true ||
    operation === "unique" ||
    operation === "sort-unique";
  const sortItems = options.sortItems === true ||
    operation === "sort" ||
    operation === "sort-unique";

  context.throwIfCancelled?.();
  const rawItems = splitItems(input, splitMode);
  let items = normalizeItems(rawItems, options, warnings, context);
  const originalItemCount = rawItems.length;
  const normalizedItemCount = items.length;
  let sortChecks = 0;
  const cancellableCompare = (left, right) => {
    sortChecks += 1;
    checkCancellation(context, sortChecks);
    return compareItems(left, right, sortMode, caseSensitive);
  };
  const countRows = countItems(items, caseSensitive, context)
    .sort((left, right) => {
      const countComparison = right.count - left.count;
      return countComparison === 0 ? cancellableCompare(left.item, right.item) : countComparison;
    });

  if (String(input ?? "").length === 0) {
    warnings.push("No list input was provided.");
  }

  if (removeDuplicates) {
    items = uniqueItems(items, caseSensitive, context);
  }

  if (sortItems) {
    items = [...items].sort(cancellableCompare);
  }

  if (operation === "count") {
    items = countRows.map((row) => `${row.item}\t${row.count}`);
  }

  if (sortDirection === "desc" && sortItems && operation !== "count") {
    items = [...items].reverse();
  }

  const output = operation === "count"
    ? ["item\tcount", ...items].join("\n")
    : makeDelimitedOutput(items, options.joinMode ?? "lines");

  return {
    output,
    items,
    countRows,
    warnings,
    stats: {
      originalItemCount,
      normalizedItemCount,
      outputItemCount: operation === "count" ? countRows.length : items.length
    },
    settings: {
      removeDuplicates,
      sortItems,
      sortMode,
      sortDirection,
      legacyOperation
    }
  };
}

export function summarizeLineList(result, operationLabel) {
  return [
    "Line / List Cleaner",
    "",
    `Operation: ${operationLabel}`,
    `Remove duplicates: ${result.settings?.removeDuplicates ? "yes, preserving first occurrence" : "no"}`,
    `Sort list output: ${result.settings?.sortItems ? `yes, ${result.settings.sortMode} ${result.settings.sortDirection}` : "no"}`,
    `Original items: ${result.stats.originalItemCount}`,
    `Items after cleanup: ${result.stats.normalizedItemCount}`,
    `Output items: ${result.stats.outputItemCount}`
  ].join("\n");
}
