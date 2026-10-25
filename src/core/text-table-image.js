import { connectorSvg, annotationShapeSvg, validateAnnotationAppearance } from "./annotation-geometry.js";
import { detectDelimiter, parseDelimitedRows } from './table.js';
import { IMAGE_FONTS } from './image-fonts.js';
import { isImageColor, colorOpacity, withColorOpacity } from './image-colors.js';
export { IMAGE_FONTS } from './image-fonts.js';

export const IMAGE_LIMITS = Object.freeze({ characters: 100000, lines: 120, columns: 200, rows: 60, tableColumns: 12, cells: 600, cellCharacters: 1000, annotations: 100, dimension: 2400, area: 2000000 });
const fail = message => { throw new Error(message); };
const number = (value, min, max, name) => Number.isFinite(value) && value >= min && value <= max ? value : fail(`Invalid ${name}.`);
const color = value => isImageColor(value) ? value : fail('Invalid image color.');
// Version-one documents may still carry the former transparent-background flag.
export const imageBackgroundColor = style => style.transparent ? withColorOpacity(style.background, 0) : style.background;
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const clone = value => structuredClone(value);
const numeric = value => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());

export function parseImageSource(text, mode = 'text', options = {}) {
  if (typeof text !== 'string' || text.length > IMAGE_LIMITS.characters) fail('Input exceeds 100,000 characters. Select a smaller passage or table.');
  if (!text.trim()) fail('Paste text or a table to create an image.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text) || (text.isWellFormed && !text.isWellFormed())) fail('Input contains unsupported control characters.');
  if (mode === 'text') {
    const oversize = () => fail('Text images support up to 120 lines and 200 characters per line. Select a smaller passage.');
    const physicalLines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    if (physicalLines.length > IMAGE_LIMITS.lines) oversize();
    const lines = physicalLines.map(line => {
      let expanded = '', columns = 0;
      for (const c of line) {
        const advance = c === '\t' ? 4 - columns % 4 : 1;
        columns += advance;
        if (columns > IMAGE_LIMITS.columns) oversize();
        expanded += c === '\t' ? ' '.repeat(advance) : c;
      }
      return expanded;
    });
    return { mode, lines, warnings: text.includes('\t') ? ['Tabs are displayed at four-character tab stops; the source download preserves the original tabs.'] : [] };
  }
  if (mode !== 'table') fail('Choose Text or Table input.');
  const delimiter = options.delimiter ?? 'auto';
  if (!['auto', 'tab', 'comma', 'semicolon', 'pipe'].includes(delimiter)) fail('Unsupported table delimiter.');
  const separator = delimiter === 'auto' ? detectDelimiter(text).delimiter : { tab: '\t', comma: ',', semicolon: ';', pipe: '|' }[delimiter];
  const { rows, warnings } = parseDelimitedRows(text.replace(/\r\n?/g, '\n'), separator);
  if (warnings.length) fail(`Check the table quoting: ${warnings[0]}`);
  const width = rows[0]?.length ?? 0;
  if (!width || !rows.length) fail('The table is empty.');
  if (rows.some(row => row.length !== width)) fail('Every table row must have the same number of cells. Check the delimiter and quoted cells.');
  if (rows.length > IMAGE_LIMITS.rows || width > IMAGE_LIMITS.tableColumns || rows.length * width > IMAGE_LIMITS.cells) fail('Table images support up to 60 rows including the header, 12 columns, and 600 cells. Select a smaller table.');
  if (rows.some(row => row.some(cell => cell.length > IMAGE_LIMITS.cellCharacters))) fail('A table cell exceeds 1,000 characters. Shorten the cell before creating an image.');
  return { mode, rows, warnings: [], separator };
}

export function createImageState(text, options = {}) {
  const mode = options.inputMode ?? 'text';
  parseImageSource(text, mode, options);
  return { version: 1, mode, text, delimiter: options.delimiter ?? 'auto', hasHeader: options.hasHeader !== false,
    style: { font: mode === 'text' ? 'mono' : 'sans', fontSize: 16, lineSpacing: 1.4, padding: 32, foreground: '#18232c', background: '#ffffff', headerFill: '#e8edf2', ruleColor: '#b8c2cc', rules: 'horizontal', cellPadding: 10, maxColumnWidth: 320, columnWidths: {}, columnAlignments: {}, columnFonts: {}, columnFontSizes: {} }, annotations: [] };
}

export function validateImageState(state) {
  if (!state || state.version !== 1 || typeof state.hasHeader !== 'boolean') fail('Unsupported image document.');
  const parsed = parseImageSource(state.text, state.mode, state);
  const s = state.style;
  if (!s || !Object.hasOwn(IMAGE_FONTS, s.font) || !['none', 'horizontal', 'grid'].includes(s.rules) || (s.transparent !== undefined && typeof s.transparent !== 'boolean')) fail('Invalid image style.');
  for (const [key, min, max] of [['fontSize', 10, 40], ['lineSpacing', 1.1, 2.5], ['padding', 8, 120], ['cellPadding', 4, 30], ['maxColumnWidth', 80, 500]]) number(s[key], min, max, key);
  for (const key of ['foreground', 'background', 'headerFill', 'ruleColor']) color(s[key]);
  for (const key of ['columnWidths', 'columnAlignments']) {
    if (!s[key] || typeof s[key] !== 'object' || Array.isArray(s[key]) || Object.keys(s[key]).length > IMAGE_LIMITS.tableColumns) fail('Invalid column settings.');
    for (const [index, value] of Object.entries(s[key])) {
      if (!/^\d+$/.test(index) || +index >= IMAGE_LIMITS.tableColumns) fail('Invalid column index.');
      if (key === 'columnWidths') number(value, 60, 600, 'column width');
      else if (!['auto', 'left', 'center', 'right'].includes(value)) fail('Invalid column alignment.');
    }
  }
  // Optional maps preserve compatibility with previously saved image documents.
  for (const key of ['columnFonts', 'columnFontSizes']) {
    if (s[key] === undefined) continue;
    if (!s[key] || typeof s[key] !== 'object' || Array.isArray(s[key]) || Object.keys(s[key]).length > IMAGE_LIMITS.tableColumns) fail('Invalid column typography.');
    for (const [index, value] of Object.entries(s[key])) {
      if (!/^\d+$/.test(index) || +index >= IMAGE_LIMITS.tableColumns) fail('Invalid column index.');
      if (key === 'columnFontSizes') number(value, 10, 40, 'column font size');
      else if (!Object.hasOwn(IMAGE_FONTS, value)) fail('Invalid column font.');
    }
  }
  if (!Array.isArray(state.annotations) || state.annotations.length > IMAGE_LIMITS.annotations) fail('Images support up to 100 annotations.');
  const ids = new Set();
  for (const a of state.annotations) {
    if (!a || !/^[a-z0-9-]{1,80}$/i.test(a.id) || ids.has(a.id) || !['box', 'ellipse', 'highlight', 'arrow', 'pointer', 'line', 'label'].includes(a.type)) fail('Invalid image annotation.');
    ids.add(a.id); color(a.color); validateAnnotationAppearance(a);
    if (a.strokeWidth !== undefined) number(a.strokeWidth, .1, 100, 'line width');
    if (a.opacity !== undefined) number(a.opacity, 0, 1, 'opacity');
    if (a.fill !== undefined) color(a.fill);
    for (const key of ['flipX', 'flipY']) if (a[key] !== undefined && typeof a[key] !== 'boolean') fail('Invalid annotation direction.');
    for (const k of ['x', 'y', 'w', 'h']) number(a[k], 0, 1, `annotation ${k}`);
    if (a.x + a.w > 1.000001 || a.y + a.h > 1.000001) fail('Annotation extends beyond the image.');
    number(a.fontSize, 10, 40, 'annotation font size');
    if (a.cornerRadius !== undefined) number(a.cornerRadius, 0, 100, 'corner radius');
    for (const key of ['bendX', 'bendY']) if (a[key] !== undefined) number(a[key], -1, 1, 'connector bend');
    if (a.font !== undefined && !Object.hasOwn(IMAGE_FONTS, a.font)) fail('Invalid annotation font.');
    if (typeof a.text !== 'string' || a.text.length > 200 || (a.text.isWellFormed && !a.text.isWellFormed()) || /[\u0000-\u001f\ufffe\uffff]/u.test(a.text)) fail('Annotation labels support one line of up to 200 characters.');
    if (a.anchor != null) {
      if (!['box', 'highlight'].includes(a.type)) fail('Only boxes and highlights can be attached to source content.');
      const { row, start, end, column } = a.anchor;
      if (!Number.isInteger(row) || row < 1 || row > (parsed.lines ?? parsed.rows).length) fail('The annotation refers to a missing source row.');
      if (state.mode === 'text') {
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > Array.from(parsed.lines[row - 1]).length) fail('The annotation refers to missing text characters.');
      } else if (!Number.isInteger(column) || column < 1 || column > parsed.rows[0].length) fail('The annotation refers to a missing table cell.');
    }
  }
  return state;
}

