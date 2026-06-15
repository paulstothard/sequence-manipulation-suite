import { isViewerGeneratedCompositionTrack } from "./dna-viewer-composition-controls.js";

const FEATURE_TYPE_COLORS = new Map([
  ["CDS", "#2563eb"],
  ["gene", "#16a34a"],
  ["source", "#64748b"],
  ["tRNA", "#7c3aed"],
  ["rRNA", "#d97706"],
  ["misc_feature", "#0f766e"],
  ["repeat_region", "#db2777"],
  ["mobile_element", "#c2410c"],
  ["regulatory", "#0891b2"],
  ["promoter", "#9333ea"],
  ["terminator", "#be123c"],
  ["primer_bind", "#059669"],
  ["SNV", "#2563eb"],
  ["MNV", "#0891b2"],
  ["insertion", "#16a34a"],
  ["deletion", "#dc2626"],
  ["indel", "#d97706"],
  ["multi-allelic", "#7c3aed"]
]);
const FEATURE_TYPE_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#0f766e",
  "#c2410c"
];
const TRACK_DISPLAY_MODES = [
  { value: "auto", label: "Auto" },
  { value: "collapsed", label: "Collapsed" },
  { value: "squished", label: "Squished" },
  { value: "full", label: "Full" }
];

export function makeTargetKey(target) {
  return [
    target.kind,
    target.trackId || "",
    target.itemIndex ?? "",
    target.position ?? "",
    target.start ?? "",
    target.end ?? "",
    target.strand || "",
    target.frame || ""
  ].join("|");
}

export function addRectHit(state, rect, target) {
  if (!state.hitRegions) state.hitRegions = [];
  state.hitRegions.push({
    shape: "rect",
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
    target: { ...target, key: target.key || makeTargetKey(target) }
  });
}

export function addCircleHit(state, circle, target) {
  if (!state.hitRegions) state.hitRegions = [];
  state.hitRegions.push({
    shape: "circle",
    x: circle.x,
    y: circle.y,
    radius: circle.radius,
    target: { ...target, key: target.key || makeTargetKey(target) }
  });
}

export function addPolarHit(state, polar, target) {
  if (!state.hitRegions) state.hitRegions = [];
  state.hitRegions.push({
    shape: "polar",
    cx: polar.cx,
    cy: polar.cy,
    innerRadius: Math.min(polar.innerRadius, polar.outerRadius),
    outerRadius: Math.max(polar.innerRadius, polar.outerRadius),
    startAngle: polar.startAngle,
    endAngle: polar.endAngle,
    target: { ...target, key: target.key || makeTargetKey(target) }
  });
}

export function hitTestRegions(state, clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const regions = state.hitRegions || [];
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const region = regions[index];
    if (region.shape === "rect" && x >= region.x1 && x <= region.x2 && y >= region.y1 && y <= region.y2) {
      return region.target;
    }
    if (region.shape === "circle") {
      const distance = Math.hypot(x - region.x, y - region.y);
      if (distance <= region.radius) return region.target;
    }
    if (region.shape === "polar") {
      const dx = x - region.cx;
      const dy = y - region.cy;
      const radius = Math.hypot(dx, dy);
      if (radius < region.innerRadius || radius > region.outerRadius) continue;
      const angle = Math.atan2(dy, dx);
      if (isAngleWithin(angle, region.startAngle, region.endAngle)) return region.target;
    }
  }
  return null;
}

export function createViewerTooltip(panel) {
  const tooltip = document.createElement("div");
  tooltip.className = "dna-viewer-tooltip";
  tooltip.hidden = true;
  panel.append(tooltip);
  return tooltip;
}

export function showViewerTooltip(tooltip, target, event, panel) {
  if (!target) {
    hideViewerTooltip(tooltip);
    return;
  }
  tooltip.textContent = makeTooltipText(target);
  const panelRect = panel.getBoundingClientRect();
  tooltip.style.left = `${event.clientX - panelRect.left + 12}px`;
  tooltip.style.top = `${event.clientY - panelRect.top + 12}px`;
  tooltip.hidden = false;
}

export function hideViewerTooltip(tooltip) {
  tooltip.hidden = true;
}

export function getViewerTrackKey(track, index = 0) {
  return String(track?.id || track?.type || `track-${index + 1}`);
}

