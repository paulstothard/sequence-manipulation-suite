import { getPngExportScale } from "./canvas-export.js";
import { downloadBlob } from "./file-download.js";

export function getPngFilename(filename = "sms3-plot.svg") {
  return String(filename).replace(/\.[^.]+$/, "") + ".png";
}

export function serializeSvgElement(svgElement) {
  if (!svgElement) {
    return "";
  }
  if (!svgElement.getAttribute("xmlns")) {
    svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  return new XMLSerializer().serializeToString(svgElement);
}

export async function downloadSvgAsPng(svg, filename = "sms3-plot.png") {
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
    const parser = new DOMParser();
    const documentSvg = parser.parseFromString(svg, "image/svg+xml").documentElement;
    const viewBox = documentSvg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
    const width = Math.max(1, Math.round(viewBox[2] || image.naturalWidth || 920));
    const height = Math.max(1, Math.round(viewBox[3] || image.naturalHeight || 420));
    const exportScale = getPngExportScale();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * exportScale));
    canvas.height = Math.max(1, Math.round(height * exportScale));
    const context = canvas.getContext("2d");
    context.setTransform(exportScale, 0, 0, exportScale, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) {
      throw new Error("Could not create PNG output.");
    }
    downloadBlob(pngBlob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
