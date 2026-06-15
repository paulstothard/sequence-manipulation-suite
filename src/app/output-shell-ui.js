import { describeStream, describeViewerStream, describeWorkflowStreamChoice } from "./workflow-stream-labels.js";
import { buildOutputDescriptionText, sha256Hex } from "./output-description.js";
import { saveWorkspaceFeatureLayer, saveWorkspaceSequence } from "./workspace-storage.js";
import {
  getResultWorkspaceFeatureLayerDrafts,
  getResultWorkspaceSequenceDrafts,
  getResultWorkspaceSequenceLayerGroups,
  getWorkflowWorkspaceFeatureLayerDrafts,
  getWorkflowWorkspaceSequenceDrafts,
  getWorkflowWorkspaceSequenceLayerGroups
} from "./workspace-promotion.js";
import {
  attachWorkspaceFeatureLayersToFigure,
  attachWorkspaceFeatureLayersToViewer
} from "../core/workspace-layers.js";
import {
  alignTsv,
  getBaseMimeType,
  isDelimitedDownload,
  tableRowsToCsv,
  tableRowsToTsv,
  tableStreamToTsv
} from "./table-output-format.js";
import {
  findLiteralMatches,
  getNextSearchIndex,
  getOutputHighlightModel,
  getOutputSearchCountText
} from "./output-search.js";
import {
  getColumnPresetDefinitions,
  getHiddenColumnsForPreset,
  getTableActionScopeText,
  getTableViewData as buildTableViewData,
  getVisibleTableColumns as getVisibleColumnsForTable
} from "./table-output-view-model.js";
import { downloadBlob, downloadText } from "./file-download.js";
import { serializeSvgElement } from "./svg-export.js";
import { renderCircularDnaViewer } from "./dna-circular-viewer-canvas.js";
import { renderDnaViewer } from "./dna-viewer-canvas.js";
import { renderProteinViewer } from "./protein-viewer-canvas.js";
import { renderGenomeFigure } from "./genome-figure-svg.js";
import { renderProteinStructureViewer } from "./protein-structure-viewer.js";
import { renderSangerTraceViewer } from "./sanger-trace-viewer.js";
import { createSequenceEditorWorkspaceController } from "./sequence-editor-workspace-ui.js";
import { loadMarkdownNotebookDraft, saveMarkdownNotebookDraft } from "./markdown-notebook-model.js";
import { renderObservablePlotPreview } from "./plot-preview-ui.js";

const XLSX_EXPORT_ROW_LIMIT = 50000;
const XLSX_EXPORT_CELL_LIMIT = 250000;

export function createOutputShellController({
  elements,
  state,
  workspaceInputSources,
  addMessage,
  refreshWorkspaceSequences,
  getActiveWorkflowDefinition,
  getSelectedWorkflowPreset,
  flattenOptions,
  getOptions,
  pluralize
}) {
function renderMessages(result) {
  elements.messages.textContent = "";

  const processedUnitLabel = result.processedUnitLabel ?? "base";
  const summary = document.createElement("div");
  summary.className = "message info";
  summary.textContent = `${pluralize(result.recordsProcessed, "record")}, ${pluralize(result.basesProcessed, processedUnitLabel)}, ${pluralize(result.charactersRemoved, "character")} removed.`;
  elements.messages.append(summary);

  appendOutputDetails(elements.messages, getToolOutputDetails(result));
  appendToolDescriptionActions(elements.messages);
  appendAdditionalDownloadActions(elements.messages, result);
  appendWorkspacePromotionActions(elements.messages, result);
  appendWorkspaceFeatureLayerPromotionActions(elements.messages, result);
  appendWarningSummary(elements.messages, result.warnings);
}

function getWorkspaceSequenceDraftsFromResult(result) {
  return getResultWorkspaceSequenceDrafts(result, {
    sourceToolId: state.selectedTool?.metadata?.id ?? "",
    sourceToolName: state.selectedTool?.metadata?.name ?? ""
  });
}

function appendWorkspacePromotionActions(parent, result) {
  const drafts = getWorkspaceSequenceDraftsFromResult(result);
  if (drafts.length === 0) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "message workspace-promotion";
  const text = document.createElement("span");
  text.textContent = `Sequence output available: ${pluralize(drafts.length, "record")}.`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = drafts.length === 1 ? "Save to workspace" : "Save records to workspace";
  const status = document.createElement("span");
  status.className = "workspace-promotion-status";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      for (const draft of drafts) {
        await saveWorkspaceSequence(draft);
      }
      status.textContent = `Saved ${pluralize(drafts.length, "sequence")} to the workspace.`;
      await refreshWorkspaceSequences();
    } catch (error) {
      status.textContent = error?.message || "Could not save sequence output.";
      button.disabled = false;
    }
  });
  wrapper.append(text, button, status);
  parent.append(wrapper);
}

function getWorkspaceFeatureLayerDraftsFromResult(result) {
  const workspaceContext = workspaceInputSources.getToolLayerContext(state.selectedTool);
  return getResultWorkspaceFeatureLayerDrafts(result, {
    ...workspaceContext,
    sourceToolId: state.selectedTool?.metadata?.id ?? "",
    sourceToolName: state.selectedTool?.metadata?.name ?? "",
    sourceStreamId: "visual.viewer",
    options: result.optionsUsed ?? {}
  });
}

function getWorkspaceSequenceLayerGroupsFromResult(result) {
  const workspaceContext = workspaceInputSources.getToolLayerContext(state.selectedTool);
  if (workspaceContext.sequenceId) {
    return [];
  }
  return getResultWorkspaceSequenceLayerGroups(result, {
    sourceToolId: state.selectedTool?.metadata?.id ?? "",
    sourceToolName: state.selectedTool?.metadata?.name ?? "",
    sourceStreamId: "visual.viewer",
    options: result.optionsUsed ?? {}
  });
}

async function saveWorkspaceSequenceLayerGroups(groups) {
  let sequenceCount = 0;
  let layerCount = 0;
  for (const group of groups) {
    const savedSequence = await saveWorkspaceSequence(group.sequenceDraft);
    sequenceCount += 1;
    for (const layerDraft of group.layerDrafts) {
      await saveWorkspaceFeatureLayer({
        ...layerDraft,
        id: "",
        sequenceId: savedSequence.id,
        sequenceHash: savedSequence.sequenceHash ?? layerDraft.sequenceHash ?? ""
      });
      layerCount += 1;
    }
  }
  return { sequenceCount, layerCount };
}

function getSequenceLayerPromotionButtonText(sequenceCount, layerCount) {
  if (sequenceCount === 1 && layerCount === 1) {
    return "Create sequence and save layer";
  }
  if (sequenceCount === 1) {
    return "Create sequence and save layers";
  }
  return "Create sequences and save layers";
}