export function layoutImage(state, measure) {
  validateImageState(state);
  const source = parseImageSource(state.text, state.mode, state), s = state.style;
  // Browser callers supply TextMetrics; numeric width callbacks remain valid.
  const metricsOf = (text, bold = false, fontSize = s.fontSize, font = s.font) => measure?.(text, font, fontSize, bold);
  const widthOf = (text, bold = false, fontSize = s.fontSize, font = s.font) => {
    const metrics = metricsOf(text, bold, fontSize, font);
    return metrics?.width ?? metrics ?? Array.from(text).reduce((n, c) => n + (c.codePointAt(0) > 255 ? 1 : IMAGE_FONTS[font].monospace ? .61 : .7), 0) * fontSize;
  };
  const lineHeight = s.fontSize * s.lineSpacing;
  const items = [], cells = [];
  let width, height;
  if (state.mode === 'text') {
    width = Math.max(160, ...source.lines.map(line => widthOf(line))) + 2 * s.padding;
    height = source.lines.length * lineHeight + 2 * s.padding;
    source.lines.forEach((text, i) => items.push({ text, x: s.padding, y: s.padding + i * lineHeight + s.fontSize, bold: false, anchor: 'start' }));
  } else {
    const rows = source.rows, pad = s.cellPadding;
    const typography = rows[0].map((_, col) => {
      const font = s.columnFonts?.[col] ?? s.font, fontSize = s.columnFontSizes?.[col] ?? s.fontSize;
      return { font, fontSize, lineHeight: fontSize * s.lineSpacing };
    });
    const cellWidth = (text, col, bold) => widthOf(text, bold, typography[col].fontSize, typography[col].font);
    const widths = rows[0].map((_, col) => s.columnWidths[col] ?? Math.max(64, Math.min(s.maxColumnWidth, Math.max(...rows.map((row, i) => Math.max(...row[col].split('\n').map(line => cellWidth(line, col, state.hasHeader && i === 0))))) + 2 * pad)));
    for (let c = 0; c < widths.length; c++) {
      let widest = 0;
      rows.forEach((row, r) => { for (const char of row[c]) if (char !== '\n') widest = Math.max(widest, cellWidth(char, c, state.hasHeader && r === 0)); });
      if (widths[c] < widest + 2 * pad) fail(`Column ${c + 1} is too narrow for this font and cell padding. Increase its width or reduce the font size or padding.`);
    }
    const wrap = (text, maxWidth, bold, col) => {
      const lines = [];
      for (const physical of text.split('\n')) {
        let current = '';
        for (const char of Array.from(physical)) {
          if (current && cellWidth(current + char, col, bold) > maxWidth) { lines.push(current); current = ''; }
          current += char;
        }
        lines.push(current);
      }
      return lines;
    };
    let y = s.padding;
    const baselineSize = Math.max(...typography.map(t => t.fontSize));
    rows.forEach((row, r) => {
      const bold = state.hasHeader && r === 0;
      const wrapped = row.map((cell, c) => wrap(cell, widths[c] - 2 * pad, bold, c));
      // Align the first baselines across columns, then leave enough height for
      // each column's own font size and wrapped lines.
      const h = Math.max(...wrapped.map((lines, c) => baselineSize - typography[c].fontSize + lines.length * typography[c].lineHeight)) + 2 * pad;
      let x = s.padding;
      row.forEach((text, c) => {
        const setting = s.columnAlignments[c] ?? 'auto';
        const values = rows.slice(state.hasHeader ? 1 : 0).map(row => row[c]).filter(v => v.trim());
        const align = setting === 'auto' ? (values.length && values.every(numeric) ? 'right' : 'left') : setting;
        cells.push({ row: r + 1, column: c + 1, x, y, w: widths[c], h, header: bold, text });
        const { font, fontSize, lineHeight: cellLineHeight } = typography[c];
        wrapped[c].forEach((line, i) => items.push({ text: line, x: align === 'right' ? x + widths[c] - pad : align === 'center' ? x + widths[c] / 2 : x + pad, y: y + pad + baselineSize + i * cellLineHeight, font, fontSize, bold, anchor: align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start' }));
        x += widths[c];
      });
      y += h;
    });
    width = widths.reduce((a, b) => a + b, 0) + 2 * s.padding;
    height = y + s.padding;
  }
  width = Math.ceil(width); height = Math.ceil(height);
  if (width > IMAGE_LIMITS.dimension || height > IMAGE_LIMITS.dimension || width * height > IMAGE_LIMITS.area) fail('The image exceeds 2,400 pixels per side or 2 million layout pixels. Reduce the content, font size, spacing, or column widths.');
  const annotations = state.annotations.map(a => {
    let box = { x: a.x * width, y: a.y * height, w: a.w * width, h: a.h * height };
    if (a.anchor) {
      if (state.mode === 'table') { const cell = cells.find(c => c.row === a.anchor.row && c.column === a.anchor.column); box = { x: cell.x, y: cell.y, w: cell.w, h: cell.h }; }
      else {
        const chars = Array.from(source.lines[a.anchor.row - 1]);
        const selectedText = chars.slice(a.anchor.start - 1, a.anchor.end).join('');
        const metrics = metricsOf(selectedText);
        const hasInk = (metrics?.actualBoundingBoxAscent + metrics?.actualBoundingBoxDescent) > 0;
        const ascent = hasInk ? metrics.actualBoundingBoxAscent : s.fontSize * .8;
        const descent = hasInk ? metrics.actualBoundingBoxDescent : s.fontSize * .2;
        // Center on the glyphs, not the line advance, with equal breathing room
        // above and below. Line spacing still determines the row's baseline.
        const padding = s.fontSize * .15;
        const baseline = s.padding + (a.anchor.row - 1) * lineHeight + s.fontSize;
        box = { x: s.padding + widthOf(chars.slice(0, a.anchor.start - 1).join('')), y: baseline - ascent - padding, w: widthOf(selectedText), h: ascent + descent + 2 * padding };
      }
    }
    if (a.type === 'label') {
      box.w = widthOf(a.text || 'Label', false, a.fontSize, a.font ?? s.font); box.h = a.fontSize * 1.3;
      if (box.x + box.w > width || box.y + box.h > height) fail('A label extends beyond the image. Move it inward, shorten it, or reduce its font size.');
    }
    return { ...a, ...box, bendX: (a.bendX ?? 0) * width, bendY: (a.bendY ?? 0) * height };
  });
  return { width, height, items, cells, annotations, source, style: clone(s) };
}

export function renderImageSvg(state, layout = layoutImage(state)) {
  const { width, height, style: s, cells, items, annotations } = layout;
  const text = (value, x, y, size, bold = false, anchor = 'start', fill = s.foreground, font = s.font) => `<text x="${x}" y="${y}" font-family="${xml(IMAGE_FONTS[font].family)}" font-size="${size}" font-weight="${bold ? 700 : 400}" text-anchor="${anchor}" fill="${fill}" xml:space="preserve" style="white-space:pre;font-variant-ligatures:none;font-kerning:none">${xml(value)}</text>`;
  const shape = a => {
    const { x, y, w, h } = a;
    if (a.type === 'label') return text(a.text || 'Label', x, y + a.fontSize, a.fontSize, false, 'start', a.color, a.font ?? s.font);
    if (a.type === 'box' || a.type === 'ellipse') return annotationShapeSvg(a);
    if (a.type === 'highlight') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${a.color}" fill-opacity="0.25" opacity="${a.opacity ?? 1}" stroke="none"/>`;
    return connectorSvg(a);
  };
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${state.mode === 'table' ? 'Table' : 'Text'} image" data-text-table-image="true">`,
    `<title>${state.mode === 'table' ? 'Table' : 'Text'} image</title>`,
    colorOpacity(imageBackgroundColor(s)) === 0 ? '' : `<rect width="${width}" height="${height}" fill="${imageBackgroundColor(s)}"/>`,
    ...cells.filter(c => c.header).map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${s.headerFill}"/>`),
    ...annotations.filter(a => a.type === 'highlight').map(a => `<g data-annotation="${a.id}">${shape(a)}</g>`),
    ...items.map(item => text(item.text, item.x, item.y, item.fontSize ?? s.fontSize, item.bold, item.anchor, s.foreground, item.font ?? s.font)),
    ...cells.filter(c => s.rules !== 'none').map(c => s.rules === 'grid' ? `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="none" stroke="${s.ruleColor}" stroke-width="1"/>` : `<line x1="${c.x}" x2="${c.x + c.w}" y1="${c.y + c.h}" y2="${c.y + c.h}" stroke="${s.ruleColor}" stroke-width="1"/>`),
    ...annotations.filter(a => a.type !== 'highlight').map(a => `<g data-annotation="${a.id}">${shape(a)}</g>`), '</svg>'].join('\n');
}
