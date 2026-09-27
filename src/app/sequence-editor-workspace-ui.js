import { createEditorSession } from './editor-session.js';
import { createEditorPanelTabs } from './editor-panel-tabs.js';
import { formatFastaRecord } from "../core/fasta.js";
import { geneticCodes, getCodonsForCode } from "../core/genetic-code.js";
import { cleanDnaRnaSequence } from "../core/sequence.js";
import {
  applySequenceEditorCoordinateEdit,
  makeSequenceEditorFeatureTrackOverrides,
  makeSequenceEditorReverseComplementFasta,
  prepareSequenceEditorData,
  summarizeSequenceEditorChanges
} from "../core/sequence-editor.js";
import {
  cleanupRenderedCircularDnaViewer,
  renderCircularDnaViewer,
  snapshotRenderedCircularDnaViewer
} from "./dna-circular-viewer-canvas.js";
import {
  cleanupRenderedDnaViewer,
  renderDnaViewer,
  snapshotRenderedDnaViewer
} from "./dna-viewer-canvas.js";
import { downloadText } from "./file-download.js";
import { copyTextWithFeedback, showCopiedFeedback } from "./copy-feedback.js";
import {
  makeViewerSequenceInitialState,
  normalizeViewerSequenceChoices,
  renderViewerSequenceNavigation,
  validateViewerSequenceRegionRequest
} from "./viewer-sequence-navigation-ui.js";
import {
  cloneSequenceEditorFeatureOverrides,
  describeSequenceEditorEditTarget,
  getActiveSequenceEditorSelection,
  getSequenceEditorDirectSelection,
  getSequenceEditorQuickEditCapabilities,
  getSequenceEditorRangeSelection,
  getSequenceEditorSelectionKey,
  normalizeSequenceEditorFilename,
  shortSequencePreview
} from "./sequence-editor-workspace-model.js";

export function createSequenceEditorWorkspaceController({ elements, state, addMessage }) {
function createMarkdownWorkspaceField(labelText, control) {
  const label = document.createElement("label");
  label.className = "markdown-workspace-field";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  label.append(labelSpan, control);
  return label;
}

function createMarkdownWorkspaceButton(label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) {
    button.className = className;
  }
  return button;
}

function getSequenceEditorControl(name) {
  return elements.markdownWorkspace?.querySelector(`[data-sequence-editor-control="${name}"]`);
}

function readSequenceEditorWorkspaceState() {
  const editor = getSequenceEditorControl("editor");
  if (!editor) return null;
  return {
    text: editor.value,
    geneticCode: getSequenceEditorControl("geneticCode")?.value || "1",
    viewerLayout: getSequenceEditorControl("viewerLayout")?.value || "linear",
    filename: getSequenceEditorControl("filename")?.value || "sequence-editor.fasta",
    lineWidth: getSequenceEditorControl("lineWidth")?.value || "60"
  };
}

function renderSequenceEditorChangeSummary(container, changeSummary) {
  container.textContent = "";
  const title = document.createElement("h4");
  title.textContent = "Change summary";
  const headline = document.createElement("p");
  headline.className = "sequence-editor-change-headline";
  headline.textContent = changeSummary.headline;
  const metrics = document.createElement("dl");
  metrics.className = "sequence-editor-change-metrics";
  const metricItems = [
    ["Sequence length", `${changeSummary.currentBases.toLocaleString()} bp`],
    ["Length change", `${changeSummary.lengthDelta > 0 ? "+" : ""}${changeSummary.lengthDelta.toLocaleString()} bp`],
    ["Current records", changeSummary.currentRecords.toLocaleString()],
    ["Changed records", changeSummary.changedRecords.toLocaleString()],
    ["Genetic code", `${changeSummary.geneticCode}. ${changeSummary.geneticCodeName}`]
  ];
  for (const [label, value] of metricItems) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    metrics.append(term, description);
  }
  container.append(title, headline, metrics);

  if (changeSummary.firstChange?.beforePreview || changeSummary.firstChange?.afterPreview) {
    const comparison = document.createElement("section");
    comparison.className = "sequence-editor-change-section";
    const heading = document.createElement("h5");
    heading.textContent = changeSummary.changedRecords > 1 ? "First changed record" : "Sequence comparison";
    const preview = document.createElement("div");
    preview.className = "sequence-editor-change-preview";
    for (const [label, sequence] of [["Before", changeSummary.firstChange.beforePreview], ["After", changeSummary.firstChange.afterPreview]]) {
      const row = document.createElement("div");
      const labelElement = document.createElement("span");
      labelElement.className = "sequence-editor-preview-label";
      labelElement.textContent = label;
      const bases = document.createElement("pre");
      bases.setAttribute("aria-label", `${label} sequence`);
      bases.textContent = sequence || "";
      row.append(labelElement, bases);
      preview.append(row);
    }
    const help = document.createElement("p");
    help.className = "sequence-editor-comparison-help";
    help.textContent = "Changed bases are uppercase; | marks an empty segment.";
    comparison.append(heading, preview, help);
    container.append(comparison);
  }

  const effects = document.createElement("section");
  effects.className = "sequence-editor-change-section sequence-editor-change-effects";
  const effectsTitle = document.createElement("h5");
  effectsTitle.textContent = "Effects";
  effects.append(effectsTitle);
  function appendEffect(label, text) {
    const item = document.createElement("div");
    const heading = document.createElement("h6");
    heading.textContent = label;
    const note = document.createElement("p");
    note.className = "sequence-editor-frame-note";
    note.textContent = text;
    item.append(heading, note);
    effects.append(item);
  }
  if (changeSummary.changedRecords > 1) {
    appendEffect("Reading frame", "Multiple records changed; reset the comparison baseline after loading the intended sequence before interpreting reading-frame impact.");
  } else if (changeSummary.firstChange?.frameImpact) {
    appendEffect("Reading frame", changeSummary.firstChange.frameImpact);
  }

  if (changeSummary.firstChange?.restrictionImpact?.summary) {
    appendEffect("Restriction sites", changeSummary.firstChange.restrictionImpact.summary);
  }
  if (effects.childElementCount > 1) container.append(effects);
}