function appendWorkspaceFeatureLayerPromotionActions(parent, result) {
  const drafts = getWorkspaceFeatureLayerDraftsFromResult(result);
  if (drafts.length === 0) {
    return;
  }
  const sequenceLayerGroups = getWorkspaceSequenceLayerGroupsFromResult(result);
  const shouldCreateSequences = sequenceLayerGroups.length > 0;
  const layerCount = shouldCreateSequences
    ? sequenceLayerGroups.reduce((count, group) => count + group.layerDrafts.length, 0)
    : drafts.length;
  const sequenceCount = sequenceLayerGroups.length;

  const wrapper = document.createElement("div");
  wrapper.className = "message workspace-promotion workspace-layer-promotion";
  const text = document.createElement("span");
  text.textContent = shouldCreateSequences
    ? `Viewer output can create ${pluralize(sequenceCount, "workspace sequence")} and ${pluralize(layerCount, "feature layer")}.`
    : `Feature layer output available: ${pluralize(drafts.length, "layer")}.`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = shouldCreateSequences
    ? getSequenceLayerPromotionButtonText(sequenceCount, layerCount)
    : drafts.length === 1 ? "Save layer to workspace" : "Save layers to workspace";
  const status = document.createElement("span");
  status.className = "workspace-promotion-status";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (shouldCreateSequences) {
        const saved = await saveWorkspaceSequenceLayerGroups(sequenceLayerGroups);
        status.textContent = `Created ${pluralize(saved.sequenceCount, "sequence")} and saved ${pluralize(saved.layerCount, "feature layer")} to the workspace.`;
      } else {
        for (const draft of drafts) {
          await saveWorkspaceFeatureLayer({ ...draft, id: "" });
        }
        status.textContent = `Saved ${pluralize(drafts.length, "feature layer")} to the workspace.`;
      }
      await refreshWorkspaceSequences();
    } catch (error) {
      status.textContent = error?.message || "Could not save feature layer output.";
      button.disabled = false;
    }
  });
  wrapper.append(text, button, status);
  parent.append(wrapper);
}

function appendWorkflowWorkspacePromotionActions(parent, result, workflowDefinition = getActiveWorkflowDefinition()) {
  const drafts = getWorkflowWorkspaceSequenceDrafts(result?.value, {
    sourceToolId: "workflow-builder",
    sourceToolName: workflowDefinition?.name ?? getSelectedWorkflowPreset().name ?? "Workflow",
    sourceStreamId: "workflow-output"
  });
  if (drafts.length === 0) {
    appendWorkflowFeatureLayerPromotionActions(parent, result, workflowDefinition);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "message workspace-promotion";
  const text = document.createElement("span");
  text.textContent = `Workflow sequence output available: ${pluralize(drafts.length, "record")}.`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = drafts.length === 1 ? "Save to workspace" : "Save records to workspace";
  const status = document.createElement("span");
  status.className = "workspace-promotion-status";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      for (const draft of drafts) {
        await saveWorkspaceSequence(draft);
      }
      status.textContent = `Saved ${pluralize(drafts.length, "sequence")} to the workspace.`;
      await refreshWorkspaceSequences();
    } catch (error) {
      status.textContent = error?.message || "Could not save workflow output.";
      button.disabled = false;
    }
  });
  wrapper.append(text, button, status);
  parent.append(wrapper);

  appendWorkflowFeatureLayerPromotionActions(parent, result, workflowDefinition);
}

function getWorkflowFeatureLayerDraftsFromResult(result, workflowDefinition = getActiveWorkflowDefinition()) {
  const selected = workspaceInputSources.getWorkflowSourceSequence(workflowDefinition);
  return getWorkflowWorkspaceFeatureLayerDrafts(result?.value, {
    sequenceId: selected?.id ?? "",
    sequenceHash: selected?.sequenceHash ?? "",
    sourceToolId: "workflow-builder",
    sourceToolName: workflowDefinition?.name ?? getSelectedWorkflowPreset().name ?? "Workflow",
    sourceStreamId: "workflow-output"
  });
}

function getWorkflowSequenceLayerGroupsFromResult(result, workflowDefinition = getActiveWorkflowDefinition()) {
  const selected = workspaceInputSources.getWorkflowSourceSequence(workflowDefinition);
  if (selected?.id) {
    return [];
  }
  return getWorkflowWorkspaceSequenceLayerGroups(result?.value, {
    sourceToolId: "workflow-builder",
    sourceToolName: workflowDefinition?.name ?? getSelectedWorkflowPreset().name ?? "Workflow",
    sourceStreamId: "workflow-output"
  });
}

function appendWorkflowFeatureLayerPromotionActions(parent, result, workflowDefinition = getActiveWorkflowDefinition()) {
  const drafts = getWorkflowFeatureLayerDraftsFromResult(result, workflowDefinition);
  if (drafts.length === 0) {
    return;
  }
  const sequenceLayerGroups = getWorkflowSequenceLayerGroupsFromResult(result, workflowDefinition);
  const shouldCreateSequences = sequenceLayerGroups.length > 0;
  const layerCount = shouldCreateSequences
    ? sequenceLayerGroups.reduce((count, group) => count + group.layerDrafts.length, 0)
    : drafts.length;
  const sequenceCount = sequenceLayerGroups.length;

  const wrapper = document.createElement("div");
  wrapper.className = "message workspace-promotion workspace-layer-promotion";
  const text = document.createElement("span");
  text.textContent = shouldCreateSequences
    ? `Workflow viewer output can create ${pluralize(sequenceCount, "workspace sequence")} and ${pluralize(layerCount, "feature layer")}.`
    : `Workflow feature layer output available: ${pluralize(drafts.length, "layer")}.`;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = shouldCreateSequences
    ? getSequenceLayerPromotionButtonText(sequenceCount, layerCount)
    : drafts.length === 1 ? "Save layer to workspace" : "Save layers to workspace";
  const status = document.createElement("span");
  status.className = "workspace-promotion-status";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (shouldCreateSequences) {
        const saved = await saveWorkspaceSequenceLayerGroups(sequenceLayerGroups);
        status.textContent = `Created ${pluralize(saved.sequenceCount, "sequence")} and saved ${pluralize(saved.layerCount, "feature layer")} to the workspace.`;
      } else {
        for (const draft of drafts) {
          await saveWorkspaceFeatureLayer({ ...draft, id: "" });
        }
        status.textContent = `Saved ${pluralize(drafts.length, "feature layer")} to the workspace.`;
      }
      await refreshWorkspaceSequences();
    } catch (error) {
      status.textContent = error?.message || "Could not save workflow feature layer output.";
      button.disabled = false;
    }
  });
  wrapper.append(text, button, status);
  parent.append(wrapper);
}

function appendWarningSummary(parent, warnings, formatter = (warning) => warning) {
  if (!warnings?.length) {
    return;
  }

  const details = document.createElement("details");
  details.className = "message warning warning-summary";

  const summary = document.createElement("summary");
  summary.textContent = pluralize(warnings.length, "warning");
  details.append(summary);

  const list = document.createElement("ul");
  for (const warning of warnings) {
    const item = document.createElement("li");
    item.textContent = formatter(warning);
    list.append(item);
  }
  details.append(list);
  parent.append(details);
}

function describeStructuredOutput(id, stream) {
  if (!stream) {
    return id;
  }
  const label = describeWorkflowStreamChoice({ id, ...stream });
  if (stream.kind === "table") {
    return `${label}: ${pluralize(stream.rows?.length ?? 0, "row")}, ${pluralize(stream.columns?.length ?? 0, "column")}`;
  }
  if (stream.kind === "sequence-records") {
    return `${label}: ${pluralize(stream.records?.length ?? 0, "record")}`;
  }
  if (stream.kind === "warnings") {
    return `${label}: ${pluralize(stream.warnings?.length ?? 0, "warning")}`;
  }
  if (stream.kind === "text") {
    return `${label}: ${describeStream(stream)}`;
  }
  if (stream.kind === "collection") {
    return `${label}: set with ${pluralize(stream.items?.length ?? 0, "item")}`;
  }
  if (stream.records) {
    return `${label}: ${describeStream(stream)} (${pluralize(stream.records.length, "record")})`;
  }
  return `${label}: ${describeStream(stream)}`;
}

function appendOutputDetails(parent, detailsRows) {
  const rows = detailsRows.filter(Boolean);
  if (rows.length === 0) {
    return;
  }

  const details = document.createElement("details");
  details.className = "message output-details";
  const summary = document.createElement("summary");
  summary.textContent = "Output details";
  details.append(summary);

  const list = document.createElement("dl");
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    list.append(term, description);
  }
  details.append(list);
  parent.append(details);
}

