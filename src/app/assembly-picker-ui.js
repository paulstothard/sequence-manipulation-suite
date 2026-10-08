import { organismsFor, knownOrganism, findOrganisms, bundledAssemblies, bundledAssembly, assemblySource } from '../core/external-resources/organisms.js';
const knownAssemblies = new Map();

// Shared Get/Send selector. Bundled choices make no requests; explicit discovery
// supplements them. Exact identifiers remain available for saved/custom inputs.
export function installAssemblyPicker({ wrapper, assembly, species, source, client, changed, initialOrganism, allowDiscovery = true }) {
  let controller, chosen = initialOrganism;
  const provider = assemblySource(source), hasAssemblyInput = Boolean(assembly);
  assembly ||= document.createElement('input');
  const node = (tag, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
  function select(labelText) {
    const label = node('label', labelText); label.className = 'external-field';
    const input = node('select'); input.setAttribute('aria-label', labelText);
    const control = node('span'); control.className = 'external-select-control'; control.append(input); label.append(control);
    return { label, input };
  }
  function option(input, value, label) { const el = node('option', label); el.value = value; input.append(el); return el; }
  const organismField = select('Organism'), organism = organismField.input;
  for (const row of organismsFor(provider)) option(organism, row.taxId, row.label);
  option(organism, 'other', allowDiscovery ? 'Find another organism…' : 'Custom organism / assembly');
  const customField = node('label', 'Organism name'); customField.className = 'external-field';
  const custom = node('input'); custom.type = 'text'; custom.setAttribute('aria-label', 'Organism name'); custom.maxLength = 200; customField.append(custom);
  const assemblyField = select('Assembly'), menu = assemblyField.input;
  const actions = node('div'); actions.className = 'button-row';
  actions.hidden = !allowDiscovery;
  const find = node('button', 'Find assemblies'); find.type = 'button'; actions.append(find);
  const message = node('p'); message.className = 'external-help'; message.setAttribute('role', 'status');
  const optionsHost = node('div'); optionsHost.className = 'external-matches';
  const advanced = node('details'); advanced.append(node('summary', hasAssemblyInput ? 'Enter assembly identifier' : 'Enter species identifier'));
  if (hasAssemblyInput) {
    (wrapper.querySelector('label') || wrapper).firstChild.textContent = 'Assembly identifier'; assembly.setAttribute('aria-label', 'Assembly identifier');
  }
  const container = node('div'); container.className = 'assembly-picker'; wrapper.before(container); advanced.append(wrapper);
  const speciesWrapper = species?.closest('[data-field="species"]');
  if (speciesWrapper && speciesWrapper !== wrapper) advanced.append(speciesWrapper);
  container.append(organismField.label, customField, assemblyField.label, actions, optionsHost, message, advanced);
  const reference = node('a', 'About these species and assemblies'); reference.href = '#reference=organisms-assemblies'; reference.className = 'external-help'; container.append(reference);

  function showOrganism() {
    organism.value = organismsFor(provider).some(row => row.taxId === chosen?.taxId) ? chosen.taxId : 'other';
    customField.hidden = !allowDiscovery || organism.value !== 'other'; custom.value = chosen?.label || '';
  }
  function setMenu(rows, id, preserveCustom = false) {
    menu.replaceChildren();
    if (!id || (preserveCustom && !rows.some(row => row.id === id))) option(menu, id, id ? `Custom: ${id}` : 'Choose an assembly');
    for (const row of rows) {
      knownAssemblies.set(`${provider}:${row.id}:${row.species || ''}`, { ...row, selectedOrganism: chosen });
      const el = option(menu, row.id, row.label); if (row.species) el.dataset.species = row.species;
    }
    menu.value = id;
  }
  function describe(rows) {
    const date = rows.find(row => row.checkedAt)?.checkedAt.slice(0, 10);
    message.textContent = rows.length ? `${rows.length} bundled assembly choice${rows.length === 1 ? '' : 's'}${date ? `; checked ${date}` : ''}. ${allowDiscovery ? 'Find assemblies checks the provider for current choices.' : 'Incoming coordinates must match this assembly; coordinates are not converted.'}` : `No bundled assembly for this organism. ${allowDiscovery ? 'Choose Find assemblies or enter an identifier.' : 'Enter its identifiers below; use Get Data to discover other organisms.'}`;
    if (!hasAssemblyInput) message.textContent += ' Ensembl browser links use its current assembly for this species.';
  }
  function selected() {
    assembly.value = menu.value;
    if (species && menu.selectedOptions[0]?.dataset.species) species.value = menu.selectedOptions[0].dataset.species;
    changed();
  }
  function update() {
    const match = knownAssemblies.get(`${provider}:${assembly.value}:${species?.value || ''}`) || bundledAssembly(provider, assembly.value, species?.value);
    chosen = match?.selectedOrganism || knownOrganism(match?.taxId) || knownOrganism(species?.value) || (assembly.value ? null : chosen);
    if (!hasAssemblyInput && !species.value) chosen = null;
    showOrganism();
    const rows = bundledAssemblies(provider, chosen);
    if (!hasAssemblyInput) assembly.value = rows[0]?.id || '';
    setMenu(rows, assembly.value, true); describe(rows);
    if (assembly.value && !rows.some(row => row.id === assembly.value)) message.textContent = 'Custom identifier. Organism and assembly support will be checked by the selected service.';
  }
  update();
  assembly.addEventListener('input', update);
  species?.addEventListener('input', () => { if (!hasAssemblyInput) assembly.value = ''; update(); });
  menu.addEventListener('change', selected);
  organism.addEventListener('change', () => {
    controller?.abort(); chosen = knownOrganism(organism.value); showOrganism(); optionsHost.replaceChildren();
    const rows = bundledAssemblies(provider, chosen); assembly.value = rows[0]?.id || '';
    if (species) species.value = chosen?.species || '';
    setMenu(rows, assembly.value); describe(rows); if (!allowDiscovery && !chosen) advanced.open = true; changed();
  });
  custom.addEventListener('input', () => { chosen = null; controller?.abort(); assembly.value = ''; if (species) species.value = ''; setMenu([], ''); changed(); });
  async function load() {
    controller?.abort(); controller = new AbortController(); const signal = controller.signal;
    find.disabled = true; message.textContent = 'Finding assemblies…'; optionsHost.replaceChildren();
    try {
      if (!chosen) {
        const rows = await findOrganisms(custom.value, provider === 'ensembl' ? 'ensembl' : 'ncbi', client, signal);
        if (signal.aborted || !container.isConnected) return;
        message.textContent = rows.length ? 'Choose an organism.' : 'No organisms found; try the scientific name.';
        for (const row of rows.slice(0, 50)) {
          const button = node('button', row.label); button.type = 'button';
          button.addEventListener('click', () => { chosen = row; showOrganism(); void load(); }); optionsHost.append(button);
        }
        return;
      }
      const { findAssemblies } = await import('../core/external-resources/assembly-catalog.js');
      const response = await findAssemblies({ source: provider, organism: chosen }, client, signal);
      if (signal.aborted || !container.isConnected) return;
      if (!response.rows.length) { message.textContent = 'No supported reference assembly was found. Bundled choices are unchanged; try another source or enter an identifier.'; return; }
      const id = response.rows.some(row => row.id === assembly.value) ? assembly.value : response.rows[0].id;
      setMenu(response.rows, id); selected();
      message.textContent = 'Provider choices loaded. Enter coordinates for the selected assembly; old coordinates are not converted.';
    } catch (error) { if (!signal.aborted && container.isConnected) message.textContent = `${error.message} Bundled choices remain available.`; }
    finally { if (container.isConnected) find.disabled = false; }
  }
  find.addEventListener('click', load);
  return { cancel: () => controller?.abort(), update, selectedOrganism: () => chosen };
}
