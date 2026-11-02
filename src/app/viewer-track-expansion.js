import { getViewerTrackKey, getViewerTargetClientPosition, viewerTargetsMatch, makeViewerItemTargetDetails } from './dna-viewer-interactions.js';

export function scrollViewerTargetIntoSurface(state, target, canvas, surface) {
  const region = state.hitRegions?.find(entry => viewerTargetsMatch(target, entry.target));
  const point = getViewerTargetClientPosition(state, region?.target, canvas);
  if (!point) return;
  const bounds = surface.getBoundingClientRect();
  if (point.clientX < bounds.left + 16 || point.clientX > bounds.left + surface.clientWidth - 16) {
    surface.scrollLeft += point.clientX - bounds.left - surface.clientWidth / 2;
  }
  if (point.clientY < bounds.top + 16 || point.clientY > bounds.top + surface.clientHeight - 16) {
    surface.scrollTop += point.clientY - bounds.top - surface.clientHeight / 2;
  }
}

// Native buttons keep overflow actions separate from scientific hit targets and
// canvas pan/selection gestures. Reuse nodes during redraws to retain focus.
export function createViewerOverflowControls(canvas, state, onChange, { circular = false, onSelect, protein = false } = {}) {
  const element = document.createElement('div');
  element.className = 'dna-viewer-overflow-controls';
  element.setAttribute('aria-label', 'Feature display');
  const notices = document.createElement('div');
  notices.className = 'visually-hidden';
  notices.setAttribute('role', 'status');
  notices.setAttribute('aria-label', 'Feature visibility');
  notices.hidden = true;
  const buttons = new Map();
  const browser = document.createElement('section');
  browser.className = 'dna-viewer-hidden-browser';
  browser.setAttribute('aria-label', 'Hidden features');
  browser.hidden = true;
  const heading = document.createElement('strong');
  heading.textContent = 'Hidden features';
  const trackLabel = document.createElement('div'); trackLabel.className = 'dna-viewer-hidden-track';
  const title = document.createElement('div'); title.append(heading, trackLabel);
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Close'; close.setAttribute('aria-label', 'Close hidden features');
  const header = document.createElement('div'); header.className = 'dna-viewer-hidden-header'; header.append(title, close);
  const help = document.createElement('p'); help.className = 'dna-viewer-hidden-help';
  help.textContent = 'Use the target icon to show a feature in the map and inspect its details.';
  const filter = document.createElement('input');
  filter.type = 'search'; filter.placeholder = 'Find hidden features'; filter.setAttribute('aria-label', 'Find hidden features');
  const countLabel = document.createElement('div'); countLabel.className = 'dna-viewer-hidden-count'; countLabel.setAttribute('role', 'status');
  const list = document.createElement('ul'); list.className = 'dna-viewer-hidden-list';
  const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Show 50 more';
  browser.append(header, help, filter, countLabel, list, next);
  let opened = null, page = 0, returnButton = null;
  function closeBrowser() {
    browser.hidden = true;
    (returnButton?.isConnected && !returnButton.hidden ? returnButton : canvas).focus({ preventScroll: true });
  }
  close.addEventListener('click', closeBrowser);
  browser.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeBrowser(); } });
  function renderList() {
    const query = filter.value.trim().toLowerCase();
    const entries = opened.items.filter(({ item }) => [item.label, item.name, item.type, item.start, item.end].join(' ').toLowerCase().includes(query));
    const end = (page + 1) * 50;
    countLabel.textContent = entries.length ? `1–${Math.min(entries.length, end)} of ${entries.length.toLocaleString()} hidden features` : 'No matching hidden features';
    list.replaceChildren();
    for (const { item, itemIndex } of entries.slice(0, end)) {
      const label = item.label || item.name || item.type || 'Feature';
      const type = item.type || item.featureType;
      const coordinates = `${Number(item.start).toLocaleString()}–${Number(item.end).toLocaleString()}`;
      const row = document.createElement('li'); row.className = 'dna-viewer-hidden-item';
      const description = document.createElement('div'); description.className = 'dna-viewer-hidden-description';
      const name = document.createElement('strong'); name.textContent = label;
      const metadata = document.createElement('span'); metadata.textContent = `${type ? `${type} · ` : ''}${coordinates}`;
      description.append(name, metadata);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'dna-viewer-hidden-show';
      button.setAttribute('aria-label', `Show and inspect ${label}${type && label !== type ? ` (${type})` : ''}, ${coordinates}`);
      button.title = 'Show in map and inspect details';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>';
      button.addEventListener('click', () => {
        const track = opened.track;
        state.expandedTrackIds.add(getViewerTrackKey(track));
        onSelect?.({ kind: 'interval', type: track.label || track.type, featureType: item.type || item.featureType,
          trackId: track.id || track.type, itemIndex, ...item, ...makeViewerItemTargetDetails(item), alphabet: protein ? 'protein' : 'dna-rna' });
        closeBrowser();
      });
      row.append(description, button); list.append(row);
    }
    next.hidden = end >= entries.length;
  }
  filter.addEventListener('input', () => { page = 0; renderList(); });
  next.addEventListener('click', () => { const top = list.scrollTop; page++; renderList(); list.scrollTop = top; });
  function getButton(key, label, callback) {
    let button = buttons.get(key);
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'dna-viewer-overflow-button';
      button.addEventListener('click', () => button.action());
      buttons.set(key, button); element.append(button);
    }
    button.textContent = label; button.action = callback; button.hidden = false;
    return button;
  }
  state.syncTrackOverflow = () => {
    notices.textContent = state.featureVisibilityText || '';
    notices.hidden = !notices.textContent;
    const visible = new Set();
    for (const entry of state.trackOverflows ?? []) {
      const { track, action, hidden = [] } = entry;
      const key = getViewerTrackKey(track), label = track.label || track.type || 'Features';
      if (action) {
        visible.add(key);
        const button = getButton(key, action.label, () => {
          if (action.expand) state.expandedTrackIds.add(key);
          else state.expandedTrackIds.delete(key);
          onChange();
        });
        button.setAttribute('aria-label', `${action.label} in ${label}`);
        button.title = `${label}: ${action.title}`;
      }
      const items = [...new Map(hidden.map(copy => [copy.itemIndex, copy])).values()];
      if (items.length) {
        const hiddenKey = `${key}:hidden`; visible.add(hiddenKey);
        const text = `View ${items.length.toLocaleString()} hidden features`;
        const button = getButton(hiddenKey, text, () => {
          opened = { track, items }; page = 0; filter.value = ''; returnButton = button;
          trackLabel.textContent = label; browser.hidden = false; renderList(); filter.focus({ preventScroll: true });
        });
        button.setAttribute('aria-label', `${text} in ${label}`);
        button.title = `${label}: available ${circular ? 'rings' : 'rows'} are filled. Zoom in, filter types, or choose a feature from this list.`;
      }
    }
    for (const [key, button] of buttons) {
      button.hidden = !visible.has(key);
      if (button.hidden && document.activeElement === button) canvas.focus({ preventScroll: true });
    }
    element.hidden = visible.size === 0;
    if (!browser.hidden && opened) {
      const entry = (state.trackOverflows ?? []).find(entry => entry.track === opened.track);
      const current = [...new Map((entry?.hidden ?? []).map(copy => [copy.itemIndex, copy])).values()];
      if (!current.length) closeBrowser();
      else if (current.length !== opened.items.length || current.some((copy, i) => copy.item !== opened.items[i]?.item)) {
        opened.items = current; page = 0; renderList();
      }
    }
    state.syncTrackControls?.();
  };
  element.hidden = true;
  return { element, notices, browser };
}