function appendToolDescriptionActions(parent) {
  if (!state.currentToolDescription) {
    return;
  }
  const row = document.createElement("div");
  row.className = "output-description-actions";
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "Download description";
  download.addEventListener("click", () => {
    downloadText(
      state.currentToolDescription,
      `${state.selectedTool.metadata.id || "sms3-output"}-description.txt`,
      "text/plain;charset=utf-8"
    );
  });
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy description";
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.currentToolDescription);
  });
  row.append(download, copy);
  parent.append(row);
}

function getAdditionalDownloads(result) {
  return (Array.isArray(result?.downloads) ? result.downloads : [])
    .filter((item) => item && typeof item.text === "string" && item.filename);
}

function appendAdditionalDownloadActions(parent, result) {
  const downloads = getAdditionalDownloads(result);
  if (downloads.length === 0) {
    return;
  }

  const row = document.createElement("div");
  row.className = "output-description-actions output-download-actions";
  for (const item of downloads) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label || `Download ${item.filename}`;
    button.addEventListener("click", () => {
      downloadText(
        item.text,
        item.filename,
        item.mimeType || "text/plain;charset=utf-8"
      );
    });
    row.append(button);
  }
  parent.append(row);
}

async function buildToolOutputDescription(result, inputText, options) {
  const tool = state.selectedTool.metadata;
  const checksum = await sha256Hex(inputText, { crypto: window.crypto });
  return buildOutputDescriptionText({
    tool,
    result,
    options: result.optionsUsed ? { ...options, ...result.optionsUsed } : options,
    formatLabel: getCurrentToolOutputFormatLabel(result),
    inputChecksum: checksum,
    appVersion: elements.appVersion?.textContent || ""
  });
}

function getToolOutputDetails(result) {
  const processedUnitLabel = result.processedUnitLabel ?? "base";
  const additionalDownloads = getAdditionalDownloads(result);
  const structuredOutputs = Object.entries(result.streams ?? {})
    .filter(([id]) => id !== "primary")
    .map(([id, stream]) => describeStructuredOutput(id, stream))
    .join("; ");

  return [
    ["Processed", `${pluralize(result.recordsProcessed, "record")}, ${pluralize(result.basesProcessed, processedUnitLabel)}`],
    result.charactersRemoved > 0
      ? ["Cleaned", `${pluralize(result.charactersRemoved, "character")} removed`]
      : null,
    ["Default export", `${result.download?.filename ?? "sms3-output.txt"} (${result.download?.mimeType ?? "text/plain"})`],
    additionalDownloads.length > 0
      ? ["Additional downloads", additionalDownloads.map((item) => item.filename).join(", ")]
      : null,
    structuredOutputs ? ["Available results", structuredOutputs] : null,
    result.visual?.svg ? ["Visual output", "Visual preview"] : null
  ];
}

function getWorkflowOutputDetails(result, formatted) {
  return [
    ["Workflow run", pluralize(result.steps?.length ?? 0, "step")],
    ["Final output", formatted.summary],
    ["Default export", `${formatted.filename ?? "sms3-workflow-output.txt"} (${formatted.mimeType ?? "text/plain"})`],
    formatted.tableStream
      ? ["Available results", describeStructuredOutput("table", formatted.tableStream)]
      : null
  ];
}

function getOutputSearchParts(scope) {
  return scope === "workflow"
    ? {
        textarea: elements.workflowOutput,
        preview: elements.workflowOutputHighlight,
        input: elements.workflowOutputSearch,
        previous: elements.workflowOutputSearchPrevious,
        next: elements.workflowOutputSearchNext,
        count: elements.workflowOutputSearchCount,
        row: elements.workflowOutputSearchRow,
        table: elements.workflowTableOutput
      }
    : {
        textarea: elements.toolOutput,
        preview: elements.toolOutputHighlight,
        input: elements.outputSearch,
        previous: elements.outputSearchPrevious,
        next: elements.outputSearchNext,
        count: elements.outputSearchCount,
        row: elements.outputSearchRow,
        table: elements.toolTableOutput
      };
}

function setOutputSearchRowVisible(scope, visible) {
  getOutputSearchParts(scope).row.hidden = !visible;
}

function getOutputViewParts(scope) {
  return scope === "workflow"
    ? {
        tabs: elements.workflowOutputViewTabs,
        note: elements.workflowOutputViewNote,
        actions: elements.workflowOutputActions,
        copyButton: elements.workflowCopyOutput,
        downloadButton: elements.workflowDownloadOutput,
        textarea: elements.workflowOutput,
        preview: elements.workflowOutputHighlight,
        table: elements.workflowTableOutput
      }
    : {
        tabs: elements.outputViewTabs,
        actions: elements.toolOutputActions,
        copyButton: elements.copyOutput,
        downloadButton: elements.downloadOutput,
        textarea: elements.toolOutput,
        preview: elements.toolOutputHighlight,
        table: elements.toolTableOutput
      };
}

function getOutputActionKind(mimeType = "", label = "") {
  const normalized = `${mimeType} ${label}`.toLowerCase();
  if (normalized.includes("svg")) {
    return "SVG";
  }
  if (normalized.includes("fasta")) {
    return "FASTA";
  }
  if (normalized.includes("csv")) {
    return "CSV";
  }
  if (normalized.includes("tsv") || normalized.includes("tab-separated")) {
    return "TSV";
  }
  if (normalized.includes("json")) {
    return "JSON";
  }
  if (normalized.includes("report")) {
    return "report";
  }
  return "text";
}

function updateOutputActions(scope, { hidden = false, mimeType = "", label = "" } = {}) {
  const parts = getOutputViewParts(scope);
  parts.actions.hidden = hidden;
  if (scope === "tool" && elements.downloadPngOutput) {
    elements.downloadPngOutput.hidden = true;
  }
  if (hidden) {
    return;
  }
  const kind = getOutputActionKind(mimeType, label);
  parts.downloadButton.textContent = `Download ${kind}`;
  parts.copyButton.textContent = `Copy ${kind}`;
}

function appendOutputText(parent, text) {
  if (text) {
    parent.append(document.createTextNode(text));
  }
}

function appendOutputHighlightSegments(parent, segments) {
  for (const segment of segments) {
    if (segment.type !== "match") {
      appendOutputText(parent, segment.text);
      continue;
    }
    const mark = document.createElement("mark");
    mark.className = segment.current ? "current-output-match" : "";
    mark.textContent = segment.text;
    parent.append(mark);
  }
}

function renderOutputHighlight(scope) {
  const search = state.outputSearch[scope];
  const parts = getOutputSearchParts(scope);
  const query = parts.input.value;
  parts.preview.textContent = "";

  if (!query || search.matches.length === 0) {
    parts.preview.hidden = true;
    parts.textarea.style.visibility = "";
    return;
  }

  const model = getOutputHighlightModel(parts.textarea.value, search.matches, search.currentIndex);
  if (model.mode === "none") {
    parts.preview.hidden = true;
    parts.textarea.style.visibility = "";
    return;
  }
  appendOutputHighlightSegments(parts.preview, model.segments);
  parts.preview.hidden = false;
  parts.textarea.style.visibility = "hidden";
}

