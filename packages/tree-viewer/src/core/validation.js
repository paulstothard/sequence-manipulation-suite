import { LIMITS } from "./limits.js";
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const need = (v, message) => {
  if (!v) throw new Error(`Invalid tree document: ${message}`);
};
export function validateJson(value) {
  const stack = [value],
    seen = new Set();
  while (stack.length) {
    const v = stack.pop();
    if (v === null || typeof v === "string" || typeof v === "boolean") continue;
    if (typeof v === "number") {
      need(Number.isFinite(v), "nonfinite JSON number");
      continue;
    }
    need(object(v) || Array.isArray(v), "non-JSON value");
    need(!seen.has(v), "cyclic or shared object");
    seen.add(v);
    need(
      Array.isArray(v) ||
        Object.getPrototypeOf(v) === Object.prototype ||
        Object.getPrototypeOf(v) === null,
      "non-plain object",
    );
    for (const [k, item] of Object.entries(v)) {
      need(
        !["__proto__", "prototype", "constructor"].includes(k),
        "reserved property name",
      );
      stack.push(item);
    }
  }
}
export function validateComments(comments) {
  need(Array.isArray(comments), "comments array");
  for (const c of comments) {
    need(
      object(c) &&
        typeof c.text === "string" &&
        c.text.length <= LIMITS.commentCharacters,
      "comment text",
    );
    need(
      ["before", "after-label", "after-length"].includes(c.position),
      "comment position",
    );
    let depth = 0;
    for (const char of c.text) {
      if (char === "[") depth++;
      if (char === "]") depth--;
      need(depth >= 0, "unbalanced comment");
    }
    need(depth === 0, "unbalanced comment");
  }
}
export function validateAnnotations(annotations) {
  need(object(annotations), "annotation object");
  for (const v of Object.values(annotations))
    need(
      v === null || ["string", "boolean", "number"].includes(typeof v),
      "only scalar interpreted annotations are supported",
    );
}
export function validateBranch(branch) {
  need(
    object(branch) &&
      (branch.length === null ||
        (Number.isFinite(branch.length) && typeof branch.length === "number")),
    "branch length",
  );
  need(
    branch.lexical === null ||
      (typeof branch.lexical === "string" &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(
          branch.lexical,
        ) &&
        Number(branch.lexical) === branch.length),
    "branch lexical value",
  );
  need(
    branch.length !== null || branch.lexical === null,
    "missing length lexical value",
  );
  validateComments(branch.comments);
  validateAnnotations(branch.annotations);
  need(object(branch.support), "branch support");
  for (const field of Object.values(branch.support))
    need(
      object(field) &&
        typeof field.value === "number" &&
        Number.isFinite(field.value) &&
        typeof field.units === "string" &&
        typeof field.source === "string",
      "support field",
    );
}
const color = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
export function validatePresentation(p, ids, children) {
  need(object(p), "presentation");
  for (const [key, values] of Object.entries({
    layout: ["rectangular", "circular", "unrooted"],
    metric: ["auto", "cladogram", "phylogram"],
    orientation: ["right", "left", "up", "down"],
    ladderize: ["none", "ascending", "descending"],
  }))
    need(values.includes(p[key]), `presentation ${key}`);
  for (const [key, min, max] of [
    ["fontSize", 6, 72],
    ["branchWidth", 0.1, 20],
    ["spacing", 8, 200],
    ["width", 200, 20000],
  ])
    need(
      typeof p[key] === "number" &&
        Number.isFinite(p[key]) &&
        p[key] >= min &&
        p[key] <= max,
      `presentation ${key}`,
    );
  for (const [key, min, max] of [["supportPrecision", 0, 6], ["supportSize", 6, 40], ["circularRotation", -360, 360], ["circularArc", 30, 360], ["legendSize", 6, 40]])
    if (p[key] !== undefined) need(Number.isFinite(p[key]) && p[key] >= min && p[key] <= max && (key !== "supportPrecision" || Number.isInteger(p[key])), `presentation ${key}`);
  need(p.supportMinimum == null || Number.isFinite(p.supportMinimum), "support minimum");
  need(p.supportField === undefined || typeof p.supportField === "string", "support field");
  need(p.supportPosition === undefined || ["node", "branch"].includes(p.supportPosition), "support position");
  for (const [key, values] of Object.entries({branchShape:["square","slanted","curved"],unrootedAlgorithm:["equal-angle","equal-daylight"],labelAlignment:["aligned","at-tip"],supportEncoding:["text","symbol","color"],supportSymbol:["circle","square","triangle"],legendPosition:["right","bottom"]}))
    need(p[key] === undefined || values.includes(p[key]), `presentation ${key}`);
  for (const key of ["showLabelBackground","showBranchLengths"]) need(p[key] === undefined || typeof p[key] === "boolean", `presentation ${key}`);
  for (const key of ["labelBackground","supportColor"]) need(p[key] === undefined || color(p[key]), `presentation ${key}`);
  need(p.branchLengthPrecision === undefined || Number.isInteger(p.branchLengthPrecision) && p.branchLengthPrecision >= 0 && p.branchLengthPrecision <= 8, "branch length precision");
  need(p.showScale === undefined || typeof p.showScale === "boolean", "scale flag");
  for (const key of ["branchColor", "labelColor", "background"])
    need(color(p[key]), `presentation ${key}`);
  need(
    typeof p.fontFamily === "string" &&
      p.fontFamily.length <= 200 &&
      !/[<>;{}]/.test(p.fontFamily),
    "font family",
  );
  need(
    typeof p.showSupport === "boolean" && typeof p.showLegend === "boolean",
    "presentation flags",
  );
  need(
    Array.isArray(p.collapsed) &&
      new Set(p.collapsed).size === p.collapsed.length &&
      p.collapsed.every((id) => ids.has(id)),
    "collapsed node IDs",
  );
  for (const key of ["order", "nodeStyles", "displayNames"])
    need(object(p[key]), `presentation ${key}`);
  for (const [id, order] of Object.entries(p.order)) {
    const expected = children.get(id)?.map((e) => e.child);
    need(
      expected &&
        Array.isArray(order) &&
        order.length === expected.length &&
        new Set(order).size === order.length &&
        order.every((v) => expected.includes(v)),
      "child order permutation",
    );
  }
  for (const [id, name] of Object.entries(p.displayNames))
    need(
      ids.has(id) &&
        typeof name === "string" &&
        name.length <= LIMITS.labelCharacters,
      "display name",
    );
  for (const [id, style] of Object.entries(p.nodeStyles)) {
    need(ids.has(id) && object(style), "node style");
    for (const [key, value] of Object.entries(style)) {
      need(
        ["branchColor", "labelColor", "highlight", "branchWidth"].includes(key),
        "node style field",
      );
      need(
        key === "branchWidth"
          ? typeof value === "number" && value >= 0.1 && value <= 20
          : color(value),
        "node style value",
      );
    }
  }
  need(
    Array.isArray(p.tracks) && p.tracks.length <= LIMITS.tracks,
    "track count",
  );
  if (p.cladeAnnotations !== undefined) {
    need(object(p.cladeAnnotations), "clade annotations");
    for (const [id, annotation] of Object.entries(p.cladeAnnotations)) {
      need(ids.has(id) && object(annotation) && typeof annotation.label === "string" && annotation.label.length <= 120 && color(annotation.color) && Number.isFinite(annotation.opacity) && annotation.opacity >= 0 && annotation.opacity <= 1, "clade annotation");
      need(annotation.bracket === undefined || typeof annotation.bracket === "boolean", "clade bracket");
      need(Array.isArray(annotation.tips) && annotation.tips.length > 0 && annotation.tips.every(tip=>ids.has(tip)), "clade tips");
    }
  }
  const trackIds = new Set();
  for (const t of p.tracks) {
    need(
      object(t) && typeof t.id === "string" && !trackIds.has(t.id),
      "track ID",
    );
    trackIds.add(t.id);
    need(
      typeof t.field === "string" &&
        ["categorical", "bar", "heatmap", "text", "symbol", "multi-bar"].includes(t.type) &&
        typeof t.visible === "boolean",
      "track definition",
    );
    if (t.type === "multi-bar") need(Array.isArray(t.fields) && t.fields.length >= 2 && t.fields.length <= 8 && new Set(t.fields).size === t.fields.length && t.fields.includes(t.field) && t.fields.every(field=>typeof field === "string"), "grouped bars need 2–8 unique numeric fields");
    need(t.symbolShape === undefined || ["circle", "square", "triangle"].includes(t.symbolShape), "symbol shape");
    need(t.color === undefined || color(t.color), "track color");
    need(
      t.colors === undefined ||
        (object(t.colors) && Object.values(t.colors).every(color)),
      "category colors",
    );
  }
}
export function validateMetadata(m, ids) {
  need(
    object(m) && Array.isArray(m.rows) && Array.isArray(m.columns),
    "metadata",
  );
  need(
    m.rows.length * m.columns.length <= LIMITS.metadataCells,
    "metadata cell limit",
  );
  need(m.columns.length <= LIMITS.metadataColumns, "metadata column limit");
  const fields = new Set(),
    rows = new Set();
  for (const c of m.columns) {
    need(
      object(c) &&
        typeof c.name === "string" &&
        c.name.length > 0 &&
        c.name.length <= 256 &&
        !fields.has(c.name) &&
        ["string", "number", "boolean"].includes(c.type),
      "metadata column",
    );
    fields.add(c.name);
  }
  for (const row of m.rows) {
    need(
      object(row) &&
        ids.has(row.nodeId) &&
        !rows.has(row.nodeId) &&
        object(row.values),
      "metadata row",
    );
    rows.add(row.nodeId);
    need(
      Object.keys(row.values).every((k) => fields.has(k)),
      "unknown metadata field",
    );
    for (const c of m.columns) {
      const value = row.values[c.name];
      need(
        value === undefined || value === null || typeof value === c.type,
        "metadata value type",
      );
    }
  }
}
