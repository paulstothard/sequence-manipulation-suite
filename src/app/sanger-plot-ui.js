import { geneticCodes } from '../core/genetic-code.js';
import { renderSangerPlot } from '../core/sanger-plot.js';
import { installVisualInspection } from './visual-inspection.js';

export function renderSangerPlotControls(container, model, initialSvg, onChange = () => {}) {
  const display = {...model.options};
  const controls = document.createElement('div');
  controls.className = 'sanger-plot-controls';
  controls.setAttribute('aria-label', 'Plot display');
  const drawing = document.createElement('div');
  drawing.className = 'sanger-plot-drawing';
  let cleanup, code;
  const draw = (svg) => {
    cleanup?.();
    drawing.innerHTML = svg;
    cleanup = installVisualInspection(drawing);
  };
  const redraw = () => {
    Object.assign(model.options, display);
    if (code) code.disabled = !display.showForwardTranslations && !display.showReverseTranslations;
    const svg = renderSangerPlot(model, display);
    draw(svg);
    onChange(svg);
  };
  const checkbox = (id, text) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = display[id] === true;
    input.dataset.sangerPlotControl = id;
    input.addEventListener('change', () => { display[id] = input.checked; redraw(); });
    label.append(input, document.createTextNode(text)); controls.append(label);
  };
  if (model.kind === 'trace') {
    checkbox('showForwardTranslations','Forward translations');
    checkbox('showReverseTranslations','Reverse translations');
    const label = document.createElement('label');
    label.textContent = 'Genetic code';
    code = document.createElement('select');
    code.dataset.sangerPlotControl = 'geneticCode';
    for (const entry of geneticCodes) {
      const option = document.createElement('option');
      option.value = entry.id; option.textContent = `${entry.id}. ${entry.name}`; code.append(option);
    }
    code.value = display.geneticCode;
    code.disabled = !display.showForwardTranslations && !display.showReverseTranslations;
    code.addEventListener('change', () => {display.geneticCode = code.value; redraw();});
    label.append(code); controls.append(label);
    const qualityLabel = document.createElement('label');
    qualityLabel.textContent = 'Low-quality highlight cutoff';
    const input = document.createElement('input');
    input.type = 'number'; input.min = '0'; input.max = '93'; input.step = '1';
    input.value = display.lowQualityThreshold;
    input.addEventListener('change', () => {if(input.checkValidity() && input.value !== '') {
      display.lowQualityThreshold = Number(input.value); redraw();
    }});
    qualityLabel.append(input); controls.append(qualityLabel);
  }
  if (model.session.resolution) checkbox('showSourceTraces','Show source chromatograms');
  if (controls.childElementCount) container.append(controls);
  container.append(drawing);
  draw(initialSvg);
  container._sms3VisualCleanup = () => cleanup?.();
}
