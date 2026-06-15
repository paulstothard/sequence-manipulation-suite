import "../vendor/d3/d3.min.js";
import { escapeXml } from "./plot-renderer.js";
import { englishStopWords } from "../reference-data/text-stop-words/english.js";

const DEFAULT_STOP_WORDS = new Set(englishStopWords);

const COLORS = ["#2563eb", "#0f766e", "#a33a3a", "#7c3aed", "#d97706", "#0369a1", "#be123c", "#475569"];
const WORD_CLOUD_FOUNDATION = "sms3-word-cloud-svg";

function getD3() {
  return globalThis.d3 ?? null;
}

export const wordCloudColumns = [
  { id: "rank", label: "Rank", type: "number" },
  { id: "word", label: "Word", type: "string" },
  { id: "count", label: "Count", type: "number" },
  { id: "frequency_percent", label: "Frequency %", type: "number" }
];

function parseStopWords(value) {
  const extra = String(value ?? "")
    .split(/[\s,]+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_STOP_WORDS, ...extra]);
}

function tokenize(text, options = {}) {
  const lowerCase = options.caseSensitive === true ? String(text ?? "") : String(text ?? "").toLowerCase();
  return lowerCase.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
}

function overlaps(box, boxes, padding = 2) {
  return boxes.some((other) =>
    box.x < other.x + other.width + padding &&
    box.x + box.width + padding > other.x &&
    box.y < other.y + other.height + padding &&
    box.y + box.height + padding > other.y
  );
}

function withinBounds(box, width, height, margin = 16) {
  return box.x >= margin &&
    box.y >= margin &&
    box.x + box.width <= width - margin &&
    box.y + box.height <= height - margin;
}