export function getViewerItemTypeKey(item) {
  const value = item?.featureType || item?.type || item?.feature || item?.className || item?.kind || "item";
  return String(value).replace(/\s+/g, " ").trim() || "item";
}

export function getViewerTrackTypeEntries(track) {
  const counts = new Map();
  for (const item of track?.items ?? []) {
    const type = getViewerItemTypeKey(item);
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => left.type.localeCompare(right.type, undefined, { numeric: true, sensitivity: "base" }));
}

export function hasHiddenViewerItemTypes(track, state) {
  const hidden = state?.hiddenTrackItemTypes?.get(getViewerTrackKey(track));
  return Boolean(hidden?.size);
}

export function getViewerTrackItems(track, state) {
  const items = Array.isArray(track?.items) ? track.items : [];
  const hidden = state?.hiddenTrackItemTypes?.get(getViewerTrackKey(track));
  if (!hidden?.size) return items;
  return items.filter((item) => !hidden.has(getViewerItemTypeKey(item)));
}

export function getViewerFeatureTypeStyle(item, fallback = "#2563eb") {
  const direct = item?.color || item?.stroke || item?.fillColor;
  const type = getViewerItemTypeKey(item);
  const stroke = direct || FEATURE_TYPE_COLORS.get(type) || FEATURE_TYPE_PALETTE[hashString(type) % FEATURE_TYPE_PALETTE.length] || fallback;
  return {
    stroke,
    fill: colorWithAlpha(stroke, 0.18) || colorWithAlpha(fallback, 0.18) || "#dbeafe"
  };
}

export function makeViewerItemTargetDetails(item = {}) {
  return {
    matchNumber: item.matchNumber,
    motifId: item.motifId,
    score: item.score,
    source: item.source,
    matchedText: item.matchedText,
    primerSequence: item.primerSequence,
    tmC: item.tmC,
    gcPercent: item.gcPercent,
    productSize: item.productSize,
    genomicPosition: item.genomicPosition,
    genomicCoordinates: item.genomicCoordinates,
    referenceId: item.referenceId,
    referenceName: item.referenceName,
    referenceAccession: item.referenceAccession,
    referenceCoordinates: item.referenceCoordinates,
    percentIdentity: item.percentIdentity,
    mismatches: item.mismatches,
    gaps: item.gaps,
    vectorConfidence: item.vectorConfidence,
    variantId: item.variantId,
    refAllele: item.refAllele,
    altAllele: item.altAllele,
    filter: item.filter,
    qual: item.qual,
    info: item.info,
    sampleGenotypes: item.sampleGenotypes,
    featureId: item.featureId,
    readName: item.readName,
    flag: item.flag,
    paired: item.paired,
    properPair: item.properPair,
    firstMate: item.firstMate,
    secondMate: item.secondMate,
    mateKey: item.mateKey,
    mateName: item.mateName,
    mateNumber: item.mateNumber,
    mateReference: item.mateReference,
    matePosition: item.matePosition,
    mateStart: item.mateStart,
    mateEnd: item.mateEnd,
    mateFeatureId: item.mateFeatureId,
    matePresentInViewer: item.matePresentInViewer,
    pairStatus: item.pairStatus,
    mapq: item.mapq,
    cigar: item.cigar,
    readLength: item.readLength,
    readSequence: item.readSequence,
    readQuality: item.readQuality,
    insertionSummary: item.insertionSummary,
    deletionSummary: item.deletionSummary,
    clippedBaseSummary: item.clippedBaseSummary,
    referenceSpan: item.referenceSpan,
    templateLength: item.templateLength,
    readGroup: item.readGroup,
    sample: item.sample,
    status: item.status,
    note: item.note
  };
}

export function getVisibleViewerTracks(record, state) {
  const hidden = state?.hiddenTrackIds ?? new Set();
  return (record?.tracks ?? []).filter((track, index) => !hidden.has(getViewerTrackKey(track, index)));
}

export function getViewerTrackDisplayMode(track, state) {
  const value = state?.trackDisplayModes?.get(getViewerTrackKey(track));
  return TRACK_DISPLAY_MODES.some((mode) => mode.value === value) ? value : "auto";
}

function setViewerTrackDisplayMode(track, state, value) {
  if (!state.trackDisplayModes) {
    state.trackDisplayModes = new Map();
  }
  const key = getViewerTrackKey(track);
  if (!value || value === "auto") {
    state.trackDisplayModes.delete(key);
  } else {
    state.trackDisplayModes.set(key, value);
  }
}

