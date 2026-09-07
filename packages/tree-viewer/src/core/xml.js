import { SaxesParser } from "../vendor/saxes.js";
import { LIMITS, checkpoint, TreeInputError } from "./limits.js";

const branch = () => ({ length: null, lexical: null, comments: [], annotations: {}, support: {} });
const kids = (el, name) => el.children.filter(c => c.local === name && c.uri === el.uri);
const one = (el, name) => {
  const found = kids(el, name);
  if (found.length > 1) throw new Error(`Duplicate ${name} in ${el.local}.`);
  return found[0];
};
const value = (el, name) => one(el, name)?.text.trim();
const attr = (el, name) => el.attributes[name];
const number = text => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text)))
    throw new Error(`Invalid XML tree number: ${text}.`);
  return Number(text);
};
function setLength(b, text) {
  if (text === undefined) return;
  b.lexical = text.trim(); b.length = number(b.lexical);
}
function bool(text) {
  if (text === undefined) return undefined;
  if (["true", "1"].includes(text)) return true;
  if (["false", "0"].includes(text)) return false;
  throw new Error(`Invalid XML boolean: ${text}.`);
}
function tree(id, name, rooted) {
  return { id, name: name ?? "", nodes: [], edges: [], root: { nodeId: "", interpretation: rooted === undefined ? "unspecified" : rooted ? "rooted" : "unrooted", stem: branch() } };
}
function node(id, label = "") {
  return { id, label, labelInterpretation: "name", comments: [], annotations: {} };
}

