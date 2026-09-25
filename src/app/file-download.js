import { addTimestampToFilename } from "./canvas-export.js";

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = addTimestampToFilename(filename);
  document.body.append(link);
  link.click();
  // Blob-backed downloads are asynchronous. Removing the anchor or revoking
  // its URL in the same task can cancel the navigation in embedded browsers
  // even though desktop Chromium usually tolerates it.
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

export function downloadText(text, filename, mimeType = "text/plain") {
  const blob = new Blob([text], { type: mimeType });
  downloadBlob(blob, filename);
}
