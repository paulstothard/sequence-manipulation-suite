import { commonOrganisms, organismsFor, knownOrganism, findOrganisms } from '../core/external-resources/organisms.js';

const el = (tag, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
const button = (text, action, cls = '') => { const n = el('button', text, cls); n.type = 'button'; n.addEventListener('click', action); return n; };
function field(label, value = '', choices) {
  const wrapper = el('label', '', 'external-field'); wrapper.append(el('span', label));
  const input = el(choices ? 'select' : 'input'); input.setAttribute('aria-label', label);
  if (choices) for (const [id, name] of choices) { const option = el('option', name); option.value = id; input.append(option); }
  else { input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off'; input.setAttribute('autocorrect', 'off'); input.setAttribute('autocapitalize', 'off'); input.setAttribute('writingsuggestions', 'false'); }
  input.value = value;
  if (choices) { const control = el('span', '', 'external-select-control'); control.append(input); wrapper.append(control); }
  else wrapper.append(input);
  return { wrapper, input };
}
export function createGeneDiscoveryController({ host, source, client, displayResult, resetOutput, isActive, initialValues }) {
  let geneApi;
  let controller, epoch = 0, model, selected = new Set(), page = 0, chosenOrganism = initialValues ? initialValues.organism : knownOrganism('Human');
  const form = el('fieldset', '', 'external-fields gene-discovery'), inputs = el('div', '', 'external-selectors');
  const commonChoice = organismsFor(source).find(row => row.taxId === chosenOrganism?.taxId && row.species === chosenOrganism?.species);
  const organism = field('Organism', commonChoice?.taxId || 'other', [...organismsFor(source).map(row => [row.taxId, row.label]), ['other', 'Find another organism…']]);
  const customOrganism = field('Organism name', initialValues?.organismName ?? chosenOrganism?.label ?? ''), query = field(source === 'ncbi' ? 'Gene symbol, name, synonym, or Gene ID' : 'Gene symbol, synonym, or Ensembl gene ID', initialValues?.query ?? 'HBB');
  query.input.maxLength = 200; customOrganism.input.maxLength = 200; customOrganism.wrapper.hidden = Boolean(commonChoice);
  inputs.append(organism.wrapper, customOrganism.wrapper, query.wrapper); form.append(inputs);
  const organismMatches = el('div', '', 'external-matches'); form.append(organismMatches);
  const hint = el('p', source === 'ncbi' ? 'Choose an organism, then enter a familiar gene name. NCBI Gene searches official symbols and synonyms; no database query syntax is needed.' : 'Ensembl supports symbols, synonyms and stable gene IDs for its annotated species. Use NCBI Gene for broad gene-name searches.', 'external-help'); form.append(hint);
  const search = button('Find genes', () => runSearch(0), 'primary-button');
  const findOrganismButton = button('Find organism', findSpecies); findOrganismButton.hidden = Boolean(commonChoice);
  const actions = el('div', '', 'button-row'); actions.append(search, findOrganismButton, button('Load example', () => {
    cancel(); resetOutput(); model = null; results.replaceChildren(); products.replaceChildren(); organismMatches.replaceChildren();
    organism.input.value = commonOrganisms[0].taxId; chosenOrganism = commonOrganisms[0]; customOrganism.wrapper.hidden = findOrganismButton.hidden = true; query.input.value = 'HBB'; status.textContent = '';
  }), button('Clear input', () => { query.input.value = ''; invalidateSearch(); })); form.append(actions);
  const privacy = el('p', `Search sends the organism and gene name to ${source === 'ncbi' ? 'NCBI' : 'Ensembl'}. Sequences are downloaded only after you choose products and select Retrieve.`, 'external-privacy');
  const status = el('p', '', 'external-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const cancelButton = button('Cancel retrieval', () => { cancel(); resetOutput(); status.textContent = 'Cancelled. Your selections were kept.'; }); cancelButton.hidden = true;
  const results = el('div', '', 'external-matches'), products = el('div', '', 'gene-products');
  host.append(form, privacy, cancelButton, status, results, products);
  function cancel() { epoch++; controller?.abort(); controller = null; form.disabled = false; products.querySelectorAll('fieldset').forEach(n => n.disabled = false); cancelButton.hidden = true; }
  function invalidateSearch() { cancel(); resetOutput(); model = null; results.replaceChildren(); products.replaceChildren(); organismMatches.replaceChildren(); status.textContent = ''; status.classList.remove('external-error'); }
  query.input.addEventListener('input', invalidateSearch);
  organism.input.addEventListener('change', () => { chosenOrganism = knownOrganism(organism.input.value); customOrganism.wrapper.hidden = findOrganismButton.hidden = organism.input.value !== 'other'; invalidateSearch(); });
  customOrganism.input.addEventListener('input', () => { chosenOrganism = null; invalidateSearch(); });
  query.input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void runSearch(0); } });
  async function execute(work) {
    cancel(); const currentEpoch = epoch; controller = new AbortController(); const signal = controller.signal;
    const current = () => currentEpoch === epoch && isActive('get-data') && host.isConnected;
    form.disabled = true; products.querySelectorAll('fieldset').forEach(n => n.disabled = true); cancelButton.hidden = false; status.classList.remove('external-error');
    try {
      geneApi ??= await import('../core/external-resources/gene.js');
      if (current()) await work(signal, current);
    }
    catch (error) { if (current()) { status.textContent = error.message; status.classList.add('external-error'); } }
    finally { if (current()) { form.disabled = false; products.querySelectorAll('fieldset').forEach(n => n.disabled = false); cancelButton.hidden = true; controller = null; } }
  }
  async function findSpecies() {
    invalidateSearch();
    await execute(async (signal, current) => {
      status.textContent = 'Finding organisms…';
      const rows = await findOrganisms(customOrganism.input.value, source, client, signal);
      if (!current()) return;
      status.textContent = rows.length ? 'Choose an organism, then find genes.' : 'No matching organisms. Try the scientific name.';
      for (const row of rows.slice(0, 50)) organismMatches.append(button(row.label, () => { chosenOrganism = row; customOrganism.input.value = row.label; organismMatches.replaceChildren(); status.textContent = 'Organism selected. Enter a gene name and choose Find genes.'; }));
      if (rows.length > 50) status.textContent = 'Showing 50 organisms. Refine the organism name to narrow the list.';
    });
  }
  async function runSearch(nextPage) {
    if (!chosenOrganism) { await findSpecies(); return; }
    resetOutput(); model = null; products.replaceChildren(); results.replaceChildren(); page = nextPage;
    await execute(async (signal, current) => {
      status.textContent = 'Searching genes…';
      const response = await geneApi.searchGenes({ source, query: query.input.value, organism: chosenOrganism, page }, client, signal);
      if (!current()) return;
      status.textContent = response.total ? `${response.total.toLocaleString()} gene matches. Showing ${page * 20 + 1}–${page * 20 + response.matches.length}. Choose a gene to see its sequences.` : 'No matching genes. Try a symbol, synonym, or a shorter name.';
      const list = el('ul', '', 'gene-match-list'); list.setAttribute('aria-label', 'Gene matches'); list.setAttribute('role', 'list');
      for (const row of response.matches) {
        const item = el('li', '', 'gene-match'), description = el('div', '', 'gene-match-content');
        const heading = el('h3', '', 'gene-match-heading'); heading.append(el('strong', row.symbol), el('span', row.title));
        description.append(heading, el('p', [row.organism, `${source === 'ncbi' ? 'NCBI Gene' : 'Ensembl gene'}: ${row.id}`, row.chromosome ? `Chromosome ${row.chromosome}` : '', row.assembly].filter(Boolean).join(' · '), 'external-help'));
        if (row.aliases) description.append(el('p', `Also known as: ${row.aliases}`, 'external-help'));
        const choose = button('View sequences', () => chooseGene(row), 'gene-match-action');
        choose.setAttribute('aria-label', `View sequences for ${row.symbol} (${row.id})`);
        item.append(description, choose); list.append(item);
      }
      if (list.childElementCount) results.append(list);
      const navigation = el('div', '', 'button-row');
      if (page) navigation.append(button('Previous gene matches', () => runSearch(page - 1)));
      if ((page + 1) * 20 < response.total) navigation.append(button('Next gene matches', () => runSearch(page + 1)));
      if (navigation.childElementCount) results.append(navigation);
    });
  }
  async function chooseGene(row) {
    resetOutput(); products.replaceChildren();
    await execute(async (signal, current) => {
      status.textContent = 'Reading gene products…';
      const value = await geneApi.loadGene({ source, id: row.id, organism: { ...chosenOrganism, taxId: row.taxId || chosenOrganism.taxId } }, client, signal, message => { if (current()) status.textContent = message; });
      if (!current()) return;
      model = value; results.replaceChildren(); status.textContent = 'Choose a sequence type and records below. No sequences have been downloaded.'; renderProducts();
    });
  }
  function renderProducts() {
    products.replaceChildren();
    // A normal heading lets WebKit reflow this grid fieldset when the form resizes.
    const section = el('fieldset', '', 'external-fields'), identity = el('div', '', 'gene-product-identity');
    const heading = el('h3', `${model.symbol} — ${model.title}`, 'gene-product-heading'); heading.id = 'gene-product-heading';
    section.setAttribute('aria-labelledby', heading.id);
    identity.append(heading, el('p', `${model.organism} · ${source === 'ncbi' ? 'NCBI Gene' : 'Ensembl'} ${model.id}`, 'external-help')); section.append(identity);
    const selectors = el('div', '', 'external-selectors');
    const assembly = field('Assembly', '0', model.placements.length ? model.placements.map((row, i) => [String(i), row.label]) : [['0', 'No genomic placement supplied']]);
    const initialRows = model.rowsByPlacement[0];
    const product = field('Sequence type', initialRows.some(row => row.hasTranscript !== false) ? 'cdna' : initialRows.some(row => row.proteinId) ? 'protein' : 'genomic', geneApi.geneProducts.map(([id, label]) => [id, label]));
    selectors.append(assembly.wrapper, product.wrapper); section.append(selectors);
    const description = el('span', '', 'external-help'), location = el('span', '', 'external-help');
    description.id = 'gene-product-help'; location.id = 'gene-assembly-help';
    product.input.setAttribute('aria-describedby', description.id); assembly.input.setAttribute('aria-describedby', location.id);
    product.wrapper.append(description); assembly.wrapper.append(location);
    const genomic = el('div', '', 'gene-genomic-options');
    const orientation = field('DNA orientation', 'reference', [['reference', 'Reference chromosome (+)'], ['gene', 'Gene direction (5′ → 3′)']]); genomic.append(orientation.wrapper);
    const advanced = el('details', '', 'option-group option-group-collapsible gene-flanks'); advanced.append(el('summary', 'Flanking sequence (optional)'));
    const flankFields = el('div', '', 'external-selectors');
    const upstream = field('Upstream flank (bp)', '0'), downstream = field('Downstream flank (bp)', '0');
    for (const value of [upstream, downstream]) { value.input.type = 'number'; value.input.min = '0'; value.input.max = '100000'; value.input.step = '1'; flankFields.append(value.wrapper); }
    advanced.append(el('p', 'Upstream and downstream follow the gene’s strand. Flanks apply only to genomic DNA.', 'external-help'), flankFields); genomic.append(advanced); section.append(genomic);
    const recordsPanel = el('div', '', 'gene-records');
    recordsPanel.append(el('h3', 'Choose records to retrieve', 'gene-record-heading'), el('p', 'Checked records will be retrieved.', 'external-help gene-record-help'));
    const tools = el('div', '', 'button-row'); recordsPanel.append(tools);
    const searchControls = el('div', '', 'gene-record-search');
    const filter = field('Search this list', ''); filter.input.type = 'search'; filter.input.placeholder = 'ID, name, or annotation';
    const clearSearch = button('Clear search', () => {
      filter.input.value = ''; recordPage = 0; renderRecords();
      if (searchControls.hidden) records.querySelector('input')?.focus();
      else filter.input.focus();
    });
    const searchHelp = el('p', 'Search narrows the displayed list. Checked records stay selected when hidden.', 'external-help');
    searchHelp.id = 'gene-record-search-help'; filter.input.setAttribute('aria-describedby', searchHelp.id);
    searchControls.append(filter.wrapper, clearSearch, searchHelp); recordsPanel.append(searchControls);
    const count = el('p', '', 'external-help'); count.setAttribute('role', 'status'); recordsPanel.append(count);
    const records = el('div', '', 'gene-record-list'); recordsPanel.append(records); section.append(recordsPanel);
    const output = field('Output format', 'fasta', geneApi.geneFormats(source, 'cdna')), formatHelp = el('p', '', 'external-help');
    formatHelp.id = 'gene-format-help'; output.input.setAttribute('aria-describedby', formatHelp.id);
    const outputChoice = el('div', '', 'external-output-choice'); outputChoice.append(output.wrapper, formatHelp); section.append(outputChoice);
    const preview = el('p', '', 'gene-preflight'); preview.setAttribute('aria-live', 'polite'); section.append(preview);
    const retrieve = button('Retrieve selected records', () => execute(async (signal, current) => {
      resetOutput(); status.textContent = 'Retrieving the selected products…';
      const value = await geneApi.retrieveGene(model, options(), client, signal, message => { if (current()) status.textContent = message; });
      if (!current()) return;
      await displayResult(value, model.symbol, { outputFormat: value.retrievalFormat || output.input.value }, current, signal);
      if (current()) status.textContent = value.retrievalSummary || 'Retrieved selected records.';
    }), 'primary-button');
    const retrieveActions = el('div', '', 'button-row'); retrieveActions.append(retrieve);
    section.append(retrieveActions, el('p', 'Limits: 25 MiB per retrieval; 1,000 transcripts; genomic DNA up to 1,000,000 bases. Larger requests fail without partial output.', 'external-help')); products.append(section);
    let recordPage = 0;
    const rows = () => [...model.rowsByPlacement[Number(assembly.input.value)]].sort((a, b) => Number(Boolean(b.representative)) - Number(Boolean(a.representative)) || a.id.localeCompare(b.id, 'en', { numeric: true }));
    const available = row => product.input.value === 'protein' ? Boolean(row.proteinId) : product.input.value === 'cds' ? Boolean(source === 'ncbi' ? row.cdsLength : row.proteinId) : product.input.value === 'cdna' ? row.hasTranscript !== false : true;
    const options = () => ({ placement: Number(assembly.input.value), product: product.input.value, format: output.input.value, selectedIds: [...selected], orientation: orientation.input.value, upstream: upstream.input.value, downstream: downstream.input.value });
    function preflight() {
      resetOutput();
      const chosen = rows().filter(row => selected.has(row.id) && available(row)), format = output.input.value;
      const metadata = ['summary', 'tsv'].includes(format);
      formatHelp.textContent = format === 'fasta' ? 'FASTA includes sequences and provenance in headers; feature annotations are omitted.' : ['gb', 'gp'].includes(format) ? 'Native NCBI records preserve all supplied feature annotations and references.' : 'Metadata and identifiers only; product sequences are not downloaded.';
      try {
        const { plan } = geneApi.genePlan(model, options());
        if (product.input.value === 'genomic') preview.textContent = `Will return one genomic interval: ${plan.region.chrom}:${plan.region.start.toLocaleString()}–${plan.region.end.toLocaleString()}, ${plan.region.length.toLocaleString()} bp, ${plan.strand === '-1' ? 'reverse complement' : 'reference (+) orientation'}. ${formatHelp.textContent}`;
        else {
          const number = !metadata && product.input.value === 'protein' ? new Set(chosen.map(row => row.proteinId)).size : chosen.length;
          const noun = metadata ? 'product metadata record' : { cdna: 'spliced transcript', cds: 'coding sequence', protein: 'protein' }[product.input.value];
          preview.textContent = `Will return ${number} ${noun}${number === 1 ? '' : 's'} from ${model.organism}. ${metadata ? 'Sequences are omitted.' : 'Complete products in biological orientation; no clipping.'} ${['gb', 'gp'].includes(format) ? 'Native feature annotations included.' : format === 'fasta' ? 'Feature annotations omitted.' : ''}`;
        }
        retrieve.disabled = product.input.value !== 'genomic' && !chosen.length;
      } catch (error) { preview.textContent = error.message; retrieve.disabled = true; }
    }
    function renderRecords() {
      const term = filter.input.value.trim().toLowerCase(), all = rows();
      const filtered = all.filter(row => [row.id, row.name, row.proteinId, row.proteinName, row.biotype, row.status, row.representative].join(' ').toLowerCase().includes(term));
      recordPage = Math.min(recordPage, Math.max(0, Math.ceil(filtered.length / 20) - 1));
      searchControls.hidden = all.length <= 1 && !filter.input.value;
      clearSearch.disabled = !filter.input.value;
      records.replaceChildren();
      function updateCount() {
        const hiddenSelected = selected.size - filtered.filter(row => selected.has(row.id)).length;
        const shown = filtered.length > 20 ? `Showing ${recordPage * 20 + 1}–${Math.min((recordPage + 1) * 20, filtered.length)} of ${filtered.length}` : String(filtered.length);
        const noun = term ? (filtered.length === 1 ? 'search match' : 'search matches') : (filtered.length === 1 ? 'record' : 'records');
        count.textContent = `${selected.size} selected for retrieval · ${all.filter(available).length} available · ${shown} ${noun}.`;
        if (hiddenSelected) count.textContent += ` ${hiddenSelected} selected record${hiddenSelected === 1 ? ' is' : 's are'} hidden by this search.`;
      }
      updateCount();
      for (const row of filtered.slice(recordPage * 20, recordPage * 20 + 20)) {
        const label = el('label', '', 'gene-record'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(row.id); check.disabled = !available(row); check.setAttribute('aria-label', `Select ${row.id}`);
        const text = el('span'); text.append(el('strong', `${row.id}${row.name ? ` — ${row.name}` : ''}`));
        text.append(el('span', `${row.hasTranscript === false ? 'No separate transcript or CDS record supplied' : `${row.length.toLocaleString()} nt · ${row.biotype ? row.biotype.replaceAll('_', ' ').toLowerCase() : 'Transcript'}`} · ${row.status || 'Source annotation'}${row.representative ? ` · ${row.representative}` : ''}`));
        text.append(el('span', row.proteinId ? `Protein: ${row.proteinId} · ${row.proteinLength.toLocaleString()} aa${row.proteinName ? ` · ${row.proteinName}` : ''}${row.cdsLength ? ` · CDS ${row.cdsLength.toLocaleString()} nt` : ''}` : 'No annotated protein or CDS'));
        if (!available(row)) text.append(el('span', 'Unavailable for this sequence type', 'external-help'));
        check.addEventListener('change', () => { if (check.checked) selected.add(row.id); else selected.delete(row.id); updateCount(); preflight(); }); label.append(check, text); records.append(label);
      }
      if (!filtered.length) records.append(el('p', all.length ? 'No records match this search. Clear search to show all records.' : 'This source provides no transcript products for this gene on the selected assembly. Genomic DNA may still be available.', 'external-help'));
      const pagination = el('div', '', 'button-row');
      if (recordPage) pagination.append(button('Previous transcripts', () => { recordPage--; renderRecords(); }));
      if ((recordPage + 1) * 20 < filtered.length) pagination.append(button('Next transcripts', () => { recordPage++; renderRecords(); }));
      if (pagination.childElementCount) records.append(pagination); preflight();
    }
    tools.append(button('Select all available', () => { selected = new Set(rows().filter(available).map(row => row.id)); renderRecords(); }), button('Select representatives', () => { selected = new Set(rows().filter(row => available(row) && row.representative).map(row => row.id)); renderRecords(); }), button('Clear selection', () => { selected.clear(); renderRecords(); }));
    function update(resetSelection = false) {
      const current = product.input.value, placement = model.placements[Number(assembly.input.value)];
      description.textContent = geneApi.geneProducts.find(([id]) => id === current)[2];
      location.textContent = placement ? `${placement.chrom}:${placement.start.toLocaleString()}–${placement.end.toLocaleString()} · Gene strand: ${placement.strand} · ${placement.annotation}` : 'Genomic placement is not supplied by this source.';
      genomic.hidden = current !== 'genomic'; recordsPanel.hidden = current === 'genomic';
      const previous = output.input.value; output.input.replaceChildren();
      for (const [id, label] of geneApi.geneFormats(source, current)) { const option = el('option', label); option.value = id; output.input.append(option); }
      if ([...output.input.options].some(option => option.value === previous)) output.input.value = previous;
      if (resetSelection) selected = new Set(rows().filter(available).map(row => row.id));
      else selected = new Set([...selected].filter(id => rows().some(row => row.id === id && available(row))));
      renderRecords();
    }
    product.input.addEventListener('change', () => update()); assembly.input.addEventListener('change', () => { recordPage = 0; update(true); });
    filter.input.addEventListener('input', () => { recordPage = 0; renderRecords(); });
    for (const f of [orientation, upstream, downstream, output]) f.input.addEventListener('change', preflight);
    update(true);
  }
  return { cancel, snapshot: () => ({ organism: chosenOrganism, organismName: chosenOrganism?.label ?? customOrganism.input.value, query: query.input.value }) };
}