function selectOutputMatch(scope) {
  if (isTableViewActive(scope)) {
    selectTableOutputMatch(scope);
    return;
  }
  const search = state.outputSearch[scope];
  const parts = getOutputSearchParts(scope);
  if (search.currentIndex < 0 || search.matches.length === 0) {
    return;
  }
  if (!parts.preview.hidden) {
    const mark = parts.preview.querySelector(".current-output-match");
    if (mark) {
      const verticalTarget = mark.offsetTop - parts.preview.clientHeight / 2 + mark.offsetHeight / 2;
      const horizontalTarget = mark.offsetLeft - parts.preview.clientWidth / 2 + mark.offsetWidth / 2;
      parts.preview.scrollTop = Math.max(0, verticalTarget);
      parts.preview.scrollLeft = Math.max(0, horizontalTarget);
    }
    return;
  }
  const match = search.matches[search.currentIndex];
  parts.textarea.focus({ preventScroll: true });
  parts.textarea.setSelectionRange(match.start, match.end);
}

function renderOutputSearch(scope) {
  if (isTableViewActive(scope)) {
    renderTableOutputSearch(scope);
    return;
  }
  const search = state.outputSearch[scope];
  const parts = getOutputSearchParts(scope);
  if (parts.textarea.dataset.visualOutput === "true") {
    search.matches = [];
    search.currentIndex = -1;
    parts.count.textContent = getOutputSearchCountText();
    parts.previous.disabled = true;
    parts.next.disabled = true;
    parts.preview.hidden = true;
    parts.preview.textContent = "";
    return;
  }
  const query = parts.input.value;
  if (!query) {
    search.matches = [];
    search.currentIndex = -1;
    parts.count.textContent = getOutputSearchCountText();
    parts.previous.disabled = true;
    parts.next.disabled = true;
    renderOutputHighlight(scope);
    return;
  }

  search.matches = findLiteralMatches(parts.textarea.value, query);
  search.currentIndex = search.matches.length > 0 ? 0 : -1;
  parts.count.textContent = getOutputSearchCountText({
    query,
    matchCount: search.matches.length,
    currentIndex: search.currentIndex
  });
  parts.previous.disabled = search.matches.length < 2;
  parts.next.disabled = search.matches.length < 2;
  renderOutputHighlight(scope);
  selectOutputMatch(scope);
}

function queueOutputSearch(scope) {
  window.clearTimeout(state.outputSearch[scope].debounceTimer);
  state.outputSearch[scope].debounceTimer = window.setTimeout(() => {
    renderOutputSearch(scope);
    getOutputSearchParts(scope).input.closest(".output-search-row")?.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  }, 180);
}

function moveOutputSearch(scope, direction) {
  const search = state.outputSearch[scope];
  if (search.matches.length === 0) {
    return;
  }
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  search.currentIndex = getNextSearchIndex(search.currentIndex, search.matches.length, direction);
  const parts = getOutputSearchParts(scope);
  parts.count.textContent = getOutputSearchCountText({
    query: parts.input.value,
    matchCount: search.matches.length,
    currentIndex: search.currentIndex
  });
  if (isTableViewActive(scope)) {
    selectTableOutputMatch(scope);
    window.scrollTo(scrollX, scrollY);
    requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
    return;
  }
  renderOutputHighlight(scope);
  selectOutputMatch(scope);
  window.scrollTo(scrollX, scrollY);
  requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
}

function rememberPageScrollForOutputButton(event) {
  const button = event.currentTarget;
  button.dataset.pageScrollX = String(window.scrollX);
  button.dataset.pageScrollY = String(window.scrollY);
  event.preventDefault();
}

function restorePageScrollForOutputButton(event) {
  const button = event.currentTarget;
  const scrollX = Number.parseFloat(button.dataset.pageScrollX ?? String(window.scrollX));
  const scrollY = Number.parseFloat(button.dataset.pageScrollY ?? String(window.scrollY));
  window.scrollTo(scrollX, scrollY);
  requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
  window.setTimeout(() => window.scrollTo(scrollX, scrollY), 0);
}

function keepOutputSearchButtonFromScrollingPage(button) {
  button.addEventListener("mousedown", rememberPageScrollForOutputButton);
  button.addEventListener("click", restorePageScrollForOutputButton);
}

function resetToolOutputViewer(message = "Run this tool to generate the selected output.") {
  elements.toolOutput.value = "";
  elements.toolOutput.dataset.rawOutput = "";
  elements.toolOutput.dataset.tableTsv = "";
  elements.toolOutput.dataset.visualOutput = "false";
  elements.toolOutput.dataset.pngOutput = "";
  elements.toolOutputHighlight.hidden = true;
  elements.toolOutputHighlight.textContent = "";
  elements.toolOutputEmpty.textContent = message;
  elements.toolOutputEmpty.hidden = false;
  clearToolTableOutput();
  elements.toolOutput.hidden = true;
  elements.toolOutput.style.visibility = "";
  elements.visualOutput.hidden = true;
  elements.visualOutput.textContent = "";
  elements.messages.textContent = "";
  state.currentToolOutputChoices = [];
  state.currentToolDescription = "";
  elements.outputFormatSelect.textContent = "";
  elements.outputViewTabs.hidden = true;
  elements.toolOutputActions.hidden = true;
  elements.outputSearch.value = "";
  setOutputSearchRowVisible("tool", false);
  elements.outputSearchCount.textContent = getOutputSearchCountText();
  elements.outputSearchPrevious.disabled = true;
  elements.outputSearchNext.disabled = true;
  setOutputFormatLabel("tool", null);
  renderOutputSearch("tool");
}

function clearToolOutput() {
  resetToolOutputViewer();
}

function getOutputFormatOption(tool = state.selectedTool) {
  return flattenOptions(tool?.metadata.options ?? []).find((option) => option.id === "outputFormat");
}

function getSelectedToolOutputFormat(tool = state.selectedTool) {
  const option = getOutputFormatOption(tool);
  if (!option) {
    return null;
  }
  const selected = elements.toolOptions.querySelector(`select[name="${option.id}"]`)?.value
    ?? elements.toolOptions.querySelector(`input[name="${option.id}"]:checked`)?.value;
  return selected ?? option.defaultValue;
}

function getCurrentToolOutputFormatLabel(result) {
  const options = flattenOptions(state.selectedTool.metadata.options ?? []);
  const values = getOptions();
  const formatOption = options.find((option) => option.id === "outputFormat")
    ?? options.find((option) => option.label === "Output format");

  if (formatOption) {
    const choice = (formatOption.choices ?? []).find((item) => item.value === values[formatOption.id]);
    if (choice?.label) {
      return choice.label;
    }
  }

  const filename = result.download?.filename?.toLowerCase() ?? "";
  const mimeType = result.download?.mimeType ?? "";
  if (filename.endsWith(".tsv") || mimeType === "text/tab-separated-values") {
    return "Table";
  }
  if (filename.endsWith(".csv") || mimeType === "text/csv") {
    return "Table";
  }
  if (filename.endsWith(".svg") || mimeType.includes("svg")) {
    return "Visual output";
  }
  if (filename.endsWith(".fasta") || filename.endsWith(".fa")) {
    return "FASTA";
  }
  if (mimeType.includes("json")) {
    return "JSON";
  }
  return "Text";
}

