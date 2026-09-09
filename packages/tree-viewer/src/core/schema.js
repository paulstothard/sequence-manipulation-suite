import { LIMITS, VERSION, byteLength } from "./limits.js";
import {
  validateJson,
  validateComments,
  validateAnnotations,
  validateBranch,
  validatePresentation,
  validateMetadata,
} from "./validation.js";
export const DEFAULT_PRESENTATION = Object.freeze({
  layout: "rectangular",
  metric: "auto",
  orientation: "right",
  fontFamily: "Arial, sans-serif",
  fontSize: 12,
  branchWidth: 1.5,
  branchColor: "#334155",
  labelColor: "#172b3a",
  background: "#ffffff",
  spacing: 22,
  width: 1200,
  showSupport: true,
  supportFilter: "auto",
  supportField: "",
  supportMinimum: null,
  supportPrecision: 2,
  supportSize: 10,
  supportPosition: "node",
  branchShape: "square",
  unrootedAlgorithm: "equal-angle",
  labelAlignment: "aligned",
  labelBackground: "#ffffff",
  showLabelBackground: false,
  showBranchLengths: false,
  branchLengthPrecision: 4,
  supportEncoding: "text",
  supportColor: "#0072b2",
  supportSymbol: "circle",
  legendPosition: "right",
  circularRotation: 0,
  circularArc: 360,
  legendSize: 12,
  showScale: true,
  showLegend: true,
  ladderize: "none",
  collapsed: Object.freeze([]),
  order: Object.freeze({}),
  nodeStyles: Object.freeze({}),
  cladeAnnotations: Object.freeze({}),
  displayNames: Object.freeze({}),
  tracks: Object.freeze([]),
});
export function makeTreeDocument(source, trees) {
  return {
    format: "sms3-tree-document",
    formatVersion: 1,
    producer: { name: "@sms3/tree-viewer", version: VERSION },
    revision: 0,
    source,
    trees,
    presentation: Object.fromEntries(
      trees.map((t) => [t.id, structuredClone(DEFAULT_PRESENTATION)]),
    ),
    metadata: Object.fromEntries(
      trees.map((t) => [t.id, { columns: [], rows: [] }]),
    ),
    history: { undo: [], redo: [] },
  };
}
function requireCondition(condition, message) {
  if (!condition) throw new Error(`Invalid tree document: ${message}`);
}
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finiteOrNull = (value) =>
  value === null || (typeof value === "number" && Number.isFinite(value));
