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
import { renderCircularDnaViewer } from "./dna-circular-viewer-canvas.js";
import { renderDnaViewer } from "./dna-viewer-canvas.js";
import { downloadText } from "./file-download.js";
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
  const metrics = document.createElement("div");
  metrics.className = "sequence-editor-change-metrics";
  const metricItems = [
    ["Current", `${changeSummary.currentRecords.toLocaleString()} record(s), ${changeSummary.currentBases.toLocaleString()} bp`],
    ["Delta", `${changeSummary.lengthDelta > 0 ? "+" : ""}${changeSummary.lengthDelta.toLocaleString()} bp`],
    ["Edits", `${changeSummary.changedRecords.toLocaleString()} record(s)`],
    ["State", changeSummary.changedRecords > 0 ? "changed, ready to export" : "baseline"],
    ["Code", `${changeSummary.geneticCode}. ${changeSummary.geneticCodeName}`]
  ];
  for (const [label, value] of metricItems) {
    const item = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = label;
    item.append(strong, ` ${value}`);
    metrics.append(item);
  }
  container.append(title, headline, metrics);

  if (changeSummary.changedRecords > 1) {
    const frame = document.createElement("p");
    frame.className = "sequence-editor-frame-note";
    frame.textContent = "Multiple records changed; reset the comparison baseline after loading the intended sequence before interpreting reading-frame impact.";
    container.append(frame);
  } else if (changeSummary.firstChange?.frameImpact) {
    const frame = document.createElement("p");
    frame.className = "sequence-editor-frame-note";
    frame.textContent = changeSummary.firstChange.frameImpact;
    container.append(frame);
  }

  if (changeSummary.firstChange?.restrictionImpact?.summary) {
    const restriction = document.createElement("p");
    restriction.className = "sequence-editor-frame-note";
    restriction.textContent = changeSummary.firstChange.restrictionImpact.summary;
    container.append(restriction);
  }

  if (changeSummary.firstChange?.beforePreview || changeSummary.firstChange?.afterPreview) {
    const preview = document.createElement("div");
    preview.className = "sequence-editor-change-preview";
    const before = document.createElement("pre");
    before.textContent = `Before: ${changeSummary.firstChange.beforePreview || ""}`;
    const after = document.createElement("pre");
    after.textContent = `After:  ${changeSummary.firstChange.afterPreview || ""}`;
    preview.append(before, after);
    container.append(preview);
  }
}

