import { makeBrowserStorageError } from "./browser-storage-errors.js";

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

function withWorkspaceStores(storeNames, mode, callback) {
  return openWorkspaceDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        let callbackResult;
        let finished = false;
        const finish = (action, value) => {
          if (finished) return;
          finished = true;
          db.close();
          action(value);
        };
        transaction.oncomplete = () => {
          finish(resolve, callbackResult);
        };
        transaction.onerror = () => {
          finish(reject, makeBrowserStorageError(transaction.error, {
            scope: "Workspace",
            operation: mode === "readwrite" ? "write" : "read"
          }));
        };
        transaction.onabort = () => {
          finish(reject, makeBrowserStorageError(transaction.error ?? { name: "AbortError" }, {
            scope: "Workspace",
            operation: mode === "readwrite" ? "write" : "read"
          }));
        };
        try {
          callbackResult = callback(transaction);
        } catch (error) {
          try { transaction.abort(); } catch {}
          finish(reject, makeBrowserStorageError(error, {
            scope: "Workspace",
            operation: mode === "readwrite" ? "write" : "read"
          }));
        }
      })
  );
}

function withWorkspaceStore(storeName, mode, callback) {
  return withWorkspaceStores([storeName], mode, (transaction) => callback(transaction.objectStore(storeName)));
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

function normalizeWorkspaceSequence(sequenceRecord, now) {
  const sequence = String(sequenceRecord.sequence ?? "");
  if (/^\s*>/m.test(sequence)) {
    throw new Error("A Workspace record can contain only one sequence. Import multi-record FASTA through Workspace so SMS3 can save each FASTA record separately.");
  }
  return {
    ...sequenceRecord,
    sequence,
    id: sequenceRecord.id || makeWorkspaceStorageId("workspace-sequence"),
    name: sequenceRecord.name || sequenceRecord.title || "Workspace sequence",
    createdAt: sequenceRecord.createdAt || now,
    updatedAt: now
  };
}

function normalizeWorkspaceFeatureLayer(layerRecord, now) {
  return {
    ...layerRecord,
    id: layerRecord.id || makeWorkspaceStorageId("workspace-feature-layer"),
    kind: "feature-layer",
    label: layerRecord.label || layerRecord.name || "Workspace feature layer",
    createdAt: layerRecord.createdAt || now,
    updatedAt: now
  };
}

export async function saveWorkspaceBatch({ sequences = [], featureLayers = [] } = {}) {
  const now = new Date().toISOString();
  const savedSequences = sequences.map((record) => normalizeWorkspaceSequence(record, now));
  const savedFeatureLayers = featureLayers.map((record) => normalizeWorkspaceFeatureLayer(record, now));
  const storeNames = [];
  if (savedSequences.length > 0) storeNames.push(WORKSPACE_SEQUENCE_STORE_NAME);
  if (savedFeatureLayers.length > 0) storeNames.push(WORKSPACE_FEATURE_LAYER_STORE_NAME);
  if (storeNames.length === 0) return { sequences: [], featureLayers: [] };
  await withWorkspaceStores(storeNames, "readwrite", (transaction) => {
    const sequenceStore = savedSequences.length > 0
      ? transaction.objectStore(WORKSPACE_SEQUENCE_STORE_NAME)
      : null;
    const layerStore = savedFeatureLayers.length > 0
      ? transaction.objectStore(WORKSPACE_FEATURE_LAYER_STORE_NAME)
      : null;
    savedSequences.forEach((record) => sequenceStore.put(record));
    savedFeatureLayers.forEach((record) => layerStore.put(record));
  });
  return { sequences: savedSequences, featureLayers: savedFeatureLayers };
}

export async function saveWorkspaceSequenceLayerGroups(groups = []) {
  const now = new Date().toISOString();
  const savedSequences = groups.map((group) => normalizeWorkspaceSequence(group.sequenceDraft, now));
  const savedFeatureLayers = groups.flatMap((group, index) =>
    (group.layerDrafts ?? []).map((layerDraft) => normalizeWorkspaceFeatureLayer({
      ...layerDraft,
      id: "",
      sequenceId: savedSequences[index].id,
      sequenceHash: savedSequences[index].sequenceHash ?? layerDraft.sequenceHash ?? ""
    }, now))
  );
  await withWorkspaceStores(
    [WORKSPACE_SEQUENCE_STORE_NAME, WORKSPACE_FEATURE_LAYER_STORE_NAME],
    "readwrite",
    (transaction) => {
      const sequenceStore = transaction.objectStore(WORKSPACE_SEQUENCE_STORE_NAME);
      const layerStore = transaction.objectStore(WORKSPACE_FEATURE_LAYER_STORE_NAME);
      savedSequences.forEach((record) => sequenceStore.put(record));
      savedFeatureLayers.forEach((record) => layerStore.put(record));
    }
  );
  return { sequences: savedSequences, featureLayers: savedFeatureLayers };
}

export async function saveWorkspaceSequence(sequenceRecord) {
  return (await saveWorkspaceBatch({ sequences: [sequenceRecord] })).sequences[0];
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
  return (await saveWorkspaceBatch({ featureLayers: [layerRecord] })).featureLayers[0];
}

export async function deleteWorkspaceFeatureLayer(id) {
  if (!id) {
    return;
  }
  await withWorkspaceStore(WORKSPACE_FEATURE_LAYER_STORE_NAME, "readwrite", (store) => {
    store.delete(id);
  });
}
