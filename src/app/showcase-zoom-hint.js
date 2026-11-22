import { setUiText } from './set-ui-text.js';

// Always-visible guidance never changes gesture ownership or enables scroll zoom.
export function installShowcaseZoomHint(preview, hint) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const coarsePointer = window.matchMedia('(any-pointer: coarse)');
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const modifier = /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Ctrl';
  let touchAvailable = navigator.maxTouchPoints > 0 || coarsePointer.matches;
  let mouseObserved = false;

  const title = document.createElement('strong');
  title.className = 'showcase-guidance-title';
  title.textContent = 'In this Showcase';
  const actions = document.createElement('div');
  actions.className = 'showcase-guidance-actions';
  const instruction = label => {
    const item = document.createElement('div');
    item.className = 'showcase-guidance-action';
    const heading = document.createElement('strong');
    heading.textContent = label;
    const text = document.createElement('span');
    item.append(heading, ' ', text);
    actions.append(item, ' ');
    return text;
  };
  const scrollInstruction = instruction('Scrolling');
  const zoomInstruction = instruction('Zooming');
  hint.replaceChildren(title, ' ', actions);

  const update = () => {
    const hasMouse = finePointer.matches || mouseObserved;
    setUiText(scrollInstruction, touchAvailable
      ? hasMouse ? 'Scroll normally, or swipe outside the viewer.' : 'Swipe outside the viewer.'
      : 'Use your mouse wheel or two-finger trackpad scroll.');
    setUiText(zoomInstruction, touchAvailable && !hasMouse
      ? 'Pinch with two fingers inside the viewer.'
      : `Pinch, or hold ${modifier} and scroll over the viewer.`);
  };
  preview.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || mouseObserved) return;
    mouseObserved = true;
    update();
  }, options);
  preview.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || touchAvailable) return;
    touchAvailable = true;
    update();
  }, options);
  const capabilitiesChanged = () => {
    touchAvailable = navigator.maxTouchPoints > 0 || coarsePointer.matches;
    update();
  };
  finePointer.addEventListener('change', capabilitiesChanged, options);
  coarsePointer.addEventListener('change', capabilitiesChanged, options);
  update();
  return () => controller.abort();
}
