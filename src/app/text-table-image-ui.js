import { createAnnotationStyleControls } from "./annotation-style-controls.js";
import { isConnector, annotationFillStyle, connectorGeometry, snapSquare, snapTranslation, moveConnectorHandle } from "../core/annotation-geometry.js";
import { appendConnectorControls, appendSnapGuide, annotationControl, alignmentTargets } from "./annotation-controls.js";
import { IMAGE_FONTS, IMAGE_LIMITS, imageToolId, validateImageState, layoutImage, renderImageSvg, imageBackgroundColor } from '../core/text-table-image.js';
import { colorOpacity, annotationColor, setAnnotationColor, normalizeAnnotationFill } from '../core/image-colors.js';
import { createCanvasLabelEditor } from './canvas-label-editor.js';
import { createImageColorSampler } from './image-color-sampler.js';
import { createImageEditorNavigation, imageEditorHandleSize } from './image-editor-navigation.js';
import { bindImageEditorDeletion } from './image-editor-shortcuts.js';
import { createEditorSession } from './editor-session.js';
import { installControlHelp } from './control-help.js';
import { downloadText } from './file-download.js';
import { downloadSvgAsPng } from './svg-export.js';
import { copyTextWithFeedback } from './copy-feedback.js';
import { loadImageFonts, embedImageFonts } from './image-fonts.js';
import { createColorPicker } from './color-picker.js';

// Small, consistent drawing controls; keep source content out of icon markup.
const ICONS = {
  box: '<rect x="4" y="5" width="16" height="14" rx="3"/>',
  arrow: '<path d="M4 20 20 4M9 4h11v11"/>',
  line: '<path d="m5 19 14-14"/>',
  pointer: '<path d="m5 19 12-12"/><circle cx="18" cy="6" r="2" fill="currentColor"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  label: '<path d="M5 7V4h14v3M12 4v16M8 20h8"/>',
  duplicate: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  remove: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/>'
};

let measurementContext;
export function measureImageText(text, font, size, bold) {
  measurementContext ??= document.createElement('canvas').getContext('2d');
  measurementContext.font = `${bold ? '700' : '400'} ${size}px ${IMAGE_FONTS[font].family}`;
  measurementContext.fontKerning = 'none';
  return measurementContext.measureText(text);
}

export async function renderTextTableImage(container, source, editorDocument, options = {}) {
  const loading = document.createElement('div');
  loading.setAttribute('role', 'status');
  loading.textContent = 'Loading image fonts…';
  container.append(loading);
  let disposed = false;
  container._sms3VisualCleanup = () => { disposed = true; };
  try {
    await loadImageFonts();
  } catch (error) {
    if (disposed || !loading.isConnected) return;
    loading.textContent = error.message;
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry loading fonts';
    retry.addEventListener('click', () => { loading.remove(); renderTextTableImage(container, source, editorDocument, options); });
    loading.append(retry);
    return;
  }
  if (disposed || !loading.isConnected) return;
  try {
    // Reject an oversize recovered document before mounting any editor controls.
    layoutImage(editorDocument?.state?.image ?? source.image, measureImageText);
    renderReadyImage(container, source, editorDocument, options);
    loading.remove();
  } catch (error) {
    loading.textContent = error.message;
  }
}

