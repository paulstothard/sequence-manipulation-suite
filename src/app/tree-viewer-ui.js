import { createEditorSession } from './editor-session.js';
import { getPngExportScale } from "./canvas-export.js";
import { parseDelimitedTable } from "../core/table.js";
import { readWorkbookFileAsDelimitedText } from "./input-file-readers.js";
import { LIMITS } from "../../packages/tree-viewer/src/core/index.js";

// Mapping is explicit: table column types never silently reinterpret identifiers.
export function mapTreeMetadataTable(table, keyColumn, key, types) {
  if (
    table.rows.length * table.columns.length > LIMITS.metadataCells ||
    table.columns.length > LIMITS.metadataColumns
  )
    throw new Error("Metadata table limit exceeded.");
  if (!table.columns.some((c) => c.id === keyColumn))
    throw new Error("Choose a metadata key column.");
  const columns = table.columns
    .filter((c) => c.id !== keyColumn)
    .map((c) => ({ name: c.label, type: types[c.id] ?? "string" }));
  if (new Set(columns.map((c) => c.name)).size !== columns.length)
    throw new Error("Metadata column names must be unique.");
  const rows = table.rows.map((row) => ({
    key: String(row[keyColumn] ?? ""),
    values: Object.fromEntries(
      table.columns
        .filter((c) => c.id !== keyColumn)
        .map((c) => {
          const raw = String(row[c.id] ?? ""),
            type = types[c.id] ?? "string";
          if (!raw && type !== "string") return [c.label, null];
          if (type === "number") {
            if (
              !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) ||
              !Number.isFinite(Number(raw))
            )
              throw new Error(`Invalid number in ${c.label}: ${raw}`);
            return [c.label, Number(raw)];
          }
          if (type === "boolean") {
            if (raw !== "true" && raw !== "false")
              throw new Error(`Use true or false in ${c.label}.`);
            return [c.label, raw === "true"];
          }
          return [c.label, raw];
        }),
    ),
  }));
  return { key, columns, rows };
}

async function readMetadataFile(file, host, signal) {
  if (file.size > LIMITS.inputBytes)
    throw new Error("Metadata file exceeds 10 MiB.");
  if (/\.json$/i.test(file.name)) return JSON.parse(await file.text());
  const messages = [];
  const text = /\.xlsx$/i.test(file.name)
    ? await readWorkbookFileAsDelimitedText(file, {
        onMessage: (m) => messages.push(m),
      })
    : await file.text();
  const table = parseDelimitedTable(text);
  if (
    table.rows.length * table.columns.length > LIMITS.metadataCells ||
    table.columns.length > LIMITS.metadataColumns
  )
    throw new Error("Metadata table limit exceeded.");
  return new Promise((resolve, reject) => {
    const panel = document.createElement("dialog");
    panel.setAttribute("aria-label", "Map tree metadata");
    const title = document.createElement("h3");
    title.textContent = "Map tree metadata";
    panel.append(title);
    const description = document.createElement("p");
    description.textContent = `${table.rows.length} rows. Choose the exact tip-label or node-ID key and each column type. ${[...messages, ...table.warnings.map((w) => w.message)].join(" ")}`;
    panel.append(description);
    function select(label, choices) {
      const wrapper = document.createElement("label"),
        control = document.createElement("select");
      wrapper.textContent = label;
      for (const [value, name] of choices) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = name;
        control.append(option);
      }
      wrapper.append(control);
      panel.append(wrapper, document.createElement("br"));
      return control;
    }
    const keyColumn = select(
      "Key column",
      table.columns.map((c) => [c.id, c.label]),
    );
    const key = select("Match by", [
      ["label", "Exact tip label"],
      ["nodeId", "Stable node ID"],
    ]);
    const types = new Map(
      table.columns.map((c) => [
        c.id,
        select(`${c.label} type`, [
          ["string", "Text"],
          ["number", "Number"],
          ["boolean", "Boolean"],
        ]),
      ]),
    );
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    panel.append(error);
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      panel.remove();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Metadata import cancelled.", "AbortError"));
    };
    const apply = document.createElement("button");
    apply.textContent = "Preview join";
    apply.type = "button";
    apply.onclick = () => {
      try {
        const result = mapTreeMetadataTable(
          table,
          keyColumn.value,
          key.value,
          Object.fromEntries([...types].map(([id, el]) => [id, el.value])),
        );
        cleanup();
        resolve(result);
      } catch (e) {
        error.textContent = e.message;
      }
    };
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.onclick = abort;
    panel.append(apply, cancel);
    panel.addEventListener("cancel", abort);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    (host.shadowRoot ?? host).append(panel);
    panel.showModal();
  });
}

export function renderTreeViewer(host, payload, editorDocument) {
  const container = document.createElement("div");
  container.className = "sms3-tree-viewer";
  host.append(container);
  const controller = new AbortController();
  let viewer, session;
  const themeObserver = new MutationObserver(() => {
    viewer?.setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  host._sms3VisualCleanup = () => {
    controller.abort();
    themeObserver.disconnect();
    session?.dispose();
    viewer?.destroy();
    container.remove();
  };
  container.textContent = "Loading Tree Viewer…";
  import("../../packages/tree-viewer/dist/tree-viewer.js")
    .then(async (module) => {
      if (controller.signal.aborted) return;
      container.textContent = "";
      viewer = module.createTreeViewer(container, {
        document: editorDocument?.state?.document ?? payload.document,
        mode: "style",
        allowOpenTree: false,
        figureExportDpi: 96 * getPngExportScale(),
        theme:
          document.documentElement.dataset.theme === "dark" ? "dark" : "light",
        strings: {
          metadata: "Import metadata table",
          metadataHelp: "Import CSV, TSV or XLSX with a header row and one row per tip or node, or a metadata JSON table. Choose a key column that exactly matches original tip labels or stable node IDs; edited display names are not used. Set numeric columns to Number for bars and heatmaps. Preview matches before applying. Import replaces this tree’s metadata table and removes incompatible tracks. Undo restores the previous table and tracks.",
        },
        readMetadataFile: (file) =>
          readMetadataFile(file, container, controller.signal),
      });
      await viewer.ready;
      if (controller.signal.aborted) return;
      const recoveryBar = document.createElement('div');
      recoveryBar.className = 'tree-viewer-recovery';
      recoveryBar.slot = 'status';
      container.append(recoveryBar);
      session = createEditorSession({host:container, toolbar:recoveryBar, tool:'tree-viewer', source:payload, nativeHistory:true, download:false, initial:editorDocument?.state,
        read:() => ({document:viewer.getDocument()}), apply:() => {}
      });
      viewer.subscribe(event => {if (event.type === 'change') session.changed('Edit tree');});
    })
    .catch((error) => {
      if (!controller.signal.aborted) {
        container.textContent = error.message;
        container.setAttribute("role", "alert");
      }
    });
}