export function createViewerTrackControls(record, state, onChange, options = {}) {
  const tracks = (record?.tracks ?? []).filter((track) => !isViewerGeneratedCompositionTrack(track));
  if (tracks.length === 0) {
    return null;
  }
  const showDisplayModes = options.displayModes === true;
  if (!state.hiddenTrackIds) {
    state.hiddenTrackIds = new Set();
  }
  if (!state.hiddenTrackItemTypes) {
    state.hiddenTrackItemTypes = new Map();
  }
  if (showDisplayModes && !state.trackDisplayModes) {
    state.trackDisplayModes = new Map();
  }
  const details = document.createElement("details");
  details.className = "dna-viewer-track-controls";
  const summary = document.createElement("summary");
  summary.textContent = "Track settings";
  const list = document.createElement("div");
  list.className = "dna-viewer-track-list";
  tracks.forEach((track, index) => {
    const key = getViewerTrackKey(track, index);
    const row = document.createElement("div");
    row.className = "dna-viewer-track-row";
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !state.hiddenTrackIds.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.hiddenTrackIds.delete(key);
      } else {
        state.hiddenTrackIds.add(key);
      }
      onChange?.();
    });
    const text = track.label || track.type || `Track ${index + 1}`;
    const count = Array.isArray(track.items) ? ` (${track.items.length.toLocaleString()})` : "";
    label.append(checkbox, document.createTextNode(`${text}${count}`));
    row.append(label);

    if (showDisplayModes && track.type !== "quantitative") {
      const modeLabel = document.createElement("label");
      modeLabel.className = "dna-viewer-track-mode";
      const modeText = document.createElement("span");
      modeText.textContent = "Display";
      const modeSelect = document.createElement("select");
      modeSelect.setAttribute("aria-label", `${text} display mode`);
      for (const mode of TRACK_DISPLAY_MODES) {
        const option = document.createElement("option");
        option.value = mode.value;
        option.textContent = mode.label;
        modeSelect.append(option);
      }
      modeSelect.value = getViewerTrackDisplayMode(track, state);
      modeSelect.addEventListener("change", () => {
        setViewerTrackDisplayMode(track, state, modeSelect.value);
        onChange?.();
      });
      modeLabel.append(modeText, modeSelect);
      row.append(modeLabel);
    }

    const typeEntries = getViewerTrackTypeEntries(track);
    if (typeEntries.length > 1) {
      const typeList = document.createElement("div");
      typeList.className = "dna-viewer-track-type-list";
      const typeHeading = document.createElement("div");
      typeHeading.className = "dna-viewer-track-type-heading";
      typeHeading.textContent = "Feature types";
      typeList.append(typeHeading);
      const hiddenTypes = state.hiddenTrackItemTypes.get(key) || new Set();
      for (const entry of typeEntries.slice(0, 32)) {
        const typeLabel = document.createElement("label");
        typeLabel.className = "dna-viewer-track-type-option";
        const typeCheckbox = document.createElement("input");
        typeCheckbox.type = "checkbox";
        typeCheckbox.checked = !hiddenTypes.has(entry.type);
        typeCheckbox.addEventListener("change", () => {
          const nextHidden = state.hiddenTrackItemTypes.get(key) || new Set();
          if (typeCheckbox.checked) {
            nextHidden.delete(entry.type);
          } else {
            nextHidden.add(entry.type);
          }
          if (nextHidden.size === 0) {
            state.hiddenTrackItemTypes.delete(key);
          } else {
            state.hiddenTrackItemTypes.set(key, nextHidden);
          }
          onChange?.();
        });
        typeLabel.append(typeCheckbox, document.createTextNode(`${entry.type} (${entry.count.toLocaleString()})`));
        typeList.append(typeLabel);
      }
      if (typeEntries.length > 32) {
        const note = document.createElement("div");
        note.className = "dna-viewer-track-type-note";
        note.textContent = `${(typeEntries.length - 32).toLocaleString()} additional types not shown`;
        typeList.append(note);
      }
      row.append(typeList);
    }
    list.append(row);
  });
  details.append(summary, list);
  return details;
}

export function createSelectionPanel(emptyText = "Click a feature, site, base, codon, amino acid, or coordinate to inspect it.") {
  const panel = document.createElement("div");
  panel.className = "dna-viewer-selection-panel";
  const empty = document.createElement("div");
  empty.className = "dna-viewer-selection-empty";
  empty.textContent = emptyText;
  panel.append(empty);
  return panel;
}

