import {
  canToolUseWorkspaceSequence,
  canWorkflowUseWorkspaceSequence,
  formatWorkspaceSequenceAsFasta,
  getToolWorkspaceSequenceInputs,
  getWorkflowWorkspaceSequenceAlphabets,
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

function splitInputCanUseWorkspaceSourcePanel(tool) {
  return Boolean(
    tool?.metadata?.splitInput?.separator === "##FASTA" &&
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
  clearToolOutput,
  clearWorkflowOutput
}) {
  const toolModeById = new Map();
  const selectedSequenceByToolId = new Map();
  const nativeWorkspaceSequenceByToolId = new Map();
  let workflowInputSourceMode = "paste";
  let selectedWorkflowSequenceId = "";

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

  function getSelectedToolSequence(tool = getSelectedTool()) {
    const compatible = getCompatibleToolSequences(tool);
    if (compatible.length === 0) {
      return null;
    }
    const toolId = tool?.metadata?.id ?? "";
    const selectedId = selectedSequenceByToolId.get(toolId);
    const selected = compatible.find((sequence) => sequence.id === selectedId) ?? compatible[0];
    selectedSequenceByToolId.set(toolId, selected.id);
    return selected;
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
      sequence = getSelectedToolSequence(tool);
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
      const selected = getSelectedToolSequence(tool);
      elements.dropZone.hidden = true;
      elements.fileInput.closest(".file-button").hidden = true;
      elements.sequenceInput.hidden = true;
      elements.splitInputPanel.hidden = true;
      elements.inputPanel.classList.add("workspace-source-active");

      appendWorkspaceSequencePicker({
        parent: panel,
        labelText: getToolWorkspaceInputLabel(tool),
        compatible,
        selected,
        onChange: (id) => {
          selectedSequenceByToolId.set(tool.metadata.id, id);
          renderToolSource();
          clearToolOutput();
        },
        summaryText: formatWorkspaceToolSummary(selected)
      });
    }

    elements.dropZone.before(panel);
  }

  function openSequenceInTool(sequence, toolId) {
    const tool = sortedTools.find((item) => item.metadata.id === toolId);
    if (!tool) {
      return;
    }
    selectTool(tool);
    selectedSequenceByToolId.set(tool.metadata.id, sequence.id);
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
    const selected = getSelectedToolSequence(tool);
    return selected ? formatWorkspaceSequenceAsFasta(selected) : null;
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

  function getSelectedWorkflowSequence(workflow) {
    const compatible = getWorkflowCompatibleSequences(workflow);
    if (compatible.length === 0) {
      selectedWorkflowSequenceId = "";
      return null;
    }
    const selected =
      compatible.find((sequence) => sequence.id === selectedWorkflowSequenceId) ??
      compatible[0];
    selectedWorkflowSequenceId = selected.id;
    return selected;
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
        setWorkflowInputSourceMode(value);
        renderWorkflowSource(workflow, needsInput);
        clearWorkflowOutput();
      }
    });

    if (activeMode === "workspace") {
      const selected = getSelectedWorkflowSequence(workflow);
      appendWorkspaceSequencePicker({
        parent: panel,
        labelText: getWorkflowWorkspaceInputLabel(workflow, tools),
        compatible,
        selected,
        onChange: (id) => {
          selectedWorkflowSequenceId = id;
          renderWorkflowSource(workflow, needsInput);
          clearWorkflowOutput();
        },
        summaryText: selected
          ? `Using ${selected.name} from the local browser workspace for this workflow run.`
          : "No compatible workspace sequence is available."
      });
    }

    elements.workflowInput.before(panel);
  }

  function getWorkflowInputText(workflow) {
    if (getWorkflowInputSourceMode(workflow) !== "workspace") {
      return null;
    }
    const selected = getSelectedWorkflowSequence(workflow);
    return selected ? formatWorkspaceSequenceAsFasta(selected) : null;
  }

  function getWorkflowSourceSequence(workflow) {
    return getWorkflowInputSourceMode(workflow) === "workspace"
      ? getSelectedWorkflowSequence(workflow)
      : null;
  }

  return {
    canRenderToolSource,
    getCompatibleToolSequences,
    getCompatibleTools,
    openSequenceInTool,
    getToolSourceMode,
    setToolSourceMode,
    getSelectedToolSequence,
    getToolLayerContext,
    renderToolSource,
    getToolInputText,
    getWorkflowCompatibleSequences,
    getWorkflowInputSourceMode,
    setWorkflowInputSourceMode,
    getSelectedWorkflowSequence,
    renderWorkflowSource,
    getWorkflowInputText,
    getWorkflowSourceSequence
  };
}