function renderSequenceEditorWorkspace(previousState = null) {
  if (!elements.markdownWorkspace) {
    return;
  }
  elements.markdownWorkspace.textContent = "";

  const initialText = previousState?.text || state.selectedTool.example || "";
  const shell = document.createElement("div");
  shell.className = "sequence-editor-workspace-shell";

  const viewerPanel = document.createElement("section");
  viewerPanel.className = "sequence-editor-viewer-panel";
  const viewerHeader = document.createElement("div");
  viewerHeader.className = "sequence-editor-header";
  const headerText = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = "Sequence Editor";
  const guidance = document.createElement("p");
  guidance.textContent = "Inspect and edit one DNA/RNA sequence in the live viewer workspace. Coordinate edits, translations, search, range selection, and downloaded FASTA stay synchronized.";
  headerText.append(heading, guidance);
  const summary = document.createElement("p");
  summary.className = "sequence-editor-summary";
  viewerHeader.append(headerText, summary);

  const viewerContainer = document.createElement("div");
  viewerContainer.className = "sequence-editor-live-viewer";

  const editorPanel = document.createElement("aside");
  editorPanel.className = "sequence-editor-settings";
  const editorHeading = document.createElement("h3");
  editorHeading.textContent = "Selection and edit";
  const editorIntro = document.createElement("p");
  editorIntro.className = "sequence-editor-inspector-intro";
  editorIntro.textContent =
    "Click something in the viewer, build a range when needed, then edit the target shown below.";
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
  sourceHelp.textContent = "Paste or edit DNA/RNA or FASTA here, then the viewer updates after cleaning the text. Use the viewer and inspector for coordinate edits.";
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

  const coordinatePanel = document.createElement("details");
  coordinatePanel.className = "sequence-editor-coordinate-panel";
  const coordinateHeading = document.createElement("summary");
  coordinateHeading.textContent = "Edit by typed coordinates";
  const coordinateHelp = document.createElement("p");
  coordinateHelp.className = "sequence-editor-coordinate-help";
  coordinateHelp.textContent =
    "Use this precise editor when you already know the record and 1-based coordinate(s). The main edit panel above is usually easier because it follows the viewer selection.";
  const coordinateNote = document.createElement("p");
  coordinateNote.className = "sequence-editor-coordinate-note";
  coordinateNote.textContent =
    "Delete, replace, and reverse-complement use inclusive start/end coordinates. Insert uses the position after which bases are inserted; use 0 to insert before the first base.";
  const coordinateGrid = document.createElement("div");
  coordinateGrid.className = "sequence-editor-coordinate-grid";

  const coordinateOperation = document.createElement("select");
  coordinateOperation.dataset.sequenceEditorControl = "coordinateOperation";
  for (const [value, label] of [
    ["insert-after", "Insert typed bases after coordinate"],
    ["delete-range", "Delete bases from start to end"],
    ["replace-range", "Replace start-to-end range"],
    ["reverse-complement-range", "Reverse-complement start-to-end range"]
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    coordinateOperation.append(option);
  }

  const coordinateRecord = document.createElement("input");
  coordinateRecord.type = "number";
  coordinateRecord.min = "1";
  coordinateRecord.step = "1";
  coordinateRecord.value = "1";
  coordinateRecord.dataset.sequenceEditorControl = "coordinateRecord";

  const coordinateStart = document.createElement("input");
  coordinateStart.type = "number";
  coordinateStart.min = "0";
  coordinateStart.step = "1";
  coordinateStart.value = "0";
  coordinateStart.dataset.sequenceEditorControl = "coordinateStart";

  const coordinateEnd = document.createElement("input");
  coordinateEnd.type = "number";
  coordinateEnd.min = "1";
  coordinateEnd.step = "1";
  coordinateEnd.value = "1";
  coordinateEnd.dataset.sequenceEditorControl = "coordinateEnd";

  const coordinateSequence = document.createElement("textarea");
  coordinateSequence.className = "sequence-editor-coordinate-sequence";
  coordinateSequence.rows = 3;
  coordinateSequence.spellcheck = false;
  coordinateSequence.wrap = "off";
  coordinateSequence.placeholder = "Bases to insert or use as replacement";
  coordinateSequence.dataset.sequenceEditorControl = "coordinateSequence";

  const operationField = createMarkdownWorkspaceField("Operation", coordinateOperation);
  const recordField = createMarkdownWorkspaceField("Record number", coordinateRecord);
  const startField = createMarkdownWorkspaceField("Insert after base", coordinateStart);
  const endField = createMarkdownWorkspaceField("End coordinate (inclusive)", coordinateEnd);
  const sequenceField = createMarkdownWorkspaceField("Bases to insert/replace", coordinateSequence);
  sequenceField.classList.add("sequence-editor-coordinate-wide");
  const useViewerSelectionButton = createMarkdownWorkspaceButton("Copy edit target to fields");
  useViewerSelectionButton.classList.add("sequence-editor-coordinate-use-selection");
  const applyCoordinateEditButton = createMarkdownWorkspaceButton("Apply typed coordinate edit", "primary-button");
  applyCoordinateEditButton.classList.add("sequence-editor-coordinate-apply");
  const coordinateActions = document.createElement("div");
  coordinateActions.className = "sequence-editor-coordinate-actions";
  coordinateActions.append(useViewerSelectionButton, applyCoordinateEditButton);
  const viewerSelectionHint = document.createElement("p");
  viewerSelectionHint.className = "sequence-editor-selection-hint";
  const contextMenu = document.createElement("div");
  contextMenu.className = "sequence-editor-context-menu";
  contextMenu.hidden = true;
  contextMenu.setAttribute("role", "menu");
  coordinateGrid.append(operationField, recordField, startField, endField, sequenceField);
  coordinatePanel.append(coordinateHeading, coordinateHelp, coordinateNote, viewerSelectionHint, coordinateGrid, coordinateActions);

  const toolbar = document.createElement("div");
  toolbar.className = "sequence-editor-actions sequence-editor-toolbar";
  const documentActions = document.createElement("div");
  documentActions.className = "sequence-editor-toolbar-group sequence-editor-toolbar-group-actions";
  const historyActions = document.createElement("div");
  historyActions.className = "sequence-editor-toolbar-group sequence-editor-toolbar-group-history";
  const exportActions = document.createElement("div");
  exportActions.className = "sequence-editor-toolbar-group sequence-editor-toolbar-group-export";
  const viewerActions = document.createElement("div");
  viewerActions.className = "sequence-editor-toolbar-group sequence-editor-toolbar-group-view";
  const cleanButton = createMarkdownWorkspaceButton("Clean");
  const reverseComplementButton = createMarkdownWorkspaceButton("Reverse complement");
  const undoButton = createMarkdownWorkspaceButton("Undo");
  const redoButton = createMarkdownWorkspaceButton("Redo");
  const copyButton = createMarkdownWorkspaceButton("Copy FASTA");
  const downloadButton = createMarkdownWorkspaceButton("Download FASTA", "primary-button");
  const exportDetails = document.createElement("details");
  exportDetails.className = "sequence-editor-export-options";
  const exportSummary = document.createElement("summary");
  exportSummary.textContent = "Export options";
  const exportPanel = document.createElement("div");
  exportPanel.className = "sequence-editor-export-popover";
  exportPanel.append(
    createMarkdownWorkspaceField("Download name", filenameInput),
    createMarkdownWorkspaceField("FASTA line width", lineWidthInput)
  );
  exportDetails.append(exportSummary, exportPanel);
  documentActions.append(cleanButton, reverseComplementButton);
  historyActions.append(undoButton, redoButton);
  exportActions.append(copyButton, downloadButton, exportDetails);
  viewerActions.append(
    createMarkdownWorkspaceField("Viewer", viewerLayoutSelect),
    createMarkdownWorkspaceField("Genetic code", geneticCodeSelect)
  );
  toolbar.append(documentActions, historyActions, exportActions, viewerActions);

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
  selectionTitle.textContent = "Clicked item / anchor";
  const selectionBody = document.createElement("div");
  selectionBody.className = "sequence-editor-selection-body";
  selectionPanel.append(selectionTitle, selectionBody);

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
  const quickEditHelp = document.createElement("p");
  quickEditHelp.className = "sequence-editor-quick-help";
  quickEditHelp.textContent = "Use the viewer to choose what the buttons edit. A completed range appears here and becomes the target until you clear it.";
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
  const copySelectionButton = createMarkdownWorkspaceButton("Copy");
  const downloadSelectionButton = createMarkdownWorkspaceButton("Export");
  const quickEditActions = document.createElement("div");
  quickEditActions.className = "sequence-editor-quick-actions";
  quickEditActions.append(
    replaceSelectionButton,
    insertBeforeButton,
    insertAfterButton,
    deleteSelectionButton,
    reverseSelectionButton,
    copySelectionButton,
    downloadSelectionButton
  );
  rangePanel.classList.add("sequence-editor-range-panel-inline");
  quickEditPanel.append(quickEditTitle, quickEditHelp, quickTargetSummary, rangePanel, quickSequenceInput, quickEditActions);

  const effectsPanel = document.createElement("section");
  effectsPanel.className = "sequence-editor-effects-panel";
  const effectsTitle = document.createElement("h4");
  effectsTitle.textContent = "Effects / warnings";
  const effectsBody = document.createElement("div");
  effectsBody.className = "sequence-editor-effects-body";
  effectsPanel.append(effectsTitle, effectsBody);

  changeStatusShell.append(changePanel, baselineButton);
  viewerPanel.append(changeStatusShell, viewerContainer, sourceDetails);
  editorPanel.append(
    editorHeading,
    editorIntro,
    status,
    quickEditPanel,
    selectionPanel,
    effectsPanel,
    coordinatePanel
  );
  appBody.append(viewerPanel, editorPanel);
  shell.append(viewerHeader, toolbar, appBody, contextMenu);
  elements.markdownWorkspace.append(shell);

  let prepared = null;
  let debounceTimer = null;
  let baselineText = initialText;
  let undoStack = [];
  let redoStack = [];
  let featureTrackOverrides = cloneSequenceEditorFeatureOverrides(previousState?.featureTrackOverrides);
  let viewerSelection = null;
  let lastInspectorSelectionKey = "";
  function setEditorStatus(message) {
    status.textContent = message;
  }
  function updateHistoryButtons() {
    undoButton.disabled = undoStack.length === 0;
    redoButton.disabled = redoStack.length === 0;
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
  function pushUndoState(label) {
    undoStack.push(snapshotEditorState(label));
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
    return prepared?.records?.[index] || null;
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
    quickEditHelp.textContent = capabilities.reason;
    quickTargetSummary.textContent = describeSequenceEditorEditTarget(active);
    quickSequenceInput.disabled = !capabilities.canEditSequence;
    quickSequenceInput.placeholder = !active
      ? "Select a base or range first"
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
    copySelectionButton.disabled = !capabilities.canCopy;
    downloadSelectionButton.disabled = !capabilities.canExport;
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
    action();
    if (statusMessage) {
      setEditorStatus(statusMessage);
    }
  }
  function renderSelectionActionButton(container, label, action, statusMessage = "") {
    if (typeof action !== "function") return;
    const button = createMarkdownWorkspaceButton(label);
    button.addEventListener("click", () => runViewerSelectionAction(action, statusMessage));
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
    if (!range?.anchors?.length) {
      const empty = document.createElement("p");
      empty.className = "sequence-editor-range-empty";
      empty.textContent = "No range yet. Click a viewer item, then use Add as range anchor in Clicked item / anchor.";
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
      rows.push(["Next step", "Select another viewer item and add it as the second anchor."]);
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
        renderSelectionActionButton(buttons, "Use opposite path", actions.swapRange);
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
    setQuickEditButtonsEnabled(active);
    if (!selectedItem) {
      const empty = document.createElement("p");
      empty.className = "sequence-editor-selection-empty";
      empty.textContent = active?.kind === "range"
        ? "Range is active. Click another viewer item to inspect it here, or clear the range to edit clicked items directly."
        : "Click a base, codon, feature, or restriction site. Use Add as range anchor when you want an interval.";
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
        "Add as range anchor",
        () => selection?.actions?.addRangeAnchor?.(selectedItem.target),
        `Added ${selectedItem.label} as a range anchor.`
      );
      renderSelectionActionButton(
        actionRow,
        "Zoom to selection",
        () => selection?.actions?.zoomToTarget?.(selectedItem.target)
      );
    }
    if (actionRow.childElementCount > 0) {
      selectionBody.append(actionRow);
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
  function refreshCoordinateEditControls() {
    const operation = coordinateOperation.value;
    const startLabel = startField.querySelector("span");
    if (startLabel) {
      startLabel.textContent = operation === "insert-after" ? "Insert after base" : "Start coordinate";
    }
    coordinateStart.min = operation === "insert-after" ? "0" : "1";
    endField.hidden = operation === "insert-after";
    sequenceField.hidden = operation === "delete-range" || operation === "reverse-complement-range";
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
    viewerSelection = selection?.target || selection?.currentRange?.anchors?.length || selection?.currentRange?.ready ? selection : null;
    viewerSelectionHint.textContent = describeViewerSelection(viewerSelection);
    useViewerSelectionButton.disabled = !getActiveEditorSelection(viewerSelection);
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
    coordinateRecord.value = String(active.recordIndex + 1);
    if (coordinateOperation.value === "insert-after") {
      coordinateStart.value = String(rangeEnd);
    } else {
      coordinateStart.value = String(rangeStart);
      coordinateEnd.value = String(rangeEnd);
    }
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
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      hideSequenceEditorContextMenu();
      handler();
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
    coordinateOperation.value = operation;
    refreshCoordinateEditControls();
    return applyViewerSelectionToCoordinateControls(selection);
  }
  function applyCoordinateEditFromControls(statusPrefix = "") {
    if (coordinateOperation.value === "reverse-complement-range") {
      const start = Number(coordinateStart.value);
      const end = Number(coordinateEnd.value);
      if (Number.isFinite(start) && Number.isFinite(end) && Math.abs(end - start) + 1 < 2) {
        setEditorStatus("Enter or select a range of two or more bases to reverse-complement. For one base, use Replace with the complementary base.");
        return;
      }
    }
    clearTimeout(debounceTimer);
    pushUndoState("coordinate edit");
    const editResult = applySequenceEditorCoordinateEdit(editor.value, {
      operation: coordinateOperation.value,
      recordNumber: coordinateRecord.value,
      insertAfter: coordinateStart.value,
      start: coordinateStart.value,
      end: coordinateEnd.value,
      editSequence: coordinateSequence.value,
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
    const featureText = editResult.edit.featureUpdateSummary ? ` Features: ${editResult.edit.featureUpdateSummary}.` : "";
    const warningText = editResult.warnings.length > 0 ? ` ${editResult.warnings[0]}` : "";
    setEditorStatus(`${statusPrefix}${editResult.edit.summary}${featureText}${warningText}`);
  }
  function prepareInspectorEdit(operation) {
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
    coordinateRecord.value = String(active.recordIndex + 1);
    if (operation === "insert-before" || operation === "insert-after") {
      coordinateOperation.value = "insert-after";
      coordinateStart.value = String(operation === "insert-before" ? Math.max(0, active.start - 1) : active.end);
      coordinateSequence.value = cleaned.sequence;
    } else {
      coordinateOperation.value = operation;
      coordinateStart.value = String(active.start);
      coordinateEnd.value = String(active.end);
      coordinateSequence.value = cleaned.sequence;
    }
    refreshCoordinateEditControls();
    return true;
  }
  function applyInspectorEdit(operation) {
    if (!prepareInspectorEdit(operation)) {
      return;
    }
    applyCoordinateEditFromControls("Applied from selection: ");
  }
  async function copyInspectorSelection() {
    const active = getActiveEditorSelection();
    const text = active?.selectedSequence || "";
    if (!text) {
      setEditorStatus("The selected item does not have copyable sequence.");
      return;
    }
    await navigator.clipboard.writeText(text);
    setEditorStatus(`Copied ${text.length.toLocaleString()} selected base${text.length === 1 ? "" : "s"}.`);
  }
  function downloadInspectorSelection() {
    const active = getActiveEditorSelection();
    const text = active?.selectedSequence || "";
    if (!active || !text) {
      setEditorStatus("The selected item does not have downloadable sequence.");
      return;
    }
    const safeTitle = `${active.recordTitle || "selected_sequence"}_${active.start}_${active.end}`.replace(/[^A-Za-z0-9_.-]+/g, "_");
    const fasta = formatFastaRecord(safeTitle, text, getLineWidth()).trimEnd();
    downloadText(fasta, normalizeSequenceEditorFilename(`${safeTitle}.fasta`), "text/x-fasta;charset=utf-8");
    setEditorStatus(`Exported ${text.length.toLocaleString()} selected base${text.length === 1 ? "" : "s"}.`);
  }
  function applyContextEditNow(selection, operation) {
    if (!prepareContextEdit(selection, operation)) {
      return;
    }
    applyCoordinateEditFromControls("Applied from viewer selection: ");
  }
  async function copyContextSelection(selection) {
    const text = selection?.selectedSequence || "";
    if (!text) {
      setEditorStatus("The selected viewer item does not have copyable sequence.");
      return;
    }
    await navigator.clipboard.writeText(text);
    setEditorStatus(`Copied ${text.length.toLocaleString()} selected base${text.length === 1 ? "" : "s"}.`);
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
    addContextMenuButton("Copy to typed-coordinate fields", () => applyViewerSelectionToCoordinateControls(selection));
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
  function redrawViewer() {
    prepared = prepareSequenceEditorData(editor.value, {
      geneticCode: geneticCodeSelect.value,
      viewerLayout: viewerLayoutSelect.value,
      lineWidth: getLineWidth(),
      featureTrackOverrides
    });
    const changeSummary = summarizeSequenceEditorChanges(baselineText, editor.value, { geneticCode: geneticCodeSelect.value });
    renderSequenceEditorChangeSummary(changePanel, changeSummary);
    updateHiddenInput();
    viewerContainer.textContent = "";
    updateViewerSelectionState(null);
    hideSequenceEditorContextMenu();
    if (prepared.viewer) {
      const selectionOptions = {
        onSelectionChange: updateViewerSelectionState,
        onTargetContextMenu: showSequenceEditorContextMenu,
        showInspectorPanels: false,
        embedded: true,
        showRecordTitle: false
      };
      if (viewerLayoutSelect.value === "circular") {
        renderCircularDnaViewer(viewerContainer, prepared.viewer, selectionOptions);
      } else {
        renderDnaViewer(viewerContainer, prepared.viewer, selectionOptions);
      }
      summary.textContent = `${prepared.records.length} record(s), ${prepared.basesProcessed.toLocaleString()} bp retained`;
      setEditorStatus(prepared.warnings.length > 0 ? prepared.warnings[0] : "Live viewer updated.");
    } else {
      const empty = document.createElement("p");
      empty.className = "sequence-editor-empty";
      empty.textContent = "Enter DNA/RNA sequence text or FASTA records to show the live viewer.";
      viewerContainer.append(empty);
      summary.textContent = "No sequence loaded";
      setEditorStatus(prepared.warnings[0] || "Waiting for sequence text.");
    }
  }
  function scheduleRedraw() {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(redrawViewer, 250);
  }
  function getPrepared() {
    if (!prepared) redrawViewer();
    return prepared;
  }
  editor.addEventListener("input", () => {
    featureTrackOverrides = [];
    scheduleRedraw();
  });
  geneticCodeSelect.addEventListener("change", redrawViewer);
  viewerLayoutSelect.addEventListener("change", redrawViewer);
  lineWidthInput.addEventListener("input", scheduleRedraw);
  lineWidthInput.addEventListener("change", redrawViewer);
  quickSequenceInput.addEventListener("input", () => renderSelectionEffects(getActiveEditorSelection()));
  coordinateOperation.addEventListener("change", refreshCoordinateEditControls);
  useViewerSelectionButton.addEventListener("click", () => applyViewerSelectionToCoordinateControls());
  replaceSelectionButton.addEventListener("click", () => applyInspectorEdit("replace-range"));
  insertBeforeButton.addEventListener("click", () => applyInspectorEdit("insert-before"));
  insertAfterButton.addEventListener("click", () => applyInspectorEdit("insert-after"));
  deleteSelectionButton.addEventListener("click", () => applyInspectorEdit("delete-range"));
  reverseSelectionButton.addEventListener("click", () => applyInspectorEdit("reverse-complement-range"));
  copySelectionButton.addEventListener("click", () => copyInspectorSelection());
  downloadSelectionButton.addEventListener("click", () => downloadInspectorSelection());
  shell.addEventListener("click", hideSequenceEditorContextMenu);
  shell.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideSequenceEditorContextMenu();
  });
	  applyCoordinateEditButton.addEventListener("click", () => {
	    applyCoordinateEditFromControls();
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
    baselineText = editor.value;
    redrawViewer();
    setEditorStatus("Current sequence is the comparison baseline.");
  });
  copyButton.addEventListener("click", async () => {
    const current = getPrepared();
    await navigator.clipboard.writeText(current.fasta || "");
    setEditorStatus("Copied cleaned FASTA.");
  });
  downloadButton.addEventListener("click", () => {
    const current = getPrepared();
    downloadText(current.fasta || "", normalizeSequenceEditorFilename(filenameInput.value), "text/x-fasta;charset=utf-8");
    setEditorStatus("Downloaded cleaned FASTA.");
  });

	  redrawViewer();
	  refreshCoordinateEditControls();
	  updateHistoryButtons();
	}

  return {
    readState: readSequenceEditorWorkspaceState,
    render: renderSequenceEditorWorkspace
  };
}
