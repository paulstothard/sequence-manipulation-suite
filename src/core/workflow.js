export function makeTextStream(text, mediaType = "text/plain", sequenceSearch = null) {
  return {
    kind: "text",
    mediaType,
    text: String(text ?? ""),
    ...(sequenceSearch ? { sequenceSearch } : {})
  };
}

export function makeTableStream(columns, rows, schema = "") {
  return {
    kind: "table",
    schema,
    columns,
    rows
  };
}

export function makeWarningsStream(warnings) {
  return {
    kind: "warnings",
    warnings: warnings.map((message) =>
      typeof message === "string" ? { message } : message
    )
  };
}

export function makeCollectionStream(items, itemKind = "") {
  return {
    kind: "collection",
    itemKind,
    items
  };
}

export function makeToolResult({
  output,
  download,
  sequenceSearch,
  downloads = [],
  warnings = [],
  recordsProcessed = 0,
  basesProcessed = 0,
  processedUnitLabel = "base",
  charactersRemoved = 0,
  streams = {},
  visual,
  optionsUsed
}) {
  return {
    output,
    download,
    downloads,
    warnings,
    recordsProcessed,
    basesProcessed,
    processedUnitLabel,
    charactersRemoved,
    optionsUsed,
    streams: {
      primary: makeTextStream(output, download?.mimeType ?? "text/plain", sequenceSearch),
      warnings: makeWarningsStream(warnings),
      ...streams
    },
    visual
  };
}
