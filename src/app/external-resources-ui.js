import { openHandoff, sendHandoff } from './external-handoff-ui.js';
import { dataTypes, tasks, sources, getFields, sendFields, fieldExamples, formatsFor, formatHelp, sendInputExample } from '../core/external-resources/catalog.js';
import { buildRetrieval, createRetrievalClient, retrieveData } from '../core/external-resources/get.js';
import { buildHandoff, MAX_HANDOFF_CHARS } from '../core/external-resources/send.js';
import { downloadText } from './file-download.js';
import { copyTextWithFeedback } from './copy-feedback.js';

const storageKey = 'sms3-external-selections-v1';
const sequenceFiles = '.fa,.fasta,.fna,.faa,.txt';
const fileInputs = {
  similar: ['Drop one plain-text sequence or FASTA record here', sequenceFiles],
  primers: ['Drop one template sequence or FASTA record here', sequenceFiles],
  genome: ['Drop one plain-text DNA/RNA sequence or FASTA records here', sequenceFiles],
  protein: ['Drop one plain-text protein sequence or FASTA record here', sequenceFiles],
  align: ['Drop FASTA records here', sequenceFiles],
  structure: ['Drop PDB or mmCIF file here', '.pdb,.cif,.mmcif,.txt']
};
function readPreferences() { try { return JSON.parse(sessionStorage.getItem(storageKey)) || {}; } catch { return {}; } }
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, action, className) {
  const el = node('button', text, className); el.type = 'button'; el.addEventListener('click', action); return el;
}
function selectField(id, label, choices, value) {
  const control = document.createElement('select'); control.id = id; control.setAttribute('aria-label', label);
  for (const item of choices) { const option = node('option', item.label); option.value = item.value; control.append(option); }
  control.value = choices.some(item => item.value === value) ? value : choices[0].value;
  const wrapper = node('label', label, 'external-field'); wrapper.htmlFor = id; wrapper.append(control);
  return { wrapper, control };
}
export function createExternalResourcesController({ host, displayResult, resetOutput, isActive }) {
  const preferences = readPreferences(), drafts = new Map(), modeDrafts = new Map(), client = createRetrievalClient();
  const formatChoices = { ...preferences.get?.formats };
  let mode, operation, source, format, controls = {}, fields = [], abortController, epoch = 0, status, matches, action, cancelButton, fieldset;
  const snapshot = () => Object.fromEntries(Object.entries(controls).map(([id, control]) => [id, control.value]));
  const key = () => `${mode}:${operation}:${source}`;
  function save() {
    drafts.set(key(), snapshot());
    // Remember choices only. Biological input stays in memory, never web storage.
    if (mode === 'get') formatChoices[`${operation}:${source}`] = format;
    preferences[mode] = { operation, source, format, ...(mode === 'get' ? { formats: formatChoices } : {}), choices: Object.fromEntries(fields.filter(f => f.type === 'select').map(f => [f.id, controls[f.id].value])) };
    try { sessionStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* session storage is optional */ }
  }
  function cancel() {
    epoch++;
    abortController?.abort(); abortController = null;
    if (action) action.disabled = false;
    if (cancelButton) cancelButton.hidden = true;
    if (fieldset) fieldset.disabled = false;
  }
  function invalidate() { cancel(); if (matches) matches.replaceChildren(); if (status) { status.textContent = ''; status.classList.remove('external-error'); } resetOutput(); }
  function showError(error) { status.textContent = error.message || String(error); status.classList.add('external-error'); }
  function data() { return { ...snapshot(), source, type: operation, task: operation, format }; }
  function busy() { action.disabled = true; cancelButton.hidden = false; fieldset.disabled = true; status.classList.remove('external-error'); }
  async function retrieve(overrides = {}) {
    invalidate();
    const runEpoch = epoch;
    abortController = new AbortController();
    const signal = abortController.signal;
    const current = () => epoch === runEpoch && isActive('get-data');
    const values = { ...data(), ...overrides };
    try {
      const plan = buildRetrieval(values); if (overrides.modelId) plan.modelId = overrides.modelId;
      busy(); status.textContent = `Retrieving from ${sources[source]}…`;
      const result = await retrieveData(plan, client, signal);
      if (!current()) return;
      if (result.matches || result.models) {
        const rows = result.matches || result.models;
        status.textContent = result.matches ? `${rows.length} matches shown${result.total == null ? '; refine your query for more specific results' : ` of ${result.total}`}. Choose a record.` : 'Choose an AlphaFold model.';
        if (!rows.length) status.textContent = 'No matching records. Try a different accession or search expression.';
        for (const row of rows) {
          const item = node('div', '', 'external-match');
          const choose = button(row.id, () => retrieve(result.models ? { modelId: row.id } : { query: row.id, queryMode: 'accession' }));
          const description = node('span', [row.title, row.organism, row.length ? `${row.length.toLocaleString()} ${operation === 'protein' ? 'aa' : 'bp'}` : ''].filter(Boolean).join(' · '));
          item.append(choose, description); matches.append(item);
        }
      } else {
        await displayResult(result, values.query || values.region || '', { outputFormat: plan.format === 'summary' ? 'report' : plan.format }, current, signal);
        if (current()) status.textContent = `Retrieved from ${sources[source]}. Copy or download the result below.`;
      }
    } catch (error) {
      if (current()) showError(error);
    } finally {
      if (current()) { abortController = null; action.disabled = false; cancelButton.hidden = true; fieldset.disabled = false; }
    }
  }
  async function send() {
    status.classList.remove('external-error'); status.textContent = '';
    try {
      const plan = buildHandoff(data());
      if (plan.method !== 'api') {
        openHandoff(plan);
        status.textContent = plan.method === 'manual' ? `Opened ${sources[source]}. Paste or upload your data there to submit it.` : `Opened ${sources[source]} in a new tab. If it did not open, allow pop-ups for SMS3.`;
        return;
      }
      invalidate(); const runEpoch = epoch; const current = () => epoch === runEpoch && isActive('send-data');
      abortController = new AbortController();
      busy(); cancelButton.hidden = true; status.textContent = 'Sending genome to Proksee…';
      try {
        const link = await sendHandoff(plan, abortController.signal);
        if (current()) {
          status.textContent = 'Proksee map created. ';
          const anchor = node('a', 'Open map'); anchor.href = link; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; status.append(anchor);
        }
      } catch (error) { if (current()) throw error; }
      finally { if (current()) { abortController = null; action.disabled = false; fieldset.disabled = false; } }
    } catch (error) { showError(error); }
  }
  function renderFields(parent, values) {
    controls = {};
    for (const field of fields) {
      let wrapper, control;
      if (field.type === 'select') ({ wrapper, control } = selectField(`external-${field.id}`, field.label, field.choices, values[field.id]));
      else {
        wrapper = node(field.type === 'textarea' ? 'div' : 'label', field.type === 'textarea' ? '' : field.label, 'external-field'); control = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
        if (field.type !== 'textarea') control.type = 'text';
        control.id = `external-${field.id}`; control.setAttribute('aria-label', field.label); wrapper.htmlFor = control.id;
        control.value = values[field.id] ?? ''; control.spellcheck = false; control.autocomplete = 'off'; control.setAttribute('autocapitalize', 'off'); control.setAttribute('autocorrect', 'off'); control.setAttribute('writingsuggestions', 'false');
        control.maxLength = field.type === 'textarea' ? MAX_HANDOFF_CHARS : field.id === 'query' ? 2000 : 500;
        if (field.type === 'textarea') control.rows = 7;
        if (field.type === 'textarea') { const label = node('label', field.label); label.htmlFor = control.id; wrapper.append(label); }
        wrapper.append(control);
      }
      if (field.help) { const help = node('span', field.help, 'external-help'); help.id = `${control.id}-help`; control.setAttribute('aria-describedby', help.id); wrapper.append(help); }
      controls[field.id] = control; parent.append(wrapper);
      control.addEventListener(field.type === 'select' ? 'change' : 'input', () => {
        if (field.id === 'inputMode') {
          modeDrafts.set(`${key()}:${currentInputMode}`, controls.input.value);
          currentInputMode = control.value;
          controls.input.value = modeDrafts.get(`${key()}:${currentInputMode}`) ?? sendInputExample(operation, currentInputMode);
        }
        save(); invalidate(); updateHandoffNote();
      });
    }
  }
  let handoffNote, extras, currentInputMode, fileUpload;
  function addFileInput(primary, actions) {
    const browse = node('label', '', 'file-button'), file = document.createElement('input');
    file.type = 'file'; file.id = 'external-file'; file.setAttribute('aria-label', 'Choose file');
    browse.append(file, node('span', 'Choose file')); actions.prepend(browse);
    const heading = node('div', '', 'external-input-heading'); heading.append(primary.parentElement.querySelector('label'), actions);
    const drop = button('', () => file.click(), 'drop-zone external-file-drop'); drop.id = 'external-file-drop';
    primary.before(heading, drop);
    const loadFiles = async fileList => {
      const files = Array.from(fileList || []);
      if (!files.length || fieldset.disabled || !primary.isConnected || !isActive('send-data') || drop.hidden) return;
      invalidate(); const selectedEpoch = epoch;
      const current = () => epoch === selectedEpoch && primary.isConnected && isActive('send-data');
      action.disabled = true;
      try {
        if (files.length !== 1) throw new Error('Choose or drop one file at a time.');
        const selected = files[0];
        if (selected.size > MAX_HANDOFF_CHARS) throw new Error('Choose a file no larger than 1 MB.');
        const text = await selected.text();
        if (!current()) return;
        if (!text.trim()) throw new Error('The file is empty. Choose a text sequence or structure file.');
        if (/[\u0000\uFFFD]/.test(text)) throw new Error('Could not read this as a text file. Choose a plain-text sequence, annotated record, or structure file.');
        primary.value = text; save(); updateHandoffNote();
        status.textContent = `Loaded ${selected.name} (${selected.size.toLocaleString()} bytes).`;
      } catch (error) {
        if (current()) showError(error);
      } finally { if (current()) action.disabled = false; }
    };
    file.addEventListener('change', () => { const files = Array.from(file.files || []); file.value = ''; void loadFiles(files); });
    for (const target of [drop, primary]) {
      target.addEventListener('dragover', event => {
        event.preventDefault();
        if (!fieldset.disabled && !drop.hidden) { drop.classList.add('drag-over'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
      });
      target.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
      target.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('drag-over'); void loadFiles(event.dataTransfer?.files); });
    }
    fileUpload = { browse, file, drop };
  }
  function updateHandoffNote() {
    if (mode !== 'send') return;
    extras.replaceChildren();
    if (controls.inputMode) {
      const label = controls.inputMode.value === 'accession' ? (operation === 'genome' ? 'NCBI accession' : 'UniProt accession') : controls.inputMode.value === 'genbank' ? 'GenBank / EMBL record' : operation === 'genome' ? 'Sequence or FASTA' : 'Protein sequence or FASTA';
      controls.input.labels[0].textContent = label;
      controls.input.setAttribute('aria-label', label);
      controls.input.rows = controls.inputMode.value === 'accession' ? 2 : 7;
    }
    if (fileUpload) {
      const [label, accept] = controls.inputMode?.value === 'genbank'
        ? ['Drop GenBank or EMBL file here', '.gb,.gbk,.genbank,.embl,.txt'] : fileInputs[operation];
      fileUpload.drop.textContent = label; fileUpload.file.accept = accept;
      fileUpload.drop.hidden = fileUpload.browse.hidden = controls.inputMode?.value === 'accession';
      fileUpload.drop.classList.remove('drag-over');
    }
    try {
      const plan = buildHandoff(data());
      action.textContent = plan.actionLabel;
      handoffNote.textContent = plan.instructions;
      if (plan.method === 'manual' || plan.method === 'api') {
        const copy = button(plan.method === 'api' ? 'Copy map JSON' : 'Copy data', async () => {
          try { await copyTextWithFeedback(copy, plan.input); } catch (error) { showError(error); }
        });
        const download = button(plan.method === 'api' ? 'Download map JSON' : 'Download data', () => downloadText(plan.input, plan.filename, 'text/plain'));
        extras.append(copy, download);
      }
    } catch {
      action.textContent = `Open in ${sources[source]}`;
      handoffNote.textContent = 'Complete the fields above to prepare this action.';
    }
  }
  function render(toolId) {
    cancel(); host.replaceChildren(); mode = toolId === 'get-data' ? 'get' : 'send';
    fileUpload = null;
    const items = mode === 'get' ? dataTypes : tasks, saved = preferences[mode] || {};
    operation = mode === 'get' && saved.operation === 'annotated' ? 'nucleotide' : items.some(item => item.id === saved.operation) ? saved.operation : items[0].id;
    const item = items.find(item => item.id === operation);
    source = item.sources.includes(saved.source) ? saved.source : item.sources[0];
    fields = mode === 'get' ? getFields(operation, source) : sendFields(operation, source);
    const values = drafts.get(key()) || { ...fieldExamples(fields), ...saved.choices };
    if (!drafts.has(key()) && values.inputMode) values.input = sendInputExample(operation, values.inputMode);
    currentInputMode = values.inputMode;
    fieldset = document.createElement('fieldset'); fieldset.className = 'external-fields';
    const selectors = node('div', '', 'external-selectors');
    const op = selectField('external-operation', mode === 'get' ? 'What do you want to retrieve?' : 'What do you want to do?', items.map(item => ({ value: item.id, label: item.label })), operation);
    const provider = selectField('external-source', mode === 'get' ? 'Source' : 'Service', item.sources.map(id => ({ value: id, label: sources[id] })), source);
    selectors.append(op.wrapper, provider.wrapper); fieldset.append(selectors);
    const inputs = node('div', '', 'external-inputs'); renderFields(inputs, values); fieldset.append(inputs);
    const actions = node('div', '', 'button-row external-input-actions');
    actions.append(button('Load example', () => { for (const field of fields) if (field.id !== 'inputMode') controls[field.id].value = field.example; if (controls.inputMode) controls.input.value = sendInputExample(operation, controls.inputMode.value); save(); invalidate(); updateHandoffNote(); }), button('Clear input', () => { for (const field of fields) if (field.type !== 'select') controls[field.id].value = ''; save(); invalidate(); updateHandoffNote(); }));
    if (mode === 'send' && fields.some(f => f.type === 'textarea')) {
      addFileInput(controls.input || controls.template, actions);
    } else fieldset.append(actions);
    if (mode === 'get') {
      const choices = formatsFor(operation, source).map(([value, label]) => ({ value, label }));
      const output = selectField('external-format', 'Output format', choices, formatChoices[`${operation}:${source}`] ?? saved.format);
      format = output.control.value;
      const help = node('p', formatHelp(operation, source, format), 'external-help'); help.id = 'external-format-help';
      output.control.setAttribute('aria-describedby', help.id);
      output.control.addEventListener('change', () => { format = output.control.value; help.textContent = formatHelp(operation, source, format); save(); invalidate(); });
      fieldset.append(output.wrapper);
      fieldset.append(help);
    }
    const limits = node('details', '', 'external-limits'); limits.append(node('summary', 'Limits'), node('p', mode === 'get' ? 'Responses: 10 MiB; genomic regions: 1,000,000 bases; search results: 20 matches. Requests are paced across SMS3 tabs. Shared networks also share service rate limits.' : 'Sequence/file handoffs: 1,000,000 characters; alignment and genome inputs: at most 1,000 records. External services may apply additional limits.'));
    fieldset.append(limits); host.append(fieldset);
    const privacy = node('p', mode === 'get' ? 'Retrieve sends the accession, search terms, or region shown above to the selected database. Your existing SMS3 sequences and Workspace records are not sent.' : 'Open or Send shares the values shown above when prefilling a form or creating a map. For copy/upload actions, you paste or upload the data on the service’s website. Ordinary SMS3 tools remain local.', 'external-privacy');
    host.append(privacy);
    handoffNote = node('p', '', 'external-help'); extras = node('div', '', 'button-row');
    action = button(mode === 'get' ? 'Retrieve' : 'Open service', () => mode === 'get' ? retrieve() : send(), 'primary-button');
    cancelButton = button('Cancel retrieval', () => { cancel(); resetOutput(); status.textContent = 'Retrieval cancelled. Inputs were kept.'; }); cancelButton.hidden = true;
    const runRow = node('div', '', 'button-row'); runRow.append(action, cancelButton);
    if (mode === 'send') host.append(handoffNote, extras);
    host.append(runRow);
    status = node('p', '', 'external-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    matches = node('div', '', 'external-matches'); host.append(status, matches);
    op.control.addEventListener('change', () => { save(); preferences[mode] = { operation: op.control.value }; invalidate(); render(toolId); });
    provider.control.addEventListener('change', () => { save(); preferences[mode] = { operation, source: provider.control.value }; invalidate(); render(toolId); });
    updateHandoffNote(); save();
  }
  return { render, cancel };
}
