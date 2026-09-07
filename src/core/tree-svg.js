function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textWidthPx(text, fontSize) {
  return String(text ?? "").length * fontSize * 0.58;
}

function displayLabel(label) {
  return String(label ?? "");
}

// Supported subset: one Newick tree, quoted labels (doubled apostrophes),
// finite decimal/scientific lengths, and opaque bracket comments. Labels are
// preserved literally; internal labels have no inferred support semantics.
// See https://phylipweb.github.io/phylip/newicktree.html and docs/newick-parser.md.
function tokenizeNewick(newick) {
  const tokens = [];
  let index = 0;
  while (index < newick.length) {
    const start = index;
    const char = newick[index];
    if (/\s/u.test(char)) {index += 1; continue;}
    if ('(),:;'.includes(char)) {tokens.push({kind:'punctuation', value:char, offset:index++}); continue;}
    if (char === '[') {
      let depth = 1;
      index += 1;
      const contentStart = index;
      while (index < newick.length && depth) {
        if (newick[index] === '[') depth += 1;
        if (newick[index] === ']') depth -= 1;
        index += 1;
      }
      if (depth) throw new Error(`Invalid Newick tree: unclosed comment at character ${start + 1}.`);
      tokens.push({kind:'comment',value:newick.slice(contentStart,index-1),offset:start});
      continue;
    }
    if (char === "'") {
      let value = '';
      let closed = false;
      index += 1;
      while (index < newick.length) {
        if (newick[index] === "'" && newick[index+1] === "'") {value += "'"; index += 2;}
        else if (newick[index] === "'") {index += 1; closed = true; break;}
        else value += newick[index++];
      }
      if (!closed) throw new Error(`Invalid Newick tree: unclosed quote at character ${start + 1}.`);
      tokens.push({kind:'label',value,quoted:true,offset:start});
      continue;
    }
    if (char === ']') throw new Error(`Invalid Newick tree: unexpected ] at character ${start + 1}.`);
    while (index < newick.length && !/\s/u.test(newick[index]) && !"(),:;[]'".includes(newick[index])) index += 1;
    tokens.push({kind:'label',value:newick.slice(start,index),quoted:false,offset:start});
  }
  return tokens;
}

export function parseNewick(newick) {
  const source = String(newick ?? '').trim();
  if (!source || source.length > 10 * 1024 * 1024) throw new Error('Newick input must be nonempty and at most 10 MiB of text.');
  const tokens = tokenizeNewick(source);
  let index = 0;
  let nodes = 0;
  const is = value => tokens[index]?.kind === 'punctuation' && tokens[index].value === value;
  const fail = message => {throw new Error(`Invalid Newick tree: ${message} at character ${(tokens[index]?.offset ?? source.length) + 1}.`);};
  const comments = node => {
    while (tokens[index]?.kind === 'comment') (node.comments ??= []).push(tokens[index++].value);
  };
  function subtree(depth) {
    if (depth > 512 || ++nodes > 100000) fail('supported depth/node limit exceeded');
    const node = {label:'',length:null,children:[]};
    comments(node);
    if (is('(')) {
      index += 1;
      node.children.push(subtree(depth+1));
      while (is(',')) {index += 1; node.children.push(subtree(depth+1));}
      if (!is(')')) fail('expected comma or closing parenthesis');
      index += 1;
    }
    if (tokens[index]?.kind === 'label') node.label = tokens[index++].value;
    if (node.children.length && node.label) node.internalLabelInterpretation = 'unresolved';
    comments(node);
    if (is(':')) {
      index += 1;
      comments(node);
      const token = tokens[index];
      if (token?.kind !== 'label' || token.quoted || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token.value) || !Number.isFinite(Number(token.value))) fail('invalid finite branch length');
      node.length = Number(token.value);
      index += 1;
      comments(node);
    }
    return node;
  }
  const root = subtree(0);
  if (!is(';')) fail('expected terminating semicolon');
  index += 1;
  comments(root);
  if (index !== tokens.length) fail('unexpected trailing content');
  return root;
}

function collectLeaves(node, leaves = []) {
  if (!node.children?.length) {
    leaves.push(node);
  } else {
    node.children.forEach((child) => collectLeaves(child, leaves));
  }
  return leaves;
}

function collectNodes(node, nodes = []) {
  nodes.push(node);
  for (const child of node.children ?? []) {
    collectNodes(child, nodes);
  }
  return nodes;
}

function makeTreeGraph(root) {
  const nodes = collectNodes(root);
  const graph = new Map(nodes.map((node) => [node, []]));
  for (const node of nodes) {
    for (const child of node.children ?? []) {
      const length = Math.max(0, Number(child.length) || 0);
      graph.get(node).push({ node: child, length });
      graph.get(child).push({ node, length });
    }
  }
  return graph;
}

