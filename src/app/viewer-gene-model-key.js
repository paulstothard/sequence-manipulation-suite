import { viewerFeatureLegend } from '../core/viewer-feature-style.js';

const legends = new WeakMap();
export function getViewerFeatureLegend(record) {
  // Derive from source items even when an older adapter supplies a partial legend.
  if (!legends.has(record)) legends.set(record, viewerFeatureLegend(record.tracks));
  return legends.get(record);
}

export function createViewerGeneModelKey(record) {
  const entries = getViewerFeatureLegend(record);
  if (!entries.length) return null;
  const key = document.createElement('span');
  // The canvas already draws the visual legend, including in image exports.
  // Keep its text equivalent available to assistive technology without a
  // duplicate legend in the toolbar.
  key.className = 'dna-viewer-gene-model-key visually-hidden';
  key.setAttribute('role', 'group');
  key.setAttribute('aria-label', 'Feature colors');
  key.title = 'Colors for annotation types in this record; some types share a color. In transcript models, UTRs are thin, CDS blocks are thick, and lines join introns.';
  for (const entry of entries) {
    const label = document.createElement('span'), swatch = document.createElement('i');
    label.title = entry.types.join(', ');
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.backgroundColor = entry.color;
    swatch.style.height = `${entry.height}px`;
    label.append(swatch, document.createTextNode(entry.label)); key.append(label);
  }
  return key;
}

// Share canvas geometry with live output and both image exporters. Long custom
// annotation names wrap too; no entry is silently dropped to fit a fixed footer.
export function layoutViewerFeatureLegend(ctx, record, width, left = 12) {
  ctx.save();
  ctx.font = '10px system-ui, sans-serif';
  const right = width - 12, available = Math.max(1, right - left), placements = [];
  let x = left, y = 0, rowHeight = 20;
  for (const entry of getViewerFeatureLegend(record)) {
    const lines = [];
    let line = '';
    for (const char of entry.label) {
      if (line && ctx.measureText(line + char).width > available - 18) { lines.push(line); line = ''; }
      line += char;
    }
    if (line) lines.push(line);
    const entryWidth = Math.min(available, 18 + Math.max(0, ...lines.map(text => ctx.measureText(text).width)));
    if (x > left && x + entryWidth > right) { x = left; y += rowHeight; rowHeight = 20; }
    const height = Math.max(20, lines.length * 14 + 6);
    placements.push({ entry, lines, x, y: y + 10 });
    rowHeight = Math.max(rowHeight, height);
    x += entryWidth + 14;
  }
  ctx.restore();
  return { placements, height: placements.length ? y + rowHeight : 0 };
}

export function drawViewerFeatureLegend(ctx, layout, top, theme) {
  ctx.save();
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (const { entry, lines, x, y } of layout.placements) {
    ctx.fillStyle = entry.color;
    ctx.fillRect(x, top + y - entry.height / 2, 12, entry.height);
    ctx.fillStyle = theme.muted;
    lines.forEach((text, index) => ctx.fillText(text, x + 18, top + y + index * 14));
  }
  ctx.restore();
}