function normalizeStreamSelector(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function scoreTableStreamForFormat(streamId, selectedFormat) {
  const id = normalizeStreamSelector(streamId);
  const format = normalizeStreamSelector(selectedFormat);
  if (!format) {
    return 0;
  }
  let score = 0;
  if (id === format) {
    score += 20;
  }
  if (format.includes(id) || id.includes(format)) {
    score += 12;
  }
  if (format.includes("summary") && id.includes("summary")) {
    score += 10;
  }
  if ((format.includes("missing") || format.includes("rows")) && id.includes("missing")) {
    score += 10;
  }
  if ((format.includes("issue") || format.includes("validat")) && id.includes("issue")) {
    score += 10;
  }
  if ((format.includes("duplicate") || format.includes("dup")) && id.includes("duplicate")) {
    score += 10;
  }
  if ((format.includes("offtarget") || format.includes("reference")) && (id.includes("offtarget") || id.includes("reference"))) {
    score += 14;
  }
  return score;
}

function getDelimitedTableStream(result, selectedFormat) {
  const tableStreams = Object.entries(result.streams ?? {}).filter(
    ([, stream]) => stream?.kind === "table" && Array.isArray(stream.rows)
  );
  if (tableStreams.length === 0) {
    return null;
  }
  if (tableStreams.length === 1) {
    return tableStreams[0][1];
  }
  const ranked = tableStreams
    .map(([id, stream], index) => ({ id, stream, index, score: scoreTableStreamForFormat(id, selectedFormat) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  if (ranked[0].score > 0) {
    return ranked[0].stream;
  }
  return result.streams?.table?.kind === "table" ? result.streams.table : ranked[0].stream;
}

function resetOutputTableSort(scope) {
  state.outputTable[scope].sortColumn = null;
  state.outputTable[scope].sortDirection = "asc";
  state.outputTable[scope].hiddenColumns = new Set();
  state.outputTable[scope].columnPreset = "all";
}

function clearTableOutput(scope) {
  const parts = getOutputViewParts(scope);
  parts.table.hidden = true;
  parts.table.textContent = "";
  parts.table.dataset.active = "false";
  parts.table.dataset.hasTable = "false";
  parts.table._tableStream = null;
  parts.textarea.hidden = false;
  parts.textarea.style.visibility = "";
  resetOutputTableSort(scope);
}

function clearToolTableOutput() {
  clearTableOutput("tool");
}

function clearWorkflowTableOutput() {
  clearTableOutput("workflow");
}

function isTableViewActive(scope) {
  const table = getOutputViewParts(scope).table;
  return table.dataset.active === "true" && !table.hidden;
}

function setOutputFormatLabel(scope, label) {
  const parts = getOutputViewParts(scope);
  const selectedLabel = label || "Not run";
  if (scope === "workflow") {
    parts.tabs.hidden = !label;
    parts.note.textContent = selectedLabel;
  }
}

function appendHighlightedCellText(parent, text, query) {
  const source = String(text ?? "");
  if (!query) {
    parent.textContent = source;
    return false;
  }
  const lowerSource = source.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const start = lowerSource.indexOf(lowerQuery);
  if (start === -1) {
    parent.textContent = source;
    return false;
  }
  parent.append(document.createTextNode(source.slice(0, start)));
  const mark = document.createElement("mark");
  mark.textContent = source.slice(start, start + query.length);
  parent.append(mark, document.createTextNode(source.slice(start + query.length)));
  return true;
}

function getTableViewData(scope, stream) {
  return buildTableViewData(stream, state.outputTable[scope]);
}

function getTableSortLabel(scope, column) {
  if (state.outputTable[scope].sortColumn !== column.id) {
    return "";
  }
  return state.outputTable[scope].sortDirection === "desc" ? " desc" : " asc";
}

function applyTableColumnPreset(scope, columns, preset) {
  const tableState = state.outputTable[scope];
  const { preset: selected, hiddenColumns } = getHiddenColumnsForPreset(columns, preset);
  tableState.columnPreset = selected.id;
  tableState.hiddenColumns = hiddenColumns;
}

function getVisibleTableText(scope, stream) {
  const { visibleColumns, displayedRows } = getTableViewData(scope, stream);
  return getOutputViewParts(scope).textarea.dataset.mimeType === "text/csv"
    ? tableRowsToCsv(visibleColumns, displayedRows)
    : tableRowsToTsv(visibleColumns, displayedRows);
}

function getFullTableText(scope, stream) {
  const { visibleColumns, sortedRows } = getTableViewData(scope, stream);
  return getOutputViewParts(scope).textarea.dataset.mimeType === "text/csv"
    ? tableRowsToCsv(visibleColumns, sortedRows)
    : tableRowsToTsv(visibleColumns, sortedRows);
}

function getTableDelimitedFormatLabel(scope) {
  return getBaseMimeType(getOutputViewParts(scope).textarea.dataset.mimeType) === "text/csv" ? "CSV" : "TSV";
}

function getTableXlsxFilename(scope, suffix = "table") {
  const parts = getOutputViewParts(scope);
  const filename = parts.textarea.dataset.filename ?? (scope === "workflow" ? "sms3-workflow-output.xlsx" : "sms3-output.xlsx");
  return filename.toLowerCase().endsWith(".xlsx")
    ? filename.replace(/\.xlsx$/i, `-${suffix}.xlsx`)
    : `${filename.replace(/\.[^.]+$/, "")}-${suffix}.xlsx`;
}

async function downloadTableAsXlsx(columns, rows, filename) {
  if (!window.ExcelJS?.Workbook) {
    throw new Error("Excel export library is not available.");
  }
  const cellCount = rows.length * Math.max(1, columns.length);
  if (rows.length > XLSX_EXPORT_ROW_LIMIT || cellCount > XLSX_EXPORT_CELL_LIMIT) {
    throw new Error(
      `XLSX export is limited to ${XLSX_EXPORT_ROW_LIMIT.toLocaleString()} rows or ${XLSX_EXPORT_CELL_LIMIT.toLocaleString()} cells in the browser. Download TSV/CSV for this larger table.`
    );
  }
  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = "SMS3";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Table");
  worksheet.columns = columns.map((column) => ({
    header: column.label ?? column.id,
    key: column.id,
    width: Math.max(10, Math.min(42, String(column.label ?? column.id).length + 4))
  }));
  for (const row of rows) {
    worksheet.addRow(Object.fromEntries(columns.map((column) => [column.id, row[column.id] ?? ""])));
  }
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(1, columns.length) }
  };
  const header = worksheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
}

function getVisibleTableFilename(scope, suffix = "visible") {
  const parts = getOutputViewParts(scope);
  const filename = parts.textarea.dataset.filename ?? (scope === "workflow" ? "sms3-workflow-output.tsv" : "sms3-output.tsv");
  const extension = getBaseMimeType(parts.textarea.dataset.mimeType) === "text/csv" ? "csv" : "tsv";
  if (!suffix) {
    return filename.toLowerCase().match(/\.(csv|tsv)$/) ? filename : `${filename}.${extension}`;
  }
  return filename.toLowerCase().match(/\.(csv|tsv)$/)
    ? filename.replace(/\.(csv|tsv)$/i, `-${suffix}.${extension}`)
    : `${filename}-${suffix}.${extension}`;
}

function getVisibleTableMimeType(scope) {
  return getBaseMimeType(getOutputViewParts(scope).textarea.dataset.mimeType) === "text/csv"
    ? "text/csv"
    : "text/tab-separated-values";
}

function renderTableControls(scope, stream, columns, sortedRows, displayedRows, isPreview) {
  const tableState = state.outputTable[scope];
  const isXlsxOutput = getBaseMimeType(getOutputViewParts(scope).textarea.dataset.mimeType) === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const visibleColumns = getVisibleColumnsForTable(columns, tableState.hiddenColumns);
  const hasHiddenColumns = tableState.hiddenColumns.size > 0;
  const delimitedFormat = getTableDelimitedFormatLabel(scope);
  const visibleScopeText = getTableActionScopeText({ isPreview, hasHiddenColumns });
  const fullRowsScopeText = hasHiddenColumns ? "all rows and visible columns" : "all rows and columns";
  const controls = document.createElement("div");
  controls.className = "table-output-controls";

  const actions = document.createElement("div");
  actions.className = "table-output-actions";

  const appendXlsxDownloadButton = ({ rows, label, suffix, title }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.disabled = rows.length === 0;
    button.addEventListener("click", async () => {
      try {
        await downloadTableAsXlsx(visibleColumns, rows, getTableXlsxFilename(scope, suffix));
      } catch (error) {
        addMessage(error.message, "warning");
      }
    });
    actions.append(button);
  };

  const copyVisible = document.createElement("button");
  copyVisible.type = "button";
  copyVisible.textContent = isPreview ? "Copy preview" : "Copy table";
  copyVisible.title = `Copy ${visibleScopeText} as ${delimitedFormat}`;
  copyVisible.disabled = displayedRows.length === 0;
  copyVisible.addEventListener("click", async () => {
    await navigator.clipboard.writeText(getVisibleTableText(scope, stream));
  });
  actions.append(copyVisible);

  const downloadVisible = document.createElement("button");
  downloadVisible.type = "button";
  downloadVisible.textContent = isXlsxOutput ? "Download XLSX" : isPreview ? `Download preview ${delimitedFormat}` : `Download ${delimitedFormat}`;
  downloadVisible.title = isXlsxOutput
    ? `Download ${visibleScopeText} as an Excel workbook`
    : `Download ${visibleScopeText} as ${delimitedFormat}`;
  downloadVisible.disabled = displayedRows.length === 0;
  downloadVisible.addEventListener("click", async () => {
    try {
      if (isXlsxOutput) {
        await downloadTableAsXlsx(
          visibleColumns,
          displayedRows,
          getTableXlsxFilename(scope, isPreview ? "preview" : hasHiddenColumns ? "visible" : "table")
        );
        return;
      }
      downloadText(
        getVisibleTableText(scope, stream),
        getVisibleTableFilename(scope, isPreview ? "preview" : hasHiddenColumns ? "visible" : ""),
        getVisibleTableMimeType(scope)
      );
    } catch (error) {
      addMessage(error.message, "warning");
    }
  });
  actions.append(downloadVisible);

  if (!isXlsxOutput) {
    appendXlsxDownloadButton({
      rows: displayedRows,
      label: isPreview ? "Download preview XLSX" : "Download XLSX",
      suffix: isPreview ? "preview" : "table",
      title: `Download ${visibleScopeText} as an Excel workbook`
    });
  }

  if (isPreview) {
    const copyAll = document.createElement("button");
    copyAll.type = "button";
    copyAll.textContent = "Copy all rows";
    copyAll.title = `Copy ${fullRowsScopeText} as ${delimitedFormat}`;
    copyAll.disabled = sortedRows.length === 0;
    copyAll.addEventListener("click", async () => {
      await navigator.clipboard.writeText(getFullTableText(scope, stream));
    });
    actions.append(copyAll);

    const downloadAll = document.createElement("button");
    downloadAll.type = "button";
    downloadAll.textContent = isXlsxOutput ? "Download all XLSX" : `Download all ${delimitedFormat}`;
    downloadAll.title = isXlsxOutput
      ? `Download ${fullRowsScopeText} as an Excel workbook`
      : `Download ${fullRowsScopeText} as ${delimitedFormat}`;
    downloadAll.disabled = sortedRows.length === 0;
    downloadAll.addEventListener("click", async () => {
      try {
        if (isXlsxOutput) {
          await downloadTableAsXlsx(visibleColumns, sortedRows, getTableXlsxFilename(scope, "all"));
          return;
        }
        downloadText(
          getFullTableText(scope, stream),
          getVisibleTableFilename(scope, "all"),
          getVisibleTableMimeType(scope)
        );
      } catch (error) {
        addMessage(error.message, "warning");
      }
    });
    actions.append(downloadAll);

    if (!isXlsxOutput) {
      appendXlsxDownloadButton({
        rows: sortedRows,
        label: "Download all XLSX",
        suffix: "all",
        title: `Download ${fullRowsScopeText} as an Excel workbook`
      });
    }
  }

  controls.append(actions);

  const options = document.createElement("div");
  options.className = "table-output-options";

  const columnDetails = document.createElement("details");
  columnDetails.className = "table-column-chooser";
  const columnSummary = document.createElement("summary");
  const hiddenCount = tableState.hiddenColumns.size;
  columnSummary.textContent = hiddenCount > 0
    ? `${columns.length - hiddenCount} of ${columns.length} columns`
    : `All ${columns.length} columns`;
  columnDetails.append(columnSummary);

  const columnPanel = document.createElement("div");
  columnPanel.className = "table-column-panel";

  const presets = getColumnPresetDefinitions(columns);
  if (presets.length > 1) {
    const presetLabel = document.createElement("label");
    presetLabel.textContent = "Column set";
    const presetSelect = document.createElement("select");
    presetSelect.className = "table-column-preset";
    for (const preset of presets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.label;
      presetSelect.append(option);
    }
    presetSelect.value = presets.some((preset) => preset.id === tableState.columnPreset)
      ? tableState.columnPreset
      : "all";
    presetSelect.addEventListener("change", () => {
      applyTableColumnPreset(scope, columns, presetSelect.value);
      renderTableOutputSearch(scope);
    });
    presetLabel.append(presetSelect);
    columnPanel.append(presetLabel);
  }

  const columnGrid = document.createElement("div");
  columnGrid.className = "table-column-grid";
  for (const column of columns) {
    const columnLabel = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !tableState.hiddenColumns.has(column.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        tableState.hiddenColumns.delete(column.id);
      } else if (columns.length - tableState.hiddenColumns.size > 1) {
        tableState.hiddenColumns.add(column.id);
      }
      tableState.columnPreset = "custom";
      renderTableOutputSearch(scope);
    });
    columnLabel.append(checkbox, document.createTextNode(column.label ?? column.id));
    columnGrid.append(columnLabel);
  }
  columnPanel.append(columnGrid);
  columnDetails.append(columnPanel);
  options.append(columnDetails);
  controls.append(options);

  return controls;
}

