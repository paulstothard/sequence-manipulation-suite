import { copyTextWithFeedback } from './copy-feedback.js';
import { downloadText } from './file-download.js';
import { findOutputMatches, getNextSearchIndex } from './output-search.js';
import { createOutputSearchControls, updateOutputSearchControls } from './output-search-ui.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function renderFilePreview(parent, preview) {
  const root = element('div', 'file-preview');
  if (preview.name) root.append(element('p', 'file-preview-name', preview.name));
  const cleanups = [];
  for (const [index, section] of preview.sections.entries()) {
    if (index && preview.separation) root.append(element('p', 'file-preview-separation', preview.separation));
    const panel = element('section', 'file-preview-section');panel.dataset.region = section.key;
    const heading = element('h4', 'output-region-heading', section.label);
    const count = section.kind === 'binary' ? `${section.byteCount} bytes (limit ${section.requested})` : `${section.lineCount} source lines (limit ${section.requested})`;
    const range = section.kind === 'binary' ? `Starting at byte offset ${section.offset}.`
      : section.startLine != null && section.lineCount ? `Source lines ${section.startLine}–${section.endLine}.`
      : section.lineCount ? 'Absolute source line numbers are unknown for this end sample.' : 'The file or member is empty.';
    panel.append(heading, element('p', 'file-preview-scope', `${section.partial ? 'Partial preview' : 'Complete file content'} · ${count}. ${range}`));
    if (section.fragment) panel.append(element('p', 'file-preview-notice', 'The byte limit falls inside a source line. This excerpt includes a line fragment.'));
    if (section.lines.some(line => line.shortened)) panel.append(element('p', 'file-preview-notice', 'Long lines are shortened on screen. Copy and download preserve all sampled text. Find searches the displayed portion.'));
    const actions = element('div', 'output-action-row');
    const copy = element('button', '', `Copy ${section.key}`);copy.type = 'button';
    copy.addEventListener('click', () => copyTextWithFeedback(copy, section.text));
    const download = element('button', '', `Download ${section.key}${section.kind === 'binary' ? ' hex' : ''}`);download.type = 'button';
    download.addEventListener('click', () => downloadText(section.text, section.filename, 'text/plain;charset=utf-8'));
    actions.append(download, copy);panel.append(actions);
    const controls = createOutputSearchControls(`Search ${section.key} excerpt`);
    const { input, previous, next } = controls;
    panel.append(controls.row);
    const viewer = element('div', 'output-viewer');
    const lines = element('div', 'output-text file-preview-lines');lines.tabIndex = 0;lines.setAttribute('role','region');lines.setAttribute('aria-label', `${section.label} ${section.kind === 'binary' ? 'bytes' : 'source lines'}`);
    const cells = section.lines.map(line => {
      const row = element('div', 'file-preview-line');
      if (section.kind === 'text') {
        const number = element('span', 'file-preview-line-number', line.number ?? '—');number.setAttribute('aria-hidden','true');row.append(number);
      }
      const content = element('span', 'file-preview-line-text', line.text);row.append(content);
      if (line.fragment || line.shortened) row.append(element('span', 'file-preview-line-note', line.shortened ? 'Display shortened' : 'Line fragment'));
      lines.append(row);return content;
    });
    if (!cells.length) lines.append(element('p', 'file-preview-empty', 'Empty file or member'));
    let timer, matches = [], current = -1;
    function paint(scroll = false) {
      let active = null;
      // Keep dense searches bounded while navigation still visits every match.
      const firstMatch = Math.max(0, current - 250);
      const byRow = new Map();
      for (let index = firstMatch; index < Math.min(matches.length, firstMatch + 500); index++) {
        const match = matches[index];
        if (!byRow.has(match.row)) byRow.set(match.row, []);
        byRow.get(match.row).push({ ...match, index });
      }
      cells.forEach((cell, row) => {
        const text = section.lines[row].text;cell.replaceChildren();let cursor = 0;
        for (const match of byRow.get(row) ?? []) {
          cell.append(document.createTextNode(text.slice(cursor, match.start)));
          const mark = element('mark', match.index === current ? 'current-output-match' : '', text.slice(match.start, match.end));
          if (match.index === current) active = mark;
          cell.append(mark);cursor = match.end;
        }
        cell.append(document.createTextNode(text.slice(cursor)));
      });
      updateOutputSearchControls(controls, matches, current);
      if (matches.length > 500) controls.count.textContent += ' · Highlights near current match';
      if (scroll && active) {
        const box = active.getBoundingClientRect(), viewport = lines.getBoundingClientRect();
        lines.scrollTop += box.top - viewport.top - lines.clientHeight / 2;
        lines.scrollLeft += (box.left + box.right - viewport.left - viewport.right) / 2;
      }
    }
    input.addEventListener('input', () => {clearTimeout(timer);timer = setTimeout(() => {
      matches = section.lines.flatMap((line,row) => findOutputMatches(line.text,input.value,null,'text').map(match => ({...match,row})));
      current = matches.length ? 0 : -1;paint(true);
    },180);});
    previous.addEventListener('click', () => {current = getNextSearchIndex(current,matches.length,-1);paint(true);});
    next.addEventListener('click', () => {current = getNextSearchIndex(current,matches.length,1);paint(true);});
    paint();cleanups.push(() => clearTimeout(timer));
    viewer.append(lines);panel.append(viewer);root.append(panel);
  }
  parent.append(root);
  return () => cleanups.forEach(cleanup => cleanup());
}
