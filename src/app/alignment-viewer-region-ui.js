import {
  createSearchableViewerChoiceCombobox,
  filterSearchableViewerChoices
} from "./searchable-viewer-choice-ui.js";

const DEFAULT_MAX_REGION_SPAN = 1000000;
const DEFAULT_MAX_HISTORY_ENTRIES = 50;
const MAX_VISIBLE_REFERENCE_CHOICES = 100;

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function normalizeReferences(references = []) {
  const seen = new Set();
  const normalized = [];
  for (const reference of references) {
    const name = String(reference?.name ?? reference?.reference ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push({
      name,
      length: positiveInteger(reference?.length)
    });
  }
  return normalized;
}

export function filterAlignmentViewerReferenceChoices(references, query = "", limit = MAX_VISIBLE_REFERENCE_CHOICES) {
  const filtered = filterSearchableViewerChoices(references.map((reference) => ({
    key: reference.name,
    label: reference.name,
    reference
  })), query, limit);
  return {
    choices: filtered.choices.map((choice) => choice.reference),
    total: filtered.total
  };
}

function normalizeHistoryRegion(value = {}) {
  const reference = String(value.reference ?? "").trim();
  const start = positiveInteger(value.start);
  const end = positiveInteger(value.end);
  return reference && start && end >= start
    ? {
        reference,
        start,
        end,
        ...(value.viewerState ? { viewerState: structuredClone(value.viewerState) } : {})
      }
    : null;
}

function sameRegion(left, right) {
  return Boolean(
    left && right &&
    left.reference === right.reference &&
    left.start === right.start &&
    left.end === right.end
  );
}

export function createAlignmentViewerRegionHistory({ maxEntries = DEFAULT_MAX_HISTORY_ENTRIES } = {}) {
  const limit = positiveInteger(maxEntries) || DEFAULT_MAX_HISTORY_ENTRIES;
  let scopeKey = "";
  let entries = [];
  let index = -1;

  const getState = () => ({
    scopeKey,
    entries: entries.map(normalizeHistoryRegion),
    index,
    canGoBack: index > 0,
    canGoForward: index >= 0 && index < entries.length - 1
  });

  const push = (value) => {
    const region = normalizeHistoryRegion(value);
    if (!region) return { error: "Could not add an invalid region to history." };
    if (sameRegion(entries[index], region)) return { region: { ...region }, state: getState() };
    entries = entries.slice(0, index + 1);
    entries.push(region);
    if (entries.length > limit) entries = entries.slice(entries.length - limit);
    index = entries.length - 1;
    return { region: { ...region }, state: getState() };
  };

  return {
    getState,
    sync(value, nextScopeKey = "") {
      const region = normalizeHistoryRegion(value);
      if (!region) return getState();
      if (scopeKey !== String(nextScopeKey)) {
        scopeKey = String(nextScopeKey);
        entries = [];
        index = -1;
      }
      push(region);
      return getState();
    },
    push,
    updateCurrentViewerState(viewerState) {
      if (index >= 0 && entries[index] && viewerState) {
        entries[index] = normalizeHistoryRegion({ ...entries[index], viewerState });
      }
      return getState();
    },
    activate(nextIndex) {
      const parsedIndex = Number(nextIndex);
      if (!Number.isInteger(parsedIndex) || parsedIndex < 0 || parsedIndex >= entries.length) {
        return { error: "That loaded region is no longer available in history." };
      }
      index = parsedIndex;
      return { region: { ...entries[index] }, state: getState() };
    },
    restore(state = {}) {
      scopeKey = String(state.scopeKey ?? "");
      entries = (state.entries ?? []).map(normalizeHistoryRegion).filter(Boolean).slice(-limit);
      index = Math.max(-1, Math.min(Number(state.index) || 0, entries.length - 1));
      return getState();
    }
  };
}

export function normalizeAlignmentViewerRegionNavigation(value) {
  if (value?.type !== "alignment-region") return null;
  const references = normalizeReferences(value.references);
  const reference = String(value.reference ?? "").trim() || references[0]?.name || "";
  if (reference && !references.some((entry) => entry.name === reference)) {
    references.unshift({ name: reference, length: 0 });
  }
  const start = positiveInteger(value.start) || 1;
  const end = Math.max(start, positiveInteger(value.end) || start);
  return {
    type: "alignment-region",
    reference,
    start,
    end,
    maxSpan: positiveInteger(value.maxSpan) || DEFAULT_MAX_REGION_SPAN,
    sourceMode: value.sourceMode === "indexed-bam" ? "indexed-bam" : "sam-text",
    references
  };
}

export function validateAlignmentViewerRegionRequest(value, navigation) {
  const normalizedNavigation = normalizeAlignmentViewerRegionNavigation(navigation);
  if (!normalizedNavigation) {
    return { error: "Alignment region controls are unavailable." };
  }
  const reference = String(value?.reference ?? "").trim();
  const start = positiveInteger(value?.start);
  const end = positiveInteger(value?.end);
  if (!reference) return { error: "Choose a reference or chromosome." };
  if (
    normalizedNavigation.references.length > 0 &&
    !normalizedNavigation.references.some((entry) => entry.name === reference)
  ) {
    return { error: "Choose a reference from the loaded alignment data." };
  }
  if (!start || !end) return { error: "Start and end must be positive whole numbers." };
  if (end < start) return { error: "End must be greater than or equal to start." };
  const span = end - start + 1;
  if (span > normalizedNavigation.maxSpan) {
    return {
      error: `Choose a region of ${normalizedNavigation.maxSpan.toLocaleString()} bases or less.`
    };
  }
  const referenceLength = normalizedNavigation.references
    .find((entry) => entry.name === reference)?.length ?? 0;
  if (referenceLength && end > referenceLength) {
    return {
      error: `${reference} ends at ${referenceLength.toLocaleString()}; choose a smaller end position.`
    };
  }
  return {
    region: { reference, start, end }
  };
}

function makeField(labelText, control) {
  const field = document.createElement("div");
  field.className = "alignment-viewer-region-field";
  const text = document.createElement("span");
  text.textContent = labelText;
  field.append(text, control);
  return field;
}

function makeNumberInput(value, ariaLabel) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.required = true;
  input.value = String(value);
  input.setAttribute("aria-label", ariaLabel);
  return input;
}