// Strict, namespace-aware XML; no DOM, DTD/entity loading or external resources.
// Chunked parsing keeps cancellation responsive even for large XML documents.
export async function parseXmlTrees(source, context = {}) {
  const parser = new SaxesParser({ xmlns: true });
  const stack = []; let root, elements = 0;
  parser.on("doctype", () => { throw new Error("XML document types and entity declarations are not supported."); });
  parser.on("error", error => { throw error; });
  parser.on("opentag", tag => {
    if (++elements > 400000 || stack.length > LIMITS.depth + 10) throw new Error("XML tree element/depth limit exceeded.");
    const el = { local: tag.local, uri: tag.uri, attributes: Object.fromEntries(Object.values(tag.attributes).filter(a => !a.uri).map(a => [a.local, a.value])), children: [], text: "" };
    el.xmlType = Object.values(tag.attributes).find(a => a.uri === "http://www.w3.org/2001/XMLSchema-instance" && a.local === "type")?.value.split(":").at(-1);
    if (stack.length) stack.at(-1).children.push(el); else root = el;
    stack.push(el);
  });
  parser.on("text", text => { if (stack.length) stack.at(-1).text += text; });
  parser.on("cdata", text => { if (stack.length) stack.at(-1).text += text; });
  parser.on("closetag", () => stack.pop());
  try {
    for (let offset = 0; offset < source.length; offset += 32768) {
      await checkpoint(context, "parsing-xml");
      parser.write(source.slice(offset, offset + 32768));
    }
    parser.close();
    if (!root) throw new Error("XML contains no document element.");
    const supported = (root.local === "phyloxml" && ["", "http://www.phyloxml.org"].includes(root.uri)) || (root.local === "nexml" && ["", "http://www.nexml.org/2009"].includes(root.uri));
    if (!supported) throw new Error("Unsupported XML tree format. Use phyloXML or NeXML.");
    const format = root.local === "phyloxml" ? "phyloxml" : "nexml";
    const trees = format === "phyloxml" ? await phylo(root, context) : await nexml(root, context);
    if (!trees.length) throw new Error("No trees were found in XML.");
    if (trees.length > LIMITS.trees || trees.reduce((n,t) => n+t.nodes.length, 0) > LIMITS.nodes) throw new Error("XML tree collection exceeds tree/node limits.");
    return { format, trees, diagnostics: [{ code: "xml-import-scope", severity: "warning", message: xmlImportNotice(format) }] };
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new TreeInputError(error.message, source, Math.min(parser.position, source.length));
  }
}
async function phylo(root, context) {
  const trees = []; let total = 0;
  for (const phy of kids(root, "phylogeny")) {
    const t = tree(`t${trees.length + 1}`, value(phy, "name"), bool(attr(phy, "rooted")));
    const first = one(phy, "clade");
    if (!first) throw new Error("phyloXML phylogeny has no root clade.");
    const pending = [{ el: first, parent: null }];
    while (pending.length) {
      if (++total > LIMITS.nodes) throw new Error("XML tree node limit exceeded.");
      if (total % 256 === 0) await checkpoint(context, "converting-xml");
      const { el, parent } = pending.pop();
      const n = node(`${t.id}:n${t.nodes.length + 1}`, value(el, "name") ?? "");
      const taxonomies = kids(el, "taxonomy");
      // Do not arbitrarily choose among alternative taxonomies.
      if (taxonomies.length === 1) {
        for (const field of ["scientific_name", "common_name", "code", "rank"]) {
          const text = value(taxonomies[0], field);
          if (text !== undefined) n.annotations[`taxonomy:${field}`] = text;
        }
        if (!n.label) n.label = n.annotations["taxonomy:scientific_name"] ?? n.annotations["taxonomy:code"] ?? "";
      }
      t.nodes.push(n);
      const b = branch();
      const attributeLength = attr(el, "branch_length"), elementLength = value(el, "branch_length");
      if (attributeLength !== undefined && elementLength !== undefined && number(attributeLength) !== number(elementLength)) throw new Error("Conflicting phyloXML branch lengths.");
      setLength(b, elementLength ?? attributeLength);
      for (const c of kids(el, "confidence")) {
        const type = attr(c, "type") || "confidence";
        const key = `phyloxml:${type}`;
        if (Object.hasOwn(b.support, key)) throw new Error(`Duplicate phyloXML confidence type: ${type}.`);
        b.support[key] = { value: number(c.text.trim()), units: "unspecified", source: "phyloxml-confidence" };
      }
      if (parent) t.edges.push({ id: `${t.id}:e${t.edges.length + 1}`, parent, child: n.id, ...b });
      else { t.root.nodeId = n.id; t.root.stem = b; }
      const children = kids(el, "clade");
      for (let i = children.length - 1; i >= 0; i--) pending.push({ el: children[i], parent: n.id });
    }
    trees.push(t);
  }
  return trees;
}
async function nexml(root, context) {
  const otuBlocks = new Map(), allIds = new Set();
  const register = el => {
    const id = attr(el, "id");
    if (!id || allIds.has(id)) throw new Error("Missing or duplicate NeXML ID.");
    allIds.add(id); return id;
  };
  for (const block of kids(root, "otus")) {
    const otus = new Map(); otuBlocks.set(register(block), otus);
    for (const otu of kids(block, "otu")) {
      const id = register(otu);
      otus.set(id, attr(otu, "label") ?? id);
    }
  }
  const trees = []; let total = 0;
  for (const block of kids(root, "trees")) {
    register(block);
    if (kids(block, "network").length) throw new Error("NeXML networks are not supported; export trees without reticulate networks.");
    const otus = otuBlocks.get(attr(block, "otus"));
    if (attr(block, "otus") && !otus) throw new Error("Unknown NeXML OTU block reference.");
    for (const el of kids(block, "tree")) {
      register(el);
      if (el.xmlType && !["FloatTree", "IntTree"].includes(el.xmlType)) throw new Error("Unsupported NeXML tree type.");
      const t = tree(`t${trees.length + 1}`, attr(el, "label") ?? attr(el, "id"));
      const ids = new Map(), explicitRoots = [];
      for (const item of kids(el, "node")) {
        if (++total > LIMITS.nodes) throw new Error("XML tree node limit exceeded.");
        if (total % 256 === 0) await checkpoint(context, "converting-xml");
        const xmlId = register(item), otu = attr(item, "otu");
        if (otu && !otus?.has(otu)) throw new Error("Unknown NeXML OTU reference.");
        const n = node(`${t.id}:n${t.nodes.length + 1}`, attr(item, "label") ?? (otu ? otus.get(otu) : ""));
        n.annotations["nexml:id"] = xmlId;
        if (otu) { n.annotations["nexml:otu"] = otu; n.annotations["nexml:otu-label"] = otus.get(otu); }
        ids.set(xmlId, n.id); t.nodes.push(n);
        if (bool(attr(item, "root"))) explicitRoots.push(n.id);
      }
      const incoming = new Set();
      for (const item of kids(el, "edge")) {
        register(item);
        const parent = ids.get(attr(item, "source")), child = ids.get(attr(item, "target"));
        if (!parent || !child || incoming.has(child)) throw new Error("Invalid NeXML edge references or multiple parents.");
        incoming.add(child);
        const b = branch(); setLength(b, attr(item, "length"));
        if (el.xmlType === "IntTree" && b.length !== null && !Number.isSafeInteger(b.length)) throw new Error("NeXML IntTree requires safe integer lengths.");
        t.edges.push({ id: `${t.id}:e${t.edges.length + 1}`, parent, child, ...b });
      }
      const roots = t.nodes.filter(n => !incoming.has(n.id));
      if (roots.length !== 1 || explicitRoots.length > 1 || (explicitRoots.length && roots[0].id !== explicitRoots[0])) throw new Error("NeXML must have one consistent tree root.");
      t.root.nodeId = roots[0].id;
      if (explicitRoots.length) t.root.interpretation = "rooted";
      const rootedge = one(el, "rootedge");
      if (rootedge) {
        register(rootedge);
        if (ids.get(attr(rootedge, "target")) !== t.root.nodeId) throw new Error("NeXML root edge must target the root.");
        setLength(t.root.stem, attr(rootedge, "length"));
        if (el.xmlType === "IntTree" && t.root.stem.length !== null && !Number.isSafeInteger(t.root.stem.length)) throw new Error("NeXML IntTree requires safe integer lengths.");
      }
      trees.push(t);
    }
  }
  return trees;
}

export function xmlImportNotice(format) {
  if (!["phyloxml", "nexml"].includes(format)) return "";
  return `${format === "phyloxml" ? "phyloXML" : "NeXML"} import preserves topology, labels, branch lengths and original XML. ${format === "phyloxml" ? "Confidence and taxonomy names are mapped where present. " : "Node labels and taxon references are retained. "}Other XML annotations, styles, sequences and linked resources remain in the original source only. Newick/NEXUS exports omit XML annotations and confidence values; download a Tree Viewer document to retain the imported data and original XML.`;
}
