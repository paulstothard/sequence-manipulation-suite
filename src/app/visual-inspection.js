const TITLE_MARK_ATTRIBUTE = "data-sms3-title-mark";
const ACTIVE_ATTRIBUTE = "data-sms3-inspection-active";
const EXPLICIT_MARK_SELECTOR = [
  "[data-sms3-inspection-text]",
  "[data-alignment-column]",
  `[${TITLE_MARK_ATTRIBUTE}]`
].join(",");

let inspectionId = 0;
const MAX_CANVAS_KEYBOARD_TARGETS = 2000;

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function directTitle(element) {
  return [...element.children].find((child) => child.tagName?.toLowerCase() === "title") ?? null;
}

function alignmentInspectionText(element) {
  const column = normalizedText(element.dataset.alignmentColumn);
  if (!column) return "";
  const row = element.closest("[data-alignment-row-label]");
  const label = normalizedText(row?.dataset.alignmentRowLabel) || "Sequence";
  const symbol = normalizedText(element.dataset.alignmentSymbol) || "symbol";
  const coordinate = normalizedText(element.dataset.sequenceCoordinate);
  const relation = normalizedText(element.dataset.alignmentRelation);
  const facts = [`${label}: ${symbol}`, `alignment column ${column}`];
  facts.push(coordinate === "gap" ? "gap in this sequence" : `sequence position ${coordinate}`);
  if (relation) facts.push(relation);
  return facts.join("; ");
}

export function getVisualInspectionText(element) {
  if (!(element instanceof Element)) return "";
  const explicit = normalizedText(element.dataset.sms3InspectionText);
  if (explicit) return explicit;
  const alignment = alignmentInspectionText(element);
  if (alignment) return alignment;
  return normalizedText(element.dataset.sms3TitleText ?? directTitle(element)?.textContent);
}

function isInteractiveMark(element) {
  return Boolean(element.closest("a,button,[role='button'],[role='link']"));
}

function joinTokens(existing, token) {
  return [...new Set(`${existing ?? ""} ${token}`.trim().split(/\s+/).filter(Boolean))].join(" ");
}

function removeToken(existing, token) {
  return String(existing ?? "").split(/\s+/).filter((value) => value && value !== token).join(" ");
}

function pointerPositionForElement(element) {
  const rect = element.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + Math.min(rect.height / 2, 18)
  };
}

