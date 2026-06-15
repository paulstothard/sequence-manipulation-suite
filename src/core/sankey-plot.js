import "../vendor/d3/d3.min.js";
import { escapeXml } from "./plot-renderer.js";
import { findColumn, parseDelimitedTable } from "./table.js";

const COLORS = ["#2563eb", "#0f766e", "#a33a3a", "#7c3aed", "#d97706", "#0369a1", "#be123c", "#475569"];

export const sankeyFlowColumns = [
  { id: "source", label: "Source", type: "string" },
  { id: "target", label: "Target", type: "string" },
  { id: "value", label: "Value", type: "number" }
];

function asNumber(value) {
  const number = Number(String(value ?? "").trim());
  return Number.isFinite(number) && number > 0 ? number : null;
}

function niceNumber(value) {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
  return Number(value.toFixed(3)).toString();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getD3() {
  return globalThis.d3 ?? null;
}

function resolveColumns(table, options = {}) {
  const sourceColumn =
    findColumn(table.columns, options.sourceColumn) ??
    findColumn(table.columns, "source") ??
    findColumn(table.columns, "from") ??
    table.columns.find((column) => column.type !== "number");
  const targetColumn =
    findColumn(table.columns, options.targetColumn) ??
    findColumn(table.columns, "target") ??
    findColumn(table.columns, "to") ??
    table.columns.find((column) => column.id !== sourceColumn?.id && column.type !== "number");
  const valueColumn =
    findColumn(table.columns, options.valueColumn) ??
    findColumn(table.columns, "value") ??
    findColumn(table.columns, "count") ??
    table.columns.find((column) => column.type === "number");
  return { sourceColumn, targetColumn, valueColumn };
}

function aggregateFlows(table, columns) {
  const rows = [];
  const warnings = [];
  const merged = new Map();
  let skipped = 0;
  for (const row of table.rows) {
    const source = String(row[columns.sourceColumn.id] ?? "").trim();
    const target = String(row[columns.targetColumn.id] ?? "").trim();
    const value = asNumber(row[columns.valueColumn.id]);
    if (!source || !target || value === null) {
      skipped += 1;
      continue;
    }
    const key = `${source}\t${target}`;
    merged.set(key, (merged.get(key) ?? 0) + value);
  }
  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} row(s) with missing source/target values or nonpositive numeric values.`);
  }
  for (const [key, value] of merged.entries()) {
    const [source, target] = key.split("\t");
    rows.push({ source, target, value: Number(value.toFixed(6)) });
  }
  rows.sort((left, right) => right.value - left.value || left.source.localeCompare(right.source) || left.target.localeCompare(right.target));
  return { rows, warnings };
}

function nodeTotals(rows) {
  const totals = new Map();
  for (const row of rows) {
    const source = totals.get(row.source) ?? { incoming: 0, outgoing: 0 };
    source.outgoing += row.value;
    totals.set(row.source, source);
    const target = totals.get(row.target) ?? { incoming: 0, outgoing: 0 };
    target.incoming += row.value;
    totals.set(row.target, target);
  }
  return [...totals.entries()]
    .map(([label, total], index) => ({
      id: label,
      label,
      total: Math.max(total.incoming, total.outgoing),
      incoming: total.incoming,
      outgoing: total.outgoing,
      color: COLORS[index % COLORS.length]
    }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
}

function assignLevels(rows, nodes) {
  const incoming = new Map(nodes.map((node) => [node.id, new Set()]));
  const outgoing = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const row of rows) {
    outgoing.get(row.source)?.add(row.target);
    incoming.get(row.target)?.add(row.source);
  }
  const levels = new Map();
  const queue = nodes.filter((node) => (incoming.get(node.id)?.size ?? 0) === 0).map((node) => node.id);
  for (const id of queue) levels.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift();
    const nextLevel = (levels.get(id) ?? 0) + 1;
    for (const target of outgoing.get(id) ?? []) {
      if ((levels.get(target) ?? -1) < nextLevel) {
        levels.set(target, nextLevel);
        queue.push(target);
      }
    }
  }
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, (incoming.get(node.id)?.size ?? 0) === 0 ? 0 : 1);
    }
  }
  return levels;
}

function sankeyValueScale(levelGroups, plotHeight, gap) {
  const candidates = levelGroups
    .map((group) => {
      const value = group.reduce((sum, node) => sum + node.total, 0);
      const available = plotHeight - gap * Math.max(0, group.length - 1);
      return value > 0 && available > 0 ? available / value : Number.POSITIVE_INFINITY;
    })
    .filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.min(...candidates) : 1;
}

function layoutNodes(nodes, plotTop, plotHeight, valueScale, gap) {
  const totalHeight = nodes.reduce((sum, node) => sum + node.total * valueScale, 0) +
    gap * Math.max(0, nodes.length - 1);
  const overflow = Math.max(0, totalHeight - plotHeight);
  let y = plotTop - overflow / 2;
  return nodes.map((node) => {
    const height = Math.max(1, node.total * valueScale);
    const placed = { ...node, y, height, center: y + height / 2 };
    y += height + gap;
    return placed;
  });
}

function flowRibbonPath(source, target, curvature = 0.5) {
  const x1 = source.x + source.nodeWidth;
  const x2 = target.x;
  const dx = Math.max(1, x2 - x1);
  const c1 = x1 + dx * curvature;
  const c2 = x2 - dx * curvature;
  return [
    `M ${x1.toFixed(2)} ${source.y0.toFixed(2)}`,
    `C ${c1.toFixed(2)} ${source.y0.toFixed(2)}, ${c2.toFixed(2)} ${target.y0.toFixed(2)}, ${x2.toFixed(2)} ${target.y0.toFixed(2)}`,
    `L ${x2.toFixed(2)} ${target.y1.toFixed(2)}`,
    `C ${c2.toFixed(2)} ${target.y1.toFixed(2)}, ${c1.toFixed(2)} ${source.y1.toFixed(2)}, ${x1.toFixed(2)} ${source.y1.toFixed(2)}`,
    "Z"
  ].join(" ");
}

function makeOffsets(nodes) {
  return new Map(nodes.map((node) => [node.id, { node, outOffset: 0, inOffset: 0 }]));
}

function boxesOverlap(left, right, paddingX = 10, paddingY = 4) {
  return left.rectX < right.rectX + right.textWidth + paddingX &&
    left.rectX + left.textWidth + paddingX > right.rectX &&
    left.rectY < right.rectY + 18 + paddingY &&
    left.rectY + 18 + paddingY > right.rectY;
}

function estimateTextWidth(text) {
  return Math.min(260, Math.max(42, String(text).length * 6.7));
}

function labelCandidate(node, maxLevel, nodeWidth, margin, height) {
  const labelText = `${node.label} ${niceNumber(node.total)}`;
  const textWidth = estimateTextWidth(labelText);
  let labelX;
  let labelY;
  let anchor;
  if (node.level === 0) {
    labelX = node.x - 10;
    labelY = node.center + 4;
    anchor = "end";
  } else {
    labelX = node.x + nodeWidth + 10;
    labelY = node.center + 4;
    anchor = "start";
  }
  labelY = clamp(labelY, margin.top + 10, height - margin.bottom - 8);
  const rectX = anchor === "start"
    ? labelX
    : anchor === "end"
      ? labelX - textWidth
      : labelX - textWidth / 2;
  return { labelText, labelX, anchor, textWidth, rectX, y: labelY, rectY: labelY - 14 };
}

export function makeSankeyPlot(input, options = {}) {
  const warnings = [];
  const table = parseDelimitedTable(input, {
    delimiter: options.delimiter ?? "auto",
    hasHeader: options.hasHeader !== false
  });
  warnings.push(...table.warnings);
  const columns = resolveColumns(table, options);
  if (!columns.sourceColumn || !columns.targetColumn || !columns.valueColumn) {
    warnings.push("Source, target, and numeric value columns are required.");
    return { table, rows: [], warnings, svg: renderSankeySvg([], warnings, options) };
  }
  const aggregated = aggregateFlows(table, columns);
  warnings.push(...aggregated.warnings);
  const maxFlows = Math.max(1, Math.min(150, Number.parseInt(options.maxFlows ?? 80, 10) || 80));
  const rows = aggregated.rows.slice(0, maxFlows);
  if (aggregated.rows.length > rows.length) {
    warnings.push(`Only the top ${rows.length} flow(s) were drawn and returned; ${aggregated.rows.length - rows.length} smaller flow(s) were omitted.`);
  }
  return {
    table,
    rows,
    warnings,
    svg: renderSankeySvg(rows, warnings, options)
  };
}

export function renderSankeySvg(rows, warnings = [], options = {}) {
  const width = Number(options.width ?? 1040) || 1040;
  const height = Number(options.height ?? 640) || 640;
  const margin = { top: 104, right: 190, bottom: 50, left: 190 };
  const nodeWidth = 20;
  const nodeGap = 30;
  const plotTop = margin.top;
  const plotHeight = height - margin.top - margin.bottom;
  const title = String(options.title ?? "Sankey plot");
  const nodes = nodeTotals(rows);
  const levels = assignLevels(rows, nodes);
  const maxLevel = Math.max(0, ...levels.values());
  const levelGroups = Array.from({ length: maxLevel + 1 }, () => []);
  for (const node of nodes) {
    levelGroups[Math.max(0, Math.min(maxLevel, levels.get(node.id) ?? 0))].push(node);
  }
  for (const group of levelGroups) {
    group.sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
  }
  const valueScale = sankeyValueScale(levelGroups, plotHeight, nodeGap);
  const levelScale = getD3()?.scaleLinear?.()
    .domain([0, Math.max(1, maxLevel)])
    .range([margin.left, width - margin.right - nodeWidth]);
  const xForLevel = (level) => maxLevel === 0
    ? width / 2 - nodeWidth / 2
    : levelScale
      ? levelScale(level)
      : margin.left + (level / maxLevel) * (width - margin.left - margin.right - nodeWidth);
  const placedNodes = levelGroups.flatMap((group, level) =>
    layoutNodes(group, plotTop, plotHeight, valueScale, nodeGap).map((node) => ({ ...node, x: xForLevel(level), level }))
  );
  const stateById = makeOffsets(placedNodes);

  const nodeRects = placedNodes.map((node) =>
    `<rect class="sankey-node" data-node="${escapeXml(node.id)}" data-value="${niceNumber(node.total)}" x="${node.x.toFixed(2)}" y="${node.y.toFixed(2)}" width="${nodeWidth}" height="${node.height.toFixed(2)}" rx="3" fill="${node.color}" fill-opacity="0.9"><title>${escapeXml(`${node.label}: ${niceNumber(node.total)}`)}</title></rect>`
  ).join("");

  const labelCandidates = placedNodes
    .map((node) => labelCandidate(node, maxLevel, nodeWidth, margin, height))
    .sort((left, right) => left.y - right.y);

  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (let index = 1; index < labelCandidates.length; index += 1) {
      const previous = labelCandidates[index - 1];
      const current = labelCandidates[index];
      if (!boxesOverlap(previous, current, 12, 5)) continue;
      const shift = previous.rectY + 23 - current.rectY;
      const maxY = height - margin.bottom - 8;
      if (current.y + shift <= maxY) {
        current.y += shift;
        current.rectY += shift;
      } else {
        const up = Math.min(shift, Math.max(0, previous.y - (margin.top + 14)));
        previous.y -= up;
        previous.rectY -= up;
      }
      changed = true;
    }
    labelCandidates.sort((left, right) => left.y - right.y);
    if (!changed) break;
  }

  const labelElements = labelCandidates.map((label) =>
    `<text x="${label.labelX.toFixed(2)}" y="${label.y.toFixed(2)}" text-anchor="${label.anchor}" class="node-label">${escapeXml(label.labelText)}</text>`
  ).join("");

  const linkOrder = rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftSource = stateById.get(left.row.source)?.node;
      const rightSource = stateById.get(right.row.source)?.node;
      const leftTarget = stateById.get(left.row.target)?.node;
      const rightTarget = stateById.get(right.row.target)?.node;
      return (leftSource?.level ?? 0) - (rightSource?.level ?? 0) ||
        (leftSource?.y ?? 0) - (rightSource?.y ?? 0) ||
        (leftTarget?.y ?? 0) - (rightTarget?.y ?? 0) ||
        right.row.value - left.row.value ||
        left.index - right.index;
    });
  const linkLayouts = [];
  for (const { row } of linkOrder) {
    const sourceState = stateById.get(row.source);
    const targetState = stateById.get(row.target);
    if (!sourceState || !targetState) continue;
    const thickness = Math.max(0.75, row.value * valueScale);
    const sourceY0 = sourceState.node.y + sourceState.outOffset;
    const sourceY1 = sourceY0 + thickness;
    const targetY0 = targetState.node.y + targetState.inOffset;
    const targetY1 = targetY0 + thickness;
    sourceState.outOffset += thickness;
    targetState.inOffset += thickness;
    const color = sourceState.node.color;
    linkLayouts.push(`<path class="sankey-link" data-source="${escapeXml(row.source)}" data-target="${escapeXml(row.target)}" data-value="${niceNumber(row.value)}" d="${flowRibbonPath({ x: sourceState.node.x, y0: sourceY0, y1: sourceY1, nodeWidth }, { x: targetState.node.x, y0: targetY0, y1: targetY1 })}" fill="${color}" fill-opacity="0.28"><title>${escapeXml(`${row.source} to ${row.target}: ${niceNumber(row.value)}`)}</title></path>`);
  }
  const flowElements = linkLayouts.join("");

  const subtitle = rows.length === 0
    ? warnings[0] ?? "No positive flows to draw."
    : `Link width and node height use the same value scale; labels show node totals.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="sms3-sankey-svg" data-plot-backend="d3" data-plot-renderer="sms3-d3">
  <style>
    text{font-family:Inter,Arial,sans-serif;fill:#0f172a}.title{font-size:22px;font-weight:700}.subtitle{font-size:12.5px;fill:#475569}.node-label{font-size:11.5px;font-weight:500;paint-order:stroke;stroke:#f8fafc;stroke-width:1.1px;stroke-opacity:.65;stroke-linejoin:round}.sankey-link{mix-blend-mode:multiply;stroke:none}.sankey-node{shape-rendering:geometricPrecision}
  </style>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="28" y="34" class="title">${escapeXml(title)}</text>
  <text x="28" y="56" class="subtitle">${escapeXml(subtitle)}</text>
  <g>${flowElements}</g>
  <g>${nodeRects}</g>
  <g>${labelElements}</g>
</svg>`;
}

export function sankeyRowsToTsv(rows) {
  return [
    sankeyFlowColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => sankeyFlowColumns.map((column) => String(row[column.id] ?? "").replaceAll("\t", " ")).join("\t"))
  ].join("\n") + "\n";
}
