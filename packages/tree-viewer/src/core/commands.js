import { rerootTree } from "./reroot.js";
import {
  validateTreeDocument,
  DEFAULT_PRESENTATION,
  descendants,
} from "./schema.js";
import { supportProfileOptions, validateSupportRange } from "./support.js";
import { LIMITS, byteLength, checkpoint } from "./limits.js";
import { validateJson } from "./validation.js";
import { previewMetadataJoin, previewStylePreset } from "./metadata.js";
const editable = (document, keys) =>
  structuredClone(Object.fromEntries(keys.map((key) => [key, document[key]])));
const trimHistory = (history) => {
  while (
    history.undo.length + history.redo.length > LIMITS.historyEntries ||
    byteLength(history) > LIMITS.historyBytes
  ) {
    if (history.undo.length) history.undo.shift();
    else history.redo.shift();
  }
};
export async function applyTreeCommand(document, command, context = {}) {
  validateTreeDocument(document);
  validateJson(command);
  if (command.expectedRevision !== document.revision)
    throw new Error(
      "Stale tree revision. Reload the current document before applying this command.",
    );
  await checkpoint(context, "validating-command");
  const next = structuredClone(document),
    before = editable(
      document,
      command.type === "prune" ? ["trees", "presentation", "metadata"] : command.type === "reroot" ? ["trees", "presentation"] : ["interpret-label", "interpret-labels"].includes(command.type)
        ? ["trees"]
        : command.type === "metadata"
          ? command.dropIncompatibleTracks
            ? ["metadata", "presentation"]
            : ["metadata"]
          : ["presentation"],
    ),
    tree = next.trees.find((t) => t.id === command.treeId);
  const history = next.history;
  if (command.type === "undo" || command.type === "redo") {
    const from = command.type === "undo" ? history.undo : history.redo,
      to = command.type === "undo" ? history.redo : history.undo;
    if (!from.length) throw new Error(`Nothing to ${command.type}.`);
    const entry = from.pop();
    to.push({
      label: entry.label,
      state: editable(document, Object.keys(entry.state)),
    });
    Object.assign(next, entry.state);
  } else {
    if (!tree) throw new Error("Unknown tree ID.");
    const p = next.presentation[tree.id];
    switch (command.type) {
      case "clade-annotation": {
        if (!tree.nodes.some(n => n.id === command.nodeId)) throw new Error("Unknown clade node.");
        p.cladeAnnotations ??= {};
        if (command.annotation === null) delete p.cladeAnnotations[command.nodeId];
        else {
          const members = new Set(descendants(tree, command.nodeId));
          const internal = new Set(tree.edges.map(e => e.parent));
          p.cladeAnnotations[command.nodeId] = {...structuredClone(command.annotation), tips:tree.nodes.filter(n => members.has(n.id) && !internal.has(n.id)).map(n => n.id)};
        }
        break;
      }
      case "prune": {
        if (!tree.nodes.some(n=>n.id===command.nodeId) || command.nodeId===tree.root.nodeId) throw new Error("Choose a non-root node to prune.");
        const removed=new Set(descendants(tree,command.nodeId));
        const internal=new Set(tree.edges.map(e=>e.parent));
        const survivingTips=tree.nodes.filter(n=>!internal.has(n.id)&&!removed.has(n.id));
        if(!survivingTips.length)throw new Error("Pruning must retain at least one existing tip.");
        const parents=new Map(tree.edges.map(e=>[e.child,e.parent])),keep=new Set();
        for(const tip of survivingTips){let id=tip.id;while(id && !keep.has(id)){keep.add(id);id=parents.get(id);}}
        for(const n of tree.nodes)if(!keep.has(n.id))removed.add(n.id);
        tree.nodes=tree.nodes.filter(n=>!removed.has(n.id));
        tree.edges=tree.edges.filter(e=>!removed.has(e.parent)&&!removed.has(e.child));
        // Retain unary ancestors and their separate edges: combining them would
        // conflate distinct support values and annotations. Source is untouched.
        p.collapsed=p.collapsed.filter(id=>!removed.has(id));
        for(const key of ["order","nodeStyles","displayNames","cladeAnnotations"]){
          for(const id of Object.keys(p[key] ?? {})) if(removed.has(id))delete p[key][id];
        }
        for(const id of Object.keys(p.order))p.order[id]=p.order[id].filter(child=>!removed.has(child));
        for(const [id,a] of Object.entries(p.cladeAnnotations ?? {})){
          a.tips=a.tips.filter(tip=>!removed.has(tip));if(!a.tips.length)delete p.cladeAnnotations[id];
        }
        next.metadata[tree.id].rows=next.metadata[tree.id].rows.filter(row=>!removed.has(row.nodeId));
        break;
      }
      case "reroot":
        await rerootTree(tree, command, context);
        p.order = {};
        p.collapsed = [];
        break;
      case "presentation": {
        const allowed = [
          "layout",
          "metric",
          "orientation",
          "fontFamily",
          "fontSize",
          "branchWidth",
          "branchColor",
          "labelColor",
          "background",
          "spacing",
          "width",
          "showSupport",
          "supportField",
          "supportMinimum",
          "supportPrecision",
          "supportSize",
          "supportPosition",
          "branchShape",
          "unrootedAlgorithm",
          "labelAlignment",
          "labelBackground",
          "showLabelBackground",
          "showBranchLengths",
          "branchLengthPrecision",
          "supportEncoding",
          "supportColor",
          "supportSymbol",
          "legendPosition",
          "circularRotation",
          "circularArc",
          "legendSize",
          "showScale",
          "showLegend",
          "ladderize",
        ];
        if (
          !command.patch ||
          Object.keys(command.patch).some((k) => !allowed.includes(k))
        )
          throw new Error("Unsupported presentation field.");
        Object.assign(p, structuredClone(command.patch));
        break;
      }
      case "display-name":
        if (!tree.nodes.some((n) => n.id === command.nodeId))
          throw new Error("Unknown node ID.");
        p.displayNames[command.nodeId] = command.name;
        break;
      case "reset-presentation":
        // Reset drawing settings, not the user's annotation or track configuration.
        next.presentation[tree.id] = {
          ...structuredClone(DEFAULT_PRESENTATION),
          tracks: structuredClone(p.tracks),
          cladeAnnotations: structuredClone(p.cladeAnnotations ?? {}),
          displayNames: structuredClone(p.displayNames),
          collapsed: structuredClone(p.collapsed),
          order: structuredClone(p.order),
        };
        break;
      case "node-style": {
        if (!["node", "clade", undefined].includes(command.scope))
          throw new Error("Unknown style scope.");
        const ids =
          command.scope === "clade"
            ? descendants(tree, command.nodeId)
            : [command.nodeId];
        if (!tree.nodes.some((n) => n.id === command.nodeId))
          throw new Error("Unknown node ID.");
        for (const id of ids)
          p.nodeStyles[id] = {
            ...(p.nodeStyles[id] ?? {}),
            ...structuredClone(command.style),
          };
        break;
      }
      case "collapse": {
        if (
          !tree.nodes.some((n) => n.id === command.nodeId) ||
          typeof command.collapsed !== "boolean"
        )
          throw new Error("Invalid collapse command.");
        const ids = new Set(p.collapsed);
        if (command.collapsed) ids.add(command.nodeId);
        else ids.delete(command.nodeId);
        p.collapsed = [...ids];
        break;
      }
      case "order":
        p.order[command.nodeId] = structuredClone(command.children);
        break;
      case "metadata": {
        const preview = previewMetadataJoin(tree, command.table);
        if (
          !preview.canApply ||
          (preview.unmatched.length && !command.allowUnmatched)
        )
          throw new Error(
            "Metadata join has ambiguous, duplicate or unacknowledged unmatched keys.",
          );
        next.metadata[tree.id] = preview.metadata;
        if (command.dropIncompatibleTracks)
          p.tracks = p.tracks.filter((t) =>
            preview.metadata.columns.some(
              (c) =>
                (t.type !== "multi-bar" || t.fields.every(field=>preview.metadata.columns.some(column=>column.name === field && column.type === "number"))) && c.name === t.field &&
                (!["bar", "heatmap", "multi-bar"].includes(t.type) || c.type === "number"),
            ),
          );
        break;
      }
      case "tracks":
        p.tracks = structuredClone(command.tracks);
        break;
      case "preset": {
        const preview = previewStylePreset(
          next,
          tree.id,
          command.preset,
          command.fieldMapping,
        );
        if (!preview.canApply)
          throw new Error(
            `Preset requires metadata fields: ${preview.missingFields.join(", ")}`,
          );
        for (const key of ["collapsed", "order", "nodeStyles", "displayNames", "cladeAnnotations"])
          delete preview.presentation[key];
        Object.assign(p, preview.presentation);
        break;
      }
      case "interpret-label":
      case "interpret-labels": {
        const bulk = command.type === "interpret-labels";
        if (bulk) {
          const profile = supportProfileOptions(command.profile);
          if (profile.internalLabels === "unresolved") throw new Error("Choose a label interpretation.");
          command = { ...command, interpretation: profile.internalLabels, names: profile.supportNames, units: profile.supportUnits };
        }
        const nodes = bulk ? tree.nodes.filter(n => n.labelInterpretation === "unresolved") : [tree.nodes.find(n => n.id === command.nodeId)];
        if (!nodes.length) throw new Error("No unresolved numeric internal labels in this tree.");
        const incoming = new Map(tree.edges.map(edge => [edge.child, edge]));
        for (const node of nodes) {
          if (!node || node.labelInterpretation !== "unresolved")
            throw new Error(
              "Only unresolved internal labels can be interpreted.",
            );
          if (!["name", "support"].includes(command.interpretation))
            throw new Error("Select node name or named support.");
          if (command.interpretation === "support") {
            const values = node.label.split("/"),
              names = command.names;
            if (
              !Array.isArray(names) ||
              names.length !== values.length ||
              new Set(names).size !== names.length ||
              names.some((n) => typeof n !== "string" || !n) ||
              values.some((v) => !v.trim() || !Number.isFinite(Number(v)))
            )
              throw new Error(
                "Provide one unique support field name per numeric value.",
              );
            validateSupportRange(values, command.units);
            const edge =
              incoming.get(node.id) ?? tree.root.stem;
            for (let i = 0; i < names.length; i++) {
              if (Object.hasOwn(edge.support, names[i]))
                throw new Error("Support field already exists.");
              Object.defineProperty(edge.support, names[i], {
                value: {
                  value: Number(values[i]),
                  units: command.units ?? "unspecified",
                  source: "explicit-internal-label-interpretation",
                },
                enumerable: true,
                writable: true,
                configurable: true,
              });
            }
          }
          node.labelInterpretation = command.interpretation;
        }
        break;
      }
      default:
        throw new Error(
          "Unsupported command; structural tree editing is not enabled.",
        );
    }
    history.redo = [];
    history.undo.push({ label: command.type, state: before });
  }
  next.revision++;
  trimHistory(history);
  validateTreeDocument(next);
  await checkpoint(context, "committing-command");
  return next;
}