export function createRangePanel() {
  const panel = document.createElement("div");
  panel.className = "dna-viewer-range-panel";
  return panel;
}

export function createViewerInspectorWorkspace(canvas, selectionPanel, rangePanel) {
  const workspace = document.createElement("div");
  workspace.className = "interactive-sequence-viewer-workspace";

  const main = document.createElement("div");
  main.className = "interactive-sequence-viewer-main";
  main.append(canvas);

  const inspector = document.createElement("aside");
  inspector.className = "interactive-sequence-viewer-inspector";
  inspector.setAttribute("aria-label", "Selected item and range details");

  const header = document.createElement("div");
  header.className = "interactive-sequence-viewer-inspector-header";
  const title = document.createElement("strong");
  title.textContent = "Selection";
  const note = document.createElement("span");
  note.textContent = "Item and range details";
  header.append(title, note);

  const body = document.createElement("div");
  body.className = "interactive-sequence-viewer-inspector-body";
  body.append(selectionPanel, rangePanel);

  inspector.append(header, body);
  workspace.append(main, inspector);
  return workspace;
}

export function createViewerSearchControls(callbacks = {}, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "dna-viewer-search";

  const label = document.createElement("label");
  const labelText = document.createElement("span");
  labelText.textContent = "Search";
  const scope = document.createElement("select");
  const scopes = options.scopes ?? [["dna", "DNA"], ["protein", "Translations"], ["features", "Features"]];
  for (const [value, text] of scopes) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    scope.append(option);
  }
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = options.placeholder || "Find sequence, translation, or feature";
  input.title = "Enter: next result. Shift+Enter: previous result. Esc: clear search.";
  const featureSuggestions = Array.from(new Set(options.featureSuggestions ?? []))
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 300);
  const datalist = document.createElement("datalist");
  if (featureSuggestions.length > 0) {
    datalist.id = `dna-viewer-feature-search-${Math.random().toString(36).slice(2)}`;
    for (const suggestion of featureSuggestions) {
      const option = document.createElement("option");
      option.value = suggestion;
      datalist.append(option);
    }
    if (scope.value === "features") {
      input.setAttribute("list", datalist.id);
    }
  }
  label.append(labelText, scope, input);

  const status = document.createElement("span");
  status.className = "dna-viewer-search-status";
  status.textContent = "No search";

  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "Prev";
  previous.title = "Previous result (Shift+Enter in search box)";
  previous.disabled = true;
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "Next";
  next.title = "Next result (Enter in search box)";
  next.disabled = true;
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear";
  clear.title = "Clear search (Esc in search box)";
  clear.disabled = true;

  let timer = null;
  let lastSearchScope = scope.value;
  let lastSearchQuery = input.value;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      lastSearchScope = scope.value;
      lastSearchQuery = input.value;
      callbacks.onSearch?.(scope.value, input.value);
    }, 180);
  };
  const runImmediateSearch = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastSearchScope === scope.value && lastSearchQuery === input.value) {
      return;
    }
    lastSearchScope = scope.value;
    lastSearchQuery = input.value;
    callbacks.onSearch?.(scope.value, input.value);
  };
  scope.addEventListener("change", () => {
    if (datalist.id && scope.value === "features") {
      input.setAttribute("list", datalist.id);
    } else {
      input.removeAttribute("list");
    }
    schedule();
  });
  input.addEventListener("input", schedule);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runImmediateSearch();
      if (event.shiftKey) {
        callbacks.onPrevious?.();
      } else {
        callbacks.onNext?.();
      }
    } else if (event.key === "Escape") {
      if (!input.value) return;
      event.preventDefault();
      input.value = "";
      runImmediateSearch();
    }
  });
  previous.addEventListener("click", () => callbacks.onPrevious?.());
  next.addEventListener("click", () => callbacks.onNext?.());
  clear.addEventListener("click", () => {
    input.value = "";
    callbacks.onSearch?.(scope.value, "");
    input.focus();
  });

  wrapper.append(label, datalist, previous, next, clear, status);
  return { element: wrapper, scope, input, status, previous, next, clear };
}

