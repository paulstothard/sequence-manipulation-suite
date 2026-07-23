import { createSearchableViewerChoiceCombobox } from "./searchable-viewer-choice-ui.js";

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function makeField(labelText, control, extraClass = "") {
  const field = document.createElement("div");
  field.className = `alignment-viewer-region-field ${extraClass}`.trim();
  const label = document.createElement("span");
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function makeOptionalNumberInput(ariaLabel) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.setAttribute("aria-label", ariaLabel);
  return input;
}

function formatRange(selection) {
  return `${selection.title}:${selection.start.toLocaleString()}–${selection.end.toLocaleString()}`;
}

export function normalizeViewerSequenceChoices(viewer) {
  const records = Array.isArray(viewer?.records) ? viewer.records : [];
  const titleCounts = new Map();
  for (const [index, record] of records.entries()) {
    const title = String(record?.title ?? "").trim() || `Sequence ${index + 1}`;
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }
  const titleOccurrences = new Map();
  const protein = viewer?.viewerType === "protein-sequence-viewer" || viewer?.alphabet === "protein";
  return records.map((record, index) => {
    const title = String(record?.title ?? "").trim() || `Sequence ${index + 1}`;
    const occurrence = (titleOccurrences.get(title) ?? 0) + 1;
    titleOccurrences.set(title, occurrence);
    const length = positiveInteger(record?.length) || String(record?.sequence ?? "").length;
    return {
      key: String(index),
      index,
      title,
      label: titleCounts.get(title) > 1 ? `${title} [${occurrence}]` : title,
      length,
      detail: `${length.toLocaleString()} ${protein ? "aa" : "bp"}`,
      searchText: String(record?.id ?? ""),
      record
    };
  });
}

export function supportsViewerSequenceNavigation(viewer) {
  return Boolean(
    !viewer?.regionNavigation &&
    Array.isArray(viewer?.records) &&
    viewer.records.length > 0 &&
    ["dna-sequence-viewer", "protein-sequence-viewer"].includes(viewer?.viewerType)
  );
}

export function validateViewerSequenceRegionRequest(value, sequences) {
  const sequence = sequences.find((entry) => entry.key === String(value?.sequenceKey ?? ""));
  if (!sequence) return { error: "Choose a sequence from the loaded records." };
  if (!sequence.length) return { error: `${sequence.title} does not contain any sequence characters.` };

  const startText = String(value?.start ?? "").trim();
  const endText = String(value?.end ?? "").trim();
  const start = startText ? positiveInteger(startText) : 1;
  const end = endText ? positiveInteger(endText) : sequence.length;
  if (startText && !start) return { error: "Start must be a positive whole number or blank." };
  if (endText && !end) return { error: "End must be a positive whole number or blank." };
  if (end < start) return { error: "End must be greater than or equal to start." };
  if (start > sequence.length) {
    return { error: `${sequence.title} ends at ${sequence.length.toLocaleString()}; choose a smaller start position.` };
  }
  if (end > sequence.length) {
    return { error: `${sequence.title} ends at ${sequence.length.toLocaleString()}; choose a smaller end position.` };
  }
  return {
    selection: {
      sequenceKey: sequence.key,
      index: sequence.index,
      title: sequence.title,
      length: sequence.length,
      start,
      end,
      startBlank: !startText,
      endBlank: !endText
    }
  };
}

export function sameViewerSequenceRegion(left, right) {
  return Boolean(
    left && right &&
    left.sequenceKey === right.sequenceKey &&
    left.start === right.start &&
    left.end === right.end
  );
}

export function makeViewerSequenceInitialState(viewer, selection, previousState = null) {
  const base = previousState?.title === selection.title ? structuredClone(previousState) : {};
  if (viewer?.layout === "circular") {
    return {
      ...base,
      title: selection.title,
      length: selection.length,
      viewCenter: ((selection.start - 1) + selection.end) / 2,
      viewSpan: selection.end - selection.start + 1,
      viewMoved: false
    };
  }
  return {
    ...base,
    title: selection.title,
    length: selection.length,
    viewStart: selection.start - 1,
    viewEnd: selection.end
  };
}

export function formatViewerSequenceHeading(baseHeading, selection) {
  return `${baseHeading} · ${formatRange(selection)}`;
}

