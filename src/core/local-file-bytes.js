export const FILE_TOOL_LIMITS = Object.freeze({
  pastedCharacters: 5_000_000,
  files: 1_000,
  manifestBytes: 1024 * 1024,
  hashChunkBytes: 1024 * 1024,
  previewBytes: 1024 * 1024,
  previewLines: 1_000,
  lineCharacters: 16_384,
  archiveEntries: 10_000,
  archiveDirectoryBytes: 16 * 1024 * 1024,
  archiveScanBytes: 512 * 1024 * 1024,
  archivePathCharacters: 4_096
});

export function checkFileCancellation(context = {}) {
  context.throwIfCancelled?.();
  if (context.signal?.aborted) throw context.signal.reason ?? new DOMException("Cancelled", "AbortError");
}

export async function fileCheckpoint(context = {}) {
  checkFileCancellation(context);
  await context.yieldIfNeeded?.();
  checkFileCancellation(context);
}

export function requireLocalFile(file) {
  if (!file || typeof file.slice !== "function" || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error("Select a local file before running this tool.");
  }
  return file;
}

export function textFile(input, name = "pasted-text.txt") {
  const text = String(input ?? "");
  if (text.length > FILE_TOOL_LIMITS.pastedCharacters) {
    throw new Error("Pasted text exceeds 5,000,000 characters. Select the original file instead.");
  }
  const blob = new Blob([new TextEncoder().encode(text)]);
  // Node and browser callers both use the same File/Blob byte path.
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

export async function readByteRange(file, start, end, context = {}) {
  requireLocalFile(file);
  checkFileCancellation(context);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > file.size) {
    throw new Error("Invalid file byte range.");
  }
  const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
  checkFileCancellation(context);
  if (bytes.length !== end - start) throw new Error("The selected file could not be read completely. Select it again.");
  return bytes;
}

export function joinByteChunks(chunks, length = chunks.reduce((sum, bytes) => sum + bytes.length, 0)) {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const bytes of chunks) { result.set(bytes, offset); offset += bytes.length; }
  return result;
}

export function boundedInteger(value, defaultValue, maximum, label) {
  const number = value === undefined ? defaultValue : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${maximum.toLocaleString("en-US")}.`);
  }
  return number;
}