export function makeViewerFeatureSuggestions(record, limit = 300) {
  const values = [];
  for (const track of record?.tracks ?? []) {
    for (const item of track.items ?? []) {
      values.push(
        item.label,
        item.name,
        item.enzyme,
        item.recognition,
        item.referenceId,
        item.referenceName,
        item.referenceAccession,
        item.referenceCoordinates,
        item.variantId,
        item.genomicCoordinates,
        item.refAllele,
        item.altAllele,
        item.readName,
        item.mateName,
        item.mateReference,
        item.matePosition,
        item.mateKey,
        item.mateNumber,
        item.pairStatus,
        item.cigar,
        item.mapq,
        item.flag,
        item.sample,
        item.status,
        item.gene,
        item.locus_tag,
        item.product,
        item.type,
        track.label
      );
    }
  }
  return Array.from(new Set(values
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }))
    .slice(0, limit);
}

export function updateViewerSearchControls(controls, results, activeIndex) {
  const count = results?.length || 0;
  const countLabel = count.toLocaleString();
  const omittedSuffix = results?.omitted ? " shown; more not shown" : "";
  controls.previous.disabled = count === 0;
  controls.next.disabled = count === 0;
  controls.clear.disabled = !String(controls.input.value || "").trim();
  if (!String(controls.input.value || "").trim()) {
    controls.status.textContent = "No search";
  } else if (count === 0) {
    controls.status.textContent = "0 results";
  } else if (activeIndex < 0) {
    controls.status.textContent = `${countLabel} result${count === 1 ? "" : "s"}${omittedSuffix}`;
  } else {
    controls.status.textContent = `${(activeIndex + 1).toLocaleString()} of ${countLabel}${omittedSuffix}`;
  }
}

export function renderRangePanel(panel, range, actions = {}) {
  panel.textContent = "";
  const heading = document.createElement("div");
  heading.className = "dna-viewer-selection-heading";
  const title = document.createElement("strong");
  title.textContent = "Range selection";
  heading.append(title);

  if (!range?.anchors?.length) {
    const empty = document.createElement("div");
    empty.className = "dna-viewer-selection-empty";
    empty.textContent = actions.emptyText || "Add two anchors from selected coordinates, bases, sites, or codons to build a forward-DNA range.";
    panel.append(heading, empty);
    return;
  }

  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear range";
  clear.addEventListener("click", () => actions.clearRange?.());
  heading.append(clear);

  const rows = document.createElement("dl");
  rows.className = "dna-viewer-selection-details dna-viewer-range-details";
  range.anchors.forEach((anchor, index) => {
    const term = document.createElement("dt");
    term.textContent = `Anchor ${index + 1}`;
    const description = document.createElement("dd");
    description.textContent = `${Number(anchor.position).toLocaleString()}${anchor.label ? ` (${anchor.label})` : ""}`;
    rows.append(term, description);
  });
  if (range.ready) {
    for (const [label, value] of [
      ["Forward range", range.label],
      ["Length", `${Number(range.length).toLocaleString()} ${actions.unitLabel || "bp"}`],
      ["Wraps origin", range.wraps ? "yes" : "no"]
    ]) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      rows.append(term, description);
    }
  }

  const buttons = document.createElement("div");
  buttons.className = "dna-viewer-selection-actions";
  if (range.ready) {
    addAction(buttons, "Copy coordinates", () => actions.copyCoordinates?.(), true);
    addAction(buttons, actions.copySequenceLabel || "Copy forward DNA", () => actions.copyForwardDna?.(), true);
    if (actions.showReverseComplement !== false) {
      addAction(buttons, "Copy reverse complement", () => actions.copyReverseComplement?.(), true);
    }
    if (actions.showTranslation !== false) {
      const translationControl = document.createElement("label");
      translationControl.className = "dna-viewer-range-translation";
      const translationText = document.createElement("span");
      translationText.textContent = "Copy translation";
      const frameSelect = document.createElement("select");
      for (const frame of ["+1", "+2", "+3", "-1", "-2", "-3"]) {
        const option = document.createElement("option");
        option.value = frame;
        option.textContent = frame;
        frameSelect.append(option);
      }
      const translationButton = document.createElement("button");
      translationButton.type = "button";
      translationButton.textContent = "Copy";
      translationButton.addEventListener("click", () => actions.copyTranslation?.(frameSelect.value));
      translationControl.append(translationText, frameSelect, translationButton);
      buttons.append(translationControl);
    }
    addAction(buttons, "Zoom to range", () => actions.zoomToRange?.(), true);
    if (range.canSwap) addAction(buttons, "Use opposite path", () => actions.swapRange?.(), true);
  }

  panel.append(heading, rows, buttons);
}

