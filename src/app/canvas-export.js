export function makeSafeFileStem(value, fallback) {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

export function getDownloadTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

export function addTimestampToFilename(filename, date = new Date()) {
  const fallback = "sms3-output.txt";
  const clean = String(filename || fallback);
  const timestamp = getDownloadTimestamp(date);
  const dotIndex = clean.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < clean.length - 1) {
    return `${clean.slice(0, dotIndex)}-${timestamp}${clean.slice(dotIndex)}`;
  }
  return `${clean}-${timestamp}`;
}

export const PNG_300_DPI_SCALE = 300 / 96;
export const MAX_PNG_EXPORT_SCALE = 4;

export function getPngExportScale(scale = MAX_PNG_EXPORT_SCALE) {
  const requestedScale = Number(scale);
  return Math.max(
    PNG_300_DPI_SCALE,
    Math.min(MAX_PNG_EXPORT_SCALE, Number.isFinite(requestedScale) ? requestedScale : MAX_PNG_EXPORT_SCALE)
  );
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function canvasPixelDimensions(canvas) {
  const rect = canvas.getBoundingClientRect?.() || {};
  return {
    width: Math.max(1, canvas.width || Math.round(rect.width || 1)),
    height: Math.max(1, canvas.height || Math.round(rect.height || 1))
  };
}

function canvasDisplayDimensions(canvas) {
  const rect = canvas.getBoundingClientRect?.() || {};
  return {
    width: Math.max(1, Math.round(rect.width || canvas.width || 1)),
    height: Math.max(1, Math.round(rect.height || canvas.height || 1))
  };
}

function makeExportRect(width, height) {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() {
      return this;
    }
  };
}

export function makeCanvasPngExportCanvas(canvas, options = {}) {
  const scale = getPngExportScale(options.scale);
  const display = canvasDisplayDimensions(canvas);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = Math.max(1, Math.round(display.width * scale));
  exportCanvas.height = Math.max(1, Math.round(display.height * scale));
  const context = exportCanvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  if (typeof options.drawSnapshot === "function") {
    Object.defineProperty(exportCanvas, "getBoundingClientRect", {
      configurable: true,
      value: () => makeExportRect(display.width, display.height)
    });
    context.setTransform(scale, 0, 0, scale, 0, 0);
    options.drawSnapshot(context, exportCanvas, { scale, width: display.width, height: display.height });
  } else {
    context.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
  }
  return exportCanvas;
}

export function downloadCanvasPng(canvas, filename, options = {}) {
  const link = document.createElement("a");
  const exportCanvas = makeCanvasPngExportCanvas(canvas, options);
  link.href = exportCanvas.toDataURL("image/png");
  link.download = addTimestampToFilename(filename);
  link.click();
}

export function makeCanvasSvgSnapshot(canvas, options = {}) {
  const { width, height } = canvasPixelDimensions(canvas);
  const imageHref = canvas.toDataURL("image/png");
  const title = String(options.title || "SMS3 canvas snapshot");
  const description = String(options.description || "Raster snapshot of the current SMS3 Canvas view.");
  const metadata = {
    generator: "SMS3",
    snapshotType: "canvas-raster-svg",
    note: "This SVG preserves the current Canvas view as an embedded PNG image. It is not a reconstructed vector drawing.",
    ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {})
  };
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="sms3-canvas-title sms3-canvas-desc" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-sms3-snapshot-type="canvas-raster">`,
    `<title id="sms3-canvas-title">${escapeXml(title)}</title>`,
    `<desc id="sms3-canvas-desc">${escapeXml(description)}</desc>`,
    `<metadata>${escapeXml(JSON.stringify(metadata))}</metadata>`,
    `<image href="${imageHref}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`,
    "</svg>"
  ].join("");
  return svg;
}

export function downloadCanvasSvg(canvas, filename, options = {}) {
  const svg = makeCanvasSvgSnapshot(canvas, options);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = addTimestampToFilename(filename);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
