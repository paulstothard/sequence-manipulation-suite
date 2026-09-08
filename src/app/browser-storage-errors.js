export function describeBrowserStorageError(error, { scope = "Saved data", operation = "write" } = {}) {
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? "");
  const writing = operation === "write";
  if (name === "QuotaExceededError" || /quota|storage full/i.test(message)) {
    return writing
      ? `${scope} could not be saved because browser storage is full or unavailable. No changes were saved. Free site storage or remove saved items, then try again.`
      : `${scope} could not be read because browser storage is full or unavailable. Reload the page and try again.`;
  }
  if (["AbortError", "InvalidStateError", "TransactionInactiveError"].includes(name)
    || /transaction.*abort|save was interrupted/i.test(message)) {
    return writing
      ? `${scope} save was interrupted. No changes were saved. Try again.`
      : `${scope} could not be read because the storage operation was interrupted. Reload the page and try again.`;
  }
  return message || (writing
    ? `${scope} could not be saved. No changes were saved. Try again.`
    : `${scope} could not be read. Reload the page and try again.`);
}

export function makeBrowserStorageError(error, options) {
  const wrapped = new Error(describeBrowserStorageError(error, options));
  wrapped.name = error?.name || "StorageError";
  wrapped.cause = error;
  return wrapped;
}
