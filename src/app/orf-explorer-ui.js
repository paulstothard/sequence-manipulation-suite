import { ORF_EXPLORER_PAGE_SIZE, ORF_FRAMES, getOrfExplorerRows, orfSequencePage, packOrfOverviewMarks } from '../core/orf-explorer.js';
import { createSearchableViewerChoiceCombobox } from './searchable-viewer-choice-ui.js';
import { formatTableCellValue } from './table-output-view-model.js';
import { downloadText } from './file-download.js';
import { copyTextWithFeedback, showCopiedFeedback } from './copy-feedback.js';
import { ToolWorkerClient } from './worker-client.js';
import { installVisualInspection } from './visual-inspection.js';
import { installOrfExplorerNavigation } from './orf-explorer-navigation.js';
import { setUiText } from './set-ui-text.js';
import { ORF_MAP_ARROW_LIMIT, summarizeOrfMap } from '../core/orf-explorer-map.js';
import { makeCheckboxToggle } from './viewer-checkbox-toggle.js';
import { createOrfSequenceMap } from './orf-explorer-sequence-map.js';
import { geneticCodes } from '../core/genetic-code.js';
import { layoutLinearRulerLabels } from './dna-viewer-canvas.js';
import { exportOrfMap } from './orf-explorer-export.js';
import { createViewerExportButton, createViewerFitButton } from './viewer-export-buttons.js';

const count = value => value.toLocaleString('en-US');
const orfCount = value => `${count(value)} ORF${value === 1 ? '' : 's'}`;
let explorerId = 0;
const node = (tag, className = '', text = '') => {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
};
function button(text, action, label = text) {
  const element = node('button', '', text);
  element.type = 'button';
  element.setAttribute('aria-label', label);
  element.addEventListener('click', action);
  return element;
}
function selectField(label, choices, action) {
  const field = node('label', 'orf-explorer-field');
  const select = node('select');
  select.setAttribute('aria-label', label);
  for (const [value, text] of choices) {
    const option = node('option', '', text); option.value = value; select.append(option);
  }
  select.addEventListener('change', () => action(select.value));
  field.append(node('span', '', label), select);
  return { field, select };
}
function svgNode(tag, attributes, text = '') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  element.textContent = text;
  return element;
}

