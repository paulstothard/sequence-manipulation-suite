import { supportProfileOptions, validateSupportRange } from "./support.js";
import { parseXmlTrees } from "./xml.js";
import { LIMITS, byteLength, checkpoint, TreeInputError } from "./limits.js";
import { treeTokens } from "./tokens.js";
import { makeTreeDocument, validateTreeDocument, treeIndex } from "./schema.js";
const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export const isFiniteNumberToken = (text) =>
  numberPattern.test(text) && Number.isFinite(Number(text));
const emptyIncoming = () => ({
  length: null,
  lexical: null,
  comments: [],
  annotations: {},
  support: {},
});
function annotationValue(text) {
  if (isFiniteNumberToken(text)) return Number(text);
  if (text === "true" || text === "false") return text === "true";
  if (/^"[^"\n]*"$/.test(text) || /^'[^'\n]*'$/.test(text))
    return text.slice(1, -1);
  if (/^[\w .+-]+$/u.test(text)) return text;
  return undefined;
}
function applyInterpretations(tree, options, diagnostics) {
  const { children, incoming } = treeIndex(tree);
  for (const node of tree.nodes) {
    const branch = incoming.get(node.id) ?? tree.root.stem;
    if (
      children.get(node.id).length &&
      node.label &&
      /^[\d.eE+\-/]+$/.test(node.label)
    ) {
      node.labelInterpretation = options.internalLabels ?? "unresolved";
      if (node.labelInterpretation === "support") {
        const values = node.label.split("/");
        const names = options.supportNames ?? ["support"];
        if (
          !Array.isArray(names) ||
          new Set(names).size !== names.length ||
          names.some(
            (n) =>
              typeof n !== "string" ||
              !n ||
              ["__proto__", "constructor", "prototype"].includes(n),
          )
        )
          throw new Error("Support field names must be unique nonempty names.");
        if (
          values.length !== names.length ||
          values.some((v) => !isFiniteNumberToken(v))
        )
          throw new Error(
            "Support interpretation requires one explicit field name per numeric value.",
          );
        validateSupportRange(values, options.supportUnits);
        branch.support = Object.fromEntries(
          values.map((value, i) => [
            names[i],
            {
              value: Number(value),
              units: options.supportUnits ?? "unspecified",
              source: "explicit-internal-label-interpretation",
            },
          ]),
        );
      } else if (node.labelInterpretation !== "name")
        diagnostics.push({
          code: "unresolved-internal-label",
          severity: "warning",
          treeId: tree.id,
          nodeId: node.id,
          message: `Internal label ${node.label} has unresolved meaning; choose node name or named branch support.`,
        });
    }
    for (const comment of [...node.comments, ...branch.comments]) {
      if (comment.text === "&R" || comment.text === "&U") {
        if (node.id === tree.root.nodeId)
          tree.root.interpretation =
            comment.text === "&R" ? "rooted" : "unrooted";
        continue;
      }
      const nhx =
        options.annotationDialect === "nhx" &&
        comment.text.startsWith("&&NHX:");
      const beast =
        options.annotationDialect === "beast" &&
        comment.text.startsWith("&") &&
        !comment.text.startsWith("&&");
      if (!nhx && !beast) continue;
      const body = comment.text.slice(nhx ? 6 : 1),
        parts = [];
      let start = 0,
        depth = 0,
        quote = "";
      for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
          if (c === quote) quote = "";
          continue;
        }
        if (c === String.fromCharCode(34) || c === String.fromCharCode(39)) {
          quote = c;
          continue;
        }
        if ("{[(".includes(c)) depth++;
        if ("}])".includes(c)) depth--;
        if (c === (nhx ? ":" : ",") && depth === 0) {
          parts.push(body.slice(start, i));
          start = i + 1;
        }
      }
      parts.push(body.slice(start));
      let unsupported = false;
      for (const part of parts) {
        const at = part.indexOf("=");
        if (at < 1) {
          unsupported = true;
          continue;
        }
        const key = part.slice(0, at).trim(),
          raw = part.slice(at + 1).trim(),
          value = annotationValue(raw);
        if (!/^[A-Za-z][\w.-]*$/.test(key) || value === undefined) {
          unsupported = true;
          continue;
        }
        if (
          (nhx && key === "B") ||
          (!nhx && ["posterior", "bootstrap", "support"].includes(key))
        ) {
          if (typeof value !== "number") {
            unsupported = true;
            continue;
          }
          branch.support[key] = {
            value,
            units: key === "posterior" ? "probability" : "unspecified",
            source: options.annotationDialect,
          };
        } else node.annotations[key] = value;
      }
      if (unsupported)
        diagnostics.push({
          code: "opaque-annotation",
          severity: "warning",
          treeId: tree.id,
          nodeId: node.id,
          message:
            "Complex annotation syntax is retained as an opaque comment; only supported scalar fields were interpreted.",
        });
    }
  }
  if (tree.edges.some((e) => e.length === null || e.length < 0))
    diagnostics.push({
      code: "metric-unavailable",
      severity: "warning",
      treeId: tree.id,
      message:
        "Missing or negative branch lengths are preserved. Use a cladogram; a complete nonnegative metric is unavailable.",
    });
}
async function parseNewickTrees(
  source,
  options = {},
  context = {},
  state = { count: 0, nextTree: 1 },
  fullSource = source,
  baseOffset = 0,
) {
  const iterator = treeTokens(source, { fullSource, baseOffset });
  let token = iterator.next().value,
    steps = 0;
  const next = () => {
    token = iterator.next().value;
  };
  const fail = (message) => {
    throw new TreeInputError(
      message,
      fullSource,
      token?.offset ?? baseOffset + source.length,
    );
  };
  const trees = [],
    diagnostics = [];
  while (token) {
    const leading = [];
    while (token?.kind === "comment") {
      leading.push({ text: token.value, position: "before" });
      next();
    }
    if (!token) {
      if (leading.length && trees.length)
        trees
          .at(-1)
          .root.stem.comments.push(
            ...leading.map((c) => ({ ...c, position: "after-length" })),
          );
      break;
    }
    const tree = {
      id: `t${state.nextTree++}`,
      name: "",
      root: {
        nodeId: "",
        interpretation: options.rootedness ?? "unspecified",
        stem: emptyIncoming(),
      },
      nodes: [],
      edges: [],
    };
    const stack = [],
      incoming = new Map();
    let current = null,
      expectNode = true,
      allowLabel = false,
      complete = false,
      prefix = leading;
    const makeNode = () => {
      if (++state.count > LIMITS.nodes)
        fail(`Tree collection exceeds ${LIMITS.nodes} nodes`);
      const node = {
        id: `${tree.id}:n${tree.nodes.length + 1}`,
        label: "",
        labelInterpretation: "name",
        annotations: {},
        comments: prefix,
      };
      prefix = [];
      tree.nodes.push(node);
      if (stack.length) {
        const parent = stack.at(-1);
        parent.children++;
        const edge = {
          id: `${tree.id}:e${tree.edges.length + 1}`,
          parent: parent.node.id,
          child: node.id,
          ...emptyIncoming(),
        };
        tree.edges.push(edge);
        incoming.set(node.id, edge);
      } else {
        tree.root.nodeId = node.id;
        incoming.set(node.id, tree.root.stem);
      }
      return node;
    };
    while (token) {
      if (++steps % 256 === 0) await checkpoint(context, "parsing-tree");
      if (expectNode) {
        if (token.kind === "comment") {
          prefix.push({ text: token.value, position: "before" });
          next();
          continue;
        }
        if (token.kind === "punctuation" && token.value === "(") {
          current = makeNode();
          stack.push({ node: current, children: 0 });
          if (stack.length > LIMITS.depth) fail("Tree depth limit exceeded");
          next();
          continue;
        }
        if (token.kind === "label") {
          current = makeNode();
          current.label = token.value;
          if (!token.quoted && /#H\d+/i.test(token.value))
            fail("Extended-Newick networks are not supported");
          next();
          expectNode = false;
          allowLabel = false;
          continue;
        }
        if (
          (stack.length && [",", ")"].includes(token.value)) ||
          token.value === ":"
        ) {
          if (token.value === ")" && stack.at(-1).children === 0)
            fail("Empty parentheses do not define a tree");
          current = makeNode();
          expectNode = false;
          allowLabel = false;
          continue;
        }
        fail("Expected a tree node or subtree");
      }
      const branch = incoming.get(current.id);
      if (token.kind === "label") {
        if (!allowLabel) fail("Unexpected label without a separator");
        current.label = token.value;
        if (!token.quoted && /#H\d+/i.test(token.value))
          fail("Extended-Newick networks are not supported");
        allowLabel = false;
        next();
        continue;
      }
      if (token.kind === "comment") {
        (branch.lexical !== null ? branch.comments : current.comments).push({
          text: token.value,
          position: branch.lexical !== null ? "after-length" : "after-label",
        });
        next();
        continue;
      }
      if (token.value === ":") {
        if (branch.lexical !== null) fail("Repeated branch length");
        next();
        if (
          token?.kind !== "label" ||
          token.quoted ||
          !isFiniteNumberToken(token.value)
        )
          fail("Expected a finite decimal branch length");
        branch.length = Number(token.value);
        branch.lexical = token.value;
        allowLabel = false;
        next();
        continue;
      }
      if (token.value === ",") {
        if (!stack.length) fail("Unexpected top-level comma");
        expectNode = true;
        next();
        continue;
      }
      if (token.value === ")") {
        if (!stack.length) fail("Unmatched closing parenthesis");
        current = stack.pop().node;
        allowLabel = true;
        next();
        continue;
      }
      if (token.value === ";") {
        if (stack.length) fail("Unclosed subtree");
        next();
        complete = true;
        break;
      }
      fail("Unexpected token in tree");
    }
    if (!complete) fail("Tree requires a terminating semicolon");
    tree.name = options.treeName ?? `Tree ${trees.length + 1}`;
    applyInterpretations(tree, options, diagnostics);
    trees.push(tree);
    if (trees.length > LIMITS.trees) fail("Too many trees");
  }
  return { trees, diagnostics };
}
async function parseNexus(source, options, context) {
  const iterator = treeTokens(source, { nexus: true });
  let statement = [],
    block = "",
    translations = new Map(),
    nameSeen = new Set();
  const trees = [],
    diagnostics = [],
    state = { count: 0, nextTree: 1 };
  const ignored = new Set();
  let steps = 0;
  for (const token of iterator) {
    if (++steps % 256 === 0) await checkpoint(context, "parsing-nexus");
    if (token.value !== ";" || token.kind !== "punctuation") {
      statement.push(token);
      if (statement.length > LIMITS.nodes * 10)
        throw new TreeInputError(
          "NEXUS statement exceeds token limit",
          source,
          token.offset,
        );
      continue;
    }
    const fields = statement.filter((t) => t.kind !== "comment");
    statement = [];
    if (!fields.length) continue;
    if (fields[0].value.toUpperCase() === "#NEXUS") fields.shift();
    const command = fields[0]?.value.toUpperCase();
    if (command === "BEGIN") {
      if (block || fields.length !== 2)
        throw new TreeInputError(
          "Malformed or nested NEXUS block",
          source,
          token.offset,
        );
      block = fields[1]?.value.toUpperCase() ?? "";
      translations = new Map();
      if (block !== "TREES") ignored.add(block);
      continue;
    }
    if (command === "END" || command === "ENDBLOCK") {
      if (!block || fields.length !== 1)
        throw new TreeInputError(
          "Unexpected NEXUS block end",
          source,
          token.offset,
        );
      block = "";
      continue;
    }
    if (block !== "TREES") continue;
    if (command === "TRANSLATE") {
      for (let i = 1; i < fields.length; ) {
        const key = fields[i++],
          value = fields[i++];
        if (
          key?.kind !== "label" ||
          value?.kind !== "label" ||
          translations.has(key.value)
        )
          throw new TreeInputError(
            "Invalid or duplicate NEXUS TRANSLATE entry",
            source,
            key?.offset ?? token.offset,
          );
        translations.set(key.value, value.value);
        if (i < fields.length && fields[i++]?.value !== ",")
          throw new TreeInputError(
            "Expected TRANSLATE comma",
            source,
            token.offset,
          );
      }
      continue;
    }
    if (command === "TREE" || command === "UTREE") {
      let at = 1;
      if (fields[at]?.value === "*") at++;
      const name = fields[at++];
      const equal = fields[at++];
      if (name?.kind !== "label" || equal?.value !== "=")
        throw new TreeInputError(
          "Malformed NEXUS tree statement",
          source,
          fields[0].offset,
        );
      if (nameSeen.has(name.value))
        throw new TreeInputError(
          "Duplicate NEXUS tree name",
          source,
          name.offset,
        );
      nameSeen.add(name.value);
      const start = equal.offset + 1;
      const parsed = await parseNewickTrees(
        source.slice(start, token.offset + 1),
        {
          ...options,
          treeName: name.value,
          rootedness: command === "UTREE" ? "unrooted" : options.rootedness,
        },
        context,
        state,
        source,
        start,
      );
      for (const tree of parsed.trees) {
        const index = treeIndex(tree);
        for (const node of tree.nodes)
          if (!index.children.get(node.id).length && translations.size) {
            if (!translations.has(node.label))
              throw new TreeInputError(
                `Missing TRANSLATE mapping for ${node.label}`,
                source,
                start,
              );
            node.label = translations.get(node.label);
          }
        trees.push(tree);
      }
      diagnostics.push(...parsed.diagnostics);
      continue;
    }
    diagnostics.push({
      code: "ignored-nexus-command",
      severity: "warning",
      message: `Ignored NEXUS TREES command ${command}.`,
    });
  }
  if (statement.some((t) => t.kind !== "comment"))
    throw new TreeInputError(
      "Unterminated NEXUS statement",
      source,
      source.length,
    );
  if (block)
    throw new TreeInputError("Unterminated NEXUS block", source, source.length);
  for (const name of ignored)
    diagnostics.push({
      code: "ignored-nexus-block",
      severity: "warning",
      message: `Ignored NEXUS ${name} block; only TREES is supported.`,
    });
  return { trees, diagnostics };
}
export async function parseTreeDocument(source, options = {}, context = {}) {
  if (options.supportProfile !== undefined) options = { ...options, ...supportProfileOptions(options.supportProfile) };
  if (
    typeof source !== "string" ||
    byteLength(source) >
      (source.trimStart().startsWith("{")
        ? LIMITS.documentBytes
        : LIMITS.inputBytes)
  )
    throw new TreeInputError("Tree input exceeds byte limit or is not text");
  if (
    options.internalLabels &&
    !["name", "support", "unresolved"].includes(options.internalLabels)
  )
    throw new Error("Unknown internal label interpretation.");
  if (
    options.annotationDialect &&
    !["opaque", "nhx", "beast"].includes(options.annotationDialect)
  )
    throw new Error("Unknown annotation dialect.");
  await checkpoint(context, "parsing-input");
  if (source.trimStart().startsWith("{")) {
    const document = JSON.parse(source);
    validateTreeDocument(document);
    await checkpoint(context, "validating-document");
    return { document, diagnostics: [] };
  }
  const xml = source.trimStart().startsWith("<") ? await parseXmlTrees(source, context) : null;
  const format = xml?.format ?? (/^\s*#NEXUS\b/i.test(source) ? "nexus" : "newick");
  const parsed = xml ?? (
    format === "nexus"
      ? await parseNexus(source, options, context)
      : await parseNewickTrees(source, options, context));
  if (!parsed.trees.length)
    throw new TreeInputError("No trees were found", source);
  const document = makeTreeDocument(
    {
      text: source,
      name: String(options.sourceName ?? "")
        .split(/[\\/]/)
        .at(-1),
      format,
    },
    parsed.trees,
  );
  validateTreeDocument(document);
  await checkpoint(context, "validating-document");
  return { document, diagnostics: parsed.diagnostics };
}
