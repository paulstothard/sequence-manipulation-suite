const icon = {
  solid: '<path d="M3 12h26"/>',
  dashed: '<path d="M3 12h26" stroke-dasharray="6 4"/>',
  dotted: '<path d="M3 12h26" stroke-dasharray="0 5" stroke-linecap="round"/>',
  open: '<path d="M3 12h24m-8-6 8 6-8 6"/>',
  filled: '<path d="M3 12h17"/><path d="m19 6 10 6-10 6z" fill="currentColor"/>',
  outline: '<path d="M3 12h16m0-6 10 6-10 6z"/>',
  end: '<path d="M3 12h25m-6-5 6 5-6 5"/>',
  both: '<path d="M4 12h24M10 7l-6 5 6 5m12-10 6 5-6 5"/>',
  pointerEnd: '<path d="M3 12h25"/><circle cx="28" cy="12" r="3" fill="currentColor" stroke="none"/>',
  pointerBoth: '<path d="M4 12h24"/><circle cx="4" cy="12" r="3" fill="currentColor" stroke="none"/><circle cx="28" cy="12" r="3" fill="currentColor" stroke="none"/>',
  none: '<rect x="6" y="4" width="20" height="16" rx="4"/>',
  hatched: '<rect x="6" y="4" width="20" height="16" rx="4"/><path d="m7 13 9-9M8 19L23 4M15 20l11-11M22 20l4-4"/>',
  fill: '<rect x="6" y="4" width="20" height="16" rx="4" fill="currentColor"/>',
};
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

// Shared compact controls for added annotations; native SVGs can also opt into
// line controls while retaining their original fill and marker structures.
export function createAnnotationStyleControls(parent, onChange) {
  const root = make('div', 'annotation-style-controls');
  parent.append(root);
  const choices = [];
  function choice(label, key, values) {
    const row = make('div', 'annotation-style-row');
    const group = make('div', 'annotation-style-choices');
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    row.append(make('span', 'annotation-style-label', label), group);
    for (const [value, name, glyph = value] of values) {
      const button = make('button'); button.type = 'button'; button.title = name;
      button.setAttribute('aria-label', name); button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `<svg viewBox="0 0 32 24" aria-hidden="true">${icon[glyph]}</svg>`;
      button.addEventListener('click', () => onChange(key, value));
      group.append(button); choices.push({ button, key, value, glyph });
    }
    root.append(row); return row;
  }
  function slider(label, key, min, max, step, exact = false) {
    const row = make('div', 'annotation-style-row');
    const controls = make('div', 'annotation-style-slider');
    const range = make('input'); range.type = 'range';
    Object.assign(range, { min, max, step }); range.setAttribute('aria-label', `${label} slider`);
    const value = make(exact ? 'input' : 'output');
    if (exact) {
      value.type = 'number'; Object.assign(value, { min: .1, max: 100, step: .1 });
      value.setAttribute('aria-label', label);
      value.addEventListener('input', () => {
        if (value.value !== '' && value.validity.valid) onChange(key, +value.value, { coalesce: true });
      });
    }
    range.addEventListener('input', () => onChange(key, +range.value, { coalesce: true }));
    controls.append(range, value); row.append(make('span', 'annotation-style-label', label), controls); root.append(row);
    return { row, set(n) { range.max = Math.max(max, n); range.value = n; if (exact) value.value = n; else value.textContent = `${n}×`; } };
  }
  const width = slider('Line width', 'strokeWidth', .1, 20, .1, true);
  const pattern = choice('Stroke', 'strokePattern', [['solid', 'Solid stroke'], ['dashed', 'Dashed stroke'], ['dotted', 'Dotted stroke']]);
  const head = choice('Arrowhead', 'headStyle', [['open', 'Open arrowhead'], ['filled', 'Filled arrowhead'], ['outline', 'Outlined arrowhead']]);
  const ends = choice('Ends', 'endPlacement', [['end', 'One end'], ['both', 'Both ends']]);
  const headSize = slider('Head size', 'headScale', .5, 3, .25);
  const fill = choice('Fill', 'fillStyle', [['none', 'No fill'], ['solid', 'Fill', 'fill'], ['hatched', 'Hatched fill']]);
  return {
    element: root,
    update(values, visible) {
      root.hidden = !visible.line && !visible.fills;
      width.row.hidden = pattern.hidden = !visible.line;
      head.hidden = headSize.row.hidden = !visible.arrows;
      ends.hidden = !visible.ends;
      fill.hidden = !visible.fills;
      width.set(values.strokeWidth ?? 2); headSize.set(values.headScale ?? 1);
      const current = { strokePattern: 'solid', headStyle: 'open', endPlacement: 'end', fillStyle: 'none', ...values };
      for (const c of choices) {
        c.button.setAttribute('aria-pressed', String(current[c.key] === c.value));
        if (c.key === 'endPlacement') {
          const glyph = values.type === 'pointer' ? (c.value === 'both' ? 'pointerBoth' : 'pointerEnd') : c.value;
          if (glyph !== c.glyph) {
            c.button.querySelector('svg').innerHTML = icon[glyph];
            c.glyph = glyph;
          }
        }
      }
    },
  };
}
