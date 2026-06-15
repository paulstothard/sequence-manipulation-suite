import { formatFastaRecord, parseSequenceInput } from "./fasta.js";
import { detectDelimiter, exportDelimitedTable, parseDelimitedRows } from "./table.js";

export const fastaExtractByIdColumns = [
  { id: "query", label: "Query", type: "string" },
  { id: "record", label: "Record", type: "string" },
  { id: "matched", label: "Matched", type: "boolean" },
  { id: "length", label: "Length", type: "number" }
];

export function splitFastaExtractByIdInput(input, separator) {
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  const splitIndex = lines.findIndex((line) => line.trim() === separator);
  if (splitIndex === -1) {
    return {
      fastaText: String(input ?? ""),
      queryText: "",
      warnings: [`Separator line "${separator}" was not found; no ID list was provided.`]
    };
  }
  return {
    fastaText: lines.slice(0, splitIndex).join("\n"),
    queryText: lines.slice(splitIndex + 1).join("\n"),
    warnings: []
  };
}

function recordId(record) {
  return String(record.title ?? "").trim().split(/\s+/)[0] ?? "";
}

function normalizeQuery(value, caseSensitive) {
  return caseSensitive ? String(value) : String(value).toLowerCase();
}

function looksLikeIdHeader(value) {
  return /^(id|ids|identifier|identifiers|accession|accessions|query|queries|title|titles)$/i.test(String(value ?? "").trim());
}

