import { addTimestampToFilename } from "./canvas-export.js";

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = addTimestampToFilename(filename);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(text, filename, mimeType = "text/plain") {
  const blob = new Blob([text], { type: mimeType });
  downloadBlob(blob, filename);
}
