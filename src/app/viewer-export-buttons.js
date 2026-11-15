// The compact PNG/SVG controls used by the sequence viewers.
export function createViewerExportButton(format, { first = false, label = `Download current view as ${format}` } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dna-viewer-export-button';
  if (first) button.classList.add('dna-viewer-export-button-first');
  button.title = label;
  button.setAttribute('aria-label', label);
  const text = document.createElement('span');
  text.className = 'dna-viewer-export-label';
  text.textContent = format;
  button.append(text);
  button.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.25v8"/><path d="m6.9 8.55 3.1 3.1 3.1-3.1"/><path d="M4.25 15.75h11.5"/></svg>');
  return button;
}

export function createViewerFitButton(label = 'Fit full sequence') {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4"/><path d="M16 4h4v4"/><path d="M20 16v4h-4"/><path d="M8 20H4v-4"/><path d="M8 12h8"/></svg>';
  return button;
}