export function installVisualInspection(container, {
  allowPin = true,
  includeSvgTitles = true
} = {}) {
  if (!(container instanceof HTMLElement)) return () => {};
  container._sms3InspectionCleanup?.();

  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };
  const titleStates = new Map();
  const svgStates = new Map();
  const id = `sms3-visual-inspection-${++inspectionId}`;
  const tooltip = document.createElement("div");
  tooltip.id = `${id}-tooltip`;
  tooltip.className = "visual-inspection-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  const liveStatus = document.createElement("div");
  liveStatus.className = "visually-hidden";
  liveStatus.setAttribute("role", "status");
  liveStatus.setAttribute("aria-live", "polite");
  const instructions = document.createElement("span");
  instructions.id = `${id}-instructions`;
  instructions.className = "visually-hidden";
  instructions.textContent = allowPin
    ? "Use Left and Right Arrow keys to inspect chart items. Press Enter or tap to pin details and Escape to dismiss them."
    : "Hover or focus a chart item to inspect its details.";
  container.append(tooltip, liveStatus, instructions);

  let activeMark = null;
  let pinnedMark = null;
  let keyboardIndex = -1;

  function prepareTitle(title) {
    const mark = title.parentElement;
    const text = normalizedText(title.textContent);
    if (!mark || mark.tagName?.toLowerCase() === "svg" || !text || titleStates.has(title)) return;
    titleStates.set(title, text);
    mark.dataset.sms3TitleText = text;
    mark.setAttribute(TITLE_MARK_ATTRIBUTE, "");
    title.textContent = "";
  }

  function prepareSvg(svg) {
    if (svgStates.has(svg)) return;
    const state = {
      tabindex: svg.getAttribute("tabindex"),
      describedBy: svg.getAttribute("aria-describedby"),
      keyShortcuts: svg.getAttribute("aria-keyshortcuts")
    };
    svgStates.set(svg, state);
    const hasFocusableMarks = Boolean(svg.querySelector("[tabindex],a,button,[role='button'],[role='link']"));
    if (!svg.hasAttribute("tabindex") && !hasFocusableMarks) svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-describedby", joinTokens(state.describedBy, instructions.id));
    if (!hasFocusableMarks) {
      svg.setAttribute("aria-keyshortcuts", allowPin
        ? "ArrowLeft ArrowRight Home End Enter Escape"
        : "ArrowLeft ArrowRight Home End Escape");
    }
  }

  function refresh() {
    for (const title of titleStates.keys()) {
      if (!container.contains(title)) titleStates.delete(title);
    }
    for (const svg of svgStates.keys()) {
      if (!container.contains(svg)) svgStates.delete(svg);
    }
    if (activeMark && !container.contains(activeMark)) {
      activeMark = null;
      pinnedMark = null;
      tooltip.hidden = true;
      tooltip.classList.remove("is-pinned");
    }
    for (const svg of container.querySelectorAll("svg")) prepareSvg(svg);
    if (includeSvgTitles) {
      for (const title of container.querySelectorAll("svg title")) prepareTitle(title);
    }
  }

  function resolveDirectMark(node) {
    if (!(node instanceof Element)) return null;
    const mark = node.closest(EXPLICIT_MARK_SELECTOR);
    return mark && container.contains(mark) && getVisualInspectionText(mark) ? mark : null;
  }

  function resolveMark(node, position) {
    const directMark = resolveDirectMark(node);
    if (directMark || !position || typeof document.elementsFromPoint !== "function") return directMark;
    for (const candidate of document.elementsFromPoint(position.clientX, position.clientY)) {
      const mark = resolveDirectMark(candidate);
      if (mark) return mark;
    }
    return null;
  }

  function keyboardMarks(svg) {
    const titleMarks = [...svg.querySelectorAll(`[${TITLE_MARK_ATTRIBUTE}]`)]
      .filter((mark) => getVisualInspectionText(mark));
    const detailedMarks = [];
    const walker = document.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const mark = walker.currentNode;
      if (!mark.matches("[data-sms3-inspection-text],[data-alignment-column]")) continue;
      if (getVisualInspectionText(mark)) detailedMarks.push(mark);
      if (detailedMarks.length > 2000) return titleMarks;
    }
    // Dense alignments can contain hundreds of thousands of pointer targets. Keep
    // exact pointer inspection, while keyboard traversal uses titled row summaries.
    return [...new Set([...detailedMarks, ...titleMarks])];
  }

  function setActiveMark(mark) {
    if (activeMark === mark) return;
    activeMark?.removeAttribute(ACTIVE_ATTRIBUTE);
    activeMark = mark;
    activeMark?.setAttribute(ACTIVE_ATTRIBUTE, "true");
  }

  function placeTooltip(position) {
    const containerRect = container.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const inset = 8;
    const preferredLeft = scrollLeft + position.clientX - containerRect.left + 12;
    const preferredTop = scrollTop + position.clientY - containerRect.top + 14;
    const minLeft = scrollLeft + inset;
    const maxLeft = scrollLeft + container.clientWidth - tooltipRect.width - inset;
    const minTop = scrollTop + inset;
    const maxTop = scrollTop + container.clientHeight - tooltipRect.height - inset;
    tooltip.style.left = `${Math.max(minLeft, Math.min(preferredLeft, Math.max(minLeft, maxLeft)))}px`;
    tooltip.style.top = `${Math.max(minTop, Math.min(preferredTop, Math.max(minTop, maxTop)))}px`;
  }

  function show(mark, position, { announce = false } = {}) {
    const text = getVisualInspectionText(mark);
    if (!text) return hide();
    setActiveMark(mark);
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.classList.toggle("is-pinned", mark === pinnedMark);
    placeTooltip(position ?? pointerPositionForElement(mark));
    if (announce) {
      liveStatus.textContent = "";
      requestAnimationFrame(() => { liveStatus.textContent = text; });
    }
  }

  function hide({ force = false } = {}) {
    if (pinnedMark && !force) return;
    setActiveMark(null);
    tooltip.hidden = true;
    tooltip.classList.remove("is-pinned");
  }

  function unpin({ hideTooltip = true } = {}) {
    pinnedMark = null;
    tooltip.classList.remove("is-pinned");
    if (hideTooltip) hide({ force: true });
  }

  function inspectFromPointer(event) {
    const mark = resolveMark(event.target, event);
    if (!mark || pinnedMark) return;
    show(mark, event);
  }

  container.addEventListener("pointerover", inspectFromPointer, listenerOptions);
  container.addEventListener("pointermove", inspectFromPointer, listenerOptions);
  container.addEventListener("pointerleave", () => hide(), listenerOptions);
  container.addEventListener("focusin", (event) => {
    const mark = resolveMark(event.target);
    if (mark && !pinnedMark) show(mark, pointerPositionForElement(mark), { announce: true });
  }, listenerOptions);
  container.addEventListener("focusout", (event) => {
    if (!resolveMark(event.relatedTarget)) hide();
  }, listenerOptions);
  container.addEventListener("click", (event) => {
    if (!allowPin) return;
    const mark = resolveMark(event.target, event);
    if (!mark) {
      if (pinnedMark) unpin();
      return;
    }
    if (isInteractiveMark(mark)) return;
    if (pinnedMark === mark) {
      unpin();
      return;
    }
    pinnedMark = mark;
    show(mark, event, { announce: true });
  }, listenerOptions);
  container.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (pinnedMark || !tooltip.hidden) {
        event.preventDefault();
        unpin();
      }
      return;
    }
    const svg = event.target.closest?.("svg");
    if (!svg || !container.contains(svg)) return;
    if (event.target !== svg) return;
    const marks = keyboardMarks(svg);
    if (marks.length === 0) return;
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      unpin({ hideTooltip: false });
      if (event.key === "Home") keyboardIndex = 0;
      else if (event.key === "End") keyboardIndex = marks.length - 1;
      else {
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        keyboardIndex = (keyboardIndex + direction + marks.length) % marks.length;
      }
      show(marks[keyboardIndex], pointerPositionForElement(marks[keyboardIndex]), { announce: true });
      return;
    }
    if (allowPin && event.key === "Enter" && activeMark) {
      event.preventDefault();
      pinnedMark = pinnedMark === activeMark ? null : activeMark;
      show(activeMark, pointerPositionForElement(activeMark), { announce: true });
    }
  }, listenerOptions);

  const observer = new MutationObserver(refresh);
  observer.observe(container, { childList: true, subtree: true });
  refresh();

  const cleanup = () => {
    controller.abort();
    observer.disconnect();
    setActiveMark(null);
    for (const [title, text] of titleStates) {
      const mark = title.parentElement;
      title.textContent = text;
      if (mark) {
        delete mark.dataset.sms3TitleText;
        mark.removeAttribute(TITLE_MARK_ATTRIBUTE);
      }
    }
    for (const [svg, state] of svgStates) {
      if (state.tabindex === null) svg.removeAttribute("tabindex");
      else svg.setAttribute("tabindex", state.tabindex);
      if (state.describedBy === null) svg.removeAttribute("aria-describedby");
      else svg.setAttribute("aria-describedby", state.describedBy);
      if (state.keyShortcuts === null) svg.removeAttribute("aria-keyshortcuts");
      else svg.setAttribute("aria-keyshortcuts", state.keyShortcuts);
    }
    tooltip.remove();
    liveStatus.remove();
    instructions.remove();
    if (container._sms3InspectionCleanup === cleanup) container._sms3InspectionCleanup = null;
  };
  container._sms3InspectionCleanup = cleanup;
  return cleanup;
}

