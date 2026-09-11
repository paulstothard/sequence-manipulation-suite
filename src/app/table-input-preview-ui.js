import { buildTableFromRows, detectDelimiter, parseDelimitedRows } from "../core/table.js";
import { parseJsonTableInput } from "../core/table-data-format-converter.js";

const DEFAULT_MAX_CHARACTERS = 1_000_000;
const MAX_PREVIEW_CELLS = 250_000;
const MAX_PREVIEW_ROWS = 50;
const MAX_PREVIEW_COLUMNS = 12;

function normalizeVisibleWhenConditions(visibleWhen) {
  if (!visibleWhen) return [];
  return Array.isArray(visibleWhen) ? visibleWhen : [visibleWhen];
}

function visibleWhenMatches(visibleWhen, optionValues) {
  return normalizeVisibleWhenConditions(visibleWhen).every((condition) => {
    const expectedValues = Array.isArray(condition.value) ? condition.value : [condition.value];
    return expectedValues.includes(optionValues[condition.option]);
  });
}

function normalizeInputTableConfig(config, metadata, optionValues) {
  if (!config) return null;
  const value = config === true ? {} : config;
  if (value.visibleWhen && !visibleWhenMatches(value.visibleWhen, optionValues)) return null;
  const acceptsJson = value.acceptsJson ?? /\bJSON\b/i.test(String(metadata?.inputType ?? ""));
  return {
    label: value.label ?? "Table input format",
    description: value.description ?? [
      "Preview the source using the current delimiter and header settings without changing the editable text.",
      acceptsJson ? "JSON arrays and objects are also supported." : "Excel worksheets are converted to tab-separated text when loaded."
    ].join(" "),
    requiredColumns: value.requiredColumns ?? [],
    columns: value.columns ?? [],
    maxCharacters: value.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
    acceptsJson,
    ariaLabel: value.ariaLabel ?? "Table input preview"
  };
}

export function getTableInputPreviewConfig(metadata, optionValues = {}) {
  if (!metadata || metadata.inputTable === false) return null;
  let config = metadata.inputTable;
  if (!config) {
    const hasTableTag = (metadata.tags ?? []).some((tag) => String(tag).toLowerCase() === "table");
    const hasPrimaryDelimitedTable = /^CSV,\s*TSV\b/i.test(String(metadata.inputType ?? ""));
    if (metadata.splitInput || !hasTableTag || !hasPrimaryDelimitedTable) return null;
    config = true;
  }
  return normalizeInputTableConfig(config, metadata, optionValues);
}

function getDelimitedFormatLabel(delimiterId) {
  return {
    comma: "CSV",
    tab: "TSV",
    semicolon: "Semicolon-delimited",
    pipe: "Pipe-delimited"
  }[delimiterId] ?? "Delimited text";
}

function getDelimiterChoice(optionValues) {
  if (optionValues.inputFormat === "csv") return "comma";
  if (optionValues.inputFormat === "tsv") return "tab";
  return optionValues.delimiter ?? "auto";
}

function delimiterFromChoice(choice, text) {
  if (choice === "comma") return { delimiter: ",", delimiterId: "comma" };
  if (choice === "semicolon") return { delimiter: ";", delimiterId: "semicolon" };
  if (choice === "pipe") return { delimiter: "|", delimiterId: "pipe" };
  if (choice === "tab") return { delimiter: "\t", delimiterId: "tab" };
  return detectDelimiter(text);
}

export function buildTableInputPreviewModel(text, config, optionValues = {}) {
  const source = String(text ?? "");
  if (source.length > config.maxCharacters) {
    throw new Error(`Input is too large to preview. Reduce the table to ${config.maxCharacters.toLocaleString()} characters.`);
  }

  const trimmed = source.trim();
  const inputFormat = String(optionValues.inputFormat ?? "auto");
  const looksLikeJson = trimmed.startsWith("[") || trimmed.startsWith("{");
  const useJson = config.acceptsJson && (inputFormat === "json" || (inputFormat === "auto" && looksLikeJson));
  let table;
  let format;

  if (useJson) {
    table = parseJsonTableInput(source);
    format = "JSON";
  } else {
    if (inputFormat === "json") {
      throw new Error("JSON preview is not available for this tool.");
    }
    const detection = delimiterFromChoice(getDelimiterChoice(optionValues), source);
    const parsed = parseDelimitedRows(source, detection.delimiter);
    const width = parsed.rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (width * parsed.rows.length > MAX_PREVIEW_CELLS) {
      throw new Error(`Table preview exceeds ${MAX_PREVIEW_CELLS.toLocaleString()} cells. Reduce the number of rows or columns.`);
    }
    const built = buildTableFromRows(parsed.rows, { hasHeader: optionValues.hasHeader !== false });
    const malformed = [...parsed.warnings, ...built.warnings]
      .filter((warning) => !/^Column ".*" is empty for all rows\.$/.test(warning));
    if (malformed.length) throw new Error(malformed.slice(0, 3).join(" "));
    table = { ...built, warnings: [...parsed.warnings, ...built.warnings] };
    format = getDelimitedFormatLabel(detection.delimiterId);
  }

  const cellCount = table.columns.length * table.rows.length;
  if (cellCount > MAX_PREVIEW_CELLS) {
    throw new Error(`Table preview exceeds ${MAX_PREVIEW_CELLS.toLocaleString()} cells. Reduce the number of rows or columns.`);
  }
  const columnLabels = new Set(table.columns.map((column) => column.label.trim().toLowerCase()));
  const missingRequiredColumns = config.requiredColumns.filter((name) => !columnLabels.has(String(name).trim().toLowerCase()));
  if (missingRequiredColumns.length) {
    throw new Error(`Include the required header${missingRequiredColumns.length === 1 ? "" : "s"}: ${missingRequiredColumns.join(", ")}.`);
  }

  return {
    columns: table.columns.slice(0, MAX_PREVIEW_COLUMNS),
    rows: table.rows.slice(0, MAX_PREVIEW_ROWS),
    totalColumns: table.columns.length,
    totalRows: table.rows.length,
    format,
    truncated: table.rows.length > MAX_PREVIEW_ROWS || table.columns.length > MAX_PREVIEW_COLUMNS
  };
}

