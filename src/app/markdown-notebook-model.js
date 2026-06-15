export const MARKDOWN_NOTEBOOK_CURRENT_KEY = "current";

const MARKDOWN_NOTEBOOK_DB = "sms3-markdown-notebooks";
const MARKDOWN_NOTEBOOK_STORE = "drafts";
const DEFAULT_MARKDOWN_FILENAME = "untitled-notes";

export function normalizeMarkdownFilename(filename) {
  const trimmed = String(filename || DEFAULT_MARKDOWN_FILENAME).trim() || DEFAULT_MARKDOWN_FILENAME;
  return /\.(md|markdown)$/i.test(trimmed) ? trimmed.replace(/\.markdown$/i, ".md") : `${trimmed}.md`;
}

export function markdownFileStemFromFilename(filename) {
  return String(filename || DEFAULT_MARKDOWN_FILENAME)
    .trim()
    .replace(/\.(md|markdown)$/i, "");
}

export function markdownDocumentTitle(markdown, filename = "") {
  const heading = String(markdown ?? "").match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading.slice(0, 80);
  }
  return markdownFileStemFromFilename(filename || "Untitled notes").replace(/[-_]+/g, " ");
}

export function makeMarkdownDocumentId() {
  return `doc:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function markdownFilenameFromLoadedFile(filename) {
  const basename = String(filename || DEFAULT_MARKDOWN_FILENAME)
    .trim()
    .replace(/\.(txt|md|markdown)$/i, "");
  return normalizeMarkdownFilename(basename);
}

export function markdownNotebookCounts(markdown) {
  const text = String(markdown ?? "");
  const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  return { words, characters: text.length };
}

export function formatMarkdownSavedAt(value) {
  if (!value) {
    return "";
  }
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

export function openMarkdownNotebookDb(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(MARKDOWN_NOTEBOOK_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MARKDOWN_NOTEBOOK_STORE)) {
        db.createObjectStore(MARKDOWN_NOTEBOOK_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open notebook storage."));
  });
}

export async function withMarkdownNotebookStore(mode, callback) {
  const db = await openMarkdownNotebookDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MARKDOWN_NOTEBOOK_STORE, mode);
    const store = transaction.objectStore(MARKDOWN_NOTEBOOK_STORE);
    let callbackResult;
    try {
      callbackResult = callback(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(callbackResult);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Notebook storage failed."));
    };
  });
}

export async function saveMarkdownNotebookDraft({ markdown, filename }) {
  await withMarkdownNotebookStore("readwrite", (store) => {
    store.put({
      id: MARKDOWN_NOTEBOOK_CURRENT_KEY,
      title: markdownDocumentTitle(markdown, filename),
      markdown,
      filename,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
}

export async function loadMarkdownNotebookDraft() {
  const db = await openMarkdownNotebookDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MARKDOWN_NOTEBOOK_STORE, "readonly");
    const store = transaction.objectStore(MARKDOWN_NOTEBOOK_STORE);
    const request = store.get(MARKDOWN_NOTEBOOK_CURRENT_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not load notebook draft."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Notebook storage failed."));
    };
  });
}

export async function listMarkdownNotebookDocuments() {
  const db = await openMarkdownNotebookDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MARKDOWN_NOTEBOOK_STORE, "readonly");
    const store = transaction.objectStore(MARKDOWN_NOTEBOOK_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const documents = (request.result ?? [])
        .filter((item) => item?.id)
        .map((item) => ({
          ...item,
          title: item.title || markdownDocumentTitle(item.markdown, item.filename),
          filename: normalizeMarkdownFilename(item.filename || `${DEFAULT_MARKDOWN_FILENAME}.md`)
        }))
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
      resolve(documents);
    };
    request.onerror = () => reject(request.error ?? new Error("Could not list notebook documents."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Notebook storage failed."));
    };
  });
}

export async function loadMarkdownNotebookDocument(id) {
  const db = await openMarkdownNotebookDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MARKDOWN_NOTEBOOK_STORE, "readonly");
    const store = transaction.objectStore(MARKDOWN_NOTEBOOK_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not load notebook document."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("Notebook storage failed."));
    };
  });
}

export async function saveMarkdownNotebookDocument({ id, markdown, filename, title }) {
  const now = new Date().toISOString();
  const documentId = id || makeMarkdownDocumentId();
  let existing = null;
  if (id) {
    try {
      existing = await loadMarkdownNotebookDocument(id);
    } catch {
      existing = null;
    }
  }
  await withMarkdownNotebookStore("readwrite", (store) => {
    store.put({
      id: documentId,
      title: title?.trim() || markdownDocumentTitle(markdown, filename),
      markdown,
      filename: normalizeMarkdownFilename(filename),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
  });
  return documentId;
}

export async function deleteMarkdownNotebookDocument(id) {
  await withMarkdownNotebookStore("readwrite", (store) => {
    store.delete(id);
  });
}
