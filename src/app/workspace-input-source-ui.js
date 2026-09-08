import {
  canToolUseWorkspaceSequence,
  canWorkflowUseWorkspaceSequence,
  formatWorkspaceSequenceAsFasta,
  formatWorkspaceSequencesAsFasta,
  getToolWorkspaceSequenceInputs,
  getToolWorkspaceSequenceRequirement,
  getWorkflowWorkspaceSequenceAlphabets,
  getWorkflowWorkspaceSequenceRequirement,
  toolAcceptsWorkspaceSequences
} from "../core/workspace.js";

function getWorkspaceSequenceLabel(sequence) {
  return `${sequence.name} (${sequence.length.toLocaleString()} ${sequence.alphabet === "protein" ? "aa" : "bp"})`;
}

function getToolWorkspaceInputLabel(tool) {
  const inputs = getToolWorkspaceSequenceInputs(tool?.metadata);
  const alphabets = [...new Set(inputs.map((input) => input.alphabet).filter(Boolean))];
  if (alphabets.length === 1 && alphabets[0] === "protein") {
    return "Workspace protein sequence";
  }
  if (alphabets.length === 1 && alphabets[0] === "dna-rna") {
    return "Workspace DNA/RNA sequence";
  }
  return "Workspace sequence";
}

function getWorkflowWorkspaceInputLabel(workflow, tools) {
  const alphabets = getWorkflowWorkspaceSequenceAlphabets(workflow, tools);
  if (alphabets.length === 1 && alphabets[0] === "protein") {
    return "Workspace protein sequence";
  }
  if (alphabets.length === 1 && alphabets[0] === "dna-rna") {
    return "Workspace DNA/RNA sequence";
  }
  return "Workspace sequence";
}

