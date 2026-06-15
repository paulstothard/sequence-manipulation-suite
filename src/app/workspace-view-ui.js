import {
  deleteWorkspaceFeatureLayer,
  deleteWorkspaceSequence,
  saveWorkspaceFeatureLayer,
  saveWorkspaceSequence
} from "./workspace-storage.js";
import { parseSequenceInput } from "../core/fasta.js";
import { workspaceSamples } from "../examples/workspace-sample.js";

function fallbackPluralize(count, singular, plural = `${singular}s`) {
  const label = Math.abs(Number(count)) === 1 ? singular : plural;
  return `${Number(count).toLocaleString()} ${label}`;
}

function getPreferredViewerToolId(sequence = {}) {
  if (sequence.alphabet === "protein") {
    return "protein-sequence-viewer";
  }
  if (sequence.alphabet === "dna-rna" && sequence.topology === "circular") {
    return "circular-dna-sequence-viewer";
  }
  if (sequence.alphabet === "dna-rna") {
    return "dna-sequence-viewer";
  }
  return "";
}

function normalizeWorkspaceRecordForComparison(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeWorkspaceRecordForComparison(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "createdAt" && key !== "updatedAt")
      .sort()
      .map((key) => [key, normalizeWorkspaceRecordForComparison(value[key])])
  );
}

function recordsMatch(left, right) {
  return JSON.stringify(normalizeWorkspaceRecordForComparison(left)) ===
    JSON.stringify(normalizeWorkspaceRecordForComparison(right));
}

export function getPreferredWorkspaceToolId(sequence, compatibleTools, { hasFeatureLayers = false } = {}) {
  const toolIds = new Set(compatibleTools.map((tool) => tool.metadata.id));
  const preferredViewerId = getPreferredViewerToolId(sequence);
  if (hasFeatureLayers && toolIds.has(preferredViewerId)) {
    return preferredViewerId;
  }
  if (toolIds.has(preferredViewerId)) {
    return preferredViewerId;
  }
  return compatibleTools[0]?.metadata.id ?? "";
}