export function renderViewerSequenceNavigation(container, viewer, {
  initialSelection,
  onShowSequence
} = {}) {
  const sequences = normalizeViewerSequenceChoices(viewer);
  if (sequences.length === 0 || typeof onShowSequence !== "function") return null;
  const initial = validateViewerSequenceRegionRequest({
    sequenceKey: initialSelection?.sequenceKey ?? sequences[0].key,
    start: initialSelection?.startBlank === false ? initialSelection.start : "",
    end: initialSelection?.endBlank === false ? initialSelection.end : ""
  }, sequences);
  if (!initial.selection) return null;
  let currentSelection = initial.selection;
  let selectedKey = currentSelection.sequenceKey;

  const form = document.createElement("form");
  form.className = "alignment-viewer-region-navigation viewer-sequence-navigation";
  form.setAttribute("aria-label", "Viewer sequence region");
  form.noValidate = true;
  form.title = `${sequences.length.toLocaleString()} sequence${sequences.length === 1 ? "" : "s"} available · blank start and end use the full sequence`;

  let updateControls = () => {};
  const startInput = makeOptionalNumberInput("Start position, optional");
  const endInput = makeOptionalNumberInput("End position, optional");
  startInput.title = "Leave blank to begin at the first sequence position";
  endInput.title = "Leave blank to end at the last sequence position";
  if (initialSelection?.startBlank === false) startInput.value = String(currentSelection.start);
  if (initialSelection?.endBlank === false) endInput.value = String(currentSelection.end);
  const sequenceControl = createSearchableViewerChoiceCombobox({
    choices: sequences,
    initialKey: currentSelection.sequenceKey,
    inputLabel: "Sequence",
    toggleLabel: "Show sequence choices",
    emptyText: "No matching sequences",
    onChange: (choice) => {
      if (choice && choice.key !== selectedKey) {
        selectedKey = choice.key;
        startInput.value = "";
        endInput.value = "";
      }
      updateControls();
    }
  });
  const showButton = document.createElement("button");
  showButton.type = "submit";
  showButton.className = "primary";
  showButton.textContent = "View sequence";
  const status = document.createElement("span");
  status.className = "alignment-viewer-region-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const sequenceField = makeField(
    "Sequence",
    sequenceControl.element,
    "alignment-viewer-region-reference-field"
  );
  const coordinates = document.createElement("div");
  coordinates.className = "alignment-viewer-region-coordinates";
  coordinates.append(
    makeField("Start (optional)", startInput, "alignment-viewer-region-coordinate-field"),
    makeField("End (optional)", endInput, "alignment-viewer-region-coordinate-field")
  );
  form.append(sequenceField, coordinates, showButton, status);

  const getRequest = () => ({
    sequenceKey: sequenceControl.getSelectedChoice()?.key ?? "",
    start: startInput.value,
    end: endInput.value
  });
  updateControls = () => {
    const sequence = sequenceControl.getSelectedChoice();
    const length = sequence?.length ?? 0;
    startInput.placeholder = "1";
    endInput.placeholder = length ? length.toLocaleString() : "End";
    if (length) {
      startInput.max = String(length);
      endInput.max = String(length);
    } else {
      startInput.removeAttribute("max");
      endInput.removeAttribute("max");
    }
    const checked = validateViewerSequenceRegionRequest(getRequest(), sequences);
    const unchanged = checked.selection
      ? sameViewerSequenceRegion(checked.selection, currentSelection)
      : false;
    const start = positiveInteger(startInput.value);
    const end = positiveInteger(endInput.value);
    sequenceControl.input.setAttribute("aria-invalid", String(Boolean(checked.error && !sequence)));
    startInput.setAttribute("aria-invalid", String(Boolean(
      checked.error && startInput.value && (!start || Boolean(length && start > length))
    )));
    endInput.setAttribute("aria-invalid", String(Boolean(
      checked.error && endInput.value && (
        !end ||
        end < (start || 1) ||
        Boolean(length && end > length)
      )
    )));
    showButton.disabled = Boolean(checked.error) || unchanged;
    showButton.title = checked.error
      ? checked.error
      : unchanged
        ? "This sequence region is already displayed"
        : `View ${formatRange(checked.selection)}`;
    status.textContent = checked.error ?? "";
  };

  startInput.addEventListener("input", updateControls);
  endInput.addEventListener("input", updateControls);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const checked = validateViewerSequenceRegionRequest(getRequest(), sequences);
    if (!checked.selection) {
      status.textContent = checked.error;
      return;
    }
    if (sameViewerSequenceRegion(checked.selection, currentSelection)) return;
    try {
      onShowSequence(checked.selection);
      currentSelection = checked.selection;
      selectedKey = checked.selection.sequenceKey;
      status.textContent = "";
      updateControls();
    } catch (error) {
      status.textContent = error?.message || "Could not display that sequence region.";
    }
  });

  updateControls();
  container.append(form);
  return { form, sequences, initialSelection: currentSelection };
}
