import { containerType } from '../core/file-container.js';
import { inspectFileSample, hasBinaryCharacters } from '../core/file-preview-content.js';

export function createFilePreviewOptionsController({ elements, state }) {
  let cachedDetection = null;
  let revision = 0, inspected = null;
  const selectedFile = () => elements.inputPanel.querySelector('input[name="fileSourceMode"]:checked')?.value === 'file'
    ? elements.inputPanel.querySelector('#previewFile')?.files?.[0] : null;
  const entryValue = () => elements.toolOptions.querySelector('#archiveEntry')?.value ?? '';
  elements.toolOptions.addEventListener('sms3-result-option-choices', ({ detail }) => {
    if (state.selectedTool?.metadata.id !== 'file-archive-preview') return;
    inspected = detail.reset ? null : { file: selectedFile(), entry: entryValue(), text: elements.sequenceInput.value, kind: detail.streams?.primary?.contentKind };
    update();
  });
  elements.toolOptions.addEventListener('change', update);

  function update() {
    const current = ++revision;
    if (state.selectedTool?.metadata.id !== 'file-archive-preview') return;
    const region = elements.toolOptions.querySelector('[data-option-id="region"]');
    if (!region) return;
    const file = selectedFile(), entry = elements.toolOptions.querySelector('#archiveEntry');
    const fileMode = elements.inputPanel.querySelector('input[name="fileSourceMode"]:checked')?.value === 'file';
    if (entry) entry.closest('[data-option-id]').hidden = !fileMode || entry.options.length < 2;
    let note = elements.toolOptions.querySelector('#filePreviewRegionNote');
    if (!note) {
      note = document.createElement('p');note.id = 'filePreviewRegionNote';note.className = 'option-note';note.setAttribute('role', 'status');region.after(note);
    }
    const currentInspection = inspected && inspected.file === file && inspected.entry === entryValue() && (file || inspected.text === elements.sequenceInput.value) ? inspected.kind : null;
    const apply = (container, kind, pending = false, unreadable = false) => {
      if (current !== revision || !region.isConnected || state.selectedTool?.metadata.id !== 'file-archive-preview') return;
      const contentKind = currentInspection ?? kind;
      region.hidden = Boolean(container) || pending || unreadable;
      for (const [id, shown, value] of [['lines', ['text','mixed'].includes(contentKind), 50], ['bytes', ['binary','mixed'].includes(contentKind), 800]]) {
        const input = elements.toolOptions.querySelector(`#${id}`);
        if (!input) continue;
        const hidden = pending || unreadable || !shown;
        input.closest('[data-option-id]').hidden = hidden;input.disabled = hidden;
        if (hidden) input.value = String(value);
      }
      for (const input of region.querySelectorAll('input')) {
        input.disabled = pending || unreadable || Boolean(container && input.value !== 'head');
        if (container || pending || unreadable) input.checked = input.value === 'head';
      }
      note.hidden = !container && !pending && !unreadable;
      note.textContent = pending ? 'Checking file type…' : unreadable ? 'File type could not be read. Run will report the file-reading error.'
        : container === 'gzip' ? 'Compressed content is previewed from the beginning.'
        : container ? `Entries in .${container} files are previewed from the beginning.` : '';
    };
    if (!file) { cachedDetection = null;apply(null, fileMode ? null : hasBinaryCharacters(elements.sequenceInput.value) ? 'binary' : 'text');return; }
    let detection = cachedDetection?.file === file ? cachedDetection : null;
    if (!detection) {
      // Retain this selection while active: WebKit can recreate weakly held File wrappers.
      detection = { file };
      detection.promise = file.slice(0, 512).arrayBuffer().then(async buffer => {
        const bytes = new Uint8Array(buffer);
        detection.container = containerType(bytes, file.name);
        detection.kind = detection.container ? null : (await inspectFileSample(bytes)).binary ? 'binary' : 'text';
        detection.complete = true;
      }).catch(() => { detection.unreadable = true;detection.complete = true; });
      cachedDetection = detection;
    }
    if (detection.complete) apply(detection.container, detection.kind, false, detection.unreadable);
    else { apply(null, null, true);detection.promise.then(() => apply(detection.container, detection.kind, false, detection.unreadable)); }
  }
  return { update };
}
