import { detectDelimiter, parseDelimitedRows, buildTableFromRows } from "../core/table.js";

// Opt-in input preview: the textarea remains the single source passed to Run.
// Keep parser and table styles shared with the table tools; never pad source text.
export function createTableInputPreview({ input, panel, getMetadata }) {
  let owner = "", mode = "preview", lastText, root, preview, summary, controls, timer;
  const make = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function setMode(value) {
    mode = value;
    panel.dataset.tableInputView = value;
    preview.hidden = value !== "preview";
    for (const button of controls.children) button.setAttribute("aria-pressed", String(button.dataset.view === value));
    if (value === "preview") render();
  }
  function render() {
    if (!root || mode !== "preview" || lastText === input.value) return;
    lastText = input.value;
    preview.replaceChildren();
    try {
      if (input.value.length > (getMetadata().inputTable.maxCharacters ?? 1_000_000)) throw new Error("Input is too large to preview. Reduce the sample table to 1 million characters.");
      const detection = detectDelimiter(input.value);
      const parsed = parseDelimitedRows(input.value, detection.delimiter);
      const width = parsed.rows.reduce((max, row) => Math.max(max, row.length), 0);
      // Refuse sparse/ragged inputs before the table builder pads their cells.
      if (width * parsed.rows.length > 250_000) throw new Error("Table preview exceeds 250,000 cells. Reduce the number of rows or columns.");
      const built = buildTableFromRows(parsed.rows);
      const table = { ...built, delimiterId: detection.delimiterId, warnings: [...parsed.warnings, ...built.warnings] };
      const malformed = table.warnings.filter(w => !/^Column ".*" is empty for all rows\.$/.test(w));
      if (malformed.length) throw new Error(malformed.slice(0, 3).join(" "));
      const required = getMetadata().inputTable.requiredColumns ?? [];
      if (required.some(name => !table.columns.some(c => c.label.toLowerCase() === name))) throw new Error(`Include the required header: ${required.join(", ")}.`);
      const columns = table.columns.slice(0, 12), rows = table.rows.slice(0, 50);
      const format = { comma: "CSV", tab: "TSV", semicolon: "Semicolon-delimited", pipe: "Pipe-delimited" }[table.delimiterId];
      summary.textContent = `${table.rows.length.toLocaleString()} rows · ${table.columns.length} columns · ${format}${rows.length < table.rows.length || columns.length < table.columns.length ? ` · Preview: first ${rows.length} rows and ${columns.length} columns` : ""}`;
      const grid = make("table", undefined, "result-table");
      grid.setAttribute("aria-label", "Sample input preview");
      grid.style.setProperty("--visible-table-columns", columns.length);
      const head = make("thead"), tr = make("tr"), body = make("tbody");
      for (const col of columns) { const th = make("th", col.label); th.scope = "col"; tr.append(th); }
      head.append(tr); grid.append(head);
      for (const row of rows) {
        const line = make("tr");
        for (const col of columns) line.append(make("td", row[col.id] ?? ""));
        body.append(line);
      }
      grid.append(body); preview.append(grid);
    } catch (error) {
      summary.textContent = "Check the sample table";
      const warning = make("p", error.message + " Use Edit text to correct the input.", "table-input-warning");
      warning.setAttribute("role", "status"); preview.append(warning);
    }
  }
  function refresh({ preferPreview = false } = {}) {
    clearTimeout(timer);
    const metadata = getMetadata(), config = metadata?.inputTable;
    if (!config) {
      root?.remove(); root = null; owner = ""; lastText = undefined;
      delete panel.dataset.tableInputView;
      return;
    }
    if (owner !== metadata.id) {
      root?.remove(); owner = metadata.id; mode = "preview"; lastText = undefined;
      root = make("div", undefined, "table-input-tools");
      const help = make("details", undefined, "table-input-help");
      help.append(make("summary", "Sample table format"), make("p", config.description));
      const dl = make("dl");
      for (const column of config.columns) dl.append(make("dt", column.name), make("dd", column.description));
      help.append(dl);
      controls = make("div", undefined, "workspace-source-tabs table-input-views");
      controls.setAttribute("role", "group"); controls.setAttribute("aria-label", "Sample input view");
      for (const [value, label] of [["preview", "Table preview"], ["text", "Edit text"]]) {
        const button = make("button", label, "workspace-source-tab");
        button.type = "button"; button.dataset.view = value;
        button.addEventListener("click", () => { setMode(value); if (value === "text") input.focus(); });
        controls.append(button);
      }
      summary = make("p", "", "table-output-summary");
      summary.setAttribute("aria-live", "polite");
      preview = make("div", undefined, "table-input-preview");
      root.append(help, controls, summary, preview); input.before(root);
    }
    setMode(!input.value.trim() ? "text" : preferPreview ? "preview" : mode);
    if (!input.value.trim()) { summary.textContent = "Paste a table or choose a file. The first row contains column names."; lastText = undefined; }
  }
  input.addEventListener("input", () => {
    if (!root) return;
    lastText = undefined;
    if (mode === "text") summary.textContent = "Edit the source below, then choose Table preview to check its columns.";
    else { clearTimeout(timer); timer = setTimeout(render, 200); }
  });
  return { refresh };
}
