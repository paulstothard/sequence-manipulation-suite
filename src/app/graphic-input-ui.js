import { createGraphicSource, GRAPHIC_LIMITS } from "../core/graphic-editor.js";
import { arrayBufferToBase64 } from "./input-file-readers.js";
const previews = new WeakMap();
export async function readGraphicFile(file, kind) {
  if (file.size > GRAPHIC_LIMITS.bytes)
    throw new Error("Images are limited to 8 MiB.");
  const input =
    kind === "png"
      ? JSON.stringify({
          dataUrl: `data:image/png;base64,${arrayBufferToBase64(await file.arrayBuffer())}`,
        })
      : await file.text();
  createGraphicSource(input, kind);
  return input;
}
export function refreshGraphicInput(elements, tool) {
  let current = previews.get(elements.inputPanel);
  const kind = tool?.metadata?.graphicInput;
  if (!kind) {
    if (current) {
      if (current.url) URL.revokeObjectURL(current.url);
      current.root.remove();
      previews.delete(elements.inputPanel);
    }
    return;
  }
  if (!current) {
    const root = document.createElement("div");
    root.className = "graphic-input-preview";
    const image = document.createElement("img");
    image.alt = "Input image preview";
    const note = document.createElement("p");
    note.className = "tti-help";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = "Show SVG source";
    root.append(image, note, toggle);
    elements.sequenceInput.before(root);
    current = { root, image, note, toggle, source: false };
    previews.set(elements.inputPanel, current);
    toggle.addEventListener("click", () => {
      current.source = !current.source;
      elements.sequenceInput.hidden = !current.source;
      toggle.textContent = current.source
        ? "Hide SVG source"
        : "Show SVG source";
    });
  }
  current.toggle.hidden = kind !== "svg";
  elements.sequenceInput.hidden = kind === "png" || !current.source;
  const value = elements.sequenceInput.value;
  if (current.value === value && current.kind === kind) return;
  current.kind = kind;
  current.value = value;
  if (current.url) {
    URL.revokeObjectURL(current.url);
    current.url = null;
  }
  try {
    if (!value.trim()) {
      current.image.hidden = true;
      current.note.textContent = "Choose an image or load the example.";
      return;
    }
    const source = createGraphicSource(value, kind);
    current.url =
      kind === "svg"
        ? URL.createObjectURL(
            new Blob([source.input], { type: "image/svg+xml" }),
          )
        : JSON.parse(source.input).dataUrl;
    current.image.src = current.url;
    current.image.hidden = false;
    current.note.textContent = `${source.width} × ${source.height} px · Click Run to edit.`;
  } catch (e) {
    current.image.hidden = true;
    current.note.textContent = e.message;
  }
}