// The textarea remains the single source passed to Run. The preview never pads or rewrites it.
export function createTableInputPreview({
  input,
  panel,
  getMetadata,
  getConfig,
  getOptionValues = () => ({}),
  getOwner
}) {
  let owner = "";
  let mode = "preview";
  let lastSignature;
  let root;
  let preview;
  let summary;
  let controls;
  let timer;

  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  function getContext() {
    const metadata = getMetadata?.() ?? {};
    const optionValues = getOptionValues?.() ?? {};
    const config = getConfig
      ? normalizeInputTableConfig(getConfig(), metadata, optionValues)
      : getTableInputPreviewConfig(metadata, optionValues);
    return {
      optionValues,
      config,
      owner: getOwner?.() ?? metadata.id ?? "table-input"
    };
  }

  function setMode(value) {
    mode = value;
    panel.dataset.tableInputView = value;
    preview.hidden = value !== "preview";
    for (const button of controls.children) {
      button.setAttribute("aria-pressed", String(button.dataset.view === value));
    }
    if (value === "preview") render();
  }

  function render() {
    if (!root || mode !== "preview") return;
    const { config, optionValues } = getContext();
    if (!config) return;
    const signature = JSON.stringify([
      input.value,
      optionValues.inputFormat,
      optionValues.delimiter,
      optionValues.hasHeader,
      config.maxCharacters,
      config.acceptsJson,
      config.requiredColumns
    ]);
    if (lastSignature === signature) return;
    lastSignature = signature;
    preview.replaceChildren();
    try {
      const model = buildTableInputPreviewModel(input.value, config, optionValues);
      const previewSuffix = model.truncated
        ? ` · Preview: first ${model.rows.length} rows and ${model.columns.length} columns`
        : "";
      summary.textContent = `${model.totalRows.toLocaleString()} rows · ${model.totalColumns.toLocaleString()} columns · ${model.format}${previewSuffix}`;
      const grid = make("table", undefined, "result-table");
      grid.setAttribute("aria-label", config.ariaLabel);
      grid.style.setProperty("--visible-table-columns", model.columns.length);
      const head = make("thead");
      const headerRow = make("tr");
      const body = make("tbody");
      for (const column of model.columns) {
        const th = make("th", column.label);
        th.scope = "col";
        headerRow.append(th);
      }
      head.append(headerRow);
      grid.append(head);
      for (const row of model.rows) {
        const line = make("tr");
        for (const column of model.columns) line.append(make("td", row[column.id] ?? ""));
        body.append(line);
      }
      grid.append(body);
      preview.append(grid);
    } catch (error) {
      summary.textContent = "Check the table";
      const warning = make("p", `${error.message} Use Edit text to correct the input.`, "table-input-warning");
      warning.setAttribute("role", "status");
      preview.append(warning);
    }
  }

  function refresh({ preferPreview = false } = {}) {
    clearTimeout(timer);
    const context = getContext();
    if (!context.config) {
      root?.remove();
      root = null;
      owner = "";
      lastSignature = undefined;
      delete panel.dataset.tableInputView;
      return;
    }
    if (owner !== context.owner) {
      root?.remove();
      owner = context.owner;
      mode = "preview";
      lastSignature = undefined;
      root = make("div", undefined, "table-input-tools");
      const help = make("details", undefined, "table-input-help");
      help.append(make("summary", context.config.label), make("p", context.config.description));
      if (context.config.columns.length) {
        const columnList = make("dl");
        for (const column of context.config.columns) {
          columnList.append(make("dt", column.name), make("dd", column.description));
        }
        help.append(columnList);
      }
      controls = make("div", undefined, "workspace-source-tabs table-input-views");
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", "Table input view");
      for (const [value, label] of [["preview", "Table preview"], ["text", "Edit text"]]) {
        const button = make("button", label, "workspace-source-tab");
        button.type = "button";
        button.dataset.view = value;
        button.addEventListener("click", () => {
          setMode(value);
          if (value === "text") input.focus();
        });
        controls.append(button);
      }
      summary = make("p", "", "table-output-summary");
      summary.setAttribute("aria-live", "polite");
      preview = make("div", undefined, "table-input-preview");
      root.append(help, controls, summary, preview);
      input.before(root);
    }
    setMode(!input.value.trim() ? "text" : preferPreview ? "preview" : mode);
    if (!input.value.trim()) {
      summary.textContent = "Paste a table or choose a file. The first row normally contains column names.";
      lastSignature = undefined;
    }
  }

  input.addEventListener("input", () => {
    if (!root) return;
    lastSignature = undefined;
    if (mode === "text") {
      summary.textContent = "Edit the source below, then choose Table preview to check its columns.";
    } else {
      clearTimeout(timer);
      timer = setTimeout(render, 200);
    }
  });

  return { refresh };
}
