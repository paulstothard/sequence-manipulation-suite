import { createAnnotationStyleControls } from "./annotation-style-controls.js";
import { isConnector, annotationFillStyle, strokeDash, snapEndpoint, snapSquare, equalDimensionGuide, snapProportions, snapTranslation, moveConnectorHandle } from "../core/annotation-geometry.js";
import { appendConnectorControls, appendSnapGuide, alignmentTargets } from "./annotation-controls.js";
import {
  parseSvg,
  renderGraphic,
  annotationSvg,
  initialGraphicState,
  validateGraphicState,
  GRAPHIC_LIMITS,
  editableTags,
} from "../core/graphic-editor.js";
import { IMAGE_FONTS } from "../core/image-fonts.js";
import { isImageColor, colorOpacity, withColorOpacity, annotationColor, setAnnotationColor, normalizeAnnotationFill } from "../core/image-colors.js";
import { createEditorSession } from "./editor-session.js";
import { installControlHelp } from "./control-help.js";
import { createColorPicker } from "./color-picker.js";
import { createCanvasLabelEditor } from "./canvas-label-editor.js";
import { createImageColorSampler } from "./image-color-sampler.js";
import { createImageEditorNavigation, imageEditorHandleSize } from "./image-editor-navigation.js";
import { bindImageEditorDeletion } from "./image-editor-shortcuts.js";
import { loadImageFonts, embedImageFonts } from "./image-fonts.js";
import { downloadText, downloadBlob } from "./file-download.js";

const NS = "http://www.w3.org/2000/svg";
const icons = {
  select: '<path d="m5 3 14 10-7 1-4 7z"/>',
  draw: '<path d="m4 17 12-12 3 3-12 12H4zM3 23h18"/>',
  box: '<rect x="4" y="5" width="16" height="14" rx="3"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  arrow: '<path d="M4 20 20 4M9 4h11v11"/>',
  line: '<path d="m5 19 14-14"/>',
  pointer: '<path d="m5 19 12-12"/><circle cx="18" cy="6" r="2" fill="currentColor"/>',
  label: '<path d="M5 7V4h14v3M12 4v16M8 20h8"/>',
  duplicate:
    '<rect x="8" y="8" width="12" height="13"/><path d="M15 8V3H3v13h5"/>',
  remove: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/>',
};
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const svgEl = (tag, attrs) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const matrixValues = (m) => [m.a, m.b, m.c, m.d, m.e, m.f];
// WebKit can return legacy SVGMatrix objects, whose multiply rejects DOMMatrix.
const domMatrix = m => new DOMMatrix(matrixValues(m));
const fontKey = (family) =>
  Object.keys(IMAGE_FONTS).find((k) => IMAGE_FONTS[k].family === family);
const rgbHex = (value, opacity = 1) => {
  if (isImageColor(value)) return withColorOpacity(value, colorOpacity(value) * opacity);
  const m = value?.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  const rgb = m
    ? "#" +
        m
          .slice(1, 4)
          .map((n) => (+n).toString(16).padStart(2, "0"))
          .join("")
    : "#18232c";
  return withColorOpacity(rgb, (m?.[4] === undefined ? 1 : +m[4]) * opacity);
};

function styleAnnotation(shape) {
  for (const [key, value] of Object.entries({
    fill: "none",
    stroke: "none",
    "font-weight": "400",
    "font-style": "normal",
    "text-anchor": "start",
    "dominant-baseline": "auto",
    display: "inline",
    visibility: "visible",
    "clip-path": "none",
    mask: "none",
    "fill-opacity": "1",
    "stroke-opacity": "1",
    "stroke-dasharray": "none",
  }))
    shape.style.setProperty(key, value, "important");
  for (const attr of [...shape.attributes])
    if (
      [
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-dasharray",
        "fill-opacity",
        "opacity",
        "font-family",
        "font-size",
      ].includes(attr.name)
    )
      shape.style.setProperty(attr.name, attr.value, "important");
  shape.style.setProperty("white-space", "pre", "important");
}

function addSelectionHitAreas(root) {
  // Keep each invisible hit shape beside its artwork so overlapping objects,
  // group transforms and clipping retain their normal paint order. Exports
  // are rebuilt from the document and never include these editor-only shapes.
  const hits = [];
  for (const shape of root.querySelectorAll(
    "rect,circle,ellipse,line,path,polyline,polygon",
  )) {
    if (
      shape.closest(
        "defs,clipPath,mask,marker,pattern,symbol,[data-editor-overlay],[data-editor-hit]",
      )
    )
      continue;
    const owner = shape.closest("[data-object]");
    if (!owner) continue;
    const style = getComputedStyle(shape);
    const hit = shape.cloneNode(false);
    hit.removeAttribute("id");
    hit.removeAttribute("data-object");
    hit.setAttribute("data-editor-hit", owner.getAttribute("data-object"));
    hit.setAttribute("aria-hidden", "true");
    const interior =
      ["rect", "circle", "ellipse", "polygon"].includes(shape.localName) ||
      style.fill !== "none";
    for (const property of [
      "display",
      "visibility",
      "clip-path",
      "clip-rule",
      "mask",
      "fill-rule",
    ])
      hit.style.setProperty(
        property,
        style.getPropertyValue(property),
        "important",
      );
    for (const [property, value] of Object.entries({
      opacity: "0",
      fill: "none",
      stroke: "transparent",
      "stroke-width": "16px",
      "stroke-dasharray": "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke",
      "pointer-events": interior ? "visible" : "visibleStroke",
    }))
      hit.style.setProperty(property, value, "important");
    hits.push([shape, hit]);
  }
  // Finish style reads before inserting nodes, avoiding repeated layout work.
  for (const [shape, hit] of hits) shape.after(hit);
}

