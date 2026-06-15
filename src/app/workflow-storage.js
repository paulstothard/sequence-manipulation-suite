const WORKFLOW_DB_NAME = "sms3-workflow-library";
const WORKFLOW_DB_VERSION = 1;
const WORKFLOW_STORE_NAME = "saved-workflows";

function openWorkflowDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser; saved workflows are unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORKFLOW_DB_NAME, WORKFLOW_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKFLOW_STORE_NAME)) {
        const store = db.createObjectStore(WORKFLOW_STORE_NAME, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withWorkflowStore(mode, callback) {
  return openWorkflowDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(WORKFLOW_STORE_NAME, mode);
        const store = transaction.objectStore(WORKFLOW_STORE_NAME);
        let callbackResult;
        transaction.oncomplete = () => {
          db.close();
          resolve(callbackResult);
        };
        transaction.onerror = () => {
          const error = transaction.error;
          db.close();
          reject(error);
        };
        transaction.onabort = () => {
          const error = transaction.error ?? new Error("Workflow storage transaction was aborted.");
          db.close();
          reject(error);
        };
        callbackResult = callback(store);
      })
  );
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function makeWorkflowStorageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `workflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listSavedWorkflows() {
  const records = await withWorkflowStore("readonly", (store) => requestResult(store.getAll()));
  return [...records].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export async function getSavedWorkflow(id) {
  if (!id) {
    return null;
  }
  return withWorkflowStore("readonly", (store) => requestResult(store.get(id)));
}

export async function saveWorkflowDocument({ id, name, workflow, sourcePresetId }) {
  const now = new Date().toISOString();
  const existing = id ? await getSavedWorkflow(id) : null;
  const record = {
    id: existing?.id || id || makeWorkflowStorageId(),
    name: name || existing?.name || "Saved workflow",
    workflow,
    sourcePresetId: sourcePresetId ?? existing?.sourcePresetId ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  await withWorkflowStore("readwrite", (store) => {
    store.put(record);
  });
  return record;
}

export async function deleteSavedWorkflow(id) {
  if (!id) {
    return;
  }
  await withWorkflowStore("readwrite", (store) => {
    store.delete(id);
  });
}