export function renderOrfExplorer(container, data) {
  const root = node('section', 'orf-explorer');
  const glowId = `orf-explorer-glow-${++explorerId}`;
  root.style.setProperty('--orf-explorer-glow', `url(#${glowId})`);
  root.style.setProperty('--orf-explorer-glow-dark', `url(#${glowId}-dark)`);
  root.setAttribute('aria-label', 'ORF Explorer');
  container.append(root);
  const records = data.records ?? [];
  if (!records.length) { root.append(node('p', '', 'No sequence records.')); return; }
  let record = records.find(item => item.orfs.length) ?? records[0];
  let selected = null;
  let page = 0;
  let sequencePage = 0;
  let rows = [];
  let pageRows = [];
  let view = [1, Math.max(1, record.length)];
  let disposed = false;
  let exportRun = null;
  let exportStatusTimer = 0;
  let inspectionCleanup = () => {};
  let resizeFrame = 0;
  let idleFrame = 0, retainedMapNodes = false;
  let navigation;
  const filters = { frame: 'all', status: 'all', sort: 'id', descending: false };
  const display = { orfTranslation: true };
  const worker = new ToolWorkerClient();
  const total = records.reduce((sum, item) => sum + item.orfs.length, 0);
  const controlPanel = node('div', 'orf-explorer-controls');
  root.append(controlPanel);
  const header = node('div', 'orf-explorer-header');
  const summary = node('p', 'orf-explorer-summary');
  const recordTitle = node('div', 'orf-explorer-record-title');
  if (records.length > 1) {
    const choices = records.map(item => ({
      key: String(item.recordIndex), label: `${item.recordIndex}. ${item.title}`,
      detail: `${count(item.length)} bp · ${orfCount(item.orfs.length)}`, record: item
    }));
    const chooser = createSearchableViewerChoiceCombobox({
      choices, initialKey: String(record.recordIndex), inputLabel: 'Input sequence', toggleLabel: 'Choose input sequence',
      onChange: choice => {
        if (!choice || choice.record === record) return;
        record = choice.record; page = 0; selected = null; view = [1, Math.max(1, record.length)];
        updateRecord(); updateRows();
      }
    });
    chooser.input.spellcheck = false;
    chooser.input.setAttribute('autocorrect', 'off'); chooser.input.setAttribute('autocapitalize', 'off');
    const field = node('div', 'orf-explorer-record-choice alignment-viewer-region-field');
    field.append(node('span', '', 'Input sequence'), chooser.element);
    header.append(field);
  }
  const identity = node('div', 'orf-explorer-identity'); identity.append(recordTitle, summary); header.append(identity);
  controlPanel.append(header);

  const exports = node('div', 'orf-explorer-exports');
  const exportButtons = node('div', 'dna-viewer-buttons');
  exportButtons.append(
    button('DNA FASTA', event => exportSequences(event.currentTarget, 'dna'), 'Download DNA FASTA'),
    button('Protein FASTA', event => exportSequences(event.currentTarget, 'protein'), 'Download protein FASTA')
  );
  exports.append(exportButtons);
  const exportStatus = node('div', 'orf-explorer-export-status');
  exportStatus.setAttribute('popover', 'manual');
  exportStatus.setAttribute('aria-label', 'Sequence export status');
  const statusText = node('span'); statusText.setAttribute('role', 'status');
  const cancel = button('Cancel export', () => exportRun?.cancel()); cancel.hidden = true;
  const dismissStatus = button('Dismiss', () => clearExportStatus()); dismissStatus.hidden = true;
  exportStatus.append(statusText, cancel, dismissStatus); root.append(exportStatus); header.append(exports);
  function clearExportStatus() {
    clearTimeout(exportStatusTimer);
    if (exportStatus.matches(':popover-open')) exportStatus.hidePopover();
    statusText.textContent = ''; cancel.hidden = true; dismissStatus.hidden = true;
  }
  function showExportError(error) {
    clearExportStatus();
    statusText.textContent = error.message;
    dismissStatus.hidden = false;
    exportStatus.showPopover();
  }

  const controls = node('div', 'orf-explorer-toolbar orf-explorer-filters');
  const frame = selectField('Frame', [['all', 'All frames'], ...ORF_FRAMES.map(value => [value, value])], value => { filters.frame = value; page = 0; updateRows(); });
  const status = selectField('Status', [['all', 'All ORFs'], ['complete', 'Complete'], ['partial', 'Partial']], value => { filters.status = value; page = 0; updateRows(); });
  const pager = node('div', 'orf-explorer-pager dna-viewer-buttons');
  const previous = button('Previous', () => changePage(page - 1), 'Previous ORF page');
  const next = button('Next', () => changePage(page + 1), 'Next ORF page');
  const pageInput = node('input'); pageInput.type = 'number'; pageInput.min = '1'; pageInput.step = '1'; pageInput.setAttribute('aria-label', 'ORF page');
  pageInput.addEventListener('change', () => changePage(Number(pageInput.value) - 1));
  const pages = node('span', 'orf-explorer-muted');
  pager.append(previous, pageInput, pages, next);
  const pageSummary = node('p', 'orf-explorer-page-summary');
  controls.append(frame.field, status.field, pageSummary, pager); controlPanel.append(controls);

  const mapPanel = node('div', 'orf-explorer-map-panel');
  const mapTools = node('div', 'dna-viewer-toolbar orf-explorer-map-tools');
  const legend = node('div', 'orf-explorer-legend');
  legend.append(node('span', 'complete', 'Complete'), node('span', 'partial', 'Partial'));
  const zoomTools = node('div', 'dna-viewer-buttons');
  const fit = createViewerFitButton('Whole sequence');
  fit.addEventListener('click', () => { navigation.reset(); view = [1, Math.max(1, record.length)]; drawMap(); });
  zoomTools.append(button('←', () => navigation.pan(-.25), 'Pan left'), button('→', () => navigation.pan(.25), 'Pan right'),
    button('−', () => navigation.zoom(1/1.7), 'Zoom out'), button('+', () => navigation.zoom(1.7), 'Zoom in'), fit); mapTools.append(zoomTools);
  for (const format of ['PNG','SVG']) {
    const control = createViewerExportButton(format, { first: format === 'PNG', label: `Download ${format} of current view` });
    control.addEventListener('click',async()=>{
      control.disabled=true; inspectionCleanup.hide?.();
      if (!exportRun) clearExportStatus();
      try { await exportOrfMap(svg,record,view,format.toLowerCase()); }
      catch(error) { showExportError(error); }
      finally { if(!disposed) control.disabled=false; }
    });
    zoomTools.append(control);
  }
  const toggles = node('div', 'dna-viewer-toggles');
  for (const [key, label, help] of [
    ['orfTranslation', 'ORF translation', 'Show amino acids inside ORF blocks when zoomed in, including a terminal stop when present. Uses the genetic code and start-codon mode from this analysis.']
  ]) {
    const toggle = makeCheckboxToggle(label, display[key]); toggle.label.title = help;
    toggle.input.addEventListener('change', () => { navigation.reset(); display[key] = toggle.input.checked; drawMap(); });
    toggles.append(toggle.label);
  }
  const code = geneticCodes.find(item => item.id === String(data.options.geneticCode));
  const codeLabel = node('span', 'orf-explorer-code', `Code ${code?.id ?? data.options.geneticCode} · ${code?.name ?? ''}`);
  codeLabel.title = 'Genetic code used for this analysis. Set it in the input options and rerun to change it.';
  mapTools.append(toggles, codeLabel);
  const map = node('div', 'orf-explorer-map'); map.setAttribute('aria-label', 'ORF map');
  const svg = svgNode('svg', { role: 'group', tabindex: -1, 'aria-label': 'All matching ORFs by reading frame', 'data-orf-explorer-map': '' });
  map.append(svg);
  const frameNodes = new Map(), markNodes = new Map(), densityNodes = new Map();
  let packingCache = null;
  const defs = svgNode('defs', {});
  const glowFilters = [false, true].map(dark => {
    const filter = svgNode('filter', { id: `${glowId}${dark ? '-dark' : ''}`, filterUnits: 'userSpaceOnUse', x: -12, y: -12, 'color-interpolation-filters': 'sRGB' });
    filter.append(svgNode('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: dark ? 3 : 2, result: 'blur' }));
    filter.append(svgNode('feFlood', { 'flood-color': '#f59e0b', 'flood-opacity': dark ? .9 : .8, result: 'colour' }));
    filter.append(svgNode('feComposite', { in: 'colour', in2: 'blur', operator: 'in', result: 'halo' }));
    const merge = svgNode('feMerge', {});
    merge.append(svgNode('feMergeNode', { in: 'halo' }), svgNode('feMergeNode', { in: 'SourceGraphic' }));
    filter.append(merge); defs.append(filter); return filter;
  });
  svg.append(defs);
  const sequenceClip = svgNode('clipPath', { id: `${glowId}-sequence-clip` });
  const sequenceClipRect = svgNode('rect', {}); sequenceClip.append(sequenceClipRect); defs.append(sequenceClip);
  for (const frame of ORF_FRAMES) {
    const group = svgNode('g', {}), band = svgNode('rect', { class: 'orf-explorer-frame-band' }), label = svgNode('text', { x: 10, class: 'orf-explorer-frame-label' }, frame);
    const densityLayer = svgNode('g', {});
    group.append(band, label, densityLayer); svg.append(group); frameNodes.set(frame, { group, band, label, densityLayer });
  }
  const ruler = svgNode('g', {}); svg.append(ruler);
  const rulerMeasure = document.createElement('canvas').getContext('2d'); rulerMeasure.font = '11px system-ui, sans-serif';
  const sequenceMap = createOrfSequenceMap(svg, `${glowId}-sequence-clip`, id => { const orf = rows.find(item => item.id === id); if (orf) selectOrf(orf); });
  let mapLayout = { width: 760, plotLeft: 60, plotRight: 742, regions: [] };
  const rangeText = node('p', 'orf-explorer-map-caption');
  const mapHelp = node('p', 'orf-explorer-map-help', 'Drag to pan · Pinch or Ctrl/⌘ + scroll to zoom.');
  mapHelp.id = `${glowId}-help`; svg.setAttribute('aria-describedby', mapHelp.id);
  const mapCaption = node('div', 'orf-explorer-map-footer'); mapCaption.append(legend, rangeText);
  mapPanel.append(mapTools, map, mapCaption, mapHelp); root.append(mapPanel);

  const body = node('div', 'orf-explorer-body');
  const tablePanel = node('div', 'orf-explorer-table-panel');
  const tableScroll = node('div', 'orf-explorer-table-scroll');
  tableScroll.tabIndex = 0;
  tableScroll.setAttribute('role', 'region');
  tableScroll.setAttribute('aria-label', 'Scrollable ORF results');
  const table = node('table', 'result-table orf-explorer-table'); table.setAttribute('aria-label', 'ORFs in selected input sequence');
  const thead = node('thead'); const tr = node('tr');
  const columns = [['id', 'ORF'], ['frame', 'Frame'], ['start', 'Start'], ['end', 'End'], ['ntLength', 'bp'], ['aaLength', 'aa'], ['complete', 'Status']];
  const headings = [];
  for (const [key, label] of columns) {
    const th = node('th'); th.scope = 'col';
    const sort = button(label, () => {
      filters.descending = filters.sort === key ? !filters.descending : ['ntLength', 'aaLength'].includes(key);
      filters.sort = key; updateRows({ preserveSelection: true });
    }, `Sort by ${label}`);
    sort.className = 'table-sort-button';
    const indicator = node('span', 'orf-explorer-sort-indicator', '↕'); indicator.setAttribute('aria-hidden', 'true');
    sort.append(indicator); th.append(sort); tr.append(th); headings.push({ th, key, sort, indicator, label });
  }
  thead.append(tr); const tbody = node('tbody'); table.append(thead, tbody); tableScroll.append(table); tablePanel.append(tableScroll);
  const details = node('section', 'interactive-sequence-viewer-inspector orf-explorer-details'); details.setAttribute('aria-label', 'Selected ORF');
  body.append(tablePanel, details); root.append(body);

  function updateRecord() {
    recordTitle.textContent = record.title;
    recordTitle.hidden = records.length > 1;
    summary.textContent = `${count(record.length)} bp · ${orfCount(record.orfs.length)}${records.length > 1 ? ` · sequence ${record.recordIndex} of ${count(records.length)} (${orfCount(total)} total)` : ''}`;
    const n = record.orfs.length;
    for (const control of exportButtons.children) control.disabled = !n || Boolean(exportRun);
  }
  function changePage(value) {
    page = Number.isFinite(value) ? Math.max(0, Math.min(Math.ceil(rows.length / ORF_EXPLORER_PAGE_SIZE) - 1, Math.floor(value))) : 0;
    updatePage();
  }
  function updateRows({ preserveSelection = false } = {}) {
    rows = getOrfExplorerRows(record, filters);
    for (const { th, key, sort, indicator, label } of headings) {
      const active = filters.sort === key;
      th.setAttribute('aria-sort', active ? (filters.descending ? 'descending' : 'ascending') : 'none');
      setUiText(indicator, active ? (filters.descending ? '↓' : '↑') : '↕');
      const nextDescending = active ? !filters.descending : ['ntLength', 'aaLength'].includes(key);
      sort.title = `Sort by ${label}, ${nextDescending ? 'descending' : 'ascending'}`;
    }
    // Sorting changes order, not the biological selection. Follow its new page.
    if (preserveSelection) page = Math.max(0, Math.floor(rows.indexOf(selected) / ORF_EXPLORER_PAGE_SIZE));
    updatePage();
    if (preserveSelection) revealSelectedRow();
  }
  function updatePage() {
    navigation?.reset();
    const pageCount = Math.max(1, Math.ceil(rows.length / ORF_EXPLORER_PAGE_SIZE));
    page = Math.min(page, pageCount - 1);
    pageRows = rows.slice(page * ORF_EXPLORER_PAGE_SIZE, (page + 1) * ORF_EXPLORER_PAGE_SIZE);
    previous.disabled = page === 0; next.disabled = page >= pageCount - 1;
    pageInput.value = String(page + 1); pageInput.max = String(pageCount); pageInput.disabled = !rows.length;
    pages.textContent = `of ${count(pageCount)}`;
    pager.hidden = pageCount <= 1;
    pageSummary.textContent = rows.length
      ? `Table: ${count(page * ORF_EXPLORER_PAGE_SIZE + 1)}–${count(page * ORF_EXPLORER_PAGE_SIZE + pageRows.length)} of ${orfCount(rows.length)}${rows.length !== record.orfs.length ? ` matching filters (${count(record.orfs.length)} in this sequence)` : ''}`
      : record.orfs.length ? 'No ORFs match these display filters.' : 'No ORFs matched the analysis settings in this sequence.';
    if (!pageRows.includes(selected)) {
      selected = pageRows[0] ?? null; sequencePage = 0;
    }
    tbody.replaceChildren();
    for (const orf of pageRows) {
      const row = node('tr'); row.dataset.orfId = orf.id;
      for (const [key] of columns) {
        const td = node('td');
        if (key === 'id') td.append(button(`ORF ${orf.id}`, () => selectOrf(orf), `Select ORF ${orf.id}`));
        else if (key === 'complete') td.append(node('span', `orf-explorer-badge ${orf.complete ? 'complete' : 'partial'}`, orf.complete ? 'Complete' : 'Partial'));
        else td.textContent = typeof orf[key] === 'number' ? formatTableCellValue(orf[key], { type: 'number' }) : orf[key];
        row.append(td);
      }
      row.addEventListener('click', event => { if (!event.target.closest('button')) selectOrf(orf); });
      tbody.append(row);
    }
    tableScroll.scrollTop = 0;
    drawMap(); updateSelection(); renderDetails();
  }
  function selectOrf(orf) {
    navigation.reset();
    selected = orf; sequencePage = 0;
    if (orf.end < view[0] || orf.start > view[1]) view = [1, Math.max(1, record.length)];
    // A map selection can belong to any table page, including after sorting.
    const selectedPage = Math.floor(rows.indexOf(orf) / ORF_EXPLORER_PAGE_SIZE);
    if (selectedPage !== page) { page = selectedPage; updatePage(); }
    else { drawMap(); renderDetails(); }
    revealSelectedRow();
    const mark = map.querySelector(`[data-orf-id="${orf.id}"]`);
    if (mark) {
      const target = mark.getBoundingClientRect(), viewport = map.getBoundingClientRect();
      if (target.top < viewport.top) map.scrollTop -= viewport.top - target.top + 8;
      else if (target.bottom > viewport.bottom) map.scrollTop += target.bottom - viewport.bottom + 8;
    }
    // In the stacked layout, an explicit selection should expose its sequences
    // immediately. Initial rendering, sorting and paging do not scroll the page.
    if (body.clientWidth <= 720) details.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function revealSelectedRow() {
    if (!selected || tablePanel.hidden) return;
    const row = tbody.querySelector(`[data-orf-id="${selected.id}"]`);
    if (!row) return;
    const target = row.getBoundingClientRect(), viewport = tableScroll.getBoundingClientRect();
    const top = viewport.top + thead.getBoundingClientRect().height;
    if (target.top < top) tableScroll.scrollTop -= top - target.top;
    else if (target.bottom > viewport.bottom) tableScroll.scrollTop += target.bottom - viewport.bottom;
  }
  function updateSelection() {
    for (const row of tbody.children) {
      const active = Number(row.dataset.orfId) === selected?.id;
      row.classList.toggle('is-selected', active);
      row.querySelector('button')?.setAttribute('aria-pressed', String(active));
    }
    for (const mark of map.querySelectorAll('[data-orf-id]')) {
      const active = Number(mark.dataset.orfId) === selected?.id;
      mark.classList.toggle('is-selected', active); mark.setAttribute('aria-pressed', String(active));
    }
  }
  function drawMap() {
    retainedMapNodes = false;
    const width = Math.max(240, Math.round(map.clientWidth || 760));
    const left = 60, right = width - 18, span = view[1] - view[0] + 1;
    const x = position => left + (position - (view[0] - 1)) / span * (right - left);
    const overviewX = position => left + position / Math.max(1, record.length) * (right - left);
    const geometry = (orf, project, start = 1, end = record.length) => {
      const naturalStart = project(Math.max(start, orf.start) - 1), naturalEnd = project(Math.min(end, orf.end));
      const tiny = naturalEnd - naturalStart < 7;
      const x1 = tiny ? Math.max(left, Math.min(right - 7, (naturalStart + naturalEnd - 7) / 2)) : naturalStart;
      return { orf, index: orf.id, x1, x2: tiny ? x1 + 7 : naturalEnd, tiny };
    };
    const largeMap = rows.length > ORF_MAP_ARROW_LIMIT;
    let model = summarizeOrfMap(rows, view[0], view[1], right - left);
    // Large maps keep two packed lanes per frame at every zoom. Regions that
    // need more lanes retain the exact density view and selected-ORF overlay.
    // This keeps the DNA strip and reverse tracks stationary during navigation.
    if (largeMap && !model.density && ORF_FRAMES.some(frame =>
      packOrfOverviewMarks(model.visible.filter(orf => orf.frame === frame).map(orf => geometry(orf, x, view[0], view[1])), 4).laneCount > 2)) {
      model = summarizeOrfMap(rows, view[0], view[1], right - left, 0);
    }
    const density = model.density;
    // Small records retain their lanes through navigation. Large records switch
    // from exact interval density to all individual ORFs in the visible region.
    const candidates = density ? (selected && model.visible.includes(selected) ? [selected] : [])
      : rows.length <= ORF_MAP_ARROW_LIMIT ? rows : model.visible;
    const candidateSet = new Set(candidates);
    for (const [orf, nodes] of markNodes) {
      if (!candidateSet.has(orf)) {
        nodes.mark.style.display = 'none'; nodes.label.style.display = 'none';
        // Keep touch origins attached until the gesture finishes.
        if (!navigation?.isInteracting()) { nodes.mark.remove(); nodes.label.remove(); nodes.shapeClip.remove(); markNodes.delete(orf); }
        else retainedMapNodes = true;
      }
    }
    const signature = candidates.map(orf => orf.id).sort((a, b) => a - b).join(',');
    if (!packingCache || packingCache.record !== record || packingCache.width !== width || packingCache.signature !== signature || packingCache.density !== Boolean(density)) {
      const project = rows.length <= ORF_MAP_ARROW_LIMIT ? overviewX : x;
      packingCache = { record, width, signature, density: Boolean(density), frames: new Map(ORF_FRAMES.map(frame => [frame,
        packOrfOverviewMarks(candidates.filter(orf => orf.frame === frame).map(orf => geometry(orf, project,
          rows.length <= ORF_MAP_ARROW_LIMIT ? 1 : view[0], rows.length <= ORF_MAP_ARROW_LIMIT ? record.length : view[1])), 4)
      ])) };
    }
    svg.dataset.mapMode = density ? 'density' : 'arrows';
    svg.dataset.visibleOrfs = model.visible.length;
    const liveDensity = new Set();
    const pxPerBase = (right-left)/span;
    sequenceMap.begin({ record, options: data.options, settings: display, left, right, start: view[0]-1, end: view[1], pxPerBase,
      toX: position => left + (position - (view[0]-1))/span*(right-left) });
    let y = 18;
    // Both DNA rows have a permanent slot between the two ORF strand groups.
    // Revealing bases never changes track positions or the figure height.
    svg.dataset.sequenceDetail = String(pxPerBase >= 10);
    svg.dataset.orfTracksStart = y;
    const regions = [];
    for (const frame of ORF_FRAMES) {
      const packed = packingCache.frames.get(frame);
      const height = largeMap ? 56 : packed.laneCount * 24 + 8;
      const trackY = y;
      const { group, band, label, densityLayer } = frameNodes.get(frame);
      for (const [key, value] of Object.entries({ x: left, y, width: right-left, height })) band.setAttribute(key, value);
      label.setAttribute('y', y + 20);
      if (density) for (const bin of density.bins.filter(item => item.frame === frame)) {
        const key = `${frame}:${bin.index}`; liveDensity.add(key);
        let nodes = densityNodes.get(key);
        if (!nodes) {
          const target = svgNode('g', { class: 'orf-explorer-density', role: 'button', tabindex: bin.index === 0 ? 0 : -1,
            'data-density-bin': key, 'data-sms3-inspection-highlight': 'none' });
          const hit = svgNode('rect', { fill: 'transparent' });
          const complete = svgNode('rect', { class: 'orf-explorer-density-complete' });
          const partial = svgNode('rect', { class: 'orf-explorer-density-partial' });
          target.append(svgNode('title', {}, 'ORF density'), hit, complete, partial);
          target.addEventListener('click', () => zoomDensity(target));
          target.addEventListener('keydown', event => {
            if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); zoomDensity(target); }
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault(); event.stopPropagation();
              const targets = [...densityLayer.children].filter(item => item.style.display !== 'none');
              let index = targets.indexOf(target) + (event.key === 'ArrowLeft' ? -1 : 1);
              if (event.key === 'Home') index = 0;
              if (event.key === 'End') index = targets.length - 1;
              targets[(index + targets.length) % targets.length]?.focus({ preventScroll: true });
            }
          });
          densityLayer.append(target); nodes = { target, hit, complete, partial }; densityNodes.set(key, nodes);
        }
        const { target, hit, complete, partial } = nodes;
        target.style.display = '';
        Object.assign(target.dataset, { start: bin.start, end: bin.end, complete: bin.complete, partial: bin.partial });
        const title = `${count(bin.start)}–${count(bin.end)} bp; frame: ${frame}; overlapping ORFs: ${count(bin.complete + bin.partial)}; complete: ${count(bin.complete)}; partial: ${count(bin.partial)}. Zoom to this interval.`;
        target.setAttribute('aria-label', title); target.dataset.sms3TitleText = title;
        if (!target.hasAttribute('data-sms3-title-mark')) setUiText(target.querySelector('title'), title);
        const x1 = Math.max(left, x(bin.start - 1)), x2 = Math.min(right, x(bin.end));
        const completeHeight = bin.complete / density.maximum * 20, partialHeight = bin.partial / density.maximum * 20;
        for (const [rect, top, barHeight] of [[hit, trackY, 26], [complete, trackY + 24 - completeHeight, completeHeight], [partial, trackY + 24 - completeHeight - partialHeight, partialHeight]]) {
          for (const [attribute, value] of Object.entries({ x: x1, y: top, width: Math.max(0, x2 - x1 - .5), height: barHeight })) rect.setAttribute(attribute, value);
        }
      }
      for (const { orf, lane } of packed.marks) {
        let nodes = markNodes.get(orf);
        if (!nodes) {
          const mark = svgNode('path', { class: `orf-explorer-mark ${orf.complete ? 'complete' : 'partial'}`, 'data-orf-id': orf.id,
            'data-sms3-inspection-highlight': 'none', 'data-frame': frame, role: 'button', tabindex: 0,
            'aria-label': `Select ORF ${orf.id}, frame ${frame}, ${orf.start}–${orf.end}` });
          mark.append(svgNode('title', {}, 'ORF'));
          mark.addEventListener('click', () => selectOrf(orf));
          mark.addEventListener('keydown', event => {
            if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); selectOrf(orf); }
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault(); event.stopPropagation();
              const targets = [...svg.querySelectorAll('[data-orf-id]')].filter(item => item.style.display !== 'none');
              let index = targets.indexOf(mark) + (event.key === 'ArrowLeft' ? -1 : 1);
              if (event.key === 'Home') index = 0;
              if (event.key === 'End') index = targets.length - 1;
              targets[(index + targets.length) % targets.length]?.focus({ preventScroll: true });
            }
          });
          const label = svgNode('text', { class: 'orf-explorer-mark-label' }, `ORF ${orf.id}`);
          const shapeClip = svgNode('clipPath', { id: `${glowId}-orf-${record.recordIndex}-${orf.id}` });
          const shapePath = svgNode('path', {}); shapeClip.append(shapePath); defs.append(shapeClip);
          group.append(mark, label); nodes = { mark, label, shapeClip, shapePath }; markNodes.set(orf, nodes);
        }
        const { mark, label, shapeClip, shapePath } = nodes;
        const inView = orf.end > view[0] - 1 && orf.start - 1 < view[1];
        mark.style.display = inView ? '' : 'none';
        label.style.display = 'none';
        mark.setAttribute('data-lane', lane);
        if (!inView) continue;
        const { x1, x2, tiny } = geometry(orf, x, view[0], view[1]);
        const center = density ? trackY + 34 : trackY + 16 + lane * 24, half = density ? 7 : 8, head = Math.min(8, (x2 - x1) / 2);
        // Only a visible coding-direction endpoint gets an arrowhead. A cut
        // through an ORF at the viewport edge remains flat.
        const endpointVisible = orf.strand === '-' ? orf.start >= view[0] : orf.end <= view[1];
        const d = !endpointVisible ? `M${x1} ${center-half} H${x2} V${center+half} H${x1} Z` : orf.strand === '-'
          ? `M${x2} ${center-half} H${x1+head} L${x1} ${center} L${x1+head} ${center+half} H${x2} Z`
          : `M${x1} ${center-half} H${x2-head} L${x2} ${center} L${x2-head} ${center+half} H${x1} Z`;
        mark.setAttribute('d', d);
        shapePath.setAttribute('d', d);
        const title = `ORF ${orf.id}; frame: ${frame}; coordinates: ${count(orf.start)}–${count(orf.end)}; length: ${count(orf.ntLength)} bp / ${count(orf.aaLength)} aa; status: ${orf.complete ? 'complete' : 'partial; no terminal stop'}${tiny ? '; displayed with a minimum-width marker' : ''}`;
        // Shared inspection consumes SVG titles; keep its source in sync without
        // replacing focused marks or the original touch targets during a pinch.
        mark.dataset.sms3TitleText = title;
        if (!mark.hasAttribute('data-sms3-title-mark')) setUiText(mark.querySelector('title'), title);
        const labelWidth = label.textContent.length * 7;
        const showLabel = x2 - x1 > labelWidth + 28;
        const translated = sequenceMap.orf(orf, { x1, x2, y: center, height: half*2, labelWidth: showLabel ? labelWidth : 0, inView, shapeClipId: shapeClip.id });
        if (showLabel && !translated) {
          label.style.display = ''; label.setAttribute('x', (x1+x2)/2); label.setAttribute('y', center+4);
        }
        regions.push({ shape: 'rect', x1, x2, y1: center-half, y2: center+half,
          target: { ...orf, trackId: 'orfs', featureId: String(orf.id), kind: 'interval' } });
      }
      y += height + 5;
      if (frame === '+3') {
        sequenceMap.dna(y + 12);
        y += 58;
      }
    }
    for (const [key, nodes] of densityNodes) if (!liveDensity.has(key)) {
      nodes.target.style.display = 'none';
      if (!navigation?.isInteracting()) { nodes.target.remove(); densityNodes.delete(key); }
      else retainedMapNodes = true;
    }
    y += 6;
    const ticksLayer = document.createDocumentFragment();
    ticksLayer.append(svgNode('line', { x1: left, x2: right, y1: y, y2: y, class: 'orf-explorer-axis' }));
    const first = Math.max(1, Math.floor(view[0])), last = Math.min(record.length || 1, Math.ceil(view[1]));
    const ticks = layoutLinearRulerLabels({viewStart:view[0]-1,viewEnd:view[1]},left,right,text=>rulerMeasure.measureText(text).width);
    for (const tick of ticks) {
      const tx = tick.x;
      ticksLayer.append(svgNode('line', { x1: tx, x2: tx, y1: y, y2: y+5, class: 'orf-explorer-axis' }));
      if(tick.showLabel) ticksLayer.append(svgNode('text', { x: tick.labelX, y: y+19, 'text-anchor': 'middle', class: 'orf-explorer-axis-label' }, tick.text));
    }
    ruler.replaceChildren(ticksLayer);
    const height = y + 30;
    svg.setAttribute('width', width); svg.setAttribute('height', height); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.dataset.viewStart = view[0] - 1; svg.dataset.viewEnd = view[1];
    svg.dataset.plotLeft = left; svg.dataset.plotRight = right;
    for (const [key, value] of Object.entries({ x: left, y: 0, width: right-left, height })) sequenceClipRect.setAttribute(key,value);
    retainedMapNodes = sequenceMap.finish(navigation?.isInteracting()) || retainedMapNodes;
    for (const filter of glowFilters) { filter.setAttribute('height', y+54); filter.setAttribute('width', width+24); }
    mapLayout = { width, plotLeft: left, plotRight: right, regions };
    setUiText(rangeText, `${count(first)}–${count(last)} bp · ${count(model.visible.length)} of ${orfCount(rows.length)} in view · ${density
      ? `density: ORFs overlapping each ${count(density.binSize)} bp interval (scale 0–${count(density.maximum)}); selected ORF shown below its track`
      : 'chevrons indicate coding direction'}`);
    updateSelection();
  }
  function zoomDensity(target) {
    navigation.reset();
    const start = Number(target.dataset.start), end = Number(target.dataset.end);
    const center = (start + end) / 2, span = Math.max(Math.min(10, record.length), end - start + 1);
    const low = Math.max(1, Math.min(record.length - span + 1, center - (span - 1) / 2));
    view = [low, low + span - 1]; drawMap();
    svg.focus({ preventScroll: true });
  }
  function renderDetails() {
    const oldScroll = details.scrollTop;
    const focusedLabel = details.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    details.replaceChildren();
    if (!selected) { details.append(node('p', 'orf-explorer-muted orf-explorer-detail-empty', 'Select an ORF to inspect its DNA and protein.')); return; }
    const orf = selected;
    const title = node('div', 'interactive-sequence-viewer-inspector-header orf-explorer-detail-title');
    title.append(node('h5', '', `ORF ${orf.id}`), node('span', 'orf-explorer-muted', 'DNA & protein'), node('span', `orf-explorer-badge ${orf.complete ? 'complete' : 'partial'}`, orf.complete ? 'Complete' : 'Partial'));
    const detailBody = node('div', 'interactive-sequence-viewer-inspector-body');
    const factsCard = node('div', 'dna-viewer-selection-panel');
    const facts = node('dl', 'orf-explorer-facts');
    for (const [label, value] of [['Coordinates', `${count(orf.start)}–${count(orf.end)}`], ['Strand / frame', `${orf.strand === '+' ? 'Forward' : 'Reverse'} / ${orf.frame}`], ['Length', `${count(orf.ntLength)} bp · ${count(orf.aaLength)} aa`], ['Start / stop', `${orf.startCodon} / ${orf.stopCodon || 'none'}`]]) {
      facts.append(node('dt', '', label), node('dd', '', value));
    }
    factsCard.append(facts); detailBody.append(factsCard); details.append(title, detailBody);
    const chunk = orfSequencePage(record, orf, data.options, sequencePage);
    const sequenceNav = node('div', 'orf-explorer-sequence-pager dna-viewer-buttons');
    if (chunk.pageCount > 1) {
      const previous = button('Previous', () => { sequencePage--; renderDetails(); }, 'Previous sequence page'); previous.disabled = !sequencePage;
      const next = button('Next', () => { sequencePage++; renderDetails(); }, 'Next sequence page'); next.disabled = sequencePage >= chunk.pageCount - 1;
      sequenceNav.append(previous, node('span', '', `Sequence page ${count(sequencePage + 1)} of ${count(chunk.pageCount)}`), next);
      detailBody.append(sequenceNav);
    }
    for (const [molecule, label, text, length, offset] of [['dna', 'ORF DNA', chunk.dna, orf.ntLength, chunk.offset], ['protein', 'Protein translation', chunk.protein, orf.aaLength, chunk.offset/3]]) {
      const section = node('section', 'dna-viewer-selection-panel orf-explorer-sequence');
      const heading = node('div', 'orf-explorer-sequence-heading');
      heading.append(node('strong', '', label), node('span', 'orf-explorer-muted', text.length ? `${count(offset+1)}–${count(offset+text.length)} of ${count(length)}` : 'No residues on this page'));
      const sequence = node('pre', 'orf-explorer-sequence-text', text);
      sequence.tabIndex = 0; sequence.setAttribute('role', 'region'); sequence.setAttribute('aria-label', label);
      const actions = node('div', 'dna-viewer-buttons');
      actions.append(
        button(molecule === 'dna' ? 'Copy DNA' : 'Copy protein', event => exportSequences(event.currentTarget, molecule, orf, false)),
        button('Copy FASTA', event => exportSequences(event.currentTarget, molecule, orf, true, true), `Copy ${molecule} FASTA for ORF ${orf.id}`),
        button('Download FASTA', event => exportSequences(event.currentTarget, molecule, orf), `Download ${molecule} FASTA for ORF ${orf.id}`)
      );
      section.append(heading, sequence, actions); detailBody.append(section);
    }
    detailBody.append(node('p', 'orf-explorer-muted orf-explorer-sequence-note', `Sequences run 5′→3′ in coding direction. DNA includes a terminal stop when present; protein omits it. NCBI translation table ${data.options.geneticCode}. Copy and download include the full ORF.`));
    details.scrollTop = oldScroll;
    if (focusedLabel) {
      const control = [...details.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === focusedLabel);
      if (control && !control.disabled) control.focus({ preventScroll: true });
      else { details.tabIndex = -1; details.focus({ preventScroll: true }); }
    }
  }
  async function exportSequences(control, molecule, orf = null, fasta = true, copyFasta = false) {
    if (exportRun) return;
    clearExportStatus();
    const selectedRecords = orf ? [{ ...record, orfs: [orf] }] : [record];
    const destination = !fasta || copyFasta ? 'copy' : 'download';
    const filename = `orf-finder-record-${record.recordIndex}${orf ? `-orf-${orf.id}` : ''}-${molecule}.fasta`;
    statusText.textContent = `Preparing ${molecule === 'dna' ? 'DNA' : 'protein'} sequences…`;
    control.disabled = true; control.setAttribute('aria-busy', 'true');
    // Copy feedback may change its own label; reserve the original width so
    // neighbouring download buttons never move. Downloads keep their labels.
    if (destination === 'copy') control.style.minWidth = `${control.getBoundingClientRect().width}px`;
    try {
      exportRun = worker.runTool({ toolId: 'orf-explorer-export', input: '', options: { molecule, fasta, data: { records: selectedRecords, ...data.options } },
        onProgress: progress => { if (!disposed && progress.progress != null) statusText.textContent = `Preparing sequences… ${Math.round(progress.progress * 100)}%`; } });
      updateRecord();
      // Only longer exports need progress/cancellation. The top-layer status is
      // outside layout, so it cannot move any buttons, panels or page content.
      exportStatusTimer = setTimeout(() => {
        if (!disposed && exportRun) { cancel.hidden = false; exportStatus.showPopover(); }
      }, 250);
      // Start the clipboard request in the click's activation window (Safari).
      // Sequence generation stays in the worker; ClipboardItem accepts a promise.
      const clipboardWrite = destination === 'copy' && navigator.clipboard?.write && globalThis.ClipboardItem
        ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': exportRun.promise.then(result => new Blob([result.output], { type: 'text/plain' })) })])
        : null;
      clipboardWrite?.catch(() => {});
      const result = await exportRun.promise;
      if (disposed) return;
      if (clipboardWrite) { await clipboardWrite; showCopiedFeedback(control); }
      else if (destination === 'copy') await copyTextWithFeedback(control, result.output);
      else downloadText(result.output, filename, 'text/x-fasta');
      clearExportStatus();
    } catch (error) {
      if (!disposed) {
        if (error.name === 'AbortError') clearExportStatus();
        else showExportError(error);
      }
    } finally {
      exportRun = null;
      clearTimeout(exportStatusTimer);
      if (!disposed) { cancel.hidden = true; control.disabled = false; control.removeAttribute('aria-busy'); updateRecord(); }
    }
  }
  navigation = installOrfExplorerNavigation(svg, {
    surface: map, getRecord: () => record,
    getView: () => ({ viewStart: view[0] - 1, viewEnd: view[1] }),
    setView: next => { view = [next.viewStart + 1, next.viewEnd]; drawMap(); },
    getLayout: () => mapLayout,
    onNavigate: () => inspectionCleanup.hide?.(),
    onIdle: () => {
      if (disposed || !retainedMapNodes) return;
      cancelAnimationFrame(idleFrame);
      idleFrame = requestAnimationFrame(() => { if (!disposed && !navigation.isInteracting()) drawMap(); });
    },
    onTap: event => {
      const mark = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-orf-id], [data-orf-select], [data-density-bin]');
      if (!mark || !svg.contains(mark)) return;
      if (mark.hasAttribute('data-density-bin')) { zoomDensity(mark); return; }
      const orf = rows.find(item => item.id === Number(mark.dataset.orfId ?? mark.dataset.orfSelect));
      if (orf) selectOrf(orf);
    }
  });
  updateRecord(); updateRows();
  inspectionCleanup = installVisualInspection(map, { allowPin: false,
    isInteractionSuppressed: event => navigation.isInteracting() || event?.pointerType === 'touch' || Boolean(event?.buttons)
  });
  let lastWidth = map.clientWidth;
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    if (map.clientWidth === lastWidth) return;
    lastWidth = map.clientWidth;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (!disposed) drawMap(); });
  });
  resize.observe(map);
  resize.observe(root);
  const themeChanged = () => { if (!disposed) drawMap(); };
  window.addEventListener('sms3-theme-change', themeChanged);
  const existingCleanup = container._sms3VisualCleanup;
  container._sms3VisualCleanup = () => {
    disposed = true; clearExportStatus(); resize.disconnect(); window.removeEventListener('sms3-theme-change', themeChanged); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(idleFrame); navigation.cleanup(); inspectionCleanup(); worker.terminate(); existingCleanup?.();
  };
}