export function renderSelectionPanel(panel, target, actions = {}) {
  panel.textContent = "";
  if (!target) {
    const empty = document.createElement("div");
    empty.className = "dna-viewer-selection-empty";
    empty.textContent = actions.emptyText || "Click a feature, site, base, codon, amino acid, or coordinate to inspect it.";
    panel.append(empty);
    return;
  }

  const heading = document.createElement("div");
  heading.className = "dna-viewer-selection-heading";
  const title = document.createElement("strong");
  title.textContent = makeTitle(target);
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "Clear";
  clear.addEventListener("click", () => actions.clearSelection?.());
  heading.append(title, clear);

  const rows = document.createElement("dl");
  rows.className = "dna-viewer-selection-details";
  for (const [label, value] of makeDetailRows(target)) {
    if (value === undefined || value === null || value === "") continue;
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    rows.append(term, description);
  }

  const buttons = document.createElement("div");
  buttons.className = "dna-viewer-selection-actions";
  addAction(buttons, target.position ? "Add as range anchor" : "Add start as range anchor", () => actions.addRangeAnchor?.(target), canUseAsRangeAnchor(target));
  addAction(buttons, "Copy coordinates", () => actions.copyText?.(formatCoordinates(target)), Boolean(target.position || target.start || target.end));
  addAction(buttons, "Copy sequence", () => actions.copySequence?.(target), Boolean(target.start || target.end || target.position));
  addAction(buttons, "Copy translation", () => actions.copyText?.(target.aminoAcid || ""), Boolean(target.aminoAcid));
  addAction(buttons, "Zoom to selection", () => actions.zoomToTarget?.(target), Boolean(target.start || target.end || target.position));
  addAction(buttons, "Zoom to mate", () => actions.zoomToMate?.(target), actions.canZoomToMate?.(target) ?? Boolean(target.matePresentInViewer));
  if (target.kind === "restriction-site" && target.enzyme) {
    addAction(buttons, `Show ${target.enzyme} sites`, () => actions.showRelatedSites?.(target), true);
  }

  panel.append(heading, rows, buttons);
}

export function canUseAsRangeAnchor(target) {
  const position = Number(target?.position ?? target?.start);
  return Number.isFinite(position) && position > 0;
}

export function formatCoordinates(target) {
  if (target.position) return formatNumber(target.position);
  if (target.start && target.end) return `${formatNumber(target.start)}-${formatNumber(target.end)}`;
  return "";
}

function formatRestrictionCut(target) {
  return formatNumber(target.cutAfter ?? target.cutPosition ?? target.position);
}

function formatRestrictionRecognitionCoordinates(target) {
  if (!target.siteStart || !target.siteEnd) return "";
  return `${formatNumber(target.siteStart)}-${formatNumber(target.siteEnd)}`;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "";
}

function formatLength(target) {
  if (!target.length) return "";
  return `${formatNumber(target.length)} ${target.alphabet === "protein" ? "aa" : "bp"}`;
}

function addAction(container, label, handler, enabled) {
  if (!enabled) return;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", handler);
  container.append(button);
}

function makeTooltipText(target) {
  switch (target.kind) {
    case "search-result":
      return target.label || `Search result ${formatCoordinates(target)}`;
    case "coordinate":
      return `Coordinate ${Number(target.position).toLocaleString()}`;
    case "restriction-site":
      return [
        `${target.enzyme || target.label || "Restriction site"} cut after base ${formatRestrictionCut(target) || formatCoordinates(target)}`,
        formatRestrictionRecognitionCoordinates(target) ? `site ${formatRestrictionRecognitionCoordinates(target)}` : "",
        target.recognition || ""
      ].filter(Boolean).join(" | ");
    case "interval":
      return [
        target.label || target.type || "Feature",
        `coords ${formatCoordinates(target)}`,
        formatLength(target) ? `length ${formatLength(target)}` : ""
      ].filter(Boolean).join(" | ");
    case "base":
      return `${target.alphabet === "protein" ? "Residue" : target.strand === "-" ? "Complement base" : "Base"} ${target.base} at ${formatCoordinates(target)}`;
    case "codon":
      return `${target.frame || ""} ${target.codon || ""} -> ${target.aminoAcid || ""} at ${formatCoordinates(target)}`.trim();
    default:
      return target.label || target.type || "Viewer item";
  }
}