function renderReadyImage(container, source, editorDocument, { preview = false } = {}) {
  let state = structuredClone(validateImageState(editorDocument?.state?.image ?? source.image));
  state.annotations.forEach(a => normalizeAnnotationFill(a));
  let selected = '', session, layout, exportedSvg, drag, snapGuide;
  const editorId = `tti-${crypto.randomUUID()}`;
  const make = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
  const root = make('section', undefined, 'text-table-image-editor'); root.setAttribute('aria-label', state.mode === 'table' ? 'Table to Image editor' : 'Text to Image editor');
  const header = make('header', undefined, 'tti-header');
  const titlebar = make('div', undefined, 'tti-titlebar');
  titlebar.append(make('div', state.mode === 'text' ? 'Text image' : 'Table image', 'tti-title'));
  const exports = make('div', undefined, 'tti-exports'); titlebar.append(exports);
  const history = make('div', undefined, 'tti-history'); header.append(titlebar, history);
  const toolbar = make('div', undefined, 'tti-tools'); toolbar.setAttribute('role', 'group'); toolbar.setAttribute('aria-label', 'Annotation tools');
  const message = make('div', '', 'tti-message'); message.setAttribute('role', 'status');
  const status = make('span', '', 'tti-dimensions');
  const body = make('div', undefined, 'tti-workspace');
  const stage = make('div', undefined, 'tti-stage');
  const viewport = make('div', undefined, 'tti-viewport'); viewport.tabIndex = 0; viewport.setAttribute('aria-label', 'Image preview');
  // SVG <style> elements elsewhere on the page are document-wide. Isolate the
  // artwork just like SVG Editor so its measured fonts and paints stay intact.
  const artwork = make('div', undefined, 'tti-artwork');
  const shadow = artwork.attachShadow({ mode: 'open' });
  const drawingStyle = make('style');
  drawingStyle.textContent = `
    .tti-picture { min-width:0; line-height:0; }
    svg { display:block; margin:auto; overflow:hidden; box-shadow:0 1px 5px rgb(0 0 0 / .12); background:transparent; user-select:none; -webkit-user-select:none; touch-action:none; }
    .tti-hit { cursor:move; touch-action:none; }
    .tti-selection { stroke:#2196f3; stroke-width:4; opacity:.65; filter:blur(2px); vector-effect:non-scaling-stroke; }
    .tti-resize { fill:#fff; stroke:#007bce; stroke-width:2; cursor:nwse-resize; touch-action:none; }
  `;
  const picture = make('div', undefined, 'tti-picture');
  shadow.append(drawingStyle, picture); viewport.append(artwork);
  const colorSampler = createImageColorSampler(viewport, {
    image: () => picture.querySelector('svg'),
    render: () => embedImageFonts(exportedSvg, layout),
    size: () => ({ width:layout.width, height:layout.height }),
  });
  const viewbar = make('div', undefined, 'tti-viewbar'); viewbar.append(status);
  const controls = make('div', undefined, 'tti-controls');
  const tabs = make('div', undefined, 'tti-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Image settings');
  const panelStack = make('div', undefined, 'tti-panels');
  const panes = {};
  root.append(header, message, body); body.append(stage, controls); stage.append(toolbar, viewport, viewbar); controls.append(tabs, panelStack); container.append(root);
  const disposeToolbarHelp = installControlHelp(toolbar, { compact:true });
  const button = (name, action, parent = toolbar) => { const b = make('button', name); b.type = 'button'; b.addEventListener('click', () => Promise.resolve().then(action).catch(e => { message.textContent = e.message; })); parent.append(b); return b; };
  const iconButton = (name, icon, text, action, parent = toolbar) => {
    const b = button('', action, parent); b.className = 'tti-icon-button'; b.title = name; b.setAttribute('aria-label', name);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
    if (toolbar.contains(parent)) {
      b.removeAttribute('title');
      b.dataset.controlHelp = name;
    } else if (text) b.append(make('span', text));
    return b;
  };
  const group = (title, parent) => {
    const section = make('section', undefined, 'tti-group'); section.append(make('h5', title));
    const content = make('div', undefined, 'tti-group-body'); section.append(content); parent.append(section); return content;
  };
  const pair = parent => { const row = make('div', undefined, 'tti-pair'); parent.append(row); return row; };
  const colorControls = new Map();
  const field = (name, parent, value, choices, type = 'text') => {
    if (type === 'color') {
      const control = createColorPicker(name,value,{ sampleColor:colorSampler.sample }); colorControls.set(control.input,control);
      parent.append(control.element); return control.input;
    }
    const label = make('label', undefined, 'tti-field'); label.append(make('span', name));
    const input = make(choices ? 'select' : type === 'textarea' ? 'textarea' : 'input'); input.setAttribute('aria-label', name);
    if (choices) for (const [v, text] of choices) { const o = make('option', text); o.value = v; input.append(o); }
    else if (type !== 'textarea') input.type = type;
    if (type === 'checkbox') { input.checked = value; label.prepend(input); }
    else { input.value = value; label.append(input); }
    parent.append(label); return input;
  };
  const numberField = (name, parent, value, min, max, step = 1) => { const f = field(name, parent, value, null, 'number'); Object.assign(f, { min, max, step }); return f; };
  const measure = measureImageText;
  function change(label, mutator, historyOptions) {
    const next = structuredClone(state);
    try { mutator(next); layoutImage(next, measure); state = next; message.textContent = ''; render(); session?.changed(label,historyOptions); return true; }
    catch (e) { message.textContent = e.message; syncFields(); return false; }
  }
  // The SVG already paints the background; a second fill would compound alpha.
  const pngButton = iconButton('Download PNG', 'download', 'PNG', () => downloadSvgAsPng(embedImageFonts(exportedSvg, layout), `${imageToolId(state.mode)}.png`, { background: null }), exports);
  const svgButton = iconButton('Download SVG', 'download', 'SVG', () => downloadText(embedImageFonts(exportedSvg, layout), `${imageToolId(state.mode)}.svg`, 'image/svg+xml'), exports);
  const zoom = field('Preview size', viewbar, 'fit', [['fit','Fit width'],['1','100%'],['1.5','150%'],['2','200%']]); zoom.addEventListener('change', draw);
  zoom.title = 'Pinch or Ctrl/Command-scroll to zoom. Drag empty canvas space to pan.';
  const navigation = createImageEditorNavigation(viewport, {
    image: () => picture.querySelector('svg'), width: () => layout.width, zoom, redraw: draw,
    editable: event => event.composedPath().some(node => node instanceof Element && node.hasAttribute('data-hit')),
    clearSelection: () => { selected = ''; syncAnnotation(); draw(); },
    cancelEdit: () => { if (drag) { state = drag.before; drag = null; snapGuide = undefined; render(); } },
  });
  function activateTab(name) {
    for (const control of colorControls.values()) control.close();
    for (const [key, pane] of Object.entries(panes)) { pane.hidden = key !== name; pane.inert = key !== name; }
    for (const b of tabs.children) { const active = b.textContent === name; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; }
  }
  for (const name of ['Style', 'Annotations', 'Source']) {
    const pane = make('div', undefined, 'tti-pane'); pane.hidden = pane.inert = name !== 'Style'; pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-label', name);
    const tab = button(name, () => activateTab(name), tabs);
    pane.id = `${editorId}-${name}-pane`; tab.id = `${editorId}-${name}-tab`;
    tab.setAttribute('aria-controls', pane.id); pane.setAttribute('aria-labelledby', tab.id);
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(name === 'Style')); tab.tabIndex = name === 'Style' ? 0 : -1;
    panes[name] = pane; panelStack.append(pane);
  }
  tabs.addEventListener('keydown', e => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return; e.preventDefault(); const buttons = [...tabs.children]; let index = buttons.indexOf(document.activeElement); index = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3; buttons[index].click(); buttons[index].focus(); });
  const fields = {};
  let styleParent = group('Typography', panes.Style);
  function styleField(key, name, choices, type = 'text', min, max, step = 1, parent = styleParent) {
    const f = type === 'number' ? numberField(name, parent, state.style[key], min, max, step) : field(name, parent, state.style[key], choices, type);
    fields[key] = f;
    f.addEventListener(type === 'color' ? 'input' : 'change', event => change(name, s => { s.style[key] = type === 'checkbox' ? f.checked : type === 'number' ? Number(f.value) : f.value; if (key === 'background') delete s.style.transparent; }, event.detail));
    return f;
  }
  const fontChoices = Object.entries(IMAGE_FONTS).map(([key,v]) => [key,v.label]);
  function groupFontChoices(select) {
    for (const [label, matches] of [
      ['Bundled monospace', font => font.files && font.monospace],
      ['Bundled proportional', font => font.files && !font.monospace],
      ['System fonts', font => !font.files]
    ]) {
      const group = make('optgroup'); group.label = label;
      for (const option of [...select.options]) if (IMAGE_FONTS[option.value] && matches(IMAGE_FONTS[option.value])) group.append(option);
      select.append(group);
    }
  }
  styleField('font','Font',fontChoices);
  groupFontChoices(fields.font); fields.font.value = state.style.font;
  fields.font.title = 'Monospace fonts preserve sequence and alignment columns. Bundled fonts are included with SMS3.';
  const typeSizes = pair(styleParent);
  styleField('fontSize','Font size',null,'number',10,40,1,typeSizes);
  styleField('lineSpacing','Line spacing',null,'number',1.1,2.5,.1,typeSizes);
  styleField('foreground','Text color',null,'color');
  styleParent = group('Canvas', panes.Style);
  styleField('padding','Outer padding',null,'number',8,120);
  styleField('background','Background color',null,'color');
  let column, columnWidth, columnAlign, columnFont, columnFontSize;
  if (state.mode === 'table') {
    styleParent = group('Table', panes.Style);
    styleField('headerFill','Header color',null,'color');
    styleField('ruleColor','Border color',null,'color');
    styleField('rules','Borders',[['horizontal','Horizontal rules'],['grid','All cell borders'],['none','None']]);
    styleField('cellPadding','Cell padding',null,'number',4,30);
    styleField('maxColumnWidth','Automatic column width limit',null,'number',80,500);
    const columns = group('Columns', panes.Style);
    column = field('Column', columns, '0', []);
    columnFont = field('Column font', columns, 'inherit', [['inherit','Table default'], ...fontChoices]);
    groupFontChoices(columnFont); columnFont.value = 'inherit';
    columnFontSize = numberField('Column font size', columns, '', 10, 40);
    columnFontSize.title = 'Leave blank to use the table font size.';
    columnFont.addEventListener('change', () => change('Column font', s => {
      s.style.columnFonts ??= {};
      if (columnFont.value === 'inherit') delete s.style.columnFonts[column.value];
      else s.style.columnFonts[column.value] = columnFont.value;
    }));
    columnFontSize.addEventListener('change', () => change('Column font size', s => {
      s.style.columnFontSizes ??= {};
      if (columnFontSize.value === '') delete s.style.columnFontSizes[column.value];
      else s.style.columnFontSizes[column.value] = Number(columnFontSize.value);
    }));
    columns.append(make('p', 'Applies to this column’s header and cells. Leave size blank to use the table size.', 'tti-help'));
    columnWidth = numberField('Column width', columns, 100, 60, 600);
    columnAlign = field('Column alignment', columns, 'auto', [['auto','Automatic'],['left','Left'],['center','Center'],['right','Right']]);
    column.addEventListener('change', syncColumns);
    columnWidth.addEventListener('change', () => change('Column width', s => { s.style.columnWidths[column.value] = Number(columnWidth.value); }));
    columnAlign.addEventListener('change', () => change('Column alignment', s => { s.style.columnAlignments[column.value] = columnAlign.value; }));
    button('Use automatic widths', () => change('Automatic widths', s => { s.style.columnWidths = {}; }), columns);
  }
  function addAnnotation(type) {
    const id = `a-${crypto.randomUUID()}`;
    if (change('Add annotation', s => { s.annotations.push({ id, type, x: .15, y: .15, w: .2, h: .15, text: 'Label', fontSize: 16, color: '#c13b32', fillOpacity:1, cornerRadius: type === 'box' ? 8 : 0, anchor: null }); })) {
      selected = id; activateTab('Annotations'); render();
      if (type === 'label') labelEditor.start(id, true); else viewport.focus({preventScroll:true});
    }
  }
  for (const [type, text] of [['box','Box'],['ellipse','Ellipse'],['pointer','Pointer'],['arrow','Arrow'],['line','Line'],['label','Text']]) {
    iconButton(`Add ${type === 'label' ? 'text label' : type}`, type, text, () => addAnnotation(type));
  }
  const annotationActions = make('div', undefined, 'tti-annotation-actions'); toolbar.append(annotationActions);
  const duplicateButton = iconButton('Duplicate annotation', 'duplicate', '', () => {
    const a = selectedAnnotation(); if (!a) return;
    labelEditor.close();
    const copy = { ...structuredClone(a), id:`a-${crypto.randomUUID()}`, anchor:null };
    const box = layout.annotations.find(item => item.id === a.id);
    for (const [axis, size, extent] of [['x','w',layout.width], ['y','h',layout.height]]) {
      if (a.anchor) { copy[axis] = box[axis] / extent; copy[size] = box[size] / extent; }
      const step = 10 / extent, edge = Math.max(copy[size], box[size] / extent);
      copy[axis] = Math.max(0, Math.min(1 - copy[size], copy[axis] + (copy[axis] + edge + step <= 1 ? step : -step)));
    }
    if (change('Duplicate annotation', s => s.annotations.push(copy))) { selected = copy.id; render(); }
  }, annotationActions);
  function deleteSelection() {
    if (!selected) return;
    labelEditor.close();
    if (change('Delete annotation', s => { s.annotations = s.annotations.filter(a => a.id !== selected); })) {
      selected = ''; render(); viewport.focus({ preventScroll:true });
    }
  }
  const deleteButton = iconButton('Delete annotation', 'remove', '', deleteSelection, annotationActions);
  const emptyAnnotations = make('p', 'Use the tools above the image to add shapes, pointers, arrows, lines, or text labels.', 'tti-help tti-empty'); panes.Annotations.append(emptyAnnotations);
  const selection = field('Selected annotation', panes.Annotations, '', []); selection.addEventListener('change', () => { selected = selection.value; syncAnnotation(); draw(); });
  bindImageEditorDeletion(root, deleteButton, deleteSelection, selection);
  const annotationFields = make('div', undefined, 'tti-annotation-fields'); panes.Annotations.append(annotationFields);
  const label = field('Label text', annotationFields, ''); label.maxLength = 200;
  const labelEditor = createCanvasLabelEditor(viewport, {
    maxLength: 200,
    target: id => state.annotations.find(a => a.id === id)?.type === 'label'
      ? picture.querySelector(`[data-annotation="${id}"] text`) : null,
    read: id => state.annotations.find(a => a.id === id)?.text ?? '',
    write: (id, text) => change('Label text', s => { s.annotations.find(a => a.id === id).text = text; }, { coalesce:true }),
  });
  const annoColor = field('Annotation color', annotationFields, '#c13b32', null, 'color');
  const annoFill = field('Fill color', annotationFields, '#c13b32', null, 'color');
  const ending = field('Line ending', annotationFields, 'line', [['line','None'],['arrow','Arrow'],['pointer','Dot']]);
  const appearance = createAnnotationStyleControls(annotationFields, (key, value, options) => editAnnotation('Object appearance', a => { a[key] = value; }, options));
  const straighten = button('Straighten', () => editAnnotation('Straighten connector', a => { a.bendX = 0; a.bendY = 0; }), annotationFields);
  const cornerRadius = numberField('Corner radius', annotationFields, 8, 0, 100, 1);
  const annoFont = field('Label font', annotationFields, 'inherit', [['inherit','Image default'], ...fontChoices]);
  groupFontChoices(annoFont); annoFont.value = 'inherit';
  const annoSize = numberField('Label font size', annotationFields, 16, 10, 40);
  const annotationHint = make('p', '', 'tti-help'); annotationFields.append(annotationHint);
  const precision = make('details', undefined, 'tti-precision'); precision.append(make('summary', 'Position & attachment')); annotationFields.append(precision);
  const preciseFields = make('div', undefined, 'tti-group-body'); precision.append(preciseFields);
  const positionFields = pair(preciseFields);
  const coords = {};
  for (const [k,name] of [['x','Left (%)'],['y','Top (%)'],['w','Width (%)'],['h','Height (%)']]) coords[k] = numberField(name, positionFields, 10, 0, 100, .1);
  const anchor = field('Attach to source', preciseFields, 'free', [['free','Free placement'],['source',state.mode === 'text' ? 'Text characters' : 'Table cell']]);
  const anchorRow = numberField('Source row', preciseFields, 1, 1, state.mode === 'text' ? 120 : 60);
  const anchorRange = pair(preciseFields);
  const anchorStart = numberField(state.mode === 'text' ? 'First character' : 'Source column', anchorRange, 1, 1, state.mode === 'text' ? 200 : 12);
  const anchorEnd = state.mode === 'text' ? numberField('Last character', anchorRange, 1, 1, 200) : null;
  const selectedAnnotation = () => state.annotations.find(a => a.id === selected);
  function editAnnotation(name, mutator, historyOptions) { if (selected) change(name, s => mutator(s.annotations.find(a => a.id === selected)), historyOptions); }
  ending.addEventListener('change', () => editAnnotation('Line ending', a => { a.type = ending.value; }));
  cornerRadius.addEventListener('change', () => editAnnotation('Corner radius', a => { a.cornerRadius = +cornerRadius.value; }));
  label.addEventListener('input', () => editAnnotation('Label text', a => { a.text = label.value; }, { coalesce:true }));
  annoFill.addEventListener('input', event => editAnnotation('Fill color', a => { setAnnotationColor(a, 'fill', annoFill.value); }, event.detail));
  annoColor.addEventListener('input', event => editAnnotation('Annotation color', a => { setAnnotationColor(a, 'color', annoColor.value); }, event.detail));
  annoFont.addEventListener('change', () => editAnnotation('Label font', a => {
    if (annoFont.value === 'inherit') delete a.font;
    else a.font = annoFont.value;
  }));
  annoSize.addEventListener('change', () => editAnnotation('Label font size', a => { a.fontSize = Number(annoSize.value); }));
  for (const [key,f] of Object.entries(coords)) f.addEventListener('change', () => editAnnotation('Annotation position', a => { a[key] = Number(f.value) / 100; }));
  const applyAnchor = () => editAnnotation('Attach annotation', a => { a.anchor = anchor.value === 'free' ? null : state.mode === 'text' ? { row: +anchorRow.value, start: +anchorStart.value, end: +anchorEnd.value } : { row: +anchorRow.value, column: +anchorStart.value }; });
  for (const f of [anchor, anchorRow, anchorStart, anchorEnd].filter(Boolean)) f.addEventListener('change', applyAnchor);
  const sourceInput = field('Image source', panes.Source, state.text, null, 'textarea'); sourceInput.rows = 10; sourceInput.maxLength = IMAGE_LIMITS.characters;
  const sourceHeader = state.mode === 'table' ? field('First row is a header', panes.Source, state.hasHeader, null, 'checkbox') : null;
  const sourceDelimiter = state.mode === 'table' ? field('Source delimiter', panes.Source, state.delimiter, [['auto','Automatic'],['tab','Tab'],['comma','Comma'],['semicolon','Semicolon'],['pipe','Pipe']]) : null;
  button('Update image', () => change('Update source', s => { s.text = sourceInput.value; if (sourceHeader) { s.hasHeader = sourceHeader.checked; s.delimiter = sourceDelimiter.value; } }), panes.Source);
  const sourceActions = make('div', undefined, 'tti-source-actions'); panes.Source.append(sourceActions);
  button('Download source', () => downloadText(state.text, state.mode === 'table' ? 'image-source.txt' : 'image-text.txt', 'text/plain;charset=utf-8'), sourceActions);
  let copyButton; copyButton = button('Copy source', () => copyTextWithFeedback(copyButton, state.text), sourceActions);
  panes.Source.append(make('p', 'Update image applies your source edits. Copy and download use the current image source.', 'tti-help'));

  function syncFields() {
    for (const [key,f] of Object.entries(fields)) { if (f.type === 'checkbox') f.checked = state.style[key]; else f.value = state.style[key]; }
    fields.background.value = imageBackgroundColor(state.style);
    if (sourceHeader) {
      colorControls.get(fields.headerFill).element.hidden = !state.hasHeader;
      colorControls.get(fields.ruleColor).element.hidden = state.style.rules === 'none';
    }
    syncColumns(); syncAnnotation();
    for (const control of colorControls.values()) control.refresh();
  }
  function syncColumns() {
    if (!column || !layout) return;
    const previous = column.value, rows = layout.source.rows;
    column.replaceChildren(); rows[0].forEach((name, i) => { const o = make('option', `${i + 1}: ${state.hasHeader ? name : 'Column ' + (i + 1)}`); o.value = String(i); column.append(o); });
    column.value = previous !== '' && +previous < rows[0].length ? previous : '0';
    columnWidth.value = Math.round(layout.cells[+column.value].w); columnAlign.value = state.style.columnAlignments[column.value] ?? 'auto';
    columnFont.options[0].textContent = `Table default (${IMAGE_FONTS[state.style.font].label})`;
    columnFont.value = state.style.columnFonts?.[column.value] ?? 'inherit';
    columnFontSize.value = state.style.columnFontSizes?.[column.value] ?? '';
    columnFontSize.placeholder = `Default: ${state.style.fontSize}`;
  }
  function syncAnnotation() {
    selection.replaceChildren(); const empty = make('option', 'None'); empty.value = ''; selection.append(empty);
    state.annotations.forEach((a,i) => { const o = make('option', `${i + 1}. ${a.type === 'label' ? a.text || 'Label' : a.type}${a.anchor ? ' · attached' : ''}`); o.value = a.id; selection.append(o); });
    if (!selectedAnnotation()) selected = ''; selection.value = selected;
    const a = selectedAnnotation(); annotationFields.hidden = !a;
    selection.closest('label').hidden = !state.annotations.length;
    emptyAnnotations.hidden = !!a;
    emptyAnnotations.textContent = state.annotations.length ? 'Select an annotation in the image or the list to edit it.' : 'Use the tools above the image to add shapes, pointers, arrows, lines, or text labels.';
    duplicateButton.disabled = deleteButton.disabled = !a;
    if (!a) return;
    annotationHint.textContent = a.anchor ? 'Attached to the source. Position follows its text or cell.' : isConnector(a.type) ? 'Drag ends to aim, the middle to bend, or the line to move and align. Shift snaps; Alt releases.' : a.type === 'label' ? 'Double-click or Enter to edit text. Backspace/Delete removes the label. Drag to move and align.' : 'Drag to align edges or centers; use the corner to resize. Shift constrains; Alt bypasses snapping.';
    for (const field of [label, annoFont, annoSize]) field.closest('label').hidden = a.type !== 'label';
    ending.closest('label').hidden = !isConnector(a.type); ending.value = isConnector(a.type) ? a.type : 'line';
    straighten.hidden = !isConnector(a.type); straighten.disabled = !(a.bendX || a.bendY);
    cornerRadius.closest('label').hidden = a.type !== 'box'; cornerRadius.value = a.cornerRadius ?? 0;
    const fillStyle = annotationFillStyle(a), fillable = ['box','ellipse'].includes(a.type);
    appearance.update({ ...a, fillStyle }, { line: !['label','highlight'].includes(a.type), arrows: a.type === 'arrow', ends: ['arrow','pointer'].includes(a.type), fills: fillable });
    colorControls.get(annoFill).element.hidden = !fillable || fillStyle === 'none';
    annoFill.value = annotationColor(a, 'fill'); colorControls.get(annoFill).refresh();
    label.value = a.text; annoColor.value = annotationColor(a, 'color'); annoSize.value = a.fontSize;
    annoFont.options[0].textContent = `Image default (${IMAGE_FONTS[state.style.font].label})`;
    annoFont.value = a.font ?? 'inherit';
    colorControls.get(annoColor).refresh();
    const canAnchor = ['box','highlight'].includes(a.type); anchor.closest('label').hidden = !canAnchor;
    anchor.value = a.anchor ? 'source' : 'free';
    for (const f of [anchorRow,anchorStart,anchorEnd].filter(Boolean)) f.closest('label').hidden = !canAnchor || !a.anchor;
    if (a.anchor) { anchorRow.value = a.anchor.row; anchorStart.value = a.anchor.start ?? a.anchor.column; if (anchorEnd) anchorEnd.value = a.anchor.end; }
    anchorRange.hidden = !canAnchor || !a.anchor;
    for (const [key,f] of Object.entries(coords)) { f.value = +(a[key] * 100).toFixed(2); f.disabled = !!a.anchor; f.closest('label').hidden = a.type === 'label' && ['w','h'].includes(key); }
  }
  function draw() {
    layout = layoutImage(state, measure); exportedSvg = renderImageSvg(state, layout); picture.innerHTML = exportedSvg;
    const svg = picture.querySelector('svg'); svg.style.width = zoom.value === 'fit' ? '100%' : `${layout.width * Number(zoom.value)}px`; svg.style.maxWidth = zoom.value === 'fit' ? `${layout.width}px` : 'none'; svg.style.height = 'auto';
    viewport.classList.toggle('is-transparent', colorOpacity(imageBackgroundColor(state.style)) < 1);
    const namespace = 'http://www.w3.org/2000/svg';
    const rect = (attrs, parent) => { const el = document.createElementNS(namespace, 'rect'); for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v); parent.append(el); return el; };
    const overlay = document.createElementNS(namespace, 'g'); overlay.setAttribute('data-editor-overlay',''); svg.append(overlay);
    const scale = svg.getBoundingClientRect().width / layout.width;
    for (const a of layout.annotations) {
      if (isConnector(a.type)) {
        overlay.append(annotationControl('path', { d: connectorGeometry(a).path, 'data-hit': a.id }, 'fill:none;stroke:transparent;stroke-width:16;vector-effect:non-scaling-stroke;pointer-events:stroke;cursor:move'));
      } else if (a.type === 'ellipse') {
        overlay.append(annotationControl('ellipse', { cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: a.w / 2, ry: a.h / 2, fill: 'transparent', stroke: 'transparent', 'stroke-width': 16, 'vector-effect': 'non-scaling-stroke', 'data-hit': a.id, class: 'tti-hit' }));
      } else rect({ x: a.x, y: a.y, width: Math.max(8,a.w), height: Math.max(8,a.h), rx: a.cornerRadius ?? 0, fill: 'transparent', 'data-hit': a.id, class: 'tti-hit' }, overlay);
    }
    const a = layout.annotations.find(a => a.id === selected);
    if (a) {
      if (isConnector(a.type)) appendConnectorControls(overlay, a, scale, { 'data-hit': a.id });
      else {
        if (a.type === 'ellipse') overlay.append(annotationControl('ellipse', { cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: a.w / 2, ry: a.h / 2, fill: 'none', class: 'tti-selection', 'pointer-events': 'none' }));
        else rect({ x: a.x, y: a.y, width: Math.max(8,a.w), height: Math.max(8,a.h), rx: a.cornerRadius ?? 0, fill: 'none', class: 'tti-selection', 'pointer-events':'none' }, overlay);
        if (!a.anchor && a.type !== 'label') {
          const handle = 10 / Math.max(scale, .01);
          const hitSize = imageEditorHandleSize() / Math.max(scale, .01);
          rect({ x:a.x + a.w - hitSize/2, y:a.y + a.h - hitSize/2, width:hitSize, height:hitSize, fill:'transparent', 'data-hit':a.id, 'data-resize':'true', style:'pointer-events:all;cursor:nwse-resize' }, overlay);
          rect({ x: a.x + a.w - handle / 2, y: a.y + a.h - handle / 2, width: handle, height: handle, 'data-hit':a.id, 'data-resize':'true', class:'tti-resize', 'vector-effect':'non-scaling-stroke' }, overlay);
        }
      }
    }
    appendSnapGuide(overlay, snapGuide, scale);
    status.textContent = `${layout.width} × ${layout.height} px · ${state.mode === 'text' ? layout.source.lines.length + ' lines' : layout.source.rows.length + ' rows × ' + layout.source.rows[0].length + ' columns'}`;
    svgButton.disabled = pngButton.disabled = false;
    labelEditor.refresh();
  }
  function render() { draw(); syncFields(); }
  const point = event => { const svg = picture.querySelector('svg'), p = new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse()); return { x:p.x / layout.width, y:p.y / layout.height }; };
  viewport.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    labelEditor.close();
    const hit = e.composedPath().find(node => node instanceof Element && node.hasAttribute('data-hit')); if (!hit) { selected = ''; syncAnnotation(); draw(); return; }
    e.preventDefault(); selected = hit.getAttribute('data-hit'); const a = selectedAnnotation();
    activateTab('Annotations');
    const start = point(e); drag = a.anchor ? null : { pointerId:e.pointerId, id:selected, start, original:structuredClone(a), handle: hit.getAttribute('data-connector-handle'), resize:hit.hasAttribute('data-resize'), before:structuredClone(state) };
    if (drag && !drag.handle && !drag.resize) {
      const element = picture.querySelector(`[data-annotation="${selected}"]`);
      const measureBox = node => { const b = node.getBBox(); return { x:b.x, y:b.y, w:b.width, h:b.height }; };
      drag.box = measureBox(element);
      drag.targets = alignmentTargets(picture.querySelectorAll('[data-annotation]'), element, measureBox);
      const laid = layout.annotations.find(n => n.id === selected);
      const geometry = isConnector(a.type) ? connectorGeometry(laid) : null;
      const points = geometry ? [geometry.start, geometry.end, geometry.control] : [{ x:laid.x, y:laid.y }, { x:laid.x + laid.w, y:laid.y + laid.h }];
      drag.limits = { x:[-Math.min(...points.map(p=>p.x)), layout.width - Math.max(...points.map(p=>p.x))], y:[-Math.min(...points.map(p=>p.y)), layout.height - Math.max(...points.map(p=>p.y))] };
    }
    if (drag) viewport.setPointerCapture(e.pointerId); viewport.focus({ preventScroll:true }); syncAnnotation(); draw();
  });
  const pixelAnnotation = a => ({ ...a, x:a.x * layout.width, y:a.y * layout.height, w:a.w * layout.width, h:a.h * layout.height, bendX:(a.bendX ?? 0) * layout.width, bendY:(a.bendY ?? 0) * layout.height });
  function storeConnector(target, pixel) {
    const { start, end } = connectorGeometry(pixel);
    for (const p of [start, end]) { p.x = Math.max(0, Math.min(layout.width, p.x)); p.y = Math.max(0, Math.min(layout.height, p.y)); }
    target.x = Math.min(start.x, end.x) / layout.width; target.y = Math.min(start.y, end.y) / layout.height;
    target.w = Math.abs(end.x - start.x) / layout.width; target.h = Math.abs(end.y - start.y) / layout.height;
    target.flipX = start.x > end.x; target.flipY = start.y > end.y;
    const centerX = (start.x + end.x) / 2, centerY = (start.y + end.y) / 2;
    target.bendX = Math.max(-centerX / 2, Math.min((layout.width - centerX) / 2, pixel.bendX ?? 0)) / layout.width;
    target.bendY = Math.max(-centerY / 2, Math.min((layout.height - centerY) / 2, pixel.bendY ?? 0)) / layout.height;
  }
  viewport.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = point(e), a = selectedAnnotation(), d = drag.original, dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    const options = { scale: picture.querySelector('svg').getBoundingClientRect().width / layout.width, force: e.shiftKey, disabled: e.altKey, previous: snapGuide };
    snapGuide = undefined;
    if (drag.handle) {
      const result = moveConnectorHandle(pixelAnnotation(d), drag.handle, { x: Math.max(0,Math.min(1,p.x)) * layout.width, y: Math.max(0,Math.min(1,p.y)) * layout.height }, options);
      storeConnector(a, result.annotation); snapGuide = result.guide;
    } else if (drag.resize) {
      const origin = { x:d.x * layout.width, y:d.y * layout.height };
      const end = { x:(d.x + d.w + dx) * layout.width, y:(d.y + d.h + dy) * layout.height };
      const result = ['box','ellipse'].includes(d.type) ? snapSquare(origin, end, { ...options, type:d.type }) : { point:end };
      a.w = Math.max(.005, Math.min(1-d.x, (result.point.x-origin.x) / layout.width));
      a.h = Math.max(.005, Math.min(1-d.y, (result.point.y-origin.y) / layout.height));
      if (result.guide && Math.abs(a.w * layout.width - a.h * layout.height) < .01) snapGuide = result.guide;
    } else {
      const delta = { x:dx * layout.width, y:dy * layout.height };
      drag.moved ||= Math.hypot(delta.x, delta.y) * options.scale >= 3;
      if (!drag.moved) return;
      for (const axis of ['x','y']) delta[axis] = Math.max(drag.limits[axis][0], Math.min(drag.limits[axis][1], delta[axis]));
      const result = snapTranslation(drag.box, delta, drag.targets, { ...options, limits:drag.limits });
      a.x = d.x + result.delta.x / layout.width; a.y = d.y + result.delta.y / layout.height;
      snapGuide = result.guide;
      if (isConnector(a.type)) storeConnector(a, pixelAnnotation(a));
    }
    try { draw(); syncAnnotation(); } catch { Object.assign(a, d); snapGuide = undefined; draw(); }
  });
  const finishDrag = e => {
    if (!drag) {
      if (e.type === 'pointerup' && selectedAnnotation()?.anchor) labelEditor.pointerSelection(e, selected);
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    const tappedLabel = !drag.moved && !drag.resize && !drag.handle && selectedAnnotation()?.type === 'label' ? selected : null;
    if (e.type === 'pointercancel' || e.type === 'lostpointercapture') state = drag.before;
    drag = null; snapGuide = undefined;
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    render(); session?.changed('Move / resize annotation');
    labelEditor.pointerSelection(e, tappedLabel);
  };
  viewport.addEventListener('pointerup', finishDrag); viewport.addEventListener('pointercancel', finishDrag);
  viewport.addEventListener('lostpointercapture', finishDrag);
  viewport.addEventListener('keydown', e => {
    const a = selectedAnnotation(); if (!a) return;
    if (labelEditor.selectionKey(e, selected)) return;
    if (e.key === 'Escape') { selected = ''; syncAnnotation(); draw(); return; }
    if (!a.anchor && /^Arrow/.test(e.key)) { e.preventDefault(); const delta = e.shiftKey ? 10 : 1; editAnnotation('Nudge annotation', n => { if (e.key === 'ArrowLeft') n.x -= delta/layout.width; if (e.key === 'ArrowRight') n.x += delta/layout.width; if (e.key === 'ArrowUp') n.y -= delta/layout.height; if (e.key === 'ArrowDown') n.y += delta/layout.height; }); }
  });
  render();
  session = createEditorSession({ host:root, toolbar:history, tool:imageToolId(state.mode), source, persist: !preview,
    read:() => ({ image:structuredClone(state) }), apply:value => {
      labelEditor.close(); state = structuredClone(validateImageState(value.image));
      state.annotations.forEach(a => normalizeAnnotationFill(a));
      sourceInput.value = state.text;
      if (sourceHeader) { sourceHeader.checked = state.hasHeader; sourceDelimiter.value = state.delimiter; }
      selected = ''; render();
    }, initial:editorDocument?.state });
  const resizeObserver = new ResizeObserver(() => { if (!drag) draw(); }); resizeObserver.observe(viewport);
  container._sms3VisualCleanup = () => { disposeToolbarHelp(); navigation.dispose(); colorSampler.dispose(); labelEditor.dispose(); resizeObserver.disconnect(); for (const control of colorControls.values()) control.dispose(); session.dispose(); };
}
