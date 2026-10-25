// A single native input stays mounted while the SVG preview redraws. Keeping it
// outside the SVG also keeps editing controls out of image exports.
export function createCanvasLabelEditor(viewport, { target, read, write, maxLength }) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'canvas-label-input';
  input.setAttribute('aria-label', 'Edit label on canvas');
  input.maxLength = maxLength;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('writingsuggestions', 'false');
  input.hidden = true;
  viewport.append(input);
  const measure = document.createElement('canvas').getContext('2d');
  let id, hiddenText, previousVisibility, composing = false, lastTap;
  function reveal() {
    if (hiddenText) hiddenText.style.visibility = previousVisibility;
    hiddenText = null;
  }
  function close() {
    id = undefined;
    reveal();
    input.hidden = true;
  }
  function refresh() {
    if (!id) return;
    reveal();
    const text = target(id);
    if (!text?.isConnected) { close(); return; }
    const bounds = text.getBoundingClientRect(), host = viewport.getBoundingClientRect();
    const style = getComputedStyle(text), matrix = text.getScreenCTM();
    const fontSize = Math.max(12, parseFloat(style.fontSize) * Math.hypot(matrix.a, matrix.b));
    input.style.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    measure.font = input.style.font;
    const left = bounds.left - host.left + viewport.scrollLeft - viewport.clientLeft - 4;
    const available = viewport.scrollWidth - Math.max(0, left) - 8;
    input.style.left = `${Math.max(4, left)}px`;
    input.style.top = `${Math.max(4, bounds.top - host.top + viewport.scrollTop - viewport.clientTop - 5)}px`;
    input.style.width = `${Math.min(Math.max(80, measure.measureText(input.value || ' ').width + 18), Math.max(80, available))}px`;
    input.style.height = `${fontSize * 1.35 + 10}px`;
    previousVisibility = text.style.visibility;
    hiddenText = text;
    text.style.visibility = 'hidden';
  }
  function start(key, selectAll = false) {
    lastTap = undefined;
    close();
    if (!target(key)) return;
    id = key;
    input.value = read(id);
    input.hidden = false;
    refresh();
    input.focus({ preventScroll: true });
    if (selectAll) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }
  function update() {
    if (!id || composing) return;
    // Preserve the caret when a rejected edit restores the last valid value.
    if (!write(id, input.value)) input.value = read(id);
    refresh();
  }
  input.addEventListener('input', update);
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; update(); });
  input.addEventListener('blur', close);
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'click'])
    input.addEventListener(type, event => event.stopPropagation());
  input.addEventListener('keydown', event => {
    // Let the document's existing Undo/Redo shortcuts handle model history.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) return;
    event.stopPropagation();
    if (!event.isComposing && ['Enter', 'Escape'].includes(event.key)) {
      event.preventDefault();
      close();
      viewport.focus({ preventScroll: true });
    }
  });
  // Redrawing SVG selection can replace the original click target before the
  // browser emits dblclick. Track completed label taps by identity instead.
  const host = viewport.closest('.text-table-image-editor') ?? viewport;
  const resetTap = () => { lastTap = undefined; };
  const outsideTap = event => { if (!event.composedPath().includes(viewport)) resetTap(); };
  host.addEventListener('keydown', resetTap, true);
  host.addEventListener('pointerdown', outsideTap, true);
  function pointerSelection(event, key) {
    if (event.type !== 'pointerup' || !key || !target(key)) { resetTap(); return; }
    if (lastTap?.key === key && lastTap.type === event.pointerType &&
        event.timeStamp - lastTap.time < 400 && Math.hypot(event.clientX-lastTap.x, event.clientY-lastTap.y) < 5) {
      start(key);
    } else lastTap = { key, type:event.pointerType, time:event.timeStamp, x:event.clientX, y:event.clientY };
  }
  function selectionKey(event, key) {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
        (event.key !== 'Enter' && event.key.length !== 1) || !target(key)) return false;
    event.preventDefault();
    start(key);
    // A selected label can still be edited just by typing. Backspace/Delete
    // remain object shortcuts until the text input has actually been opened.
    if (event.key !== 'Enter') {
      input.setRangeText(event.key, input.selectionStart, input.selectionEnd, 'end');
      update();
    }
    return true;
  }
  return { start, close, refresh, selectionKey, pointerSelection, dispose() {
    host.removeEventListener('keydown', resetTap, true);
    host.removeEventListener('pointerdown', outsideTap, true);
    close(); input.remove();
  } };
}
