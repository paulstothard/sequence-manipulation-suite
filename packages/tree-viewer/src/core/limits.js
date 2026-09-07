export const VERSION = "0.1.0";
export const LIMITS = Object.freeze({
  inputBytes: 10 * 1024 * 1024,
  documentBytes: 16 * 1024 * 1024,
  nodes: 20001,
  visibleNodes: 4001,
  visibleTips: 1000,
  trees: 100,
  depth: 20000,
  labelCharacters: 4096,
  commentCharacters: 65536,
  comments: 40000,
  metadataCells: 100000,
  metadataColumns: 100,
  tracks: 5,
  historyBytes: 8 * 1024 * 1024,
  historyEntries: 50,
  rasterPixels: 25000000,
});
export const byteLength = (value) =>
  new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  ).length;
export function checkCancelled(context = {}) {
  context.throwIfCancelled?.();
  if (context.signal?.aborted || context.isCancelled?.())
    throw new DOMException("Tree operation cancelled.", "AbortError");
}
export async function checkpoint(context = {}, phase = "") {
  checkCancelled(context);
  context.reportProgress?.({ phase });
  if (context.yieldIfNeeded) await context.yieldIfNeeded();
  else if (context.signal)
    await new Promise((resolve) => setTimeout(resolve, 0));
  checkCancelled(context);
}
export class TreeInputError extends Error {
  constructor(message, source = "", offset = 0, code = "invalid-input") {
    const prefix = source.slice(0, offset),
      line = prefix.split("\n").length,
      column = offset - (prefix.lastIndexOf("\n") + 1) + 1;
    super(`${message} (line ${line}, column ${column})`);
    this.name = "TreeInputError";
    this.diagnostic = {
      code,
      message,
      line,
      column,
      offset,
      severity: "error",
    };
  }
}