function pathBetweenTips(graph, start, target) {
  const visited = new Set();
  const path = [];

  function visit(node) {
    if (node === target) {
      path.push({ node, lengthFromPrevious: 0 });
      return true;
    }
    visited.add(node);
    for (const edge of graph.get(node) ?? []) {
      if (visited.has(edge.node)) {
        continue;
      }
      if (visit(edge.node)) {
        path.unshift({ node, lengthFromPrevious: edge.length });
        return true;
      }
    }
    return false;
  }

  return visit(start) ? path : [];
}

function pathDistance(path) {
  return path.slice(0, -1).reduce((sum, item) => sum + item.lengthFromPrevious, 0);
}

function buildRootedSubtree(graph, node, parent, length) {
  return {
    label: node.label || "",
    length,
    children: (graph.get(node) ?? [])
      .filter((edge) => edge.node !== parent)
      .map((edge) => buildRootedSubtree(graph, edge.node, node, edge.length))
  };
}

export function midpointRootTree(root) {
  const nodes = collectNodes(root);
  if (nodes.some(node => node !== root && (node.length === null || node.length === undefined || !Number.isFinite(node.length) || node.length < 0))) {
    throw new Error("Midpoint rooting requires complete finite nonnegative branch lengths.");
  }
  if (nodes.some(node => node.comments?.length || (node.children?.length && node.label))) {
    throw new Error("Midpoint rooting requires explicit interpretation of internal labels and comments; this renderer does not relocate unresolved support or annotations.");
  }
  const leaves = collectLeaves(root);
  if (leaves.length < 2) {
    return root;
  }

  const graph = makeTreeGraph(root);
  let longestPath = [];
  let longestDistance = -1;
  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const path = pathBetweenTips(graph, leaves[i], leaves[j]);
      const distance = pathDistance(path);
      if (distance > longestDistance) {
        longestDistance = distance;
        longestPath = path;
      }
    }
  }

  if (longestDistance <= 0 || longestPath.length === 0) {
    return root;
  }

  const midpoint = longestDistance / 2;
  let traversed = 0;
  const epsilon = 1e-12;
  for (let index = 0; index < longestPath.length - 1; index += 1) {
    const left = longestPath[index].node;
    const right = longestPath[index + 1].node;
    const edgeLength = longestPath[index].lengthFromPrevious;
    const next = traversed + edgeLength;
    if (Math.abs(midpoint - traversed) <= epsilon) {
      return {
        label: "",
        length: 0,
        children: (graph.get(left) ?? []).map((edge) => buildRootedSubtree(graph, edge.node, left, edge.length))
      };
    }
    if (Math.abs(midpoint - next) <= epsilon) {
      return {
        label: "",
        length: 0,
        children: (graph.get(right) ?? []).map((edge) => buildRootedSubtree(graph, edge.node, right, edge.length))
      };
    }
    if (midpoint > traversed && midpoint < next) {
      return {
        label: "",
        length: 0,
        children: [
          buildRootedSubtree(graph, left, right, midpoint - traversed),
          buildRootedSubtree(graph, right, left, next - midpoint)
        ]
      };
    }
    traversed = next;
  }

  return root;
}

function setDepths(node, depth = 0, depths = new Map()) {
  depths.set(node, depth);
  for (const child of node.children ?? []) {
    setDepths(child, depth + Math.max(0, Number(child.length) || 0), depths);
  }
  return depths;
}