export function treeIndex(tree) {
  const nodes = new Map(tree.nodes.map((n) => [n.id, n]));
  const children = new Map(tree.nodes.map((n) => [n.id, []]));
  const incoming = new Map();
  for (const edge of tree.edges) {
    children.get(edge.parent)?.push(edge);
    incoming.set(edge.child, edge);
  }
  return { nodes, children, incoming };
}
export function validateTreeDocument(
  document,
  { validateHistory = true } = {},
) {
  validateJson(document);
  requireCondition(
    object(document) &&
      document.format === "sms3-tree-document" &&
      document.formatVersion === 1,
    "unsupported format or version",
  );
  requireCondition(
    byteLength(document) <= LIMITS.documentBytes,
    "document exceeds byte limit",
  );
  requireCondition(
    Number.isSafeInteger(document.revision) && document.revision >= 0,
    "revision must be a nonnegative integer",
  );
  requireCondition(
    object(document.source) &&
      typeof document.source.text === "string" &&
      byteLength(document.source.text) <= LIMITS.inputBytes,
    "source is missing or too large",
  );
  requireCondition(
    Array.isArray(document.trees) &&
      document.trees.length > 0 &&
      document.trees.length <= LIMITS.trees,
    "tree collection size",
  );
  requireCondition(
    object(document.producer) &&
      typeof document.producer.name === "string" &&
      typeof document.producer.version === "string",
    "producer",
  );
  requireCondition(
    typeof document.source.name === "string" &&
      typeof document.source.format === "string",
    "source name/format",
  );
  const treeIds = new Set();
  let totalNodes = 0,
    totalComments = 0;
  for (const tree of document.trees) {
    requireCondition(
      typeof tree.name === "string" &&
        tree.name.length <= LIMITS.labelCharacters,
      "tree name",
    );
    requireCondition(
      typeof tree.id === "string" && !treeIds.has(tree.id),
      "duplicate or missing tree ID",
    );
    treeIds.add(tree.id);
    requireCondition(
      Array.isArray(tree.nodes) &&
        Array.isArray(tree.edges) &&
        tree.nodes.length > 0,
      "node/edge arrays",
    );
    totalNodes += tree.nodes.length;
    requireCondition(totalNodes <= LIMITS.nodes, "node limit exceeded");
    const ids = new Set(),
      edgeIds = new Set(),
      parents = new Set();
    for (const node of tree.nodes) {
      requireCondition(
        typeof node.id === "string" && !ids.has(node.id),
        "duplicate node ID",
      );
      ids.add(node.id);
      requireCondition(
        typeof node.label === "string" &&
          node.label.length <= LIMITS.labelCharacters,
        "invalid label",
      );
      requireCondition(
        object(node.annotations) && Array.isArray(node.comments),
        "node annotations/comments",
      );
    }
    requireCondition(
      object(tree.root) &&
        ids.has(tree.root.nodeId) &&
        ["rooted", "unrooted", "unspecified"].includes(
          tree.root.interpretation,
        ),
      "root descriptor",
    );
    totalComments += tree.root.stem.comments?.length ?? 0;
    for (const node of tree.nodes) totalComments += node.comments?.length ?? 0;
    for (const edge of tree.edges) totalComments += edge.comments?.length ?? 0;
    requireCondition(totalComments <= LIMITS.comments, "comment count limit");
    validateBranch(tree.root.stem);
    for (const node of tree.nodes) {
      validateComments(node.comments);
      validateAnnotations(node.annotations);
      requireCondition(
        ["name", "unresolved", "support"].includes(node.labelInterpretation),
        "node label interpretation",
      );
    }
    for (const edge of tree.edges) {
      requireCondition(
        typeof edge.id === "string" && !edgeIds.has(edge.id),
        "duplicate edge ID",
      );
      edgeIds.add(edge.id);
      requireCondition(
        ids.has(edge.parent) &&
          ids.has(edge.child) &&
          edge.parent !== edge.child &&
          !parents.has(edge.child) &&
          edge.child !== tree.root.nodeId,
        "invalid edge endpoints",
      );
      parents.add(edge.child);
      requireCondition(
        finiteOrNull(edge.length) &&
          object(edge.annotations) &&
          object(edge.support) &&
          Array.isArray(edge.comments),
        "edge length/annotations",
      );
    }
    for (const edge of tree.edges) validateBranch(edge);
    requireCondition(
      tree.edges.length === tree.nodes.length - 1,
      "connected tree edge count",
    );
    const index = treeIndex(tree),
      stack = [[tree.root.nodeId, 0]],
      seen = new Set();
    while (stack.length) {
      const [id, depth] = stack.pop();
      requireCondition(
        !seen.has(id) && depth <= LIMITS.depth,
        "cycle/depth limit",
      );
      seen.add(id);
      for (const edge of index.children.get(id))
        stack.push([edge.child, depth + 1]);
    }
    requireCondition(seen.size === ids.size, "disconnected graph");
    validatePresentation(document.presentation?.[tree.id], ids, index.children);
    validateMetadata(document.metadata?.[tree.id], ids);
    const columns = new Map(
      document.metadata[tree.id].columns.map((c) => [c.name, c.type]),
    );
    for (const track of document.presentation[tree.id].tracks)
      requireCondition(
        columns.has(track.field) &&
          (!["bar", "heatmap", "multi-bar"].includes(track.type) ||
            columns.get(track.field) === "number") &&
          (track.type !== "multi-bar" || track.fields.every(field=>columns.get(field) === "number")),
        "track metadata field/type",
      );
  }
  requireCondition(
    object(document.history) &&
      Array.isArray(document.history.undo) &&
      Array.isArray(document.history.redo),
    "history arrays",
  );
  requireCondition(
    document.history.undo.length + document.history.redo.length <=
      LIMITS.historyEntries,
    "history entry limit",
  );
  requireCondition(
    byteLength(document.history) <= LIMITS.historyBytes + 1024,
    "history byte limit",
  );
  if (validateHistory) {
    const indexes = new WeakMap();
    for (const direction of ["undo", "redo"]) {
      let restored = document;
      for (const entry of [...document.history[direction]].reverse()) {
        requireCondition(
          object(entry) &&
            typeof entry.label === "string" &&
            object(entry.state),
          "history entry",
        );
        const fields = Object.keys(entry.state);
        requireCondition(
          fields.length > 0 &&
            fields.every((k) =>
              ["trees", "presentation", "metadata"].includes(k),
            ),
          "history state fields",
        );
        restored = {
          ...restored,
          ...entry.state,
          history: { undo: [], redo: [] },
        };
        // Full snapshots from earlier native files remain supported. New appearance
        // history validates only affected state against the already validated graph.
        if (entry.state.trees) {
          validateTreeDocument(restored, { validateHistory: false });
          continue;
        }
        for (const tree of restored.trees) {
          let cached = indexes.get(tree);
          if (!cached) {
            cached = {
              ids: new Set(tree.nodes.map((n) => n.id)),
              index: treeIndex(tree),
            };
            indexes.set(tree, cached);
          }
          if (entry.state.presentation)
            validatePresentation(
              restored.presentation?.[tree.id],
              cached.ids,
              cached.index.children,
            );
          if (entry.state.metadata)
            validateMetadata(restored.metadata?.[tree.id], cached.ids);
          const columns = new Map(
            restored.metadata[tree.id].columns.map((c) => [c.name, c.type]),
          );
          for (const track of restored.presentation[tree.id].tracks)
            requireCondition(
              columns.has(track.field) &&
                (!["bar", "heatmap", "multi-bar"].includes(track.type) ||
                  columns.get(track.field) === "number") &&
                (track.type !== "multi-bar" || track.fields.every(field=>columns.get(field) === "number")),
              "history track metadata field/type",
            );
        }
      }
    }
  }
  return { valid: true, treeCount: treeIds.size, nodeCount: totalNodes };
}
export function descendants(tree, nodeId) {
  const index = treeIndex(tree);
  if (!index.nodes.has(nodeId)) throw new Error("Unknown tree node.");
  const stack = [nodeId],
    result = [];
  while (stack.length) {
    const id = stack.pop();
    result.push(id);
    for (const e of index.children.get(id)) stack.push(e.child);
  }
  return result;
}
export function scientificSnapshot(document) {
  return structuredClone(document.trees);
}