export function createWorkspaceViewController({
  body,
  getSequences,
  getFeatureLayers,
  setStorageStatus,
  getCompatibleTools,
  openSequenceInTool,
  refresh,
  pluralize = fallbackPluralize
}) {
  let activeSetupPanel = "";
  let sampleStatusMessage = "";
  let manualStatusMessage = "";
  let workspaceStatusMessage = "";
  let activeWorkspaceSequenceId = "";
  let workspaceListQuery = "";
  let workspaceListFilter = "all";
  let workspaceListSort = "newest";
  let refocusWorkspaceSearch = false;

  function splitGeneratedName(name = "") {
    const text = String(name || "Workspace sequence");
    const seedMatch = text.match(/\s+seed=([^\s]+)/i);
    if (!seedMatch) {
      return { title: text, seed: "" };
    }
    return {
      title: text.slice(0, seedMatch.index).trim() || text,
      seed: seedMatch[1]
    };
  }

  function slugifyFilename(value = "workspace-sequence") {
    return String(value || "workspace-sequence")
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "workspace-sequence";
  }

  function wrapSequence(sequence = "", width = 60) {
    const text = String(sequence || "").replace(/\s+/g, "");
    const lines = [];
    for (let index = 0; index < text.length; index += width) {
      lines.push(text.slice(index, index + width));
    }
    return lines.join("\n");
  }

  function sequenceToFasta(sequence = {}) {
    const name = String(sequence.name || "workspace_sequence").replace(/\s+/g, " ").trim();
    return `>${name}\n${wrapSequence(sequence.sequence)}\n`;
  }

  function downloadText(filename, text, type = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      workspaceStatusMessage = successMessage;
    } catch {
      workspaceStatusMessage = "Clipboard access is unavailable in this browser.";
    }
    setStorageStatus(workspaceStatusMessage);
    render();
  }

  function renderEmptyState(parent) {
    const empty = document.createElement("div");
    empty.className = "workspace-empty-state";
    empty.textContent =
      "No sequence records yet. Import one, load an example project, or save a sequence output from a tool.";
    parent.append(empty);
  }

  function getFeatureLayersForSequence(sequence) {
    return getFeatureLayers().filter((layer) => {
      if (sequence.id && layer.sequenceId) {
        return layer.sequenceId === sequence.id;
      }
      return Boolean(sequence.sequenceHash && layer.sequenceHash && layer.sequenceHash === sequence.sequenceHash);
    });
  }

  function getSequenceForFeatureLayer(layer) {
    return getSequences().find((sequence) => {
      if (sequence.id && layer.sequenceId) {
        return sequence.id === layer.sequenceId;
      }
      return Boolean(sequence.sequenceHash && layer.sequenceHash && sequence.sequenceHash === layer.sequenceHash);
    }) ?? null;
  }

  function getUnattachedFeatureLayers() {
    return getFeatureLayers().filter((layer) => !getSequenceForFeatureLayer(layer));
  }

  function getSequenceKindLabel(sequence = {}) {
    return sequence.alphabet === "protein" ? "Protein" : "DNA/RNA";
  }

  function getSequenceUnitLabel(sequence = {}) {
    return sequence.alphabet === "protein" ? "aa" : "bp";
  }

  function getSequenceMetaLabel(sequence = {}) {
    const length = Number(sequence.length ?? String(sequence.sequence ?? "").length);
    const formattedLength = Number.isFinite(length) ? length.toLocaleString() : "0";
    return `${getSequenceKindLabel(sequence)} - ${formattedLength} ${getSequenceUnitLabel(sequence)}`;
  }

  function getPrimaryViewerActionLabel(sequence = {}) {
    if (sequence.alphabet === "protein") {
      return "Open in Protein Sequence Viewer";
    }
    if (sequence.alphabet === "dna-rna" && sequence.topology === "circular") {
      return "Open in Circular DNA Sequence Viewer";
    }
    if (sequence.alphabet === "dna-rna") {
      return "Open in Linear DNA Sequence Viewer";
    }
    return "Open in Viewer";
  }

  function getFeatureLayerCount(sequences) {
    return sequences.reduce((total, sequence) => total + getFeatureLayersForSequence(sequence).length, 0);
  }

  function getSampleWorkspaceChanges(sample) {
    const sequenceById = new Map(getSequences().map((sequence) => [sequence.id, sequence]));
    const layerById = new Map(getFeatureLayers().map((layer) => [layer.id, layer]));
    const changes = {
      addedSequences: 0,
      updatedSequences: 0,
      addedFeatureLayers: 0,
      updatedFeatureLayers: 0
    };
    for (const sequence of sample.sequences) {
      const existing = sequenceById.get(sequence.id);
      if (!existing) {
        changes.addedSequences += 1;
      } else if (!recordsMatch(existing, sequence)) {
        changes.updatedSequences += 1;
      }
    }
    for (const layer of sample.featureLayers) {
      const existing = layerById.get(layer.id);
      if (!existing) {
        changes.addedFeatureLayers += 1;
      } else if (!recordsMatch(existing, layer)) {
        changes.updatedFeatureLayers += 1;
      }
    }
    return changes;
  }

  function describeSampleWorkspaceLoad(sample, changes) {
    const addedTotal = changes.addedSequences + changes.addedFeatureLayers;
    const updatedTotal = changes.updatedSequences + changes.updatedFeatureLayers;
    if (addedTotal === 0 && updatedTotal === 0) {
      return `${sample.name} is already in the workspace.`;
    }
    const sequenceCount = changes.addedSequences + changes.updatedSequences;
    const featureLayerCount = changes.addedFeatureLayers + changes.updatedFeatureLayers;
    const action = addedTotal > 0 && updatedTotal > 0
      ? "Added or updated"
      : (addedTotal > 0 ? "Added" : "Updated");
    return `${action} ${sample.name}: ${pluralize(sequenceCount, "sequence record")} and ${pluralize(featureLayerCount, "feature layer")}.`;
  }

  function getSelectedSequence(sequences) {
    if (sequences.length === 0) {
      activeWorkspaceSequenceId = "";
      return null;
    }
    const selected = sequences.find((sequence) => sequence.id === activeWorkspaceSequenceId);
    if (selected) {
      return selected;
    }
    activeWorkspaceSequenceId = sequences[0].id;
    return sequences[0];
  }

  function getVisibleSequences(sequences) {
    const query = workspaceListQuery.trim().toLowerCase();
    const filtered = sequences.filter((sequence) => {
      const featureLayers = getFeatureLayersForSequence(sequence);
      if (workspaceListFilter === "dna-rna" && sequence.alphabet !== "dna-rna") {
        return false;
      }
      if (workspaceListFilter === "protein" && sequence.alphabet !== "protein") {
        return false;
      }
      if (workspaceListFilter === "has-layers" && featureLayers.length === 0) {
        return false;
      }
      if (!query) {
        return true;
      }
      const searchable = [
        sequence.name,
        sequence.sourceToolName,
        getSequenceMetaLabel(sequence),
        ...featureLayers.map((layer) => layer.label || layer.name)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
    return [...filtered].sort((left, right) => {
      if (workspaceListSort === "name") {
        return String(left.name || "").localeCompare(String(right.name || ""));
      }
      if (workspaceListSort === "longest") {
        return Number(right.length ?? 0) - Number(left.length ?? 0);
      }
      return String(right.updatedAt).localeCompare(String(left.updatedAt));
    });
  }

  function renderLayerChips(featureLayers) {
    const chipList = document.createElement("div");
    chipList.className = "workspace-layer-chip-list";
    for (const layer of featureLayers) {
      const chip = document.createElement("span");
      chip.className = "workspace-layer-chip";
      chip.textContent = layer.label || "Feature layer";
      chipList.append(chip);
    }
    return chipList;
  }

  function renderSequenceListItem(sequence, selectedSequence) {
    const featureLayers = getFeatureLayersForSequence(sequence);
    const nameParts = splitGeneratedName(sequence.name);
    const item = document.createElement("article");
    item.className = "workspace-sequence-card workspace-sequence-row";
    if (selectedSequence?.id === sequence.id) {
      item.classList.add("is-selected");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-sequence-select";
    button.setAttribute("aria-pressed", String(selectedSequence?.id === sequence.id));
    button.title = sequence.name || "";
    button.addEventListener("click", () => {
      activeWorkspaceSequenceId = sequence.id;
      render();
    });

    const title = document.createElement("span");
    title.className = "workspace-sequence-row-title";
    title.textContent = nameParts.title;
    title.title = sequence.name || "";
    const meta = document.createElement("span");
    meta.className = "workspace-sequence-row-meta";
    meta.textContent = getSequenceMetaLabel(sequence);
    button.append(title, meta);
    if (nameParts.seed) {
      const seed = document.createElement("span");
      seed.className = "workspace-sequence-row-source workspace-sequence-row-seed";
      seed.textContent = `Seed: ${nameParts.seed}`;
      button.append(seed);
    }
    if (sequence.sourceToolName) {
      const source = document.createElement("span");
      source.className = "workspace-sequence-row-source";
      source.textContent = `Source: ${sequence.sourceToolName}`;
      button.append(source);
    }
    if (featureLayers.length > 0) {
      const layerCount = document.createElement("span");
      layerCount.className = "workspace-sequence-row-layers";
      layerCount.textContent = `${pluralize(featureLayers.length, "feature layer")} attached`;
      button.append(layerCount, renderLayerChips(featureLayers));
    }
    item.append(button);
    return item;
  }

  function renderFeatureLayerDetail(layer, sequence) {
    const detail = document.createElement("article");
    detail.className = "workspace-feature-layer-detail workspace-feature-layer-card";
    const heading = document.createElement("div");
    heading.className = "workspace-sequence-heading";
    const title = document.createElement("h4");
    title.textContent = layer.label || "Workspace feature layer";
    const meta = document.createElement("p");
    const alphabetLabel = layer.alphabet === "protein" ? "Protein" : "DNA/RNA";
    meta.textContent = `${alphabetLabel} feature layer - ${pluralize(layer.features?.length ?? 0, "feature")}`;
    heading.append(title, meta);

    const source = document.createElement("p");
    source.className = "workspace-layer-source";
    const sourceText = layer.generatedBy?.toolName
      ? `Created by ${layer.generatedBy.toolName}.`
      : "Created from a viewer output.";
    source.textContent = `${sourceText} Opens with ${sequence.name} in compatible viewers.`;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "workspace-danger-button";
    deleteButton.textContent = "Remove layer";
    deleteButton.addEventListener("click", async () => {
      await deleteWorkspaceFeatureLayer(layer.id);
      await refresh();
    });
    detail.append(heading, source, deleteButton);
    return detail;
  }

  async function renameWorkspaceSequence(sequence, nameInput) {
    const nextName = nameInput.value.trim();
    if (!nextName) {
      workspaceStatusMessage = "Enter a record name before renaming.";
      setStorageStatus(workspaceStatusMessage);
      render();
      return;
    }
    const saved = await saveWorkspaceSequence({
      ...sequence,
      name: nextName
    });
    activeWorkspaceSequenceId = saved.id;
    workspaceStatusMessage = `Renamed record to "${saved.name}".`;
    setStorageStatus(workspaceStatusMessage);
    await refresh();
    render();
  }

  async function duplicateWorkspaceSequence(sequence) {
    const saved = await saveWorkspaceSequence({
      ...sequence,
      id: "",
      name: `${sequence.name || "Workspace sequence"} copy`,
      createdAt: "",
      updatedAt: ""
    });
    activeWorkspaceSequenceId = saved.id;
    workspaceStatusMessage = `Duplicated "${sequence.name}".`;
    setStorageStatus(workspaceStatusMessage);
    await refresh();
    render();
  }

  function exportWorkspaceSequence(sequence) {
    downloadText(`${slugifyFilename(sequence.name)}.fasta`, sequenceToFasta(sequence), "text/x-fasta;charset=utf-8");
    workspaceStatusMessage = `Exported "${sequence.name}" as FASTA.`;
    setStorageStatus(workspaceStatusMessage);
    render();
  }

  function exportWorkspace() {
    const sequences = getSequences();
    const featureLayers = getFeatureLayers();
    const payload = {
      exportedAt: new Date().toISOString(),
      sequences,
      featureLayers
    };
    downloadText("sms3-workspace.json", `${JSON.stringify(payload, null, 2)}\n`, "application/json;charset=utf-8");
    workspaceStatusMessage = `Exported workspace with ${pluralize(sequences.length, "sequence record")} and ${pluralize(featureLayers.length, "feature layer")}.`;
    setStorageStatus(workspaceStatusMessage);
    render();
  }

  function renderSequenceInspector(sequence) {
    const inspector = document.createElement("section");
    inspector.className = "workspace-sequence-inspector";
    inspector.setAttribute("aria-label", "Selected sequence record details");
    if (!sequence) {
      const empty = document.createElement("div");
      empty.className = "workspace-inspector-empty";
      empty.textContent = "Select a sequence record to view its details and available tools.";
      inspector.append(empty);
      return inspector;
    }

    const featureLayers = getFeatureLayersForSequence(sequence);
    const nameParts = splitGeneratedName(sequence.name);
    const header = document.createElement("div");
    header.className = "workspace-inspector-header";
    const heading = document.createElement("div");
    heading.className = "workspace-sequence-heading";
    const title = document.createElement("h3");
    title.textContent = nameParts.title;
    title.title = sequence.name || "";
    const meta = document.createElement("p");
    meta.textContent = getSequenceMetaLabel(sequence);
    heading.append(title, meta);
    if (nameParts.seed) {
      const seed = document.createElement("p");
      seed.className = "workspace-sequence-summary";
      seed.textContent = `Seed: ${nameParts.seed}`;
      heading.append(seed);
    }
    if (sequence.sourceToolName) {
      const source = document.createElement("p");
      source.className = "workspace-sequence-summary";
      source.textContent = `Source: ${sequence.sourceToolName}.`;
      heading.append(source);
    }
    header.append(heading);
    if (featureLayers.length > 0) {
      const layerSummary = document.createElement("div");
      layerSummary.className = "workspace-inspector-layer-summary";
      const layerCount = document.createElement("strong");
      layerCount.textContent = pluralize(featureLayers.length, "feature layer");
      const layerText = document.createElement("span");
      layerText.textContent = " attached";
      layerSummary.append(layerCount, layerText, renderLayerChips(featureLayers));
      const viewerNote = document.createElement("span");
      viewerNote.textContent = "Shown automatically in compatible viewers.";
      layerSummary.append(viewerNote);
      header.append(layerSummary);
    }

    const compatibleTools = getCompatibleTools(sequence);
    const preferredToolId = getPreferredViewerToolId(sequence);
    const preferredTool = compatibleTools.find((tool) => tool.metadata.id === preferredToolId) ?? null;

    const toolSection = document.createElement("div");
    toolSection.className = "workspace-inspector-section workspace-tool-actions";
    const toolHeading = document.createElement("h4");
    toolHeading.textContent = "Open";
    toolSection.append(toolHeading);

    if (preferredTool) {
      const primaryButton = document.createElement("button");
      primaryButton.type = "button";
      primaryButton.className = "primary-button workspace-primary-viewer-button";
      primaryButton.textContent = getPrimaryViewerActionLabel(sequence);
      primaryButton.addEventListener("click", () => openSequenceInTool(sequence, preferredToolId));
      toolSection.append(primaryButton);
    }

    const selectableTools = preferredTool
      ? compatibleTools.filter((tool) => tool.metadata.id !== preferredToolId)
      : compatibleTools;
    if (selectableTools.length > 0) {
      const analyzeHeading = document.createElement("h4");
      analyzeHeading.textContent = "Analyze";
      const actionRow = document.createElement("div");
      actionRow.className = "workspace-tool-action-row";
      const label = document.createElement("label");
      label.className = "select-row workspace-tool-picker";
      label.textContent = "Analyze with";
      const select = document.createElement("select");
      for (const tool of selectableTools) {
        const option = document.createElement("option");
        option.value = tool.metadata.id;
        option.textContent = tool.metadata.name;
        select.append(option);
      }
      const fallbackToolId = getPreferredWorkspaceToolId(sequence, selectableTools, {
        hasFeatureLayers: featureLayers.length > 0
      });
      if (fallbackToolId) {
        select.value = fallbackToolId;
      }
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "Run";
      openButton.addEventListener("click", () => openSequenceInTool(sequence, select.value));
      label.append(select);
      actionRow.append(label, openButton);
      toolSection.append(analyzeHeading, actionRow);
    }

    const layerSection = document.createElement("div");
    layerSection.className = "workspace-inspector-section workspace-feature-layer-section";
    const layerHeading = document.createElement("h4");
    layerHeading.textContent = "Feature layers";
    layerSection.append(layerHeading);
    if (featureLayers.length === 0) {
      const emptyLayers = document.createElement("p");
      emptyLayers.className = "workspace-muted-note";
      emptyLayers.textContent = "No feature layers attached to this record.";
      layerSection.append(emptyLayers);
    } else {
      const layerList = document.createElement("div");
      layerList.className = "workspace-feature-layer-detail-list";
      for (const layer of featureLayers) {
        layerList.append(renderFeatureLayerDetail(layer, sequence));
      }
      layerSection.append(layerList);
    }

    const managementSection = document.createElement("div");
    managementSection.className = "workspace-inspector-section workspace-management-actions";
    const managementHeading = document.createElement("h4");
    managementHeading.textContent = "Manage record";
    const renameRow = document.createElement("div");
    renameRow.className = "workspace-manage-row workspace-rename-row";
    const renameLabel = document.createElement("label");
    renameLabel.className = "text-row workspace-rename-field";
    renameLabel.textContent = "Name";
    const renameInput = document.createElement("input");
    renameInput.type = "text";
    renameInput.value = sequence.name || "";
    renameLabel.append(renameInput);
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.textContent = "Rename";
    renameButton.addEventListener("click", () => renameWorkspaceSequence(sequence, renameInput));
    renameRow.append(renameLabel, renameButton);
    const managementButtons = document.createElement("div");
    managementButtons.className = "workspace-management-button-row";
    const duplicateButton = document.createElement("button");
    duplicateButton.type = "button";
    duplicateButton.textContent = "Duplicate";
    duplicateButton.addEventListener("click", () => duplicateWorkspaceSequence(sequence));
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = "Export FASTA";
    exportButton.addEventListener("click", () => exportWorkspaceSequence(sequence));
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy sequence";
    copyButton.addEventListener("click", () => copyText(sequence.sequence || "", `Copied "${sequence.name}" sequence.`));
    managementButtons.append(duplicateButton, exportButton, copyButton);
    const managementNote = document.createElement("p");
    managementNote.className = "workspace-muted-note";
    managementNote.textContent = featureLayers.length > 0
      ? "Removes this saved record and its attached feature layers from the local workspace."
      : "Removes this saved record from the local workspace.";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "workspace-danger-button";
    deleteButton.textContent = "Remove from workspace";
    deleteButton.addEventListener("click", async () => {
      for (const layer of getFeatureLayersForSequence(sequence)) {
        await deleteWorkspaceFeatureLayer(layer.id);
      }
      await deleteWorkspaceSequence(sequence.id);
      activeWorkspaceSequenceId = "";
      await refresh();
    });
    managementSection.append(managementHeading, renameRow, managementButtons, managementNote, deleteButton);

    inspector.append(header, toolSection, layerSection, managementSection);
    return inspector;
  }

  function renderFeatureLayerCard(layer, { attachedSequence = null } = {}) {
    const card = document.createElement("article");
    card.className = attachedSequence
      ? "workspace-attached-layer-card workspace-feature-layer-card"
      : "workspace-sequence-card workspace-feature-layer-card";

    const heading = document.createElement("div");
    heading.className = "workspace-sequence-heading";
    const title = document.createElement("h3");
    title.textContent = layer.label || "Workspace feature layer";
    const meta = document.createElement("p");
    const alphabetLabel = layer.alphabet === "protein" ? "Protein" : "DNA/RNA";
    meta.textContent = `${alphabetLabel} feature layer - ${pluralize(layer.features?.length ?? 0, "feature")}`;
    heading.append(title, meta);

    const source = document.createElement("p");
    source.className = "workspace-sequence-summary";
    const sequence = getSequenceForFeatureLayer(layer);
    const sourceText = layer.generatedBy?.toolName
      ? `Created by ${layer.generatedBy.toolName}.`
      : "Created from a viewer output.";
    source.textContent = attachedSequence
      ? `${sourceText} Opens with ${attachedSequence.name} in compatible viewers.`
      : (sequence ? `${sourceText} Attached to ${sequence.name}.` : sourceText);

    const actions = document.createElement("div");
    actions.className = "workspace-sequence-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      await deleteWorkspaceFeatureLayer(layer.id);
      await refresh();
    });
    actions.append(deleteButton);

    card.append(heading, source, actions);
    return card;
  }

  async function addSequencesFromInput(form) {
    const textarea = form.querySelector("#workspaceAddInput");
    const nameInput = form.querySelector("#workspaceAddName");
    const alphabetSelect = form.querySelector("#workspaceAddAlphabet");
    const status = form.querySelector(".workspace-add-status");
    const records = parseSequenceInput(textarea.value, nameInput.value || "workspace_sequence");
    const alphabet = alphabetSelect.value === "protein" ? "protein" : "dna-rna";
    const cleanRecords = records
      .map((record) => {
        const sequence = String(record.sequence ?? "").replace(/\s+/g, "");
        return {
          name: record.title || nameInput.value || "workspace_sequence",
          sequence,
          alphabet,
          length: sequence.length,
          sourceToolId: "workspace",
          sourceToolName: "Manual workspace entry"
        };
      })
      .filter((record) => record.sequence);
    if (cleanRecords.length === 0) {
      manualStatusMessage = "Enter one plain sequence or FASTA records before adding to the workspace.";
      status.textContent = manualStatusMessage;
      return;
    }
    try {
      let firstSavedId = "";
      for (const record of cleanRecords) {
        const saved = await saveWorkspaceSequence(record);
        firstSavedId = firstSavedId || saved.id;
      }
      textarea.value = "";
      const message = `Imported ${pluralize(cleanRecords.length, "sequence record")} to the workspace.`;
      activeSetupPanel = "";
      activeWorkspaceSequenceId = firstSavedId;
      workspaceStatusMessage = message;
      manualStatusMessage = message;
      status.textContent = message;
      await refresh();
      setStorageStatus(message);
      render();
    } catch (error) {
      manualStatusMessage = error?.message || "Could not save the sequence.";
      status.textContent = manualStatusMessage;
    }
  }

  async function loadSampleWorkspace(status, sampleId = workspaceSamples[0]?.id) {
    const sample = workspaceSamples.find((item) => item.id === sampleId) ?? workspaceSamples[0];
    try {
      const changes = getSampleWorkspaceChanges(sample);
      const message = describeSampleWorkspaceLoad(sample, changes);
      if (
        changes.addedSequences === 0 &&
        changes.updatedSequences === 0 &&
        changes.addedFeatureLayers === 0 &&
        changes.updatedFeatureLayers === 0
      ) {
        activeSetupPanel = "sample";
        activeWorkspaceSequenceId = sample.sequences[0]?.id || activeWorkspaceSequenceId;
        workspaceStatusMessage = "";
        sampleStatusMessage = message;
        status.textContent = message;
        render();
        return;
      }
      for (const sequence of sample.sequences) {
        await saveWorkspaceSequence(sequence);
      }
      for (const layer of sample.featureLayers) {
        await saveWorkspaceFeatureLayer(layer);
      }
      activeSetupPanel = "";
      activeWorkspaceSequenceId = sample.sequences[0]?.id || "";
      workspaceStatusMessage = message;
      sampleStatusMessage = "";
      await refresh();
      status.textContent = message;
      setStorageStatus(message);
      render();
    } catch (error) {
      sampleStatusMessage = error?.message || "Could not load the sample workspace.";
      status.textContent = sampleStatusMessage;
    }
  }

  function render() {
    if (!body) {
      return;
    }
    const sequences = getSequences();
    const visibleSequences = getVisibleSequences(sequences);
    const selectedSequence = getSelectedSequence(visibleSequences);
    const unattachedFeatureLayers = getUnattachedFeatureLayers();
    body.textContent = "";

    const overview = document.createElement("section");
    overview.className = "workspace-overview";
    const overviewCopy = document.createElement("div");
    const intro = document.createElement("p");
    intro.className = "summary";
    intro.textContent =
      "Workspace keeps project sequence records and attached feature layers together in this browser. Select a record to open it in a viewer or run a compatible analysis.";
    const stats = document.createElement("p");
    stats.className = "workspace-overview-stats";
    stats.textContent = `${pluralize(sequences.length, "sequence record")} - ${pluralize(getFeatureLayerCount(sequences), "feature layer")} attached - saved locally in this browser`;
    overviewCopy.append(intro, stats);
    if (workspaceStatusMessage) {
      const actionStatus = document.createElement("p");
      actionStatus.className = "workspace-action-status";
      actionStatus.textContent = workspaceStatusMessage;
      overviewCopy.append(actionStatus);
    }

    const setupActions = document.createElement("div");
    setupActions.className = "workspace-top-actions";
    const makeSetupButton = (mode, label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "workspace-setup-toggle";
      button.setAttribute("aria-expanded", String(activeSetupPanel === mode));
      button.setAttribute("aria-controls", mode === "manual" ? "workspaceManualPanel" : "workspaceSamplePanel");
      button.textContent = label;
      button.addEventListener("click", () => {
        activeSetupPanel = activeSetupPanel === mode ? "" : mode;
        render();
      });
      return button;
    };
    setupActions.append(
      makeSetupButton("manual", "Import sequence record"),
      makeSetupButton("sample", "Load example project")
    );
    const exportWorkspaceButton = document.createElement("button");
    exportWorkspaceButton.type = "button";
    exportWorkspaceButton.textContent = "Export workspace";
    exportWorkspaceButton.disabled = sequences.length === 0 && getFeatureLayers().length === 0;
    exportWorkspaceButton.addEventListener("click", exportWorkspace);
    setupActions.append(exportWorkspaceButton);
    overview.append(overviewCopy, setupActions);

    const makeSetupPanelHeading = (titleText) => {
      const heading = document.createElement("div");
      heading.className = "panel-heading workspace-setup-heading";
      const title = document.createElement("h3");
      title.textContent = titleText;
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "workspace-setup-close";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", () => {
        activeSetupPanel = "";
        render();
      });
      heading.append(title, closeButton);
      return heading;
    };

    const samplePanel = document.createElement("section");
    samplePanel.className = "options-panel workspace-setup-panel workspace-sample-panel";
    samplePanel.id = "workspaceSamplePanel";
    samplePanel.setAttribute("role", "dialog");
    samplePanel.setAttribute("aria-labelledby", "workspaceSamplePanelTitle");
    samplePanel.hidden = activeSetupPanel !== "sample";
    const sampleHeading = makeSetupPanelHeading("Load Example Project");
    sampleHeading.querySelector("h3").id = "workspaceSamplePanelTitle";
    const sampleSummary = document.createElement("p");
    sampleSummary.className = "summary";
    sampleSummary.textContent =
      "Example projects add bundled sequence records and feature layers to the local workspace.";
    const sampleActions = document.createElement("div");
    sampleActions.className = "workspace-sample-actions";
    const sampleLabel = document.createElement("label");
    sampleLabel.className = "select-row workspace-sample-picker";
    sampleLabel.textContent = "Example project";
    const sampleSelect = document.createElement("select");
    for (const sample of workspaceSamples) {
      const option = document.createElement("option");
      option.value = sample.id;
      option.textContent = sample.name;
      sampleSelect.append(option);
    }
    sampleLabel.append(sampleSelect);
    const sampleDescription = document.createElement("p");
    sampleDescription.className = "workspace-source-summary";
    const updateSampleDescription = () => {
      const sample = workspaceSamples.find((item) => item.id === sampleSelect.value) ?? workspaceSamples[0];
      const sourceTypes = Array.isArray(sample.sourceTypes) && sample.sourceTypes.length > 0
        ? ` Source records: ${sample.sourceTypes.join("; ")}.`
        : "";
      sampleDescription.textContent =
        `${sample.description} Adds ${pluralize(sample.sequences.length, "sequence record")} and ${pluralize(sample.featureLayers.length, "feature layer")}.${sourceTypes}`;
    };
    sampleSelect.addEventListener("change", updateSampleDescription);
    updateSampleDescription();
    const sampleButton = document.createElement("button");
    sampleButton.type = "button";
    sampleButton.className = "workspace-sample-load-button";
    sampleButton.textContent = "Load example";
    const sampleStatus = document.createElement("p");
    sampleStatus.className = "workspace-add-status";
    sampleStatus.textContent = sampleStatusMessage;
    sampleButton.addEventListener("click", () => loadSampleWorkspace(sampleStatus, sampleSelect.value));
    sampleActions.append(sampleLabel, sampleButton, sampleStatus);
    samplePanel.append(sampleHeading, sampleSummary, sampleActions, sampleDescription);

    const manualPanel = document.createElement("section");
    manualPanel.className = "options-panel workspace-setup-panel workspace-manual-panel";
    manualPanel.id = "workspaceManualPanel";
    manualPanel.setAttribute("role", "dialog");
    manualPanel.setAttribute("aria-labelledby", "workspaceManualPanelTitle");
    manualPanel.hidden = activeSetupPanel !== "manual";
    const manualHeading = makeSetupPanelHeading("Import Sequence Record");
    manualHeading.querySelector("h3").id = "workspaceManualPanelTitle";
    const manualSummary = document.createElement("p");
    manualSummary.className = "summary";
    manualSummary.textContent =
      "Paste one plain sequence or FASTA records. Tool outputs can also be saved to Workspace after a run.";

    const form = document.createElement("div");
    form.className = "workspace-add-form";
    const nameLabel = document.createElement("label");
    nameLabel.className = "text-row";
    nameLabel.textContent = "Default name";
    const nameInput = document.createElement("input");
    nameInput.id = "workspaceAddName";
    nameInput.type = "text";
    nameInput.value = "workspace_sequence";
    nameLabel.append(nameInput);

    const alphabetLabel = document.createElement("label");
    alphabetLabel.className = "select-row";
    alphabetLabel.textContent = "Sequence type";
    const alphabetSelect = document.createElement("select");
    alphabetSelect.id = "workspaceAddAlphabet";
    for (const [value, label] of [
      ["dna-rna", "DNA/RNA"],
      ["protein", "Protein"]
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      alphabetSelect.append(option);
    }
    alphabetLabel.append(alphabetSelect);

    const textarea = document.createElement("textarea");
    textarea.id = "workspaceAddInput";
    textarea.spellcheck = false;
    textarea.wrap = "off";
    textarea.placeholder = "Paste one plain sequence or FASTA records";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "primary-button";
    addButton.textContent = "Import sequence record";
    const status = document.createElement("p");
    status.className = "workspace-add-status";
    status.textContent = manualStatusMessage;
    addButton.addEventListener("click", () => addSequencesFromInput(form));

    form.append(nameLabel, alphabetLabel, textarea, addButton, status);
    manualPanel.append(manualHeading, manualSummary, form);
    overview.append(samplePanel, manualPanel);

    const library = document.createElement("section");
    library.className = "options-panel workspace-library-panel";
    library.setAttribute("aria-labelledby", "workspaceLibraryTitle");
    const libraryHeading = document.createElement("div");
    libraryHeading.className = "panel-heading";
    const libraryTitle = document.createElement("h3");
    libraryTitle.id = "workspaceLibraryTitle";
    libraryTitle.textContent = "Sequence records";
    const count = document.createElement("span");
    count.className = "workspace-library-count";
    count.textContent = visibleSequences.length === sequences.length
      ? pluralize(sequences.length, "sequence record")
      : `${pluralize(visibleSequences.length, "sequence record")} shown`;
    libraryHeading.append(libraryTitle, count);

    const controls = document.createElement("div");
    controls.className = "workspace-list-controls";
    const searchLabel = document.createElement("label");
    searchLabel.className = "text-row workspace-search-field";
    searchLabel.textContent = "Find records";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search record names, sources, and layers...";
    searchInput.value = workspaceListQuery;
    searchInput.addEventListener("input", () => {
      workspaceListQuery = searchInput.value;
      refocusWorkspaceSearch = true;
      render();
    });
    searchLabel.append(searchInput);
    const filterLabel = document.createElement("label");
    filterLabel.className = "select-row workspace-filter-field";
    filterLabel.textContent = "Filter";
    const filterSelect = document.createElement("select");
    for (const [value, label] of [
      ["all", "All"],
      ["dna-rna", "DNA/RNA"],
      ["protein", "Protein"],
      ["has-layers", "Has feature layers"]
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      filterSelect.append(option);
    }
    filterSelect.value = workspaceListFilter;
    filterSelect.addEventListener("change", () => {
      workspaceListFilter = filterSelect.value;
      render();
    });
    filterLabel.append(filterSelect);
    const sortLabel = document.createElement("label");
    sortLabel.className = "select-row workspace-sort-field";
    sortLabel.textContent = "Sort";
    const sortSelect = document.createElement("select");
    for (const [value, label] of [
      ["newest", "Newest first"],
      ["name", "Name A-Z"],
      ["longest", "Longest first"]
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      sortSelect.append(option);
    }
    sortSelect.value = workspaceListSort;
    sortSelect.addEventListener("change", () => {
      workspaceListSort = sortSelect.value;
      render();
    });
    sortLabel.append(sortSelect);
    controls.append(searchLabel, filterLabel, sortLabel);

    const browser = document.createElement("div");
    browser.className = "workspace-browser";
    const listPanel = document.createElement("div");
    listPanel.className = "workspace-sequence-list-panel";
    listPanel.setAttribute("aria-label", "Project sequence records");
    const list = document.createElement("div");
    list.className = "workspace-sequence-list";
    if (sequences.length === 0) {
      renderEmptyState(list);
    } else if (visibleSequences.length === 0) {
      const empty = document.createElement("div");
      empty.className = "workspace-empty-state";
      empty.textContent = "No records match the current search and filters.";
      list.append(empty);
    } else {
      for (const sequence of visibleSequences) {
        list.append(renderSequenceListItem(sequence, selectedSequence));
      }
    }
    listPanel.append(list);
    browser.append(listPanel, renderSequenceInspector(selectedSequence));
    library.append(libraryHeading, controls, browser);

    const sections = [overview, library];
    if (unattachedFeatureLayers.length > 0) {
      const layerLibrary = document.createElement("section");
      layerLibrary.className = "options-panel workspace-library-panel workspace-feature-layer-library-panel";
      layerLibrary.setAttribute("aria-labelledby", "workspaceFeatureLayerLibraryTitle");
      const layerHeading = document.createElement("div");
      layerHeading.className = "panel-heading";
      const layerTitle = document.createElement("h3");
      layerTitle.id = "workspaceFeatureLayerLibraryTitle";
      layerTitle.textContent = "Unattached Feature Layers";
      const layerCount = document.createElement("span");
      layerCount.className = "workspace-library-count";
      layerCount.textContent = pluralize(unattachedFeatureLayers.length, "layer");
      layerHeading.append(layerTitle, layerCount);

      const layerList = document.createElement("div");
      layerList.className = "workspace-sequence-list workspace-feature-layer-list";
      for (const layer of unattachedFeatureLayers) {
        layerList.append(renderFeatureLayerCard(layer));
      }
      layerLibrary.append(layerHeading, layerList);
      sections.push(layerLibrary);
    }

    body.append(...sections);
    if (refocusWorkspaceSearch) {
      refocusWorkspaceSearch = false;
      const search = body.querySelector(".workspace-search-field input");
      search?.focus({ preventScroll: true });
      const length = search?.value.length ?? 0;
      search?.setSelectionRange(length, length);
    }
  }

  return {
    render
  };
}