function formatRegionLabel(region) {
  return `${region.reference}:${region.start.toLocaleString()}–${region.end.toLocaleString()}`;
}

function createReferenceCombobox(references, initialValue, onChange) {
  const control = createSearchableViewerChoiceCombobox({
    choices: references.map((reference) => ({
      key: reference.name,
      label: reference.name,
      detail: reference.length ? `${reference.length.toLocaleString()} bp` : "Length unavailable"
    })),
    initialKey: initialValue,
    inputLabel: "Reference or chromosome",
    toggleLabel: "Show reference choices",
    emptyText: "No matching references",
    onChange
  });
  return {
    ...control,
    setValue: (nextValue) => control.setSelectedKey(nextValue)
  };
}

export function renderAlignmentViewerRegionNavigation(container, value, {
  getViewerState,
  history,
  historyScope = "",
  onLoadRegion
} = {}) {
  const navigation = normalizeAlignmentViewerRegionNavigation(value);
  if (!navigation || typeof onLoadRegion !== "function") return null;
  history?.sync(navigation, historyScope);

  const form = document.createElement("form");
  form.className = "alignment-viewer-region-navigation";
  form.setAttribute("aria-label", "Alignment viewer region");
  form.noValidate = true;
  form.title = navigation.sourceMode === "indexed-bam"
    ? `${navigation.references.length.toLocaleString()} references · indexed BAM interval queries`
    : `${navigation.references.length.toLocaleString()} references · SAM input is rescanned for each loaded region`;

  let updateControls = () => {};
  const referenceControl = createReferenceCombobox(
    navigation.references,
    navigation.reference,
    () => updateControls()
  );
  const startInput = makeNumberInput(navigation.start, "Start position");
  const endInput = makeNumberInput(navigation.end, "End position");
  const loadButton = document.createElement("button");
  loadButton.type = "submit";
  loadButton.className = "primary";
  loadButton.textContent = "Load region";

  const historyControls = document.createElement("div");
  historyControls.className = "alignment-viewer-region-history";
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.textContent = "Back";
  backButton.title = "Return to the previously loaded region";
  const forwardButton = document.createElement("button");
  forwardButton.type = "button";
  forwardButton.textContent = "Forward";
  forwardButton.title = "Return to the next loaded region";
  const historyMenuButton = document.createElement("button");
  historyMenuButton.type = "button";
  historyMenuButton.className = "alignment-viewer-region-history-menu-button";
  historyMenuButton.setAttribute("aria-label", "Show loaded region history");
  historyMenuButton.setAttribute("aria-expanded", "false");
  const historyList = document.createElement("div");
  historyList.className = "alignment-viewer-region-history-list";
  historyList.setAttribute("role", "listbox");
  historyList.setAttribute("aria-label", "Loaded region history");
  historyList.hidden = true;
  historyControls.append(backButton, forwardButton, historyMenuButton, historyList);

  const runStatus = document.createElement("span");
  runStatus.className = "alignment-viewer-region-status";
  runStatus.setAttribute("role", "status");
  runStatus.setAttribute("aria-live", "polite");

  const referenceField = makeField("Reference / chromosome", referenceControl.element);
  referenceField.classList.add("alignment-viewer-region-reference-field");
  const startField = makeField("Start", startInput);
  startField.classList.add("alignment-viewer-region-coordinate-field");
  const endField = makeField("End", endInput);
  endField.classList.add("alignment-viewer-region-coordinate-field");
  const coordinateFields = document.createElement("div");
  coordinateFields.className = "alignment-viewer-region-coordinates";
  coordinateFields.append(startField, endField);

  form.append(
    historyControls,
    referenceField,
    coordinateFields,
    loadButton,
    runStatus
  );

  const getValues = () => ({
    reference: referenceControl.getValue(),
    start: startInput.value,
    end: endInput.value
  });
  const setValues = (region) => {
    referenceControl.setValue(region.reference);
    startInput.value = String(region.start);
    endInput.value = String(region.end);
  };
  let busy = false;
  const updateHistoryControls = () => {
    const state = history?.getState() ?? {
      entries: [{ reference: navigation.reference, start: navigation.start, end: navigation.end }],
      index: 0,
      canGoBack: false,
      canGoForward: false
    };
    historyList.replaceChildren(...state.entries.map((entry, entryIndex) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "alignment-viewer-region-history-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(entryIndex === state.index));
      option.textContent = formatRegionLabel(entry);
      option.addEventListener("click", () => {
        historyList.hidden = true;
        historyMenuButton.setAttribute("aria-expanded", "false");
        if (entryIndex !== state.index) void loadRegion(entry, { historyIndex: entryIndex });
      });
      return option;
    }));
    historyMenuButton.textContent = `History ${state.entries.length.toLocaleString()}`;
    backButton.disabled = busy || !state.canGoBack;
    forwardButton.disabled = busy || !state.canGoForward;
    historyMenuButton.disabled = busy || state.entries.length < 2;
    if (historyMenuButton.disabled) {
      historyList.hidden = true;
      historyMenuButton.setAttribute("aria-expanded", "false");
    }
  };
  updateControls = () => {
    const selected = navigation.references.find((entry) => entry.name === referenceControl.getValue().trim());
    if (selected?.length) {
      startInput.max = String(selected.length);
      endInput.max = String(selected.length);
    } else {
      startInput.removeAttribute("max");
      endInput.removeAttribute("max");
    }
    const checked = validateAlignmentViewerRegionRequest(getValues(), navigation);
    const unchanged = checked.region ? sameRegion(checked.region, navigation) : false;
    const validationMessage = checked.error ?? "";
    referenceControl.input.setAttribute("aria-invalid", String(Boolean(checked.error && !selected)));
    startInput.setAttribute("aria-invalid", String(Boolean(checked.error && !positiveInteger(startInput.value))));
    endInput.setAttribute("aria-invalid", String(Boolean(checked.error && (
      !positiveInteger(endInput.value) || positiveInteger(endInput.value) < positiveInteger(startInput.value) ||
      Boolean(selected?.length && positiveInteger(endInput.value) > selected.length)
    ))));
    loadButton.disabled = busy || Boolean(checked.error) || unchanged;
    loadButton.title = checked.error
      ? checked.error
      : unchanged
        ? "This region is already displayed"
        : `Load ${formatRegionLabel(checked.region)}`;
    if (!busy) runStatus.textContent = validationMessage;
    updateHistoryControls();
  };
  const setBusy = (nextBusy) => {
    busy = nextBusy;
    form.classList.toggle("is-loading", busy);
    loadButton.textContent = busy ? "Loading…" : "Load region";
    referenceControl.setDisabled(busy);
    for (const control of [startInput, endInput]) control.disabled = busy;
    updateControls();
  };
  const loadRegion = async (candidate, { historyIndex = null } = {}) => {
    const checked = validateAlignmentViewerRegionRequest(candidate, navigation);
    if (!checked.region) {
      runStatus.textContent = checked.error;
      return;
    }
    if (historyIndex === null && sameRegion(checked.region, navigation)) {
      runStatus.textContent = "This region is already displayed.";
      return;
    }
    history?.updateCurrentViewerState(getViewerState?.());
    const previousHistory = history?.getState();
    if (history) {
      const historyResult = historyIndex === null
        ? history.push(checked.region)
        : history.activate(historyIndex);
      if (!historyResult.region) {
        runStatus.textContent = historyResult.error;
        return;
      }
    }
    setValues(checked.region);
    setBusy(true);
    runStatus.textContent = `Loading ${formatRegionLabel(checked.region)}…`;
    try {
      await onLoadRegion(checked.region, {
        onProgress: (message) => {
          if (message) runStatus.textContent = message;
        }
      });
    } catch (error) {
      if (previousHistory) history?.restore(previousHistory);
      setBusy(false);
      runStatus.textContent = error?.message || "Could not load the requested region.";
    }
  };

  startInput.addEventListener("input", updateControls);
  endInput.addEventListener("input", updateControls);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadRegion(getValues());
  });
  backButton.addEventListener("click", () => {
    const state = history?.getState();
    const targetIndex = (state?.index ?? 0) - 1;
    const target = state?.entries[targetIndex];
    if (target) void loadRegion(target, { historyIndex: targetIndex });
  });
  forwardButton.addEventListener("click", () => {
    const state = history?.getState();
    const targetIndex = (state?.index ?? -1) + 1;
    const target = state?.entries[targetIndex];
    if (target) void loadRegion(target, { historyIndex: targetIndex });
  });
  historyMenuButton.addEventListener("click", () => {
    historyList.hidden = !historyList.hidden;
    historyMenuButton.setAttribute("aria-expanded", String(!historyList.hidden));
  });
  historyControls.addEventListener("focusout", () => window.setTimeout(() => {
    if (!historyControls.contains(document.activeElement)) {
      historyList.hidden = true;
      historyMenuButton.setAttribute("aria-expanded", "false");
    }
  }, 0));

  updateControls();
  container.append(form);
  return form;
}
