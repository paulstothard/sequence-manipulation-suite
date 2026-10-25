import { connectorSvg, annotationShapeSvg, validateAnnotationAppearance, strokeDash } from "./annotation-geometry.js";
import { isImageColor } from "./image-colors.js";
import {
  SaxesParser,
  parse as parseCss,
  generate as generateCss,
  walk as walkCss,
} from "../vendor/svg-parser/runtime.js";
import { IMAGE_FONTS } from "./image-fonts.js";

export const GRAPHIC_LIMITS = Object.freeze({
  bytes: 8 * 1024 * 1024,
  dimension: 8192,
  pixels: 16000000,
  elements: 10000,
  depth: 40,
  geometry: 200000,
  annotations: 200,
  points: 50000,
  strokePoints: 5000,
});
const NS = "http://www.w3.org/2000/svg";
const fail = (message) => {
  throw new Error(message);
};
export const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const tags = new Set(
  "svg g defs title desc metadata style rect circle ellipse line polyline polygon path text tspan textPath clipPath mask linearGradient radialGradient stop pattern marker image use symbol".split(
    " ",
  ),
);
const attrs = new Set(
  "id class x y x1 y1 x2 y2 dx dy rotate width height rx ry r cx cy d points transform viewBox preserveAspectRatio fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color font-family font-size font-weight font-style font-stretch font-variant font-variant-ligatures font-kerning letter-spacing word-spacing text-anchor textLength lengthAdjust dominant-baseline alignment-baseline baseline-shift text-decoration clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity patternUnits patternContentUnits patternTransform marker-start marker-mid marker-end markerWidth markerHeight markerUnits refX refY orient overflow display visibility vector-effect shape-rendering text-rendering image-rendering startOffset method spacing href style version".split(
    " ",
  ),
);
const props = new Set(
  "fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color font font-family font-size font-weight font-style font-stretch font-variant font-variant-ligatures font-kerning font-variation-settings letter-spacing word-spacing text-anchor dominant-baseline alignment-baseline baseline-shift text-decoration clip-path clip-rule mask stop-color stop-opacity marker-start marker-mid marker-end display visibility vector-effect shape-rendering text-rendering image-rendering white-space paint-order all".split(
    " ",
  ),
);
export const editableTags = new Set(
  "g rect circle ellipse line polyline polygon path text image use".split(" "),
);
const finite = (value, min, max, label) => {
  if (!Number.isFinite(value) || value < min || value > max)
    fail(`Invalid ${label}.`);
  return value;
};
export function checkDimensions(width, height) {
  finite(
    width,
    1,
    GRAPHIC_LIMITS.dimension,
    "image width (maximum 8,192 pixels)",
  );
  finite(
    height,
    1,
    GRAPHIC_LIMITS.dimension,
    "image height (maximum 8,192 pixels)",
  );
  if (width * height > GRAPHIC_LIMITS.pixels)
    fail("The image exceeds 16 million pixels. Use a smaller image.");
}
function rasterInfo(dataUrl) {
  if (
    typeof dataUrl !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)
  )
    fail("Choose a PNG image.");
  const encoded = dataUrl.slice(22);
  if (encoded.length > Math.ceil(GRAPHIC_LIMITS.bytes / 3) * 4)
    fail("PNG files are limited to 8 MiB.");
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    fail("Invalid PNG data.");
  }
  const b = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (
    b.length < 33 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) ||
    String.fromCharCode(...b.slice(12, 16)) !== "IHDR"
  )
    fail("The file is not a valid PNG.");
  const view = new DataView(b.buffer);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  checkDimensions(width, height);
  for (let i = 8; i + 12 <= b.length; ) {
    const length = view.getUint32(i);
    if (i + length + 12 > b.length) fail("The PNG is incomplete.");
    const type = String.fromCharCode(...b.slice(i + 4, i + 8));
    if (type === "acTL")
      fail("Animated PNGs are not supported. Export a still PNG first.");
    if (type === "IEND") return { width, height };
    i += length + 12;
  }
  fail("The PNG is incomplete.");
}
function safeUrl(value, { font = false, image = false } = {}) {
  if (/^#[A-Za-z_][\w:.-]*$/.test(value)) return;
  if (image && value.startsWith("data:image/png;base64,")) {
    rasterInfo(value);
    return;
  }
  if (
    font &&
    /^data:(?:font\/woff2?|application\/(?:font-woff|x-font-woff));base64,[A-Za-z0-9+/]+={0,2}$/.test(
      value,
    ) &&
    value.length <= 2000000
  ) {
    const data = value.slice(value.indexOf(",") + 1);
    if (/^(?:d09GMg|d09GRg)/.test(data)) return;
  }
  fail(
    "This SVG uses an external or unsupported resource. Embed images as PNG and fonts as WOFF/WOFF2, and remove external links.",
  );
}
function cleanCss(value, stylesheet, warnings) {
  let ast;
  try {
    ast = parseCss(value, {
      context: stylesheet ? "stylesheet" : "declarationList",
      parseValue: true,
      onParseError: () => fail("Unsupported SVG stylesheet syntax."),
    });
  } catch (e) {
    fail(`Could not read the SVG styles: ${e.message}`);
  }
  walkCss(ast, function (node, item, list) {
    if (node.type === "Raw") fail("Unsupported SVG stylesheet syntax.");
    if (node.type === "Atrule" && node.name.toLowerCase() !== "font-face")
      fail("Only embedded @font-face rules are supported in SVG styles.");
    if (
      [
        "PseudoClassSelector",
        "PseudoElementSelector",
        "NestingSelector",
      ].includes(node.type)
    )
      fail("SVG styles with interactive or page selectors are not supported.");
    if (node.type === "Declaration") {
      const property = node.property.toLowerCase();
      if (property === "all" && generateCss(node.value) !== "initial")
        fail("Unsupported SVG style reset.");
      const font = this.atrule?.name?.toLowerCase() === "font-face";
      if (
        !(
          props.has(property) ||
          (font && ["src", "unicode-range", "font-display"].includes(property))
        )
      ) {
        warnings.add(`Unsupported SVG style removed: ${property}.`);
        list.remove(item);
        return walkCss.skip;
      }
      walkCss(node.value, (n) => {
        if (n.type === "Url")
          safeUrl(n.value, { font: font && property === "src" });
        if (
          n.type === "Function" &&
          ["var", "env", "expression", "local", "attr"].includes(
            n.name.toLowerCase(),
          )
        )
          fail("This SVG uses unsupported dynamic or local-only styles.");
        if (["Number", "Dimension"].includes(n.type))
          finite(+n.value, -1000000, 1000000, "SVG style value");
      });
    }
  });
  return generateCss(ast);
}
const lengthPx = (value) => {
  const m = String(value ?? "").match(
    /^\s*([+\d.eE-]+)(px|pt|pc|in|cm|mm)?\s*$/,
  );
  return m
    ? Number(m[1]) *
        { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[
          m[2] ?? "px"
        ]
    : NaN;
};
export function parseSvg(input) {
  if (typeof input !== "string" || !input.trim())
    fail("Upload an SVG or paste its source.");
  if (new TextEncoder().encode(input).length > GRAPHIC_LIMITS.bytes)
    fail("SVG files are limited to 8 MiB.");
  const stack = [],
    warnings = new Set(),
    nodes = [];
  let root,
    geometry = 0,
    metadataDepth = 0,
    metadataNode = null,
    elementCount = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("error", (e) => fail(`Invalid SVG XML: ${e.message}`));
  parser.on("doctype", (value) => {
    if (value.includes("[")) fail("SVG entity declarations are not supported.");
    warnings.add("The SVG document type declaration was removed.");
  });
  parser.on("processinginstruction", () =>
    fail("SVG processing instructions are not supported."),
  );
  parser.on("opentag", (tag) => {
    if (
      stack.length >= GRAPHIC_LIMITS.depth ||
      ++elementCount > GRAPHIC_LIMITS.elements
    )
      fail("SVG exceeds 10,000 elements or 40 nesting levels.");
    if (metadataDepth) {
      metadataDepth++;
      stack.push(null);
      warnings.add("Structured SVG metadata was retained as plain text.");
      return;
    }
    if (tag.local === "metadata" && root) {
      metadataDepth = 1;
      metadataNode = {
        id: `o${nodes.length}`,
        tag: "metadata",
        attrs: {},
        children: [],
      };
      nodes.push(metadataNode);
      stack.at(-1)?.children.push(metadataNode);
      stack.push(metadataNode);
      return;
    }
    if (!tags.has(tag.local) || (tag.uri && tag.uri !== NS))
      fail(
        `Unsupported SVG element: ${tag.name}. Export a plain static SVG first.`,
      );
    if (
      stack.length >= GRAPHIC_LIMITS.depth ||
      nodes.length >= GRAPHIC_LIMITS.elements
    )
      fail("SVG exceeds 10,000 elements or 40 nesting levels.");
    if (!root && tag.local !== "svg")
      fail("The document must have an SVG root.");
    const node = {
      id: `o${nodes.length}`,
      tag: tag.local,
      attrs: {},
      children: [],
    };
    nodes.push(node);
    for (const a of Object.values(tag.attributes)) {
      if (a.name === "xmlns" || a.prefix === "xmlns") continue;
      if (/^on/i.test(a.local)) fail("SVG event handlers are not supported.");
      if (a.prefix && a.prefix !== "xml" && a.prefix !== "xlink") {
        warnings.add("Editor-specific SVG attributes were omitted.");
        continue;
      }
      if (a.prefix === "xml") {
        if (a.local === "space") node.attrs["xml:space"] = a.value;
        continue;
      }
      if (a.prefix === "xlink" && a.local !== "href") continue;
      if (!attrs.has(a.local)) {
        if (!/^data-|^aria-|^role$/.test(a.local))
          warnings.add(`Unsupported SVG attribute omitted: ${a.local}.`);
        continue;
      }
      let value = a.value;
      if (a.local === "style") value = cleanCss(value, false, warnings);
      else if (a.local === "href")
        safeUrl(value, { image: node.tag === "image" });
      else if (props.has(a.local)) {
        cleanCss(`${a.local}:${value}`, false, warnings);
      } else if (/url\s*\(/i.test(value)) {
        const parsed = parseCss(value, { context: "value" });
        walkCss(parsed, (n) => {
          if (n.type === "Url") safeUrl(n.value);
          if (n.type === "Raw" || (n.type === "Function" && n.name === "var"))
            fail("Invalid SVG reference.");
        });
        value = generateCss(parsed);
      }
      if (["d", "points"].includes(a.local)) {
        const values = value.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
        values.forEach((v) => finite(+v, -1000000, 1000000, "SVG geometry"));
        geometry += values.length;
        if (geometry > GRAPHIC_LIMITS.geometry)
          fail("SVG exceeds 200,000 geometry values.");
      }
      if (
        "x y x1 y1 x2 y2 dx dy rotate width height rx ry r cx cy transform viewBox stroke-width stroke-miterlimit stroke-dasharray stroke-dashoffset opacity fill-opacity stroke-opacity font-size letter-spacing word-spacing textLength startOffset markerWidth markerHeight refX refY"
          .split(" ")
          .includes(a.local)
      ) {
        for (const n of value.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [])
          finite(+n, -1000000, 1000000, "SVG coordinate");
      }
      node.attrs[a.local] = value;
    }
    if (!root) root = node;
    else stack.at(-1)?.children.push(node);
    stack.push(node);
  });
  parser.on("closetag", () => {
    stack.pop();
    if (metadataDepth && --metadataDepth === 0) metadataNode = null;
  });
  const text = (value) => {
    const node = metadataNode ?? stack.at(-1);
    if (node) node.children.push(value);
  };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.write(input).close();
  if (!root) fail("No SVG found.");
  for (const node of nodes)
    if (node.tag === "style")
      node.children = [cleanCss(node.children.join(""), true, warnings)];
  const ids = new Map();
  for (const n of nodes)
    if (n.attrs.id) {
      if (ids.has(n.attrs.id)) fail("Duplicate SVG IDs are not supported.");
      ids.set(n.attrs.id, n);
    }
  // Bound use expansion, including indirect cycles through groups.
  let visits = 0;
  const visit = (node, ancestors = new Set()) => {
    if (++visits > 30000)
      fail("SVG instance expansion exceeds 30,000 elements.");
    if (ancestors.has(node)) fail("Circular SVG references are not supported.");
    const next = new Set(ancestors);
    next.add(node);
    for (const c of node.children) if (typeof c !== "string") visit(c, next);
    if (node.tag === "use") {
      const ref = ids.get(node.attrs.href?.slice(1));
      if (!ref) fail("SVG contains a missing use reference.");
      visit(ref, next);
    }
  };
  visit(root);
  let vb = (root.attrs.viewBox || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    vb.length !== 4 ||
    vb.some((v) => !Number.isFinite(v)) ||
    vb[2] <= 0 ||
    vb[3] <= 0
  )
    vb = null;
  if (root.attrs.viewBox && !vb) fail("Invalid SVG viewBox.");
  const rootLength = (value, fallback) =>
    value === undefined || /^\s*\d+(?:\.\d+)?%\s*$/.test(value)
      ? fallback
      : lengthPx(value);
  const width = rootLength(root.attrs.width, vb?.[2]),
    height = rootLength(root.attrs.height, vb?.[3]);
  checkDimensions(width, height);
  vb ??= [0, 0, width, height];
  if (vb.some((v) => Math.abs(v) > 1000000))
    fail("SVG viewBox is outside the supported range.");
  root.attrs = {
    ...root.attrs,
    xmlns: NS,
    width: String(width),
    height: String(height),
    viewBox: vb.join(" "),
  };
  return {
    tree: root,
    nodes,
    width,
    height,
    viewBox: vb,
    warnings: [...warnings],
  };
}
export function serializeTree(node, { edits = {}, interactive = false } = {}) {
  if (typeof node === "string") return xml(node);
  const edit = edits[node.id] ?? {};
  if (edit.deleted) return "";
  const a = { ...node.attrs };
  if (edit.transform) a.transform = `matrix(${edit.transform.join(" ")})`;
  if (edit.style)
    a.style = `${a.style ?? ""};${Object.entries(edit.style)
      .map(([k, v]) => `${k}:${v}!important`)
      .join(";")}`;
  if (interactive && editableTags.has(node.tag)) a["data-object"] = node.id;
  const body =
    edit.text !== undefined
      ? xml(edit.text)
      : node.children
          .map((c) => serializeTree(c, { edits, interactive }))
          .join("");
  return `<${node.tag}${Object.entries(a)
    .map(([k, v]) => ` ${k}="${xml(v)}"`)
    .join("")}>${body}</${node.tag}>`;
}
export function createGraphicSource(input, kind) {
  if (kind === "svg") {
    const parsed = parseSvg(input);
    return {
      kind,
      input: serializeTree(parsed.tree),
      width: parsed.width,
      height: parsed.height,
      warnings: parsed.warnings,
    };
  }
  let value;
  try {
    value = JSON.parse(input);
  } catch {
    fail("Upload a PNG image or load the example.");
  }
  const info = rasterInfo(value.dataUrl);
  return {
    kind: "png",
    input: JSON.stringify({ dataUrl: value.dataUrl }),
    ...info,
    warnings: [],
  };
}
export function initialGraphicState() {
  return { version: 1, edits: {}, annotations: [] };
}
const hex = isImageColor;
export function validateGraphicState(state, source, parsed) {
  if (
    !state ||
    state.version !== 1 ||
    !state.edits ||
    Array.isArray(state.edits) ||
    typeof state.edits !== "object" ||
    !Array.isArray(state.annotations)
  )
    fail("Invalid image editor document.");
  if (
    Object.keys(state.edits).length > GRAPHIC_LIMITS.elements ||
    state.annotations.length > GRAPHIC_LIMITS.annotations
  )
    fail("The image exceeds its object limit.");
  const nodes = parsed?.nodes;
  const nodeMap = nodes ? new Map(nodes.map((n) => [n.id, n])) : null;
  for (const [id, edit] of Object.entries(state.edits)) {
    if (
      !/^o\d+$/.test(id) ||
      !edit ||
      typeof edit !== "object" ||
      Array.isArray(edit) ||
      source.kind !== "svg"
    )
      fail("Invalid SVG edit.");
    if (nodes && !editableTags.has(nodeMap.get(id)?.tag))
      fail("An edit refers to a missing SVG object.");
    if (edit.deleted !== undefined && typeof edit.deleted !== "boolean")
      fail("Invalid deleted object.");
    if (
      edit.text !== undefined &&
      (typeof edit.text !== "string" ||
        edit.text.length > 2000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(edit.text) ||
        (nodes && nodeMap.get(id)?.tag !== "text"))
    )
      fail("Invalid SVG label edit.");
    if (edit.transform) {
      if (!Array.isArray(edit.transform) || edit.transform.length !== 6)
        fail("Invalid object transform.");
      edit.transform.forEach((v) =>
        finite(v, -1000000, 1000000, "object transform"),
      );
    }
    if (edit.style) {
      if (typeof edit.style !== "object" || Array.isArray(edit.style))
        fail("Invalid object style.");
      for (const [k, v] of Object.entries(edit.style)) {
        if (["fill", "stroke"].includes(k)) {
          if (v !== "none" && !hex(v)) fail("Invalid object color.");
        } else if (k === "font-family") {
          if (!Object.values(IMAGE_FONTS).some((f) => f.family === v))
            fail("Invalid label font.");
        } else if (k === "font-size") finite(+v, 1, 300, "label size");
        else if (k === "stroke-width") finite(+v, 0, 100, "line width");
        else if (k === "stroke-dasharray") {
          if (v !== "none" && (typeof v !== "string" || !/^\d+(?:\.\d+)? \d+(?:\.\d+)?$/.test(v) || v.split(" ").some(n => +n > 1000))) fail("Invalid stroke pattern.");
        } else if (k === "stroke-linecap") {
          if (!["round", "butt", "square"].includes(v)) fail("Invalid line cap.");
        }
        else if (["opacity", "fill-opacity", "stroke-opacity"].includes(k)) finite(+v, 0, 1, "opacity");
        else fail("Unsupported object style edit.");
      }
    }
  }
  let points = 0;
  const ids = new Set();
  for (const a of state.annotations) {
    if (
      !a ||
      !/^a-[a-z0-9-]{1,60}$/i.test(a.id) ||
      ids.has(a.id) ||
      ![
        "box",
        "ellipse",
        "highlight",
        "arrow",
        "pointer",
        "line",
        "label",
        "draw",
      ].includes(a.type)
    )
      fail("Invalid annotation.");
    ids.add(a.id);
    validateAnnotationAppearance(a);
    for (const k of ["flipX", "flipY"])
      if (a[k] !== undefined && typeof a[k] !== "boolean") fail("Invalid connector direction.");
    for (const k of ["x", "y", "w", "h"])
      finite(a[k], -100000, 100000, `annotation ${k}`);
    if (!hex(a.color) || !hex(a.fill) || !Object.hasOwn(IMAGE_FONTS, a.font))
      fail("Invalid annotation style.");
    finite(a.fontSize, 1, 300, "label size");
    finite(a.strokeWidth, 0.1, 100, "line width");
    finite(a.opacity, 0, 1, "opacity");
    if (a.cornerRadius !== undefined) finite(a.cornerRadius, 0, 100, "corner radius");
    for (const k of ["bendX", "bendY"])
      if (a[k] !== undefined) finite(a[k], -100000, 100000, "connector bend");
    if (
      typeof a.text !== "string" ||
      a.text.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(a.text)
    )
      fail("Invalid label text.");
    if (typeof a.filled !== "boolean") fail("Invalid shape fill.");
    if (a.type === "draw") {
      if (
        !Array.isArray(a.points) ||
        a.points.length > GRAPHIC_LIMITS.strokePoints
      )
        fail("A drawing supports up to 5,000 points.");
      points += a.points.length;
      for (const p of a.points) {
        if (!Array.isArray(p) || p.length !== 2) fail("Invalid drawing point.");
        p.forEach((v) => finite(v, -100000, 100000, "drawing point"));
      }
    }
  }
  if (points > GRAPHIC_LIMITS.points)
    fail("Drawings support up to 50,000 points per document.");
  return state;
}
export function validateGraphicDocument(doc) {
  const kind = doc.tool === "svg-editor" ? "svg" : "png";
  if (doc.source?.kind !== kind || typeof doc.source.input !== "string")
    fail("Invalid image source.");
  const source = createGraphicSource(doc.source.input, kind);
  if (source.width !== doc.source.width || source.height !== doc.source.height)
    fail("Image dimensions do not match the source.");
  validateGraphicState(
    doc.state,
    source,
    kind === "svg" ? parseSvg(source.input) : null,
  );
  return doc;
}
export function annotationSvg(a, interactive = false) {
  const common = `stroke="${a.color}" stroke-width="${a.strokeWidth}" fill="${a.filled ? a.fill : "none"}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${strokeDash(a.strokePattern, a.strokeWidth)}" opacity="${a.opacity}"`;
  const x = Math.min(a.x, a.x + a.w),
    y = Math.min(a.y, a.y + a.h),
    w = Math.abs(a.w),
    h = Math.abs(a.h);
  let shape;
  if (a.type === "label")
    shape = `<text x="${a.x}" y="${a.y + a.fontSize}" font-family="${xml(IMAGE_FONTS[a.font].family)}" font-size="${a.fontSize}" fill="${a.color}" opacity="${a.opacity}" xml:space="preserve">${xml(a.text)}</text>`;
  else if (a.type === "draw")
    shape = `<polyline points="${a.points.map((p) => p.join(",")).join(" ")}" ${common}/>`;
  else if (a.type === "box" || a.type === "ellipse") shape = annotationShapeSvg(a);
  else if (a.type === "highlight")
    shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${a.color}" opacity="${a.opacity * (a.fillOpacity ?? .3)}" stroke="none"/>`;
  else shape = connectorSvg(a);
  return `<g${interactive ? ` data-object="${a.id}"` : ""}>${shape}</g>`;
}
export function renderGraphic(
  source,
  state,
  { parsed, interactive = false } = {},
) {
  validateGraphicState(state, source, parsed);
  let svg;
  if (source.kind === "svg")
    svg = serializeTree((parsed ?? parseSvg(source.input)).tree, {
      edits: state.edits,
      interactive,
    });
  else
    svg = `<svg xmlns="${NS}" width="${source.width}" height="${source.height}" viewBox="0 0 ${source.width} ${source.height}"><image href="${xml(JSON.parse(source.input).dataUrl)}" width="${source.width}" height="${source.height}"/></svg>`;
  // Render in the original viewBox coordinate system, including nonzero origins.
  return svg.replace(
    /<\/svg>\s*$/,
    `<g data-annotations="true">${state.annotations.map((a) => annotationSvg(a, interactive)).join("")}</g></svg>`,
  );
}
