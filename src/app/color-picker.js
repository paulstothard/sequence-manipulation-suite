import { colorOpacity, withColorOpacity, isImageColor } from '../core/image-colors.js';
import { recentImageColors, rememberImageColor } from './recent-image-colors.js';

// Preset colors follow the Tree Viewer's palette, with readable names.
const COLORS = [
  ['Black','#000000'], ['White','#ffffff'], ['Slate','#334155'], ['Gray','#64748b'],
  ['Blue','#0072b2'], ['Sky blue','#56b4e9'], ['Green','#009e73'], ['Orange','#e69f00'],
  ['Vermilion','#d55e00'], ['Rose','#cc79a7'], ['Yellow','#f0e442'], ['Red','#b91c1c']
];

export function createColorPicker(name, value, { sampleColor } = {}) {
  const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const element = make('div', null, 'sms3-color-field');
  const label = make('span', name);
  const input = make('input'); input.type = 'hidden'; input.value = value;
  const trigger = make('button', null, 'sms3-color-trigger'); trigger.type = 'button';
  trigger.title = name;
  trigger.setAttribute('aria-label', name); trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
  const panel = make('div', null, 'sms3-color-popover'); panel.popover = 'auto';
  panel.id = `color-${crypto.randomUUID()}`; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label',name);
  trigger.setAttribute('aria-controls', panel.id);
  const heading = make('div', null, 'sms3-color-heading');
  const dismiss = make('button', '×', 'sms3-color-close'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Close color picker');
  const headingActions = make('div', null, 'sms3-color-heading-actions');
  const dropper = make('button', null, 'sms3-color-eyedropper'); dropper.type = 'button';
  dropper.title = 'Pick color from image'; dropper.setAttribute('aria-label', 'Pick color from image');
  dropper.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M15 4l2-2 5 5-2 2-2-2-10 10-5 1 1-5L14 6z"/></svg>';
  if (sampleColor) headingActions.append(dropper);
  headingActions.append(dismiss); heading.append(make('strong',name),headingActions);
  const palette = make('div', null, 'sms3-color-palette'); palette.setAttribute('role','group'); palette.setAttribute('aria-label','Standard colors');
  const opacitySummary = make('output', null, 'sms3-color-opacity');
  const recent = make('div', null, 'sms3-color-recent');
  const recentPalette = make('div', null, 'sms3-color-palette');
  recentPalette.setAttribute('role','group'); recentPalette.setAttribute('aria-label','Recent colors');
  const recentEmpty = make('span', 'No recent colors yet.', 'sms3-color-help');
  recent.append(make('span','Recent colors','sms3-color-help'), recentPalette, recentEmpty);
  const help = make('p','Changes apply immediately.','sms3-color-help');
  let picker, listeners, sampling, openedColor;
  const swatches = [];
  function refresh() {
    trigger.style.setProperty('--swatch-color', input.value);
    const rgb = input.value.slice(0,7).toLowerCase(), opacity = Math.round(colorOpacity(input.value) * 100);
    const current = COLORS.find(([,color]) => color === rgb);
    trigger.setAttribute('aria-description', `Current color: ${current?.[0] ?? 'Custom color'}, ${opacity}% opacity. Changes apply immediately.`);
    opacitySummary.textContent = `Opacity ${opacity}%`;
    for (const swatch of swatches) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === rgb));
    if (picker) picker.color = input.value;
  }
  function select(color, coalesce = false) {
    if (!isImageColor(color)) return;
    color = withColorOpacity(color, colorOpacity(color));
    if (input.value.toLowerCase() === color.toLowerCase()) return;
    input.value = color; refresh();
    input.dispatchEvent(new CustomEvent('input', {bubbles:true, detail:{coalesce}}));
  }
  function refreshRecent() {
    recentPalette.replaceChildren();
    const values = recentImageColors(); recentEmpty.hidden = !!values.length;
    values.forEach((color, i) => {
      const swatch = make('button', null, 'sms3-color-swatch'); swatch.type = 'button';
      swatch.title = `Recent color ${i + 1}`; swatch.setAttribute('aria-label', swatch.title);
      swatch.setAttribute('aria-description', `${color}, ${Math.round(colorOpacity(color) * 100)}% opacity`);
      swatch.style.setProperty('--swatch-color', color);
      swatch.addEventListener('click', () => select(color));
      recentPalette.append(swatch);
    });
  }
  for (const [label,color] of COLORS) {
    const swatch = make('button', null, 'sms3-color-swatch'); swatch.type = 'button';
    swatch.dataset.color = color; swatch.title = label; swatch.setAttribute('aria-label',label);
    swatch.style.setProperty('--swatch-color',color);
    swatch.addEventListener('click', () => select(withColorOpacity(color, colorOpacity(input.value))));
    swatches.push(swatch); palette.append(swatch);
  }
  const custom = make('div', 'Loading color picker…', 'sms3-color-custom');
  panel.append(heading,palette,recent,custom,opacitySummary,help);
  element.append(label,input,trigger,panel);
  const close = () => { if (panel.matches(':popover-open')) panel.hidePopover(); };
  dismiss.addEventListener('click', () => { close(); trigger.focus({preventScroll:true}); });
  async function open({ focus = true } = {}) {
    if (!element.isConnected) return;
    refresh(); refreshRecent(); openedColor = input.value;
    panel.showPopover(); trigger.setAttribute('aria-expanded','true');
    const anchor = trigger.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
    panel.style.left = `${Math.max(8,Math.min(anchor.right - bounds.width,width - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8,Math.min(anchor.bottom + 6 + bounds.height <= height - 8 ? anchor.bottom + 6 : anchor.top - bounds.height - 6,height - bounds.height - 8))}px`;
    if (focus) (swatches.find(swatch => swatch.dataset.color === input.value.slice(0,7).toLowerCase()) ?? dropper).focus({preventScroll:true});
    listeners?.abort(); listeners = new AbortController();
    window.addEventListener('resize',close,{signal:listeners.signal});
    document.addEventListener('scroll', event => { if (event.target.contains?.(trigger)) close(); },{capture:true,signal:listeners.signal});
    if (!picker) {
      try {
        await import('../vendor/color-picker/hex-alpha-color-picker.js');
        if (!element.isConnected) return;
        picker = make('hex-alpha-color-picker'); picker.color = input.value;
        const alpha = picker.shadowRoot.querySelector('[part="alpha"]');
        alpha.setAttribute('aria-label', 'Opacity');
        // The library reports this slider in percentages, including aria-valuenow.
        alpha.setAttribute('aria-valuemax', '100');
        // HSV conversion in the library rounds hue. Changing only opacity must
        // retain the exact RGB bytes, especially after sampling a plot color.
        let alphaOnly = false;
        for (const type of ['pointerdown', 'keydown']) picker.shadowRoot.addEventListener(type, event => {
          alphaOnly = event.composedPath().includes(alpha);
        }, { capture:true });
        picker.addEventListener('color-changed',event => select(alphaOnly
          ? withColorOpacity(input.value, colorOpacity(event.detail.value))
          : event.detail.value, true));
        custom.replaceChildren(picker);
      } catch { custom.textContent = 'Custom colors could not load. Reopen to retry.'; }
    }
  }
  trigger.addEventListener('click', () => {
    if (panel.matches(':popover-open')) close(); else open();
  });
  dropper.addEventListener('click', async () => {
    close(); sampling?.abort(); sampling = new AbortController();
    const current = sampling;
    help.textContent = 'Changes apply immediately.';
    try {
      const color = await sampleColor({ signal:current.signal });
      if (current.signal.aborted || !element.isConnected) return;
      if (color) { select(color); rememberImageColor(input.value); }
    } catch (error) { help.textContent = error.message; }
    finally {
      if (!current.signal.aborted && element.isConnected) { await open({ focus:false }); dropper.focus({preventScroll:true}); }
    }
  });
  panel.addEventListener('toggle', event => {
    trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState === 'closed') {
      listeners?.abort();
      if (openedColor !== input.value) rememberImageColor(input.value);
    }
  });
  panel.addEventListener('focusout', event => {
    if (event.relatedTarget && !panel.contains(event.relatedTarget) && event.relatedTarget !== trigger) close();
  });
  refresh();
  return {element,input,refresh,close,dispose:() => { sampling?.abort(); close(); listeners?.abort(); }};
}