export function installCanvasVisualInspection(container, {
  canvas,
  ariaLabel = "Interactive visualization",
  getTargets = () => [],
  hitTest = () => null,
  getText = (target) => target?.label,
  getKey = (target, index) => target?.key ?? index,
  getPosition = () => null,
  onActivate = () => {},
  onActiveChange = () => {},
  isInteractionSuppressed = () => false,
  keyboardNavigation = true,
  ariaKeyShortcuts = "",
  instructionsText = "",
  targetCursor = "pointer",
  emptyCursor = "grab"
} = {}) {
  const noop = () => {};
  if (!(container instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    return { cleanup: noop, hide: noop, inspect: noop, refresh: noop };
  }
  canvas._sms3CanvasInspectionCleanup?.();

  const controller = new AbortController();
  const listenerOptions = { signal: controller.signal };
  const id = `sms3-canvas-inspection-${++inspectionId}`;
  const tooltip = document.createElement("div");
  tooltip.id = `${id}-tooltip`;
  tooltip.className = "visual-inspection-tooltip visual-inspection-canvas-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  const liveStatus = document.createElement("div");
  liveStatus.className = "visually-hidden";
  liveStatus.setAttribute("role", "status");
  liveStatus.setAttribute("aria-live", "polite");
  const instructions = document.createElement("span");
  instructions.id = `${id}-instructions`;
  instructions.className = "visually-hidden";
  instructions.textContent = normalizedText(instructionsText) || (keyboardNavigation
    ? "Move over the viewer or use Arrow keys to inspect items. Press Enter or tap to open persistent details, and Escape to dismiss inspection."
    : "Move over the viewer to inspect items. Use the viewer keyboard controls for persistent selection, and Escape to dismiss inspection.");
  container.append(tooltip, liveStatus, instructions);

  const canvasState = {
    tabindex: canvas.getAttribute("tabindex"),
    ariaLabel: canvas.getAttribute("aria-label"),
    describedBy: canvas.getAttribute("aria-describedby"),
    keyShortcuts: canvas.getAttribute("aria-keyshortcuts")
  };
  if (!canvas.hasAttribute("tabindex")) canvas.setAttribute("tabindex", "0");
  if (normalizedText(ariaLabel)) canvas.setAttribute("aria-label", normalizedText(ariaLabel));
  canvas.setAttribute("aria-describedby", joinTokens(canvasState.describedBy, instructions.id));
  canvas.setAttribute("aria-keyshortcuts", normalizedText(ariaKeyShortcuts) || (keyboardNavigation
    ? "ArrowLeft ArrowRight ArrowUp ArrowDown Home End Enter Escape"
    : "Escape"));

  let activeTarget = null;
  let activeKey = "";
  let keyboardIndex = -1;
  let pointerFrame = 0;
  let pendingPointer = null;
  let lastPointer = null;
  let dismissedPointer = null;

  function keyFor(target, index = -1) {
    return normalizedText(getKey(target, index));
  }

  function inspectionTargets() {
    const targets = [];
    const seen = new Set();
    for (const [index, target] of Array.from(getTargets() ?? []).entries()) {
      if (!target || !normalizedText(getText(target))) continue;
      const key = keyFor(target, index);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
      if (targets.length >= MAX_CANVAS_KEYBOARD_TARGETS) break;
    }
    return targets;
  }

  function fallbackPosition() {
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + Math.min(Math.max(rect.width / 2, 20), 120),
      clientY: rect.top + Math.min(Math.max(rect.height / 2, 20), 80)
    };
  }

  function targetPosition(target) {
    const position = getPosition(target);
    return Number.isFinite(Number(position?.clientX)) && Number.isFinite(Number(position?.clientY))
      ? position
      : fallbackPosition();
  }

  function placeTooltip(position) {
    const containerRect = container.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const inset = 8;
    const preferredLeft = scrollLeft + position.clientX - containerRect.left + 12;
    const preferredTop = scrollTop + position.clientY - containerRect.top + 14;
    const minLeft = scrollLeft + inset;
    const maxLeft = scrollLeft + container.clientWidth - tooltipRect.width - inset;
    const minTop = scrollTop + inset;
    const maxTop = scrollTop + container.clientHeight - tooltipRect.height - inset;
    tooltip.style.left = `${Math.max(minLeft, Math.min(preferredLeft, Math.max(minLeft, maxLeft)))}px`;
    tooltip.style.top = `${Math.max(minTop, Math.min(preferredTop, Math.max(minTop, maxTop)))}px`;
  }

  function setActive(target) {
    const nextKey = target ? keyFor(target) : "";
    if (activeKey === nextKey) {
      if (target) activeTarget = target;
      return;
    }
    activeTarget = target;
    activeKey = nextKey;
    onActiveChange(target);
  }

  function announce(text) {
    liveStatus.textContent = "";
    requestAnimationFrame(() => { liveStatus.textContent = text; });
  }

  function show(target, position, { shouldAnnounce = false } = {}) {
    const text = normalizedText(getText(target));
    if (!target || !text) return hide();
    setActive(target);
    tooltip.textContent = text;
    tooltip.hidden = false;
    placeTooltip(position ?? targetPosition(target));
    if (shouldAnnounce) announce(text);
  }

  function hide() {
    setActive(null);
    tooltip.hidden = true;
  }

  function refresh() {
    if (!activeTarget) return;
    const current = inspectionTargets().find((target, index) => keyFor(target, index) === activeKey);
    if (!current) hide();
    else show(current, targetPosition(current));
  }

  function pointerRemainsDismissed(pointer) {
    if (!dismissedPointer) return false;
    const moved = Math.hypot(
      pointer.clientX - dismissedPointer.clientX,
      pointer.clientY - dismissedPointer.clientY
    ) > 1;
    if (moved) dismissedPointer = null;
    return !moved;
  }

  canvas.addEventListener("pointermove", (event) => {
    const pointer = { clientX: event.clientX, clientY: event.clientY };
    lastPointer = pointer;
    if (pointerRemainsDismissed(pointer)) {
      hide();
      return;
    }
    pendingPointer = pointer;
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      const pointer = pendingPointer;
      pendingPointer = null;
      if (!pointer || isInteractionSuppressed()) return;
      if (pointerRemainsDismissed(pointer)) {
        hide();
        return;
      }
      const target = hitTest(pointer);
      canvas.style.cursor = target ? targetCursor : emptyCursor;
      if (target) show(target, pointer);
      else hide();
    });
  }, listenerOptions);
  canvas.addEventListener("pointerleave", () => {
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
    lastPointer = null;
    dismissedPointer = null;
    canvas.style.cursor = "";
    hide();
  }, listenerOptions);
  canvas.addEventListener("blur", () => hide(), listenerOptions);
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!tooltip.hidden) event.preventDefault();
      dismissedPointer = lastPointer;
      hide();
      return;
    }
    if (!keyboardNavigation) return;
    if (event.key === "Enter" && activeTarget) {
      event.preventDefault();
      onActivate(activeTarget);
      announce(normalizedText(getText(activeTarget)));
      return;
    }
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const targets = inspectionTargets();
    if (targets.length === 0) return;
    event.preventDefault();
    const activeIndex = targets.findIndex((target, index) => keyFor(target, index) === activeKey);
    if (activeIndex >= 0) keyboardIndex = activeIndex;
    if (event.key === "Home") keyboardIndex = 0;
    else if (event.key === "End") keyboardIndex = targets.length - 1;
    else {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      keyboardIndex = (keyboardIndex + direction + targets.length) % targets.length;
    }
    show(targets[keyboardIndex], targetPosition(targets[keyboardIndex]), { shouldAnnounce: true });
  }, listenerOptions);

  const cleanup = () => {
    controller.abort();
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
    setActive(null);
    if (canvasState.tabindex === null) canvas.removeAttribute("tabindex");
    else canvas.setAttribute("tabindex", canvasState.tabindex);
    if (canvasState.ariaLabel === null) canvas.removeAttribute("aria-label");
    else canvas.setAttribute("aria-label", canvasState.ariaLabel);
    if (canvasState.describedBy === null) canvas.removeAttribute("aria-describedby");
    else canvas.setAttribute("aria-describedby", canvasState.describedBy);
    if (canvasState.keyShortcuts === null) canvas.removeAttribute("aria-keyshortcuts");
    else canvas.setAttribute("aria-keyshortcuts", canvasState.keyShortcuts);
    tooltip.remove();
    liveStatus.remove();
    instructions.remove();
    if (canvas._sms3CanvasInspectionCleanup === cleanup) canvas._sms3CanvasInspectionCleanup = null;
  };
  canvas._sms3CanvasInspectionCleanup = cleanup;
  return { cleanup, hide, inspect: show, refresh };
}
