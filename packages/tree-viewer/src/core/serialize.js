import { validateTreeDocument, treeIndex } from "./schema.js";
import { checkpoint } from "./limits.js";
export const quoteLabel = (value) => `'${value.replaceAll("'", "''")}'`;
const comments = (items) => items.map((c) => `[${c.text}]`).join("");
/** Iterative serialization also supports deeply nested trees without stack overflow. */
export async function serializeNewick(tree, context = {}) {
  const { nodes, children, incoming } = treeIndex(tree),
    output = [],
    stack = [{ id: tree.root.nodeId }],
    rootMarker =
      tree.root.interpretation === "unspecified"
        ? ""
        : tree.root.interpretation === "rooted"
          ? "[&R]"
          : "[&U]";
  let steps = 0;
  while (stack.length) {
    if (++steps % 256 === 0) await checkpoint(context, "serializing-tree");
    const item = stack.pop();
    if (typeof item === "string") {
      output.push(item);
      continue;
    }
    const node = nodes.get(item.id),
      branch = incoming.get(item.id) ?? tree.root.stem,
      edges = children.get(item.id);
    if (item.close) {
      if (edges.length) output.push(")");
      output.push(
        quoteLabel(node.labelInterpretation === "support" || !node.label
          ? Object.values(branch.support).filter(v => v.source === "explicit-internal-label-interpretation").map(v => v.value).join("/") || (node.labelInterpretation === "support" ? "" : node.label)
          : node.label),
        comments(node.comments.filter((c) => c.position !== "before")),
      );
      if (branch.length !== null)
        output.push(":", branch.lexical ?? String(branch.length));
      output.push(comments(branch.comments));
    } else {
      output.push(
        comments(node.comments.filter((c) => c.position === "before")),
      );
      stack.push({ id: item.id, close: true });
      if (edges.length) {
        output.push("(");
        for (let i = edges.length - 1; i >= 0; i--) {
          stack.push({ id: edges[i].child });
          if (i > 0) stack.push(",");
        }
      }
    }
  }
  // Root interpretation can also be explicitly selected without an original marker.
  const hasMarker = [
    ...nodes.get(tree.root.nodeId).comments,
    ...tree.root.stem.comments,
  ].some((c) => c.text === "&R" || c.text === "&U");
  return (hasMarker ? "" : rootMarker) + output.join("") + ";";
}
export async function exportTreeDocument(
  document,
  { format = "native", treeId } = {},
  context = {},
) {
  validateTreeDocument(document);
  const snapshot = structuredClone(document),
    revision = snapshot.revision;
  await checkpoint(context, "capturing-export");
  if (format === "native")
    return { text: JSON.stringify(snapshot), revision, losses: [] };
  if (format === "source")
    return { text: snapshot.source.text, revision, losses: [] };
  if (["nodes", "edges", "history"].includes(format)) {
    const trees = treeId
      ? snapshot.trees.filter((t) => t.id === treeId)
      : snapshot.trees;
    if (!trees.length) throw new Error("Unknown tree ID.");
    const rows = [];
    let columns;
    if (format === "history") {
      columns = ["direction", "position", "command"];
      for (const direction of ["undo", "redo"])
        for (let i = 0; i < snapshot.history[direction].length; i++)
          rows.push([direction, i + 1, snapshot.history[direction][i].label]);
    } else if (format === "nodes") {
      columns = [
        "tree_id",
        "node_id",
        "original_label",
        "display_label",
        "label_interpretation",
        "annotations",
        "metadata",
      ];
      for (const t of trees) {
        const metadata = new Map(
          snapshot.metadata[t.id].rows.map((r) => [r.nodeId, r.values]),
        );
        for (const n of t.nodes)
          rows.push([
            t.id,
            n.id,
            n.label,
            snapshot.presentation[t.id].displayNames[n.id] ?? n.label,
            n.labelInterpretation,
            JSON.stringify(n.annotations),
            JSON.stringify(metadata.get(n.id) ?? {}),
          ]);
      }
    } else {
      columns = [
        "tree_id",
        "edge_id",
        "parent_id",
        "child_id",
        "length",
        "support",
        "annotations",
      ];
      for (const t of trees)
        for (const e of t.edges)
          rows.push([
            t.id,
            e.id,
            e.parent,
            e.child,
            e.length ?? "",
            JSON.stringify(e.support),
            JSON.stringify(e.annotations),
          ]);
    }
    const cell = (v) =>
      /[\t\r\n"]/.test(String(v))
        ? `"${String(v).replaceAll('"', '""')}"`
        : String(v);
    const lines = [columns.join("\t")];
    for (let i = 0; i < rows.length; i++) {
      if (i % 256 === 0) await checkpoint(context, "serializing-table");
      lines.push(rows[i].map(cell).join("\t"));
    }
    return {
      text: lines.join("\n") + "\n",
      columns,
      rows,
      revision,
      losses: [],
    };
  }
  if (!["newick", "nexus"].includes(format))
    throw new Error("Unsupported tree export format.");
  const trees = treeId
    ? snapshot.trees.filter((t) => t.id === treeId)
    : snapshot.trees;
  if (!trees.length) throw new Error("Unknown tree ID.");
  const serialized = [];
  for (const tree of trees) {
    const text = await serializeNewick(tree, context);
    serialized.push(
      format === "nexus" ? `  TREE ${quoteLabel(tree.name)} = ${text}` : text,
    );
  }
  return {
    text:
      format === "nexus"
        ? `#NEXUS\nBEGIN TREES;\n${serialized.join("\n")}\nEND;\n`
        : serialized.join("\n"),
    revision,
    losses: [
      "Presentation, joined metadata and edit history require the native document.",
      ...(["phyloxml", "nexml"].includes(snapshot.source.format)
        ? ["XML confidence values, taxonomy, taxon references and other XML annotations are omitted. Save native JSON or the original source to retain them."]
        : ["Explicit annotation interpretations require the same import profile; original labels and comments are retained."]),
    ],
  };
}
