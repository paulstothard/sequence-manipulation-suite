import { renderExternalError } from './external-error-ui.js';
import { createRetrievalClient } from '../core/external-resources/get.js';
import { identifierProviders, planIdentifierInput, retrieveIdentifierInput, previewIdentifierInput, findIdentifierGeneProducts, identifierRecordUrl } from '../core/identifier-retrieval.js';
import { identifierInputsFor, examplesForIdentifier } from '../tools/identifier-inputs.js';
import { createTabbedInputWorkflowTabs, updateTabbedInputWorkflowTabs } from './tabbed-input-workflow.js';

const node = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text) value.textContent = text;
  if (className) value.className = className;
  return value;
};
const button = (text, action) => {
  const value = node('button', text); value.type = 'button'; value.addEventListener('click', action); return value;
};

// An input adapter only: workers and workflows continue to consume native data.
export function createIdentifierInputController({ elements, getTool, onChange, onReady }) {
  const states = new Map(), client = createRetrievalClient();
  let bindings = [], refreshing = false;
  const configs = () => identifierInputsFor(getTool()?.metadata.id);
  const stateFor = config => {
    const key = `${getTool().metadata.id}:${config.slot}`;
    if (!states.has(key)) states.set(key, { mode: 'local', provider: config.providers[0], ...examplesForIdentifier(config, config.providers[0])[0], revision: 0 });
    return states.get(key);
  };
  const activeConfigs = () => configs().filter(config => stateFor(config).mode === 'identifier');
  function cancelPreview(state) { clearTimeout(state.timer); state.previewController?.abort(); }
  function invalidate(binding) {
    const { state } = binding;
    state.revision++; state.cached = null; state.preview = null;
    cancelPreview(state); binding.status.replaceChildren();
    onChange(); refresh(); schedulePreview(binding);
  }
  function setExample(binding, example) {
    Object.assign(binding.state, { start: '', end: '', ...example });
    renderFields(binding); invalidate(binding);
  }
  function schedulePreview(binding) {
    const { state, config } = binding;
    if (state.mode !== 'identifier') return;
    try { planIdentifierInput(config, state); } catch { return; }
    state.timer = setTimeout(() => preview(binding), 700);
  }
  function showRecords(binding, result, loaded = false) {
    binding.status.replaceChildren();
    for (const record of result.records) {
      const row = node('div', '', 'identifier-record');
      const title = node('strong', record.title || record.id);
      const link = node('a', record.id); link.href = identifierRecordUrl(result.provider, record.id); link.target = '_blank'; link.rel = 'noopener noreferrer';
      const length = record.range && record.length > record.range.end - record.range.start + 1
        ? `${(record.range.end - record.range.start + 1).toLocaleString()} bp selected · full record ${record.length.toLocaleString()} bp`
        : record.length ? `${record.length.toLocaleString()} ${record.unit || (result.provider === 'uniprot' || result.provider === 'ncbi-protein' ? 'aa' : 'bp')}` : '';
      const details = [record.organism, length, record.range ? `interval ${record.range.start.toLocaleString()}–${record.range.end.toLocaleString()} (reference +)` : '', record.detail, record.resolution ? `${record.resolution} Å` : ''].filter(Boolean);
      const meta = node('div', '', 'identifier-record-meta'); meta.append(link, details.length ? ` · ${details.join(' · ')}` : '');
      row.append(title, meta);
      if (record.issue) row.append(node('p', record.issue, 'identifier-issue'));
      binding.status.append(row);
    }
    if (loaded) binding.status.append(node('p', 'Retrieved and ready. Runs reuse these records until the identifiers change.', 'identifier-help'));
  }
  async function preview(binding) {
    const { state, config } = binding;
    cancelPreview(state);
    const version = state.revision, controller = state.previewController = new AbortController();
    binding.status.textContent = 'Checking identifiers…';
    try {
      const result = await previewIdentifierInput(config, state, { client, signal: controller.signal });
      if (state.revision !== version || state.mode !== 'identifier' || controller.signal.aborted) return;
      state.preview = result; showRecords(binding, result, Boolean(state.cached));
    } catch (error) {
      if (!controller.signal.aborted && state.revision === version) renderExternalError(binding.status, error);
    }
  }
  function renderFields(binding) {
    const { panel, config, state } = binding;
    panel.replaceChildren();
    if (config.providers.length > 1) {
      const label = node('label', 'Source'), select = node('select', '', 'search-input');
      select.id = `identifier-${config.slot}-provider`; label.htmlFor = select.id;
      for (const provider of config.providers) { const option = node('option', identifierProviders[provider].label); option.value = provider; select.append(option); }
      select.value = state.provider;
      select.addEventListener('change', () => { state.provider = select.value; setExample(binding, examplesForIdentifier(config, state.provider)[0]); });
      panel.append(label, select);
    }
    const multiple = config.maxRecords > 1;
    const label = node('label', `${identifierProviders[state.provider].field}${multiple ? 's' : ''}`);
    const field = node(multiple ? 'textarea' : 'input', '', 'search-input identifier-query');
    field.id = config.kind === 'structure' && config.slot === 'input' ? 'structurePdbId' : `identifier-${config.slot}-query`;
    label.htmlFor = field.id; field.value = state.query; field.placeholder = `e.g. ${examplesForIdentifier(config, state.provider)[0].query}`;
    field.maxLength = multiple ? 2000 : 60; field.autocomplete = 'off'; field.spellcheck = false;
    field.setAttribute('autocapitalize', 'off'); field.setAttribute('autocorrect', 'off');
    if (multiple) field.rows = 3;
    field.addEventListener('input', () => { state.query = field.value; invalidate(binding); });
    field.addEventListener('keydown', event => { if (event.key === 'Enter' && !multiple) { event.preventDefault(); preview(binding); } });
    const examples = node('div', '', 'identifier-examples'); examples.append(node('span', 'Examples:'));
    for (const example of examplesForIdentifier(config, state.provider)) examples.append(button(`${example.label}${multiple ? '' : ` · ${example.query}`}`, () => setExample(binding, example)));
    panel.append(label, field, examples);
    if (config.allowRange && state.provider === 'ncbi-nucleotide') {
      const group = node('fieldset', '', 'identifier-interval'); group.append(node('legend', 'Interval (optional, 1-based inclusive)'));
      for (const [key, text] of [['start', 'Start'], ['end', 'End']]) {
        const label = node('label', text), input = node('input', '', 'search-input'); input.type = 'number'; input.min = 1; input.step = 1;
        input.value = state[key] || ''; input.placeholder = key === 'start' ? '1' : 'Record end';
        input.addEventListener('input', () => { state[key] = input.value; invalidate(binding); }); label.append(input); group.append(label);
      }
      panel.append(group);
    }
    const count = config.minRecords === config.maxRecords ? config.maxRecords : `${config.minRecords ?? 1}–${config.maxRecords}`;
    const help = `${multiple ? `Choose ${count} records. ` : ''}${config.maxLength ? `Limit: ${config.maxLength.toLocaleString()} ${state.provider === 'uniprot' || state.provider === 'ncbi-protein' ? 'residues' : 'bases'} per record. ` : ''}Metadata is checked with ${identifierProviders[state.provider].label}; Run retrieves the data for analysis in your browser. ${config.help ?? ''}${config.kind === 'coding-dna' ? ' Only the single complete CDS from each transcript is aligned.' : ''}${state.start && !config.optionsFromRange ? ' Analysis coordinates start at 1 within the selected interval.' : ''}`;
    panel.append(node('p', help.trim(), 'identifier-help'), button('Check identifiers', () => preview(binding)));
    binding.status = node('div', '', 'identifier-status'); binding.status.setAttribute('role', 'status'); panel.append(binding.status);
    if (state.preview || state.cached) showRecords(binding, state.preview ?? state.cached, Boolean(state.cached));
    if (config.providers.some(provider => provider.startsWith('ncbi-'))) renderGeneChooser(binding);
  }
  function renderGeneChooser(binding) {
    const { config, state } = binding;
    const details = node('details', '', 'identifier-gene'); details.append(node('summary', 'Find by NCBI Gene ID'));
    const label = node('label', 'NCBI Gene ID'), field = node('input', '', 'search-input'); field.type = 'text'; field.inputMode = 'numeric'; field.placeholder = 'e.g. 7157'; field.maxLength = 12; label.append(field);
    const results = node('div', '', 'identifier-gene-results'); results.setAttribute('aria-live', 'polite');
    const find = button('Find sequences', async () => {
      cancelPreview(state); const controller = state.previewController = new AbortController(), revision = state.revision;
      results.textContent = 'Looking up gene products…'; find.disabled = true;
      try {
        const providers = [state.provider === 'uniprot' || state.provider === 'ncbi-protein' ? 'ncbi-protein' : 'ncbi-nucleotide'];
        const gene = await findIdentifierGeneProducts({ ...config, providers }, field.value, { client, signal: controller.signal });
        if (controller.signal.aborted || revision !== state.revision) return;
        const selectionHelp = gene.provider === 'ncbi-protein' ? 'Select the exact protein sequences to use.'
          : `Select spliced transcripts.${config.allowRange ? ' For genomic DNA, enter a chromosome accession and interval above.' : ''}`;
        results.replaceChildren(node('strong', `${gene.symbol} — ${gene.title}`), node('p', `${gene.organism} · Gene ID ${gene.id}. ${selectionHelp}`, 'identifier-help'));
        const list = node('div', '', 'identifier-gene-products');
        for (const product of gene.products) {
          const label = node('label', '', 'identifier-gene-product'), checkbox = node('input');
          checkbox.type = config.maxRecords === 1 ? 'radio' : 'checkbox'; checkbox.name = `identifier-gene-${config.slot}`;
          checkbox.value = product.id; checkbox.disabled = product.disabled;
          const caption = node('span', `${product.id} · ${product.title || ''} · ${product.length.toLocaleString()} ${gene.provider === 'ncbi-protein' ? 'aa' : 'bp'}${product.representative ? ` · ${product.representative}` : ''}${product.disabled ? ' · exceeds input limit' : ''}`);
          label.append(checkbox, caption); list.append(label);
        }
        const message = node('p', '', 'identifier-help');
        results.append(list, button('Use selected sequences', () => {
          const ids = [...list.querySelectorAll('input:checked')].map(input => input.value);
          try {
            const draft = { provider: gene.provider, query: ids.join('\n'), start: '', end: '' }; planIdentifierInput(config, draft);
            Object.assign(state, draft); renderFields(binding); invalidate(binding);
          } catch (error) { message.textContent = error.message; }
        }), message);
        if (!gene.products.length) message.textContent = 'No compatible sequence products are available for this gene.';
      } catch (error) { if (!controller.signal.aborted) renderExternalError(results, error); }
      finally { find.disabled = false; }
    });
    field.addEventListener('input', () => { cancelPreview(state); results.replaceChildren(); find.disabled = false; });
    details.append(label, find, results); binding.panel.append(details);
  }
  function locate(config) {
    const q = selector => elements.inputPanel.querySelector(selector);
    let host, hidden = [], tabs;
    if (config.mount === 'biological') {
      host = q('#biologicalRecordInputPanel .bio-record-source-card'); hidden = [host?.querySelector('.bio-record-paired-input-grid')];
    } else if (config.mount === 'template') {
      host = q('#pcrTemplateInputPanel'); hidden = [host?.querySelector('.bio-record-source-card')];
    } else if (config.mount === 'split' || config.mount === 'sanger') {
      const textarea = config.mount === 'sanger' ? q('[data-sanger-reference-text]') : q(`.split-input-textarea[data-split-input-index="${config.index}"]`);
      host = textarea?.closest('.split-input-section') ?? textarea?.parentElement;
      if (host) hidden = [...host.children].filter(child => !child.matches('.split-input-heading, .sanger-trace-input-heading, h3'));
      const file = host?.querySelector('.file-button'); if (file) hidden.push(file);
    } else {
      host = q('#fastaSourceInputPanel') ?? q('#workspaceInputSourcePanel');
      hidden = [elements.sequenceInput, elements.dropZone, elements.fileInput.closest('.file-button'), elements.inputFileStatus];
      if (host) hidden.push(...[...host.children].filter(child => child.getAttribute('role') !== 'tablist'));
    }
    const workspace = q('#workspaceInputSourcePanel');
    if (workspace && host !== workspace) hidden.push(workspace);
    tabs = host?.querySelector(':scope > [role="tablist"]');
    return { host, tabs, hidden: hidden.filter(Boolean) };
  }
  function restore(binding) {
    for (const [element, hidden] of binding.hiddenState) element.hidden = hidden;
    binding.hiddenState.clear();
  }
  function choose(binding, mode) {
    const { state } = binding; if (state.mode === mode) return;
    state.mode = mode; state.revision++; cancelPreview(state);
    if (mode === 'local') restore(binding);
    else binding.localTab = binding.tabs.querySelector('[aria-selected="true"]');
    onChange(); refresh(); if (mode === 'identifier' && !state.preview) schedulePreview(binding);
  }
  function attach(config) {
    const location = locate(config), state = stateFor(config);
    const binding = { config, state, ...location, hiddenState: new Map() };
    if (!location.host && config.mount) return null;
    const panel = binding.panel = node('div', '', 'identifier-panel'); panel.dataset.identifierSlot = config.slot;
    panel.id = `identifier-panel-${config.slot}`; panel.setAttribute('role', 'tabpanel');
    let tabs = location.tabs;
    if (!tabs) {
      tabs = createTabbedInputWorkflowTabs({ modes: { local: { label: 'Paste / upload' } }, selectedMode: 'local', ariaLabel: config.slot === 'input' ? 'Input source' : `${config.slot} input source`, onSelect: () => choose(binding, 'local') });
      binding.ownedTabs = true;
      if (location.host) location.host.insertBefore(tabs, location.host.children[1] ?? null);
      else elements.dropZone.before(tabs);
    }
    binding.tabs = tabs;
    const tab = binding.tab = node('button', 'By identifier', tabs.firstElementChild?.className || 'file-source-tab'); tab.type = 'button'; tab.setAttribute('role', 'tab');
    tab.dataset.sourceMode = 'identifier'; tab.dataset.inputWorkflowMode = 'identifier'; tab.id = `identifier-tab-${config.slot}`; tab.setAttribute('aria-controls', panel.id); panel.setAttribute('aria-labelledby', tab.id);
    tab.addEventListener('click', () => choose(binding, 'identifier'));
    binding.listener = event => { if (event.target.closest('[role="tab"]') && event.target.closest('[role="tab"]') !== tab) { choose(binding, 'local'); queueMicrotask(refresh); } };
    tabs.addEventListener('click', binding.listener, true);
    if (tabs.classList.contains('workspace-source-tabs')) {
      binding.keyListener = event => {
        const tabs = [...binding.tabs.querySelectorAll('[role="tab"]')], index = tabs.indexOf(event.target);
        if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].focus(); tabs[next].click();
      };
      tabs.addEventListener('keydown', binding.keyListener);
    }
    tabs.append(tab); tabs.after(panel); renderFields(binding);
    return binding;
  }
  function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      elements.toolView.classList.toggle('identifier-input-active', activeConfigs().length > 0);
      for (const binding of bindings.filter(binding => !binding.panel.isConnected)) {
        restore(binding); binding.tabs.removeEventListener('click', binding.listener, true); binding.tabs.removeEventListener('keydown', binding.keyListener);
        binding.tab.remove(); if (binding.ownedTabs) binding.tabs.remove();
      }
      bindings = bindings.filter(binding => binding.panel.isConnected);
      for (const config of configs()) {
        let binding = bindings.find(binding => binding.config === config && binding.panel.isConnected);
        if (binding && locate(config).host !== binding.host) {
          restore(binding); cancelPreview(binding.state);
          binding.tabs.removeEventListener('click', binding.listener, true); binding.tabs.removeEventListener('keydown', binding.keyListener);
          binding.panel.remove(); binding.tab.remove(); if (binding.ownedTabs) binding.tabs.remove();
          bindings = bindings.filter(value => value !== binding); binding = null;
        }
        if (!binding) {
          binding = attach(config);
          if (binding) { bindings.push(binding); if (binding.state.mode === 'identifier' && !binding.state.preview) schedulePreview(binding); }
        }
        if (!binding) continue;
        const remote = binding.state.mode === 'identifier'; binding.panel.hidden = !remote;
        if (remote) {
          const forced = { ...config.options, ...(config.optionsFromRange ? { [config.optionsFromRange]: 1 } : {}), ...(config.kind === 'phylogeny' ? { sequenceType: '' } : {}) };
          for (const id of Object.keys(forced)) { const option = elements.toolOptions.querySelector(`[data-option-id="${id}"]`); if (option && !binding.hidden.includes(option)) binding.hidden.push(option); }
          for (const element of binding.hidden) { if (!binding.hiddenState.has(element)) binding.hiddenState.set(element, element.hidden); element.hidden = true; }
          updateTabbedInputWorkflowTabs(binding.tabs, 'identifier');
        } else {
          restore(binding); binding.tab.setAttribute('aria-selected', 'false'); binding.tab.tabIndex = -1;
          if (![...binding.tabs.children].some(tab => tab.getAttribute('aria-selected') === 'true')) { const tab = binding.localTab ?? binding.tabs.firstElementChild; tab.setAttribute('aria-selected', 'true'); tab.tabIndex = 0; }
        }
      }
    } finally { refreshing = false; }
  }
  function render() {
    for (const binding of bindings) {
      restore(binding); cancelPreview(binding.state); binding.tabs.removeEventListener('click', binding.listener, true); binding.tabs.removeEventListener('keydown', binding.keyListener);
      binding.panel.remove(); binding.tab.remove(); if (binding.ownedTabs) binding.tabs.remove();
    }
    bindings = [];
  }
  function inputText(local) {
    let text = local;
    for (const config of activeConfigs()) {
      const value = stateFor(config).cached?.text ?? '', separator = `\n${getTool().metadata.splitInput?.separator ?? '---'}\n`;
      if (config.slot === 'input') text = value;
      else {
        const parts = text.split(separator);
        if (config.slot === 'annotation') { parts[0] = value; parts[1] = ''; }
        else if (config.mount === 'sanger') parts[parts.length - 1] = value;
        else parts[config.index ?? 0] = value;
        text = parts.join(separator);
      }
    }
    return text;
  }
  function overrideOptions(options) {
    const result = { ...options };
    for (const config of activeConfigs()) {
      const state = stateFor(config);
      Object.assign(result, config.options, state.cached?.options);
      if (config.slot === 'input') {
        // Keep local uploads in the UI draft, but never let a streamed file take
        // precedence over the explicitly selected remote sequence during a run.
        for (const key of ['loadedFastaFile', 'fastaFile', 'faiFile', 'gziFile']) if (key in result) result[key] = null;
      }
      if (config.optionsFromRange) result[config.optionsFromRange] = Number(state.start || 1);
      if (config.kind === 'phylogeny') result.sequenceType = state.provider === 'ncbi-nucleotide' ? 'dna-rna' : 'protein';
    }
    return result;
  }
  async function resolve(signal) {
    const result = [];
    for (const config of activeConfigs()) planIdentifierInput(config, stateFor(config));
    for (const config of activeConfigs()) {
      const state = stateFor(config), revision = state.revision, binding = bindings.find(binding => binding.config === config && binding.panel.isConnected);
      if (!state.cached) {
        try {
          const data = await retrieveIdentifierInput(config, state, { client, signal, onProgress: text => { if (binding) binding.status.textContent = text; } });
          if (signal.aborted || revision !== state.revision || state.mode !== 'identifier') throw new DOMException('Retrieval cancelled.', 'AbortError');
          state.cached = data;
          if (binding) { if (state.preview) showRecords(binding, state.preview, true); else { showRecords(binding, data, true); schedulePreview(binding); } }
          onReady(); refresh();
        } catch (error) { if (binding && revision === state.revision) renderExternalError(binding.status, error); throw error; }
      }
      result.push({ slot: config.slot, result: state.cached });
    }
    return result;
  }
  // Workspace data and repeatable input cards can arrive after the tool shell.
  // Observe structure only; hiding controls does not retrigger this observer.
  new MutationObserver(refresh).observe(elements.inputPanel, { childList: true, subtree: true });
  return {
    render, refresh, resolve, inputText, overrideOptions,
    active: () => activeConfigs().length > 0,
    replacesWholeInput: () => activeConfigs().some(config => config.slot === 'input'),
    slotText: slot => { const config = activeConfigs().find(config => config.slot === slot); return config ? stateFor(config).cached?.text ?? '' : null; },
    splitText: index => { const config = activeConfigs().find(config => config.index === index); return config ? stateFor(config).cached?.text ?? '' : null; },
    clear() { const active = bindings.filter(binding => binding.state.mode === 'identifier'); for (const binding of active) setExample(binding, { query: '' }); return active.length > 0; },
    loadExample() { const active = bindings.filter(binding => binding.state.mode === 'identifier'); for (const binding of active) setExample(binding, examplesForIdentifier(binding.config, binding.state.provider)[0]); return active.length > 0; }
  };
}