export async function renderGraphicEditor(
  container,
  source,
  editorDocument,
  { preview = false } = {},
) {
  const loading = el("p", "Opening image…", "tti-help");
  container.append(loading);
  let disposed = false;
  container._sms3VisualCleanup = () => {
    disposed = true;
  };
  try {
    await loadImageFonts();
    if (disposed) return;
    const parsed = source.kind === "svg" ? parseSvg(source.input) : null;
    const state = structuredClone(
      editorDocument?.state ?? initialGraphicState(),
    );
    validateGraphicState(state, source, parsed);
    state.annotations.forEach(a => normalizeAnnotationFill(a, { highlightOpacity: .3 }));
    if (source.kind === "png")
      await loadRaster(JSON.parse(source.input).dataUrl);
    if (disposed) return;
    mount(container, source, state, parsed, { preview });
    loading.remove();
  } catch (error) {
    if (!disposed) loading.textContent = error.message;
  }
}
function loadRaster(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This image could not be decoded. Choose a valid PNG."));
    image.src = url;
  });
}
function mount(container, source, initial, parsed, { preview }) {
  let state = initial,
    selected = "",
    mode = "select",
    drag = null,
    session,
    svg,
    selectionBox,
    activeTab = "Selection",
    snapGuide;
  const tool = source.kind === "svg" ? "svg-editor" : "image-annotator";
  const vb = parsed?.viewBox ?? [0, 0, source.width, source.height];
  const defaultSize = Math.max(12, Math.min(60, Math.round(vb[2] / 45)));
  let defaults = {
    color: "#c13b32",
    fill: "#f0bc36",
    fillOpacity: 1,
    filled: false,
    font: "inter",
    fontSize: defaultSize,
    strokeWidth: Math.max(1, vb[2] / 450),
    opacity: 1,
    cornerRadius: 8,
    text: "Label",
  };
  const root = el(
    "section",
    undefined,
    "text-table-image-editor graphic-editor",
  );
  root.setAttribute(
    "aria-label",
    source.kind === "svg" ? "SVG Editor" : "Image Annotator",
  );
  root.tabIndex = -1;
  const header = el("header", undefined, "tti-header"),
    titlebar = el("div", undefined, "tti-titlebar"),
    exports = el("div", undefined, "tti-exports"),
    history = el("div", undefined, "tti-history");
  titlebar.append(
    el("div", source.kind === "svg" ? "SVG image" : "PNG image", "tti-title"),
    exports,
  );
  header.append(titlebar, history);
  const message = el("div", "", "tti-message");
  message.setAttribute("role", "status");
  const workspace = el("div", undefined, "tti-workspace"),
    stage = el("div", undefined, "tti-stage"),
    toolbar = el("div", undefined, "tti-tools");
  toolbar.setAttribute("aria-label", "Drawing tools");
  toolbar.setAttribute("role", "toolbar");
  const viewport = el("div", undefined, "tti-viewport graphic-viewport");
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Image canvas");
  const picture = el("div", undefined, "graphic-picture"),
    shadow = picture.attachShadow({ mode: "open" });
  viewport.append(picture);
  const colorSampler = createImageColorSampler(viewport, {
    image: () => svg,
    render: () => exportSvg(),
    size: () => ({ width:source.width, height:source.height }),
  });
  const viewbar = el("div", undefined, "tti-viewbar"),
    status = el(
      "span",
      `${source.width} × ${source.height} px`,
      "tti-dimensions",
    );
  viewbar.append(status);
  const controls = el("div", undefined, "tti-controls"),
    tabs = el("div", undefined, "tti-tabs"),
    panels = el("div", undefined, "tti-panels");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Image settings");
  root.append(header, message, workspace);
  workspace.append(stage, controls);
  stage.append(toolbar, viewport, viewbar);
  controls.append(tabs, panels);
  container.append(root);
  const disposeToolbarHelp = installControlHelp(toolbar, { compact:true });
  const colors = [];
  const button = (name, action, parent = toolbar, icon) => {
    const b = el("button", icon ? "" : name);
    b.type = "button";
    b.title = name;
    b.setAttribute("aria-label", name);
    if (icon) {
      b.className = "tti-icon-button";
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[icon]}</svg>`;
      if (toolbar.contains(parent)) {
        b.removeAttribute("title");
        b.dataset.controlHelp = name;
      } else b.append(el("span", name));
    }
    b.addEventListener("click", () =>
      Promise.resolve()
        .then(action)
        .catch((e) => (message.textContent = e.message)),
    );
    parent.append(b);
    return b;
  };
  const field = (name, parent, value, options, type = "text") => {
    if (type === "color") {
      const c = createColorPicker(name, value, { sampleColor:colorSampler.sample });
      colors.push(c);
      parent.append(c.element);
      return c.input;
    }
    const wrap = el("label", undefined, "tti-field"),
      f = el(options ? "select" : "input");
    f.setAttribute("aria-label", name);
    wrap.append(el("span", name));
    if (options)
      for (const [value, label] of options) {
        const o = el("option", label);
        o.value = value;
        f.append(o);
      }
    else f.type = type;
    if (type === "checkbox") {
      f.checked = value;
      wrap.prepend(f);
    } else {
      f.value = value;
      wrap.append(f);
    }
    parent.append(wrap);
    return f;
  };
  const number = (name, parent, value, min, max, step = 1) => {
    const f = field(name, parent, value, null, "number");
    Object.assign(f, { min, max, step });
    return f;
  };
  const pair = (parent) => {
    const e = el("div", undefined, "tti-pair");
    parent.append(e);
    return e;
  };
  const zoom = field("Preview size", viewbar, "fit", [
    ["fit", "Fit width"],
    ["1", "100%"],
    ["1.5", "150%"],
    ["2", "200%"],
  ]);
  zoom.addEventListener("change", () => {
    sizePicture();
    drawSelection();
  });
  zoom.title = "Pinch or Ctrl/Command-scroll to zoom. Drag empty canvas space to pan.";
  const navigation = createImageEditorNavigation(viewport, {
    image: () => svg, width: () => source.width, zoom,
    redraw: () => { sizePicture(); drawSelection(); labelEditor.refresh(); },
    editable: event => event.composedPath().some(node => node instanceof Element &&
      (node.matches('[data-object],[data-editor-hit],[data-resize],[data-connector-handle]') || (mode !== 'select' && node === svg))),
    clearSelection: () => { if (mode === 'select') select(''); },
    cancelEdit: () => {
      if (!drag) return;
      state = drag.before; drag = null; snapGuide = undefined; draw();
    },
  });
  const panes = {},
    tabButtons = {};
  for (const name of ["Selection", "Objects"]) {
    const pane = el("div", undefined, "tti-pane");
    pane.setAttribute("role", "tabpanel");
    pane.setAttribute("aria-label", name);
    panels.append(pane);
    panes[name] = pane;
    const b = button(name, () => activateTab(name), tabs);
    b.setAttribute("role", "tab");
    tabButtons[name] = b;
  }
  function activateTab(name) {
    activeTab = name;
    for (const c of colors) c.close();
    for (const key of Object.keys(panes)) {
      panes[key].hidden = key !== name;
      panes[key].inert = key !== name;
      tabButtons[key].setAttribute("aria-selected", String(key === name));
      tabButtons[key].tabIndex = key === name ? 0 : -1;
    }
  }
  tabs.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      activateTab(
        e.key === "Home"
          ? "Selection"
          : e.key === "End"
            ? "Objects"
            : activeTab === "Selection"
              ? "Objects"
              : "Selection",
      );
      tabButtons[activeTab].focus();
    }
  });
  const modeButtons = {};
  for (const [key, name] of [
    ["select", "Select"],
    ["draw", "Draw"],
    ["pointer", "Pointer"],
    ["arrow", "Arrow"],
    ["line", "Line"],
    ["box", "Box"],
    ["ellipse", "Ellipse"],
    ["label", "Text"],
  ])
    modeButtons[key] = button(name, () => setMode(key), toolbar, key);
  const actions = el("div", undefined, "tti-annotation-actions");
  toolbar.append(actions);
  const duplicate = button(
      "Duplicate",
      duplicateSelection,
      actions,
      "duplicate",
    ),
    remove = button("Delete", deleteSelection, actions, "remove");
  const hint = el("p", "", "tti-help");
  panes.Selection.append(hint);
  const label = field("Label text", panes.Selection, "");
  label.maxLength = 2000;
  const labelEditor = createCanvasLabelEditor(viewport, {
    maxLength: 2000,
    target: id => state.annotations.find(a => a.id === id)?.type === 'label'
      ? shadow.querySelector(`[data-object="${id}"] text`) : null,
    read: id => state.annotations.find(a => a.id === id)?.text ?? '',
    write: (id, text) => change('Label text', s => { s.annotations.find(a => a.id === id).text = text; }, { coalesce: true }),
  });
  const color = field("Color", panes.Selection, defaults.color, null, "color");
  const fillColor = field(
    "Fill color",
    panes.Selection,
    defaults.fill,
    null,
    "color",
  );
  const filled = field("Fill shape", panes.Selection, false, null, "checkbox");
  const noStroke = field(
    "No outline",
    panes.Selection,
    false,
    null,
    "checkbox",
  );
  const font = field("Font", panes.Selection, "inter", [
    ["original", "Original font"],
    ...Object.entries(IMAGE_FONTS).map(([k, f]) => [k, f.label]),
  ]);
  for (const [name, test] of [
    ["Bundled monospace", (f) => f.files && f.monospace],
    ["Bundled proportional", (f) => f.files && !f.monospace],
    ["System fonts", (f) => !f.files],
  ]) {
    const g = el("optgroup");
    g.label = name;
    for (const o of [...font.options])
      if (IMAGE_FONTS[o.value] && test(IMAGE_FONTS[o.value])) g.append(o);
    font.append(g);
  }
  const fontSize = number("Font size", panes.Selection, defaults.fontSize, 1, 300);
  const ending = field("Line ending", panes.Selection, "line", [["line", "None"], ["arrow", "Arrow"], ["pointer", "Dot"]]);
  ending.addEventListener("change", () => {
    if (annotation()) change("Line ending", s => { s.annotations.find(a => a.id === selected).type = ending.value; });
    else setMode(ending.value);
  });
  function nativePattern(computed) {
    const value = computed?.strokeDasharray;
    if (!value || value === "none") return "solid";
    const parts = value.split(/[ ,]+/).map(parseFloat);
    const width = parseFloat(computed.strokeWidth);
    if (parts.length === 2 && parts[0] === 0) return "dotted";
    if (parts.length === 2 && Math.abs(parts[0] - width * 4) < .01 && Math.abs(parts[1] - width * 3) < .01) return "dashed";
    return "custom";
  }
  const appearance = createAnnotationStyleControls(panes.Selection, (key, value, options) => {
    if (annotation() || !selected) { editStyle("Object appearance", key, value, options); return; }
    const computed = getComputedStyle(selectedElement()), pattern = nativePattern(computed);
    change("Object appearance", s => {
      const style = (s.edits[selected] ??= {}).style ??= {};
      if (key === "strokeWidth") {
        style["stroke-width"] = value;
        if (pattern !== "custom") style["stroke-dasharray"] = strokeDash(pattern, value);
      } else if (key === "strokePattern") {
        style["stroke-dasharray"] = strokeDash(value, parseFloat(computed.strokeWidth) || 2);
        style["stroke-linecap"] = "round";
      }
    }, options);
  });
  const straighten = button("Straighten", () => change("Straighten connector", s => {
    const a = s.annotations.find(a => a.id === selected); if (a) { a.bendX = 0; a.bendY = 0; }
  }), panes.Selection);
  const cornerRadius = number("Corner radius", panes.Selection, defaults.cornerRadius, 0, 100, 1);
  cornerRadius.addEventListener("change", () => editStyle("Corner radius", "cornerRadius", +cornerRadius.value));
  const parentButton = button(
    "Select parent group",
    selectParent,
    panes.Selection,
  );
  const precision = el("details", undefined, "tti-precision");
  precision.append(el("summary", "Position & size"));
  panes.Selection.append(precision);
  const opacity = number("Object opacity (%)", precision, 100, 0, 100, 5);
  const geometry = pair(precision),
    position = {};
  for (const [k, name] of [
    ["x", "Left"],
    ["y", "Top"],
    ["w", "Width"],
    ["h", "Height"],
  ])
    position[k] = number(
      name,
      geometry,
      0,
      k === "w" || k === "h" ? 0.1 : -100000,
      100000,
      0.5,
    );
  const search = field("Find object", panes.Objects, "");
  search.placeholder = "Label, group or shape";
  const objectList = field("Objects", panes.Objects, "", []);
  objectList.size = 9;
  const objectCount = el("p", "", "tti-help");
  panes.Objects.append(objectCount);
  search.addEventListener("input", refreshObjects);
  objectList.addEventListener("change", () => select(objectList.value));
  bindImageEditorDeletion(root, remove, deleteSelection, objectList);
  const help = el(
    "p",
    "Drag to align object edges or centers. Dotted guides show alignment. Connector ends aim; the middle bends. Shift constrains angles or proportions; Alt bypasses snapping. Arrow keys nudge.",
    "tti-help",
  );
  panes.Objects.append(help);
  function setMode(value) {
    labelEditor.close();
    mode = value;
    for (const [k, b] of Object.entries(modeButtons))
      b.setAttribute("aria-pressed", String(k === value));
    if (value !== "select") selected = "";
    viewport.style.cursor = value === "select" ? "default" : "crosshair";
    viewport.style.setProperty("--graphic-object-cursor", value === "select" ? "move" : "crosshair");
    sync();
    drawSelection();
    activateTab("Selection");
  }
  function annotation() {
    return state.annotations.find((a) => a.id === selected);
  }
  function selectedElement() {
    return selected
      ? shadow.querySelector(`[data-object="${selected}"]`)
      : null;
  }
  function sourceNode() {
    return parsed?.nodes.find((n) => n.id === selected);
  }
  function change(name, mutator, options) {
    const next = structuredClone(state);
    try {
      mutator(next);
      validateGraphicState(next, source, parsed);
      state = next;
      message.textContent = "";
      draw();
      session?.changed(name, options);
      return true;
    } catch (error) {
      message.textContent = error.message;
      sync();
      return false;
    }
  }
  function select(id) {
    labelEditor.close();
    selected = id;
    mode = "select";
    for (const [k, b] of Object.entries(modeButtons))
      b.setAttribute("aria-pressed", String(k === "select"));
    viewport.style.cursor = "default";
    viewport.style.setProperty("--graphic-object-cursor", "move");
    sync();
    drawSelection();
  }
  function editStyle(name, key, value, options) {
    if (annotation())
      change(
        name,
        (s) => {
          const a = s.annotations.find((a) => a.id === selected);
          if (key === 'color' || key === 'fill') setAnnotationColor(a, key, value);
          else a[key] = value;
        },
        options,
      );
    else if (selected)
      change(
        name,
        (s) => {
          const edit = (s.edits[selected] ??= {});
          edit.style ??= {};
          edit.style[key] = value;
          if (key === "fill" || key === "stroke") edit.style[`${key}-opacity`] = 1;
        },
        options,
      );
    else {
      defaults[key] = value;
      sync();
    }
  }
  label.addEventListener("input", () => {
    if (annotation())
      editStyle("Label text", "text", label.value, { coalesce: true });
    else if (selected)
      change(
        "Label text",
        (s) => {
          (s.edits[selected] ??= {}).text = label.value;
        },
        { coalesce: true },
      );
    else defaults.text = label.value;
  });
  color.addEventListener("input", (e) => {
    const element = selectedElement();
    editStyle(
      "Color",
      annotation() || !selected
        ? "color"
        : element?.tagName === "text"
          ? "fill"
          : "stroke",
      color.value,
      e.detail,
    );
  });
  fillColor.addEventListener("input", (e) =>
    editStyle(
      "Fill color",
      annotation() || !selected ? "fill" : "fill",
      fillColor.value,
      e.detail,
    ),
  );
  filled.addEventListener("change", () => {
    if (annotation() || !selected)
      editStyle("Fill shape", "filled", filled.checked);
    else
      editStyle(
        "Fill shape",
        "fill",
        filled.checked ? fillColor.value : "none",
      );
  });
  noStroke.addEventListener("change", () =>
    editStyle("Outline", "stroke", noStroke.checked ? "none" : color.value),
  );
  font.addEventListener("change", () => {
    if (annotation() || !selected) {
      if (font.value !== "original")
        editStyle("Label font", "font", font.value);
    } else
      change("Label font", (s) => {
        const e = (s.edits[selected] ??= {});
        e.style ??= {};
        if (font.value === "original") delete e.style["font-family"];
        else e.style["font-family"] = IMAGE_FONTS[font.value].family;
      });
  });
  fontSize.addEventListener("change", () =>
    editStyle(
      "Font size",
      annotation() || !selected ? "fontSize" : "font-size",
      +fontSize.value,
    ),
  );
  opacity.addEventListener("change", () =>
    editStyle("Opacity", "opacity", +opacity.value / 100),
  );
  function objectBox(element = selectedElement()) {
    if (!element || !svg) return null;
    try {
      const box = element.getBBox(),
        m = svg.getScreenCTM().inverse().multiply(element.getScreenCTM());
      const pts = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
      const xs = pts.map((p) => p.x),
        ys = pts.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    } catch {
      return null;
    }
  }
  function transformSelection(next, matrix) {
    const a = next.annotations.find((a) => a.id === selected);
    if (a) {
      if (a.type === "draw") {
        a.points = a.points.map(([x, y]) => {
          const p = new DOMPoint(x, y).matrixTransform(matrix);
          return [p.x, p.y];
        });
        const xs = a.points.map((p) => p[0]),
          ys = a.points.map((p) => p[1]);
        a.x = Math.min(...xs);
        a.y = Math.min(...ys);
        a.w = Math.max(...xs) - a.x;
        a.h = Math.max(...ys) - a.y;
      } else {
        const p = new DOMPoint(a.x, a.y).matrixTransform(matrix);
        a.x = p.x;
        a.y = p.y;
        a.w *= matrix.a;
        a.h *= matrix.d;
        if (a.bendX !== undefined) a.bendX *= matrix.a;
        if (a.bendY !== undefined) a.bendY *= matrix.d;
        if (a.type === "label")
          a.fontSize = Math.max(
            1,
            Math.min(300, a.fontSize * Math.abs(matrix.a)),
          );
      }
      return;
    }
    const element = selectedElement();
    if (!element) return;
    const parent = domMatrix(svg.getScreenCTM())
      .inverse()
      .multiply(domMatrix(element.parentNode.getScreenCTM()));
    const own =
      element.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix();
    (next.edits[selected] ??= {}).transform = matrixValues(
      parent.inverse().multiply(matrix).multiply(parent).multiply(own),
    );
  }
  for (const [key, input] of Object.entries(position))
    input.addEventListener("change", () => {
      const b = objectBox();
      if (!b) return;
      const v = +input.value;
      const m =
        key === "x" || key === "y"
          ? new DOMMatrix().translate(
              key === "x" ? v - b.x : 0,
              key === "y" ? v - b.y : 0,
            )
          : new DOMMatrix()
              .translate(b.x, b.y)
              .scale(
                key === "w" ? v / Math.max(b.w, 0.1) : 1,
                key === "h" ? v / Math.max(b.h, 0.1) : 1,
              )
              .translate(-b.x, -b.y);
      change("Position / size", (s) => transformSelection(s, m));
    });
  function deleteSelection() {
    if (!selected) return;
    labelEditor.close();
    const id = selected;
    if (
      change("Delete object", (s) => {
        if (id.startsWith("a-"))
          s.annotations = s.annotations.filter((a) => a.id !== id);
        else (s.edits[id] ??= {}).deleted = true;
      })
    ) {
      selected = "";
      draw();
      viewport.focus({ preventScroll: true });
    }
  }
  function duplicateSelection() {
    const a = annotation();
    if (!a) return;
    const copy = structuredClone(a);
    copy.id = `a-${crypto.randomUUID()}`;
    copy.x += 10;
    copy.y += 10;
    if (copy.points)
      copy.points = copy.points.map(([x, y]) => [x + 10, y + 10]);
    if (change("Duplicate annotation", (s) => s.annotations.push(copy))) {
      selected = copy.id;
      draw();
    }
  }
  function selectParent() {
    const parent = selectedElement()?.parentElement?.closest("[data-object]");
    if (parent) select(parent.getAttribute("data-object"));
  }
  function visibleSourceNodes() {
    const ids = new Set(
      [...shadow.querySelectorAll("[data-object]")]
        .filter((e) => !e.closest("defs,clipPath,mask,marker,pattern,symbol"))
        .map((e) => e.getAttribute("data-object")),
    );
    return parsed?.nodes.filter((n) => ids.has(n.id)) ?? [];
  }
  function objectName(n) {
    return `${n.tag}${n.attrs.id ? " · " + n.attrs.id : ""}${n.tag === "text" ? " · " + (state.edits[n.id]?.text ?? n.children.filter((c) => typeof c === "string").join("")).slice(0, 65) : ""}`;
  }
  function refreshObjects() {
    const filter = search.value.toLowerCase();
    const entries = [
      ...visibleSourceNodes().map((n) => [n.id, objectName(n)]),
      ...state.annotations.map((a, i) => [
        a.id,
        `${i + 1}. ${a.type === "label" ? a.text || "Label" : a.type}`,
      ]),
    ].filter(([, name]) => name.toLowerCase().includes(filter));
    objectList.replaceChildren();
    for (const [id, name] of entries.slice(0, 200)) {
      const o = el("option", name);
      o.value = id;
      objectList.append(o);
    }
    objectList.value = selected;
    objectCount.textContent = `${entries.length} objects${entries.length > 200 ? " · showing first 200; refine the search" : ""}`;
  }
  function sync() {
    const a = annotation(),
      element = selectedElement(),
      node = sourceNode(),
      has = !!element;
    const type = a?.type ?? node?.tag ?? mode;
    const text = type === "label" || type === "text";
    ending.closest("label").hidden = !a || !isConnector(type);
    ending.value = isConnector(type) ? type : "line";
    straighten.hidden = !a || !isConnector(type);
    straighten.disabled = !(a?.bendX || a?.bendY);
    cornerRadius.closest("label").hidden = type !== "box" || !!node;
    cornerRadius.value = a?.cornerRadius ?? (a ? 0 : defaults.cornerRadius);
    const computed = element ? getComputedStyle(element) : null;
    hint.textContent = selected
      ? `${a ? "Annotation" : "SVG object"} · ${type}${node?.attrs.id ? " · " + node.attrs.id : ""}`
      : mode === "select"
        ? "Click an object to select it."
        : "Drag on the image to draw. Text labels are placed with a click.";
    if (a && isConnector(type)) hint.textContent += " · Drag ends to aim, the middle to bend, or the line to move. Shift snaps; Alt releases.";
    else if (a?.type === 'label') hint.textContent += " · Double-click or Enter to edit text. Backspace/Delete removes the label.";
    else if (a?.type === 'draw') hint.textContent += " · Resize snaps to original proportions. Shift constrains; Alt releases.";
    else if (["box", "ellipse"].includes(type)) hint.textContent += " · Snaps to square / circle. Shift constrains; Alt releases.";
    else if (node) hint.textContent += " · Drag to move; drag the corner handle to resize.";
    label.closest("label").hidden = !text;
    label.value =
      a?.text ??
      (element?.tagName === "text" ? element.textContent : defaults.text);
    label.disabled =
      !!node &&
      node.children.some(
        (c) => typeof c !== "string" && !["title", "desc"].includes(c.tag),
      );
    if (label.disabled)
      hint.textContent += " · Styled text: edit its font, color or position.";
    color.value =
      (a ? annotationColor(a, 'color') : null) ??
      (computed
        ? rgbHex(text ? computed.fill : computed.stroke, +(text ? computed.fillOpacity : computed.strokeOpacity))
        : defaults.color);
    fillColor.value =
      (a ? annotationColor(a, 'fill') : null) ?? (computed ? rgbHex(computed.fill, +computed.fillOpacity) : defaults.fill);
    filled.checked =
      a?.filled ?? (computed ? computed.fill !== "none" : defaults.filled);
    noStroke.checked = computed?.stroke === "none";
    noStroke.closest("label").hidden = !node || text;
    const fillable = [
      "box",
      "ellipse",
      "rect",
      "circle",
      "polygon",
      "path",
      "g",
    ].includes(type);
    const addedFill = a ? annotationFillStyle(a) : annotationFillStyle(defaults);
    colors.find((c) => c.input === fillColor).element.hidden = !fillable || (!node && addedFill === "none");
    filled.closest("label").hidden = !fillable || !node;
    font.closest("label").hidden = fontSize.closest("label").hidden = !text;
    font.value =
      a?.font ??
      (node
        ? (fontKey(state.edits[selected]?.style?.["font-family"]) ?? "original")
        : defaults.font);
    font.options[0].disabled = !!a || !selected;
    fontSize.value =
      a?.fontSize ??
      (computed ? parseFloat(computed.fontSize) : defaults.fontSize);
    opacity.value = Math.round(
      (a?.opacity ??
        (computed ? parseFloat(computed.opacity) : defaults.opacity)) * 100,
    );
    duplicate.disabled = !a;
    duplicate.dataset.controlHelp = a
      ? "Duplicate annotation"
      : "Select an added annotation to duplicate it";
    remove.disabled = !has;
    parentButton.hidden =
      !node || !element?.parentElement?.closest("[data-object]");
    precision.hidden = !has;
    const b = objectBox();
    if (b)
      for (const [key, input] of Object.entries(position))
        input.value = Number(b[key].toFixed(2));
    for (const key of ['w', 'h']) position[key].closest('label').hidden = a?.type === 'label';
    const editing = has || mode !== "select";
    colors.find((c) => c.input === color).element.hidden = !editing;
    appearance.update({
      ...(a ?? defaults),
      type,
      strokeWidth: a?.strokeWidth ?? (computed ? parseFloat(computed.strokeWidth) || 2 : defaults.strokeWidth),
      strokePattern: a?.strokePattern ?? (node ? nativePattern(computed) : defaults.strokePattern ?? "solid"),
      fillStyle: addedFill,
    }, {
      line: editing && !text && type !== "highlight",
      arrows: type === "arrow" && !node,
      ends: ["arrow", "pointer"].includes(type) && !node,
      fills: ["box", "ellipse"].includes(type) && !node,
    });
    opacity.closest("label").hidden = !node;
    for (const c of colors) c.refresh();
    refreshObjects();
  }
  function sizePicture() {
    picture.style.width =
      zoom.value === "fit" ? "100%" : `${source.width * +zoom.value}px`;
    picture.style.maxWidth =
      zoom.value === "fit" ? `${source.width}px` : "none";
  }
  function draw() {
    shadow.innerHTML = renderGraphic(source, state, {
      parsed,
      interactive: true,
    });
    const interactionStyle = el("style");
    interactionStyle.textContent = "[data-object], [data-editor-hit] { cursor: var(--graphic-object-cursor, move) !important; }";
    shadow.prepend(interactionStyle);
    svg = shadow.querySelector("svg");
    svg.style.cssText =
      "display:block;width:100%;height:auto;overflow:hidden;background:transparent;touch-action:none;user-select:none;-webkit-user-select:none";
    // Original styles are isolated from the application by the shadow root. New
    // annotations receive explicit inline styles so broad imported rules cannot restyle them.
    for (const g of svg.querySelectorAll("[data-annotations] > g"))
      for (const shape of g.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")) {
        styleAnnotation(shape);
      }
    sizePicture();
    addSelectionHitAreas(svg);
    sync();
    drawSelection();
    labelEditor.refresh();
  }
  function drawSelection() {
    selectionBox?.remove();
    selectionBox = null;
    const b = objectBox();
    if (!b) return;
    const scale = Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b),
      handle = 9 / Math.max(scale, 0.01),
      g = svgEl("g", { "data-editor-overlay": "true" });
    const a = annotation();
    if (a && isConnector(a.type)) {
      appendConnectorControls(g, a, scale);
      appendSnapGuide(g, snapGuide, scale);
      svg.append(g); selectionBox = g; return;
    }
    const glow = svgEl(a?.type === "ellipse" ? "ellipse" : "rect", {
      x: b.x,
      y: b.y,
      width: Math.max(b.w, 1),
      height: Math.max(b.h, 1),
      ...(a?.type === "ellipse" ? { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2 } : { rx: Math.min(a?.cornerRadius ?? 0, b.w / 2, b.h / 2) }),
    });
    glow.style.cssText =
      "fill:none!important;stroke:#2196f3!important;stroke-width:4!important;opacity:.65!important;filter:blur(2px)!important;vector-effect:non-scaling-stroke!important;pointer-events:none!important";
    g.append(glow);
    if (b.w > 0 && b.h > 0) {
      // Keep the visible handle compact, with a larger screen-sized drag target.
      const hitSize = imageEditorHandleSize() / Math.max(scale, 0.01);
      const hit = svgEl("rect", {
        x: b.x + b.w - hitSize / 2,
        y: b.y + b.h - hitSize / 2,
        width: hitSize,
        height: hitSize,
        "data-resize": "true",
        "aria-hidden": "true",
      });
      hit.style.cssText = "fill:transparent!important;stroke:none!important;pointer-events:all!important;cursor:nwse-resize!important";
      g.append(hit);
      const corner = svgEl("rect", {
        x: b.x + b.w - handle / 2,
        y: b.y + b.h - handle / 2,
        width: handle,
        height: handle,
        "data-resize": "true",
      });
      corner.style.cssText =
        "fill:white!important;stroke:#007bce!important;stroke-width:2!important;vector-effect:non-scaling-stroke!important;cursor:nwse-resize!important;pointer-events:all!important";
      g.append(corner);
    }
    appendSnapGuide(g, snapGuide, scale);
    svg.append(g);
    selectionBox = g;
  }
  function point(event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
  }
  function newAnnotation(p) {
    return {
      id: `a-${crypto.randomUUID()}`,
      type: mode,
      x: p.x,
      y: p.y,
      w: 0,
      h: 0,
      ...defaults,
      ...(mode === "draw" ? { points: [[p.x, p.y]] } : {}),
    };
  }
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !svg || drag) return;
    labelEditor.close();
    const path = event.composedPath(),
      target = path.find(
        (e) =>
          e instanceof Element &&
          (e.hasAttribute("data-object") || e.hasAttribute("data-editor-hit")),
      ),
      connectorHandle = path.find(e => e instanceof Element && e.hasAttribute("data-connector-handle"))?.getAttribute("data-connector-handle"),
      resize = path.some(
        (e) => e instanceof Element && e.hasAttribute("data-resize"),
      );
    const p = point(event);
    if (mode === "select") {
      if (!resize && !connectorHandle)
        select(
          target?.getAttribute("data-editor-hit") ??
            target?.getAttribute("data-object") ??
            "",
        );
      if (!selected) return;
      drag = {
        pointerId: event.pointerId,
        kind: connectorHandle ? "connector" : resize ? "resize" : "move",
        handle: connectorHandle,
        start: p,
        before: structuredClone(state),
        box: objectBox(),
        matrix: new DOMMatrix(),
      };
      const element = selectedElement();
      if (drag.kind === "move") drag.targets = alignmentTargets(svg.querySelectorAll('[data-object]'), element, objectBox);
      if (!annotation()) {
        drag.parent = domMatrix(svg.getScreenCTM())
          .inverse()
          .multiply(domMatrix(element.parentNode.getScreenCTM()));
        // SVGMatrix can be a live view of the element's transform in WebKit.
        // Freeze the starting transform: preview updates must not feed back
        // into the next move/resize calculation and compound its displacement.
        drag.own = domMatrix(
          element.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix(),
        );
      }
    } else {
      if (state.annotations.length >= GRAPHIC_LIMITS.annotations) {
        message.textContent = "Images support up to 200 annotations.";
        return;
      }
      const a = newAnnotation(p);
      drag = {
        pointerId: event.pointerId,
        kind: "new",
        start: p,
        before: structuredClone(state),
        id: a.id,
      };
      state.annotations.push(a);
      selected = a.id;
      draw();
      if (mode === "label") {
        finish(event);
        labelEditor.start(selected, true);
        event.preventDefault();
        return;
      }
    }
    viewport.setPointerCapture(event.pointerId);
    viewport.focus({ preventScroll: true });
    event.preventDefault();
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const p = point(event);
    const options = { scale: Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b), force: event.shiftKey, disabled: event.altKey, previous: snapGuide };
    if (drag.kind === 'resize') {
      drag.moved ||= Math.hypot(p.x-drag.start.x, p.y-drag.start.y) * options.scale >= 3;
      if (!drag.moved) return;
    }
    snapGuide = undefined;
    if (drag.kind === "new") {
      const a = state.annotations.find((a) => a.id === drag.id);
      if (a.type === "draw") {
        const last = a.points.at(-1);
        if (Math.hypot(p.x - last[0], p.y - last[1]) > 0.7) {
          if (
            a.points.length >= GRAPHIC_LIMITS.strokePoints ||
            state.annotations.reduce(
              (n, a) => n + (a.points?.length ?? 0),
              0,
            ) >= GRAPHIC_LIMITS.points
          ) {
            message.textContent =
              "Drawing point limit reached. Finish this stroke.";
            return;
          }
          a.points.push([p.x, p.y]);
        }
      } else {
        const snap = isConnector(a.type) ? snapEndpoint(drag.start, p, options)
          : ['box', 'ellipse'].includes(a.type) ? snapSquare(drag.start, p, { ...options, type: a.type }) : { point: p };
        a.w = snap.point.x - drag.start.x;
        a.h = snap.point.y - drag.start.y;
        snapGuide = snap.guide;
      }
    } else if (drag.kind === "connector") {
      const original = drag.before.annotations.find(a => a.id === selected);
      const result = moveConnectorHandle(original, drag.handle, p, options);
      Object.assign(annotation(), result.annotation);
      snapGuide = result.guide;
    } else {
      state = structuredClone(drag.before);
      const b = drag.box;
      if (!b) return;
      let m;
      if (drag.kind === "move") {
        const delta = { x: p.x - drag.start.x, y: p.y - drag.start.y };
        // A click with slight hand movement should only select the object.
        drag.moved ||= Math.hypot(delta.x, delta.y) * options.scale >= 3;
        if (!drag.moved) return;
        const result = snapTranslation(b, delta, drag.targets, options);
        snapGuide = result.guide;
        m = new DOMMatrix().translate(result.delta.x, result.delta.y);
      } else {
        const type = annotation()?.type ?? sourceNode()?.tag;
        const corner = { x: b.x + b.w + p.x - drag.start.x, y: b.y + b.h + p.y - drag.start.y };
        const snap = type === 'label' ? snapProportions(b, corner, { ...options, force:true, disabled:false })
          : type === 'draw' ? snapProportions(b, corner, options)
          : ['box', 'ellipse', 'rect', 'circle'].includes(type)
            ? snapSquare({ x: b.x, y: b.y }, corner, { ...options, type }) : { point: corner };
        snapGuide = snap.guide;
        const sx = snap.scaleFactor ?? Math.max(0.05, (snap.point.x - b.x) / Math.max(b.w, 0.1)),
          sy = snap.scaleFactor ?? Math.max(0.05, (snap.point.y - b.y) / Math.max(b.h, 0.1));
        m = new DOMMatrix()
          .translate(b.x, b.y)
          .scale(sx, event.shiftKey && !snap.guide && !event.altKey ? sx : sy)
          .translate(-b.x, -b.y);
      }
      if (annotation()) transformSelection(state, m);
      else
        (state.edits[selected] ??= {}).transform = matrixValues(
          drag.parent
            .inverse()
            .multiply(m)
            .multiply(drag.parent)
            .multiply(drag.own),
        );
    }
    updateDragPreview();
  });
  function updateDragPreview() {
    if (drag.kind === "new" || annotation()) {
      const layer = svg.querySelector("[data-annotations]");
      const temporary = new DOMParser().parseFromString(
        `<svg xmlns="${NS}">${state.annotations.map((a) => annotationSvg(a, true)).join("")}</svg>`,
        "image/svg+xml",
      );
      layer.replaceChildren(
        ...[...temporary.documentElement.children].map((e) =>
          document.importNode(e, true),
        ),
      );
      for (const g of layer.children)
        for (const shape of g.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")) styleAnnotation(shape);
      addSelectionHitAreas(layer);
    } else {
      const element = selectedElement(),
        transform = state.edits[selected]?.transform;
      if (element && transform)
        element.setAttribute("transform", `matrix(${transform.join(" ")})`);
    }
    const a = annotation();
    if (a && ['box', 'ellipse'].includes(a.type) && ['new', 'resize'].includes(drag.kind)) {
      snapGuide = equalDimensionGuide({ x:a.x, y:a.y }, { x:a.x + a.w, y:a.y + a.h }, a.type);
    }
    drawSelection();
  }
  function finish(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const before = drag.before,
      creating = drag.kind === "new";
    const tappedLabel = ['move','resize'].includes(drag.kind) && !drag.moved && annotation()?.type === 'label' ? selected : null;
    if (event.type === "pointercancel" || event.type === "lostpointercapture") state = before;
    else
      try {
        validateGraphicState(state, source, parsed);
      } catch (error) {
        state = before;
        message.textContent = error.message;
      }
    drag = null;
    snapGuide = undefined;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
    if (creating) {
      mode = "select";
      for (const [k, b] of Object.entries(modeButtons))
        b.setAttribute("aria-pressed", String(k === "select"));
      viewport.style.cursor = "default";
      viewport.style.setProperty("--graphic-object-cursor", "move");
    }
    draw();
    session?.changed(creating ? "Add annotation" : "Move / resize");
    labelEditor.pointerSelection(event, tappedLabel);
  }
  viewport.addEventListener("pointerup", finish);
  viewport.addEventListener("pointercancel", finish);
  viewport.addEventListener("lostpointercapture", finish);
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      selected = "";
      setMode("select");
      return;
    }
    if (!selected) return;
    if (labelEditor.selectionKey(event, selected)) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const d = event.shiftKey ? 10 : 1;
      change("Nudge object", (s) =>
        transformSelection(
          s,
          new DOMMatrix().translate(
            event.key === "ArrowLeft" ? -d : event.key === "ArrowRight" ? d : 0,
            event.key === "ArrowUp" ? -d : event.key === "ArrowDown" ? d : 0,
          ),
        ),
      );
    }
  });
  function exportSvg() {
    let output = renderGraphic(source, state, { parsed });
    const families = [
      ...state.annotations.filter((a) => a.type === "label").map((a) => a.font),
      ...Object.values(state.edits)
        .map((e) => fontKey(e.style?.["font-family"]))
        .filter(Boolean),
    ];
    output = embedImageFonts(output, {
      style: { font: "sans" },
      items: families.map((font) => ({ font })),
      annotations: [],
    });
    // Serialize the same annotation inline rules used by the live preview.
    const doc = new DOMParser().parseFromString(output, "image/svg+xml");
    for (const g of doc.querySelectorAll("[data-annotations] > g"))
      for (const shape of g.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")) {
        styleAnnotation(shape);
      }
    return new XMLSerializer().serializeToString(doc.documentElement);
  }
  button(
    "Download PNG",
    async () => {
      const blob = new Blob([exportSvg()], { type: "image/svg+xml" }),
        url = URL.createObjectURL(blob);
      try {
        const image = await loadRaster(url),
          canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = source.height;
        canvas
          .getContext("2d")
          .drawImage(image, 0, 0, source.width, source.height);
        const png = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!png) throw new Error("Could not export PNG.");
        downloadBlob(png, `${tool}.png`);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    exports,
    "download",
  ).querySelector("span").textContent = "PNG";
  if (source.kind === "svg")
    button(
      "Download SVG",
      () => downloadText(exportSvg(), "edited-image.svg", "image/svg+xml"),
      exports,
      "download",
    ).querySelector("span").textContent = "SVG";
  activateTab("Selection");
  setMode("select");
  draw();
  session = createEditorSession({
    host: root,
    toolbar: history,
    tool,
    source,
    read: () => state,
    apply: (value) => {
      labelEditor.close();
      validateGraphicState(value, source, parsed);
      state = structuredClone(value);
      state.annotations.forEach(a => normalizeAnnotationFill(a, { highlightOpacity: .3 }));
      selected = "";
      draw();
    },
    persist: !preview,
    initial,
  });
  const resizeObserver = new ResizeObserver(() => { drawSelection(); labelEditor.refresh(); });
  resizeObserver.observe(viewport);
  container._sms3VisualCleanup = () => {
    disposeToolbarHelp();
    navigation.dispose();
    colorSampler.dispose();
    labelEditor.dispose();
    session.dispose();
    resizeObserver.disconnect();
    colors.forEach((c) => c.dispose());
  };
}