function hashWord(word, salt = 0) {
  let hash = 2166136261 ^ salt;
  for (const char of String(word ?? "")) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unitHash(word, salt = 0) {
  return hashWord(word, salt) / 0xffffffff;
}

function wordRotation(row) {
  if (row.rank <= 8) return 0;
  const roll = unitHash(row.word, row.rank * 17);
  const shouldRotate = row.rank % 4 === 1 || roll < 0.14 || roll > 0.86;
  if (!shouldRotate) return 0;
  return unitHash(row.word, row.rank * 31) < 0.5 ? -90 : 90;
}

function placeWords(rows, options = {}) {
  const width = Number(options.width ?? 900) || 900;
  const height = Number(options.height ?? 560) || 560;
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const minCount = Math.min(...rows.map((row) => row.count), maxCount);
  const range = Math.max(1, maxCount - minCount);
  const fontScale = getD3()?.scaleSqrt?.().domain([minCount, maxCount]).range([12, 46]);
  const colorScale = getD3()?.scaleOrdinal?.(COLORS);
  const boxes = [];
  const placed = [];
  const centerX = width / 2;
  const centerY = height / 2 + 16;

  for (const [index, row] of rows.entries()) {
    const weight = (row.count - minCount) / range;
    const fontSize = Math.round(fontScale ? fontScale(row.count) : 12 + Math.sqrt(weight || (rows.length === 1 ? 1 : 0.08)) * 34);
    const baseTextWidth = Math.max(12, row.word.length * fontSize * 0.58);
    const baseTextHeight = fontSize * 1.05;
    const rotation = wordRotation(row);
    const textWidth = rotation === 0 ? baseTextWidth : baseTextHeight;
    const textHeight = rotation === 0 ? baseTextHeight : baseTextWidth;
    let placedBox = null;
    const initialAngle = unitHash(row.word, index + 23) * Math.PI * 2;
    const offsetRadius = row.rank <= 3 ? 0 : 5 + unitHash(row.word, index + 71) * Math.min(width, height) * 0.06;
    const startX = centerX + Math.cos(initialAngle) * offsetRadius;
    const startY = centerY + Math.sin(initialAngle) * offsetRadius * 0.72;

    for (let step = 0; step < 3200; step += 1) {
      const angle = initialAngle + step * 0.34;
      const radius = 3.8 * Math.sqrt(step);
      const x = startX + Math.cos(angle) * radius - textWidth / 2;
      const y = startY + Math.sin(angle) * radius * 0.78 - textHeight / 2;
      const box = { x, y, width: textWidth, height: textHeight };
      if (withinBounds(box, width, height) && !overlaps(box, boxes)) {
        placedBox = box;
        break;
      }
    }

    if (!placedBox) continue;
    boxes.push(placedBox);
    placed.push({
      ...row,
      centerX: Number((placedBox.x + placedBox.width / 2).toFixed(2)),
      centerY: Number((placedBox.y + placedBox.height / 2).toFixed(2)),
      fontSize,
      rotation,
      color: colorScale ? colorScale(row.word) : COLORS[index % COLORS.length]
    });
  }

  return { placed, omitted: rows.length - placed.length, width, height };
}

export function makeWordCloud(input, options = {}) {
  const warnings = [];
  const stopWords = parseStopWords(options.extraStopWords);
  const minLength = Math.max(1, Number.parseInt(options.minimumWordLength ?? 3, 10) || 3);
  const maxWords = Math.max(5, Math.min(250, Number.parseInt(options.maxWords ?? 80, 10) || 80));
  const counts = new Map();

  for (const token of tokenize(input, options)) {
    const cleaned = token.replace(/^[-']+|[-']+$/g, "");
    if (cleaned.length < minLength || stopWords.has(cleaned.toLowerCase())) continue;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const rows = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxWords)
    .map(([word, count], index) => ({
      rank: index + 1,
      word,
      count,
      frequency_percent: total > 0 ? Number(((count / total) * 100).toFixed(4)) : 0
    }));

  if (counts.size > maxWords) {
    warnings.push(`Only the top ${maxWords} word(s) were included in the cloud/table.`);
  }
  if (rows.length === 0) {
    warnings.push("No words remained after tokenization, stop-word filtering, and minimum-length filtering.");
  }

  const svg = renderWordCloudSvg(rows, warnings, options);
  return { rows, warnings, svg, totalWords: total, uniqueWords: counts.size };
}

export function renderWordCloudSvg(rows, warnings = [], options = {}) {
  const title = String(options.title ?? "Word cloud");
  const { placed, omitted, width, height } = placeWords(rows, options);
  const wordElements = placed.map((row) => {
    const transform = row.rotation === 0 ? "" : ` transform="rotate(${row.rotation} ${row.centerX} ${row.centerY})"`;
    return `<text class="word-cloud-word" data-word-cloud-word="true" data-count="${row.count}" data-rotation="${row.rotation}" x="${row.centerX}" y="${row.centerY}"${transform} text-anchor="middle" style="font-size:${row.fontSize}px;font-weight:${row.rank <= 5 ? 700 : 500};fill:${row.color}"><title>${escapeXml(`${row.word}: ${row.count}`)}</title>${escapeXml(row.word)}</text>`;
  }).join("");
  const note = rows.length === 0
    ? warnings[0] ?? "No words to draw."
    : `Showing ${placed.length} of ${rows.length} ranked word(s)${omitted > 0 ? `; ${omitted} omitted by layout` : ""}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}" data-plot-foundation="${WORD_CLOUD_FOUNDATION}" data-plot-backend="d3" data-plot-renderer="sms3-d3">
  <style>[data-plot-foundation="${WORD_CLOUD_FOUNDATION}"] text{font-family:Inter,Arial,sans-serif;stroke:none!important;stroke-width:0!important;text-shadow:none!important;paint-order:normal!important}[data-plot-foundation="${WORD_CLOUD_FOUNDATION}"] .word-cloud-word{dominant-baseline:middle}</style>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="28" y="34" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>
  <text x="28" y="56" font-family="Inter, Arial, sans-serif" font-size="12" fill="#475569">${escapeXml(note)}</text>
  <g font-family="Inter, Arial, sans-serif">${wordElements}</g>
</svg>`;
}

export function wordCloudRowsToTsv(rows) {
  return [
    wordCloudColumns.map((column) => column.id).join("\t"),
    ...rows.map((row) => wordCloudColumns.map((column) => String(row[column.id] ?? "").replaceAll("\t", " ")).join("\t"))
  ].join("\n") + "\n";
}