function makeTitle(target) {
  switch (target.kind) {
    case "coordinate": return "Coordinate";
    case "restriction-site": return target.enzyme || target.label || "Restriction site";
    case "interval": return target.label || target.name || target.type || "Feature";
    case "base": return target.alphabet === "protein" ? "Residue" : target.strand === "-" ? "Complement base" : "Base";
    case "codon": return "Codon / amino acid";
    case "search-result": return target.label || "Search result";
    default: return target.label || "Viewer item";
  }
}

function makeDetailRows(target) {
  return [
    ["Type", target.type || target.kind],
    ["Feature type", target.featureType],
    ["Name", target.name || target.label],
    ["Genomic position", target.genomicPosition],
    ["Genomic coordinates", target.genomicCoordinates],
    ["Reference", target.referenceName],
    ["Reference accession", target.referenceAccession],
    ["Reference ID", target.referenceId],
    ["Reference coordinates", target.referenceCoordinates],
    ["Percent identity", target.percentIdentity],
    ["Mismatches", target.mismatches],
    ["Gaps", target.gaps],
    ["Confidence", target.vectorConfidence],
    ["Variant ID", target.variantId],
    ["Ref allele", target.refAllele],
    ["Alt allele", target.altAllele],
    ["Filter", target.filter],
    ["Qual", target.qual],
    ["Sample genotypes", target.sampleGenotypes],
    ["Read name", target.readName],
    ["FLAG", target.flag],
    ["Paired", target.paired === true ? "yes" : target.paired === false ? "no" : undefined],
    ["Proper pair", target.properPair === true ? "yes" : target.properPair === false ? "no" : undefined],
    ["First mate", target.firstMate === true ? "yes" : target.firstMate === false ? "no" : undefined],
    ["Second mate", target.secondMate === true ? "yes" : target.secondMate === false ? "no" : undefined],
    ["Mate key", target.mateKey],
    ["Mate name", target.mateName],
    ["Mate number", target.mateNumber],
    ["Mate reference", target.mateReference],
    ["Mate position", target.matePosition],
    ["Mate in viewer", target.matePresentInViewer === true ? "yes" : target.matePresentInViewer === false ? "no" : undefined],
    ["Pair status", target.pairStatus],
    ["MAPQ", target.mapq],
    ["CIGAR", target.cigar],
    ["Read length", target.readLength],
    ["Read sequence", target.readSequence],
    ["Read quality", target.readQuality],
    ["Insertions", target.insertionSummary],
    ["Deletions/skips", target.deletionSummary],
    ["Clipped bases", target.clippedBaseSummary],
    ["Reference span", target.referenceSpan],
    ["Template length", target.templateLength],
    ["Read group", target.readGroup],
    ["Sample", target.sample],
    ["Status", target.status],
    ["Note", target.note],
    ["Info", target.info],
    ["Match", target.matchNumber],
    ["Motif ID", target.motifId],
    ["Score", target.score],
    ["Matched sequence", target.matchedText],
    ["Source", target.source],
    ["Primer sequence", target.primerSequence],
    ["Tm C", target.tmC],
    ["GC percent", target.gcPercent],
    ["Product size", target.productSize],
    ["Cut after base", target.kind === "restriction-site" ? formatRestrictionCut(target) : undefined],
    ["Recognition coordinates", target.kind === "restriction-site" ? formatRestrictionRecognitionCoordinates(target) : undefined],
    ["Coordinates", formatCoordinates(target)],
    ["Strand", target.strand],
    ["Frame", target.frame],
    [target.alphabet === "protein" ? "Residue" : "Base", target.base],
    ["Codon", target.codon],
    ["Amino acid", target.aminoAcid],
    ["Enzyme", target.enzyme],
    ["Recognition site", target.recognition],
    ["Length", formatLength(target)]
  ];
}

function isAngleWithin(angle, startAngle, endAngle) {
  const normalizedAngle = normalizeAngle(angle);
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(endAngle);
  if (start <= end) return normalizedAngle >= start && normalizedAngle <= end;
  return normalizedAngle >= start || normalizedAngle <= end;
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function colorWithAlpha(color, alpha) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color || ""));
  if (!match) return "";
  const value = match[1];
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgb(${red} ${green} ${blue} / ${alpha})`;
}
