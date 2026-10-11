import { createGeneDiscoveryController } from './gene-discovery-ui.js';

const el = (tag, text = '', cls = '') => { const node = document.createElement(tag); node.textContent = text; if (cls) node.className = cls; return node; };
function field(label, value, choices) {
  const wrapper = el('label', '', 'external-field'); wrapper.append(el('span', label));
  const input = el(choices ? 'select' : 'input'); input.setAttribute('aria-label', label);
  if (choices) {
    for (const [id, title] of choices) { const option = el('option', title); option.value = id; input.append(option); }
    const shell = el('span', '', 'external-select-control'); shell.append(input); wrapper.append(shell);
  } else { input.type = 'number'; input.min = '0'; input.max = '100000'; input.step = '1'; wrapper.append(input); }
  input.value = value;
  return { wrapper, input };
}

export function createGeneViewerController({ host, client, displayResult, resetOutput, isActive, initialValues, runGeneViewer }) {
  return createGeneDiscoveryController({ host, client, source: 'ncbi', toolId: 'gene-viewer', isActive, initialValues, resetOutput, displayResult,
    async onGeneSelected({ model, host: products, execute, current, setStatus }) {
      const { genePlan, retrieveGene } = await import('../core/external-resources/gene.js');
      if (!current()) return;
      const section = el('fieldset', '', 'external-fields gene-viewer-controls');
      section.append(el('h3', `${model.symbol} — ${model.title}`, 'gene-product-heading'), el('p', `${model.organism} · NCBI Gene: ${model.id}`, 'external-help'));
      products.append(section);
      if (!model.placements.length) { setStatus('This gene has no genomic placement available at NCBI. Try another gene.'); return; }
      const selectors = el('div', '', 'external-selectors');
      const assembly = field('Assembly', '0', model.placements.map((placement, index) => [String(index), placement.label]));
      const orientation = field('DNA orientation', 'reference', [['reference', 'Reference chromosome (+)'], ['gene', 'Gene direction (5′ → 3′)']]);
      selectors.append(assembly.wrapper, orientation.wrapper); section.append(selectors);
      const flanks = el('details', '', 'option-group option-group-collapsible gene-flanks'); flanks.append(el('summary', 'Flanking sequence (optional)'));
      const flankFields = el('div', '', 'external-selectors'), upstream = field('Upstream flank (bp)', '0'), downstream = field('Downstream flank (bp)', '0');
      flankFields.append(upstream.wrapper, downstream.wrapper); flanks.append(el('p', 'Upstream and downstream follow the gene’s strand.', 'external-help'), flankFields); section.append(flanks);
      const location = el('p', '', 'external-help'), progress = el('p', '', 'external-help'); section.append(location);
      const actions = el('div', '', 'button-row'), view = el('button', 'View region', 'primary-button'); view.type = 'button';
      const link = el('a', 'NCBI Gene'); link.href = `https://www.ncbi.nlm.nih.gov/gene/${model.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
      actions.append(view, link); section.append(actions, progress);
      section.append(el('p', 'Viewer positions start at 1 in the downloaded region. Feature details include chromosome coordinates. Tracks contain annotations supplied with the NCBI record; ClinVar and dbSNP are not queried separately.', 'external-help'));
      const limits = el('details', '', 'option-group option-group-collapsible'); limits.append(el('summary', 'Limits'), el('p', 'Up to 1,000,000 genomic bases, 25 MiB per retrieval, and 1,000 transcript metadata records. Larger requests are refused.', 'external-help')); section.append(limits);
      const options = () => ({ product: 'genomic', format: 'gb', placement: Number(assembly.input.value), orientation: orientation.input.value, upstream: upstream.input.value, downstream: downstream.input.value });
      function preflight() {
        resetOutput(); progress.textContent = '';
        setStatus(`Selected ${model.symbol}. Choose View region to download its sequence and annotations.`);
        try {
          const { plan, placement } = genePlan(model, options());
          location.textContent = `${placement.assemblyName} · ${plan.region.chrom}:${plan.region.start.toLocaleString()}–${plan.region.end.toLocaleString()} · ${plan.region.length.toLocaleString()} bp · gene strand ${placement.strand}`;
          view.disabled = false;
        } catch (error) { location.textContent = error.message; view.disabled = true; }
      }
      async function retrieve(signal, current) {
        section.disabled = true;
        resetOutput(); progress.textContent = '';
        const values = options(), { plan, placement, rows } = genePlan(model, values);
        const retrieved = await retrieveGene(model, values, client, signal, message => { if (current()) setStatus(message); });
        if (!current()) return;
        setStatus('Preparing the annotated gene view…');
        const geneContext = { symbol: model.symbol, id: model.id, organism: model.organism, assembly: `${placement.assemblyName} (${placement.assembly})`, annotation: placement.annotation, chrom: plan.region.chrom, start: plan.region.start, end: plan.region.end, strand: plan.strand === '-1' ? '-' : '+', transcripts: rows };
        const result = await runGeneViewer(retrieved.output, { geneContext }, { signal });
        if (!current()) return;
        result.downloads = [{ label: 'Download GenBank', ...retrieved.download, text: retrieved.output }, ...(retrieved.downloads ?? [])];
        result.optionsUsed = retrieved.optionsUsed;
        result.warnings = [...(retrieved.warnings ?? []), ...result.warnings];
        await displayResult(result, retrieved.output, { outputFormat: 'interactive-viewer' }, current, signal);
        if (current()) {
          const { features, transcripts } = result.geneViewerSummary;
          setStatus(`Viewing ${model.symbol}.`);
          progress.textContent = `${transcripts} annotated transcript${transcripts === 1 ? '' : 's'} · ${features} features · ${result.basesProcessed.toLocaleString()} bp. Toggle feature groups above the viewer; use Track settings for individual tracks.`;
        }
      }
      for (const control of [assembly, orientation]) control.input.addEventListener('change', preflight);
      for (const control of [upstream, downstream]) control.input.addEventListener('input', preflight);
      view.addEventListener('click', () => execute(retrieve));
      preflight();
    }
  });
}
