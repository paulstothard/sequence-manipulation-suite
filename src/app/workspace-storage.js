const WORKSPACE_DB_NAME = "sms3-workspace-library";
const WORKSPACE_DB_VERSION = 2;
const WORKSPACE_SEQUENCE_STORE_NAME = "sequences";
const WORKSPACE_FEATURE_LAYER_STORE_NAME = "featureLayers";

function ensureWorkspaceStores(db) {
  if (!db.objectStoreNames.contains(WORKSPACE_SEQUENCE_STORE_NAME)) {
    const store = db.createObjectStore(WORKSPACE_SEQUENCE_STORE_NAME, { keyPath: "id" });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
    store.createIndex("name", "name", { unique: false });
    store.createIndex("alphabet", "alphabet", { unique: false });
  }
  if (!db.objectStoreNames.contains(WORKSPACE_FEATURE_LAYER_STORE_NAME)) {
    const store = db.createObjectStore(WORKSPACE_FEATURE_LAYER_STORE_NAME, { keyPath: "id" });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
    store.createIndex("sequenceId", "sequenceId", { unique: false });
    store.createIndex("sequenceHash", "sequenceHash", { unique: false });
    store.createIndex("alphabet", "alphabet", { unique: false });
  }
}

function openWorkspaceDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this browser; workspace storage is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      ensureWorkspaceStores(request.result);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withWorkspaceStore(storeName, mode, callback) {
  return openWorkspaceDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
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
          const error = transaction.error ?? new Error("Workspace storage transaction was aborted.");
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

function makeWorkspaceStorageId(prefix = "workspace-object") {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listWorkspaceSequences() {
  const records = await withWorkspaceStore(WORKSPACE_SEQUENCE_STORE_NAME, "readonly", (store) => requestResult(store.getAll()));
  return [...records].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export async function saveWorkspaceSequence(sequenceRecord) {
  const now = new Date().toISOString();
  const record = {
    ...sequenceRecord,
    id: sequenceRecord.id || makeWorkspaceStorageId("workspace-sequence"),
    name: sequenceRecord.name || sequenceRecord.title || "Workspace sequence",
    createdAt: sequenceRecord.createdAt || now,
    updatedAt: now
  };
  await withWorkspaceStore(WORKSPACE_SEQUENCE_STORE_NAME, "readwrite", (store) => {
    store.put(record);
  });
  return record;
}

export async function deleteWorkspaceSequence(id) {
  if (!id) {
    return;
  }
  await withWorkspaceStore(WORKSPACE_SEQUENCE_STORE_NAME, "readwrite", (store) => {
    store.delete(id);
  });
}

export async function listWorkspaceFeatureLayers({ sequenceId = "" } = {}) {
  const records = await withWorkspaceStore(WORKSPACE_FEATURE_LAYER_STORE_NAME, "readonly", (store) => requestResult(store.getAll()));
  return [...records]
    .filter((record) => !sequenceId || record.sequenceId === sequenceId)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export async function saveWorkspaceFeatureLayer(layerRecord) {
  const now = new Date().toISOString();
  const record = {
    ...layerRecord,
    id: layerRecord.id || makeWorkspaceStorageId("workspace-feature-layer"),
    kind: "feature-layer",
    label: layerRecord.label || layerRecord.name || "Workspace feature layer",
    createdAt: layerRecord.createdAt || now,
    updatedAt: now
  };
  await withWorkspaceStore(WORKSPACE_FEATURE_LAYER_STORE_NAME, "readwrite", (store) => {
    store.put(record);
  });
  return record;
}

export async function deleteWorkspaceFeatureLayer(id) {
  if (!id) {
    return;
  }
  await withWorkspaceStore(WORKSPACE_FEATURE_LAYER_STORE_NAME, "readwrite", (store) => {
    store.delete(id);
  });
}
