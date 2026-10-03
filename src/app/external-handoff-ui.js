import { downloadText } from './file-download.js';
import { copyTextWithFeedback } from './copy-feedback.js';

export function openHandoff(plan) {
  if (plan.method === 'POST') {
    const form = document.createElement('form');
    form.action = plan.url; form.method = 'POST'; form.target = '_blank'; form.rel = 'noopener noreferrer'; form.hidden = true;
    for (const [name, value] of Object.entries(plan.fields)) {
      const field = document.createElement('input'); field.type = 'hidden'; field.name = name; field.value = value; form.append(field);
    }
    document.body.append(form); form.submit(); form.remove();
  } else window.open(plan.url, '_blank', 'noopener,noreferrer');
}

export async function sendHandoff(plan, signal) {
  if (signal?.aborted) throw new DOMException('Send cancelled.', 'AbortError');
  if (plan.method !== 'api') { openHandoff(plan); return null; }
  // This runs in the click handler, preserving browser user activation.
  const popup = window.open('about:blank', '_blank');
  if (popup) { popup.opener = null; popup.document.title = 'Opening Proksee'; popup.document.body.textContent = 'Sending genome to Proksee…'; }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 30000);
  try {
    const response = await fetch(plan.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan.body), signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`Proksee returned HTTP ${response.status}.`);
    const result = await response.json();
    if (result.status !== 'success' || !result.url) throw new Error(result.error || 'Proksee did not return a project link.');
    const link = new URL(result.url);
    if (link.origin !== 'https://proksee.ca' || !/^\/projects\/[A-Za-z0-9-]+$/.test(link.pathname)) throw new Error('Proksee returned an unexpected project address.');
    if (popup && !popup.closed) popup.location.replace(link.href);
    return link.href;
  } catch (error) {
    if (popup && !popup.closed) popup.close();
    throw new Error(`${error.name === 'AbortError' ? 'The Proksee request was cancelled or timed out.' : error.message} The request may have reached Proksee; it was not retried. You can download the map JSON and upload it on Proksee.`);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function appendHandoffActions(parent, plan, signal, title = '') {
  const panel = document.createElement('div'); panel.className = 'workflow-handoff';
  if (title) { const heading = document.createElement('h4'); heading.textContent = title; panel.append(heading); }
  const note = document.createElement('p'); note.textContent = plan.instructions;
  const actions = document.createElement('div'); actions.className = 'output-action-row';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const addButton = (label, fn) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', fn); actions.append(button); return button;
  };
  if (plan.input) {
    const copy = addButton(plan.method === 'api' ? 'Copy map JSON' : 'Copy data', async () => {
      try { await copyTextWithFeedback(copy, plan.input); } catch (error) { status.textContent = error.message; }
    });
    addButton(plan.method === 'api' ? 'Download map JSON' : 'Download data', () => downloadText(plan.input, plan.filename, 'text/plain'));
  }
  const send = addButton(plan.actionLabel, async () => {
    send.disabled = true; status.textContent = plan.method === 'api' ? 'Sending genome to Proksee…' : '';
    try {
      const link = await sendHandoff(plan, signal);
      if (signal?.aborted || !panel.isConnected) return;
      status.textContent = link ? 'Proksee map created. ' : 'Opened the service in a new tab. If it did not open, allow pop-ups for SMS3.';
      if (link) { const anchor = document.createElement('a'); anchor.textContent = 'Open map'; anchor.href = link; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; status.append(anchor); }
    } catch (error) { if (!signal?.aborted) status.textContent = error.message; }
    finally { send.disabled = Boolean(signal?.aborted); }
  });
  panel.append(note, actions, status); parent.append(panel);
}
