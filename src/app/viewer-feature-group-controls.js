import { getViewerTrackKey, getViewerTrackTypeEntries } from './dna-viewer-interactions.js';

// Explicit groups join isoform tracks; ordinary mixed tracks get one toggle per
// feature type. All controls share the detailed Track settings visibility state.
export function createViewerFeatureGroupControls(record, state, onChange) {
  const groups = new Map();
  for (const [index, track] of (record.tracks ?? []).entries()) {
    if (track.type === 'quantitative' || !track.items?.length) continue;
    const key = getViewerTrackKey(track, index), types = getViewerTrackTypeEntries(track);
    const group = track.visibilityGroup;
    const entries = group?.id && group.label ? [{ id: group.id, label: group.label, types, whole: true }]
      : types.map(entry => ({ id: entry.type === 'item' ? key : `type:${entry.type}`, label: entry.type === 'item' ? track.label : entry.type, types: [entry], whole: false }));
    for (const entry of entries) {
      if (!groups.has(entry.id)) groups.set(entry.id, { label: entry.label, tracks: [] });
      groups.get(entry.id).tracks.push({ key, types: entry.types, whole: entry.whole, allTypes: types });
    }
  }
  if (!groups.size) return null;
  state.hiddenTrackIds ??= new Set();
  state.hiddenTrackItemTypes ??= new Map();
  const element = document.createElement('div');
  element.className = 'dna-viewer-feature-groups';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Feature groups');
  const heading = document.createElement('span');
  heading.className = 'dna-viewer-feature-groups-heading';
  heading.textContent = 'Features';
  element.append(heading);
  const controls = [];
  function visibility(tracks) {
    let any = false, all = true;
    for (const { key, types } of tracks) {
      const hidden = state.hiddenTrackItemTypes.get(key);
      const shown = !state.hiddenTrackIds.has(key);
      any ||= shown && (!types.length || types.some(({ type }) => !hidden?.has(type)));
      all &&= shown && !types.some(({ type }) => hidden?.has(type));
    }
    return { any, all };
  }
  function setVisible(tracks, visible) {
    for (const { key, types, whole, allTypes } of tracks) {
      if (whole) {
        if (visible) { state.hiddenTrackIds.delete(key); state.hiddenTrackItemTypes.delete(key); }
        else state.hiddenTrackIds.add(key);
      } else {
        const hidden = state.hiddenTrackIds.has(key)
          ? new Set(allTypes.map(entry => entry.type)) : new Set(state.hiddenTrackItemTypes.get(key) ?? []);
        state.hiddenTrackIds.delete(key);
        for (const { type } of types) { if (visible) hidden.delete(type); else hidden.add(type); }
        if (hidden.size) state.hiddenTrackItemTypes.set(key, hidden);
        else state.hiddenTrackItemTypes.delete(key);
      }
    }
    sync();
    onChange?.();
  }
  for (const group of groups.values()) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => setVisible(group.tracks, input.checked));
    label.append(input, document.createTextNode(group.label));
    element.append(label);
    controls.push({ input, tracks: group.tracks });
  }
  const allTracks = [...groups.values()].flatMap(group => group.tracks);
  const actions = document.createElement('span');
  actions.className = 'dna-viewer-feature-group-actions';
  const showAll = document.createElement('button'), hideAll = document.createElement('button');
  showAll.type = hideAll.type = 'button';
  showAll.textContent = 'Show all';
  hideAll.textContent = 'Hide all';
  showAll.addEventListener('click', () => setVisible(allTracks, true));
  hideAll.addEventListener('click', () => setVisible(allTracks, false));
  actions.append(showAll, hideAll);
  element.append(actions);
  function sync() {
    for (const { input, tracks } of controls) {
      const { any, all } = visibility(tracks);
      input.checked = all;
      input.indeterminate = any && !all;
    }
    const { any, all } = visibility(allTracks);
    showAll.disabled = all;
    hideAll.disabled = !any;
  }
  sync();
  return { element, sync };
}