function appendSourceTabs({ parent, activeMode, className = "", label, onSelect }) {
  const tabs = document.createElement("div");
  tabs.className = `workspace-source-tabs${className ? ` ${className}` : ""}`;
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", label);

  for (const [value, text] of [
    ["paste", "Paste / upload"],
    ["workspace", "Workspace"]
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `workspace-source-tab${className ? ` ${className.replace(/tabs/g, "tab")}` : ""}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(activeMode === value));
    button.textContent = text;
    button.addEventListener("click", () => onSelect(value));
    tabs.append(button);
  }

  parent.append(tabs);
}

function appendWorkspaceSequencePicker({ parent, labelText, compatible, selected, onChange, summaryText }) {
  const picker = document.createElement("div");
  picker.className = "workspace-source-picker";

  const label = document.createElement("label");
  label.className = "select-row";
  label.textContent = labelText;

  const select = document.createElement("select");
  for (const sequence of compatible) {
    const option = document.createElement("option");
    option.value = sequence.id;
    option.textContent = getWorkspaceSequenceLabel(sequence);
    select.append(option);
  }
  if (selected) {
    select.value = selected.id;
  }
  select.addEventListener("change", () => onChange(select.value));
  label.append(select);

  const summary = document.createElement("p");
  summary.className = "workspace-source-summary";
  summary.textContent = summaryText;

  picker.append(label, summary);
  parent.append(picker);
}

function recordCountText(count) {
  return `${count.toLocaleString()} ${count === 1 ? "record" : "records"}`;
}

function selectionRequirementText(requirement) {
  if (requirement.minRecords === 2 && requirement.maxRecords === 2) {
    return "Choose sequence A and sequence B. Each Workspace record contributes one FASTA sequence.";
  }
  if (requirement.maxRecords === null) {
    return `Choose at least ${recordCountText(requirement.minRecords)}. Input order follows the selected-record list.`;
  }
  return `Choose ${recordCountText(requirement.minRecords)} to ${recordCountText(requirement.maxRecords)}.`;
}

function validSelectionSummaryText(selected, requirement, runLabel) {
  if (requirement.minRecords === 2 && requirement.maxRecords === 2) {
    const distinctRecordCount = new Set(selected.map((sequence) => sequence.id)).size;
    return `Using sequence A and sequence B from ${recordCountText(distinctRecordCount)} in the local browser workspace for this ${runLabel}.`;
  }
  return `Using ${recordCountText(selected.length)} from the local browser workspace for this ${runLabel}.`;
}

function appendExactWorkspaceSequencePickers({ parent, labelText, compatible, selected, onChange, summaryText }) {
  const picker = document.createElement("div");
  picker.className = "workspace-source-picker workspace-multi-source-picker workspace-paired-source-picker";
  const heading = document.createElement("strong");
  heading.textContent = labelText;
  const help = document.createElement("p");
  help.className = "workspace-source-help";
  help.textContent = selectionRequirementText({ minRecords: 2, maxRecords: 2 });
  const fields = document.createElement("div");
  fields.className = "workspace-paired-source-fields";
  ["Sequence A", "Sequence B"].forEach((fieldLabel, index) => {
    const label = document.createElement("label");
    label.className = "select-row";
    label.textContent = fieldLabel;
    const select = document.createElement("select");
    select.setAttribute("aria-label", fieldLabel);
    for (const sequence of compatible) {
      const option = document.createElement("option");
      option.value = sequence.id;
      option.textContent = getWorkspaceSequenceLabel(sequence);
      select.append(option);
    }
    select.value = selected[index]?.id ?? compatible[0]?.id ?? "";
    select.addEventListener("change", () => {
      const ids = selected.map((sequence) => sequence.id);
      ids[index] = select.value;
      onChange(ids);
    });
    label.append(select);
    fields.append(label);
  });
  const summary = document.createElement("p");
  summary.className = "workspace-source-summary";
  summary.textContent = summaryText;
  picker.append(heading, help, fields, summary);
  parent.append(picker);
}

function appendWorkspaceSequenceCollectionPicker({ parent, labelText, compatible, selected, requirement, onChange, summaryText }) {
  const picker = document.createElement("div");
  picker.className = "workspace-source-picker workspace-multi-source-picker workspace-collection-source-picker";
  const heading = document.createElement("strong");
  heading.textContent = labelText;
  const help = document.createElement("p");
  help.className = "workspace-source-help";
  help.textContent = selectionRequirementText(requirement);
  const list = document.createElement("ol");
  list.className = "workspace-selected-record-list";
  selected.forEach((sequence, index) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = getWorkspaceSequenceLabel(sequence);
    const actions = document.createElement("span");
    actions.className = "workspace-selected-record-actions";
    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.textContent = "Up";
    moveUp.disabled = index === 0;
    moveUp.setAttribute("aria-label", `Move ${sequence.name} up`);
    moveUp.addEventListener("click", () => {
      const ids = selected.map((record) => record.id);
      [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
      onChange(ids);
    });
    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.textContent = "Down";
    moveDown.disabled = index === selected.length - 1;
    moveDown.setAttribute("aria-label", `Move ${sequence.name} down`);
    moveDown.addEventListener("click", () => {
      const ids = selected.map((record) => record.id);
      [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
      onChange(ids);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.disabled = selected.length <= requirement.minRecords;
    remove.setAttribute("aria-label", `Remove ${sequence.name}`);
    remove.addEventListener("click", () => onChange(selected.filter((_, itemIndex) => itemIndex !== index).map((record) => record.id)));
    actions.append(moveUp, moveDown, remove);
    item.append(name, actions);
    list.append(item);
  });

  const available = compatible.filter((sequence) => !selected.some((item) => item.id === sequence.id));
  const addRow = document.createElement("div");
  addRow.className = "workspace-add-record-row";
  if (available.length > 0 && (requirement.maxRecords === null || selected.length < requirement.maxRecords)) {
    const addLabel = document.createElement("label");
    addLabel.className = "select-row";
    addLabel.textContent = "Add record";
    const addSelect = document.createElement("select");
    addSelect.setAttribute("aria-label", "Workspace record to add");
    for (const sequence of available) {
      const option = document.createElement("option");
      option.value = sequence.id;
      option.textContent = getWorkspaceSequenceLabel(sequence);
      addSelect.append(option);
    }
    addLabel.append(addSelect);
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "Add";
    addButton.addEventListener("click", () => onChange([...selected.map((sequence) => sequence.id), addSelect.value]));
    addRow.append(addLabel, addButton);
  } else {
    addRow.classList.add("workspace-add-record-complete");
    addRow.textContent = "All compatible Workspace records are selected.";
  }
  const summary = document.createElement("p");
  summary.className = "workspace-source-summary";
  summary.textContent = summaryText;
  picker.append(heading, help, list, addRow, summary);
  parent.append(picker);
}

function splitInputCanUseWorkspaceSourcePanel(tool) {
  return Boolean(
    (tool?.metadata?.splitInput?.separator === "##FASTA" ||
      tool?.metadata?.splitInput?.workspaceSourcePanel === true) &&
    toolAcceptsWorkspaceSequences(tool?.metadata)
  );
}

export function toolSupportsWorkspaceSourcePanel(tool) {
  if (!tool) {
    return false;
  }
  return !tool?.metadata?.splitInput || splitInputCanUseWorkspaceSourcePanel(tool);
}

function toolCanOpenWorkspaceSequence({ tool, toolRequiresInput }) {
  return (
    toolRequiresInput(tool) &&
    !["markdown-notebook", "sequence-editor"].includes(tool?.metadata?.id) &&
    toolAcceptsWorkspaceSequences(tool?.metadata)
  );
}

export function createWorkspaceInputSourceController({
  elements,
  tools,
  sortedTools,
  getSelectedTool,
  getWorkspaceSequences,
  getWorkspaceFeatureLayers = () => [],
  toolRequiresInput,
  isTabbedInputWorkflowTool,
  selectTool,
  applyWorkspaceSequenceToToolInput,
  syncToolOptionsForWorkspaceSequences = () => {},
  clearToolOutput,
  clearWorkflowOutput,
  retireWorkflowRun = () => {}
}) {
  const toolModeById = new Map();
  const selectedSequenceIdsByToolId = new Map();
  const nativeWorkspaceSequenceByToolId = new Map();
  let workflowInputSourceMode = "paste";
  let selectedWorkflowSequenceIds = [];

  function canRenderToolSource(tool) {
    return (
      toolCanOpenWorkspaceSequence({ tool, toolRequiresInput }) &&
      toolSupportsWorkspaceSourcePanel(tool) &&
      (!isTabbedInputWorkflowTool(tool) || splitInputCanUseWorkspaceSourcePanel(tool))
    );
  }

  function canOpenToolFromWorkspace(tool) {
    return toolCanOpenWorkspaceSequence({ tool, toolRequiresInput });
  }

  function getCompatibleToolSequences(tool = getSelectedTool()) {
    if (!canRenderToolSource(tool)) {
      return [];
    }
    return getWorkspaceSequences().filter((sequence) => canToolUseWorkspaceSequence(tool.metadata, sequence));
  }

  function getCompatibleTools(sequence) {
    return sortedTools.filter(
      (tool) => canOpenToolFromWorkspace(tool) && canToolUseWorkspaceSequence(tool.metadata, sequence)
    );
  }

  function getToolSourceMode(tool = getSelectedTool()) {
    const toolId = tool?.metadata?.id ?? "";
    const mode = toolModeById.get(toolId);
    return mode === "workspace" ? "workspace" : "paste";
  }

  function setToolSourceMode(toolId, mode) {
    if (!toolId) {
      return;
    }
    nativeWorkspaceSequenceByToolId.delete(toolId);
    toolModeById.set(toolId, mode === "workspace" ? "workspace" : "paste");
  }

  function normalizeSelectedSequences(compatible, selectedIds, requirement, { initialize = false } = {}) {
    const compatibleById = new Map(compatible.map((sequence) => [sequence.id, sequence]));
    const allowDuplicates = requirement.minRecords === 2 && requirement.maxRecords === 2;
    const ids = (selectedIds ?? []).filter((id, index, items) =>
      compatibleById.has(id) && (allowDuplicates || items.indexOf(id) === index)
    );
    if (requirement.maxRecords !== null) {
      ids.splice(requirement.maxRecords);
    }
    if (initialize) {
      for (const sequence of compatible) {
        if (ids.length >= requirement.minRecords) {
          break;
        }
        if (allowDuplicates || !ids.includes(sequence.id)) {
          ids.push(sequence.id);
        }
      }
      while (allowDuplicates && ids.length < requirement.minRecords && compatible[0]) {
        ids.push(compatible[0].id);
      }
    }
    return ids.map((id) => compatibleById.get(id)).filter(Boolean);
  }

  function getSelectedToolSequences(tool = getSelectedTool()) {
    const compatible = getCompatibleToolSequences(tool);
    if (compatible.length === 0) {
      return [];
    }
    const toolId = tool?.metadata?.id ?? "";
    const requirement = getToolWorkspaceSequenceRequirement(tool?.metadata) ?? { minRecords: 1, maxRecords: 1 };
    const selected = normalizeSelectedSequences(
      compatible,
      selectedSequenceIdsByToolId.get(toolId),
      requirement,
      { initialize: true }
    );
    selectedSequenceIdsByToolId.set(toolId, selected.map((sequence) => sequence.id));
    return selected;
  }

  function getSelectedToolSequence(tool = getSelectedTool()) {
    return getSelectedToolSequences(tool)[0] ?? null;
  }

  function getFeatureLayerCountForSequence(sequence) {
    if (!sequence) {
      return 0;
    }
    return getWorkspaceFeatureLayers().filter((layer) => {
      if (sequence.id && layer.sequenceId) {
        return sequence.id === layer.sequenceId;
      }
      return Boolean(sequence.sequenceHash && layer.sequenceHash && sequence.sequenceHash === layer.sequenceHash);
    }).length;
  }

  function formatWorkspaceToolSummary(sequence) {
    if (!sequence) {
      return "No compatible workspace sequence is available.";
    }
    const layerCount = getFeatureLayerCountForSequence(sequence);
    const layerText = layerCount > 0
      ? ` ${layerCount.toLocaleString()} attached ${layerCount === 1 ? "feature layer" : "feature layers"} will be available to compatible viewers.`
      : "";
    return `Using ${sequence.name} from the local browser workspace.${layerText}`;
  }

  function getToolLayerContext(tool = getSelectedTool()) {
    if (!tool) {
      return {};
    }
    let sequence = null;
    if (getToolSourceMode(tool) === "workspace") {
      const selected = getSelectedToolSequences(tool);
      sequence = selected.length === 1 ? selected[0] : null;
    } else {
      const nativeSequenceId = nativeWorkspaceSequenceByToolId.get(tool.metadata?.id ?? "");
      sequence = getWorkspaceSequences().find((item) => item.id === nativeSequenceId) ?? null;
    }
    if (!sequence) {
      return {};
    }
    return {
      sequenceId: sequence.id,
      alphabet: sequence.alphabet
    };
  }

  function removeToolPanel() {
    elements.inputPanel.querySelector("#workspaceInputSourcePanel")?.remove();
    elements.inputPanel.classList.remove("workspace-source-active");
  }

  function renderToolSource() {
    removeToolPanel();
    const tool = getSelectedTool();
    if (!canRenderToolSource(tool)) {
      return;
    }

    const mode = getToolSourceMode(tool);
    const compatible = getCompatibleToolSequences(tool);
    if (mode === "workspace" && compatible.length === 0) {
      setToolSourceMode(tool.metadata.id, "paste");
    }
    const activeMode = getToolSourceMode(tool);

    if (activeMode !== "workspace") {
      const usesSplitInput = Boolean(tool.metadata.splitInput);
      elements.dropZone.hidden = usesSplitInput;
      elements.fileInput.closest(".file-button").hidden = usesSplitInput;
      elements.sequenceInput.hidden = usesSplitInput;
      elements.splitInputPanel.hidden = !usesSplitInput;
      elements.inputPanel.classList.remove("workspace-source-active");
    }

    if (compatible.length === 0) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = "workspaceInputSourcePanel";
    panel.className = "workspace-source-panel";

    appendSourceTabs({
      parent: panel,
      activeMode,
      label: "Input source",
      onSelect: (value) => {
        setToolSourceMode(tool.metadata.id, value);
        renderToolSource();
        clearToolOutput();
      }
    });

    if (activeMode === "workspace") {
      const selected = getSelectedToolSequences(tool);
      const requirement = getToolWorkspaceSequenceRequirement(tool.metadata) ?? { minRecords: 1, maxRecords: 1 };
      syncToolOptionsForWorkspaceSequences(tool, selected);
      elements.dropZone.hidden = true;
      elements.fileInput.closest(".file-button").hidden = true;
      elements.sequenceInput.hidden = true;
      elements.splitInputPanel.hidden = true;
      elements.inputPanel.classList.add("workspace-source-active");

      const onChange = (ids) => {
        selectedSequenceIdsByToolId.set(tool.metadata.id, ids);
        syncToolOptionsForWorkspaceSequences(tool, getSelectedToolSequences(tool));
        renderToolSource();
        clearToolOutput();
      };
      const valid = selected.length >= requirement.minRecords &&
        (requirement.maxRecords === null || selected.length <= requirement.maxRecords);
      const summaryText = valid
        ? validSelectionSummaryText(selected, requirement, "run")
        : `Selected ${recordCountText(selected.length)}; choose at least ${recordCountText(requirement.minRecords)} before running.`;
      if (requirement.minRecords === 2 && requirement.maxRecords === 2) {
        appendExactWorkspaceSequencePickers({
          parent: panel,
          labelText: getToolWorkspaceInputLabel(tool),
          compatible,
          selected,
          onChange,
          summaryText
        });
      } else if (requirement.explicitCardinality && (requirement.minRecords > 1 || requirement.maxRecords === null)) {
        appendWorkspaceSequenceCollectionPicker({
          parent: panel,
          labelText: getToolWorkspaceInputLabel(tool),
          compatible,
          selected,
          requirement,
          onChange,
          summaryText
        });
      } else {
        appendWorkspaceSequencePicker({
          parent: panel,
          labelText: getToolWorkspaceInputLabel(tool),
          compatible,
          selected: selected[0] ?? null,
          onChange: (id) => onChange([id]),
          summaryText: formatWorkspaceToolSummary(selected[0] ?? null)
        });
      }
    }

    elements.dropZone.before(panel);
  }

  function openSequenceInTool(sequence, toolId) {
    const tool = sortedTools.find((item) => item.metadata.id === toolId);
    if (!tool) {
      return;
    }
    selectTool(tool);
    selectedSequenceIdsByToolId.set(tool.metadata.id, [sequence.id]);
    if (canRenderToolSource(tool)) {
      toolModeById.set(tool.metadata.id, "workspace");
      nativeWorkspaceSequenceByToolId.delete(tool.metadata.id);
      renderToolSource();
    } else {
      toolModeById.set(tool.metadata.id, "paste");
      nativeWorkspaceSequenceByToolId.set(tool.metadata.id, sequence.id);
      const inputText = formatWorkspaceSequenceAsFasta(sequence);
      const applied = applyWorkspaceSequenceToToolInput?.(tool, sequence, inputText);
      if (!applied && !tool.metadata.splitInput) {
        elements.sequenceInput.value = inputText;
      }
      removeToolPanel();
    }
    clearToolOutput();
  }

  function getToolInputText(tool = getSelectedTool()) {
    if (getToolSourceMode(tool) !== "workspace") {
      return null;
    }
    const selected = getSelectedToolSequences(tool);
    return selected.length > 0 ? formatWorkspaceSequencesAsFasta(selected) : "";
  }

  function getToolWorkspaceSelectionValidation(tool = getSelectedTool()) {
    if (getToolSourceMode(tool) !== "workspace") {
      return { valid: true, message: "" };
    }
    const requirement = getToolWorkspaceSequenceRequirement(tool?.metadata) ?? { minRecords: 1, maxRecords: 1 };
    const count = getSelectedToolSequences(tool).length;
    if (count < requirement.minRecords) {
      return {
        valid: false,
        message: `Choose at least ${recordCountText(requirement.minRecords)} from Workspace before running ${tool?.metadata?.name ?? "this tool"}.`
      };
    }
    if (requirement.maxRecords !== null && count > requirement.maxRecords) {
      return {
        valid: false,
        message: `Choose no more than ${recordCountText(requirement.maxRecords)} from Workspace.`
      };
    }
    return { valid: true, message: "" };
  }

  function getWorkflowCompatibleSequences(workflow) {
    const acceptedAlphabets = getWorkflowWorkspaceSequenceAlphabets(workflow, tools);
    if (acceptedAlphabets.length === 0) {
      return [];
    }
    return getWorkspaceSequences().filter((sequence) => canWorkflowUseWorkspaceSequence(workflow, sequence, tools));
  }

  function getWorkflowInputSourceMode(workflow) {
    const compatible = getWorkflowCompatibleSequences(workflow);
    if (workflowInputSourceMode === "workspace" && compatible.length > 0) {
      return "workspace";
    }
    return "paste";
  }

  function setWorkflowInputSourceMode(mode) {
    workflowInputSourceMode = mode === "workspace" ? "workspace" : "paste";
  }

  function getSelectedWorkflowSequences(workflow) {
    const compatible = getWorkflowCompatibleSequences(workflow);
    if (compatible.length === 0) {
      selectedWorkflowSequenceIds = [];
      return [];
    }
    const requirement = getWorkflowWorkspaceSequenceRequirement(workflow, tools) ?? { minRecords: 1, maxRecords: 1 };
    const selected = normalizeSelectedSequences(
      compatible,
      selectedWorkflowSequenceIds,
      requirement,
      { initialize: true }
    );
    selectedWorkflowSequenceIds = selected.map((sequence) => sequence.id);
    return selected;
  }

  function getSelectedWorkflowSequence(workflow) {
    return getSelectedWorkflowSequences(workflow)[0] ?? null;
  }

  function removeWorkflowPanel() {
    elements.workflowInput.parentElement?.querySelector("#workflowInputSourcePanel")?.remove();
  }

  function renderWorkflowSource(workflow, needsInput) {
    removeWorkflowPanel();
    if (!needsInput) {
      elements.workflowInput.hidden = true;
      return;
    }

    const compatible = getWorkflowCompatibleSequences(workflow);
    const activeMode = getWorkflowInputSourceMode(workflow);
    elements.workflowInput.hidden = activeMode === "workspace";

    if (compatible.length === 0) {
      return;
    }

    const panel = document.createElement("div");
    panel.id = "workflowInputSourcePanel";
    panel.className = "workspace-source-panel workflow-source-panel";

    appendSourceTabs({
      parent: panel,
      activeMode,
      className: "workflow-source-tabs",
      label: "Workflow input source",
      onSelect: (value) => {
        retireWorkflowRun();
        setWorkflowInputSourceMode(value);
        renderWorkflowSource(workflow, needsInput);
        clearWorkflowOutput();
      }
    });

    if (activeMode === "workspace") {
      const selected = getSelectedWorkflowSequences(workflow);
      const requirement = getWorkflowWorkspaceSequenceRequirement(workflow, tools) ?? { minRecords: 1, maxRecords: 1 };
      const onChange = (ids) => {
        retireWorkflowRun();
        selectedWorkflowSequenceIds = ids;
        renderWorkflowSource(workflow, needsInput);
        clearWorkflowOutput();
      };
      const valid = selected.length >= requirement.minRecords &&
        (requirement.maxRecords === null || selected.length <= requirement.maxRecords);
      const summaryText = valid
        ? validSelectionSummaryText(selected, requirement, "workflow run")
        : `Selected ${recordCountText(selected.length)}; choose at least ${recordCountText(requirement.minRecords)} before running.`;
      if (requirement.minRecords === 2 && requirement.maxRecords === 2) {
        appendExactWorkspaceSequencePickers({
          parent: panel,
          labelText: getWorkflowWorkspaceInputLabel(workflow, tools),
          compatible,
          selected,
          onChange,
          summaryText
        });
      } else if (requirement.explicitCardinality && (requirement.minRecords > 1 || requirement.maxRecords === null)) {
        appendWorkspaceSequenceCollectionPicker({
          parent: panel,
          labelText: getWorkflowWorkspaceInputLabel(workflow, tools),
          compatible,
          selected,
          requirement,
          onChange,
          summaryText
        });
      } else {
        appendWorkspaceSequencePicker({
          parent: panel,
          labelText: getWorkflowWorkspaceInputLabel(workflow, tools),
          compatible,
          selected: selected[0] ?? null,
          onChange: (id) => onChange([id]),
          summaryText: selected[0]
            ? `Using ${selected[0].name} from the local browser workspace for this workflow run.`
            : "No compatible workspace sequence is available."
        });
      }
    }

    elements.workflowInput.before(panel);
  }

  function getWorkflowInputText(workflow) {
    if (getWorkflowInputSourceMode(workflow) !== "workspace") {
      return null;
    }
    const selected = getSelectedWorkflowSequences(workflow);
    return selected.length > 0 ? formatWorkspaceSequencesAsFasta(selected) : "";
  }

  function getWorkflowSourceSequence(workflow) {
    if (getWorkflowInputSourceMode(workflow) !== "workspace") {
      return null;
    }
    const selected = getSelectedWorkflowSequences(workflow);
    return selected.length === 1 ? selected[0] : null;
  }

  function getWorkflowSourceSequences(workflow) {
    return getWorkflowInputSourceMode(workflow) === "workspace"
      ? getSelectedWorkflowSequences(workflow)
      : [];
  }

  function getWorkflowWorkspaceSelectionValidation(workflow) {
    if (getWorkflowInputSourceMode(workflow) !== "workspace") {
      return { valid: true, message: "" };
    }
    const requirement = getWorkflowWorkspaceSequenceRequirement(workflow, tools) ?? { minRecords: 1, maxRecords: 1 };
    const count = getSelectedWorkflowSequences(workflow).length;
    if (count < requirement.minRecords) {
      return {
        valid: false,
        message: `Choose at least ${recordCountText(requirement.minRecords)} from Workspace before running this workflow.`
      };
    }
    if (requirement.maxRecords !== null && count > requirement.maxRecords) {
      return {
        valid: false,
        message: `Choose no more than ${recordCountText(requirement.maxRecords)} from Workspace.`
      };
    }
    return { valid: true, message: "" };
  }

  return {
    canRenderToolSource,
    getCompatibleToolSequences,
    getCompatibleTools,
    openSequenceInTool,
    getToolSourceMode,
    setToolSourceMode,
    getSelectedToolSequence,
    getSelectedToolSequences,
    getToolLayerContext,
    renderToolSource,
    getToolInputText,
    getToolWorkspaceSelectionValidation,
    getWorkflowCompatibleSequences,
    getWorkflowInputSourceMode,
    setWorkflowInputSourceMode,
    getSelectedWorkflowSequence,
    getSelectedWorkflowSequences,
    renderWorkflowSource,
    getWorkflowInputText,
    getWorkflowSourceSequence,
    getWorkflowSourceSequences,
    getWorkflowWorkspaceSelectionValidation
  };
}
