import { checkpoint } from './limits.js';

// Reroot the undirected tree: edge identity and evidence stay with each split.
export async function rerootTree(tree, { nodeId, midpoint = false }, context = {}) {
  if (tree.nodes.some(n => n.labelInterpretation === 'unresolved'))
    throw new Error('Interpret numeric internal labels before rerooting so support values stay with their branches.');
  if (tree.edges.filter(e => e.parent === tree.root.nodeId).length < 2)
    throw new Error('Rerooting requires a root with at least two children.');
  let adjacency = new Map(tree.nodes.map(n => [n.id, []]));
  const index = () => {
    adjacency = new Map(tree.nodes.map(n => [n.id, []]));
    for (const edge of tree.edges) {
      adjacency.get(edge.parent).push({id:edge.child, edge});
      adjacency.get(edge.child).push({id:edge.parent, edge});
    }
  };
  index();
  if (midpoint) {
    if (!tree.edges.length || tree.edges.some(e => e.length === null || e.length < 0))
      throw new Error('Midpoint rooting requires nonnegative lengths on every branch.');
    const farthest = async start => {
      const stack = [start], distance = new Map([[start, 0]]), previous = new Map();
      let end = start, steps = 0;
      while (stack.length) {
        const id = stack.pop();
        if (++steps % 256 === 0) await checkpoint(context, 'finding-midpoint');
        if (distance.get(id) > distance.get(end)) end = id;
        for (const next of adjacency.get(id)) if (!distance.has(next.id)) {
          const value = distance.get(id) + next.edge.length;
          if (!Number.isFinite(value)) throw new Error('Branch-length range is too large for midpoint rooting.');
          distance.set(next.id, value); previous.set(next.id, {id, edge:next.edge}); stack.push(next.id);
        }
      }
      return {end, distance, previous};
    };
    const first = await farthest(tree.root.nodeId), diameter = await farthest(first.end);
    const length = diameter.distance.get(diameter.end);
    if (!length) throw new Error('Midpoint rooting requires at least one positive branch length.');
    let at = diameter.end, remaining = length / 2;
    while (diameter.previous.has(at)) {
      const step = diameter.previous.get(at), edge = step.edge;
      if (remaining === 0) { nodeId = at; break; }
      if (remaining < edge.length) {
        const unique = (prefix, ids) => { let i=1; while (ids.has(`${tree.id}:${prefix}${i}`)) i++; return `${tree.id}:${prefix}${i}`; };
        nodeId = unique('root', new Set(tree.nodes.map(n=>n.id)));
        tree.nodes.push({id:nodeId, label:'', labelInterpretation:'name', comments:[], annotations:{}});
        const originalParent = edge.parent, originalChild = edge.child;
        const childLength = at === originalChild ? remaining : edge.length - remaining;
        const parentLength = edge.length - childLength;
        edge.parent = nodeId; edge.length = childLength; edge.lexical = null;
        tree.edges.push({id:unique('rootedge', new Set(tree.edges.map(e=>e.id))), parent:nodeId, child:originalParent,
          length:parentLength, lexical:null, comments:[], annotations:{}, support:{}});
        index(); break;
      }
      remaining -= edge.length; at = step.id; nodeId = at;
    }
  } else if (!adjacency.has(nodeId) || adjacency.get(nodeId).length < 2) {
    throw new Error('Choose an internal node for node rooting.');
  }
  if (!adjacency.has(nodeId)) throw new Error('Unknown root node.');
  const visited = new Set([nodeId]), stack = [nodeId];
  let steps = 0;
  while (stack.length) {
    if (++steps % 256 === 0) await checkpoint(context, 'rerooting-tree');
    const parent = stack.pop();
    for (const next of adjacency.get(parent)) if (!visited.has(next.id)) {
      visited.add(next.id); next.edge.parent = parent; next.edge.child = next.id; stack.push(next.id);
    }
  }
  tree.root.nodeId = nodeId;
  tree.root.interpretation = 'rooted';
}

// A root is at the diameter midpoint iff the two longest distances to tips
// in different root-child components agree. Root stems are outside the tree.
export function isMidpointRooted(tree) {
  const children = new Map(tree.nodes.map(node => [node.id, []]));
  for (const edge of tree.edges) {
    if (edge.length === null || edge.length < 0 || !Number.isFinite(edge.length)) return false;
    children.get(edge.parent).push(edge);
  }
  const branches = children.get(tree.root.nodeId);
  if (branches.length < 2) return false;
  const heights = [];
  for (const edge of branches) {
    let height = 0;
    const stack = [[edge.child, edge.length]];
    while (stack.length) {
      const [id, distance] = stack.pop();
      if (!Number.isFinite(distance)) return false;
      const next = children.get(id);
      if (!next.length) height = Math.max(height, distance);
      for (const child of next) stack.push([child.child, distance + child.length]);
    }
    heights.push(height);
  }
  heights.sort((a,b) => b-a);
  return heights[0] > 0 && (heights[0]-heights[1])/heights[0] <= 1e-10;
}
