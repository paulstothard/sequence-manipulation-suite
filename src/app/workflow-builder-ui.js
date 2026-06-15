import {
  deleteSavedWorkflow,
  getSavedWorkflow,
  listSavedWorkflows,
  saveWorkflowDocument
} from "./workflow-storage.js";
import {
  describeStream,
  describeViewerStream,
  describeWorkflowStreamChoice
} from "./workflow-stream-labels.js";
import { tableStreamToTsv } from "./table-output-format.js";
import { validateWorkflowDefinition } from "../core/workflow-engine.js";

function sequenceRecordsToFasta(stream) {
  return (stream.records ?? [])
    .map((record) => `>${record.title ?? "sequence"}\n${record.sequence ?? ""}`)
    .join("\n");
}

function makeGff3BundleOutput(label = "GFF3 + FASTA annotation bundle") {
  return {
    id: "primary",
    kind: "text",
    mediaType: "text/plain",
    label
  };
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function createWorkflowBuilderController({
  elements,
  state,
  tools,
  workflowPresets,
  toolIdAliases,
  workspaceInputSources,
  helpers,
  callbacks
}) {
  const {
    appendRuleListControl,
    appendValueListControl,
    createOptionLabelContent,
    flattenOptions,
    normalizeDependentOptionValues,
    populateDependentSelect,
    visibleWhenMatches
  } = helpers;
  const {
    addWorkflowMessage,
    clearWorkflowOutput,
    updateInputActionButtons
  } = callbacks;

  function formatWorkflowValue(value) {
    if (!value) {
      return { text: "", rawText: "", summary: "No output", isTsv: false };
    }

    if (value.kind === "table") {
      const rawText = tableStreamToTsv(value);
      return {
        text: "",
        rawText,
        summary: `Workflow output: table rows (${pluralize(value.rows?.length ?? 0, "row")})`,
        outputLabel: "Table",
        isTsv: true,
        tableStream: value,
        filename: "sms3-workflow-output.tsv",
        mimeType: "text/tab-separated-values"
      };
    }

    if (value.kind === "sequence-records") {
      const rawText = sequenceRecordsToFasta(value);
      return {
        text: rawText,
        rawText,
        summary: `Workflow output: ${value.alphabet === "protein" ? "protein" : "DNA/RNA"} sequences (${pluralize(value.records?.length ?? 0, "record")})`,
        outputLabel: "FASTA sequences",
        isTsv: false,
        filename: "sms3-workflow-output.fasta",
        mimeType: "text/x-fasta;charset=utf-8"
      };
    }

    if (value.kind === "text") {
      return {
        text: value.text ?? "",
        rawText: value.text ?? "",
        summary: value.mediaType?.includes("svg") ? "Workflow output: graphic" : "Workflow output: text",
        outputLabel: value.mediaType?.includes("svg") ? "Graphic" : "Text",
        isTsv: false,
        svg: value.mediaType?.includes("svg") ? value.text ?? "" : null,
        filename: value.mediaType?.includes("svg") ? "sms3-workflow-output.svg" : "sms3-workflow-output.txt",
        mimeType: value.mediaType ?? "text/plain;charset=utf-8"
      };
    }

    if (value.kind === "viewer") {
      const rawText = JSON.stringify(value.viewer ?? value, null, 2);
      const viewerDescription = describeViewerStream(value);
      return {
        text: rawText,
        rawText,
        summary: `Workflow output: ${viewerDescription} (${pluralize(value.viewer?.records?.length ?? 0, "record")})`,
        outputLabel: describeViewerStream(value, "label"),
        isTsv: false,
        viewer: value.viewer,
        filename: "sms3-workflow-viewer.json",
        mimeType: "application/json;charset=utf-8"
      };
    }

    if (value.kind === "figure") {
      const rawText = JSON.stringify(value.figure ?? value, null, 2);
      return {
        text: rawText,
        rawText,
        summary: `Workflow output: editable Genome Figure (${pluralize(value.figure?.records?.length ?? 0, "record")})`,
        outputLabel: "Figure JSON",
        isTsv: false,
        figure: value.figure,
        filename: "sms3-workflow-genome-figure.json",
        mimeType: "application/json;charset=utf-8"
      };
    }

    if (value.kind === "collection") {
      const rawText = JSON.stringify(value, null, 2);
      return {
        text: rawText,
        rawText,
        summary: `Workflow output: set (${pluralize(value.items?.length ?? 0, "item")})`,
        outputLabel: "JSON",
        isTsv: false,
        filename: "sms3-workflow-output.json",
        mimeType: "application/json"
      };
    }

    const rawText = JSON.stringify(value, null, 2);
    return {
      text: rawText,
      rawText,
      summary: `Workflow output: ${describeStream(value)}`,
      outputLabel: "JSON",
      isTsv: false,
      filename: "sms3-workflow-output.json",
      mimeType: "application/json"
    };
  }

  function getSelectedWorkflowPreset() {
    return workflowPresets.find((preset) => preset.id === state.selectedWorkflow) ?? workflowPresets[0];
  }

  function cloneWorkflow(workflow) {
    return JSON.parse(JSON.stringify(workflow));
  }

  function getActiveWorkflowDefinition() {
    return state.importedWorkflow ?? getSelectedWorkflowPreset().workflow;
  }

  function setWorkflowDefinition(workflow) {
    state.importedWorkflow = workflow;
    elements.workflowJson.value = JSON.stringify(workflow, null, 2);
  }

  function getDefaultWorkflowSaveName() {
    const activeSaved = state.savedWorkflows.find((item) => item.id === state.activeSavedWorkflowId);
    if (activeSaved?.name) {
      return activeSaved.name;
    }
    if (state.importedWorkflow?.name) {
      return state.importedWorkflow.name;
    }
    return getSelectedWorkflowPreset().name;
  }

  function formatSavedWorkflowDate(value) {
    if (!value) {
      return "";
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(value));
    } catch {
      return "";
    }
  }

  function setWorkflowSavedStatus(message = "") {
    elements.workflowSavedStatus.textContent = message;
  }

  function setWorkflowSourceMode(mode = "recipe") {
    const activeMode = mode === "saved" ? "saved" : "recipe";
    const isSaved = activeMode === "saved";
    elements.workflowRecipeTab?.setAttribute("aria-expanded", "true");
    elements.workflowSavedTab?.setAttribute("aria-expanded", String(isSaved));
    if (elements.workflowRecipePanel) {
      elements.workflowRecipePanel.hidden = false;
      if ("open" in elements.workflowRecipePanel) {
        elements.workflowRecipePanel.open = false;
      }
    }
    if (elements.workflowSavedPanel) {
      elements.workflowSavedPanel.hidden = !isSaved;
    }
  }

  function renderSavedWorkflowControls() {
    const select = elements.workflowSavedSelect;
    const selectedId = select.value || state.activeSavedWorkflowId;
    select.textContent = "";

    if (state.savedWorkflows.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No saved workflows";
      select.append(option);
      select.disabled = true;
      elements.workflowLoadSaved.disabled = true;
      elements.workflowDeleteSaved.disabled = true;
    } else {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose saved workflow";
      select.append(placeholder);
      for (const savedWorkflow of state.savedWorkflows) {
        const option = document.createElement("option");
        option.value = savedWorkflow.id;
        const savedAt = formatSavedWorkflowDate(savedWorkflow.updatedAt);
        option.textContent = savedAt ? `${savedWorkflow.name} (${savedAt})` : savedWorkflow.name;
        select.append(option);
      }
      select.disabled = false;
      select.value = state.savedWorkflows.some((item) => item.id === selectedId) ? selectedId : "";
      updateSavedWorkflowActionButtons();
    }

    elements.workflowSaveName.placeholder = getDefaultWorkflowSaveName();
  }

  function updateSavedWorkflowActionButtons() {
    const hasSelection = Boolean(elements.workflowSavedSelect.value);
    elements.workflowLoadSaved.disabled = !hasSelection;
    elements.workflowDeleteSaved.disabled = !hasSelection;
  }

  function updateWorkflowRecipeActionButton() {
    if (!elements.workflowLoadRecipe || !elements.workflowPreset) {
      return;
    }
    const selectedRecipe = elements.workflowPreset.value;
    const canResetActiveWorkflow = Boolean(state.importedWorkflow || state.activeSavedWorkflowId);
    elements.workflowLoadRecipe.disabled = !selectedRecipe ||
      (selectedRecipe === state.selectedWorkflow && !canResetActiveWorkflow);
  }

  async function refreshSavedWorkflowList({ showError = true } = {}) {
    try {
      state.savedWorkflows = await listSavedWorkflows();
    } catch (error) {
      state.savedWorkflows = [];
      if (showError) {
        setWorkflowSavedStatus(`Saved workflows could not be read: ${error.message}`);
      }
    }
    renderSavedWorkflowControls();
  }

  function getWorkflowDefinitionForStorage() {
    return makeRunnableWorkflow(getActiveWorkflowDefinition());
  }

  async function saveCurrentWorkflowToLibrary() {
    setWorkflowSavedStatus("");
    elements.workflowMessages.textContent = "";
    try {
      const workflow = getWorkflowDefinitionForStorage();
      const name = elements.workflowSaveName.value.trim() || getDefaultWorkflowSaveName();
      const record = await saveWorkflowDocument({
        id: state.activeSavedWorkflowId || undefined,
        name,
        workflow,
        sourcePresetId: state.importedWorkflow ? "" : getSelectedWorkflowPreset().id
      });
      state.activeSavedWorkflowId = record.id;
      state.importedWorkflow = workflow;
      elements.workflowJson.value = JSON.stringify(workflow, null, 2);
      elements.workflowSaveName.value = record.name;
      await refreshSavedWorkflowList({ showError: false });
      renderWorkflowView();
      setWorkflowSavedStatus(`Saved "${record.name}".`);
    } catch (error) {
      setWorkflowSavedStatus(`Could not save workflow: ${error.message}`);
    }
  }

  async function loadSavedWorkflowFromLibrary() {
    const id = elements.workflowSavedSelect.value || state.activeSavedWorkflowId;
    setWorkflowSavedStatus("");
    elements.workflowMessages.textContent = "";
    if (!id) {
      setWorkflowSavedStatus("Choose a saved workflow to load.");
      return;
    }
    try {
      const savedWorkflow = await getSavedWorkflow(id);
      if (!savedWorkflow) {
        await refreshSavedWorkflowList({ showError: false });
        setWorkflowSavedStatus("That saved workflow is no longer available.");
        return;
      }
      const errors = validateWorkflowDefinition(savedWorkflow.workflow, { tools });
      if (errors.length > 0) {
        setWorkflowSavedStatus(`Saved workflow is not valid: ${errors.join(" ")}`);
        return;
      }
      const workflow = cloneWorkflow(savedWorkflow.workflow);
      state.importedWorkflow = workflow;
      state.activeSavedWorkflowId = savedWorkflow.id;
      state.selectedWorkflowStepId = null;
      state.expandedWorkflowStepIds = new Set();
      state.workflowAddStepOpen = false;
      elements.workflowJson.value = JSON.stringify(workflow, null, 2);
      elements.workflowSaveName.value = savedWorkflow.name;
      const inputStep = workflow.steps?.find((step) => step.type === "input");
      workspaceInputSources.setWorkflowInputSourceMode("paste");
      elements.workflowInput.value = inputStep?.text ?? "";
      renderWorkflowView();
      clearWorkflowOutput();
      setWorkflowSavedStatus(`Loaded "${savedWorkflow.name}".`);
      updateInputActionButtons();
    } catch (error) {
      setWorkflowSavedStatus(`Could not load workflow: ${error.message}`);
    }
  }

  async function deleteSavedWorkflowFromLibrary() {
    const id = elements.workflowSavedSelect.value || state.activeSavedWorkflowId;
    setWorkflowSavedStatus("");
    if (!id) {
      setWorkflowSavedStatus("Choose a saved workflow to delete.");
      return;
    }
    const savedWorkflow = state.savedWorkflows.find((item) => item.id === id);
    try {
      await deleteSavedWorkflow(id);
      if (state.activeSavedWorkflowId === id) {
        state.activeSavedWorkflowId = "";
      }
      await refreshSavedWorkflowList({ showError: false });
      setWorkflowSavedStatus(`Deleted "${savedWorkflow?.name ?? "saved workflow"}".`);
    } catch (error) {
      setWorkflowSavedStatus(`Could not delete workflow: ${error.message}`);
    }
  }

  function getSelectedWorkflowStep(workflow) {
    const steps = workflow.steps ?? [];
    if (steps.length === 0) {
      state.selectedWorkflowStepId = null;
      return undefined;
    }

    let step = steps.find((item) => item.id === state.selectedWorkflowStepId);
    if (!step) {
      step =
        [...steps].reverse().find((item) => item.type !== "input") ??
        steps[0];
      state.selectedWorkflowStepId = step.id;
    }
    return step;
  }

  function workflowUsesInput(workflow) {
    return (workflow?.steps ?? []).some((step) => step.type === "input");
  }

  function pruneExpandedWorkflowSteps(workflow) {
    const stepIds = new Set((workflow.steps ?? []).map((step) => step.id));
    for (const stepId of [...state.expandedWorkflowStepIds]) {
      if (!stepIds.has(stepId)) {
        state.expandedWorkflowStepIds.delete(stepId);
      }
    }
  }

  function makeRunnableWorkflow(workflowDefinition = getActiveWorkflowDefinition()) {
    const workflow = cloneWorkflow(workflowDefinition);
    const inputStep = workflow.steps.find((step) => step.type === "input");
    if (inputStep) {
      const activeMode = workspaceInputSources.getWorkflowInputSourceMode(workflowDefinition);
      if (activeMode === "workspace") {
        const selected = workspaceInputSources.getWorkflowSourceSequence(workflowDefinition);
        const workspaceInputText = workspaceInputSources.getWorkflowInputText(workflowDefinition);
        if (!selected || workspaceInputText === null) {
          throw new Error("Choose a compatible workspace sequence or switch the workflow input to Paste / upload.");
        }
        inputStep.text = workspaceInputText;
        inputStep.workspaceSource = {
          id: selected.id,
          name: selected.name,
          alphabet: selected.alphabet,
          length: selected.length
        };
      } else {
        inputStep.text = elements.workflowInput.value;
        delete inputStep.workspaceSource;
      }
    }
    return workflow;
  }

  function getToolById(toolId) {
    const resolvedToolId = toolIdAliases.get(toolId) ?? toolId;
    return tools.find((tool) => tool.metadata.id === resolvedToolId);
  }

  function makeDefaultOptions(tool) {
    const options = {};
    for (const option of flattenOptions(tool?.metadata.options ?? [])) {
      if (
        option.type === "radio" ||
        option.type === "select" ||
        option.type === "checkbox" ||
        option.type === "number" ||
        option.type === "text" ||
        option.type === "textarea" ||
        option.type === "rule-list" ||
        option.type === "value-list"
      ) {
        options[option.id] = option.defaultValue;
      }
    }
    return options;
  }

  function makeStepId(workflow, baseId) {
    const existing = new Set((workflow.steps ?? []).map((step) => step.id));
    let candidate = baseId;
    let index = 2;
    while (existing.has(candidate)) {
      candidate = `${baseId}-${index}`;
      index += 1;
    }
    return candidate;
  }

  function getEditableWorkflow() {
    const workflow = workflowFromJsonOrActive();
    workflow.steps = Array.isArray(workflow.steps) ? workflow.steps : [];
    return workflow;
  }

  function workflowFromJsonOrActive() {
    return cloneWorkflow(getActiveWorkflowDefinition());
  }

  function getWorkflowLastOutput(workflow) {
    let lastOutput;
    let lastTool;

    for (const step of workflow.steps ?? []) {
      if (step.type === "input") {
        lastOutput = { id: "primary", kind: "text", mediaType: step.mediaType ?? "text/plain" };
        continue;
      }

      if (step.type === "tool") {
        lastTool = getToolById(step.toolId);
        lastOutput = lastTool?.metadata.workflow?.outputs?.find((output) => output.id === (step.selectStream ?? "primary"));
        continue;
      }

      if (step.type === "select-stream") {
        const output = lastTool?.metadata.workflow?.outputs?.find((item) => item.id === step.stream);
        if (output) {
          lastOutput = output;
        }
        continue;
      }

      if (step.type === "split") {
        lastOutput = { kind: "collection", itemKind: "sequence-records", itemDescription: "sequence records" };
        continue;
      }

      if (step.type === "orf-gff3-bundle") {
        lastOutput = makeGff3BundleOutput();
        continue;
      }

      if (step.type === "feature-table-gff3-bundle") {
        lastOutput = makeGff3BundleOutput("Curated feature GFF3 + FASTA bundle");
        continue;
      }

      if (step.type === "map") {
        const tool = getToolById(step.toolId);
        const stream = step.selectStream ?? "primary";
        const output = tool?.metadata.workflow?.outputs?.find((item) => item.id === stream);
        lastOutput = {
          kind: "collection",
          itemKind: output?.kind ?? stream,
          itemDescription: makeWorkflowCollectionDescription(output, stream)
        };
        lastTool = tool;
        continue;
      }

      if (step.type === "gather") {
        lastOutput =
          step.as === "table"
            ? { kind: "table" }
            : step.as === "text"
              ? { kind: "text" }
              : { kind: "sequence-records" };
        continue;
      }

      if (step.type === "take") {
        continue;
      }
    }

    return lastOutput;
  }

  function getWorkflowOutputAtIndex(workflow, targetIndex) {
    let lastOutput;
    let lastTool;

    for (const [index, step] of (workflow.steps ?? []).entries()) {
      if (step.type === "input") {
        lastOutput = { id: "primary", kind: "text", mediaType: step.mediaType ?? "text/plain" };
        lastTool = undefined;
      } else if (step.type === "tool") {
        lastTool = getToolById(step.toolId);
        lastOutput = lastTool?.metadata.workflow?.outputs?.find((output) => output.id === (step.selectStream ?? "primary"));
      } else if (step.type === "select-stream") {
        const output = lastTool?.metadata.workflow?.outputs?.find((item) => item.id === step.stream);
        if (output) {
          lastOutput = output;
        }
      } else if (step.type === "split") {
        lastOutput = { kind: "collection", itemKind: "sequence-records", itemDescription: "sequence records" };
      } else if (step.type === "orf-gff3-bundle") {
        lastOutput = makeGff3BundleOutput();
      } else if (step.type === "feature-table-gff3-bundle") {
        lastOutput = makeGff3BundleOutput("Curated feature GFF3 + FASTA bundle");
      } else if (step.type === "map") {
        const tool = getToolById(step.toolId);
        const stream = step.selectStream ?? "primary";
        const output = tool?.metadata.workflow?.outputs?.find((item) => item.id === stream);
        lastOutput = {
          kind: "collection",
          itemKind: output?.kind ?? stream,
          itemDescription: makeWorkflowCollectionDescription(output, stream)
        };
        lastTool = tool;
      } else if (step.type === "gather") {
        lastOutput =
          step.as === "table"
            ? { kind: "table" }
            : step.as === "text"
              ? { kind: "text" }
              : { kind: "sequence-records" };
      }

      if (index === targetIndex) {
        return lastOutput;
      }
    }

    return lastOutput;
  }

  function getSelectedWorkflowStepIndex(workflow) {
    return (workflow.steps ?? []).findIndex((step) => step.id === state.selectedWorkflowStepId);
  }

  function getWorkflowInsertionIndex(workflow) {
    return (workflow.steps ?? []).length;
  }

  function isWorkflowSourceStep(step) {
    if (!step) {
      return false;
    }
    if (step.type === "input") {
      return true;
    }
    if (step.type !== "tool" || step.input) {
      return false;
    }
    return getToolById(step.toolId)?.metadata.inputRequired === false;
  }

  function isOnlyWorkflowSourceStep(workflow, step) {
    return isWorkflowSourceStep(step) &&
      (workflow.steps ?? []).filter((item) => isWorkflowSourceStep(item)).length === 1;
  }

  function getWorkflowOutputAtInsertionPoint(workflow) {
    const insertionIndex = getWorkflowInsertionIndex(workflow);
    return insertionIndex > 0 ? getWorkflowOutputAtIndex(workflow, insertionIndex - 1) : undefined;
  }

  function isAdvancedWorkflowOutput(stream, outputs = []) {
    if (!stream) {
      return true;
    }
    if (stream.hidden || stream.advanced || stream.kind === "warnings" || stream.kind === "stats-records" || stream.kind === "text-records") {
      return true;
    }
    return stream.id === "primary" && outputs.some((output) => output.id !== "primary" && output.kind !== "warnings");
  }

  function getUserSelectableWorkflowOutputs(tool) {
    const outputs = tool?.metadata.workflow?.outputs ?? [];
    const visible = outputs.filter((stream) => !isAdvancedWorkflowOutput(stream, outputs));
    return visible.length > 0 ? visible : outputs.filter((stream) => stream.kind !== "warnings");
  }

  function getWorkflowOutputPriority(stream) {
    const priorityById = {
      orfRecords: 1,
      proteinRecords: 2,
      sequenceRecords: 3,
      table: 4,
      translations: 4,
      matchedRegions: 5,
      fasta: 6,
      nucleotideFasta: 6,
      proteinFasta: 6,
      report: 7,
      groupedText: 8,
      tsv: 9,
      plot: 10,
      overview: 10,
      viewer: 11,
      figure: 11,
      primary: 20
    };
    return priorityById[stream?.id] ?? 15;
  }

  function getRecommendedWorkflowOutputId(tool) {
    const outputs = getUserSelectableWorkflowOutputs(tool);
    return [...outputs].sort((left, right) => getWorkflowOutputPriority(left) - getWorkflowOutputPriority(right))[0]?.id ?? "primary";
  }

  function getWorkflowFieldChoicesForStream(stream) {
    if (!stream) {
      return [];
    }

    if (stream.kind === "table" && Array.isArray(stream.columns) && stream.columns.length > 0) {
      return stream.columns.map((column) => ({
        value: column.id,
        label: `${column.label ?? column.id} (${column.id})`
      }));
    }

    if (stream.kind === "sequence-records" || (stream.kind === "collection" && stream.itemKind === "sequence-records")) {
      return [
        { value: "title", label: "Title (title)" },
        { value: "length", label: "Length (length)" },
        { value: "sequence", label: "Sequence (sequence)" }
      ];
    }

    return [];
  }

  function getWorkflowFieldChoicesAtInsertionPoint(workflow) {
    return getWorkflowFieldChoicesForStream(getWorkflowOutputAtInsertionPoint(workflow));
  }

  function getWorkflowFieldChoicesBeforeStep(workflow, step) {
    const stepIndex = (workflow.steps ?? []).findIndex((item) => item.id === step.id);
    return getWorkflowFieldChoicesForStream(stepIndex > 0 ? getWorkflowOutputAtIndex(workflow, stepIndex - 1) : undefined);
  }

  function replaceWorkflowFieldControl(row, elementKey, choices, fallback) {
    const existing = elements[elementKey];
    const previousValue = existing?.value ?? fallback;
    const control = choices.length > 0 ? document.createElement("select") : document.createElement("input");
    control.id = existing?.id ?? elementKey;

    if (choices.length > 0) {
      control.className = "workflow-field-select";
      for (const choice of choices) {
        const option = document.createElement("option");
        option.value = choice.value;
        option.textContent = choice.label;
        control.append(option);
      }
      control.value = choices.some((choice) => choice.value === previousValue)
        ? previousValue
        : choices.some((choice) => choice.value === fallback)
          ? fallback
          : choices[0].value;
      row.className = "select-row";
    } else {
      control.type = "text";
      control.value = previousValue || fallback;
      row.className = "number-row";
    }

    existing?.replaceWith(control);
    elements[elementKey] = control;
  }

  function getWorkflowStepFlow(workflow, targetIndex) {
    let lastOutput;
    let lastTool;
    const stepOutputs = new Map();
    const stepTools = new Map();

    function getBoundInput(step) {
      if (!step.input) {
        return lastOutput;
      }

      const sourceOutput = stepOutputs.get(step.input.from);
      const streamName = step.input.stream ?? "primary";
      if (streamName === "primary") {
        return sourceOutput;
      }

      const sourceTool = stepTools.get(step.input.from);
      return sourceTool?.metadata.workflow?.outputs?.find((item) => item.id === streamName) ?? sourceOutput;
    }

    for (const [index, step] of (workflow.steps ?? []).entries()) {
      const input = getBoundInput(step);
      let output = lastOutput;

      if (step.type === "input") {
        output = { id: "primary", kind: "text", mediaType: step.mediaType ?? "text/plain" };
        lastTool = undefined;
        stepOutputs.set(step.id, output);
        stepTools.delete(step.id);
      } else if (step.type === "tool") {
        const tool = getToolById(step.toolId);
        output = tool?.metadata.workflow?.outputs?.find((item) => item.id === (step.selectStream ?? "primary"));
        lastTool = tool;
        stepOutputs.set(step.id, output);
        stepTools.set(step.id, tool);
      } else if (step.type === "select-stream") {
        const selected = lastTool?.metadata.workflow?.outputs?.find((item) => item.id === step.stream);
        output = selected ?? output;
        stepOutputs.set(step.id, output);
        stepTools.delete(step.id);
      } else if (step.type === "split") {
        output = { kind: "collection", itemKind: "sequence-records", itemDescription: "sequence records" };
        stepOutputs.set(step.id, output);
        stepTools.delete(step.id);
      } else if (step.type === "orf-gff3-bundle") {
        output = makeGff3BundleOutput();
        stepOutputs.set(step.id, output);
        stepTools.delete(step.id);
      } else if (step.type === "feature-table-gff3-bundle") {
        output = makeGff3BundleOutput("Curated feature GFF3 + FASTA bundle");
        stepOutputs.set(step.id, output);
        stepTools.delete(step.id);
      } else if (step.type === "map") {
        const tool = getToolById(step.toolId);
        const stream = step.selectStream ?? "primary";
        const selected = tool?.metadata.workflow?.outputs?.find((item) => item.id === stream);
        output = {
          kind: "collection",
          itemKind: selected?.kind ?? stream,
          itemDescription: selected ? describeStream(selected) : stream
        };
        lastTool = tool;
        stepOutputs.set(step.id, output);
        stepTools.set(step.id, tool);
      } else if (step.type === "gather") {
        output =
          step.as === "table"
            ? { kind: "table" }
            : step.as === "text"
              ? { kind: "text" }
              : { kind: "sequence-records" };
        stepOutputs.set(step.id, output);
        stepTools.delete(step.id);
      } else {
        stepOutputs.set(step.id, output);
        stepTools.delete(step.id);
      }

      if (index === targetIndex) {
        return { input, output };
      }

      lastOutput = output;
    }

    return { input: lastOutput, output: lastOutput };
  }

  function getWorkflowStepDisplayName(step) {
    if (!step) {
      return "earlier step";
    }
    if (step.type === "input") {
      return "Workflow input";
    }
    if (step.type === "tool" || step.type === "map") {
      return getToolById(step.toolId)?.metadata.name ?? step.toolId ?? "tool step";
    }
    if (step.type === "select-stream") {
      return "Choose a different result";
    }
    if (step.type === "orf-gff3-bundle") {
      return "Build ORF annotation bundle";
    }
    if (step.type === "feature-table-gff3-bundle") {
      return "Build feature annotation bundle";
    }
    return workflowStepTypeLabels[step.type] ?? step.type ?? "earlier step";
  }

  function getWorkflowStepKindLabel(step) {
    if (step.type === "input") {
      return "Source";
    }
    if (step.type === "tool") {
      if (!step.input && (getToolById(step.toolId)?.metadata.workflow?.inputs ?? []).length === 0) {
        return "Source tool";
      }
      return "Tool";
    }
    if (step.type === "map") {
      return "Each record";
    }
    if (step.type === "select-stream") {
      return "Output";
    }
    return "Operation";
  }

  function getWorkflowStepInputDescription(workflow, step) {
    if (!step.input) {
      return "";
    }

    const sourceStep = (workflow?.steps ?? []).find((item) => item.id === step.input.from);
    const streamName = step.input.stream ?? "primary";
    let stream;

    if (streamName === "primary") {
      const sourceIndex = (workflow?.steps ?? []).findIndex((item) => item.id === step.input.from);
      stream = sourceIndex >= 0 ? getWorkflowStepFlow(workflow, sourceIndex).output : undefined;
    } else if (sourceStep?.type === "tool" || sourceStep?.type === "map") {
      stream = getToolById(sourceStep.toolId)?.metadata.workflow?.outputs?.find((item) => item.id === streamName);
    }

    return `${describeStream(stream ?? { kind: streamName })} from ${getWorkflowStepDisplayName(sourceStep)}`;
  }

  function getWorkflowStepOutputDescription(step, flow) {
    if (step.type === "tool" && step.selectStream && step.selectStream !== "primary") {
      return describeWorkflowStreamChoice(flow.output);
    }
    if (step.type === "map" && step.selectStream && step.selectStream !== "primary") {
      return describeWorkflowStreamChoice(flow.output);
    }
    return "";
  }

  function describeWorkflowStep(step, workflow) {
    if (step.type === "input") {
      return "Start from pasted or loaded sequence text";
    }
    if (step.type === "tool") {
      const tool = tools.find((item) => item.metadata.id === step.toolId);
      const input = step.input ? ` using ${getWorkflowStepInputDescription(workflow, step)}` : "";
      const flow = workflow ? getWorkflowStepFlow(workflow, (workflow.steps ?? []).findIndex((item) => item.id === step.id)) : {};
      const output = getWorkflowStepOutputDescription(step, flow);
      if (!flow.input && (tool?.metadata.workflow?.inputs ?? []).length === 0) {
        return `Start with ${tool?.metadata.name ?? step.toolId}${output ? `; output ${output}` : ""}`;
      }
      return `Run ${tool?.metadata.name ?? step.toolId}${input}${output ? `; output ${output}` : ""}`;
    }
    if (step.type === "select-stream") {
      const flow = workflow ? getWorkflowStepFlow(workflow, (workflow.steps ?? []).findIndex((item) => item.id === step.id)) : {};
      return `Use ${describeWorkflowStreamChoice(flow.output ?? { kind: step.stream })}`;
    }
    if (step.type === "split") {
      return "Split multi-record FASTA into individual records";
    }
    if (step.type === "filter") {
      const criteria = step.criteria ?? {};
      return `Keep items where ${criteria.field ?? "field"} ${criteria.operator ?? "contains"} ${criteria.value ?? ""}`;
    }
    if (step.type === "sort") {
      const criteria = step.criteria ?? {};
      return `Sort by ${criteria.field ?? "title"} ${criteria.direction === "desc" ? "descending" : "ascending"}`;
    }
    if (step.type === "take") {
      const count = Number.parseInt(step.count ?? 10, 10);
      return `Keep the first ${Number.isFinite(count) ? Math.max(0, count) : 10} rows or records`;
    }
    if (step.type === "map") {
      const tool = tools.find((item) => item.metadata.id === step.toolId);
      const input = step.input ? ` from ${getWorkflowStepInputDescription(workflow, step)}` : "";
      const flow = workflow ? getWorkflowStepFlow(workflow, (workflow.steps ?? []).findIndex((item) => item.id === step.id)) : {};
      const output = getWorkflowStepOutputDescription(step, flow);
      return `Run ${tool?.metadata.name ?? step.toolId} on each item${input}${output ? `; output ${output}` : ""}`;
    }
    if (step.type === "gather") {
      return `Gather items as ${step.as ?? "auto"}`;
    }
    if (step.type === "orf-gff3-bundle") {
      return "Combine the sequence and predicted ORFs into a GFF3 + FASTA annotation bundle";
    }
    if (step.type === "feature-table-gff3-bundle") {
      return "Combine the extracted sequence and curated feature rows into a GFF3 + FASTA annotation bundle";
    }
    return step.type;
  }

  function renderWorkflowView() {
    const preset = getSelectedWorkflowPreset();

    elements.workflowPreset.textContent = "";
    for (const item of workflowPresets) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      elements.workflowPreset.append(option);
    }
    elements.workflowPreset.value = state.pendingWorkflowRecipe || preset.id;
    updateWorkflowRecipeActionButton();
    if (elements.workflowRecipePanel && "open" in elements.workflowRecipePanel) {
      elements.workflowRecipePanel.open = false;
    }

    updateInputActionButtons();
    const activeWorkflow = getActiveWorkflowDefinition();
    const needsInput = workflowUsesInput(activeWorkflow);
    const steps = activeWorkflow.steps ?? [];
    const lastOutput = getWorkflowLastOutput(activeWorkflow);
    const runSummary = state.workflowRunSummary;
    const outputFact = runSummary
      ? (runSummary.output || describeStream(lastOutput))
      : `${describeStream(lastOutput)} · not run yet`;
    const statusFact = runSummary?.status ?? "Not run yet";

    elements.workflowSummary.textContent = "";
    const workflowOverview = document.createElement("div");
    workflowOverview.className = "workflow-overview";
    const workflowIntro = document.createElement("div");
    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = state.activeSavedWorkflowId
      ? "Saved workflow is active. The preset selector remains available for replacing it."
      : state.importedWorkflow
        ? "Edited workflow is active. The preset selector remains available for replacing it."
        : preset.summary;
    const title = document.createElement("h4");
    title.textContent = `Current workflow: ${getDefaultWorkflowSaveName()}`;
    workflowIntro.append(title, summary);

    const workflowFacts = document.createElement("dl");
    workflowFacts.className = "workflow-facts";
    const addFact = (label, value) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      workflowFacts.append(term, description);
    };
    addFact("Input", needsInput ? "Paste/upload or workspace sequence" : "Generated by first step");
    addFact("Steps", pluralize(steps.length, "step"));
    addFact("Output", outputFact);
    addFact("Status", statusFact);
    workflowOverview.append(workflowIntro, workflowFacts);
    elements.workflowSummary.append(workflowOverview);

    elements.workflowInputTitle.textContent = needsInput ? "Input" : "Workflow run";
    elements.workflowInputActions.hidden = !needsInput;
    elements.workflowInput.hidden = !needsInput;
    elements.workflowInputNote.hidden = needsInput;
    elements.workflowInputNote.textContent = needsInput
      ? ""
      : "This workflow creates its starting data with a tool, so no pasted input is needed.";
    workspaceInputSources.renderWorkflowSource(activeWorkflow, needsInput);
    pruneExpandedWorkflowSteps(activeWorkflow);
    const selectedStep = getSelectedWorkflowStep(activeWorkflow);
    renderSavedWorkflowControls();

    const list = document.createElement("ol");
    list.className = "workflow-step-list";
    steps.forEach((step, index) => {
      const flow = getWorkflowStepFlow(activeWorkflow, index);
      const isExpanded = state.expandedWorkflowStepIds.has(step.id);
      const item = document.createElement("li");
      item.className = "workflow-step-item";
      item.dataset.stepId = step.id;
      item.dataset.expanded = String(isExpanded);
      const card = document.createElement("div");
      card.className = "workflow-step-card";
      card.dataset.expanded = String(isExpanded);
      card.dataset.selected = String(step.id === selectedStep?.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "workflow-step-toggle";
      button.setAttribute("aria-expanded", String(isExpanded));
      button.title = `${isExpanded ? "Collapse" : "Expand"} step ${step.id}`;
      button.addEventListener("click", () => {
        state.selectedWorkflowStepId = step.id;
        if (state.expandedWorkflowStepIds.has(step.id)) {
          state.expandedWorkflowStepIds.delete(step.id);
        } else {
          state.expandedWorkflowStepIds.add(step.id);
        }
        renderWorkflowView();
      });
      const titleRow = document.createElement("span");
      titleRow.className = "workflow-step-title-row";
      const kind = document.createElement("span");
      kind.className = "workflow-step-kind";
      kind.textContent = getWorkflowStepKindLabel(step);
      const title = document.createElement("strong");
      title.textContent = getWorkflowStepDisplayName(step);
      titleRow.append(kind, title);
      const detail = document.createElement("span");
      detail.className = "workflow-step-detail";
      detail.textContent = describeWorkflowStep(step, activeWorkflow);
      const stepInput = document.createElement("small");
      stepInput.className = "workflow-step-flow-line";
      const stepOutput = document.createElement("small");
      stepOutput.className = "workflow-step-flow-line";
      const stepStatus = document.createElement("small");
      stepStatus.className = "workflow-step-status-line";
      if (step.type === "input") {
        stepInput.textContent = "Input: pasted/uploaded text or selected workspace sequence";
        stepOutput.textContent = "Output: workflow input text";
        stepStatus.textContent = "Status: ready";
      } else if (!flow.input && step.type === "tool") {
        stepInput.textContent = "Input: generated by this source tool";
        stepOutput.textContent = `Output: ${describeWorkflowStreamChoice(flow.output)}`;
        stepStatus.textContent = "Status: not run";
      } else {
        const inputDescription = step.input
          ? getWorkflowStepInputDescription(activeWorkflow, step)
          : describeStream(flow.input);
        stepInput.textContent = `Input: ${inputDescription}`;
        stepOutput.textContent = `Output: ${describeWorkflowStreamChoice(flow.output)}`;
        stepStatus.textContent = "Status: not run";
      }

      const actions = document.createElement("div");
      actions.className = "workflow-step-actions";
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "icon-button workflow-delete-step";
        deleteButton.setAttribute("aria-label", `Remove step ${step.id}`);
        deleteButton.disabled = isOnlyWorkflowSourceStep(activeWorkflow, step);
        if (deleteButton.disabled) {
          deleteButton.title = "The only source step cannot be removed.";
        }
        deleteButton.innerHTML = `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>`;
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        removeWorkflowStep(step.id);
      });
      actions.append(deleteButton);
      button.append(titleRow, detail, stepInput, stepOutput, stepStatus);
      card.append(button, actions);
      item.append(card);
      if (isExpanded) {
        const editor = document.createElement("div");
        editor.className = "workflow-step-editor";
        renderWorkflowStepEditor(editor, step);
        item.append(editor);
      }
      list.append(item);
    });
    elements.workflowSummary.append(list);
    renderWorkflowBuilderControls();
  }

  function getCompatibleToolsForAppend(workflow) {
    const lastOutput = getWorkflowOutputAtInsertionPoint(workflow);
    if (!lastOutput) {
      return tools.filter((tool) => (tool.metadata.workflow?.inputs ?? []).length === 0);
    }
    if (lastOutput.kind === "collection") {
      return [];
    }

    return tools.filter((tool) =>
      (tool.metadata.workflow?.inputs ?? []).some((input) => {
        if (input.kind !== lastOutput.kind) {
          return false;
        }
        if (input.alphabet && lastOutput.alphabet && input.alphabet !== lastOutput.alphabet) {
          return false;
        }
        return true;
      })
    );
  }

  function getSelectableStreamsForAppend(workflow) {
    const insertionIndex = getWorkflowInsertionIndex(workflow);
    const previousSteps = (workflow.steps ?? []).slice(0, insertionIndex);
    const lastToolStep = [...previousSteps].reverse().find((step) => step.type === "tool" || step.type === "map");
    const tool = getToolById(lastToolStep?.toolId);
    const outputs = getUserSelectableWorkflowOutputs(tool);
    return outputs.length > 0 ? outputs : [{ id: "primary", kind: "text", mediaType: "text/plain" }];
  }

  function getWorkflowBuilderGuidance(workflow, stepType) {
    const lastOutput = getWorkflowOutputAtInsertionPoint(workflow);
    const current = describeStream(lastOutput);
    if (!lastOutput) {
      return "Choose a source step or generator for the recipe.";
    }
    return `Add the next compatible action. Previous output: ${current}.`;
  }

  const workflowStepTypeLabels = {
    tool: "Run a tool",
    "select-stream": "Choose output to pass on",
    split: "Split records",
    filter: "Filter rows or records",
    sort: "Sort rows or records",
    take: "Keep top rows or records",
    gather: "Gather results",
    map: "Run a tool for each record",
    "feature-table-gff3-bundle": "Build feature annotation bundle"
  };

  const displayFormatWorkflowOptionIds = new Set(["formatFasta", "lineWidth"]);

  function makeWorkflowCollectionDescription(output, fallback = "result") {
    if (!output) {
      return fallback;
    }
    return describeStream(output);
  }

  function hasSelectableStreamsForAppend(workflow) {
    return getSelectableStreamsForAppend(workflow).length > 1;
  }

  function getCompatibleStepTypesForAppend(workflow) {
    const lastOutput = getWorkflowOutputAtInsertionPoint(workflow);
    const stepTypes = [];

    if (getCompatibleToolsForAppend(workflow).length > 0) {
      stepTypes.push("tool");
    }

    if (!lastOutput || lastOutput.kind === "text" || lastOutput.kind === "sequence-records") {
      stepTypes.push("split");
    }

    if (lastOutput?.kind === "collection") {
      stepTypes.push("map", "filter", "sort", "take", "gather");
    } else if (lastOutput?.kind === "sequence-records" || lastOutput?.kind === "table") {
      stepTypes.push("filter", "sort", "take");
    }

    if (hasSelectableStreamsForAppend(workflow)) {
      stepTypes.push("select-stream");
    }

    return [...new Set(stepTypes)];
  }

  function getUnavailableStepTypeReasons(workflow, availableStepTypes) {
    const lastOutput = getWorkflowOutputAtInsertionPoint(workflow);
    const available = new Set(availableStepTypes);
    const reasons = [];

    if (!available.has("tool")) {
      reasons.push(
        lastOutput?.kind === "collection"
          ? "Run a compatible tool needs a single result; use Run tool on each record for a set."
          : "Run a compatible tool is unavailable because no tool accepts the current output."
      );
    }

    if (!available.has("split")) {
      reasons.push("Split FASTA records needs text or sequence records.");
    }

    if (!available.has("map")) {
      reasons.push("Run tool on each record needs a set from Split FASTA records.");
    }

    if (!available.has("filter") && !available.has("sort") && !available.has("take")) {
      reasons.push("Filter, Sort, and Keep top need rows, sequence records, or a set.");
    }

    if (!available.has("gather")) {
      reasons.push("Gather mapped results needs a set.");
    }

    if (!available.has("select-stream")) {
      reasons.push("Choose a different result needs another usable output from the latest tool.");
    }

    return reasons;
  }

  function renderWorkflowStepTypeChoices(workflow) {
    const previousValue = elements.workflowAddStepType.value;
    const stepTypes = getCompatibleStepTypesForAppend(workflow);
    elements.workflowAddStepType.textContent = "";

    for (const stepType of stepTypes) {
      const option = document.createElement("option");
      option.value = stepType;
      option.textContent =
        !getWorkflowOutputAtInsertionPoint(workflow) && stepType === "tool"
          ? "Create starting data with a tool"
          : workflowStepTypeLabels[stepType] ?? stepType;
      elements.workflowAddStepType.append(option);
    }

    if (stepTypes.includes(previousValue)) {
      elements.workflowAddStepType.value = previousValue;
    } else if (stepTypes.length > 0) {
      elements.workflowAddStepType.value = stepTypes[0];
    }

    elements.workflowOpenAddStep.disabled = stepTypes.length === 0;

    return stepTypes;
  }

  function renderWorkflowBuilderGuidance(workflow, stepType, availableStepTypes) {
    elements.workflowBuilderGuidance.textContent = "";
    const guidance = document.createElement("p");
    guidance.textContent = getWorkflowBuilderGuidance(workflow, stepType);
    elements.workflowBuilderGuidance.append(guidance);

    const hiddenReasons = getUnavailableStepTypeReasons(workflow, availableStepTypes);
    if (hiddenReasons.length === 0) {
      return;
    }

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Why are some actions unavailable?";
    const list = document.createElement("ul");
    for (const reason of hiddenReasons) {
      const item = document.createElement("li");
      item.textContent = reason;
      list.append(item);
    }
    details.append(summary, list);
    elements.workflowBuilderGuidance.append(details);
  }

  function renderWorkflowBuilderControls() {
    const workflow = workflowFromJsonOrActive();
    const availableStepTypes = renderWorkflowStepTypeChoices(workflow);
    elements.workflowAddStepDraft.hidden = !state.workflowAddStepOpen;
    elements.workflowOpenAddStep.hidden = state.workflowAddStepOpen;
    elements.workflowOpenAddStep.setAttribute("aria-expanded", String(state.workflowAddStepOpen));
    if (!state.workflowAddStepOpen) {
      elements.workflowBuilderGuidance.textContent = "";
      return;
    }
    const stepType = elements.workflowAddStepType.value;
    const showTool = stepType === "tool" || stepType === "map";
    const showStream = stepType === "select-stream" || stepType === "map";
    const showFilter = stepType === "filter";
    const showSort = stepType === "sort";
    const showTake = stepType === "take";
    const showGather = stepType === "gather";

    elements.workflowAddToolRow.hidden = !showTool;
    elements.workflowAddStreamRow.hidden = !showStream;
    elements.workflowAddFilterFieldRow.hidden = !showFilter;
    elements.workflowAddFilterOperatorRow.hidden = !showFilter;
    elements.workflowAddFilterValueRow.hidden = !showFilter;
    elements.workflowAddSortFieldRow.hidden = !showSort;
    elements.workflowAddSortDirectionRow.hidden = !showSort;
    elements.workflowAddTakeCountRow.hidden = !showTake;
    elements.workflowAddGatherRow.hidden = !showGather;
    renderWorkflowBuilderGuidance(workflow, stepType, availableStepTypes);

    const fieldChoices = getWorkflowFieldChoicesAtInsertionPoint(workflow);
    if (showFilter) {
      replaceWorkflowFieldControl(elements.workflowAddFilterFieldRow, "workflowAddFilterField", fieldChoices, "length");
    }
    if (showSort) {
      replaceWorkflowFieldControl(elements.workflowAddSortFieldRow, "workflowAddSortField", fieldChoices, "length");
    }

    if (showTool) {
      const previousValue = elements.workflowAddTool.value;
      const toolChoices = stepType === "tool" ? getCompatibleToolsForAppend(workflow) : tools;
      elements.workflowAddTool.textContent = "";
      for (const tool of toolChoices) {
        const option = document.createElement("option");
        option.value = tool.metadata.id;
        option.textContent = tool.metadata.name;
        elements.workflowAddTool.append(option);
      }
      if (toolChoices.some((tool) => tool.metadata.id === previousValue)) {
        elements.workflowAddTool.value = previousValue;
      }
    }

    if (showStream) {
      const previousValue = elements.workflowAddStream.value;
      const streams =
        stepType === "map"
          ? getUserSelectableWorkflowOutputs(getToolById(elements.workflowAddTool.value))
          : getSelectableStreamsForAppend(workflow);
      elements.workflowAddStream.textContent = "";
      for (const stream of streams) {
        const option = document.createElement("option");
        option.value = stream.id;
        option.textContent = describeWorkflowStreamChoice(stream);
        elements.workflowAddStream.append(option);
      }
      if (streams.some((stream) => stream.id === previousValue)) {
        elements.workflowAddStream.value = previousValue;
      }
    }
  }

  function getStreamsBeforeStep(workflow, stepId) {
    const steps = workflow.steps ?? [];
    const selectedIndex = steps.findIndex((step) => step.id === stepId);
    const beforeSteps = selectedIndex >= 0 ? steps.slice(0, selectedIndex) : steps;
    const lastToolStep = [...beforeSteps].reverse().find((step) => step.type === "tool" || step.type === "map");
    const tool = getToolById(lastToolStep?.toolId);
    const outputs = getUserSelectableWorkflowOutputs(tool);
    return outputs.length > 0 ? outputs : [{ id: "primary", kind: "text", mediaType: "text/plain" }];
  }

  function stepFeedsExplicitWorkflowInput(workflow, stepId) {
    return (workflow.steps ?? []).some((item) => item.input?.from === stepId);
  }

  function shouldShowWorkflowOption(workflow, step, option) {
    const selectedStream = step.selectStream ?? "primary";

    if (!displayFormatWorkflowOptionIds.has(option.id)) {
      return true;
    }

    if (option.id === "outputFormat") {
      if (selectedStream !== "primary") {
        return false;
      }
      return !stepFeedsExplicitWorkflowInput(workflow, step.id);
    }

    return selectedStream === "primary" || selectedStream === "fasta";
  }

  function updateSelectedWorkflowStep(mutator, message) {
    const workflow = workflowFromJsonOrActive();
    const step = getSelectedWorkflowStep(workflow);
    if (!step) {
      return;
    }

    mutator(step, workflow);
    setWorkflowDefinition(workflow);
    clearWorkflowOutput();
    renderWorkflowView();
    addWorkflowMessage(message);
  }

  function makeTextInput(labelText, value, onChange) {
    const label = document.createElement("label");
    label.className = "number-row";
    label.append(labelText);
    const input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
    input.addEventListener("change", () => onChange(input.value));
    label.append(input);
    return label;
  }

  function makeSelectInput(labelText, value, choices, onChange) {
    const label = document.createElement("label");
    label.className = "select-row";
    label.textContent = labelText;
    const select = document.createElement("select");
    for (const choice of choices) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      select.append(option);
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    label.append(select);
    return label;
  }

  function makeFieldInput(labelText, value, choices, fallback, onChange) {
    if (choices.length > 0) {
      const normalizedChoices = choices.some((choice) => choice.value === value) || !value
        ? choices
        : [{ value, label: `Unknown field (${value})` }, ...choices];
      const selectValue = normalizedChoices.some((choice) => choice.value === value)
        ? value
        : normalizedChoices.some((choice) => choice.value === fallback)
          ? fallback
          : normalizedChoices[0].value;
      return makeSelectInput(labelText, selectValue, normalizedChoices, onChange);
    }
    return makeTextInput(labelText, value ?? fallback, onChange);
  }

  function renderWorkflowOperationEditor(workflow, step, container) {
    const grid = document.createElement("div");
    grid.className = "workflow-option-grid";

    if (step.type === "split") {
      const note = document.createElement("p");
      note.className = "workflow-builder-guidance";
      note.textContent = "Split has no settings yet. It turns incoming sequence text into one record per FASTA entry.";
      container.append(note);
      return;
    }

    if (step.type === "orf-gff3-bundle") {
      const note = document.createElement("p");
      note.className = "workflow-builder-guidance";
      note.textContent = "This preset step has no editable settings. It writes predicted ORFs as GFF3 features and pairs them with the sequence FASTA for the next tool.";
      container.append(note);
      return;
    }

    if (step.type === "feature-table-gff3-bundle") {
      const note = document.createElement("p");
      note.className = "workflow-builder-guidance";
      note.textContent = "This preset step has no editable settings. It writes the curated feature table as GFF3 and pairs it with the extracted sequence FASTA for the next tool.";
      container.append(note);
      return;
    }

    if (step.type === "filter") {
      const criteria = step.criteria ?? {};
      const fieldChoices = getWorkflowFieldChoicesBeforeStep(workflow, step);
      grid.append(
        makeFieldInput("Field", criteria.field ?? "length", fieldChoices, "length", (value) =>
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.criteria = { ...(selectedStep.criteria ?? {}), field: value || "length" };
            },
            `Updated ${step.id} filter field.`
          )
        )
      );
      grid.append(
        makeSelectInput(
          "Operator",
          criteria.operator ?? ">=",
          [
            { value: ">=", label: ">=" },
            { value: ">", label: ">" },
            { value: "<=", label: "<=" },
            { value: "<", label: "<" },
            { value: "==", label: "==" },
            { value: "!=", label: "!=" },
            { value: "contains", label: "contains" },
            { value: "matches", label: "matches" }
          ],
          (value) =>
            updateSelectedWorkflowStep(
              (selectedStep) => {
                selectedStep.criteria = { ...(selectedStep.criteria ?? {}), operator: value };
              },
              `Updated ${step.id} filter operator.`
            )
        )
      );
      grid.append(
        makeTextInput("Value", criteria.value ?? "", (value) =>
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.criteria = { ...(selectedStep.criteria ?? {}), value };
            },
            `Updated ${step.id} filter value.`
          )
        )
      );
    }

    if (step.type === "sort") {
      const criteria = step.criteria ?? {};
      const fieldChoices = getWorkflowFieldChoicesBeforeStep(workflow, step);
      grid.append(
        makeFieldInput("Sort field", criteria.field ?? "length", fieldChoices, "length", (value) =>
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.criteria = { ...(selectedStep.criteria ?? {}), field: value || "length" };
            },
            `Updated ${step.id} sort field.`
          )
        )
      );
      grid.append(
        makeSelectInput(
          "Direction",
          criteria.direction === "desc" ? "desc" : "asc",
          [
            { value: "asc", label: "Ascending" },
            { value: "desc", label: "Descending" }
          ],
          (value) =>
            updateSelectedWorkflowStep(
              (selectedStep) => {
                selectedStep.criteria = { ...(selectedStep.criteria ?? {}), direction: value === "desc" ? "desc" : "asc" };
              },
              `Updated ${step.id} sort direction.`
            )
        )
      );
    }

    if (step.type === "take") {
      grid.append(
        makeTextInput("Count", step.count ?? 10, (value) =>
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.count = value;
            },
            `Updated ${step.id} count.`
          )
        )
      );
    }

    if (step.type === "gather") {
      grid.append(
        makeSelectInput(
          "Gather as",
          step.as ?? "auto",
          [
            { value: "auto", label: "Auto" },
            { value: "sequence-records", label: "Sequence records" },
            { value: "table", label: "Table" },
            { value: "text", label: "Text" }
          ],
          (value) =>
            updateSelectedWorkflowStep(
              (selectedStep) => {
                selectedStep.as = value;
              },
              `Updated ${step.id} gather mode.`
            )
        )
      );
    }

    container.append(grid);
  }

  function renderWorkflowStepEditor(container, step) {
    const workflow = workflowFromJsonOrActive();
    const heading = document.createElement("h4");
    heading.textContent = `Step settings: ${getWorkflowStepDisplayName(step)}`;
    container.append(heading);

    const help = document.createElement("p");
    help.className = "summary";
    help.textContent = describeWorkflowStep(step, workflow);
    container.append(help);

    if (step.type === "input") {
      const note = document.createElement("p");
      note.className = "workflow-builder-guidance";
      note.textContent = "The input step uses the Input panel when the workflow runs.";
      container.append(note);
      return;
    }

    if (step.type === "select-stream") {
      const grid = document.createElement("div");
      grid.className = "workflow-option-grid";
      const label = document.createElement("label");
      label.className = "select-row";
      label.textContent = "Result to use";
      const select = document.createElement("select");
      select.name = "stream";
      const visibleStreams = getStreamsBeforeStep(workflow, step.id);
      const stepIndex = (workflow.steps ?? []).findIndex((item) => item.id === step.id);
      const previousToolStep = [...((workflow.steps ?? []).slice(0, stepIndex))].reverse().find((item) => item.type === "tool" || item.type === "map");
      const currentTool = getToolById(previousToolStep?.toolId);
      const currentStream = (currentTool?.metadata.workflow?.outputs ?? []).find((stream) => stream.id === step.stream);
      const streams = currentStream && !visibleStreams.some((stream) => stream.id === currentStream.id)
        ? [currentStream, ...visibleStreams]
        : visibleStreams;
      for (const stream of streams) {
        const option = document.createElement("option");
        option.value = stream.id;
        option.textContent = describeWorkflowStreamChoice(stream);
        select.append(option);
      }
      select.value = step.stream ?? streams[0]?.id ?? "primary";
      select.addEventListener("change", () => {
        updateSelectedWorkflowStep(
          (selectedStep) => {
            selectedStep.stream = select.value;
          },
          `Updated ${step.id} selected result.`
        );
      });
      label.append(select);
      grid.append(label);
      container.append(grid);
      return;
    }

    if (step.type === "filter" || step.type === "sort" || step.type === "take" || step.type === "gather" || step.type === "split" || step.type === "orf-gff3-bundle" || step.type === "feature-table-gff3-bundle") {
      renderWorkflowOperationEditor(workflow, step, container);
      return;
    }

    const tool = getToolById(step.toolId);
    let editableOptions = flattenOptions(tool?.metadata.options ?? []).filter((option) =>
      (
        option.type === "radio" ||
        option.type === "select" ||
        option.type === "checkbox" ||
        option.type === "number" ||
        option.type === "text" ||
        option.type === "textarea" ||
        option.type === "rule-list" ||
        option.type === "value-list"
      ) &&
      shouldShowWorkflowOption(workflow, step, option)
    );

    const grid = document.createElement("div");
    grid.className = "workflow-option-grid";
    step.options = normalizeDependentOptionValues(editableOptions, {
      ...makeDefaultOptions(tool),
      ...(step.options ?? {})
    });
    editableOptions = editableOptions.filter((option) => {
      if (!option.visibleWhen) {
        return true;
      }
      return visibleWhenMatches(option.visibleWhen, step.options);
    });

    if (step.input) {
      const note = document.createElement("p");
      note.className = "workflow-builder-guidance";
      note.textContent = `Input: ${getWorkflowStepInputDescription(workflow, step)}.`;
      container.append(note);
    }

    if (step.type === "map" || step.type === "tool") {
      const outputs = getUserSelectableWorkflowOutputs(tool);
      const selectedStream = outputs.some((stream) => stream.id === (step.selectStream ?? "primary"))
        ? (step.selectStream ?? "primary")
        : (tool?.metadata.workflow?.outputs ?? []).some((stream) => stream.id === (step.selectStream ?? "primary"))
          ? (step.selectStream ?? "primary")
          : getRecommendedWorkflowOutputId(tool);
      const label = document.createElement("label");
      label.className = "select-row";
      label.textContent = step.type === "map" ? "Keep from each record" : "Result to pass on";
      const select = document.createElement("select");
      select.name = "selectStream";
      const selectOutputs = outputs.some((stream) => stream.id === selectedStream)
        ? outputs
        : [
            ...((tool?.metadata.workflow?.outputs ?? []).filter((stream) => stream.id === selectedStream)),
            ...outputs
          ];
      for (const stream of selectOutputs) {
        const option = document.createElement("option");
        option.value = stream.id;
        option.textContent = describeWorkflowStreamChoice(stream);
        select.append(option);
      }
      select.value = selectedStream;
      select.addEventListener("change", () => {
        updateSelectedWorkflowStep(
          (selectedStep) => {
            selectedStep.selectStream = select.value;
          },
          `Updated ${step.id} result.`
        );
      });
      label.append(select);
      grid.append(label);
    }

    for (const option of editableOptions) {
      if (option.type === "radio" || option.type === "select") {
        const label = document.createElement("label");
        label.className = "select-row";
        label.append(createOptionLabelContent(option));
        const select = document.createElement("select");
        select.name = option.id;
        populateDependentSelect(select, option, step.options, step.options[option.id] ?? option.defaultValue);
        select.addEventListener("change", () =>
          updateSelectedWorkflowStep(
            (selectedStep) => {
              const nextOptions = { ...(selectedStep.options ?? {}), [option.id]: select.value };
              selectedStep.options = normalizeDependentOptionValues(editableOptions, nextOptions);
            },
            `Updated ${step.id} option ${option.label}.`
          )
        );
        label.append(select);
        grid.append(label);
        continue;
      }

      if (option.type === "checkbox") {
        const label = document.createElement("label");
        label.className = "checkbox-row";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = option.id;
        input.checked = step.options[option.id] ?? option.defaultValue;
        input.addEventListener("change", () =>
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.options = { ...(selectedStep.options ?? {}), [option.id]: input.checked };
            },
            `Updated ${step.id} option ${option.label}.`
          )
        );
        label.append(input, createOptionLabelContent(option));
        grid.append(label);
        continue;
      }

      if (option.type === "number") {
        const label = document.createElement("label");
        label.className = "number-row";
        label.append(createOptionLabelContent(option));
        const input = document.createElement("input");
        input.type = "number";
        input.name = option.id;
        input.min = option.min;
        input.max = option.max;
        input.value = step.options[option.id] ?? option.defaultValue;
        input.addEventListener("change", () => {
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.options = {
                ...(selectedStep.options ?? {}),
                [option.id]: Number.parseInt(input.value, 10) || option.defaultValue
              };
            },
            `Updated ${step.id} option ${option.label}.`
          );
        });
        label.append(input);
        grid.append(label);
        continue;
      }

      if (option.type === "text") {
        const label = document.createElement("label");
        label.className = "text-row";
        label.append(createOptionLabelContent(option));
        const input = document.createElement("input");
        input.type = "text";
        input.name = option.id;
        input.value = step.options[option.id] ?? option.defaultValue ?? "";
        input.addEventListener("change", () => {
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.options = { ...(selectedStep.options ?? {}), [option.id]: input.value };
            },
            `Updated ${step.id} option ${option.label}.`
          );
        });
        label.append(input);
        grid.append(label);
      }

      if (option.type === "textarea") {
        const label = document.createElement("label");
        label.className = "text-row";
        label.append(createOptionLabelContent(option));
        const input = document.createElement("textarea");
        input.name = option.id;
        input.rows = option.rows ?? 5;
        input.spellcheck = false;
        input.wrap = "off";
        input.value = step.options[option.id] ?? option.defaultValue ?? "";
        input.addEventListener("change", () => {
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.options = { ...(selectedStep.options ?? {}), [option.id]: input.value };
            },
            `Updated ${step.id} option ${option.label}.`
          );
        });
        label.append(input);
        grid.append(label);
        continue;
      }

      if (option.type === "rule-list") {
        appendRuleListControl(grid, option, step.options[option.id] ?? option.defaultValue ?? "", (value) => {
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.options = { ...(selectedStep.options ?? {}), [option.id]: value };
            },
            `Updated ${step.id} option ${option.label}.`
          );
        });
        continue;
      }

      if (option.type === "value-list") {
        appendValueListControl(grid, option, step.options[option.id] ?? option.defaultValue ?? "", (value) => {
          updateSelectedWorkflowStep(
            (selectedStep) => {
              selectedStep.options = { ...(selectedStep.options ?? {}), [option.id]: value };
            },
            `Updated ${step.id} option ${option.label}.`
          );
        });
      }
    }

    container.append(grid);
  }

  function appendWorkflowStep() {
    const workflow = getEditableWorkflow();
    const stepType = elements.workflowAddStepType.value;
    const insertionIndex = getWorkflowInsertionIndex(workflow);
    let step;

    if (stepType === "tool") {
      const tool = getToolById(elements.workflowAddTool.value) ?? tools[0];
      step = {
        id: makeStepId(workflow, tool.metadata.id),
        type: "tool",
        toolId: tool.metadata.id,
        selectStream: getRecommendedWorkflowOutputId(tool),
        options: makeDefaultOptions(tool)
      };
    } else if (stepType === "map") {
      const tool = getToolById(elements.workflowAddTool.value) ?? tools[0];
      step = {
        id: makeStepId(workflow, `map-${tool.metadata.id}`),
        type: "map",
        toolId: tool.metadata.id,
        selectStream: elements.workflowAddStream.value || getRecommendedWorkflowOutputId(tool),
        options: makeDefaultOptions(tool)
      };
    } else if (stepType === "select-stream") {
      step = {
        id: makeStepId(workflow, `select-${elements.workflowAddStream.value || "stream"}`),
        type: "select-stream",
        stream: elements.workflowAddStream.value || "primary"
      };
    } else if (stepType === "split") {
      step = {
        id: makeStepId(workflow, "split"),
        type: "split"
      };
    } else if (stepType === "filter") {
      step = {
        id: makeStepId(workflow, "filter"),
        type: "filter",
        criteria: {
          field: elements.workflowAddFilterField.value || "length",
          operator: elements.workflowAddFilterOperator.value || ">=",
          value: elements.workflowAddFilterValue.value || ""
        }
      };
    } else if (stepType === "sort") {
      step = {
        id: makeStepId(workflow, "sort"),
        type: "sort",
        criteria: {
          field: elements.workflowAddSortField.value || "title",
          direction: elements.workflowAddSortDirection.value === "desc" ? "desc" : "asc"
        }
      };
    } else if (stepType === "take") {
      const count = Number.parseInt(elements.workflowAddTakeCount.value || "10", 10);
      step = {
        id: makeStepId(workflow, "take"),
        type: "take",
        count: Number.isFinite(count) ? Math.max(0, count) : 10
      };
    } else if (stepType === "gather") {
      step = {
        id: makeStepId(workflow, "gather"),
        type: "gather",
        as: elements.workflowAddGatherAs.value || "auto"
      };
    }

    if (!step) {
      return;
    }

    workflow.steps.splice(insertionIndex, 0, step);
    state.selectedWorkflowStepId = step.id;
    state.expandedWorkflowStepIds.add(step.id);
    state.workflowAddStepOpen = false;
    setWorkflowDefinition(workflow);
    renderWorkflowView();
    clearWorkflowOutput();
    addWorkflowMessage(`Inserted ${describeWorkflowStep(step, workflow)}.`);
  }

  function openWorkflowAddStepDraft() {
    state.workflowAddStepOpen = true;
    renderWorkflowView();
  }

  function cancelWorkflowAddStepDraft() {
    state.workflowAddStepOpen = false;
    renderWorkflowView();
  }

  function removeWorkflowStep(stepId = state.selectedWorkflowStepId) {
    const workflow = getEditableWorkflow();
    const steps = workflow.steps ?? [];
    const targetIndex = steps.findIndex((step) => step.id === stepId);
    const target = steps[targetIndex];

    if (!target) {
      elements.workflowMessages.textContent = "";
      addWorkflowMessage("No workflow step to remove.", "warning");
      return;
    }

    if (isOnlyWorkflowSourceStep(workflow, target)) {
      elements.workflowMessages.textContent = "";
      addWorkflowMessage("The only source step cannot be removed. Replace the starting workflow instead.", "warning");
      return;
    }

    const [removed] = steps.splice(targetIndex, 1);
    state.expandedWorkflowStepIds.delete(removed.id);
    state.selectedWorkflowStepId = steps[Math.min(targetIndex, steps.length - 1)]?.id ?? null;
    setWorkflowDefinition(workflow);
    renderWorkflowView();
    clearWorkflowOutput();
    addWorkflowMessage(`Removed step ${removed.id ?? removed.type}.`);
  }

  return {
    formatWorkflowValue,
    getSelectedWorkflowPreset,
    cloneWorkflow,
    getActiveWorkflowDefinition,
    setWorkflowDefinition,
    getDefaultWorkflowSaveName,
    setWorkflowSavedStatus,
    setWorkflowSourceMode,
    renderSavedWorkflowControls,
    updateWorkflowRecipeActionButton,
    updateSavedWorkflowActionButtons,
    getWorkflowDefinitionForStorage,
    workflowUsesInput,
    makeRunnableWorkflow,
    getToolById,
    getWorkflowStepDisplayName,
    getWorkflowStepKindLabel,
    describeWorkflowStep,
    renderWorkflowView,
    renderWorkflowBuilderControls,
    refreshSavedWorkflowList,
    saveCurrentWorkflowToLibrary,
    loadSavedWorkflowFromLibrary,
    deleteSavedWorkflowFromLibrary,
    appendWorkflowStep,
    openWorkflowAddStepDraft,
    cancelWorkflowAddStepDraft,
    removeWorkflowStep
  };
}