export function parseFastaIdList(queryText) {
  const source = String(queryText ?? "").replace(/\r\n?/g, "\n");
  const uncommented = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const detection = detectDelimiter(uncommented);

  if (detection.confidence > 0) {
    const parsed = parseDelimitedRows(uncommented, detection.delimiter);
    const rows = parsed.rows ?? parsed;
    const headerIndexes = rows.length > 1
      ? rows[0]?.map((value, index) => looksLikeIdHeader(value) ? index : -1).filter((index) => index >= 0) ?? []
      : [];
    const dataRows = headerIndexes.length > 0 ? rows.slice(1) : rows;
    return dataRows
      .flatMap((row) => headerIndexes.length > 0 ? headerIndexes.map((index) => row[index]) : row)
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
  }

  return uncommented
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function matchesRecord(record, query, mode, caseSensitive) {
  const normalize = (value) => normalizeQuery(value, caseSensitive);
  const normalizedQuery = normalize(query);
  if (mode === "title-contains") {
    return normalize(record.title).includes(normalizedQuery);
  }
  if (mode === "title-exact") {
    return normalize(record.title) === normalizedQuery;
  }
  return normalize(recordId(record)) === normalizedQuery;
}

const matchModeLabels = {
  "id-exact": "Match first FASTA title word",
  "title-exact": "Match full FASTA title",
  "title-contains": "Title contains ID/list item"
};

function summarizeCounts(items, caseSensitive) {
  const rows = [];
  const indexByKey = new Map();
  for (const item of items) {
    const key = normalizeQuery(item, caseSensitive);
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

function truncateList(items, limit = 12) {
  if (items.length <= limit) {
    return items;
  }
  return [...items.slice(0, limit), `... ${items.length - limit} more`];
}

function makeReport({
  records,
  queries,
  queryCounts,
  matched,
  outputRecords,
  action,
  outputOrder,
  mode,
  caseSensitive,
  missingQueries,
  multiMatchQueries
}) {
  const duplicateQueries = queryCounts.filter((row) => row.count > 1);
  const matchedQueryCount = queryCounts.length - missingQueries.length;
  const report = [
    "FASTA Extract By ID List",
    "",
    "Input",
    `FASTA records: ${records.length}`,
    `ID/list items: ${queries.length}`,
    `Unique ID/list items: ${queryCounts.length}`,
    `Duplicate ID/list items: ${duplicateQueries.length}`,
    `Record ID preview: ${
      records
        .slice(0, 4)
        .map((record) => `${recordId(record)} from "${record.title}"`)
        .join("; ") || "none"
    }`,
    "",
    "Matching",
    `Action: ${action === "keep" ? "Keep matching records" : "Remove matching records"}`,
    `Output order: ${action === "keep" ? (outputOrder === "id-list" ? "ID-list order" : "FASTA order") : "FASTA order"}`,
    `Match mode: ${matchModeLabels[mode] ?? mode}`,
    `Case-sensitive matching: ${caseSensitive ? "yes" : "no"}`,
    "",
    "Results",
    `IDs/list items with matches: ${matchedQueryCount}`,
    `Missing IDs/list items: ${missingQueries.length}`,
    `IDs/list items matching multiple records: ${multiMatchQueries.length}`,
    `Matched FASTA records: ${matched.size}`,
    `${action === "keep" ? "Records kept" : "Records removed"}: ${action === "keep" ? outputRecords.length : matched.size}`,
    `Output records: ${outputRecords.length}`
  ];

  if (duplicateQueries.length > 0) {
    report.push(
      "",
      "Duplicate ID/list items",
      ...truncateList(duplicateQueries.map((row) => `${row.item} (${row.count}x)`))
    );
  }

  if (missingQueries.length > 0) {
    report.push("", "Missing ID/list items", ...truncateList(missingQueries.map((row) => row.item)));
  }

  if (multiMatchQueries.length > 0) {
    report.push(
      "",
      "ID/list items matching multiple records",
      ...truncateList(multiMatchQueries.map((row) => `${row.query} (${row.matches.length} records)`))
    );
  }

  return report.join("\n");
}

export function extractFastaById(input, options = {}) {
  const separator = String(options.separator ?? "---").trim() || "---";
  const split = splitFastaExtractByIdInput(input, separator);
  const records = parseSequenceInput(split.fastaText, "sequence");
  const mode = ["id-exact", "title-exact", "title-contains"].includes(options.matchMode) ? options.matchMode : "id-exact";
  const rawAction = ["keep", "remove", "order"].includes(options.action) ? options.action : "keep";
  const action = rawAction === "order" ? "keep" : rawAction;
  const outputOrder = rawAction === "order" || options.outputOrder === "id-list" ? "id-list" : "input";
  const caseSensitive = options.caseSensitive !== false;
  const queries = parseFastaIdList(split.queryText);
  const queryCounts = summarizeCounts(queries, caseSensitive);
  const matched = new Set();
  const rows = [];
  const orderedRecords = [];
  const missingByKey = new Map();
  const multiMatchByKey = new Map();

  for (const query of queries) {
    const matches = records.filter((record) => matchesRecord(record, query, mode, caseSensitive));
    if (matches.length === 0) {
      rows.push({ query, record: "", matched: false, length: 0 });
      const key = normalizeQuery(query, caseSensitive);
      if (!missingByKey.has(key)) {
        missingByKey.set(key, { item: query });
      }
    }
    if (matches.length > 1) {
      const key = normalizeQuery(query, caseSensitive);
      if (!multiMatchByKey.has(key)) {
        multiMatchByKey.set(key, { query, matches });
      }
    }
    for (const record of matches) {
      matched.add(record);
      orderedRecords.push(record);
      rows.push({ query, record: record.title, matched: true, length: record.sequence.length });
    }
  }

  let outputRecords;
  if (action === "remove") {
    outputRecords = records.filter((record) => !matched.has(record));
  } else if (outputOrder === "id-list") {
    outputRecords = orderedRecords;
  } else {
    outputRecords = records.filter((record) => matched.has(record));
  }
  const lineWidth = Number(options.lineWidth ?? 60) || 60;
  const fasta = outputRecords.map((record) => formatFastaRecord(record.title, record.sequence, lineWidth)).join("");
  const missingQueries = [...missingByKey.values()];
  const multiMatchQueries = [...multiMatchByKey.values()];
  const report = makeReport({
    records,
    queries,
    queryCounts,
    matched,
    outputRecords,
    action,
    outputOrder,
    mode,
    caseSensitive,
    missingQueries,
    multiMatchQueries
  });
  return {
    records,
    outputRecords,
    rows,
    fasta,
    report,
    stats: {
      queries: queries.length,
      uniqueQueries: queryCounts.length,
      duplicateQueries: queryCounts.filter((row) => row.count > 1).length,
      missingQueries: missingQueries.length,
      multiMatchQueries: multiMatchQueries.length,
      matchedRecords: matched.size
    },
    warnings: split.warnings
  };
}

export function makeFastaExtractByIdTsv(rows) {
  return exportDelimitedTable(fastaExtractByIdColumns, rows, "\t");
}