function renderTableStream(scope, stream, query = "") {
  const parts = getOutputViewParts(scope);
  parts.table.textContent = "";
  const { rows, columns, visibleColumns, sortedRows, displayedRows, isPreview, cellCount } = getTableViewData(scope, stream);
  const heading = document.createElement("h4");
  heading.className = "table-output-heading";
  heading.textContent = "Table";
  const summary = document.createElement("div");
  summary.className = "table-output-summary";
  const sortColumn = visibleColumns.find((column) => column.id === state.outputTable[scope].sortColumn);
  summary.textContent = `${isPreview ? `${displayedRows.length.toLocaleString()} displayed from ` : ""}${sortedRows.length.toLocaleString()} of ${pluralize(rows.length, "row")}, ${visibleColumns.length.toLocaleString()} of ${pluralize(columns.length, "column")}${
    sortColumn ? `; sorted by ${sortColumn.label ?? sortColumn.id} ${state.outputTable[scope].sortDirection}` : ""
  }`;
  parts.table.append(heading, summary);
  if (isPreview) {
    const warning = document.createElement("div");
    warning.className = "table-output-warning";
    warning.textContent = `Large table preview: rendering ${pluralize(displayedRows.length, "row")} from ${pluralize(sortedRows.length, "row")} (${cellCount.toLocaleString()} cells). Use Copy all rows or Download all ${getTableDelimitedFormatLabel(scope)} for the full visible-column data.`;
    parts.table.append(warning);
  }
  parts.table.append(renderTableControls(scope, stream, columns, sortedRows, displayedRows, isPreview));
  const table = document.createElement("table");
  table.className = "result-table";
  table.style.setProperty("--visible-table-columns", Math.max(1, visibleColumns.length));
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const column of visibleColumns) {
    const th = document.createElement("th");
    th.scope = "col";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "table-sort-button";
    button.textContent = `${column.label ?? column.id}${getTableSortLabel(scope, column)}`;
    button.addEventListener("click", () => {
      if (state.outputTable[scope].sortColumn === column.id) {
        state.outputTable[scope].sortDirection = state.outputTable[scope].sortDirection === "asc" ? "desc" : "asc";
      } else {
        state.outputTable[scope].sortColumn = column.id;
        state.outputTable[scope].sortDirection = column.type === "number" ? "desc" : "asc";
      }
      renderTableOutputSearch(scope);
    });
    th.append(button);
    headerRow.append(th);
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const row of displayedRows) {
    const tr = document.createElement("tr");
    for (const column of visibleColumns) {
      const td = document.createElement("td");
      const matched = appendHighlightedCellText(td, row[column.id] ?? "", query);
      if (matched) {
        td.classList.add("output-table-match");
      }
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  parts.table.append(table);
}

function renderTableOutputSearch(scope) {
  const search = state.outputSearch[scope];
  const parts = getOutputSearchParts(scope);
  const query = parts.input.value;
  const tableStream = parts.table._tableStream;
  if (!tableStream) {
    renderOutputSearch(scope);
    return;
  }
  renderTableStream(scope, tableStream, query);
  const matches = [...parts.table.querySelectorAll(".output-table-match")];
  search.matches = matches;
  search.currentIndex = query && matches.length > 0 ? 0 : -1;
  const summary = parts.table.querySelector(".table-output-summary");
  if (summary && query) {
    summary.textContent += `; ${pluralize(matches.length, "matching cell")}`;
  }
  parts.count.textContent = getOutputSearchCountText({
    query,
    matchCount: matches.length,
    currentIndex: search.currentIndex
  });
  parts.previous.disabled = matches.length < 2;
  parts.next.disabled = matches.length < 2;
  selectTableOutputMatch(scope);
}

function scrollElementInsideContainer(element, container) {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  container.scrollTop += elementRect.top - containerRect.top - container.clientHeight / 2 + elementRect.height / 2;
  container.scrollLeft += elementRect.left - containerRect.left - container.clientWidth / 2 + elementRect.width / 2;
}

function selectTableOutputMatch(scope) {
  const search = state.outputSearch[scope];
  const matches = search.matches ?? [];
  for (const cell of matches) {
    cell.classList.remove("current-output-table-match");
  }
  if (search.currentIndex < 0 || matches.length === 0) {
    return;
  }
  const cell = matches[search.currentIndex];
  cell.classList.add("current-output-table-match");
  scrollElementInsideContainer(cell, getOutputViewParts(scope).table);
}

function renderTableOutputForScope(scope, tableStream, preferTable = false) {
  const parts = getOutputViewParts(scope);
  const hasTable = Boolean(tableStream?.columns?.length && Array.isArray(tableStream.rows));
  parts.table._tableStream = hasTable ? tableStream : null;
  parts.table.dataset.hasTable = String(hasTable);
  parts.textarea.dataset.tableTsv = hasTable ? tableStreamToTsv(tableStream) : "";
  parts.textarea.dataset.visualOutput = "false";
  resetOutputTableSort(scope);

  if (!hasTable) {
    clearTableOutput(scope);
    return;
  }

  renderTableStream(scope, tableStream);
  parts.table.hidden = false;
  parts.table.dataset.active = preferTable ? "true" : "false";
  parts.textarea.hidden = preferTable;
  parts.preview.hidden = true;
  parts.textarea.style.visibility = "";
  renderOutputSearch(scope);
}

function renderWorkflowTableOutput(tableStream, preferTable = false) {
  renderTableOutputForScope("workflow", tableStream, preferTable);
}

function getVisualOutputElement(scope) {
  return scope === "workflow" ? elements.workflowVisualOutput : elements.visualOutput;
}

function renderMarkdownNotebook(container, notebook = {}) {
  const panel = document.createElement("section");
  panel.className = "markdown-notebook-panel";

  const toolbar = document.createElement("div");
  toolbar.className = "markdown-notebook-toolbar";

  const title = document.createElement("div");
  title.className = "markdown-notebook-title";
  title.textContent = notebook.title || "SMS3 Notebook";

  const filenameLabel = document.createElement("label");
  filenameLabel.className = "markdown-notebook-filename";
  filenameLabel.textContent = "Download name";
  const filenameInput = document.createElement("input");
  filenameInput.type = "text";
  filenameInput.value = notebook.filename || "sms3-notebook.md";
  filenameInput.setAttribute("aria-label", "Markdown download name");
  filenameLabel.append(filenameInput);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save draft";

  const loadButton = document.createElement("button");
  loadButton.type = "button";
  loadButton.textContent = "Load draft";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy Markdown";

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.textContent = "Download .md";

  const status = document.createElement("span");
  status.className = "markdown-notebook-status";
  status.textContent = "Saved drafts stay on this computer in this browser profile. Download .md when you want a regular file.";

  toolbar.append(title, filenameLabel, saveButton, loadButton, copyButton, downloadButton, status);

  const editor = document.createElement("textarea");
  editor.className = "markdown-notebook-editor";
  editor.spellcheck = true;
  editor.value = notebook.markdown || "";
  editor.setAttribute("aria-label", "Markdown notebook editor");

  let autosaveTimer = null;
  const getFilename = () => filenameInput.value.trim() || "sms3-notebook.md";
  const setStatus = (message) => {
    status.textContent = message;
  };
  const saveDraft = async (source = "Saved") => {
    try {
      await saveMarkdownNotebookDraft({ markdown: editor.value, filename: getFilename() });
      setStatus(`${source} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setStatus(error.message || "Draft save failed");
    }
  };

  editor.addEventListener("input", () => {
    setStatus("Unsaved changes");
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveDraft("Autosaved"), 1200);
  });
  saveButton.addEventListener("click", () => saveDraft("Saved"));
  loadButton.addEventListener("click", async () => {
    try {
      const draft = await loadMarkdownNotebookDraft();
      if (!draft) {
        setStatus("No saved draft found");
        return;
      }
      editor.value = draft.markdown ?? "";
      filenameInput.value = draft.filename ?? getFilename();
      setStatus(`Loaded draft from ${new Date(draft.updatedAt).toLocaleString()}`);
    } catch (error) {
      setStatus(error.message || "Draft load failed");
    }
  });
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(editor.value);
    setStatus("Copied Markdown");
  });
  downloadButton.addEventListener("click", () => {
    downloadText(editor.value, getFilename(), "text/markdown;charset=utf-8");
    setStatus("Downloaded Markdown");
  });

  panel.append(toolbar, editor);
  container.append(panel);
}

function renderVisualOutput(scope, svg, options = {}) {
  const visualOutput = getVisualOutputElement(scope);
  if (typeof visualOutput._sms3VisualCleanup === "function") {
    try {
      visualOutput._sms3VisualCleanup();
    } finally {
      visualOutput._sms3VisualCleanup = null;
    }
  }
  if (!svg && !options.viewer && !options.figure && !options.proteinStructure && !options.notebook && !options.sangerTrace && !options.sequenceEditor) {
    visualOutput.hidden = true;
    visualOutput.textContent = "";
    return;
  }
  visualOutput.hidden = false;
  visualOutput.textContent = "";
  const heading = document.createElement("h4");
  heading.className = "visual-output-heading";
  heading.textContent = options.figure
    ? "Genome Figure"
    : options.sangerTrace
      ? "Sanger Trace Editor"
      : options.sequenceEditor
        ? "Sequence Editor"
      : options.proteinStructure
        ? options.proteinStructure.conservation
          ? "Protein Conservation Structure Viewer"
          : "Protein Structure Viewer"
        : options.viewer
          ? describeViewerStream(options.viewer, "heading")
          : options.notebook
            ? "Markdown Notebook"
            : "Plot";
  visualOutput.append(heading);
  if (options.notebook) {
    renderMarkdownNotebook(visualOutput, options.notebook);
    return "";
  }
  if (options.sangerTrace) {
    renderSangerTraceViewer(visualOutput, options.sangerTrace);
    return "";
  }
  if (options.sequenceEditor) {
    const sourceInput = document.createElement("textarea");
    const controller = createSequenceEditorWorkspaceController({
      elements: {
        markdownWorkspace: visualOutput,
        sequenceInput: sourceInput
      },
      state: {
        selectedTool: {
          example: options.sequenceEditor.input ?? ""
        }
      },
      addMessage
    });
    controller.render({
      text: options.sequenceEditor.input ?? "",
      geneticCode: options.sequenceEditor.geneticCode ?? "1",
      viewerLayout: options.sequenceEditor.viewerLayout === "circular" ? "circular" : "linear",
      filename: options.sequenceEditor.filename ?? "sequence-editor-cleaned.fasta",
      lineWidth: String(options.sequenceEditor.lineWidth ?? "60"),
      featureTrackOverrides: options.sequenceEditor.featureTrackOverrides ?? []
    });
    return "";
  }
  if (options.proteinStructure) {
    renderProteinStructureViewer(visualOutput, options.proteinStructure);
    return "";
  }
  if (options.figure) {
    renderGenomeFigure(visualOutput, options.figure);
    return "";
  }
  if (options.viewer) {
    const viewerOptions = { preserveState: options.preserveViewerState === true };
    if (options.viewer.viewerType === "protein-sequence-viewer") {
      renderProteinViewer(visualOutput, options.viewer, viewerOptions);
    } else if (options.viewer.layout === "circular") {
      renderCircularDnaViewer(visualOutput, options.viewer, viewerOptions);
    } else {
      renderDnaViewer(visualOutput, options.viewer, viewerOptions);
    }
    return "";
  }
  let displayedSvg = svg;
  const plotPreview = options.renderer === "observable-plot" ? renderObservablePlotPreview(options.plotSpec) : null;
  if (plotPreview) {
    visualOutput.append(plotPreview);
    displayedSvg = serializeSvgElement(plotPreview);
  } else {
    visualOutput.insertAdjacentHTML("beforeend", svg);
  }
  return displayedSvg;
}

function applyToolOutputChoice(choice) {
  const hasVisualOutput = Boolean(choice.svg || choice.viewer || choice.figure || choice.proteinStructure || choice.notebook || choice.sangerTrace || choice.sequenceEditor);
  const hasPrimaryOutput = Boolean(choice.text || choice.tableStream || hasVisualOutput);
  elements.toolOutput.dataset.rawOutput = choice.text;
  elements.toolOutput.value = choice.tableStream
    ? ""
    : getBaseMimeType(choice.download.mimeType) === "text/tab-separated-values"
      ? alignTsv(choice.text)
      : choice.text;
  elements.toolOutput.dataset.filename = choice.download.filename ?? "sms3-output.txt";
  elements.toolOutput.dataset.mimeType = choice.download.mimeType ?? "text/plain";
  setOutputFormatLabel("tool", choice.label);
  renderTableOutputForScope("tool", choice.tableStream, Boolean(choice.tableStream));
  const displayedSvg = renderVisualOutput("tool", choice.svg, {
    pngDownload: choice.pngDownload,
    filename: choice.download.filename,
    plotSpec: choice.plotSpec,
    renderer: choice.renderer,
    viewer: choice.viewer,
    figure: choice.figure,
    proteinStructure: choice.proteinStructure,
    notebook: choice.notebook,
    sangerTrace: choice.sangerTrace,
    sequenceEditor: choice.sequenceEditor
  });
  if (choice.svg && displayedSvg) {
    elements.toolOutput.dataset.rawOutput = displayedSvg;
    elements.toolOutput.value = displayedSvg;
    elements.toolOutput.dataset.pngOutput = displayedSvg;
  } else {
    elements.toolOutput.dataset.pngOutput = "";
  }
  elements.toolOutput.dataset.visualOutput = hasVisualOutput ? "true" : "false";
  elements.toolOutputEmpty.textContent = "Run completed with no primary output.";
  elements.toolOutputEmpty.hidden = hasPrimaryOutput;
  elements.toolOutput.hidden = Boolean(choice.tableStream || hasVisualOutput || !choice.text);
  setOutputSearchRowVisible("tool", Boolean(choice.tableStream || (!hasVisualOutput && choice.text)));
  updateOutputActions("tool", {
    hidden: Boolean(choice.tableStream || choice.viewer || choice.figure || choice.proteinStructure || choice.notebook || choice.sangerTrace || choice.sequenceEditor || (!choice.text && !choice.svg)),
    mimeType: choice.download.mimeType,
    label: choice.label
  });
  if (elements.downloadPngOutput) {
    elements.downloadPngOutput.hidden = !choice.svg;
  }
  renderOutputSearch("tool");
}

function renderGeneratedToolOutputChoice(result) {
  const selectedFormat = getSelectedToolOutputFormat(state.selectedTool) ?? "primary";
  const download = result.download ?? { filename: "sms3-output.txt", mimeType: "text/plain" };
  const isDelimitedOutput = isDelimitedDownload(selectedFormat, download);
  const isXlsxOutput = getBaseMimeType(download.mimeType) === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const svg = result.visual?.svg ?? (download.mimeType?.includes("svg") ? result.output : null);
  const workspaceLayerContext = workspaceInputSources.getToolLayerContext(state.selectedTool);
  const viewer = attachWorkspaceFeatureLayersToViewer(
    result.visual?.viewer ?? null,
    state.workspaceFeatureLayers,
    workspaceLayerContext
  );
  const figure = attachWorkspaceFeatureLayersToFigure(
    result.visual?.figure ?? null,
    state.workspaceFeatureLayers,
    workspaceLayerContext
  );
  const proteinStructure = result.visual?.proteinStructure ?? null;
  const notebook = result.visual?.notebook ?? null;
  const sangerTrace = result.visual?.sangerTrace ?? null;
  const sequenceEditor = result.visual?.sequenceEditor ?? null;
  const choice = {
    format: selectedFormat,
    label: getCurrentToolOutputFormatLabel(result),
    text: result.output,
    download,
    tableStream: isDelimitedOutput || isXlsxOutput ? getDelimitedTableStream(result, selectedFormat) : null,
    svg,
    pngDownload: Boolean(result.visual?.pngDownload),
    plotSpec: result.visual?.plotSpec,
    renderer: result.visual?.renderer,
    viewer,
    figure,
    proteinStructure,
    notebook,
    sangerTrace,
    sequenceEditor
  };
  state.currentToolOutputChoices = [choice];
  elements.outputFormatSelect.textContent = "";
  elements.outputFormatSelect.closest("label").hidden = true;
  elements.outputViewTabs.hidden = false;
  applyToolOutputChoice(choice);
}

  return {
    renderMessages,
    appendWarningSummary,
    appendOutputDetails,
    appendWorkflowWorkspacePromotionActions,
    buildToolOutputDescription,
    getWorkflowOutputDetails,
    setOutputSearchRowVisible,
    updateOutputActions,
    renderOutputSearch,
    queueOutputSearch,
    moveOutputSearch,
    keepOutputSearchButtonFromScrollingPage,
    resetToolOutputViewer,
    clearToolOutput,
    clearWorkflowTableOutput,
    setOutputFormatLabel,
    renderWorkflowTableOutput,
    renderVisualOutput,
    renderGeneratedToolOutputChoice
  };
}