export function renderPhylogramSvg(newick, {
  title = "Neighbor-joining tree",
  scaleLabel = "p-distance",
  note = "Branch lengths are derived from the alignment distance matrix.",
  rooting = "as-is",
  showLabelConnectors = false
} = {}) {
  const parsedRoot = typeof newick === "string" ? parseNewick(newick) : newick;
  const root = rooting === "midpoint" ? midpointRootTree(parsedRoot) : parsedRoot;
  const leaves = collectLeaves(root);
  if (leaves.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 140" role="img" aria-label="${escapeXml(title)}"><style>.title{font:600 18px system-ui,sans-serif;fill:#111827}.note{font:13px system-ui,sans-serif;fill:#475569}</style><rect width="100%" height="100%" fill="white"/><text class="title" x="32" y="48">${escapeXml(title)}</text><text class="note" x="32" y="82">No tree leaves were available to draw.</text></svg>`;
  }

  const rowSpacing = Math.max(24, Math.min(38, 32 - Math.floor(leaves.length / 12)));
  const tipFontSize = Math.max(11, Math.min(15, 16 - Math.floor(leaves.length / 10)));
  const labelMap = new Map(leaves.map((leaf) => [leaf, displayLabel(leaf.label)]));
  const maxLabelWidth = Math.max(...[...labelMap.values()].map((label) => textWidthPx(label, tipFontSize)), 64);
  const depths = setDepths(root);
  let maxDepth = Math.max(...depths.values(), 0);
  const unavailableMetric = collectNodes(root).some(node => node !== root && (node.length == null || !Number.isFinite(node.length) || node.length < 0));
  let usedUnitBranches = false;
  if (maxDepth <= 0 || unavailableMetric) {
    usedUnitBranches = true;
    function unitDepths(node, depth = 0) {
      depths.set(node, depth);
      for (const child of node.children ?? []) {
        unitDepths(child, depth + 1);
      }
    }
    unitDepths(root);
    maxDepth = Math.max(...depths.values(), 1);
  }

  const topMargin = 86;
  const leftMargin = 40;
  const rightMargin = 36;
  const bottomMargin = 54;
  const labelGap = 16;
  const branchAreaWidth = Math.max(260, Math.min(920, 140 + maxDepth * 420));
  const labelX = leftMargin + branchAreaWidth + labelGap;
  const width = Math.ceil(labelX + maxLabelWidth + rightMargin);
  const height = Math.ceil(topMargin + (leaves.length - 1) * rowSpacing + bottomMargin);
  const tipY = new Map(leaves.map((leaf, leafIndex) => [leaf, topMargin + leafIndex * rowSpacing]));
  const positions = new Map();

  function setPositions(node) {
    const x = leftMargin + (depths.get(node) / maxDepth) * branchAreaWidth;
    let y;
    if (!node.children?.length) {
      y = tipY.get(node);
    } else {
      const childPositions = node.children.map((child) => setPositions(child));
      y = childPositions.reduce((sum, position) => sum + position.y, 0) / childPositions.length;
    }
    positions.set(node, { x, y });
    return { x, y };
  }
  setPositions(root);

  if (unavailableMetric) note = "Cladogram: missing or negative lengths; branch distances are not represented.";
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    "<style>",
    ".bg{fill:#ffffff}",
    ".title{font:600 18px system-ui,sans-serif;fill:#111827}",
    ".note{font:12px system-ui,sans-serif;fill:#475569}",
    ".branch{stroke:#20262e;stroke-width:1.6;fill:none;stroke-linecap:square}",
    ".tip-link{stroke:#cbd5e1;stroke-width:1.1;fill:none;stroke-linecap:square}",
    `.tip{fill:#101418;font: ${tipFontSize}px system-ui,sans-serif;dominant-baseline:middle}`,
    ".scale{fill:#313841;font:11px system-ui,sans-serif}",
    "</style>",
    `<rect class="bg" x="0" y="0" width="${width}" height="${height}"/>`,
    `<text class="title" x="24" y="30">${escapeXml(title)}</text>`,
    `<text class="note" x="24" y="49">${escapeXml(note)}</text>`
  ];

  function line(x1, y1, x2, y2) {
    parts.push(`<line class="branch" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`);
  }

  function draw(node) {
    const parent = positions.get(node);
    for (const child of node.children ?? []) {
      const childPosition = positions.get(child);
      line(parent.x, childPosition.y, childPosition.x, childPosition.y);
      line(parent.x, parent.y, parent.x, childPosition.y);
      draw(child);
    }
  }
  draw(root);

  for (const leaf of leaves) {
    const position = positions.get(leaf);
    if (showLabelConnectors) {
      parts.push(`<line class="tip-link" x1="${position.x.toFixed(2)}" y1="${position.y.toFixed(2)}" x2="${(labelX - 8).toFixed(2)}" y2="${position.y.toFixed(2)}"/>`);
    }
    parts.push(`<text class="tip" x="${labelX.toFixed(2)}" y="${position.y.toFixed(2)}">${escapeXml(labelMap.get(leaf))}</text>`);
  }

  const rawScaleTarget = maxDepth / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawScaleTarget || 1));
  const scaled = rawScaleTarget / magnitude;
  const niceScale = (scaled >= 5 ? 5 : scaled >= 2 ? 2 : 1) * magnitude;
  const scalePx = (niceScale / maxDepth) * branchAreaWidth;
  const scaleX = leftMargin;
  const scaleY = height - 22;
  line(scaleX, scaleY, scaleX + scalePx, scaleY);
  line(scaleX, scaleY - 4, scaleX, scaleY + 4);
  line(scaleX + scalePx, scaleY - 4, scaleX + scalePx, scaleY + 4);
  const scaleText = usedUnitBranches
    ? `${Number(niceScale.toPrecision(3))} branch steps`
    : `${Number(niceScale.toPrecision(3))} ${scaleLabel}`;
  parts.push(`<text class="scale" x="${(scaleX + scalePx / 2).toFixed(2)}" y="${(scaleY - 8).toFixed(2)}" text-anchor="middle">${escapeXml(scaleText)}</text>`);
  parts.push("</svg>");
  return parts.join("\n");
}
