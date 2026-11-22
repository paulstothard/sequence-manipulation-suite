import { figurePngSize, PNG_EXPORT_DPI, CSS_PIXELS_PER_INCH } from "../core/figure-export.js";
import { downloadBlob } from "./file-download.js";
import { setPngDpi } from "../core/png-resolution.js";

export function svgPhysicalSize(svg) {
  const millimetres = value => {
    const match = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(mm|cm|in|pt|pc)\s*$/i.exec(value ?? "");
    return match ? Number(match[1]) * ({ mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 })[match[2].toLowerCase()] : null;
  };
  let widthMm = millimetres(svg.getAttribute("width"));
  let heightMm = millimetres(svg.getAttribute("height"));
  const box = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number) ?? [];
  if (widthMm && !heightMm && box[2] > 0 && box[3] > 0) heightMm = widthMm * box[3] / box[2];
  if (heightMm && !widthMm && box[2] > 0 && box[3] > 0) widthMm = heightMm * box[2] / box[3];
  return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm } : null;
}

export function getPngFilename(filename = "sms3-plot.svg") {
  return String(filename).replace(/\.[^.]+$/, "") + ".png";
}

export function serializeSvgElement(svgElement) {
  if (!svgElement) {
    return "";
  }
  const clone = svgElement.cloneNode(true);
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  for (const outline of clone.querySelectorAll("[data-sms3-inspection-outline]")) outline.remove();
  for (const glow of clone.querySelectorAll("[data-sms3-inspection-glow-def]")) glow.remove();
  for (const glow of clone.querySelectorAll("[data-sms3-inspection-glow-style]")) {
    const { filter: [value, priority] } = JSON.parse(glow.getAttribute("data-sms3-inspection-glow-style"));
    if (value) glow.style.setProperty("filter", value, priority);
    else glow.style.removeProperty("filter");
    glow.removeAttribute("data-sms3-inspection-glow-style");
    if (!glow.getAttribute("style")) glow.removeAttribute("style");
  }
  for (const active of clone.querySelectorAll("[data-sms3-inspection-active]")) {
    active.removeAttribute("data-sms3-inspection-active");
    active.style.removeProperty("--sms3-inspection-contrast");
    const shadeStyle = active.getAttribute("data-sms3-inspection-shade-style");
    if (shadeStyle) {
      const original = JSON.parse(shadeStyle);
      for (const property of ["fill", "filter"]) {
        const [value, priority] = original[property];
        if (value) active.style.setProperty(property, value, priority);
        else active.style.removeProperty(property);
      }
      active.removeAttribute("data-sms3-inspection-shade-style");
    }
    if (!active.getAttribute("style")) active.removeAttribute("style");
  }
  for (const mark of clone.querySelectorAll("[data-sms3-title-mark]")) {
    const text = String(mark.getAttribute("data-sms3-title-text") ?? "").trim();
    const title = [...mark.children].find((child) => child.tagName?.toLowerCase() === "title");
    if (title && text) title.textContent = text;
    mark.removeAttribute("data-sms3-title-mark");
    mark.removeAttribute("data-sms3-title-text");
    mark.removeAttribute("data-sms3-inspection-nearby");
  }
  const describedBy = String(clone.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((token) => token && !/^sms3-visual-inspection-\d+-instructions$/.test(token));
  if (describedBy.length) clone.setAttribute("aria-describedby", describedBy.join(" "));
  else clone.removeAttribute("aria-describedby");
  return new XMLSerializer().serializeToString(clone);
}

export function getSvgPngExportSize(width, height, physicalSize) {
  return figurePngSize(width, height, physicalSize);
}

export async function downloadSvgAsPng(svg, filename = "sms3-plot.png", { background = "#ffffff", maxPixels } = {}) {
  const documentSvg = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const viewBox = documentSvg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number) ?? [];
  const physicalSize = svgPhysicalSize(documentSvg);
  const width = viewBox[2] || (physicalSize && physicalSize.widthMm * CSS_PIXELS_PER_INCH / 25.4) || parseFloat(documentSvg.getAttribute('width')) || 920;
  const height = viewBox[3] || (physicalSize && physicalSize.heightMm * CSS_PIXELS_PER_INCH / 25.4) || parseFloat(documentSvg.getAttribute('height')) || 420;
  const size = figurePngSize(width, height, physicalSize, maxPixels);
  if (!viewBox.length) documentSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  // Rasterize the vector at the target resolution instead of resizing a
  // screen-resolution image. Keep viewBox geometry and text unchanged.
  documentSvg.setAttribute('width', String(size.width));
  documentSvg.setAttribute('height', String(size.height));
  svg = new XMLSerializer().serializeToString(documentSvg);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not render visual output for PNG download."));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (background !== null) {
      context.fillStyle = background;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(image, 0, 0, size.width, size.height);
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) {
      throw new Error("Could not create PNG output.");
    }
    downloadBlob(new Blob([setPngDpi(new Uint8Array(await pngBlob.arrayBuffer()), PNG_EXPORT_DPI)], { type: "image/png" }), filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
