let nextHelpId = 0;

// Explicit question-mark help for controls that need more than a hover hint.
// Native popovers provide keyboard activation, Escape and outside-click dismissal.
export function createControlHelp(label, text) {
  const element = document.createElement('span');
  element.className = 'option-label';
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'option-help'; button.textContent = '?';
  button.setAttribute('aria-label', `Help: ${label}`);
  button.setAttribute('aria-expanded', 'false');
  const popover = document.createElement('div');
  popover.id = `control-help-${++nextHelpId}`;
  popover.className = 'app-control-tooltip'; popover.popover = 'auto';
  popover.setAttribute('role', 'note'); popover.setAttribute('aria-label', label);
  popover.textContent = text;
  button.setAttribute('aria-controls', popover.id);
  button.setAttribute('popovertarget', popover.id);
  const controller = new AbortController();
  const close = () => { if (popover.matches(':popover-open')) popover.hidePopover(); };
  const position = () => {
    if (!popover.matches(':popover-open')) return;
    const anchor = button.getBoundingClientRect(), box = popover.getBoundingClientRect();
    const viewport = window.visualViewport, margin = 8;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? document.documentElement.clientWidth;
    const height = viewport?.height ?? document.documentElement.clientHeight;
    popover.style.left = `${Math.max(left + margin, Math.min(anchor.left, left + width - box.width - margin))}px`;
    const y = anchor.bottom + 6 + box.height <= top + height - margin ? anchor.bottom + 6 : anchor.top - box.height - 6;
    popover.style.top = `${Math.max(top + margin, Math.min(y, top + height - box.height - margin))}px`;
  };
  popover.addEventListener('toggle', () => {
    const open = popover.matches(':popover-open');
    button.setAttribute('aria-expanded', String(open));
    if (open) { button.setAttribute('aria-describedby', popover.id); position(); }
    else button.removeAttribute('aria-describedby');
  });
  window.addEventListener('scroll', position, { capture: true, passive: true, signal: controller.signal });
  window.addEventListener('resize', position, { signal: controller.signal });
  window.visualViewport?.addEventListener('resize', position, { signal: controller.signal });
  element.append(button, popover);
  return { element, dispose() { close(); controller.abort(); element.remove(); } };
}

// Short help belongs on the control itself. Longer help can keep its explicit
// disclosure button; both use the shared help-popover appearance in styles.css.
export function installControlHelp(root, { signal, compact = false } = {}) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const tooltip = document.createElement("div");
  tooltip.id = `control-help-${++nextHelpId}`;
  tooltip.className = "app-control-tooltip";
  tooltip.classList.toggle("is-compact", compact);
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("popover", "manual");
  tooltip.hidden = true;
  document.body.append(tooltip);
  let active = null;
  let hover = null;
  let focused = null;
  let timer;

  const controlFor = node => {
    const control = node instanceof Element ? node.closest("[data-control-help]") : null;
    return control && root.contains(control) ? control : null;
  };
  const hide = () => {
    clearTimeout(timer);
    if (active) {
      const ids = (active.getAttribute("aria-describedby") || "").split(/\s+/).filter(id => id && id !== tooltip.id);
      if (ids.length) active.setAttribute("aria-describedby", ids.join(" "));
      else active.removeAttribute("aria-describedby");
    }
    active = null;
    if (tooltip.matches(":popover-open")) tooltip.hidePopover();
    tooltip.hidden = true;
  };
  const show = control => {
    hide();
    if (!control?.isConnected || !control.getClientRects().length) return;
    active = control;
    tooltip.textContent = control.dataset.controlHelp;
    tooltip.hidden = false;
    tooltip.showPopover();
    const ids = (control.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    control.setAttribute("aria-describedby", [...ids, tooltip.id].join(" "));
    const anchor = control.getBoundingClientRect();
    const rect = tooltip.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? document.documentElement.clientWidth;
    const height = viewport?.height ?? document.documentElement.clientHeight;
    tooltip.style.left = `${Math.max(left + 8, Math.min(anchor.left, left + width - rect.width - 8))}px`;
    const y = anchor.bottom + 6 + rect.height <= top + height - 8 ? anchor.bottom + 6 : anchor.top - rect.height - 6;
    tooltip.style.top = `${Math.max(top + 8, y)}px`;
  };
  root.addEventListener("pointerover", event => {
    if (event.pointerType === "touch") return;
    const control = controlFor(event.target);
    if (!control || control === hover) return;
    hover = control;
    clearTimeout(timer);
    timer = setTimeout(() => show(control), 250);
  }, options);
  root.addEventListener("pointerout", event => {
    if (!hover || hover.contains(event.relatedTarget)) return;
    hover = null;
    clearTimeout(timer);
    if (!tooltip.contains(event.relatedTarget)) timer = setTimeout(() => focused ? show(focused) : hide(), 100);
  }, options);
  tooltip.addEventListener("pointerenter", () => clearTimeout(timer), options);
  tooltip.addEventListener("pointerleave", () => {
    // Hiding a hovered popover can queue pointerleave. That event must not
    // reopen help after Escape or another explicit dismissal.
    if (active) focused ? show(focused) : hide();
  }, options);
  root.addEventListener("focusin", event => {
    focused = controlFor(event.target);
    if (focused) show(focused);
    else hide();
  }, options);
  root.addEventListener("focusout", () => { focused = null; hide(); }, options);
  root.addEventListener("click", hide, options);
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); }, options);
  document.addEventListener("pointerdown", event => { if (!root.contains(event.target)) hide(); }, options);
  // A control may scroll into view just as pointerover starts its delay.
  // Dismiss an already-visible tooltip without cancelling that pending help.
  window.addEventListener("scroll", () => { if (active) hide(); }, { ...options, capture: true, passive: true });
  window.addEventListener("resize", hide, options);
  const dispose = () => { hide(); controller.abort(); tooltip.remove(); };
  if (signal?.aborted) dispose();
  else signal?.addEventListener("abort", dispose, { once: true });
  return dispose;
}
