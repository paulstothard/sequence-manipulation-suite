import { geneFeatureClass, GENE_FEATURE_STYLES } from './gene-viewer-feature-style.js';

const FEATURE_TYPE_COLORS = new Map([
  ["CDS", "#2563eb"],
  ["gene", "#16a34a"],
  ["source", "#64748b"],
  ["tRNA", "#7c3aed"],
  ["rRNA", "#d97706"],
  ["misc_feature", "#0f766e"],
  ["repeat_region", "#db2777"],
  ["mobile_element", "#c2410c"],
  ["regulatory", "#0891b2"],
  ["promoter", "#9333ea"],
  ["terminator", "#be123c"],
  ["primer_bind", "#059669"],
  ["SNV", "#2563eb"],
  ["MNV", "#0891b2"],
  ["insertion", "#16a34a"],
  ["deletion", "#dc2626"],
  ["indel", "#d97706"],
  ["multi-allelic", "#7c3aed"]
]);
const FEATURE_TYPE_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#0f766e",
  "#c2410c"
];
export function getViewerItemTypeKey(item) {
  const value = item?.featureType || item?.type || item?.feature || item?.className || item?.kind || "item";
  return String(value).replace(/\s+/g, " ").trim() || "item";
}

export function getViewerFeatureTypeColor(item, fallback = '#2563eb') {
  const direct = item?.color || item?.stroke || item?.fillColor;
  const type = getViewerItemTypeKey(item);
  return direct || GENE_FEATURE_STYLES[geneFeatureClass(type)]?.color || FEATURE_TYPE_COLORS.get(type) || FEATURE_TYPE_PALETTE[hashString(type) % FEATURE_TYPE_PALETTE.length] || fallback;
}

// Use the exact same type and explicit-color precedence as the interval renderer.
// Digest, restriction and quantitative tracks have their own track color semantics.
export function viewerFeatureLegend(tracks = []) {
  const entries = new Map();
  for (const track of tracks) {
    if (['digest-fragments', 'restriction-sites', 'quantitative'].includes(track.type)) continue;
    for (const item of track.items ?? []) {
      const type = getViewerItemTypeKey(item);
      const color = getViewerFeatureTypeColor(item);
      const modelStyle = GENE_FEATURE_STYLES[geneFeatureClass(type)];
      const style = modelStyle?.color === color ? modelStyle : { label: type, color, height: 10 };
      const key = `${style.label}\0${color}`;
      if (!entries.has(key)) entries.set(key, { ...style, types: new Set() });
      entries.get(key).types.add(type);
    }
  }
  const priority = label => label === GENE_FEATURE_STYLES.transcript.label ? 0 : label === GENE_FEATURE_STYLES.protein.label ? 1 : 2;
  return [...entries.values()].sort((a, b) => priority(a.label) - priority(b.label) || a.label.localeCompare(b.label) || a.color.localeCompare(b.color))
    .map(entry => ({ ...entry, types: [...entry.types].sort() }));
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}
