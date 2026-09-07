import { LIMITS } from "./limits.js";
import { treeIndex } from "./schema.js";
import { validateJson, validateMetadata } from "./validation.js";
export function previewMetadataJoin(tree, { columns, rows, key = "label" }) {
  validateJson({ columns, rows, key });
  if (
    !["label", "nodeId"].includes(key) ||
    !Array.isArray(columns) ||
    !Array.isArray(rows) ||
    columns.length * rows.length > LIMITS.metadataCells
  )
    throw new Error("Invalid metadata table or cell limit exceeded.");
  const { nodes, children } = treeIndex(tree),
    keys = new Map();
  for (const node of nodes.values()) {
    if (key === "label" && children.get(node.id).length) continue;
    const value = key === "label" ? node.label : node.id;
    keys.set(value, [...(keys.get(value) ?? []), node.id]);
  }
  const matched = [],
    unmatched = [],
    ambiguous = [],
    duplicates = [],
    seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row.key !== "string")
      throw new Error("Metadata rows require an exact string key.");
    if (seen.has(row.key)) {
      duplicates.push({ row: i, key: row.key });
      continue;
    }
    seen.add(row.key);
    const ids = keys.get(row.key) ?? [];
    if (!ids.length) unmatched.push({ row: i, key: row.key });
    else if (ids.length > 1)
      ambiguous.push({ row: i, key: row.key, nodeIds: ids });
    else matched.push({ nodeId: ids[0], values: structuredClone(row.values) });
  }
  const metadata = { columns: structuredClone(columns), rows: matched };
  validateMetadata(metadata, new Set(nodes.keys()));
  const matchedIds = new Set(matched.map((r) => r.nodeId));
  return {
    metadata,
    matched: matched.length,
    unmatched,
    ambiguous,
    duplicates,
    missingNodes: [...keys.values()].flat().filter((id) => !matchedIds.has(id)),
    canApply: ambiguous.length === 0 && duplicates.length === 0,
  };
}
export function searchTree(document, treeId, query) {
  const tree = document.trees.find((t) => t.id === treeId);
  if (!tree) throw new Error("Unknown tree ID.");
  const needle = String(query).toLocaleLowerCase(),
    rows = new Map(
      document.metadata[treeId].rows.map((r) => [r.nodeId, r.values]),
    );
  if (!needle) return [];
  return tree.nodes
    .filter((n) =>
      [
        n.label,
        document.presentation[treeId].displayNames[n.id] ?? "",
        ...Object.values(n.annotations),
        ...Object.values(rows.get(n.id) ?? {}),
      ].some(
        (v) => v !== null && String(v).toLocaleLowerCase().includes(needle),
      ),
    )
    .map((n) => n.id);
}
export function createStylePreset(document, treeId, name = "Tree style") {
  const p = structuredClone(document.presentation[treeId]);
  if (!p) throw new Error("Unknown tree ID.");
  // Instance identities and display names must never leak into cross-tree styles.
  delete p.collapsed;
  delete p.order;
  delete p.nodeStyles;
  delete p.cladeAnnotations;
  delete p.displayNames;
  return { format: "sms3-tree-style", formatVersion: 1, name, presentation: p };
}
export function previewStylePreset(
  document,
  treeId,
  preset,
  fieldMapping = {},
) {
  validateJson(preset);
  validateJson(fieldMapping);
  if (
    preset.format !== "sms3-tree-style" ||
    preset.formatVersion !== 1 ||
    !preset.presentation
  )
    throw new Error("Unsupported style preset.");
  const columns = new Map(
      document.metadata[treeId].columns.map((c) => [c.name, c.type]),
    ),
    presentation = structuredClone(preset.presentation),
    missing = [];
  for (const t of presentation.tracks ?? []) {
    t.field = fieldMapping[t.field] ?? t.field;
    if (t.type === "multi-bar") { t.fields = t.fields.map(field=>fieldMapping[field] ?? field); for (const field of t.fields) if (columns.get(field) !== "number") missing.push(field); }
    const type = columns.get(t.field);
    if (!type || (["bar", "heatmap", "multi-bar"].includes(t.type) && type !== "number"))
      missing.push(t.field);
  }
  return {
    presentation,
    missingFields: [...new Set(missing)],
    canApply: missing.length === 0,
  };
}
