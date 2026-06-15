import "../vendor/d3/d3.min.js";
import { escapeXml } from "./plot-renderer.js";

export const VENN_DIAGRAM_MAX_LISTS = 3;

const COLORS = ["#2563eb", "#f59e0b", "#10b981"];
const REGION_LABEL_FONT_SIZE = 9.5;
const REGION_COUNT_FONT_SIZE = 17;
const REGION_COUNT_MIN_FONT_SIZE = 10.5;

function formatCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000) return `${(number / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (absolute >= 10_000) return `${Math.round(number / 1_000)}k`;
  if (absolute >= 1_000) return `${(number / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(number);
}

function estimateTextWidth(text, fontSize) {
  return String(text ?? "").length * fontSize * 0.56;
}

function fittedFontSize(text, preferredSize, maxWidth, minSize = REGION_COUNT_MIN_FONT_SIZE) {
  const width = estimateTextWidth(text, preferredSize);
  if (!Number.isFinite(width) || width <= 0 || width <= maxWidth) return preferredSize;
  return Math.max(minSize, Math.floor((preferredSize * maxWidth / width) * 10) / 10);
}

function regionListCount(membership) {
  return membership.filter(Boolean).length;
}

function regionMaxWidth(membership, setCount, label, countText, labelFontSize, preferredCountFontSize) {
  const listCount = regionListCount(membership);
  const baseWidth = setCount === 2
    ? (listCount === 2 ? 76 : 98)
    : (listCount === 1 ? 92 : (listCount === 2 ? 70 : 58));
  const capWidth = setCount === 2
    ? (listCount === 2 ? 100 : 124)
    : (listCount === 1 ? 116 : (listCount === 2 ? 92 : 72));
  const neededWidth = Math.ceil(Math.max(
    estimateTextWidth(label, labelFontSize),
    estimateTextWidth(countText, preferredCountFontSize)
  ) + 10);
  return Math.min(capWidth, Math.max(baseWidth, neededWidth));
}

function regionLabelMetrics(region, setLabels, countMap, setCount) {
  const key = membershipKey(region.membership);
  const count = countMap.get(key) ?? 0;
  const label = membershipLabel(region.membership, setLabels);
  const countText = formatCompactNumber(count);
  const labelFontSize = region.compact ? 8.8 : REGION_LABEL_FONT_SIZE;
  const preferredCountFontSize = region.compact ? 15.5 : REGION_COUNT_FONT_SIZE;
  const maxWidth = regionMaxWidth(region.membership, setCount, label, countText, labelFontSize, preferredCountFontSize);
  const countFontSize = fittedFontSize(countText, preferredCountFontSize, maxWidth);
  const boxWidth = Math.max(
    estimateTextWidth(label, labelFontSize),
    estimateTextWidth(countText, countFontSize)
  ) + 14;
  return {
    key,
    count,
    label,
    countText,
    labelFontSize,
    countFontSize,
    maxWidth,
    boxWidth,
    boxHeight: region.compact ? 34 : 39,
    labelOffset: region.compact ? -7 : -9,
    countOffset: region.compact ? 13 : 15
  };
}

function circleClearance(circle, x, y, included) {
  const distance = Math.hypot(x - circle.x, y - circle.y);
  return included ? circle.r - distance : distance - circle.r;
}

function sampleLabelBlock(x, y, width, height) {
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  return [
    [left, top],
    [x, top],
    [right, top],
    [left, y],
    [x, y],
    [right, y],
    [left, bottom],
    [x, bottom],
    [right, bottom]
  ];
}

function labelBlockClearance(circles, membership, x, y, width, height) {
  let clearance = Number.POSITIVE_INFINITY;
  for (const [sampleX, sampleY] of sampleLabelBlock(x, y, width, height)) {
    for (let index = 0; index < circles.length; index += 1) {
      clearance = Math.min(clearance, circleClearance(circles[index], sampleX, sampleY, membership[index]));
    }
  }
  return clearance;
}

function includedCircleBounds(circles, membership, padding = 8) {
  let minX = Number.NEGATIVE_INFINITY;
  let minY = Number.NEGATIVE_INFINITY;
  let maxX = Number.POSITIVE_INFINITY;
  let maxY = Number.POSITIVE_INFINITY;
  circles.forEach((circle, index) => {
    if (!membership[index]) return;
    minX = Math.max(minX, circle.x - circle.r + padding);
    minY = Math.max(minY, circle.y - circle.r + padding);
    maxX = Math.min(maxX, circle.x + circle.r - padding);
    maxY = Math.min(maxY, circle.y + circle.r - padding);
  });
  return { minX, minY, maxX, maxY };
}

function preferredRegionPoint(circles, membership) {
  const included = circles.filter((_, index) => membership[index]);
  return {
    x: included.reduce((sum, circle) => sum + circle.x, 0) / included.length,
    y: included.reduce((sum, circle) => sum + circle.y, 0) / included.length
  };
}

function findRegionLabelPosition(circles, membership, metrics) {
  const bounds = includedCircleBounds(circles, membership);
  const preferred = preferredRegionPoint(circles, membership);
  let best = { x: preferred.x, y: preferred.y, score: Number.NEGATIVE_INFINITY };
  const step = 2;
  const startX = Math.ceil(bounds.minX + metrics.boxWidth / 2);
  const endX = Math.floor(bounds.maxX - metrics.boxWidth / 2);
  const startY = Math.ceil(bounds.minY + metrics.boxHeight / 2);
  const endY = Math.floor(bounds.maxY - metrics.boxHeight / 2);
  for (let x = startX; x <= endX; x += step) {
    for (let y = startY; y <= endY; y += step) {
      const clearance = labelBlockClearance(circles, membership, x, y, metrics.boxWidth, metrics.boxHeight);
      const preferredDistance = Math.hypot(x - preferred.x, y - preferred.y);
      const score = clearance * 100 - preferredDistance * 0.04;
      if (score > best.score) {
        best = { x, y, score };
      }
    }
  }
  return { x: Math.round(best.x), y: Math.round(best.y) };
}

function positionRegions(layout, setLabels, countMap, setCount) {
  return layout.regions.map((region) => {
    const metrics = regionLabelMetrics(region, setLabels, countMap, setCount);
    const position = findRegionLabelPosition(layout.circles, region.membership, metrics);
    return { ...region, ...metrics, ...position };
  });
}

function getD3() {
  return globalThis.d3 ?? null;
}

function membershipKey(membership) {
  return membership.map((present) => present ? "1" : "0").join("");
}

function membershipLabel(membership, setLabels) {
  const included = membership
    .map((present, index) => present ? setLabels[index] : "")
    .filter(Boolean);
  return included.length === 1 ? `${included[0]} only` : included.join("+");
}

function exactIntersections(intersections, setLabels, setCount) {
  return intersections
    .filter((row) => (row.membership ?? []).some(Boolean))
    .map((row) => ({
      membership: (row.membership ?? []).slice(0, setCount).map(Boolean),
      label: membershipLabel((row.membership ?? []).slice(0, setCount).map(Boolean), setLabels),
      count: row.item_count ?? 0,
      listCount: row.list_count ?? 0
    }))
    .filter((row) => row.label && row.membership.length === setCount)
    .sort((left, right) => right.count - left.count || right.listCount - left.listCount || left.label.localeCompare(right.label));
}

function intersectionCountMap(intersections, setCount) {
  const byKey = new Map();
  for (const row of intersections) {
    const membership = (row.membership ?? []).slice(0, setCount).map(Boolean);
    if (membership.length === setCount) {
      byKey.set(membershipKey(membership), row.item_count ?? 0);
    }
  }
  return byKey;
}

function colorScale() {
  const scale = getD3()?.scaleOrdinal?.(COLORS);
  return (index) => scale ? scale(index) : COLORS[index % COLORS.length];
}

function layoutForSetCount(setCount, setLabels, setSizes) {
  const colorFor = colorScale();
  if (setCount === 2) {
    return {
      width: 760,
      height: 430,
    circles: [
      { label: setLabels[0], size: setSizes[0] ?? 0, x: 292, y: 226, r: 142, color: colorFor(0) },
      { label: setLabels[1], size: setSizes[1] ?? 0, x: 430, y: 226, r: 142, color: colorFor(1) }
    ],
    regions: [
      { membership: [true, false] },
      { membership: [true, true] },
      { membership: [false, true] }
      ]
    };
  }
  return {
    width: 820,
    height: 530,
    circles: [
      { label: setLabels[0], size: setSizes[0] ?? 0, x: 375, y: 214, r: 142, color: colorFor(0) },
      { label: setLabels[1], size: setSizes[1] ?? 0, x: 300, y: 326, r: 142, color: colorFor(1) },
      { label: setLabels[2], size: setSizes[2] ?? 0, x: 450, y: 326, r: 142, color: colorFor(2) }
    ],
    regions: [
      { membership: [true, false, false] },
      { membership: [false, true, false] },
      { membership: [false, false, true] },
      { membership: [true, true, false] },
      { membership: [true, false, true] },
      { membership: [false, true, true] },
      { membership: [true, true, true], compact: true }
    ]
  };
}

function makeRegionLabel(region) {
  return `<g class="region-label" data-membership="${region.key}" data-max-width="${region.maxWidth}" data-label-box-width="${region.boxWidth.toFixed(1)}"><text class="region-name" x="${region.x}" y="${region.y + region.labelOffset}" text-anchor="middle" font-size="${region.labelFontSize}">${escapeXml(region.label)}</text><text class="region-count" x="${region.x}" y="${region.y + region.countOffset}" text-anchor="middle" font-size="${region.countFontSize}" data-count-font-size="${region.countFontSize}">${escapeXml(region.countText)}</text></g>`;
}

export function makeVennDiagramSvg({
  title = "Venn diagram",
  setLabels = [],
  setSizes = [],
  intersections = []
} = {}) {
  const requestedCount = setLabels.length;
  if (requestedCount > VENN_DIAGRAM_MAX_LISTS) {
    const width = 760;
    const height = 260;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-venn-svg" data-plot-renderer="sms3-d3" data-venn-status="too-many-lists"><style>.title{font:700 19px system-ui,sans-serif;fill:#111827}.message{font:13px system-ui,sans-serif;fill:#334155}.hint{font:12px system-ui,sans-serif;fill:#64748b}</style><text class="title" x="32" y="40">${escapeXml(title)}</text><text class="message" x="32" y="84">Venn diagrams are limited to ${VENN_DIAGRAM_MAX_LISTS} lists in SMS3.</text><text class="hint" x="32" y="112">Use the UpSet Plot for ${requestedCount} lists; it shows exact intersections without forcing them into misleading circles.</text></svg>`;
  }
  if (requestedCount < 2) {
    const width = 760;
    const height = 220;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-venn-svg" data-plot-renderer="sms3-d3" data-venn-status="too-few-lists"><style>.title{font:700 19px system-ui,sans-serif;fill:#111827}.message{font:13px system-ui,sans-serif;fill:#334155}</style><text class="title" x="32" y="40">${escapeXml(title)}</text><text class="message" x="32" y="84">Provide 2 or 3 lists to draw a Venn diagram.</text></svg>`;
  }
  const shownCount = requestedCount;
  const shownLabels = setLabels.slice(0, shownCount);
  const shownSizes = setSizes.slice(0, shownCount).map((value) => Math.max(0, Number(value) || 0));
  const layout = layoutForSetCount(shownCount, shownLabels, shownSizes);
  const { width, height, circles } = layout;
  const countMap = intersectionCountMap(intersections, shownCount);
  const exactRows = exactIntersections(intersections, shownLabels, shownCount);
  const circleSvg = circles.map((node) =>
    `<circle cx="${node.x.toFixed(1)}" cy="${node.y.toFixed(1)}" r="${node.r.toFixed(1)}" fill="${node.color}" fill-opacity="0.26" stroke="${node.color}" stroke-width="2.2"><title>${escapeXml(`${node.label}: ${node.size} distinct items`)}</title></circle>`
  ).join("");
  const positionedRegions = positionRegions(layout, shownLabels, countMap, shownCount);
  const countSvg = positionedRegions.map((region) => makeRegionLabel(region)).join("");
  const rightX = shownCount === 2 ? 600 : 640;
  const setTotalsSvg = circles.map((node, index) => {
    const y = 116 + index * 22;
    return `<g><rect x="${rightX}" y="${y - 11}" width="10" height="10" rx="2" fill="${node.color}" fill-opacity="0.72"></rect><text class="intersection-label" x="${rightX + 18}" y="${y}">${escapeXml(node.label)}</text><text class="intersection-count" x="${width - 34}" y="${y}" text-anchor="end">${escapeXml(formatCompactNumber(node.size))}</text></g>`;
  }).join("");
  const exactY = 130 + circles.length * 22;
  const exactSvg = exactRows.map((row, index) => {
    const y = exactY + 34 + index * 22;
    return `<g><text class="intersection-label" x="${rightX}" y="${y}">${escapeXml(row.label)}</text><text class="intersection-count" x="${width - 34}" y="${y}" text-anchor="end">${escapeXml(formatCompactNumber(row.count))}</text></g>`;
  }).join("");
  const note = "Region counts are exact; circle areas are schematic.";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="d3-venn-svg" data-plot-renderer="sms3-d3" data-venn-set-count="${shownCount}"><style>.title{font:700 19px system-ui,sans-serif;fill:#111827}.subtitle,.note{font:12px system-ui,sans-serif;fill:#475569}.region-name{font:600 ${REGION_LABEL_FONT_SIZE}px system-ui,sans-serif;fill:#334155;paint-order:stroke;stroke:#f8fafc;stroke-width:1.25px;stroke-opacity:.82;stroke-linejoin:round}.region-count{font:750 ${REGION_COUNT_FONT_SIZE}px system-ui,sans-serif;fill:#111827;paint-order:stroke;stroke:#f8fafc;stroke-width:1.7px;stroke-opacity:.78;stroke-linejoin:round}.side-title{font:700 13px system-ui,sans-serif;fill:#111827}.intersection-label{font:12px system-ui,sans-serif;fill:#334155}.intersection-count{font:700 12px system-ui,sans-serif;fill:#111827}</style><text class="title" x="32" y="34">${escapeXml(title)}</text><text class="subtitle" x="32" y="55">Exact overlap counts for ${shownCount} list${shownCount === 1 ? "" : "s"}</text>${circleSvg}${countSvg}<text class="side-title" x="${rightX}" y="82">Set totals</text><line x1="${rightX}" y1="94" x2="${width - 34}" y2="94" stroke="#cbd5e1"></line>${setTotalsSvg}<text class="side-title" x="${rightX}" y="${exactY}">Exact regions</text><line x1="${rightX}" y1="${exactY + 12}" x2="${width - 34}" y2="${exactY + 12}" stroke="#cbd5e1"></line>${exactSvg}<text class="note" x="32" y="${height - 26}">${escapeXml(note)}</text></svg>`;
}