function renderSequenceEditorWorkspace(previousState = null) {
  if (!elements.markdownWorkspace) {
    return;
  }
  elements.markdownWorkspace._sms3VisualCleanup?.();
  elements.markdownWorkspace.textContent = "";

  const initialText = previousState?.text ?? state.selectedTool.example ?? "";
  const shell = document.createElement("div");
  shell.className = "sequence-editor-workspace-shell";

  const viewerPanel = document.createElement("section");
  viewerPanel.className = "sequence-editor-viewer-panel";
  const viewerHeader = document.createElement("div");
  viewerHeader.className = "sequence-editor-header";
  const headerText = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = "Sequence Editor";
  headerText.append(heading);
  const summary = document.createElement("p");
  summary.className = "sequence-editor-summary";
  viewerHeader.append(headerText, summary);

  const viewerContainer = document.createElement("div");
  viewerContainer.className = "sequence-editor-live-viewer";
  const viewerNavigation = document.createElement("div");
  viewerNavigation.className = "sequence-editor-viewer-navigation";

  const editorPanel = document.createElement("aside");
  editorPanel.className = "sequence-editor-settings";
  editorPanel.setAttribute("aria-label", "Sequence editor controls");
  const editorBody = document.createElement("div");
  editorBody.className = "sequence-editor-inspector-body";
  const appBody = document.createElement("div");
  appBody.className = "sequence-editor-app-body";

  const editor = document.createElement("textarea");
  editor.className = "sequence-editor-textarea";
  editor.value = initialText;
  editor.spellcheck = false;
  editor.wrap = "off";
  editor.dataset.sequenceEditorControl = "editor";

  const sourceDetails = document.createElement("details");
  sourceDetails.className = "sequence-editor-source-panel";
  const sourceSummary = document.createElement("summary");
  sourceSummary.textContent = "Raw sequence input";
  const sourceHelp = document.createElement("p");
  sourceHelp.className = "sequence-editor-source-help";
  sourceHelp.textContent = "Paste or edit DNA/RNA or FASTA here, then the viewer updates after cleaning the text. Use the viewer and Edit tab for coordinate edits.";
  sourceDetails.append(sourceSummary, sourceHelp, editor);

  const geneticCodeSelect = document.createElement("select");
  geneticCodeSelect.dataset.sequenceEditorControl = "geneticCode";
  for (const code of geneticCodes) {
    const option = document.createElement("option");
    option.value = code.id;
    option.textContent = `${code.id}. ${code.name}`;
    geneticCodeSelect.append(option);
  }
  geneticCodeSelect.value = previousState?.geneticCode || "1";

  const viewerLayoutSelect = document.createElement("select");
  viewerLayoutSelect.dataset.sequenceEditorControl = "viewerLayout";
  for (const [value, label] of [["linear", "Linear"], ["circular", "Circular"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    viewerLayoutSelect.append(option);
  }
  viewerLayoutSelect.value = previousState?.viewerLayout === "circular" ? "circular" : "linear";

  const filenameInput = document.createElement("input");
  filenameInput.type = "text";
  filenameInput.value = normalizeSequenceEditorFilename(previousState?.filename || "sequence-editor-cleaned.fasta");
  filenameInput.dataset.sequenceEditorControl = "filename";

  const lineWidthInput = document.createElement("input");
  lineWidthInput.type = "number";
  lineWidthInput.min = "20";
  lineWidthInput.max = "120";
  lineWidthInput.step = "5";
  lineWidthInput.value = String(Math.min(120, Math.max(20, Number.parseInt(previousState?.lineWidth, 10) || 60)));
  lineWidthInput.dataset.sequenceEditorControl = "lineWidth";

  const coordinatePanel = document.createElement("div");
  coordinatePanel.className = "sequence-editor-coordinate-panel";
  const coordinateHelp = document.createElement("p");
  coordinateHelp.className = "sequence-editor-coordinate-help";
  coordinateHelp.textContent = "Select in the viewer or enter 1-based, inclusive coordinates.";

  const coordinateStart = document.createElement("input");
  coordinateStart.type = "number";
  coordinateStart.min = "1";
  coordinateStart.step = "1";
  coordinateStart.value = "1";
  coordinateStart.dataset.sequenceEditorControl = "coordinateStart";

  const coordinateEnd = document.createElement("input");
  coordinateEnd.type = "number";
  coordinateEnd.min = "1";
  coordinateEnd.step = "1";
  coordinateEnd.value = "1";
  coordinateEnd.dataset.sequenceEditorControl = "coordinateEnd";

  const startField = createMarkdownWorkspaceField("Start", coordinateStart);
  const endField = createMarkdownWorkspaceField("End (inclusive)", coordinateEnd);
  const contextMenu = document.createElement("div");
  contextMenu.className = "sequence-editor-context-menu";
  contextMenu.hidden = true;
  contextMenu.setAttribute("role", "menu");
  coordinatePanel.append(startField, endField);
  const coordinateError = document.createElement("p");
  coordinateError.className = "sequence-editor-coordinate-error";
  coordinateError.setAttribute("role", "alert");
  coordinateError.hidden = true;

  const toolbar = document.createElement("div");
  toolbar.className = "sequence-editor-actions sequence-editor-toolbar";
  const documentActions = document.createElement("div");
  documentActions.className = "sequence-editor-toolbar-group sequence-editor-toolbar-group-actions";
  const historyActions = document.createElement("div");
  historyActions.className = "sequence-editor-toolbar-group sequence-editor-toolbar-group-history";
  const exportActions = document.createElement("div");
  exportActions.className = "sequence-editor-export-actions";
  const viewerActions = document.createElement("div");
  viewerActions.className = "sequence-editor-toolbar-group sequence-editor-toolbar-group-view";
  const cleanButton = createMarkdownWorkspaceButton("Clean");
  const reverseComplementButton = createMarkdownWorkspaceButton("Reverse complement");
  const undoButton = createMarkdownWorkspaceButton("Undo");
  const redoButton = createMarkdownWorkspaceButton("Redo");
  const copyButton = createMarkdownWorkspaceButton("Copy FASTA");
  const downloadButton = createMarkdownWorkspaceButton("Download FASTA");
  const exportOptions = document.createElement("div");
  exportOptions.className = "sequence-editor-export-options";
  const lineWidthField = createMarkdownWorkspaceField("Bases per line", lineWidthInput);
  lineWidthField.classList.add("sequence-editor-line-width-field");
  exportOptions.append(createMarkdownWorkspaceField("File name", filenameInput), lineWidthField);
  documentActions.append(cleanButton, reverseComplementButton);
  historyActions.append(undoButton, redoButton);
  exportActions.append(copyButton, downloadButton);
  viewerActions.append(
    createMarkdownWorkspaceField("Viewer", viewerLayoutSelect),
    createMarkdownWorkspaceField("Genetic code", geneticCodeSelect)
  );
  const sequenceActionsMenu = document.createElement("details");
  sequenceActionsMenu.className = "sequence-editor-sequence-actions";
  const sequenceActionsSummary = document.createElement("summary");
  sequenceActionsSummary.textContent = "Sequence actions";
  sequenceActionsMenu.append(sequenceActionsSummary, documentActions);
  const displayMenu = document.createElement("details");
  displayMenu.className = "sequence-editor-display-menu";
  const displaySummary = document.createElement("summary");
  displaySummary.textContent = "Display";
  const displayBody = document.createElement("div");
  displayBody.className = "sequence-editor-display-body";
  const viewerDisplayControls = document.createElement("div");
  viewerDisplayControls.className = "sequence-editor-viewer-display-controls dna-viewer-toolbar";
  displayBody.append(viewerActions, viewerDisplayControls);
  displayMenu.append(displaySummary, displayBody);
  toolbar.append(historyActions, sequenceActionsMenu, displayMenu);

  const status = document.createElement("p");
  status.className = "sequence-editor-status";
  const changePanel = document.createElement("section");
  changePanel.className = "sequence-editor-change-panel";
  const changeStatusShell = document.createElement("section");
  changeStatusShell.className = "sequence-editor-change-shell";
  const baselineButton = createMarkdownWorkspaceButton("Set current as baseline");
  baselineButton.className = "sequence-editor-baseline-button";

  const selectionPanel = document.createElement("section");
  selectionPanel.className = "sequence-editor-selection-panel";
  const selectionTitle = document.createElement("h4");
  selectionTitle.textContent = "Selection details";
  const selectionBody = document.createElement("div");
  selectionBody.className = "sequence-editor-selection-body";
  selectionPanel.append(selectionTitle, selectionBody);
  const selectionActions = document.createElement("div");
  selectionActions.className = "sequence-editor-selection-actions";

  const rangePanel = document.createElement("section");
  rangePanel.className = "sequence-editor-range-panel";
  const rangeTitle = document.createElement("h4");
  rangeTitle.textContent = "Range selection";
  const rangeHelp = document.createElement("p");
  rangeHelp.className = "sequence-editor-range-help";
  rangeHelp.textContent =
    "Add two anchors from clicked viewer items to define an interval. Once both anchors are set, this range becomes the edit target for the buttons below.";
  const rangeBody = document.createElement("div");
  rangeBody.className = "sequence-editor-range-body";
  rangePanel.append(rangeTitle, rangeHelp, rangeBody);

  const quickEditPanel = document.createElement("section");
  quickEditPanel.className = "sequence-editor-quick-edit-panel";
  const quickEditTitle = document.createElement("h4");
  quickEditTitle.textContent = "Edit selected target";
  const quickTargetSummary = document.createElement("div");
  quickTargetSummary.className = "sequence-editor-quick-target";
  const quickSequenceInput = document.createElement("textarea");
  quickSequenceInput.className = "sequence-editor-quick-sequence";
  quickSequenceInput.rows = 2;
  quickSequenceInput.spellcheck = false;
  quickSequenceInput.wrap = "off";
  quickSequenceInput.placeholder = "Bases to insert or replace";
  quickSequenceInput.dataset.sequenceEditorControl = "quickSequence";
  const replaceSelectionButton = createMarkdownWorkspaceButton("Replace");
  const insertBeforeButton = createMarkdownWorkspaceButton("Insert before");
  const insertAfterButton = createMarkdownWorkspaceButton("Insert after");
  const deleteSelectionButton = createMarkdownWorkspaceButton("Delete");
  const reverseSelectionButton = createMarkdownWorkspaceButton("Reverse complement");
  const quickEditActions = document.createElement("div");
  quickEditActions.className = "sequence-editor-quick-actions";
  quickEditActions.append(
    replaceSelectionButton,
    insertBeforeButton,
    insertAfterButton,
    deleteSelectionButton,
    reverseSelectionButton
  );
  rangePanel.classList.add("sequence-editor-range-panel-inline");
  quickEditPanel.append(quickEditTitle, coordinatePanel, coordinateHelp, coordinateError, quickTargetSummary, selectionActions, rangePanel,
    createMarkdownWorkspaceField("New bases", quickSequenceInput));

  const effectsPanel = document.createElement("section");
  effectsPanel.className = "sequence-editor-effects-panel";
  const effectsTitle = document.createElement("h4");
  effectsTitle.textContent = "Effects / warnings";
  const effectsBody = document.createElement("div");
  effectsBody.className = "sequence-editor-effects-body";
  effectsPanel.append(effectsTitle, effectsBody);
  quickEditPanel.append(effectsPanel, quickEditActions);

  const baselineActions = document.createElement("section");
  baselineActions.className = "sequence-editor-baseline-actions";
  const baselineTitle = document.createElement("h4");
  baselineTitle.textContent = "Comparison baseline";
  const baselineHelp = document.createElement("p");
  baselineHelp.textContent = "Compare future changes against the current sequence.";
  baselineActions.append(baselineTitle, baselineHelp, baselineButton);
  changeStatusShell.append(changePanel, baselineActions);
  const editPanel = document.createElement("div");
  editPanel.className = "sequence-editor-tab-panel";
  editPanel.append(quickEditPanel, selectionPanel);
  const changesPanel = document.createElement("div");
  changesPanel.className = "sequence-editor-tab-panel";
  const historyDetails = document.createElement("details");
  historyDetails.className = "sequence-editor-history";
  const historySummary = document.createElement("summary");
  historySummary.textContent = "History";
  const historyList = document.createElement("ol");
  historyDetails.append(historySummary, historyList);
  changesPanel.append(changeStatusShell, historyDetails);
  const exportPanel = document.createElement("div");
  exportPanel.className = "sequence-editor-tab-panel sequence-editor-export-panel";
  const exportScope = document.createElement("select");
  exportScope.setAttribute("aria-label", "Sequence export");
  for (const [value, label] of [["whole", "Whole sequence"], ["selection", "Selected bases"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    exportScope.append(option);
  }
  const sequenceExports = document.createElement("section");
  sequenceExports.className = "sequence-editor-sequence-exports";
  const scopeField = createMarkdownWorkspaceField("Sequence export", exportScope);
  scopeField.classList.add("sequence-editor-export-scope");
  sequenceExports.append(scopeField, exportOptions, exportActions);
  const figureExports = document.createElement("section");
  figureExports.className = "sequence-editor-figure-exports";
  const figureTitle = document.createElement("h4");
  figureTitle.textContent = "Figure";
  const figureDescription = document.createElement("p");
  figureDescription.textContent = "Current view";
  const figureButtons = document.createElement("div");
  figureButtons.className = "sequence-editor-figure-buttons";
  figureExports.append(figureTitle, figureDescription, figureButtons);
  const documentExports = document.createElement("section");
  documentExports.className = "sequence-editor-document-exports";
  const documentTitle = document.createElement("h4");
  documentTitle.textContent = "Continue editing";
  const documentDescription = document.createElement("p");
  documentDescription.textContent = "Reopen your sequence, annotations and settings in SMS3.";
  documentExports.append(documentTitle, documentDescription);
  exportPanel.append(sequenceExports, figureExports, documentExports);
  const inspectorTabs = createEditorPanelTabs("Sequence editor controls", [
    { id: "edit", label: "Edit", panel: editPanel },
    { id: "changes", label: "Changes", panel: changesPanel },
    { id: "export", label: "Export", panel: exportPanel }
  ]);
  editorBody.append(editPanel, changesPanel, exportPanel);
  editorPanel.append(inspectorTabs.element, editorBody);
  const viewRegion = document.createElement("details");
  viewRegion.className = "sequence-editor-view-region";
  const viewRegionSummary = document.createElement("summary");
  viewRegionSummary.textContent = "View region";
  viewRegion.append(viewRegionSummary, viewerNavigation);
  viewerPanel.append(viewerHeader, toolbar, viewRegion, viewerContainer, sourceDetails);
  appBody.append(viewerPanel, editorPanel);
  shell.append(appBody, status, contextMenu);
  elements.markdownWorkspace.append(shell);

  let prepared = null;
  let preparedIsDirty = false;
  let lastDocumentSnapshot = null;
  let manualEditGroup = false;
  let debounceTimer = null;
  let baselineText = previousState?.baselineText ?? initialText;
  let undoStack = [];
  let redoStack = [];
  let featureTrackOverrides = cloneSequenceEditorFeatureOverrides(previousState?.featureTrackOverrides);
  let viewerSelection = null;
  let activeViewerSequence = null;
  let renderedViewerLayout = viewerLayoutSelect.value;
  const viewerStates = new Map();
  let lastInspectorSelectionKey = "";
  let selectViewerCoordinates = null;
  let coordinateDraftInvalid = false;
  function setEditorStatus(message) {
    status.textContent = message;
  }
  function updateHistoryButtons() {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
    historyList.replaceChildren();
    for (const item of undoStack.slice(-20)) {
      const li = document.createElement("li");
      li.textContent = item.label || "Edit";
      historyList.append(li);
    }
    if (!undoStack.length) {
      const li = document.createElement("li");
      li.textContent = "No edits yet";
      historyList.append(li);
    }
  }
  function snapshotEditorState(label) {
    return {
      label,
      text: editor.value,
      baselineText,
      geneticCode: geneticCodeSelect.value,
      viewerLayout: viewerLayoutSelect.value,
      filename: filenameInput.value,
      lineWidth: lineWidthInput.value,
      featureTrackOverrides: cloneSequenceEditorFeatureOverrides(featureTrackOverrides)
    };
  }
  function restoreEditorState(snapshot, statusMessage) {
    if (!snapshot) return;
    editor.value = snapshot.text || "";
    baselineText = snapshot.baselineText ?? editor.value;
    featureTrackOverrides = cloneSequenceEditorFeatureOverrides(snapshot.featureTrackOverrides);
    geneticCodeSelect.value = snapshot.geneticCode || geneticCodeSelect.value;
    viewerLayoutSelect.value = snapshot.viewerLayout === "circular" ? "circular" : "linear";
    filenameInput.value = normalizeSequenceEditorFilename(snapshot.filename || filenameInput.value);
    lineWidthInput.value = snapshot.lineWidth || lineWidthInput.value;
    clearTimeout(debounceTimer);
    redrawViewer();
    setEditorStatus(statusMessage);
  }
  function pushUndoState(label, snapshot = snapshotEditorState(label)) {
    manualEditGroup = false;
    undoStack.push({...snapshot, label});
    if (undoStack.length > 50) {
      undoStack = undoStack.slice(-50);
    }
    redoStack = [];
    updateHistoryButtons();
  }
  function updateHiddenInput() {
    elements.sequenceInput.value = editor.value;
    elements.sequenceInput.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function getLineWidth() {
    return Math.min(120, Math.max(20, Number.parseInt(lineWidthInput.value, 10) || 60));
  }
  function translateSequenceEditorCodon(codon) {
    const normalized = String(codon || "").toUpperCase().replaceAll("U", "T");
    const match = getCodonsForCode(geneticCodeSelect.value).find((item) => item.codon === normalized);
    return match?.aa || "X";
  }
  function cleanQuickEditSequence() {
    return cleanDnaRnaSequence(quickSequenceInput.value, {
      preserveCase: false,
      keepGaps: false
    });
  }
  function getSelectionRecord(recordIndex) {
    const index = Math.max(0, Number(recordIndex) || 0);
    return getPrepared()?.records?.[index] || null;
  }
  function getDirectEditorSelection(selection = viewerSelection) {
    return getSequenceEditorDirectSelection(selection);
  }
  function getRangeEditorSelection(selection = viewerSelection) {
    return getSequenceEditorRangeSelection(selection);
  }
  function getActiveEditorSelection(selection = viewerSelection) {
    return getActiveSequenceEditorSelection(selection);
  }
  function getBaseCodonContext(active) {
    if (!active || active.kind !== "base") return null;
    return getCodonContextForPosition(active.recordIndex, active.start);
  }
  function getCodonContextForPosition(recordIndex, position, replacementBase = "") {
    const record = getSelectionRecord(recordIndex);
    const coordinate = Number(position);
    if (!record || !Number.isFinite(coordinate)) return null;
    const codonStart = coordinate - ((coordinate - 1) % 3);
    const codon = record.sequence.slice(codonStart - 1, codonStart + 2);
    if (codon.length !== 3) return null;
    const offset = coordinate - codonStart;
    const normalizedReplacement = String(replacementBase || "").toUpperCase().replace(/[^ACGT]/g, "");
    const afterCodon = normalizedReplacement.length === 1
      ? codon.slice(0, offset) + normalizedReplacement + codon.slice(offset + 1)
      : "";
    return {
      codonStart,
      codonEnd: codonStart + 2,
      codon,
      aminoAcid: translateSequenceEditorCodon(codon),
      offset,
      afterCodon,
      afterAminoAcid: afterCodon ? translateSequenceEditorCodon(afterCodon) : ""
    };
  }
  function appendInspectorRows(container, rows) {
    const list = document.createElement("dl");
    list.className = "sequence-editor-inspector-rows";
    for (const [label, value] of rows) {
      if (value === undefined || value === null || value === "") continue;
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      list.append(dt, dd);
    }
    container.append(list);
  }
  function setQuickEditButtonsEnabled(active) {
    const capabilities = getSequenceEditorQuickEditCapabilities(active);
    if (!active) {
      quickEditTitle.textContent = "Edit selected target";
    } else if (active.kind === "range") {
      quickEditTitle.textContent = "Edit range";
    } else if (active.kind === "base") {
      quickEditTitle.textContent = "Edit base";
    } else if (active.kind === "codon") {
      quickEditTitle.textContent = "Edit codon";
    } else if (active.kind === "feature") {
      quickEditTitle.textContent = "Edit feature interval";
    } else if (active.kind === "site") {
      quickEditTitle.textContent = "Restriction site selected";
    } else {
      quickEditTitle.textContent = "Edit selected target";
    }
    quickTargetSummary.textContent = describeSequenceEditorEditTarget(active);
    quickSequenceInput.disabled = !prepared?.records?.length;
    quickSequenceInput.placeholder = !active
      ? "Type bases, then choose a target"
      : active.wraps
        ? "Split origin-spanning ranges before editing"
        : capabilities.canEditSequence
          ? "Type bases to insert or replace"
          : "Selection is not directly editable";
    replaceSelectionButton.disabled = !capabilities.canEditSequence;
    insertBeforeButton.disabled = !capabilities.canEditSequence;
    insertAfterButton.disabled = !capabilities.canEditSequence;
    deleteSelectionButton.disabled = !capabilities.canEditSequence;
    reverseSelectionButton.hidden = !capabilities.canReverseComplement;
    reverseSelectionButton.disabled = !capabilities.canReverseComplement;
    exportScope.querySelector('[value="selection"]').disabled = !capabilities.canExport;
    updateExportScope();
    if (coordinateDraftInvalid) {
      for (const button of [replaceSelectionButton, insertBeforeButton, insertAfterButton, deleteSelectionButton, reverseSelectionButton]) button.disabled = true;
    }
  }
  function renderSelectionEffects(active = getActiveEditorSelection()) {
    effectsBody.textContent = "";
    if (!active) {
      const empty = document.createElement("p");
      empty.textContent = "Select a base, codon, feature, site, or range to preview edit effects.";
      effectsBody.append(empty);
      return;
    }
    const cleaned = cleanQuickEditSequence();
    const capabilities = getSequenceEditorQuickEditCapabilities(active);
    const items = [];
    items.push(`Current target length: ${active.length.toLocaleString()} bp.`);
    if (active.wraps) {
      items.push("This circular range wraps the origin; split it into two edits before applying coordinate changes.");
    }
    if (cleaned.removedCount > 0) {
      items.push(`Typed edit text contains ${cleaned.removedCount.toLocaleString()} non-DNA/RNA character(s) that will be removed.`);
    }
    if (!capabilities.canEditSequence) {
      items.push(capabilities.reason);
      if (capabilities.canCopy) {
        items.push("Copy and export use the selected sequence shown above.");
      }
    } else if (cleaned.sequence) {
      const delta = cleaned.sequence.length - active.length;
      items.push(`Replacing the selection with the typed sequence would change length by ${delta > 0 ? "+" : ""}${delta.toLocaleString()} bp.`);
      if (delta !== 0) {
        items.push(Math.abs(delta) % 3 === 0
          ? "Length change is divisible by 3; coding regions spanning the edit may stay in frame."
          : "Length change is not divisible by 3; coding regions spanning the edit would shift reading frame.");
      }
      if (active.kind === "codon" && active.length === 3 && cleaned.sequence.length === 3) {
        const beforeAa = active.target?.aminoAcid || translateSequenceEditorCodon(active.selectedSequence);
        const afterAa = translateSequenceEditorCodon(cleaned.sequence);
        items.push(`Codon replacement preview: ${active.selectedSequence.toUpperCase()} (${beforeAa}) -> ${cleaned.sequence} (${afterAa}).`);
      }
      const baseContext = getBaseCodonContext(active);
      if (baseContext && cleaned.sequence.length === 1) {
        const codon = baseContext.codon.split("");
        codon[baseContext.offset] = cleaned.sequence;
        const afterCodon = codon.join("");
        items.push(`Base replacement codon preview: ${baseContext.codon} (${baseContext.aminoAcid}) -> ${afterCodon} (${translateSequenceEditorCodon(afterCodon)}).`);
      }
    } else {
      items.push(active.length === 1
        ? "Type bases above to preview replace or insert effects; delete does not need typed sequence."
        : "Type bases above to preview replace or insert effects; delete and reverse complement do not need typed sequence.");
    }
    const list = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    }
    effectsBody.append(list);
  }
  function runViewerSelectionAction(action, statusMessage = "") {
    if (typeof action !== "function") return;
    const result = action();
    if (statusMessage) {
      setEditorStatus(statusMessage);
    }
    return result;
  }
  function renderSelectionActionButton(container, label, action, statusMessage = "") {
    if (typeof action !== "function") return;
    const button = createMarkdownWorkspaceButton(label);
    button.addEventListener("click", async () => {
      try {
        const result = await runViewerSelectionAction(action, statusMessage);
        if (label.startsWith("Copy ") && result !== false) showCopiedFeedback(button);
      } catch (error) {
        setEditorStatus(label.startsWith("Copy ") ? "Copy unavailable." : error?.message || "Action unavailable.");
      }
    });
    container.append(button);
  }
  function setActiveRangeAsEditTarget(selection = viewerSelection) {
    if (!selection?.currentRange?.ready) {
      setEditorStatus("Complete the active range before using it as the edit target.");
      return;
    }
    viewerSelection = { ...selection, preferredSelection: "range" };
    applyViewerSelectionToCoordinateControls(viewerSelection, { silent: true });
    renderSelectionInspector(viewerSelection);
    setEditorStatus(`Editing range ${selection.currentRange.label}. Use the edit buttons in the selected-target panel.`);
  }
  function renderRangeInspector(selection = viewerSelection) {
    rangeBody.textContent = "";
    const range = selection?.currentRange;
    const actions = selection?.actions || {};
    rangePanel.hidden = !range?.anchors?.length;
    if (!range?.anchors?.length) {
      const empty = document.createElement("p");
      empty.className = "sequence-editor-range-empty";
      empty.textContent = "No range yet. Click two bases, residues, or amino acids in the viewer.";
      rangeBody.append(empty);
      return;
    }

    const rows = [];
    for (const [index, anchor] of range.anchors.entries()) {
      const position = Number(anchor?.position);
      rows.push([
        `Anchor ${index + 1}`,
        `${Number.isFinite(position) ? position.toLocaleString() : ""}${anchor?.label ? ` (${anchor.label})` : ""}`.trim()
      ]);
    }
    if (range.ready) {
      rows.push(["Forward range", range.label]);
      rows.push(["Length", `${Number(range.length).toLocaleString()} bp`]);
      rows.push(["Wraps origin", range.wraps ? "yes" : "no"]);
      rows.push(["Current target", "Range is active"]);
    } else {
      rows.push(["Next step", "Click another base, residue, or amino acid to set the second anchor."]);
    }
    appendInspectorRows(rangeBody, rows);
    if (range.ready) {
      const note = document.createElement("p");
      note.className = "sequence-editor-range-active-note";
      note.textContent = "The edit buttons below apply to this range until you clear it.";
      rangeBody.append(note);
    }

    const buttons = document.createElement("div");
    buttons.className = "sequence-editor-range-actions";
    renderSelectionActionButton(buttons, "Clear range", actions.clearRange, "Cleared range selection.");
    if (range.ready) {
      renderSelectionActionButton(buttons, "Copy coordinates", actions.copyRangeCoordinates);
      renderSelectionActionButton(buttons, "Copy sequence", actions.copyRangeSequence);
      renderSelectionActionButton(buttons, "Copy reverse complement", actions.copyRangeReverseComplement);
      renderSelectionActionButton(buttons, "Zoom to range", actions.zoomToRange);
      if (range.canSwap) {
        renderSelectionActionButton(buttons, range.oppositePath ? "Use direct path" : "Use opposite path", actions.swapRange);
      }
    }
    if (buttons.childElementCount > 0) {
      rangeBody.append(buttons);
    }
  }
  function renderSelectionInspector(selection = viewerSelection) {
    renderRangeInspector(selection);
    const active = getActiveEditorSelection(selection);
    const selectedItem = getDirectEditorSelection(selection);
    if (active?.kind === "range") {
      rangePanel.dataset.editTarget = "true";
    } else {
      delete rangePanel.dataset.editTarget;
    }
    quickEditPanel.dataset.editTargetKind = active?.kind || "none";
    selectionPanel.dataset.selectedKind = selectedItem?.kind || "none";
    const nextKey = getSequenceEditorSelectionKey(active);
    if (nextKey !== lastInspectorSelectionKey) {
      quickSequenceInput.value = "";
      lastInspectorSelectionKey = nextKey;
    }
    selectionBody.textContent = "";
    selectionActions.replaceChildren();
    setQuickEditButtonsEnabled(active);
    if (!selectedItem) {
      const empty = document.createElement("p");
      empty.className = "sequence-editor-selection-empty";
      empty.textContent = active?.kind === "range"
        ? "Range is active. Click another viewer item to inspect it here, or clear the range to edit clicked items directly."
        : "Click a base, codon, feature, or restriction site. Two sequence-symbol clicks create a range automatically.";
      selectionBody.append(empty);
      renderSelectionEffects(active);
      return;
    }
    const activeTitle = document.createElement("p");
    activeTitle.className = "sequence-editor-selected-title";
    const coordinates = selectedItem.start === selectedItem.end
      ? selectedItem.start.toLocaleString()
      : `${selectedItem.start.toLocaleString()}-${selectedItem.end.toLocaleString()}`;
    const activeKindLabel = selectedItem.kind === "base"
      ? "Base"
      : selectedItem.kind === "codon"
        ? "Codon"
        : selectedItem.kind === "site"
          ? "Restriction site"
          : selectedItem.kind === "range"
            ? "Range"
            : "Feature";
    activeTitle.textContent = `${activeKindLabel}: ${selectedItem.label}`;
    selectionBody.append(activeTitle);
    appendInspectorRows(selectionBody, [
      ["Record", selectedItem.recordTitle || String(selectedItem.recordIndex + 1)],
      ["Coordinates", selectedItem.wraps ? `${coordinates} (wraps origin)` : coordinates],
      ["Length", `${selectedItem.length.toLocaleString()} bp`],
      ["Strand", selectedItem.target?.strand],
      ["Current base", selectedItem.kind === "base" ? selectedItem.target?.base || selectedItem.selectedSequence : ""],
      ["Codon", selectedItem.kind === "codon" ? `${selectedItem.target?.codon || selectedItem.selectedSequence} -> ${selectedItem.target?.aminoAcid || translateSequenceEditorCodon(selectedItem.selectedSequence)}` : ""],
      ["Sequence", shortSequencePreview(selectedItem.selectedSequence)]
    ]);
    const actionRow = document.createElement("div");
    actionRow.className = "sequence-editor-selection-actions";
    if (selectedItem.target) {
      renderSelectionActionButton(
        actionRow,
        "Zoom to selection",
        () => selection?.actions?.zoomToTarget?.(selectedItem.target)
      );
    }
    if (actionRow.childElementCount > 0) {
      selectionActions.append(...actionRow.childNodes);
    }
    if (selectedItem.kind === "site") {
      const note = document.createElement("p");
      note.className = "sequence-editor-target-note";
      note.textContent =
        "Restriction sites mark recognition/cut positions. Copy/export uses the recognition sequence; select nearby bases, a feature interval, or a range before editing sequence.";
      selectionBody.append(note);
    }
    const baseContext = getBaseCodonContext(selectedItem);
    if (baseContext) {
      appendInspectorRows(selectionBody, [
        ["Codon context", `${baseContext.codonStart}-${baseContext.codonEnd}: ${baseContext.codon} -> ${baseContext.aminoAcid}`]
      ]);
    }
    if (selectedItem.kind === "codon") {
      const aminoAcid = selectedItem.target?.aminoAcid || translateSequenceEditorCodon(selectedItem.selectedSequence);
      const synonyms = getCodonsForCode(geneticCodeSelect.value)
        .filter((item) => item.aa === aminoAcid)
        .map((item) => item.codon)
        .join(", ");
      appendInspectorRows(selectionBody, [["Synonymous codons", synonyms]]);
    }
    renderSelectionEffects(active);
  }
  function commitCoordinateTarget() {
    const record = getSelectionRecord(activeViewerSequence?.index ?? 0);
    const start = Number(coordinateStart.value);
    const end = Number(coordinateEnd.value);
    if (!record || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > record.sequence.length) {
      coordinateDraftInvalid = true;
      coordinateError.hidden = false;
      coordinateError.textContent = `Enter a start and end within 1-${record?.sequence.length || 1}, with start no greater than end.`;
      setQuickEditButtonsEnabled(getActiveEditorSelection());
      return false;
    }
    coordinateDraftInvalid = false;
    coordinateError.hidden = true;
    const active = getActiveEditorSelection();
    if (active && active.start === start && active.end === end && !active.wraps) {
      setQuickEditButtonsEnabled(active);
      return true;
    }
    const draft = quickSequenceInput.value;
    const applied = selectViewerCoordinates?.(start, end) === true;
    quickSequenceInput.value = draft;
    renderSelectionEffects();
    return applied;
  }
  function describeViewerSelection(selection) {
    const active = getActiveEditorSelection(selection);
    if (!active) {
      return "Select a base, codon, feature, restriction site, or range to prefill the exact coordinate editor.";
    }
    const coordinates = Number.isFinite(active.start) && Number.isFinite(active.end)
      ? active.start === active.end ? active.start.toLocaleString() : `${active.start.toLocaleString()}-${active.end.toLocaleString()}`
      : "";
    return active.kind === "range"
      ? `Range target ${coordinates || active.label}.`
      : `Clicked item ${active.label}${coordinates ? ` (${coordinates})` : ""}.`;
  }
  function describeViewerSelectionStatus(selection) {
    const active = getActiveEditorSelection(selection);
    if (!active) return "";
    const coordinates = Number.isFinite(active.start) && Number.isFinite(active.end)
      ? active.start === active.end
        ? active.start.toLocaleString()
        : `${active.start.toLocaleString()}-${active.end.toLocaleString()}`
      : "";
    const kindLabel = active.kind === "range"
      ? "range"
      : active.kind === "base"
        ? "base"
        : active.kind === "codon"
          ? "codon"
          : active.kind === "site"
            ? "restriction site"
            : "feature interval";
    const coordinateText = coordinates ? ` at ${coordinates}` : "";
    const editText = getSequenceEditorQuickEditCapabilities(active).canEditSequence
      ? " Edit controls are ready."
      : " Details are shown in the selection panel.";
    return `Selected ${kindLabel} ${active.label}${coordinateText}.${editText}`;
  }
  function updateViewerSelectionState(selection) {
    coordinateDraftInvalid = false;
    coordinateError.hidden = true;
    viewerSelection = selection?.target || selection?.currentRange?.anchors?.length || selection?.currentRange?.ready ? selection : null;
    if (viewerSelection) {
      applyViewerSelectionToCoordinateControls(viewerSelection, { silent: true });
      const statusMessage = describeViewerSelectionStatus(viewerSelection);
      if (statusMessage) {
        setEditorStatus(statusMessage);
      }
    }
    renderSelectionInspector(viewerSelection);
  }
  function applyViewerSelectionToCoordinateControls(selection = viewerSelection, options = {}) {
    const active = getActiveEditorSelection(selection);
    if (!active) {
      if (!options.silent) setEditorStatus("Select a viewer item before using its coordinates.");
      if (!options.silent) updateViewerSelectionState(null);
      return false;
    }
    viewerSelection = selection;
    const start = Math.max(1, Math.floor(Number(active.start)));
    const end = Math.max(1, Math.ceil(Number(active.end)));
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      if (!options.silent) setEditorStatus("The selected viewer item does not have editable coordinates.");
      return false;
    }
    if (active.wraps || start > end) {
      if (!options.silent) setEditorStatus("The selected circular range wraps the origin; split it into two coordinate edits for now.");
      return false;
    }
    const rangeStart = Math.min(start, end);
    const rangeEnd = Math.max(start, end);
    coordinateStart.value = String(rangeStart);
    coordinateEnd.value = String(rangeEnd);
    coordinateStart.max = String(getSelectionRecord(active.recordIndex)?.sequence.length || rangeEnd);
    coordinateEnd.max = coordinateStart.max;
    if (!options.silent) setEditorStatus(`${describeViewerSelection(selection)} Filled coordinate edit fields.`);
    return true;
  }
  function hideSequenceEditorContextMenu() {
    contextMenu.hidden = true;
    contextMenu.textContent = "";
  }
  function addContextMenuButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (label.startsWith("Copy ")) {
        try {
          if (await handler() !== false) {
            showCopiedFeedback(button);
            setTimeout(() => {
              if (contextMenu.contains(button)) hideSequenceEditorContextMenu();
            }, 2200);
            return;
          }
        } catch {
          setEditorStatus("Copy unavailable.");
        }
      } else {
        handler();
      }
      hideSequenceEditorContextMenu();
    });
    contextMenu.append(button);
  }
  function prepareContextEdit(selection, operation) {
    const active = getDirectEditorSelection(selection) || getActiveEditorSelection(selection);
    const capabilities = getSequenceEditorQuickEditCapabilities(active);
    if (!capabilities.canEditSequence) {
      setEditorStatus(capabilities.reason || "Select bases or a range before editing sequence.");
      return false;
    }
    if (operation === "reverse-complement-range" && !capabilities.canReverseComplement) {
      setEditorStatus("Select a range of two or more bases to reverse-complement.");
      return false;
    }
    inspectorTabs.select("edit");
    return applyViewerSelectionToCoordinateControls(selection);
  }
  function applyCoordinateEdit(operation, active, sequence = "", statusPrefix = "") {
    const insertAfter = operation === "insert-before" ? active.start - 1 : active.end;
    const inserting = operation === "insert-before" || operation === "insert-after";
    const editedStart = inserting ? insertAfter + 1 : active.start;
    const editedLength = operation === "delete-range" ? 1
      : operation === "reverse-complement-range" ? active.end - active.start + 1
      : sequence.length;
    clearTimeout(debounceTimer);
    pushUndoState("coordinate edit");
    const editResult = applySequenceEditorCoordinateEdit(editor.value, {
      operation: inserting ? "insert-after" : operation,
      recordNumber: active.recordIndex + 1,
      insertAfter,
      start: active.start,
      end: active.end,
      editSequence: sequence,
      lineWidth: getLineWidth(),
      featureTrackOverrides
    });
    if (editResult.edit?.applied && editResult.fasta) {
      featureTrackOverrides = makeSequenceEditorFeatureTrackOverrides(editResult.records);
      editor.value = editResult.fasta;
    } else {
      undoStack.pop();
      updateHistoryButtons();
    }
    clearTimeout(debounceTimer);
    redrawViewer();
    if (editResult.edit?.applied) {
      const length = getSelectionRecord(activeViewerSequence?.index ?? 0)?.sequence.length || 0;
      if (length) {
        const start = Math.max(1, Math.min(length, editedStart));
        selectViewerCoordinates?.(start, Math.min(length, start + Math.max(1, editedLength) - 1));
      }
    }
    const featureText = editResult.edit.featureUpdateSummary ? ` Features: ${editResult.edit.featureUpdateSummary}.` : "";
    const warningText = editResult.warnings.length > 0 ? ` ${editResult.warnings[0]}` : "";
    setEditorStatus(`${statusPrefix}${editResult.edit.summary}${featureText}${warningText}`);
  }
  function applyInspectorEdit(operation) {
    if (!commitCoordinateTarget()) return;
    const active = getActiveEditorSelection();
    if (!active) {
      setEditorStatus("Select a base, codon, feature, site, or range before applying an edit.");
      return false;
    }
    const capabilities = getSequenceEditorQuickEditCapabilities(active);
    if (!capabilities.canEditSequence) {
      setEditorStatus(capabilities.reason || "Select bases or a range before editing sequence.");
      return false;
    }
    if (operation === "reverse-complement-range" && !capabilities.canReverseComplement) {
      setEditorStatus("Select a range of two or more bases to reverse-complement.");
      return false;
    }
    const cleaned = cleanQuickEditSequence();
    const needsSequence = operation === "replace-range" || operation === "insert-before" || operation === "insert-after";
    if (needsSequence && !cleaned.sequence) {
      setEditorStatus("Type bases in the edit field before inserting or replacing sequence.");
      return false;
    }
    applyCoordinateEdit(operation, active, cleaned.sequence, "Applied from selection: ");
  }
  function applyContextEditNow(selection, operation) {
    if (!prepareContextEdit(selection, operation)) {
      return;
    }
    applyCoordinateEdit(operation, getDirectEditorSelection(selection) || getActiveEditorSelection(selection), "", "Applied from viewer selection: ");
  }
  async function copyContextSelection(selection) {
    const text = selection?.selectedSequence || "";
    if (!text) {
      setEditorStatus("The selected viewer item does not have copyable sequence.");
      return false;
    }
    await navigator.clipboard.writeText(text);
    setEditorStatus(`Copied ${text.length.toLocaleString()} selected base${text.length === 1 ? "" : "s"}.`);
    return true;
  }
  function showSequenceEditorContextMenu(selection) {
    if (!selection?.target || !selection?.range) return;
    updateViewerSelectionState(selection);
    const active = getDirectEditorSelection(selection) || getActiveEditorSelection(selection);
    const capabilities = getSequenceEditorQuickEditCapabilities(active);
    contextMenu.textContent = "";
    const title = document.createElement("div");
    title.className = "sequence-editor-context-title";
    title.textContent = active
      ? `Clicked ${active.label}${Number.isFinite(active.start) ? ` (${active.start === active.end ? active.start.toLocaleString() : `${active.start.toLocaleString()}-${active.end.toLocaleString()}`})` : ""}.`
      : describeViewerSelection(selection);
    contextMenu.append(title);
    addContextMenuButton("Edit selected coordinates", () => { inspectorTabs.select("edit"); applyViewerSelectionToCoordinateControls(selection); });
    if (capabilities.canEditSequence) {
      addContextMenuButton("Prepare insert after", () => prepareContextEdit(selection, "insert-after"));
      addContextMenuButton("Prepare replace", () => prepareContextEdit(selection, "replace-range"));
      addContextMenuButton("Prepare delete", () => prepareContextEdit(selection, "delete-range"));
      addContextMenuButton("Delete selection now", () => applyContextEditNow(selection, "delete-range"));
    }
    if (capabilities.canReverseComplement) {
      addContextMenuButton("Prepare reverse complement", () => prepareContextEdit(selection, "reverse-complement-range"));
      addContextMenuButton("Reverse-complement selection now", () => applyContextEditNow(selection, "reverse-complement-range"));
    }
    if (capabilities.canCopy) {
      addContextMenuButton("Copy selected sequence", () => copyContextSelection(selection));
    }
    const x = Math.max(12, Math.min(window.innerWidth - 260, Number(selection.clientX) || 12));
    const y = Math.max(12, Math.min(window.innerHeight - 260, Number(selection.clientY) || 12));
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.hidden = false;
  }
  function viewerStateKey(selection, layout = renderedViewerLayout) {
    return selection ? `${layout}:${selection.sequenceKey}` : "";
  }
  function captureActiveViewerState() {
    if (!activeViewerSequence) return;
    const snapshot = renderedViewerLayout === "circular"
      ? snapshotRenderedCircularDnaViewer(viewerContainer)[0]
      : snapshotRenderedDnaViewer(viewerContainer)[0];
    if (snapshot) viewerStates.set(viewerStateKey(activeViewerSequence), snapshot);
  }
  function cleanupEditorViewer() {
    selectViewerCoordinates = null;
    cleanupRenderedDnaViewer(viewerContainer);
    cleanupRenderedCircularDnaViewer(viewerContainer);
  }
  function remapViewerSelectionRecord(payload, recordIndex) {
    return payload ? { ...payload, recordIndex } : payload;
  }
  function initialEditorViewerSelection(viewer) {
    const sequences = normalizeViewerSequenceChoices(viewer);
    if (sequences.length === 0) return null;
    const requestedKey = sequences.some((sequence) => sequence.key === activeViewerSequence?.sequenceKey)
      ? activeViewerSequence.sequenceKey
      : sequences[0].key;
    const requestedSequence = sequences.find((sequence) => sequence.key === requestedKey) ?? sequences[0];
    const initialSpan = Math.max(0, Math.floor(Number(previousState?.__initialViewerSpan) || 0));
    const useInitialSpan = !activeViewerSequence && initialSpan > 0;
    const requested = {
      sequenceKey: requestedKey,
      start: activeViewerSequence?.startBlank === false ? activeViewerSequence.start : useInitialSpan ? 1 : "",
      end: activeViewerSequence?.endBlank === false
        ? activeViewerSequence.end
        : useInitialSpan ? Math.min(requestedSequence.length, initialSpan) : ""
    };
    return validateViewerSequenceRegionRequest(requested, sequences).selection
      ?? validateViewerSequenceRegionRequest({ sequenceKey: requestedKey, start: "", end: "" }, sequences).selection;
  }
  function showEditorViewerSequence(selection, { preserveExistingView = false, captureCurrent = true } = {}) {
    if (!prepared?.viewer || !selection) return;
    if (captureCurrent) captureActiveViewerState();
    activeViewerSequence = selection;
    cleanupEditorViewer();
    viewerContainer.textContent = "";
    updateViewerSelectionState(null);
    hideSequenceEditorContextMenu();
    const selectedViewer = {
      ...prepared.viewer,
      records: [prepared.viewer.records[selection.index]]
    };
    const layout = viewerLayoutSelect.value === "circular" ? "circular" : "linear";
    const savedState = viewerStates.get(viewerStateKey(selection, layout));
    const initialState = preserveExistingView && savedState
      ? savedState
      : makeViewerSequenceInitialState(prepared.viewer, selection, savedState);
    const remapSelection = (payload) => remapViewerSelectionRecord(payload, selection.index);
    const selectionOptions = {
      initialState,
      preserveState: false,
      onSelectionChange: (payload) => updateViewerSelectionState(remapSelection(payload)),
      onTargetContextMenu: (payload) => showSequenceEditorContextMenu(remapSelection(payload)),
      showInspectorPanels: false,
      showGeneticCodeControl: false,
      onCoordinateSelectionReady: (select) => { selectViewerCoordinates = select; },
      embedded: true,
      showRecordTitle: false
    };
    if (layout === "circular") {
      renderCircularDnaViewer(viewerContainer, selectedViewer, selectionOptions);
    } else {
      renderDnaViewer(viewerContainer, selectedViewer, selectionOptions);
    }
    renderedViewerLayout = layout;
    // Move the actual renderer controls, preserving their handlers and export semantics.
    viewerDisplayControls.replaceChildren();
    for (const selector of [".dna-viewer-toggles", ".dna-viewer-menu-controls"]) {
      const controls = viewerContainer.querySelector(selector);
      if (controls) viewerDisplayControls.append(controls);
    }
    const figureDownloads = viewerContainer.querySelectorAll(".dna-viewer-export-button");
    for (const button of figureDownloads) {
      button.textContent = button.getAttribute("aria-label").replace(" current view as", "");
    }
    figureButtons.replaceChildren(...figureDownloads);
  }
  function redrawViewer() {
    clearTimeout(debounceTimer);
    captureActiveViewerState();
    prepared = prepareSequenceEditorData(editor.value, {
      geneticCode: geneticCodeSelect.value,
      viewerLayout: viewerLayoutSelect.value,
      lineWidth: getLineWidth(),
      featureTrackOverrides
    });
    preparedIsDirty = false;
    manualEditGroup = false;
    lastDocumentSnapshot = snapshotEditorState("manual edit");
    const changeSummary = summarizeSequenceEditorChanges(baselineText, editor.value, { geneticCode: geneticCodeSelect.value });
    renderSequenceEditorChangeSummary(changePanel, changeSummary);
    viewRegionSummary.textContent = prepared.records.length === 1
      ? `${prepared.records[0].title || "Sequence"} · view region`
      : "Choose sequence / view region";
    updateHiddenInput();
    viewerNavigation.textContent = "";
    if (prepared.viewer) {
      const initialSelection = initialEditorViewerSelection(prepared.viewer);
      const navigation = renderViewerSequenceNavigation(viewerNavigation, prepared.viewer, {
        initialSelection,
        onShowSequence: (selection) => showEditorViewerSequence(selection)
      });
      showEditorViewerSequence(navigation?.initialSelection ?? initialSelection, {
        preserveExistingView: true,
        captureCurrent: false
      });
      summary.textContent = `${prepared.records.length} record(s), ${prepared.basesProcessed.toLocaleString()} bp retained`;
      setEditorStatus(prepared.warnings.length > 0 ? prepared.warnings[0] : "Live viewer updated.");
    } else {
      cleanupEditorViewer();
      activeViewerSequence = null;
      viewerContainer.textContent = "";
      updateViewerSelectionState(null);
      hideSequenceEditorContextMenu();
      const empty = document.createElement("p");
      empty.className = "sequence-editor-empty";
      empty.textContent = "Enter DNA/RNA sequence text or FASTA records to show the live viewer.";
      viewerContainer.append(empty);
      summary.textContent = "No sequence loaded";
      setEditorStatus(prepared.warnings[0] || "Waiting for sequence text.");
    }
  }
  function scheduleRedraw() {
    preparedIsDirty = true;
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(redrawViewer, 250);
  }
  function getPrepared() {
    if (!prepared || preparedIsDirty) redrawViewer();
    return prepared;
  }
  editor.addEventListener("input", () => {
    if (!manualEditGroup && lastDocumentSnapshot) {
      pushUndoState("manual edit", lastDocumentSnapshot);
      manualEditGroup = true;
    }
    redoStack = [];
    updateHistoryButtons();
    featureTrackOverrides = [];
    lastDocumentSnapshot = snapshotEditorState("manual edit");
    scheduleRedraw();
  });
  shell.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      (event.shiftKey || key === "y" ? redoButton : undoButton).click();
    }
  });
  const recordSettingChange = (label, { renderViewer = true } = {}) => {
    if (lastDocumentSnapshot) pushUndoState(label, lastDocumentSnapshot);
    if (renderViewer) {
      redrawViewer();
    } else {
      // Export formatting does not change the viewer or its selected target.
      if (prepared && !preparedIsDirty) {
        prepared.fasta = prepared.records
          .map(record => formatFastaRecord(record.title, record.sequence, getLineWidth()).trimEnd())
          .join("\n");
      }
      lastDocumentSnapshot = snapshotEditorState(label);
    }
  };
  geneticCodeSelect.addEventListener("change", () => recordSettingChange("genetic code"));
  viewerLayoutSelect.addEventListener("change", () => recordSettingChange("viewer layout"));
  lineWidthInput.addEventListener("change", () => recordSettingChange("line width", { renderViewer: false }));
  filenameInput.addEventListener("change", () => recordSettingChange("filename", { renderViewer: false }));
  quickSequenceInput.addEventListener("input", () => renderSelectionEffects(getActiveEditorSelection()));
  for (const field of [coordinateStart, coordinateEnd]) {
    field.addEventListener("change", commitCoordinateTarget);
    field.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); commitCoordinateTarget(); }
    });
  }
  replaceSelectionButton.addEventListener("click", () => applyInspectorEdit("replace-range"));
  insertBeforeButton.addEventListener("click", () => applyInspectorEdit("insert-before"));
  insertAfterButton.addEventListener("click", () => applyInspectorEdit("insert-after"));
  deleteSelectionButton.addEventListener("click", () => applyInspectorEdit("delete-range"));
  reverseSelectionButton.addEventListener("click", () => applyInspectorEdit("reverse-complement-range"));
  shell.addEventListener("click", hideSequenceEditorContextMenu);
  shell.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideSequenceEditorContextMenu();
  });
	  cleanButton.addEventListener("click", () => {
	    pushUndoState("clean sequence");
	    const current = getPrepared();
	    featureTrackOverrides = makeSequenceEditorFeatureTrackOverrides(current.records);
	    editor.value = current.fasta || "";
    baselineText = editor.value;
    redrawViewer();
    setEditorStatus("Cleaned sequence and reset the edit baseline.");
	  });
	  reverseComplementButton.addEventListener("click", () => {
	    pushUndoState("reverse complement");
	    featureTrackOverrides = [];
	    editor.value = makeSequenceEditorReverseComplementFasta(editor.value, { lineWidth: getLineWidth() });
	    redrawViewer();
	  });
	  undoButton.addEventListener("click", () => {
	    if (undoStack.length === 0) return;
	    const current = snapshotEditorState("redo");
	    const previous = undoStack.pop();
	    redoStack.push(current);
	    updateHistoryButtons();
	    restoreEditorState(previous, `Undid ${previous.label || "last edit"}.`);
	  });
	  redoButton.addEventListener("click", () => {
	    if (redoStack.length === 0) return;
	    const current = snapshotEditorState("undo");
	    const next = redoStack.pop();
	    undoStack.push(current);
	    updateHistoryButtons();
	    restoreEditorState(next, `Redid ${next.label || "edit"}.`);
	  });
  baselineButton.addEventListener("click", () => {
    pushUndoState("comparison baseline");
    baselineText = editor.value;
    redrawViewer();
    setEditorStatus("Current sequence is the comparison baseline.");
  });
  copyButton.addEventListener("click", async () => {
    const current = getPrepared();
    const text = sequenceExportText(current);
    if (text === null) return;
    await copyTextWithFeedback(copyButton, text);
    setEditorStatus(exportScope.value === "selection" ? "Copied selected FASTA." : "Copied cleaned FASTA.");
  });
  downloadButton.addEventListener("click", () => {
    const current = getPrepared();
    const text = sequenceExportText(current);
    if (text === null) return;
    downloadText(text, normalizeSequenceEditorFilename(filenameInput.value), "text/x-fasta;charset=utf-8");
    setEditorStatus(exportScope.value === "selection" ? "Downloaded selected FASTA." : "Downloaded cleaned FASTA.");
  });
  function sequenceExportText(current) {
    if (exportScope.value !== "selection") return current.fasta || "";
    const active = getActiveEditorSelection();
    if (!active?.selectedSequence) { setEditorStatus("Select bases before exporting the selection."); return null; }
    return formatFastaRecord(`${active.recordTitle || "sequence"}_${active.start}-${active.end}`, active.selectedSequence, getLineWidth());
  }
  function updateExportScope() {
    const count = prepared?.records?.length || 1;
    exportScope.querySelector('[value="whole"]').textContent = count > 1 ? `All ${count} sequences` : "Whole sequence";
    const active = getActiveEditorSelection();
    exportScope.querySelector('[value="selection"]').textContent = active
      ? `Selected bases ${active.start}-${active.end} (${active.length} bp)` : "Selected bases";
    const disabled = exportScope.value === "selection" && !active?.selectedSequence;
    copyButton.disabled = disabled;
    downloadButton.disabled = disabled;
  }
  exportScope.addEventListener("change", updateExportScope);

    redrawViewer();
    updateHistoryButtons();
    const documentSession = createEditorSession({
      host:shell, toolbar:historyActions, downloadHost:documentExports, tool:'sequence-editor', source:previousState?.__documentSource ?? {input:initialText}, nativeHistory:true, initial:previousState?.__documentLoaded ? snapshotEditorState('Document') : undefined,
      read:() => snapshotEditorState('Document'), apply:snapshot => restoreEditorState(snapshot, 'Document restored.')
    });
    elements.markdownWorkspace._sms3VisualCleanup = () => {
      documentSession.dispose();
      clearTimeout(debounceTimer);
      cleanupEditorViewer();
    };
  }

  return {
    readState: readSequenceEditorWorkspaceState,
    render: renderSequenceEditorWorkspace
  };
}

export function renderSequenceEditorOutput(container, sequenceEditor = {}, editorDocument = null, renderOptions = {}) {
  const sourceInput = document.createElement("textarea");
  const controller = createSequenceEditorWorkspaceController({
    elements: {
      markdownWorkspace: container,
      sequenceInput: sourceInput
    },
    state: {
      selectedTool: {
        example: sequenceEditor.input ?? ""
      }
    }
  });
  controller.render({
    text: sequenceEditor.input ?? "",
    geneticCode: sequenceEditor.geneticCode ?? "1",
    viewerLayout: sequenceEditor.viewerLayout === "circular" ? "circular" : "linear",
    filename: sequenceEditor.filename ?? "sequence-editor-cleaned.fasta",
    lineWidth: String(sequenceEditor.lineWidth ?? "60"),
    featureTrackOverrides: sequenceEditor.featureTrackOverrides ?? [],
    __initialViewerSpan: renderOptions.initialViewerSpan,
    ...editorDocument?.state,
    __documentLoaded: Boolean(editorDocument),
    __documentSource: editorDocument?.source
  });
}
