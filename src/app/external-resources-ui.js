import { installAssemblyPicker } from './assembly-picker-ui.js';
import { bundledAssemblies, knownOrganism } from '../core/external-resources/organisms.js';
import { createGeneDiscoveryController } from './gene-discovery-ui.js';
import { openHandoff, sendHandoff } from './external-handoff-ui.js';
import { dataTypes, tasks, sources, getFields, sendFields, fieldExamples, formatsFor, formatHelp, sendInputExample, lookupModes, isRegionLookup, regionProduct } from '../core/external-resources/catalog.js';
import { regionExamples, regionExample, matchingRegionExample } from '../core/external-resources/region-examples.js';
import { buildRetrieval, createRetrievalClient, retrieveData } from '../core/external-resources/get.js';
import { buildHandoff, MAX_HANDOFF_CHARS } from '../core/external-resources/send.js';
import { downloadText } from './file-download.js';
import { copyTextWithFeedback } from './copy-feedback.js';
import { createTabbedInputWorkflowTabs } from './tabbed-input-workflow.js';

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
  const wrapper = node('label', label, 'external-field'); wrapper.htmlFor = id;
  const shell = node('span', '', 'external-select-control'); shell.append(control); wrapper.append(shell);
  return { wrapper, control };
}
export function createExternalResourcesController({ host, displayResult, resetOutput, isActive }) {
  const preferences = readPreferences(), drafts = new Map(), modeDrafts = new Map(), lookupDrafts = new Map(), client = createRetrievalClient();
  const formatChoices = { ...preferences.get?.formats };
  let geneController, geneDraft, assemblyPicker;
  let mode, operation, source, format, controls = {}, fields = [], abortController, epoch = 0, status, matches, action, cancelButton, fieldset;
  const snapshot = () => Object.fromEntries(Object.entries(controls).map(([id, control]) => [id, control.value]));
  const key = () => `${mode}:${operation}:${source}`;
  function save() {
    drafts.set(key(), snapshot());
    if (mode === 'get' && controls.queryMode) lookupDrafts.set(`${key()}:${controls.queryMode.value}`, snapshot());
    // Remember choices only. Biological input stays in memory, never web storage.
    if (mode === 'get') formatChoices[`${operation}:${source}`] = format;
    preferences[mode] = { operation, source, format, ...(mode === 'get' ? { formats: formatChoices } : {}), choices: Object.fromEntries(fields.filter(f => f.type === 'select').map(f => [f.id, controls[f.id].value])) };
    try { sessionStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* session storage is optional */ }
  }
  function cancel() {
    if (geneController) geneDraft = geneController.snapshot();
    geneController?.cancel();
    assemblyPicker?.cancel();
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
  function updateRetrievalAction() {
    if (mode === 'get') action.textContent = ['search', 'name'].includes(controls.queryMode?.value) ? 'Search' : 'Retrieve';
  }
  async function retrieve(overrides = {}) {
    invalidate();
    const runEpoch = epoch;
    abortController = new AbortController();
    const signal = abortController.signal;
    const current = () => epoch === runEpoch && isActive('get-data');
    const values = { ...data(), ...overrides };
    try {
      const plan = buildRetrieval(values); if (overrides.modelId) plan.modelId = overrides.modelId;
      busy(); status.textContent = plan.kind === 'search' ? `Searching ${sources[source]}…` : `Retrieving from ${sources[source]}…`;
      const result = await retrieveData(plan, client, signal, message => { if (current()) status.textContent = message; });
      if (!current()) return;
      if (result.matches || result.models) {
        const rows = result.matches || result.models;
        status.textContent = result.matches ? `${rows.length} matches shown${result.total == null ? '; refine your query for more specific results' : ` of ${result.total}`}. Choose a record.` : 'Choose an AlphaFold model.';
        if (!rows.length) status.textContent = 'No matching records. Try a different accession or search expression.';
        for (const row of rows) {
          const item = node('div', '', 'external-match');
          const choose = button(row.id, () => retrieve(result.models ? { modelId: row.id } : { query: row.id, queryMode: 'accession' }));
          const description = node('span', [row.title, row.organism, row.length ? `${row.length.toLocaleString()} ${operation === 'protein' || row.molecule === 'protein' ? 'aa' : 'bp'}` : '', row.status, row.method, row.resolution].filter(Boolean).join(' · '));
          item.append(choose, description); matches.append(item);
        }
        if (result.nextPageToken) matches.append(button('Next assemblies', () => retrieve({ pageToken: result.nextPageToken })));
        if (result.pageSize && result.total > result.pageSize) {
          const page = result.page ?? 0, navigation = node('div', '', 'button-row');
          if (page) navigation.append(button('Previous matches', () => retrieve({ page: page - 1 })));
          if ((page + 1) * result.pageSize < result.total) navigation.append(button('Next matches', () => retrieve({ page: page + 1 })));
          matches.append(navigation);
        }

      } else {
        await displayResult(result, values.query || values.region || '', { outputFormat: result.retrievalFormat || (plan.format === 'summary' ? 'report' : plan.format) }, current, signal);
        if (current()) status.textContent = result.retrievalSummary || `Retrieved from ${sources[source]}. Copy or download the result below.`;
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
      if (mode === 'get' && field.id === 'queryMode') {
        control = document.createElement('input'); control.type = 'hidden'; control.value = values.queryMode;
        controls.queryMode = control;
        const tabs = createTabbedInputWorkflowTabs({
          modes: field.choices.map(item => ({ ...item, ariaControls: 'external-query-panel' })),
          selectedMode: control.value, ariaLabel: field.label,
          onSelect: value => {
            if (control.value === value) return;
            save();
            drafts.set(key(), lookupDrafts.get(`${key()}:${value}`) ?? { queryMode: value });
            invalidate(); render('get-data');
            document.getElementById(`external-query-tab-${value}`)?.focus();
          }
        });
        tabs.classList.add('external-query-tabs');
        for (const tab of tabs.querySelectorAll('[role="tab"]')) tab.id = `external-query-tab-${tab.dataset.sourceMode}`;
        parent.append(control, tabs);
        const panel = node('div', '', 'external-input-panel'); panel.id = 'external-query-panel';
        panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', `external-query-tab-${control.value}`);
        parent.append(panel); parent = panel;
        continue;
      }
      if (field.type === 'select') ({ wrapper, control } = selectField(`external-${field.id}`, field.label, field.choices, values[field.id]));
      else {
        const isGetQuery = mode === 'get' && field.id === 'query';
        const multiline = field.type === 'textarea' || isGetQuery;
        wrapper = node(multiline ? 'div' : 'label', multiline ? '' : field.label, 'external-field'); control = document.createElement(multiline ? 'textarea' : 'input');
        if (!multiline) control.type = 'text';
        control.id = `external-${field.id}`; control.setAttribute('aria-label', field.label); wrapper.htmlFor = control.id;
        control.value = values[field.id] ?? ''; control.placeholder = field.example; control.spellcheck = false; control.autocomplete = 'off'; control.setAttribute('autocapitalize', 'off'); control.setAttribute('autocorrect', 'off'); control.setAttribute('writingsuggestions', 'false');
        control.maxLength = field.id === 'query' ? 2000 : field.type === 'textarea' ? MAX_HANDOFF_CHARS : 500;
        if (multiline) control.rows = isGetQuery ? values.queryMode === 'search' ? 2 : 1 : 7;
        if (multiline) { const label = node('label', field.label); label.htmlFor = control.id; wrapper.append(label); }
        wrapper.append(control);
      }
      wrapper.dataset.field = field.id;
      if (field.help) { const help = node('span', field.help, 'external-help'); help.id = `${control.id}-help`; control.setAttribute('aria-describedby', help.id); wrapper.append(help); }
      controls[field.id] = control; parent.append(wrapper);
      control.addEventListener(field.type === 'select' ? 'change' : 'input', () => {
        if (mode === 'get' && field.id === 'sequenceType') {
          if (controls.queryMode?.value === 'region') {
            save(); invalidate(); render('get-data'); document.getElementById('external-sequenceType')?.focus();
          } else changeGetInputMode();
          return;
        }
        if (mode === 'get' && field.id === 'transcriptSelection') updateGetFields();
        closeRegionExamples();
        if (field.id === 'inputMode') {
          modeDrafts.set(`${key()}:${currentInputMode}`, controls.input.value);
          currentInputMode = control.value;
          controls.input.value = modeDrafts.get(`${key()}:${currentInputMode}`) ?? sendInputExample(operation, currentInputMode);
        }
        save(); invalidate(); updateHandoffNote();
      });
    }
  }
  let handoffNote, extras, currentInputMode, currentGetInputMode, fileUpload, regionExampleList, exampleButton;
  function closeRegionExamples() {
    if (!regionExampleList) return;
    regionExampleList.hidden = true;
    exampleButton.setAttribute('aria-expanded', 'false');
  }
  function createRegionExamples() {
    const list = node('div', '', 'external-region-examples');
    list.id = 'external-region-examples'; list.hidden = true;
    list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Region examples');
    list.append(node('p', 'Human GRCh38 examples. Choose one to load its assembly and coordinates; your retrieval settings are kept.', 'external-help'));
    const choices = node('div', '', 'external-example-choices');
    for (const row of regionExamples) {
      const example = regionExample(source, row.id);
      const choice = button('', () => {
        for (const id of ['assembly', 'region', 'species']) if (controls[id]) controls[id].value = example[id];
        assemblyPicker?.update(); save(); invalidate(); closeRegionExamples(); exampleButton.focus();
      }, 'external-example-choice');
      choice.setAttribute('aria-label', example.label);
      choice.append(node('strong', example.label), node('span', `${example.region} · ${(example.end - example.start + 1).toLocaleString('en-US')} bp`),
        node('span', regionProduct(operation, snapshot()) === 'genomic' ? example.genomicHelp : example.help, 'external-help'));
      choices.append(choice);
    }
    list.append(choices);
    list.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRegionExamples(); exampleButton.focus(); }
    });
    return list;
  }
  const getInputMode = () => `${controls.queryMode?.value ?? 'default'}:${controls.sequenceType?.value ?? ''}`;
  function updateGetFields() {
    fields = getFields(operation, source, snapshot());
    for (const field of fields) {
      const control = controls[field.id];
      if (!control || field.id === 'queryMode') continue;
      if (field.type !== 'select') {
        control.setAttribute('aria-label', field.label);
        control.labels[0].firstChild.textContent = field.label;
        control.placeholder = field.example;
        if (field.id === 'query') control.rows = controls.queryMode?.value === 'search' ? 2 : 1;
      }
      let help = document.getElementById(`${control.id}-help`);
      if (field.help) {
        if (!help) { help = node('span', '', 'external-help'); help.id = `${control.id}-help`; control.parentElement.append(help); }
        help.textContent = field.help; control.setAttribute('aria-describedby', help.id);
      } else { help?.remove(); control.removeAttribute('aria-describedby'); }
    }
    if (controls.queryMode) host.querySelector('#external-query-panel')?.setAttribute('aria-labelledby', `external-query-tab-${controls.queryMode.value}`);
  }
  function changeGetInputMode() {
    modeDrafts.set(`${key()}:query:${currentGetInputMode}`, controls.query.value);
    currentGetInputMode = getInputMode();
    updateGetFields();
    controls.query.value = modeDrafts.get(`${key()}:query:${currentGetInputMode}`) ?? fields.find(field => field.id === 'query').example;
    save(); invalidate(); updateRetrievalAction();
  }
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
      controls.input.rows = controls.inputMode.value === 'accession' ? 1 : 7;
      controls.input.parentElement.classList.toggle('external-identifier-input', controls.inputMode.value === 'accession');
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
    cancel(); geneController = null; assemblyPicker = null; host.replaceChildren(); mode = toolId === 'get-data' ? 'get' : 'send';
    fileUpload = null; regionExampleList = null; exampleButton = null;
    const items = mode === 'get' ? dataTypes : tasks, saved = preferences[mode] || {};
    operation = mode === 'get' && ['annotated', 'region'].includes(saved.operation) ? 'nucleotide' : items.some(item => item.id === saved.operation) ? saved.operation : items[0].id;
    const item = items.find(item => item.id === operation);
    source = item.sources.includes(saved.source) ? saved.source : item.sources[0];
    const draft = drafts.get(key());
    const choices = { ...(draft ?? saved.choices) };
    if (mode === 'get' && saved.operation === 'region') Object.assign(choices, { queryMode: 'region', sequenceType: choices.sequenceType ?? 'genomic' });
    // Session storage contains selectors only, so legacy automatic mode starts
    // in accession mode with the matching example after a reload.
    if (mode === 'get' && choices.queryMode === 'auto') {
      choices.queryMode = 'accession';
    }
    fields = mode === 'get' ? getFields(operation, source, choices) : sendFields(operation, source);
    const values = { ...fieldExamples(fields), ...(draft ?? {}) };
    for (const field of fields.filter(field => field.type === 'select')) {
      values[field.id] = field.choices.some(item => item.value === choices[field.id]) ? choices[field.id] : field.example;
    }
    if (!drafts.has(key()) && values.inputMode) values.input = sendInputExample(operation, values.inputMode);
    currentInputMode = values.inputMode;
    host.classList.toggle('external-get-data', mode === 'get');
    fieldset = document.createElement('fieldset'); fieldset.className = 'external-fields';
    const selectors = node('div', '', 'external-selectors');
    const op = selectField('external-operation', mode === 'get' ? 'What do you want to retrieve?' : 'What do you want to do?', items.map(item => ({ value: item.id, label: item.label })), operation);
    const provider = selectField('external-source', mode === 'get' ? 'Source' : 'Service', item.sources.map(id => ({ value: id, label: sources[id] })), source);
    selectors.append(op.wrapper, provider.wrapper); fieldset.append(selectors);
    if (mode === 'get' && operation === 'gene') {
      host.append(fieldset);
      const discovery = node('div'); host.append(discovery);
      geneController = createGeneDiscoveryController({ host: discovery, source, client, displayResult, resetOutput, isActive, initialValues: geneDraft });
      controls = {}; fields = []; action = null; cancelButton = null; status = null; matches = null;
      const change = (operation, source) => {
        preferences.get = { operation, source };
        try { sessionStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* optional */ }
        invalidate(); render(toolId);
      };
      op.control.addEventListener('change', () => { const next = items.find(item => item.id === op.control.value); change(next.id, next.sources.includes(source) ? source : next.sources[0]); });
      provider.control.addEventListener('change', () => change(operation, provider.control.value));
      return;
    }

    const inputs = node('div', '', 'external-inputs'); renderFields(inputs, values); fieldset.append(inputs);
    if ((mode === 'get' && controls.queryMode?.value === 'region') || (mode === 'send' && ['region', 'variant'].includes(operation) && ['ucsc', 'ensembl', 'gdv'].includes(source))) assemblyPicker = installAssemblyPicker({
      wrapper: (controls.assembly || controls.species).closest('[data-field]'), assembly: controls.assembly, species: controls.species, source, client,
      initialOrganism: values.organism && (typeof values.organism === 'object' ? values.organism : knownOrganism(values.organism)),
      changed: () => {
        if (controls.region) { controls.region.value = ''; controls.region.placeholder = 'Chromosome:start-end'; }
        else if (mode === 'send' && controls.input) controls.input.value = '';
        save(); invalidate(); updateHandoffNote();
      }
    });

    currentGetInputMode = getInputMode();
    const actions = node('div', '', 'button-row external-input-actions');
    exampleButton = button('Load example', () => {
      if (regionExampleList) {
        regionExampleList.hidden = !regionExampleList.hidden;
        exampleButton.setAttribute('aria-expanded', String(!regionExampleList.hidden));
        if (!regionExampleList.hidden) regionExampleList.querySelector('button').focus();
        return;
      }
      if (mode === 'get') updateGetFields();
      for (const field of fields) if (mode === 'get' ? field.type !== 'select' : field.id !== 'inputMode') controls[field.id].value = field.example;
      if (controls.inputMode) controls.input.value = sendInputExample(operation, controls.inputMode.value);
      assemblyPicker?.update();
      save(); invalidate(); updateHandoffNote();
    });
    actions.append(exampleButton, button('Clear input', () => { for (const field of fields) if (field.type !== 'select') controls[field.id].value = ''; assemblyPicker?.update(); closeRegionExamples(); save(); invalidate(); updateHandoffNote(); }));
    if (mode === 'get' && controls.queryMode?.value === 'region') {
      regionExampleList = createRegionExamples();
      exampleButton.setAttribute('aria-expanded', 'false'); exampleButton.setAttribute('aria-controls', regionExampleList.id);
      actions.classList.add('external-region-actions');
      inputs.querySelector('#external-query-panel').prepend(actions, regionExampleList);
    } else if (mode === 'send' && fields.some(f => f.type === 'textarea')) {
      addFileInput(controls.input || controls.template, actions);
    } else fieldset.append(actions);
    if (mode === 'get') {
      const choices = formatsFor(operation, source, values).map(([value, label]) => ({ value, label }));
      const output = selectField('external-format', 'Output format', choices, formatChoices[`${operation}:${source}`] ?? saved.format);
      format = output.control.value;
      const help = node('p', formatHelp(operation, source, format, values), 'external-help'); help.id = 'external-format-help';
      output.control.setAttribute('aria-describedby', help.id);
      output.control.addEventListener('change', () => { format = output.control.value; help.textContent = formatHelp(operation, source, format, snapshot()); closeRegionExamples(); save(); invalidate(); });
      const outputRow = node('div', '', 'external-output-choice');
      outputRow.append(output.wrapper, help); fieldset.append(outputRow);
    }
    const limits = node('details', '', 'external-limits'); limits.append(node('summary', 'Limits'), node('p', mode === 'get' ? 'Responses: 25 MiB total; assemblies: 1,000 sequences; genomic regions: 1,000,000 bases and 1,000 transcripts; NCBI region searches: 500 genes; search results: 20 matches. Larger requests fail without returning partial data. Requests are paced across SMS3 tabs. Shared networks also share service rate limits.' : 'Sequence/file handoffs: 1,000,000 characters; alignment and genome inputs: at most 1,000 records. External services may apply additional limits.'));
    fieldset.append(limits); host.append(fieldset);
    const recipients = source === 'ucsc' && isRegionLookup(operation, source, values) && (operation !== 'nucleotide' || values.sequenceType !== 'genomic') ? 'UCSC Genome Browser and NCBI RefSeq' : sources[source];
    const privacy = node('p', mode === 'get' ? `Only the accession, query, or region above and the matching public identifiers are sent to ${recipients}. Your Workspace records stay local.` : 'Open or Send shares the values shown above when prefilling a form or creating a map. For copy/upload actions, you paste or upload the data on the service’s website. Ordinary SMS3 tools remain local.', 'external-privacy');
    host.append(privacy);
    handoffNote = node('p', '', 'external-help external-handoff-note'); extras = node('div', '', 'external-handoff-extras');
    action = button(mode === 'get' ? 'Retrieve' : 'Open service', () => mode === 'get' ? retrieve() : send(), 'primary-button');
    cancelButton = button('Cancel retrieval', () => { cancel(); resetOutput(); status.textContent = 'Retrieval cancelled. Inputs were kept.'; }); cancelButton.hidden = true;
    const runRow = node('div', '', 'button-row'); runRow.append(action, cancelButton);
    if (mode === 'send') { host.append(handoffNote); runRow.append(extras); }
    host.append(runRow);
    status = node('p', '', 'external-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    matches = node('div', '', 'external-matches'); host.append(status, matches);
    op.control.addEventListener('change', () => {
      save();
      const next = items.find(item => item.id === op.control.value);
      const nextSource = next.sources.includes(source) ? source : next.sources[0];
      if (mode === 'get' && controls.queryMode?.value === 'region' && lookupModes(next.id, nextSource).some(([id]) => id === 'region')) {
        const nextKey = `${mode}:${next.id}:${nextSource}`;
        if (!drafts.has(nextKey)) drafts.set(nextKey, { ...snapshot(), queryMode: 'region' });
      }
      preferences[mode] = { operation: next.id, source: nextSource }; invalidate(); render(toolId);
    });
    provider.control.addEventListener('change', () => {
      save();
      const nextSource = provider.control.value, nextKey = `${mode}:${operation}:${nextSource}`;
      if (mode === 'get' && controls.queryMode?.value === 'region' && lookupModes(operation, nextSource).some(([id]) => id === 'region') && !drafts.has(nextKey)) {
        const exampleId = matchingRegionExample(source, snapshot());
        const organism = assemblyPicker?.selectedOrganism(), assembly = bundledAssemblies(nextSource, organism)[0];
        const example = exampleId ? regionExample(nextSource, exampleId) : { assembly: assembly?.id || '', species: assembly?.species || '', region: '' };
        drafts.set(nextKey, { queryMode: 'region', sequenceType: controls.sequenceType?.value, transcriptSelection: controls.transcriptSelection?.value,
          assembly: example.assembly, region: example.region, species: example.species, organism });
      } else if (mode === 'send' && assemblyPicker && ['ucsc', 'ensembl', 'gdv'].includes(nextSource) && !drafts.has(nextKey)) {
        const organism = assemblyPicker.selectedOrganism(), assembly = bundledAssemblies(nextSource, organism)[0];
        drafts.set(nextKey, { ...snapshot(), assembly: assembly?.id || '', species: assembly?.species || '', region: '', input: '', organism });
      }
      preferences[mode] = { operation, source: nextSource }; invalidate(); render(toolId);
    });
    updateHandoffNote(); updateRetrievalAction(); save();
  }
  return { render, cancel };
}
