import { downloadText } from "./file-download.js";
import { validatePlateLayout } from "../core/plate-layout.js";
const EDITOR_DOCUMENT_FORMAT = "sms3-editor-document";
const EDITOR_TOOLS = ["workflow", "tree-viewer", "plate-layout-planner", "sequence-editor", "markdown-notebook", "linear-genome-figure", "circular-genome-figure", "sequence-extractor", "sanger-trace-viewer", "sanger-trace-assembly", "sanger-trace-reference-comparison"];
const MAX_BYTES = 25 * 1024 * 1024;
const copy = (value) => structuredClone(value);
const recoveryWrites = new Map();
let recoveryHelpId = 0;
function parseEditorDocument(text) {
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error("Document exceeds 25 MB.");
  const doc = JSON.parse(text);
  if (doc?.format !== EDITOR_DOCUMENT_FORMAT || doc.version !== 1 || !EDITOR_TOOLS.includes(doc.tool)) throw new Error("Unsupported SMS3 document format or version.");
  if (!doc.source || typeof doc.source !== "object" || !doc.state || typeof doc.state !== "object" || Array.isArray(doc.state)) throw new Error("The document is missing its source or editable state.");
  const fail = () => {
    throw new Error("The document contains invalid source data or editable state.");
  };
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  const records = doc.source.records;
  if (doc.tool === "plate-layout-planner") {
    if (typeof doc.source.input !== "string" || doc.source.input.length > 1_000_000) fail();
    validatePlateLayout(doc.source.layout);
    validatePlateLayout(doc.state.layout);
  }
  if (doc.tool === "sequence-editor" && (typeof doc.source.input !== "string" || typeof doc.state.text !== "string" || !Array.isArray(doc.state.featureTrackOverrides))) fail();
  if (doc.tool === "markdown-notebook" && typeof doc.state.markdown !== "string") fail();
  if (doc.tool === "tree-viewer" && (!object(doc.source.document) || !object(doc.state.document) || !Array.isArray(doc.state.document.trees))) fail();
  if (doc.tool.includes("genome-figure") || doc.tool === "sequence-extractor") {
    if (!Array.isArray(records) || !records.length || records.some((record) => !object(record) || !Number.isFinite(record.length) || record.length < 1)) fail();
  }
  if (doc.tool.includes("genome-figure")) {
    if (doc.source.layout !== (doc.tool.startsWith("linear") ? "linear" : "circular") || !Array.isArray(doc.state.labels)) fail();
    for (const key of ["figureWidth", "slotWidth", "plotBandWidth", "plotWindowSize", "tickDensity", "featureOpacity"]) if (!Number.isFinite(doc.state[key]) || doc.state[key] <= 0 || doc.state[key] > 1e6) fail();
    for (const key of ["visiblePlots", "visibleFeatureTypes", "visibleRecordKeys", "forceLabelIds"]) if (!Array.isArray(doc.state[key])) fail();
    if (doc.state.labels.length > 1e4 || doc.state.labels.some((label) => !object(label) || typeof label.text !== "string" || !Number.isFinite(label.x) || !Number.isFinite(label.y))) fail();
  }
  if (doc.tool === "sequence-extractor" && (!Array.isArray(doc.state.selectionStack) || doc.state.selectionStack.length > 10 || doc.state.selectionStack.some((entry) => !object(entry) || typeof entry.product?.sequence !== "string"))) fail();
  if (doc.tool.startsWith("sanger-")) {
    const traces = doc.source.traceViews ?? [doc.source];
    if (!Array.isArray(traces) || !traces.length) fail();
    for (const trace of traces) if (!Array.isArray(trace.baseCalls) || !trace.baseCalls.length || !object(trace.traces)) fail();
    const edits = doc.source.traceViews ? doc.state.traces : { "0": doc.state };
    if (!object(edits)) fail();
    for (const [index, edit] of Object.entries(edits)) {
      const trace = traces[index];
      if (!trace || typeof edit.bases !== "string" || edit.bases.length !== trace.baseCalls.length || /[^ACGTRYSWKMBDHVN]/i.test(edit.bases)) fail();
      if (!Number.isInteger(edit.clipStart) || !Number.isInteger(edit.clipEnd) || edit.clipStart < 1 || edit.clipEnd > trace.baseCalls.length || edit.clipStart > edit.clipEnd) fail();
    }
  }
  if (doc.tool === "workflow" && !Array.isArray(doc.state.workflow?.steps)) fail();
  return doc;
}
// Inspect JSON inputs without taking ordinary trace, table, or recipe JSON away
// from their existing readers. The dedicated suffix always requires a document.
async function readEditorDocumentFile(file) {
  if (!file) return null;
  const explicitDocument = /\.sms3\.json$/i.test(file.name ?? "");
  if (!/\.json$/i.test(file.name ?? "") && !/^application\/json(?:;|$)/i.test(file.type ?? "")) return null;
  if (file.size > MAX_BYTES) throw new Error("JSON input exceeds 25 MB.");
  const text = await file.text();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    if (explicitDocument) throw new Error("The SMS3 document is not valid JSON.");
    return null;
  }
  if (doc?.format === EDITOR_DOCUMENT_FORMAT) return parseEditorDocument(text);
  if (doc?.format === "sms3-tree-document") return doc;
  if (explicitDocument) throw new Error("Unsupported SMS3 document format or version.");
  return null;
}
function store(tool, value) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sms3-editor-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("documents");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction("documents", value === undefined ? "readonly" : "readwrite");
        const op = value === undefined ? tx.objectStore("documents").get(tool) : tx.objectStore("documents").put(value, tool);
        tx.oncomplete = () => {
          db.close();
          resolve(op.result);
        };
        tx.onabort = tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("Browser storage unavailable."));
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  });
}
async function readEditorRecovery(tool) {
  const doc = await store(tool);
  return doc ? parseEditorDocument(JSON.stringify(doc)) : null;
}
// One current recovery document per editor; shared history stays bounded in memory.
// Call changed after asynchronous edits, and dispose before replacing the editor.
function createEditorSession({ host, toolbar, tool, source, read, apply, initial, nativeHistory = false, download = true, saveInitial = true }) {
  const sourceDocument = copy(source);
  let current, past = [], future = [], restoring = false, disposed = false, dirty = false, timer, groupAt = 0;
  let pendingWrite = Promise.resolve();
  const controller = new AbortController();
  const ui = document.createElement("div");
  ui.className = "editor-session-actions";
  ui.setAttribute("aria-label", "Document actions");
  const button = (text, action) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", action);
    ui.append(b);
    return b;
  };
  const undo = nativeHistory ? null : button("Undo", () => travel(-1));
  const redo = nativeHistory ? null : button("Redo", () => travel(1));
  const history = document.createElement("details");
  history.className = "editor-session-history";
  const summary = document.createElement("summary");
  summary.textContent = "History";
  const list = document.createElement("ol");
  history.append(summary, list);
  if (!nativeHistory) ui.append(history);
  const positionHistory = () => {
    if (!history.open) return;
    const anchor = summary.getBoundingClientRect();
    const rect = list.getBoundingClientRect();
    list.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - rect.width - 12))}px`;
    list.style.top = `${Math.max(12, Math.min(anchor.bottom + 4, window.innerHeight - rect.height - 12))}px`;
  };
  history.addEventListener("toggle", positionHistory);
  window.addEventListener("resize", positionHistory, { signal: controller.signal });
  window.addEventListener("scroll", positionHistory, { capture: true, passive: true, signal: controller.signal });
  window.document.addEventListener("pointerdown", (event) => {
    if (!history.contains(event.target)) history.open = false;
  }, { signal: controller.signal });
  window.document.addEventListener("keydown", (event) => {
    if (history.open && event.key === "Escape") {
      history.open = false;
      summary.focus();
    }
  }, { signal: controller.signal });
  if (download) button("Download document", () => {
    changed();
    try {
      const doc = getDocument();
      parseEditorDocument(JSON.stringify(doc));
      downloadText(JSON.stringify(doc, null, 2), `${tool}.sms3.json`, "application/json");
    } catch (error) {
      status.textContent = error.message;
    }
  });
  const status = window.document.createElement("span");
  status.className = "editor-session-status";
  status.setAttribute("role", "status");
  const recovery = document.createElement("span");
  recovery.className = "editor-session-recovery";
  const help = document.createElement("button");
  help.type = "button";
  help.className = "editor-recovery-help";
  help.textContent = "?";
  help.setAttribute("aria-label", "Help: Browser recovery");
  help.setAttribute("aria-expanded", "false");
  const popover = document.createElement("div");
  popover.id = `editor-recovery-help-${++recoveryHelpId}`;
  popover.className = "editor-recovery-popover";
  popover.setAttribute("popover", "auto");
  popover.setAttribute("role", "note");
  popover.setAttribute("aria-label", "Browser recovery");
  popover.textContent = "SMS3 automatically saves the latest document for this tool in this browser’s site storage on this device. It restores when you return or reload. It is not synced to other browsers or devices. A new run replaces this tool’s recovery copy; clearing site data removes it. " +
    (tool === "tree-viewer" ? "Use Export → Tree document (JSON)" : "Use Download document") +
    " to keep a separate copy or reopen it elsewhere through Choose file.";
  help.setAttribute("popovertarget", popover.id);
  help.setAttribute("aria-controls", popover.id);
  const positionHelp = () => {
    if (!popover.matches(":popover-open")) return;
    const anchor = help.getBoundingClientRect(), box = popover.getBoundingClientRect(), margin = 8;
    popover.style.left = `${Math.max(margin, Math.min(anchor.left, window.innerWidth - box.width - margin))}px`;
    popover.style.top = `${Math.max(margin, Math.min(anchor.bottom + 6 + box.height <= window.innerHeight - margin ? anchor.bottom + 6 : anchor.top - box.height - 6, window.innerHeight - box.height - margin))}px`;
  };
  popover.addEventListener("toggle", () => {
    const open = popover.matches(":popover-open");
    help.setAttribute("aria-expanded", String(open));
    if (!open) { help.removeAttribute("aria-describedby"); return; }
    help.setAttribute("aria-describedby", popover.id);
    positionHelp();
  });
  window.addEventListener("resize", positionHelp, {signal:controller.signal});
  window.addEventListener("scroll", positionHelp, {capture:true, passive:true, signal:controller.signal});
  recovery.append(status, help);
  ui.append(recovery, popover);
  toolbar.append(ui);
  function getDocument() {
    return { format: EDITOR_DOCUMENT_FORMAT, version: 1, tool, source: sourceDocument, state: copy(read()), updatedAt: (new Date()).toISOString() };
  }
  function update() {
    if (undo) undo.disabled = !past.length;
    if (redo) redo.disabled = !future.length;
    list.replaceChildren();
    for (const item of past.slice(-20)) {
      const li = window.document.createElement("li");
      li.textContent = item.label;
      list.append(li);
    }
    if (!past.length) {
      const li = window.document.createElement("li");
      li.textContent = "No edits yet";
      list.append(li);
    }
  }
  function flush() {
    clearTimeout(timer);
    if (!dirty) return pendingWrite;
    dirty = false;
    let doc;
    try {
      doc = getDocument();
      parseEditorDocument(JSON.stringify(doc));
    } catch (error) {
      status.textContent = `Browser recovery unavailable: ${error.message}`;
      return pendingWrite;
    }
    pendingWrite = (recoveryWrites.get(tool) || Promise.resolve()).catch(() => {
    }).then(() => store(tool, doc)).then(() => {
      if (!dirty && JSON.stringify(doc.state) === current) status.textContent = "Saved in this browser";
    }, () => {
      status.textContent = "Browser recovery unavailable. Download a document to keep your changes.";
    });
    recoveryWrites.set(tool, pendingWrite);
    return pendingWrite;
  }
  function changed(label = "Edit", { coalesce = false } = {}) {
    if (restoring || disposed || current === undefined) return;
    const next = JSON.stringify(read());
    if (next === current) return;
    if (!nativeHistory && !(coalesce && Date.now() - groupAt < 650 && !future.length)) {
      past.push({ state: current, label: label.slice(0, 80) });
      while (past.length > 50 || past.length > 1 && past.reduce((n, e) => n + e.state.length, 0) > 5 * 1024 * 1024) past.shift();
    }
    groupAt = coalesce ? Date.now() : 0;
    current = next;
    future = [];
    dirty = true;
    status.textContent = "Saving in this browser…";
    update();
    clearTimeout(timer);
    timer = setTimeout(flush, 350);
  }
  function travel(direction) {
    history.open = false;
    changed();
    const from = direction < 0 ? past : future, to = direction < 0 ? future : past;
    if (!from.length) return;
    const entry = from.pop();
    to.push({ state: current, label: entry.label });
    restoring = true;
    try {
      apply(JSON.parse(entry.state));
      current = JSON.stringify(read());
    } finally {
      restoring = false;
    }
    groupAt = 0;
    dirty = true;
    status.textContent = "Saving in this browser…";
    update();
    flush();
  }
  host.addEventListener("keydown", (event) => {
    if (nativeHistory || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    event.stopPropagation();
    travel(key === "y" || event.shiftKey ? 1 : -1);
  }, { signal: controller.signal });
  for (const eventName of ["input", "change", "click", "pointerup", "contextmenu"]) host.addEventListener(eventName, (event) => {
    if (ui.contains(event.target)) return;
    const target = event.target;
    const field = target.closest?.("label");
    const fieldName = target.getAttribute?.("aria-label") || field?.querySelector("span")?.textContent?.trim();
    const label = fieldName ? `${fieldName}${target.tagName === "SELECT" ? ": " + target.selectedOptions[0]?.textContent : ""}` : target.closest?.("button")?.textContent?.trim() || "Edit";
    queueMicrotask(() => changed(label, { coalesce: eventName === "input" }));
  }, { signal: controller.signal });
  window.addEventListener("pagehide", flush, { signal: controller.signal });
  window.document.addEventListener("visibilitychange", () => {
    if (window.document.hidden) flush();
  }, { signal: controller.signal });
  if (initial) {
    restoring = true;
    try {
      apply(copy(initial));
    } finally {
      restoring = false;
    }
  }
  current = JSON.stringify(read());
  update();
  if (initial || saveInitial) {
    dirty = true;
    flush();
  }
  const session = { changed, flush, document: getDocument, undo: () => travel(-1), redo: () => travel(1), dispose() {
    changed();
    flush();
    disposed = true;
    controller.abort();
    ui.remove();
  } };
  host._sms3EditorSession = session;
  return session;
}
export {
  EDITOR_DOCUMENT_FORMAT,
  EDITOR_TOOLS,
  createEditorSession,
  parseEditorDocument,
  readEditorDocumentFile,
  readEditorRecovery
};
