import { tools } from "../tools/registry.js";
import { compareToolCategories } from "../tools/categories.js";
import { ToolWorkerClient } from "./worker-client.js";
import { describeStream } from "./workflow-stream-labels.js";
import {
  createTabbedInputWorkflowTabs,
  updateTabbedInputWorkflowTabs
} from "./tabbed-input-workflow.js";
import {
  makeAminoAcidNames,
  makeReferenceTopics
} from "./reference-page-data.js";
import { createReferencePageController } from "./reference-page-ui.js";
import { createWorkspaceViewController } from "./workspace-view-ui.js";
import { createWorkspaceInputSourceController } from "./workspace-input-source-ui.js";
import {
  getResultWorkspaceFeatureLayerDrafts,
  getResultWorkspaceSequenceDrafts,
  getResultWorkspaceSequenceLayerGroups,
  getWorkflowWorkspaceFeatureLayerDrafts,
  getWorkflowWorkspaceSequenceDrafts,
  getWorkflowWorkspaceSequenceLayerGroups
} from "./workspace-promotion.js";
import {
  listWorkspaceFeatureLayers,
  listWorkspaceSequences,
  saveWorkspaceFeatureLayer,
  saveWorkspaceSequence
} from "./workspace-storage.js";
import {
  buildOutputDescriptionText,
  sha256Hex
} from "./output-description.js";
import { renderCircularDnaViewer } from "./dna-circular-viewer-canvas.js";
import { renderDnaViewer } from "./dna-viewer-canvas.js";
import { renderProteinViewer } from "./protein-viewer-canvas.js";
import { renderGenomeFigure } from "./genome-figure-svg.js";
import { renderProteinStructureViewer } from "./protein-structure-viewer.js";
import { renderSangerTraceViewer } from "./sanger-trace-viewer.js";
import { createSangerTraceWorkspaceController } from "./sanger-trace-workspace-ui.js";
import { downloadBlob, downloadText } from "./file-download.js";
import { readToolInputFileText } from "./input-file-readers.js";
import { downloadSvgAsPng, getPngFilename, serializeSvgElement } from "./svg-export.js";
import {
  alignTsv,
  getBaseMimeType,
  isDelimitedDownload,
  tableRowsToCsv,
  tableRowsToTsv
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
import {
  chooseSuggestedColumnForOption,
  getTableColumnSuggestionsFromTexts,
  optionCurrentValueMatchesSuggestion
} from "./table-column-suggestions.js";
import {
  summarizeSamReferencesFromText,
  summarizeVcfFromText
} from "./indexed-input-summaries.js";
import { createIndexedInputPanelsController } from "./indexed-input-panels-ui.js";
import { createAppLayoutController } from "./app-layout-ui.js";
import { createOutputShellController } from "./output-shell-ui.js";
import { createToolInputShellController } from "./tool-input-shell-ui.js";
import { createToolOptionsController } from "./tool-options-ui.js";
import { createWorkflowBuilderController } from "./workflow-builder-ui.js";
import {
  formatPcrPrimerDesignSummary,
  PCR_PRIMER_CONSTRAINT_DETAIL_IDS,
  PCR_PRIMER_DESIGN_PRESETS
} from "./pcr-primer-design-options-model.js";
import {
  loadMarkdownNotebookDraft,
  markdownFilenameFromLoadedFile,
  markdownFileStemFromFilename,
  normalizeMarkdownFilename,
  saveMarkdownNotebookDraft
} from "./markdown-notebook-model.js";
import { createMarkdownWorkspaceController } from "./markdown-notebook-workspace-ui.js";
import { parseFlatfileRecords } from "../core/flatfile-records.js";
import { runWorkflow, validateWorkflowDefinition } from "../core/workflow-engine.js";
import { shouldShowPointMarkersForSeries } from "../core/plot-renderer.js";
import { siteConfig } from "./site-config.js";
import { loadWorkflowPresetExample, workflowPresets } from "./workflow-presets.js";
import { summarizeProteinStructure } from "../core/protein-structure.js";
import {
  attachWorkspaceFeatureLayersToFigure,
  attachWorkspaceFeatureLayersToViewer
} from "../core/workspace-layers.js";
import { appVersion } from "../app-version.js";
import { alignmentViewerReferenceExample } from "../examples/alignment-viewer-example.js";

const state = {
  selectedTool: tools[0],
  selectedReference: "iupac-nucleotide",
  selectedGeneticCode: "1",
  selectedGeneticCodeAminoAcid: "all",
  selectedGeneticCodeCodon: "all",
  selectedWorkflow: "orf-codon-usage",
  pendingWorkflowRecipe: "",
  importedWorkflow: null,
  selectedWorkflowStepId: null,
  expandedWorkflowStepIds: new Set(),
  workflowAddStepOpen: false,
  savedWorkflows: [],
  activeSavedWorkflowId: "",
  workflowRun: null,
  workflowRunSummary: null,
  toolRun: null,
  workspaceSequences: [],
  workspaceFeatureLayers: [],
  workspaceStorageStatus: "Loading workspace...",
  showcaseRenderToken: null,
  activeView: "home",
  activeTags: new Set(),
  outputSearch: {
    tool: { matches: [], currentIndex: -1, debounceTimer: null },
    workflow: { matches: [], currentIndex: -1, debounceTimer: null }
  },
  outputTable: {
    tool: { sortColumn: null, sortDirection: "asc", hiddenColumns: new Set(), columnPreset: "all" },
    workflow: { sortColumn: null, sortDirection: "asc", hiddenColumns: new Set(), columnPreset: "all" }
  },
  directInputFile: null,
  currentToolOutputChoices: [],
  currentToolDescription: ""
};

let workflowExampleLoadRequest = 0;

const toolIdAliases = new Map([
  ["protein-stats", "sequence-stats-protein"]
]);

const sortedTools = [...tools].sort((left, right) =>
  left.metadata.name.localeCompare(right.metadata.name)
);
const visibleSortedTools = sortedTools.filter((tool) => tool.metadata.hiddenFromToolList !== true);

const XLSX_EXPORT_ROW_LIMIT = 50000;
const XLSX_EXPORT_CELL_LIMIT = 250000;
const PROTEIN_STRUCTURE_SUGGESTION_CHAR_LIMIT = 1_500_000;
const PCR_PRIMER_DESIGN_TOOL_ID = "pcr-primer-design";
const IN_SILICO_PCR_TOOL_ID = "in-silico-pcr";
const SAM_BAM_SUMMARY_REGION_VIEWER_TOOL_ID = "sam-bam-summary-region-viewer";
const VCF_EXTRACTOR_TOOL_ID = "vcf-genotype-table";
const VCF_FILTER_TOOL_ID = "vcf-filter";
const ALIGNMENT_VIEWER_TOOL_ID = "alignment-viewer";
const FASTA_REGION_EXTRACTOR_TOOL_ID = "indexed-fasta-region-extractor";
const READ_MAPPING_COVERAGE_TOOL_ID = "read-mapping-coverage";
const BIOLOGICAL_RECORD_FORMAT_CONVERTER_TOOL_ID = "biological-record-format-converter";
const ANNOTATED_DNA_RECORD_EXTRACTOR_TOOL_ID = "annotated-dna-record-extractor";
const LINEAR_DNA_SEQUENCE_VIEWER_TOOL_ID = "dna-sequence-viewer";
const CIRCULAR_DNA_SEQUENCE_VIEWER_TOOL_ID = "circular-dna-sequence-viewer";
const GENOME_FIGURE_TOOL_ID = "genome-figure";
const CIRCULAR_GENOME_FIGURE_TOOL_ID = "circular-genome-figure";
const LINEAR_GENOME_FIGURE_TOOL_ID = "linear-genome-figure";
const SEQUENCE_EDITOR_TOOL_ID = "sequence-editor";
const PROTEIN_STRUCTURE_VIEWER_TOOL_ID = "protein-structure-viewer";
const PROTEIN_CONSERVATION_STRUCTURE_VIEWER_TOOL_ID = "protein-conservation-structure-viewer";
const toolWorkerClient = new ToolWorkerClient();

const elements = {
  appShell: document.querySelector(".app-shell"),
  toolNav: document.querySelector(".tool-nav"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  sidebarResize: document.querySelector("#sidebarResize"),
  themeToggle: document.querySelector("#themeToggle"),
  toolSearch: document.querySelector("#toolSearch"),
  toolList: document.querySelector("#toolList"),
  homeView: document.querySelector("#homeView"),
  homeLink: document.querySelector("#homeLink"),
  homeBody: document.querySelector("#homeBody"),
  referenceList: document.querySelector("#referenceList"),
  toolView: document.querySelector("#toolView"),
  referenceView: document.querySelector("#referenceView"),
  feedbackView: document.querySelector("#feedbackView"),
  workspaceView: document.querySelector("#workspaceView"),
  workflowView: document.querySelector("#workflowView"),
  appVersion: document.querySelector("#appVersion"),
  selectedReferenceTitle: document.querySelector("#selectedReferenceTitle"),
  selectedReferenceBody: document.querySelector("#selectedReferenceBody"),
  workflowLink: document.querySelector("#workflowLink"),
  workspaceLink: document.querySelector("#workspaceLink"),
  feedbackLink: document.querySelector("#feedbackLink"),
  workspaceBody: document.querySelector("#workspaceBody"),
  feedbackTemplates: document.querySelector("#feedbackTemplates"),
  workflowRecipeTab: document.querySelector("#workflowRecipeTab"),
  workflowSavedTab: document.querySelector("#workflowSavedTab"),
  workflowRecipePanel: document.querySelector("#workflowRecipePanel"),
  workflowSavedPanel: document.querySelector("#workflowSavedPanel"),
  workflowPreset: document.querySelector("#workflowPreset"),
  workflowLoadRecipe: document.querySelector("#workflowLoadRecipe"),
  workflowInputTitle: document.querySelector("#workflowInputTitle"),
  workflowInputActions: document.querySelector("#workflowInputActions"),
  workflowInputNote: document.querySelector("#workflowInputNote"),
  workflowLoadExample: document.querySelector("#workflowLoadExample"),
  workflowClearInput: document.querySelector("#workflowClearInput"),
  workflowInput: document.querySelector("#workflowInput"),
  workflowSummary: document.querySelector("#workflowSummary"),
  workflowSaveName: document.querySelector("#workflowSaveName"),
  workflowSaveCurrent: document.querySelector("#workflowSaveCurrent"),
  workflowSavedSelect: document.querySelector("#workflowSavedSelect"),
  workflowLoadSaved: document.querySelector("#workflowLoadSaved"),
  workflowDeleteSaved: document.querySelector("#workflowDeleteSaved"),
  workflowSavedStatus: document.querySelector("#workflowSavedStatus"),
  runWorkflow: document.querySelector("#runWorkflow"),
  cancelWorkflow: document.querySelector("#cancelWorkflow"),
  workflowJsonPanel: document.querySelector("#workflowJsonPanel"),
  workflowExportJson: document.querySelector("#workflowExportJson"),
  workflowImportJson: document.querySelector("#workflowImportJson"),
  workflowValidateJson: document.querySelector("#workflowValidateJson"),
  workflowJson: document.querySelector("#workflowJson"),
  workflowAddStepType: document.querySelector("#workflowAddStepType"),
  workflowAddToolRow: document.querySelector("#workflowAddToolRow"),
  workflowAddTool: document.querySelector("#workflowAddTool"),
  workflowAddStreamRow: document.querySelector("#workflowAddStreamRow"),
  workflowAddStream: document.querySelector("#workflowAddStream"),
  workflowAddFilterFieldRow: document.querySelector("#workflowAddFilterFieldRow"),
  workflowAddFilterField: document.querySelector("#workflowAddFilterField"),
  workflowAddFilterOperatorRow: document.querySelector("#workflowAddFilterOperatorRow"),
  workflowAddFilterOperator: document.querySelector("#workflowAddFilterOperator"),
  workflowAddFilterValueRow: document.querySelector("#workflowAddFilterValueRow"),
  workflowAddFilterValue: document.querySelector("#workflowAddFilterValue"),
  workflowAddSortFieldRow: document.querySelector("#workflowAddSortFieldRow"),
  workflowAddSortField: document.querySelector("#workflowAddSortField"),
  workflowAddSortDirectionRow: document.querySelector("#workflowAddSortDirectionRow"),
  workflowAddSortDirection: document.querySelector("#workflowAddSortDirection"),
  workflowAddTakeCountRow: document.querySelector("#workflowAddTakeCountRow"),
  workflowAddTakeCount: document.querySelector("#workflowAddTakeCount"),
  workflowAddGatherRow: document.querySelector("#workflowAddGatherRow"),
  workflowAddGatherAs: document.querySelector("#workflowAddGatherAs"),
  workflowOpenAddStep: document.querySelector("#workflowOpenAddStep"),
  workflowAddStepDraft: document.querySelector("#workflowAddStepDraft"),
  workflowCancelAddStep: document.querySelector("#workflowCancelAddStep"),
  workflowAppendStep: document.querySelector("#workflowAppendStep"),
  workflowBuilderGuidance: document.querySelector("#workflowBuilderGuidance"),
  workflowMessages: document.querySelector("#workflowMessages"),
  workflowStepInspector: document.querySelector("#workflowStepInspector"),
  workflowOutputSummary: document.querySelector("#workflowOutputSummary"),
  workflowOutput: document.querySelector("#workflowOutput"),
  workflowOutputSearch: document.querySelector("#workflowOutputSearch"),
  workflowOutputSearchPrevious: document.querySelector("#workflowOutputSearchPrevious"),
  workflowOutputSearchNext: document.querySelector("#workflowOutputSearchNext"),
  workflowOutputSearchCount: document.querySelector("#workflowOutputSearchCount"),
  workflowOutputSearchRow: document.querySelector("#workflowOutputSearchRow"),
  workflowOutputHighlight: document.querySelector("#workflowOutputHighlight"),
  workflowOutputViewTabs: document.querySelector("#workflowOutputViewTabs"),
  workflowOutputViewNote: document.querySelector("#workflowOutputViewNote"),
  workflowOutputActions: document.querySelector("#workflowOutputActions"),
  workflowTableOutput: document.querySelector("#workflowTableOutput"),
  workflowVisualOutput: document.querySelector("#workflowVisualOutput"),
  workflowDownloadOutput: document.querySelector("#workflowDownloadOutput"),
  workflowCopyOutput: document.querySelector("#workflowCopyOutput"),
  toolCategory: document.querySelector("#toolCategory"),
  toolTitle: document.querySelector("#toolTitle"),
  toolFeedbackLink: document.querySelector("#toolFeedbackLink"),
  toolTags: document.querySelector("#toolTags"),
  toolSummary: document.querySelector("#toolSummary"),
  toolOptions: document.querySelector("#toolOptions"),
  restoreDefaults: document.querySelector("#restoreDefaults"),
  editorGrid: document.querySelector(".editor-grid"),
  editorResize: document.querySelector("#editorResize"),
  inputPanel: document.querySelector(".input-panel"),
  optionsPanel: document.querySelector(".options-panel"),
  markdownWorkspace: document.querySelector("#markdownWorkspace"),
  resultPanel: document.querySelector(".result-panel"),
  sequenceInput: document.querySelector("#sequenceInput"),
  markdownInputTools: document.querySelector("#markdownInputTools"),
  markdownInputFileName: document.querySelector("#markdownInputFileName"),
  markdownSaveDraft: document.querySelector("#markdownSaveDraft"),
  markdownLoadDraft: document.querySelector("#markdownLoadDraft"),
  markdownCopyInput: document.querySelector("#markdownCopyInput"),
  markdownDownloadInput: document.querySelector("#markdownDownloadInput"),
  markdownInputStatus: document.querySelector("#markdownInputStatus"),
  splitInputPanel: document.querySelector("#splitInputPanel"),
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  dropZoneLabel: document.querySelector("#dropZoneLabel"),
  inputFileStatus: document.querySelector("#inputFileStatus"),
  loadExample: document.querySelector("#loadExample"),
  clearInput: document.querySelector("#clearInput"),
  runTool: document.querySelector("#runTool"),
  cancelTool: document.querySelector("#cancelTool"),
  copyOutput: document.querySelector("#copyOutput"),
  downloadOutput: document.querySelector("#downloadOutput"),
  downloadPngOutput: document.querySelector("#downloadPngOutput"),
  outputSearch: document.querySelector("#outputSearch"),
  outputSearchPrevious: document.querySelector("#outputSearchPrevious"),
  outputSearchNext: document.querySelector("#outputSearchNext"),
  outputSearchCount: document.querySelector("#outputSearchCount"),
  outputSearchRow: document.querySelector("#outputSearchRow"),
  toolOutputHighlight: document.querySelector("#toolOutputHighlight"),
  outputViewTabs: document.querySelector("#outputViewTabs"),
  outputFormatSelect: document.querySelector("#outputFormatSelect"),
  toolOutputActions: document.querySelector("#toolOutputActions"),
  messages: document.querySelector("#messages"),
  visualOutput: document.querySelector("#visualOutput"),
  toolOutput: document.querySelector("#toolOutput"),
  toolOutputEmpty: document.querySelector("#toolOutputEmpty"),
  toolTableOutput: document.querySelector("#toolTableOutput")
};

const sangerTraceWorkspace = createSangerTraceWorkspaceController({
  panel: elements.splitInputPanel,
  toolOptions: elements.toolOptions,
  getSelectedTool: () => state.selectedTool,
  splitInputExampleParts,
  formatExampleInputForDisplay,
  readToolInputFileText,
  addMessage,
  updateInputActionButtons,
  clearToolOutput
});

const workspaceInputSources = createWorkspaceInputSourceController({
  elements,
  tools,
  sortedTools,
  getSelectedTool: () => state.selectedTool,
  getWorkspaceSequences: () => state.workspaceSequences,
  getWorkspaceFeatureLayers: () => state.workspaceFeatureLayers,
  toolRequiresInput,
  isTabbedInputWorkflowTool,
  selectTool,
  applyWorkspaceSequenceToToolInput,
  clearToolOutput,
  clearWorkflowOutput
});

const workspaceView = createWorkspaceViewController({
  body: elements.workspaceBody,
  getSequences: () => state.workspaceSequences,
  getFeatureLayers: () => state.workspaceFeatureLayers,
  setStorageStatus: (message) => {
    state.workspaceStorageStatus = message;
  },
  getCompatibleTools: workspaceInputSources.getCompatibleTools,
  openSequenceInTool: workspaceInputSources.openSequenceInTool,
  refresh: refreshWorkspaceSequences,
  pluralize
});

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

function isMarkdownNotebookSelected() {
  return state.selectedTool?.metadata?.id === "markdown-notebook";
}

function setHiddenMarkdownOption(id, value) {
  const control = elements.toolOptions.querySelector(`#${id}`);
  if (!control) {
    return;
  }
  if (control.type === "checkbox") {
    control.checked = Boolean(value);
  } else {
    control.value = value ?? "";
  }
}

function getMarkdownWorkspaceControl(name) {
  return markdownWorkspace.getControl(name);
}

function setMarkdownWorkspaceStatus(message) {
  markdownWorkspace.setStatus(message);
}

function readMarkdownWorkspaceState() {
  return markdownWorkspace.readState();
}

function syncHiddenMarkdownOptionsFromWorkspace() {
  const markdownState = readMarkdownWorkspaceState();
  if (!markdownState) {
    return;
  }
  setHiddenMarkdownOption("title", markdownState.title);
  setHiddenMarkdownOption("date", markdownState.date);
  setHiddenMarkdownOption("fileName", markdownFileStemFromFilename(markdownState.fileName));
  setHiddenMarkdownOption("includeFrontMatter", markdownState.includeFrontMatter);
}

function getMarkdownWorkspaceOptions() {
  return markdownWorkspace.getOptions();
}

function syncMarkdownInputFilenameFromOptions() {
  markdownWorkspace.syncInputFilenameFromOptions();
}

function syncMarkdownNotebookDefaults() {
  if (!isMarkdownNotebookSelected() || !elements.markdownInputFileName) {
    return;
  }
  markdownWorkspace.syncNotebookDefaults();
}

function setMarkdownInputStatus(message) {
  if (elements.markdownInputStatus) {
    elements.markdownInputStatus.textContent = message;
  }
}

function updateMarkdownInputUi() {
  if (!isMarkdownNotebookSelected()) {
    return;
  }
  syncMarkdownNotebookDefaults();
  syncMarkdownInputFilenameFromOptions();
  if (!elements.markdownInputTools || elements.markdownInputTools.hidden) {
    return;
  }
  elements.markdownSaveDraft.hidden = true;
  elements.markdownCopyInput.hidden = true;
  elements.markdownDownloadInput.hidden = true;
  elements.markdownLoadDraft.textContent = "Use saved draft";
  const hasSource = Boolean(elements.sequenceInput.value.trim());
  setMarkdownInputStatus(
    hasSource
      ? "Markdown source is ready. Click Run to start editing. Saved drafts stay on this computer in this browser profile; SMS3 does not upload or sync them."
      : "Choose a Markdown file, start a blank note, or load a saved draft. Click Run to start editing. Download .md from the editor when you want a regular file."
  );
}

function getMarkdownInputFilename() {
  return markdownWorkspace.getInputFilename();
}

function syncMarkdownWorkspaceFromSource(message = "Loaded Markdown source.") {
  if (!isMarkdownNotebookSelected()) {
    return;
  }
  markdownWorkspace.syncFromSource(message);
}

function renderMarkdownWorkspace(previousState = null) {
  markdownWorkspace.render(previousState);
}

const markdownWorkspace = createMarkdownWorkspaceController({
  container: elements.markdownWorkspace,
  sourceInput: elements.sequenceInput,
  toolOptions: elements.toolOptions,
  markdownInputFileName: elements.markdownInputFileName,
  createField: createMarkdownWorkspaceField,
  createButton: createMarkdownWorkspaceButton,
  readToolInputFileText,
  downloadText,
  getFallbackOptions: getOptions,
  getFileNameDefaultValue: () => flattenOptions(state.selectedTool?.metadata?.options ?? [])
    .find((option) => option.id === "fileName")?.defaultValue,
  syncHiddenOptions: syncHiddenMarkdownOptionsFromWorkspace
});

const toolOptionsUi = createToolOptionsController({
  elements,
  state,
  callbacks: {
    addMessage,
    clearToolOutput,
    updateToolOptionSuggestions
  }
});

const workflowBuilder = createWorkflowBuilderController({
  elements,
  state,
  tools,
  workflowPresets,
  toolIdAliases,
  workspaceInputSources,
  helpers: {
    appendRuleListControl: toolOptionsUi.appendRuleListControl,
    appendValueListControl: toolOptionsUi.appendValueListControl,
    createOptionLabelContent: toolOptionsUi.createOptionLabelContent,
    flattenOptions: toolOptionsUi.flattenOptions,
    normalizeDependentOptionValues: toolOptionsUi.normalizeDependentOptionValues,
    populateDependentSelect: toolOptionsUi.populateDependentSelect,
    visibleWhenMatches: toolOptionsUi.visibleWhenMatches
  },
  callbacks: {
    addWorkflowMessage,
    clearWorkflowOutput,
    parseWorkflowJson,
    updateInputActionButtons
  }
});

const toolInputShell = createToolInputShellController({
  elements,
  state,
  workspaceInputSources,
  sangerTraceWorkspace,
  helpers: {
    appendToolOptionControl: toolOptionsUi.appendToolOptionControl,
    flattenOptions,
    getDefaultOptionValues: toolOptionsUi.getDefaultOptionValues,
    serializeRuleListControl,
    serializeValueListControl
  },
  callbacks: {
    clearToolOutput,
    isAlignmentViewerTool,
    isFastaSourceTabbedTool,
    isFastaRegionExtractorTool,
    isMarkdownNotebookSelected,
    isProteinConservationStructureViewerTool,
    isProteinStructureViewerTool,
    isSamBamSummaryRegionViewerTool,
    isSangerTraceViewerTool,
    isTabbedInputWorkflowTool,
    isVcfTabbedInputTool,
    renderSplitInputPanel,
    resetToolOutputViewer,
    setFastaRegionSourceMode,
    syncMarkdownWorkspaceFromSource,
    updateFastaSourceInputUi,
    updateFastaRegionExtractorSourceUi,
    updateAlignmentViewerInputUi,
    updateMarkdownInputUi,
    updateProteinStructureViewerUi,
    updateSamBamInputModeUi,
    updateToolOptionSuggestions,
    updateVcfInputModeUi
  }
});

const appLayout = createAppLayoutController({ elements });

const feedbackTemplates = [
  {
    id: "tool-request",
    title: "Tool request",
    summary: "Suggest a new tool, workflow, option, example, or output format.",
    subject: "SMS3 tool request",
    body: `Tool or workflow requested:

What input should it accept?

What output should it produce?

Example sequence or use case:
`
  },
  {
    id: "bug-report",
    title: "Bug report",
    summary: "Report incorrect output, confusing warnings, browser problems, or broken examples.",
    subject: "SMS3 bug report",
    body: `Tool:

What happened?

What did you expect?

Input, options, and browser:
`
  },
  {
    id: "teaching-feedback",
    title: "Teaching feedback",
    summary: "Share tutorial, classroom, documentation, or direct-link needs.",
    subject: "SMS3 teaching feedback",
    body: `Course or tutorial context:

Tools used:

What would make SMS3 easier to teach with?
`
  },
  {
    id: "general",
    title: "General feedback",
    summary: "Send any other SMS3 note.",
    subject: "SMS3 feedback",
    body: `Feedback:
`
  }
];

const referenceTopics = makeReferenceTopics(visibleSortedTools);
const aminoAcidNames = makeAminoAcidNames(referenceTopics);
const referencePage = createReferencePageController({
  aminoAcidNames,
  elements,
  flattenOptions,
  getDefaultOptionValues,
  referenceTopics,
  renderCircularDnaViewer,
  renderDnaViewer,
  renderGenomeFigure,
  renderProteinStructureViewer,
  renderProteinViewer,
  runTool: runAppTool,
  selectTool,
  state,
  tools
});
function renderToolList() {
  const query = elements.toolSearch.value.trim().toLowerCase();
  elements.toolList.textContent = "";
  const visibleTools = [];

  for (const tool of visibleSortedTools) {
    const searchable = [
      tool.metadata.name,
      tool.metadata.category,
      tool.metadata.summary,
      tool.metadata.inputType,
      tool.metadata.outputType,
      ...tool.metadata.tags
    ]
      .join(" ")
      .toLowerCase();

    if (query && !searchable.includes(query)) {
      continue;
    }

    if (
      state.activeTags.size > 0 &&
      !Array.from(state.activeTags).every((tag) => tool.metadata.tags.includes(tag))
    ) {
      continue;
    }

    visibleTools.push(tool);
  }

  const byCategory = new Map();
  for (const tool of visibleTools) {
    const category = tool.metadata.category || "Other Tools";
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category).push(tool);
  }

  for (const [category, toolsInCategory] of [...byCategory.entries()].sort((left, right) => compareToolCategories(left[0], right[0]))) {
    const section = document.createElement("section");
    section.className = "tool-category-group";
    const heading = document.createElement("h3");
    heading.className = "tool-category-heading";
    heading.textContent = category;
    section.append(heading);
    const group = document.createElement("div");
    group.className = "tool-category-items";
    for (const tool of toolsInCategory) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        tool === state.selectedTool && state.activeView === "tool" ? "tool-link active" : "tool-link";
      button.textContent = tool.metadata.name;
      button.dataset.toolId = tool.metadata.id;
      button.addEventListener("click", () => {
        selectTool(tool);
      });
      group.append(button);
    }
    section.append(group);
    elements.toolList.append(section);
  }
}

function renderReferenceList() {
  elements.referenceList.textContent = "";

  for (const topic of referenceTopics) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      topic.id === state.selectedReference && state.activeView === "reference"
        ? "reference-link active"
        : "reference-link";
    button.textContent = topic.label;
    button.addEventListener("click", () => {
      selectReference(topic.id);
    });
    elements.referenceList.append(button);
  }
}

function appendHomeSection(parent, title, child) {
  const section = document.createElement("section");
  section.className = "home-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading, child);
  parent.append(section);
}

function makeHomeLink(href, label, description) {
  const link = document.createElement("a");
  link.href = href;
  link.className = "home-link";
  const title = document.createElement("strong");
  title.textContent = label;
  const span = document.createElement("span");
  span.textContent = description;
  link.append(title, span);
  return link;
}

function renderHomeView() {
  elements.homeBody.textContent = "";

  const summary = document.createElement("p");
  summary.className = "summary home-summary";
  summary.textContent = `SMS3 is a browser toolkit for sequence manipulation, analysis, visualization, and reference-data tasks. It includes ${visibleSortedTools.length.toLocaleString()} registered tools for DNA/RNA, protein, table, plot, and figure work.`;

  const note = document.createElement("p");
  note.className = "home-note";
  note.textContent = "Start with the showcase to see representative outputs, then open a specific tool from the sidebar when you are ready to run your own data. Inputs and results stay in this browser unless you copy, download, or intentionally send feedback.";

  const main = document.createElement("div");
  main.className = "home-main";

  const showcaseAction = document.createElement("div");
  showcaseAction.className = "home-links home-links-single";
  showcaseAction.append(
    makeHomeLink("#reference=sms3-showcase", "View the SMS3 showcase", "Scan example outputs from tools, plots, viewers, and figures.")
  );

  const referenceAction = document.createElement("div");
  referenceAction.className = "home-links home-links-single";
  referenceAction.append(
    makeHomeLink("#reference=citation-guidance", "How to cite SMS", "Copy recommended citation text in common journal formats.")
  );

  appendHomeSection(main, "Explore example outputs", showcaseAction);
  appendHomeSection(main, "Reference", referenceAction);

  elements.homeBody.append(summary, note, main);
}

function renderActiveView() {
  elements.homeView.hidden = state.activeView !== "home";
  elements.toolView.hidden = state.activeView !== "tool";
  elements.referenceView.hidden = state.activeView !== "reference";
  elements.feedbackView.hidden = state.activeView !== "feedback";
  elements.workspaceView.hidden = state.activeView !== "workspace";
  elements.workflowView.hidden = state.activeView !== "workflow";
  elements.homeLink.classList.toggle("active", state.activeView === "home");
  elements.feedbackLink.classList.toggle("active", state.activeView === "feedback");
  elements.workspaceLink.classList.toggle("active", state.activeView === "workspace");
  elements.workflowLink.classList.toggle("active", state.activeView === "workflow");
}

function scrollWorkspaceToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function scrollActiveToolIntoSidebarView() {
  const scroller = elements.toolList.closest(".tool-nav-scroll");
  const activeTool = elements.toolList.querySelector("button.tool-link.active");
  if (!scroller || !activeTool) {
    return;
  }
  window.requestAnimationFrame(() => {
    const scrollerRect = scroller.getBoundingClientRect();
    const activeRect = activeTool.getBoundingClientRect();
    const targetOffset =
      activeRect.top -
      scrollerRect.top -
      (scroller.clientHeight - activeTool.offsetHeight) / 2;
    scroller.scrollTop += targetOffset;
  });
}

function selectHome({ updateHash = true } = {}) {
  state.activeView = "home";
  scrollWorkspaceToTop();
  renderActiveView();
  renderHomeView();
  renderToolList();
  renderReferenceList();

  if (updateHash && window.location.hash) {
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

function selectTool(tool, { updateHash = true, revealInToolList = false } = {}) {
  state.selectedTool = tool;
  state.activeView = "tool";
  scrollWorkspaceToTop();
  renderActiveView();
  renderSelectedTool();
  renderToolList();
  if (revealInToolList) {
    scrollActiveToolIntoSidebarView();
  }
  renderReferenceList();
  clearToolInputOutput();
  loadSelectedToolExample();

  if (updateHash) {
    setRouteHash("tool", tool.metadata.id);
  }
}

function selectReference(referenceId, { updateHash = true } = {}) {
  state.selectedReference = referenceId;
  state.activeView = "reference";
  scrollWorkspaceToTop();
  renderActiveView();
  renderReferenceList();
  renderToolList();
  renderSelectedReference();

  if (updateHash) {
    setRouteHash("reference", referenceId);
  }
}

function selectFeedback({ updateHash = true } = {}) {
  state.activeView = "feedback";
  scrollWorkspaceToTop();
  renderActiveView();
  renderToolList();
  renderReferenceList();
  renderFeedbackTemplates();

  if (updateHash) {
    setRouteHash("feedback", "general");
  }
}

function selectWorkflow(workflowId = state.selectedWorkflow, { updateHash = true } = {}) {
  const preset = workflowPresets.find((item) => item.id === workflowId) ?? workflowPresets[0];
  state.selectedWorkflow = preset.id;
  state.pendingWorkflowRecipe = "";
  state.selectedWorkflowStepId = null;
  state.expandedWorkflowStepIds = new Set();
  state.activeView = "workflow";
  scrollWorkspaceToTop();
  renderActiveView();
  renderToolList();
  renderReferenceList();
  renderWorkflowView();
  loadWorkflowExample();

  if (updateHash) {
    setRouteHash("workflow", preset.id);
  }
}

function selectWorkspace({ updateHash = true } = {}) {
  state.activeView = "workspace";
  scrollWorkspaceToTop();
  renderActiveView();
  renderToolList();
  renderReferenceList();
  renderWorkspaceView();

  if (updateHash) {
    setRouteHash("workspace", "sequences");
  }
}

function setRouteHash(key, value) {
  const hash = `#${key}=${encodeURIComponent(value)}`;
  if (window.location.hash !== hash) {
    window.history.pushState(null, "", hash);
  }
}

function applyRouteFromHash() {
  const rawHash = window.location.hash.slice(1);
  if (!rawHash) {
    selectHome({ updateHash: false });
    return true;
  }

  const params = new URLSearchParams(rawHash);
  const toolId = params.get("tool") || (rawHash.includes("=") ? "" : rawHash);
  const referenceId = params.get("reference");
  const workflowId = params.get("workflow");
  const workspaceId = params.get("workspace");

  if (toolId) {
    const resolvedToolId = toolIdAliases.get(toolId) ?? toolId;
    const tool = sortedTools.find((item) => item.metadata.id === resolvedToolId);
    if (tool) {
      selectTool(tool, { updateHash: false, revealInToolList: true });
      return true;
    }
  }

  if (referenceId && referenceTopics.some((topic) => topic.id === referenceId)) {
    selectReference(referenceId, { updateHash: false });
    return true;
  }

  if (params.has("feedback")) {
    selectFeedback({ updateHash: false });
    return true;
  }

  if (workflowId || params.has("workflow")) {
    selectWorkflow(workflowId || state.selectedWorkflow, { updateHash: false });
    return true;
  }

  if (workspaceId || params.has("workspace")) {
    selectWorkspace({ updateHash: false });
    return true;
  }

  return false;
}

async function refreshWorkspaceSequences() {
  try {
    const [sequences, featureLayers] = await Promise.all([
      listWorkspaceSequences(),
      listWorkspaceFeatureLayers()
    ]);
    state.workspaceSequences = sequences;
    state.workspaceFeatureLayers = featureLayers;
    state.workspaceStorageStatus = "";
  } catch (error) {
    state.workspaceSequences = [];
    state.workspaceFeatureLayers = [];
    state.workspaceStorageStatus = error?.message || "Workspace storage is unavailable.";
  }
  renderWorkspaceView();
  workspaceInputSources.renderToolSource();
  if (state.activeView === "workflow") {
    renderWorkflowView();
  }
}

function renderWorkspaceView() {
  workspaceView.render();
}

function renderSelectedTool() {
  const { metadata } = state.selectedTool;
  const isMarkdownNotebook = metadata.id === "markdown-notebook";
  const isStandaloneWorkspace = isMarkdownNotebook;
  const markdownWorkspaceState = isMarkdownNotebook ? readMarkdownWorkspaceState() : null;
  elements.toolCategory.textContent = metadata.category;
  elements.toolTitle.textContent = metadata.name;
  elements.toolFeedbackLink.href = makeToolFeedbackLink(metadata);
  elements.toolFeedbackLink.setAttribute("aria-label", `Send feedback about ${metadata.name}`);
  elements.toolSummary.textContent = metadata.summary;
  elements.runTool.textContent = getRunButtonLabel(state.selectedTool);
  elements.toolTags.textContent = "";
  const inputRequired = toolRequiresInput(state.selectedTool);
  elements.editorGrid.hidden = isStandaloneWorkspace;
  elements.resultPanel.hidden = isStandaloneWorkspace;
  elements.markdownWorkspace.hidden = !isStandaloneWorkspace;
  if (!isStandaloneWorkspace) {
    elements.markdownWorkspace.textContent = "";
  }
  elements.inputPanel.hidden = !inputRequired;
  elements.editorGrid.classList.toggle("no-input", !inputRequired);
  elements.editorGrid.classList.toggle(
    "wide-options",
    metadata.layout?.options === "wide" || metadata.optionsLayout === "wide"
  );
  elements.optionsPanel.classList.toggle("pcr-primer-design-options", metadata.id === PCR_PRIMER_DESIGN_TOOL_ID);
  renderSplitInputPanel(state.selectedTool);
  updateInputFileUi(state.selectedTool);
  renderToolOptions(metadata.options ?? []);
  renderInputPlacementOptions(state.selectedTool);
  wireDependentToolOptions(metadata.options ?? []);
  updateSamBamInputModeUi();
  updateVcfInputModeUi();
  updateAlignmentViewerInputUi();
  updateFastaSourceInputUi();
  updateFastaRegionExtractorSourceUi();
  updateBiologicalRecordFormatConverterInputUi();
  updateProteinStructureViewerUi();
  sangerTraceWorkspace.update();
  updatePcrPrimerDesignUi();
  updateMarkdownInputUi();
  if (isMarkdownNotebook) {
    renderMarkdownWorkspace(markdownWorkspaceState);
  }
  workspaceInputSources.renderToolSource();

  for (const tag of metadata.tags) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = state.activeTags.has(tag) ? "tag-chip active" : "tag-chip";
    item.setAttribute("aria-pressed", String(state.activeTags.has(tag)));
    item.textContent = tag;
    item.addEventListener("click", () => {
      if (state.activeTags.has(tag)) {
        state.activeTags.delete(tag);
      } else {
        state.activeTags.add(tag);
      }
      renderSelectedTool();
      renderToolList();
    });
    elements.toolTags.append(item);
  }
  updateInputActionButtons();
}

function getRunButtonLabel(...args) {
  return toolInputShell.getRunButtonLabel(...args);
}

function toolRequiresInput(...args) {
  return toolInputShell.toolRequiresInput(...args);
}

function getToolInputFileUi(...args) {
  return toolInputShell.getToolInputFileUi(...args);
}

function getDirectInputFileOptionId(...args) {
  return toolInputShell.getDirectInputFileOptionId(...args);
}

function getCurrentDirectInputFile(...args) {
  return toolInputShell.getCurrentDirectInputFile(...args);
}

function clearDirectInputFile(...args) {
  return toolInputShell.clearDirectInputFile(...args);
}

function setDirectInputFile(...args) {
  return toolInputShell.setDirectInputFile(...args);
}

function updateDirectInputFileStatus(...args) {
  return toolInputShell.updateDirectInputFileStatus(...args);
}

function updateInputFileUi(...args) {
  return toolInputShell.updateInputFileUi(...args);
}

function renderInputPlacementOptions(...args) {
  return toolInputShell.renderInputPlacementOptions(...args);
}

function renderSplitInputPanel(tool) {
  const splitInput = tool?.metadata?.splitInput;
  elements.splitInputPanel.textContent = "";
  elements.splitInputPanel.classList.remove("sanger-trace-workspace");
  elements.splitInputPanel.hidden = !splitInput;
  if (!splitInput) {
    return;
  }
  if (isSangerTraceViewerTool(tool)) {
    sangerTraceWorkspace.render(tool);
    return;
  }
  if (isAlignmentViewerTool(tool)) {
    renderAlignmentViewerTabbedInput(tool);
    return;
  }
  if (isBiologicalRecordTabbedInputTool(tool)) {
    renderBiologicalRecordTabbedInput(tool);
    return;
  }
  if (isReadMappingCoverageTool(tool)) {
    renderReadMappingCoverageInput(tool);
    return;
  }
  if (isInSilicoPcrTool(tool)) {
    renderInSilicoPcrInput(tool);
    return;
  }
  const exampleParts = splitInputExampleParts(tool);
  const makePanel = (index) => {
    const definedPanel = (splitInput.panels ?? [])[index];
    const repeatPanel = splitInput.additionalPanelTemplate ?? splitInput.repeatPanel;
    if (!definedPanel && repeatPanel) {
      const parsedRepeatFromIndex = Number.parseInt(splitInput.repeatFromIndex, 10);
      const repeatFromIndex = Number.isFinite(parsedRepeatFromIndex)
        ? parsedRepeatFromIndex
        : (splitInput.panels ?? []).length;
      const repeatNumber = Math.max(1, index - repeatFromIndex + 1);
      const labelBase = repeatPanel.label ?? "Input";
      return {
        ...repeatPanel,
        id: `${repeatPanel.idPrefix ?? repeatPanel.id ?? "input"}-${repeatNumber}`,
        label: repeatPanel.numberedLabel === false ? labelBase : `${labelBase} ${repeatNumber}`
      };
    }
    const listLabel = `List ${String.fromCharCode(65 + index)}`;
    return definedPanel ?? {
      id: `input-${index + 1}`,
      label: listLabel,
      dropLabel: `Drop ${listLabel} plain-text, CSV, or TSV items here`,
      accept: (splitInput.panels ?? [])[0]?.accept ?? ".txt,.csv,.tsv,.tab"
    };
  };
  const appendSection = (index, panel) => {
    const section = document.createElement("section");
    section.className = "split-input-section";
    const heading = document.createElement("div");
    heading.className = "split-input-heading";
    const title = document.createElement("h4");
    title.textContent = panel.label ?? `Input ${index + 1}`;
    const fileLabel = document.createElement("label");
    fileLabel.className = "file-button";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = panel.accept ?? ".txt,.csv,.tsv,.tab";
    fileInput.multiple = Boolean(panel.multipleFiles);
    const fileText = document.createElement("span");
    fileText.textContent = panel.multipleFiles ? "Choose files" : "Choose file";
    fileLabel.append(fileInput, fileText);
    heading.append(title, fileLabel);
    const description = document.createElement("p");
    description.className = "split-input-description";
    description.textContent = panel.description ?? "";
    description.hidden = !panel.description;
    const dropZone = document.createElement("div");
    dropZone.className = "drop-zone split-drop-zone";
    dropZone.textContent = panel.dropLabel ?? `Drop ${title.textContent} input here`;
    const textarea = document.createElement("textarea");
    textarea.className = "split-input-textarea";
    textarea.dataset.splitInputIndex = String(index);
    textarea.spellcheck = false;
    textarea.wrap = "off";
    textarea.value = formatExampleInputForDisplay(exampleParts[index] ?? "");
    if (panel.placeholder) {
      textarea.placeholder = panel.placeholder;
    }
    const loadFiles = async (fileList) => {
      const files = Array.from(fileList ?? []).filter(Boolean);
      if (files.length === 0) {
        return;
      }
      if (!panel.multipleFiles && files.length > 1) {
        files.splice(1);
      }
      const oversized = files.find((file) => file.size > 25 * 1024 * 1024);
      if (oversized) {
        addMessage(`${oversized.name}: file is larger than 25 MB.`, "warning");
        return;
      }
      const texts = [];
      for (const file of files) {
        texts.push(await readToolInputFileText(file, { onMessage: addMessage }));
      }
      textarea.value = texts.join("\n");
      clearToolOutput();
      updateInputActionButtons();
      updateToolOptionSuggestions();
      updateProteinStructureViewerUi();
      addMessage(files.length === 1
        ? `Loaded ${files[0].name} (${files[0].size.toLocaleString()} bytes).`
        : `Loaded ${files.length.toLocaleString()} files into ${panel.label ?? "input"}.`);
    };
    fileInput.addEventListener("change", async () => {
      await loadFiles(fileInput.files);
      fileInput.value = "";
    });
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", async (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
      await loadFiles(event.dataTransfer.files);
    });
    textarea.addEventListener("input", () => {
      updateInputActionButtons();
      updateToolOptionSuggestions();
      updateProteinStructureViewerUi();
    });
    section.append(heading, description, dropZone, textarea);
    elements.splitInputPanel.append(section);
  };
  const sectionCount = Math.max((splitInput.panels ?? []).length, exampleParts.length);
  const canonicalIndexes = Array.from({ length: sectionCount }, (_, index) => index);
  const displayIndexes = Array.isArray(splitInput.displayOrder)
    ? [
        ...splitInput.displayOrder
          .map((panelId) => (splitInput.panels ?? []).findIndex((panel) => panel.id === panelId))
          .filter((index, position, indexes) => index >= 0 && index < sectionCount && indexes.indexOf(index) === position),
        ...canonicalIndexes.filter((index) => !splitInput.displayOrder.includes((splitInput.panels ?? [])[index]?.id))
      ]
    : canonicalIndexes;
  for (const index of displayIndexes) {
    appendSection(index, makePanel(index));
  }
  if (splitInput.allowAdd) {
    const parsedMaxPanels = Number.parseInt(splitInput.maxPanels, 10);
    const maxPanels = Number.isFinite(parsedMaxPanels) && parsedMaxPanels > 0 ? parsedMaxPanels : Infinity;
    const actions = document.createElement("div");
    actions.className = "split-input-actions";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "secondary-button";
    addButton.textContent = splitInput.addLabel ?? "Add input";
    const updateAddButtonVisibility = () => {
      const panelCount = elements.splitInputPanel.querySelectorAll(".split-input-textarea").length;
      actions.hidden = panelCount >= maxPanels;
    };
    addButton.addEventListener("click", () => {
      const index = elements.splitInputPanel.querySelectorAll(".split-input-textarea").length;
      if (index >= maxPanels) {
        updateAddButtonVisibility();
        return;
      }
      appendSection(index, makePanel(index));
      elements.splitInputPanel.append(actions);
      clearToolOutput();
      updateInputActionButtons();
      updateAddButtonVisibility();
    });
    actions.append(addButton);
    elements.splitInputPanel.append(actions);
    updateAddButtonVisibility();
  }
}

const READ_MAPPING_READ_LAYOUT_MODES = {
  single: { label: "Single-end" },
  paired: { label: "Paired-end" }
};

const READ_MAPPING_REFERENCE_MODES = {
  sequence: {
    tabText: "Plain sequence or FASTA",
    description: "Paste one reference DNA/RNA sequence or FASTA record, or choose a small FASTA/FASTA.GZ file."
  },
  flatfile: {
    tabText: "Single annotated record",
    description: "Paste a GenBank, DDBJ, or EMBL nucleotide reference record."
  },
  "gff3-fasta": {
    tabText: "GFF3 + FASTA",
    description: "Paste GFF3 annotation rows with the matching reference FASTA."
  },
  "gtf-fasta": {
    tabText: "GTF + FASTA",
    description: "Paste GTF annotation rows with the matching reference FASTA."
  },
  "bed-fasta": {
    tabText: "BED + FASTA",
    description: "Paste BED interval rows with the matching reference FASTA."
  }
};

const ALIGNMENT_VIEWER_ALIGNMENT_MODES = {
  "sam-text": {
    tabText: "SAM / SAM.GZ",
    description: "Paste SAM text below or use a SAM/SAM.GZ file for larger local scans."
  },
  "indexed-bam": {
    tabText: "Indexed BAM + BAI/CSI",
    description: "Choose a BAM file with its matching BAI or CSI index for a bounded region query."
  }
};

const ALIGNMENT_VIEWER_VCF_MODES = {
  "paste-upload": {
    tabText: "Paste/upload VCF",
    description: "Paste VCF text below or choose a VCF/VCF.GZ file to scan for the selected region."
  },
  "indexed-vcf": {
    tabText: "Indexed VCF + TBI/CSI",
    description: "Choose a bgzip-compressed VCF.GZ file with its matching TBI or CSI index."
  }
};

const ALIGNMENT_VIEWER_REFERENCE_MODES = {
  none: {
    tabText: "No reference",
    description: "Use placeholder bases from the alignment region."
  },
  loaded: {
    tabText: "Plain sequence or FASTA",
    description: "Paste one reference sequence or FASTA record, or choose a small FASTA/FASTA.GZ file."
  },
  flatfile: {
    tabText: "Single annotated record",
    description: "Paste a GenBank, DDBJ, or EMBL nucleotide reference record."
  },
  "gff3-fasta": {
    tabText: "GFF3 + FASTA",
    description: "Paste GFF3 annotation rows with the matching reference FASTA."
  },
  "gtf-fasta": {
    tabText: "GTF + FASTA",
    description: "Paste GTF annotation rows with the matching reference FASTA."
  },
  "bed-fasta": {
    tabText: "BED + FASTA",
    description: "Paste BED interval rows with the matching reference FASTA."
  },
  indexed: {
    tabText: "FASTA + FAI",
    description: "Choose an uncompressed FASTA file and matching .fai index."
  },
  bgzf: {
    tabText: "BGZF FASTA + FAI + GZI",
    description: "Choose a BGZF-compressed FASTA with matching .fai and .gzi indexes."
  }
};

const ALIGNMENT_VIEWER_PAIRED_REFERENCE_MODES = new Set(["gff3-fasta", "gtf-fasta", "bed-fasta"]);

function renderAlignmentViewerTabbedInput(tool) {
  const splitInput = tool.metadata.splitInput;
  const exampleParts = splitInputExampleParts(tool);
  elements.splitInputPanel.hidden = false;
  elements.splitInputPanel.textContent = "";

  const wrapper = document.createElement("section");
  wrapper.id = "alignmentViewerInputPanel";
  wrapper.className = "alignment-viewer-input-panel";
  wrapper.append(
    createAlignmentViewerAlignmentCard(splitInput.panels?.[0], exampleParts[0] ?? ""),
    createAlignmentViewerVcfCard(splitInput.panels?.[1], exampleParts[1] ?? ""),
    createAlignmentViewerReferenceCard()
  );
  elements.splitInputPanel.append(wrapper);
  updateAlignmentViewerInputUi();
}

function createAlignmentViewerCard({ id, title, modes, selectedMode, ariaLabel, onSelect }) {
  const card = document.createElement("section");
  card.className = "alignment-viewer-input-card";
  card.dataset.alignmentViewerCard = id;
  const heading = document.createElement("div");
  heading.className = "alignment-viewer-input-card-heading";
  const titleElement = document.createElement("h4");
  titleElement.textContent = title;
  const tabs = createTabbedInputWorkflowTabs({
    document,
    modes,
    selectedMode,
    ariaLabel,
    onSelect
  });
  heading.append(titleElement, tabs);
  const description = document.createElement("p");
  description.className = "alignment-viewer-input-description";
  description.dataset.modeDescription = "";
  card.append(heading, description);
  return card;
}

function createAlignmentViewerPaneHeading(text) {
  const heading = document.createElement("h5");
  heading.className = "alignment-viewer-pane-heading";
  heading.textContent = text;
  return heading;
}

function createAlignmentViewerSamSummaryElement() {
  const summary = document.createElement("div");
  summary.className = "alignment-viewer-source-summary";
  summary.dataset.alignmentViewerSamSummary = "";
  return summary;
}

function createAlignmentViewerAlignmentCard(panel, exampleText) {
  const card = createAlignmentViewerCard({
    id: "alignment",
    title: "SAM alignments",
    modes: ALIGNMENT_VIEWER_ALIGNMENT_MODES,
    selectedMode: getToolOptionValue("dataSourceMode", "sam-text"),
    ariaLabel: "SAM alignment source",
    onSelect: (mode) => setAlignmentViewerMode("dataSourceMode", mode)
  });
  const samPane = document.createElement("div");
  samPane.dataset.alignmentViewerModePane = "sam-text";
  samPane.className = "alignment-viewer-input-pane";
  samPane.append(
    createAlignmentViewerPaneHeading("SAM input"),
    createAlignmentViewerFileSlot({
      id: "samInputFile",
      label: "SAM/SAM.GZ file",
      accept: ".sam,.sam.gz,.gz",
      dropLabel: "Drop SAM or SAM.GZ here"
    }),
    createAlignmentViewerSamSummaryElement(),
    createAlignmentViewerTextarea({
      panel,
      index: 0,
      value: exampleText,
      placeholder: panel?.placeholder ?? "Paste SAM text here."
    })
  );
  const bamPane = document.createElement("div");
  bamPane.dataset.alignmentViewerModePane = "indexed-bam";
  bamPane.className = "alignment-viewer-input-pane alignment-viewer-file-grid alignment-viewer-paired-file-grid";
  bamPane.append(
    createAlignmentViewerPaneHeading("Indexed BAM input"),
    createAlignmentViewerFileSlot({
      id: "indexedBamFile",
      label: "BAM file",
      accept: ".bam",
      dropLabel: "Drop BAM file here"
    }),
    createAlignmentViewerFileSlot({
      id: "bamIndexFile",
      label: "BAI or CSI index",
      accept: ".bai,.csi",
      dropLabel: "Drop matching BAI or CSI index here"
    })
  );
  card.append(samPane, bamPane);
  return card;
}

function createAlignmentViewerVcfCard(panel, exampleText) {
  const card = createAlignmentViewerCard({
    id: "vcf",
    title: "Variant overlay",
    modes: ALIGNMENT_VIEWER_VCF_MODES,
    selectedMode: getToolOptionValue("vcfSourceMode", "paste-upload"),
    ariaLabel: "Variant overlay source",
    onSelect: (mode) => setAlignmentViewerMode("vcfSourceMode", mode)
  });
  const pastePane = document.createElement("div");
  pastePane.dataset.alignmentViewerModePane = "paste-upload";
  pastePane.className = "alignment-viewer-input-pane";
  pastePane.append(
    createAlignmentViewerFileSlot({
      id: "vcfInputFile",
      label: "VCF/VCF.GZ file",
      accept: ".vcf,.vcf.gz,.gz",
      dropLabel: "Drop optional VCF or VCF.GZ here"
    }),
    createAlignmentViewerTextarea({
      panel,
      index: 1,
      value: exampleText,
      placeholder: panel?.placeholder ?? "Paste optional VCF text here."
    })
  );
  const indexedPane = document.createElement("div");
  indexedPane.dataset.alignmentViewerModePane = "indexed-vcf";
  indexedPane.className = "alignment-viewer-input-pane alignment-viewer-file-grid alignment-viewer-paired-file-grid";
  indexedPane.append(
    createAlignmentViewerFileSlot({
      id: "indexedVcfFile",
      label: "Indexed VCF.GZ file",
      accept: ".vcf.gz,.bgz,.gz",
      dropLabel: "Drop bgzip VCF.GZ here"
    }),
    createAlignmentViewerFileSlot({
      id: "indexFile",
      label: "TBI or CSI index",
      accept: ".tbi,.csi",
      dropLabel: "Drop matching TBI or CSI index here"
    })
  );
  card.append(pastePane, indexedPane);
  return card;
}

function createAlignmentViewerReferenceCard() {
  const card = createAlignmentViewerCard({
    id: "reference",
    title: "Reference genome",
    modes: ALIGNMENT_VIEWER_REFERENCE_MODES,
    selectedMode: getToolOptionValue("referenceGenomeMode", "none"),
    ariaLabel: "Reference genome source",
    onSelect: (mode) => setAlignmentViewerMode("referenceGenomeMode", mode)
  });
  const nonePane = document.createElement("p");
  nonePane.dataset.alignmentViewerModePane = "none";
  nonePane.className = "alignment-viewer-empty-pane";
  nonePane.textContent = "No reference FASTA will be used.";
  const fastaPane = document.createElement("div");
  fastaPane.dataset.alignmentViewerModePaneValues = "loaded indexed bgzf";
  fastaPane.className = "alignment-viewer-input-pane alignment-viewer-file-grid alignment-viewer-reference-fasta-pane";
  const fastaSlot = createAlignmentViewerFileSlot({
    id: "referenceGenomeFastaFile",
    label: "Reference sequence / FASTA",
    accept: ".fa,.fasta,.fna,.ffn,.txt,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.bgz",
    dropLabel: "Drop one reference sequence or FASTA here"
  });
  fastaSlot.dataset.alignmentViewerModePaneValues = "loaded indexed bgzf";
  const faiSlot = createAlignmentViewerFileSlot({
    id: "referenceGenomeFaiFile",
    label: "Matching .fai",
    accept: ".fai",
    dropLabel: "Drop matching .fai here"
  });
  faiSlot.dataset.alignmentViewerModePaneValues = "indexed bgzf";
  const gziSlot = createAlignmentViewerFileSlot({
    id: "referenceGenomeGziFile",
    label: "Matching .gzi",
    accept: ".gzi",
    dropLabel: "Drop matching .gzi here"
  });
  gziSlot.dataset.alignmentViewerModePaneValues = "bgzf";
  const referenceText = createAlignmentViewerReferenceTextarea();
  referenceText.dataset.alignmentViewerModePaneValues = "loaded";
  fastaPane.append(fastaSlot, referenceText, faiSlot, gziSlot);
  card.append(
    nonePane,
    fastaPane,
    createAlignmentViewerReferenceTextPane({
      mode: "flatfile",
      inputKey: "flatfile",
      label: "Annotated flatfile record",
      dropLabel: "Drop GenBank, DDBJ, or EMBL nucleotide record here",
      placeholder: "Paste a GenBank, DDBJ, or EMBL nucleotide reference record here."
    }),
    createAlignmentViewerReferencePairedPane({
      mode: "gff3-fasta",
      annotationKey: "gff3-fasta-annotation",
      fastaKey: "gff3-fasta-fasta",
      annotationLabel: "GFF3 annotation rows",
      annotationDropLabel: "Drop GFF3 annotation rows here",
      annotationPlaceholder: "Paste GFF3 annotation rows here.",
      fastaLabel: "Reference FASTA",
      fastaDropLabel: "Drop matching FASTA here",
      fastaPlaceholder: "Paste the matching reference FASTA here."
    }),
    createAlignmentViewerReferencePairedPane({
      mode: "gtf-fasta",
      annotationKey: "gtf-fasta-annotation",
      fastaKey: "gtf-fasta-fasta",
      annotationLabel: "GTF annotation rows",
      annotationDropLabel: "Drop GTF annotation rows here",
      annotationPlaceholder: "Paste GTF annotation rows here.",
      fastaLabel: "Reference FASTA",
      fastaDropLabel: "Drop matching FASTA here",
      fastaPlaceholder: "Paste the matching reference FASTA here."
    }),
    createAlignmentViewerReferencePairedPane({
      mode: "bed-fasta",
      annotationKey: "bed-fasta-annotation",
      fastaKey: "bed-fasta-fasta",
      annotationLabel: "BED interval rows",
      annotationDropLabel: "Drop BED interval rows here",
      annotationPlaceholder: "Paste BED interval rows here. BED coordinates are interpreted as 0-based half-open.",
      fastaLabel: "Reference FASTA",
      fastaDropLabel: "Drop matching FASTA here",
      fastaPlaceholder: "Paste the matching reference FASTA here."
    })
  );
  return card;
}

function createAlignmentViewerFileSlot({ id, label, accept, dropLabel }) {
  const slot = document.createElement("div");
  slot.className = "alignment-viewer-file-slot";
  slot.dataset.fileSlot = id;
  const heading = document.createElement("div");
  heading.className = "alignment-viewer-file-slot-heading";
  const title = document.createElement("strong");
  title.textContent = label;
  const browse = document.createElement("label");
  browse.className = "file-button file-option-browse";
  const input = document.createElement("input");
  input.id = id;
  input.type = "file";
  input.accept = accept;
  input.setAttribute("aria-label", label);
  const browseText = document.createElement("span");
  browseText.textContent = "Choose file";
  browse.append(input, browseText);
  heading.append(title, browse);
  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone alignment-viewer-file-drop-zone";
  dropZone.tabIndex = 0;
  dropZone.textContent = dropLabel;
  const status = document.createElement("div");
  status.id = `${id}Status`;
  status.className = "alignment-viewer-file-status";
  input.addEventListener("change", () => {
    if (id === "referenceGenomeFastaFile" && input.files?.length) {
      const referenceText = document.querySelector("#referenceGenomeFastaFileText");
      if (referenceText) {
        referenceText.value = "";
      }
    }
    updateAlignmentViewerFileStatuses();
    clearToolOutput();
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    setFileOptionFiles(input, event.dataTransfer?.files, false);
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    input.click();
  });
  slot.append(heading, dropZone, status);
  return slot;
}

function createAlignmentViewerReferenceTextPane({ mode, inputKey, label, dropLabel, placeholder }) {
  const pane = document.createElement("div");
  pane.dataset.alignmentViewerModePane = mode;
  pane.className = "alignment-viewer-input-pane";
  pane.append(createAlignmentViewerReferenceTextSection({
    inputKey,
    label,
    dropLabel,
    placeholder
  }));
  return pane;
}

function createAlignmentViewerReferencePairedPane({
  mode,
  annotationKey,
  fastaKey,
  annotationLabel,
  annotationDropLabel,
  annotationPlaceholder,
  fastaLabel,
  fastaDropLabel,
  fastaPlaceholder
}) {
  const pane = document.createElement("div");
  pane.dataset.alignmentViewerModePane = mode;
  pane.className = "alignment-viewer-input-pane bio-record-paired-input-grid";
  pane.append(
    createAlignmentViewerReferenceTextSection({
      inputKey: annotationKey,
      label: annotationLabel,
      dropLabel: annotationDropLabel,
      placeholder: annotationPlaceholder
    }),
    createAlignmentViewerReferenceTextSection({
      inputKey: fastaKey,
      label: fastaLabel,
      dropLabel: fastaDropLabel,
      placeholder: fastaPlaceholder
    })
  );
  return pane;
}

function createAlignmentViewerReferenceTextSection({ inputKey, label, dropLabel, placeholder }) {
  const section = document.createElement("section");
  section.className = "bio-record-input-section alignment-viewer-reference-text-section";
  const heading = document.createElement("div");
  heading.className = "split-input-heading";
  const title = document.createElement("h4");
  title.textContent = label;
  const fileLabel = document.createElement("label");
  fileLabel.className = "file-button";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".txt,.gb,.gbk,.gbff,.genbank,.embl,.gff,.gff3,.gtf,.bed,.fa,.fasta,.fna";
  fileInput.setAttribute("aria-label", label);
  const fileText = document.createElement("span");
  fileText.textContent = "Choose file";
  fileLabel.append(fileInput, fileText);
  heading.append(title, fileLabel);

  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone split-drop-zone";
  dropZone.textContent = dropLabel;
  const textarea = document.createElement("textarea");
  textarea.className = "split-input-textarea alignment-viewer-reference-textarea";
  textarea.dataset.alignmentViewerReferenceInput = inputKey;
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.placeholder = placeholder;

  const loadFile = async (file) => {
    if (!file) {
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
      return;
    }
    textarea.value = await readToolInputFileText(file, { onMessage: addMessage });
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions();
    addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
  };
  fileInput.addEventListener("change", async () => {
    await loadFile(fileInput.files?.[0]);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    await loadFile(event.dataTransfer.files?.[0]);
  });
  textarea.addEventListener("input", () => {
    updateInputActionButtons();
    clearToolOutput();
  });

  section.append(heading, dropZone, textarea);
  return section;
}

function createAlignmentViewerReferenceTextarea() {
  const textarea = document.createElement("textarea");
  textarea.id = "referenceGenomeFastaFileText";
  textarea.name = "referenceGenomeFastaFileText";
  textarea.className = "file-option-textarea split-input-textarea alignment-viewer-reference-textarea";
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.rows = 8;
  textarea.value = formatExampleInputForDisplay(alignmentViewerReferenceExample);
  textarea.placeholder = "Paste reference FASTA here";
  textarea.setAttribute("aria-label", "Reference FASTA text");
  textarea.addEventListener("input", () => {
    const fileInput = document.querySelector("#referenceGenomeFastaFile");
    if (textarea.value.trim() && fileInput?.files?.length) {
      fileInput.value = "";
      updateAlignmentViewerFileStatuses();
    }
    updateInputActionButtons();
    clearToolOutput();
  });
  return textarea;
}

function createAlignmentViewerTextarea({ panel, index, value, placeholder }) {
  const textarea = document.createElement("textarea");
  textarea.className = "split-input-textarea alignment-viewer-textarea";
  textarea.dataset.splitInputIndex = String(index);
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.value = formatExampleInputForDisplay(value ?? "");
  textarea.placeholder = placeholder;
  textarea.setAttribute("aria-label", panel?.label ?? `Input ${index + 1}`);
  textarea.addEventListener("input", () => {
    updateInputActionButtons();
    updateToolOptionSuggestions();
    updateAlignmentViewerInputUi();
    clearToolOutput();
  });
  return textarea;
}

function setAlignmentViewerMode(optionId, mode) {
  setToolOptionValue(optionId, mode);
  dispatchToolOptionChange(optionId);
  updateAlignmentViewerInputUi();
  clearToolOutput();
}

function updateAlignmentViewerCard(card, mode, modes) {
  if (!card) {
    return;
  }
  card.dataset.alignmentViewerSelectedMode = mode;
  updateTabbedInputWorkflowTabs(card, mode);
  const description = card.querySelector("[data-mode-description]");
  if (description) {
    description.textContent = modes[mode]?.description ?? "";
  }
  card
    .querySelectorAll("[data-alignment-viewer-mode-pane], [data-alignment-viewer-mode-pane-values]")
    .forEach((pane) => {
      const values = (pane.dataset.alignmentViewerModePaneValues ?? pane.dataset.alignmentViewerModePane ?? "")
        .split(/\s+/u)
        .filter(Boolean);
      pane.hidden = !values.includes(mode);
    });
}

function updateAlignmentViewerFileStatuses() {
  const panel = document.querySelector("#alignmentViewerInputPanel");
  if (!panel) {
    return;
  }
  panel.querySelectorAll(".alignment-viewer-file-slot").forEach((slot) => {
    const input = slot.querySelector("input[type='file']");
    const status = slot.querySelector(".alignment-viewer-file-status");
    if (!input || !status) {
      return;
    }
    const file = input.files?.[0];
    status.textContent = file
      ? `${file.name || "selected file"} (${Number(file.size || 0).toLocaleString()} bytes)`
      : "No file selected";
  });
}

function formatAlignmentViewerSamSummary(summary) {
  const references = summary.references
    .map((reference) => reference.name)
    .filter(Boolean);
  const parts = [];
  if (references.length > 0) {
    const displayed = references.slice(0, 6).join(", ");
    const suffix = references.length > 6 ? `, +${references.length - 6} more` : "";
    parts.push(`Detected ${references.length} reference${references.length === 1 ? "" : "s"}: ${displayed}${suffix}.`);
  } else if (summary.alignmentLines > 0) {
    parts.push(`Detected ${summary.alignmentLines.toLocaleString()} alignment${summary.alignmentLines === 1 ? "" : "s"} with no reference names.`);
  } else {
    parts.push("No SAM alignments detected yet.");
  }
  if (summary.sortOrder) {
    parts.push(`Sort order: ${summary.sortOrder}.`);
  }
  if (summary.alignmentLines > 0) {
    parts.push(`Preview scanned ${summary.alignmentLines.toLocaleString()} alignment${summary.alignmentLines === 1 ? "" : "s"}.`);
  }
  if (summary.truncated) {
    parts.push("Preview truncated.");
  }
  return parts.join(" ");
}

function updateAlignmentViewerSamSummary(panel, summary) {
  const summaryElement = panel?.querySelector("[data-alignment-viewer-sam-summary]");
  if (!summaryElement) {
    return;
  }
  summaryElement.textContent = formatAlignmentViewerSamSummary(summary);
}

function updateAlignmentViewerInputUi() {
  if (!isAlignmentViewerTool()) {
    return;
  }
  const panel = document.querySelector("#alignmentViewerInputPanel");
  const hiddenSidebarGroups = ["alignmentSource", "variantOverlay", "referenceGenome"];
  for (const id of hiddenSidebarGroups) {
    const group = elements.toolOptions.querySelector(`[data-option-id="${id}"]`);
    if (group) {
      group.hidden = true;
    }
  }
  if (!panel) {
    return;
  }
  const alignmentMode = getToolOptionValue("dataSourceMode", "sam-text");
  const vcfMode = getToolOptionValue("vcfSourceMode", "paste-upload");
  const referenceMode = getToolOptionValue("referenceGenomeMode", "none");
  updateAlignmentViewerCard(
    panel.querySelector('[data-alignment-viewer-card="alignment"]'),
    ALIGNMENT_VIEWER_ALIGNMENT_MODES[alignmentMode] ? alignmentMode : "sam-text",
    ALIGNMENT_VIEWER_ALIGNMENT_MODES
  );
  updateAlignmentViewerCard(
    panel.querySelector('[data-alignment-viewer-card="vcf"]'),
    ALIGNMENT_VIEWER_VCF_MODES[vcfMode] ? vcfMode : "paste-upload",
    ALIGNMENT_VIEWER_VCF_MODES
  );
  updateAlignmentViewerCard(
    panel.querySelector('[data-alignment-viewer-card="reference"]'),
    ALIGNMENT_VIEWER_REFERENCE_MODES[referenceMode] ? referenceMode : "none",
    ALIGNMENT_VIEWER_REFERENCE_MODES
  );
  const samText = panel.querySelector('[data-split-input-index="0"]')?.value ?? "";
  const samSummary = summarizeSamReferencesFromText(samText);
  panel.dataset.referenceSuggestions = samSummary.references
    .map((reference) => reference.name)
    .filter(Boolean)
    .join("\n");
  updateAlignmentViewerSamSummary(panel, samSummary);
  updateAlignmentViewerFileStatuses();
  updateToolOptionSuggestions();
}

function getAlignmentViewerInputText() {
  const separator = state.selectedTool?.metadata?.splitInput?.separator ?? "##VCF";
  const panel = document.querySelector("#alignmentViewerInputPanel");
  const samText = panel?.querySelector('[data-split-input-index="0"]')?.value ?? "";
  const vcfText = getToolOptionValue("vcfSourceMode", "paste-upload") === "none"
    ? ""
    : panel?.querySelector('[data-split-input-index="1"]')?.value ?? "";
  return [samText, vcfText].join(`\n${separator}\n`);
}

function makeAlignmentViewerReferenceTextFile(text, name) {
  return {
    text,
    name,
    size: new Blob([text]).size
  };
}

function getAlignmentViewerReferenceText(inputKey) {
  return document
    .querySelector(`#alignmentViewerInputPanel [data-alignment-viewer-reference-input="${inputKey}"]`)
    ?.value ?? "";
}

function getAlignmentViewerLoadedReferenceText() {
  return document.querySelector("#alignmentViewerInputPanel #referenceGenomeFastaFileText")?.value ?? "";
}

function getAlignmentViewerSelectedMode(cardId, fallback = "") {
  return document
    .querySelector(`#alignmentViewerInputPanel [data-alignment-viewer-card="${cardId}"] [role="tab"][aria-selected="true"]`)
    ?.dataset?.inputWorkflowMode ?? fallback;
}

function getAlignmentViewerReferenceBundleText(mode) {
  if (mode === "flatfile") {
    return getAlignmentViewerReferenceText("flatfile");
  }
  if (ALIGNMENT_VIEWER_PAIRED_REFERENCE_MODES.has(mode)) {
    const annotation = getAlignmentViewerReferenceText(`${mode}-annotation`);
    const fasta = getAlignmentViewerReferenceText(`${mode}-fasta`);
    if (!annotation.trim() && !fasta.trim()) {
      return "";
    }
    return `${annotation.trim()}\n##FASTA\n${fasta.trim()}\n`;
  }
  return "";
}

function getAlignmentViewerOptions(options) {
  const mode = String(getAlignmentViewerSelectedMode(
    "reference",
    options.referenceGenomeMode ?? getToolOptionValue("referenceGenomeMode", "loaded")
  ));
  if (mode === "none") {
    return {
      ...options,
      referenceGenomeMode: mode,
      referenceGenomeFastaFile: null,
      referenceGenomeFaiFile: null,
      referenceGenomeGziFile: null
    };
  }
  if (mode === "loaded") {
    const referenceText = getAlignmentViewerLoadedReferenceText();
    return {
      ...options,
      referenceGenomeMode: mode,
      referenceGenomeFastaFile: options.referenceGenomeFastaFile?.stream || options.referenceGenomeFastaFile?.text
        ? options.referenceGenomeFastaFile
        : referenceText.trim()
          ? makeAlignmentViewerReferenceTextFile(referenceText, "alignment-viewer-reference.fasta")
          : null,
      referenceGenomeFaiFile: null,
      referenceGenomeGziFile: null
    };
  }
  if (mode !== "flatfile" && !ALIGNMENT_VIEWER_PAIRED_REFERENCE_MODES.has(mode)) {
    return ALIGNMENT_VIEWER_REFERENCE_MODES[mode]
      ? { ...options, referenceGenomeMode: mode }
      : options;
  }
  const referenceText = getAlignmentViewerReferenceBundleText(mode);
  return {
    ...options,
    referenceGenomeMode: mode,
    referenceGenomeFastaFile: referenceText.trim()
      ? makeAlignmentViewerReferenceTextFile(referenceText, `alignment-viewer-reference-${mode}.txt`)
      : null,
    referenceGenomeFaiFile: null,
    referenceGenomeGziFile: null
  };
}

function renderReadMappingCoverageInput(tool) {
  const splitInput = tool.metadata.splitInput;
  const exampleParts = splitInputExampleParts(tool);
  elements.splitInputPanel.hidden = false;
  elements.splitInputPanel.textContent = "";

  elements.splitInputPanel.append(
    createReadMappingReferenceSection(splitInput, exampleParts[0] ?? ""),
    createReadMappingReadsSection(splitInput, exampleParts[1] ?? "")
  );
  setReadMappingCoverageReferenceMode("sequence", { clearOutput: false });
  setReadMappingCoverageReadLayout("single", { clearOutput: false });
}

function createReadMappingReferenceSection(splitInput, referenceExample) {
  const section = document.createElement("section");
  section.className = "split-input-section read-mapping-reference-section";
  section.dataset.readMappingReferenceSection = "true";
  const heading = document.createElement("div");
  heading.className = "split-input-heading";
  const title = document.createElement("h4");
  title.textContent = splitInput.panels?.[0]?.label ?? "Reference";
  heading.append(title);

  const tabs = createTabbedInputWorkflowTabs({
    document,
    modes: READ_MAPPING_REFERENCE_MODES,
    selectedMode: "sequence",
    ariaLabel: "Reference source",
    datasetKey: "referenceSource",
    onSelect: (mode) => setReadMappingCoverageReferenceMode(mode)
  });
  for (const mode of Object.keys(READ_MAPPING_REFERENCE_MODES)) {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "readMappingReferenceSource";
    radio.value = mode;
    radio.hidden = true;
    radio.checked = mode === "sequence";
    tabs.append(radio);
  }

  const sequencePanel = document.createElement("div");
  sequencePanel.className = "read-mapping-reference-panel";
  sequencePanel.dataset.readMappingReferencePanel = "sequence";
  sequencePanel.append(createReadMappingInputSlot({
    title: "Reference sequence",
    dropLabel: splitInput.panels?.[0]?.dropLabel ?? "Drop one reference DNA/RNA sequence or FASTA records here",
    accept: splitInput.panels?.[0]?.accept ?? ".txt,.fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz,.gz",
    value: referenceExample,
    inputKey: "reference",
    sectionClassName: "read-mapping-reference-slot"
  }));

  const flatfilePanel = document.createElement("div");
  flatfilePanel.className = "read-mapping-reference-panel";
  flatfilePanel.dataset.readMappingReferencePanel = "flatfile";
  flatfilePanel.hidden = true;
  flatfilePanel.append(createReadMappingInputSlot({
    title: "Annotated flatfile record",
    dropLabel: "Drop GenBank, DDBJ, or EMBL nucleotide record here",
    accept: ".gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq",
    value: "",
    inputKey: "reference-flatfile",
    pastePlaceholder: "Paste a GenBank, DDBJ, or EMBL nucleotide reference record here.",
    sectionClassName: "read-mapping-reference-slot"
  }));

  section.append(
    heading,
    tabs,
    sequencePanel,
    flatfilePanel,
    createReadMappingReferencePairedPanel({
      mode: "gff3-fasta",
      annotationKey: "reference-gff3-annotation",
      fastaKey: "reference-gff3-fasta",
      annotationTitle: "GFF3 annotation rows",
      annotationDropLabel: "Drop GFF3 annotation rows here",
      annotationAccept: ".gff,.gff3,.txt",
      annotationPlaceholder: "Paste GFF3 annotation rows here.",
      fastaTitle: "Reference FASTA",
      fastaDropLabel: "Drop matching reference FASTA here",
      fastaPlaceholder: "Paste the matching reference FASTA here."
    }),
    createReadMappingReferencePairedPanel({
      mode: "gtf-fasta",
      annotationKey: "reference-gtf-annotation",
      fastaKey: "reference-gtf-fasta",
      annotationTitle: "GTF annotation rows",
      annotationDropLabel: "Drop GTF annotation rows here",
      annotationAccept: ".gtf,.txt",
      annotationPlaceholder: "Paste GTF annotation rows here.",
      fastaTitle: "Reference FASTA",
      fastaDropLabel: "Drop matching reference FASTA here",
      fastaPlaceholder: "Paste the matching reference FASTA here."
    }),
    createReadMappingReferencePairedPanel({
      mode: "bed-fasta",
      annotationKey: "reference-bed-annotation",
      fastaKey: "reference-bed-fasta",
      annotationTitle: "BED interval rows",
      annotationDropLabel: "Drop BED interval rows here",
      annotationAccept: ".bed,.txt",
      annotationPlaceholder: "Paste BED interval rows here. BED coordinates are interpreted as 0-based half-open.",
      fastaTitle: "Reference FASTA",
      fastaDropLabel: "Drop matching reference FASTA here",
      fastaPlaceholder: "Paste the matching reference FASTA here."
    })
  );
  return section;
}

function createReadMappingReferencePairedPanel({
  mode,
  annotationKey,
  fastaKey,
  annotationTitle,
  annotationDropLabel,
  annotationAccept,
  annotationPlaceholder,
  fastaTitle,
  fastaDropLabel,
  fastaPlaceholder
}) {
  const panel = document.createElement("div");
  panel.className = "read-mapping-reference-panel bio-record-paired-input-grid";
  panel.dataset.readMappingReferencePanel = mode;
  panel.hidden = true;
  panel.append(
    createReadMappingInputSlot({
      title: annotationTitle,
      dropLabel: annotationDropLabel,
      accept: annotationAccept,
      value: "",
      inputKey: annotationKey,
      pastePlaceholder: annotationPlaceholder,
      sectionClassName: "read-mapping-reference-slot"
    }),
    createReadMappingInputSlot({
      title: fastaTitle,
      dropLabel: fastaDropLabel,
      accept: ".fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz,.gz,.txt",
      value: "",
      inputKey: fastaKey,
      pastePlaceholder: fastaPlaceholder,
      sectionClassName: "read-mapping-reference-slot"
    })
  );
  return panel;
}

function createReadMappingReadsSection(splitInput, readsExample) {
  const section = document.createElement("section");
  section.className = "split-input-section read-mapping-reads-section";
  section.dataset.readMappingReadsSection = "true";
  const heading = document.createElement("div");
  heading.className = "split-input-heading";
  const title = document.createElement("h4");
  title.textContent = splitInput.panels?.[1]?.label ?? "Reads";
  heading.append(title);

  const tabs = createTabbedInputWorkflowTabs({
    document,
    modes: READ_MAPPING_READ_LAYOUT_MODES,
    selectedMode: "single",
    ariaLabel: "Read layout",
    datasetKey: "readLayout",
    onSelect: (mode) => setReadMappingCoverageReadLayout(mode)
  });
  for (const mode of Object.keys(READ_MAPPING_READ_LAYOUT_MODES)) {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "readLayout";
    radio.value = mode;
    radio.hidden = true;
    radio.checked = mode === "single";
    tabs.append(radio);
  }
  const readFormatDescription = document.createElement("p");
  readFormatDescription.className = "split-input-description";
  readFormatDescription.textContent = splitInput.panels?.[1]?.description ?? "";
  readFormatDescription.hidden = !splitInput.panels?.[1]?.description;

  const singlePanel = document.createElement("div");
  singlePanel.className = "read-mapping-layout-panel";
  singlePanel.dataset.readMappingLayoutPanel = "single";
  singlePanel.append(createReadMappingInputSlot({
    title: "Single-end reads",
    dropLabel: splitInput.panels?.[1]?.dropLabel ?? "Drop FASTQ or FASTQ.GZ reads here",
    accept: splitInput.panels?.[1]?.accept ?? ".fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz,.fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
    value: readsExample,
    inputKey: "reads-single",
    sectionClassName: "read-mapping-read-slot",
    textareaClassName: "split-input-textarea read-mapping-read-textarea"
  }));

  const pairedPanel = document.createElement("div");
  pairedPanel.className = "read-mapping-layout-panel paired-read-input-grid";
  pairedPanel.dataset.readMappingLayoutPanel = "paired";
  pairedPanel.hidden = true;
  pairedPanel.append(
    createReadMappingInputSlot({
      title: "Read 1 FASTQ file",
      dropLabel: "Drop R1 FASTQ here",
      accept: splitInput.panels?.[1]?.accept ?? ".fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz,.fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
      value: "",
      inputKey: "reads-r1",
      fileButtonText: "Browse file",
      pastePlaceholder: "Paste R1 FASTQ reads here",
      showFileStatus: true,
      sectionClassName: "read-mapping-read-slot",
      textareaClassName: "split-input-textarea read-mapping-read-textarea"
    }),
    createReadMappingInputSlot({
      title: "Read 2 FASTQ file",
      dropLabel: "Drop R2 FASTQ here",
      accept: splitInput.panels?.[1]?.accept ?? ".fa,.fasta,.fna,.fa.gz,.fasta.gz,.fna.gz,.fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt",
      value: "",
      inputKey: "reads-r2",
      fileButtonText: "Browse file",
      pastePlaceholder: "Paste R2 FASTQ reads here",
      showFileStatus: true,
      sectionClassName: "read-mapping-read-slot",
      textareaClassName: "split-input-textarea read-mapping-read-textarea"
    })
  );

  section.append(heading, tabs, readFormatDescription, singlePanel, pairedPanel);
  return section;
}

function createReadMappingInputSlot({
  panel = {},
  title,
  dropLabel,
  accept,
  value,
  inputKey,
  fileButtonText = "Choose file",
  pastePlaceholder,
  showFileStatus = false,
  sectionClassName,
  textareaClassName = "split-input-textarea"
}) {
  const section = document.createElement("section");
  section.className = sectionClassName;
  section.dataset.readMappingInputSlot = inputKey;
  const heading = document.createElement("div");
  heading.className = "split-input-heading";
  const headingTitle = document.createElement("h4");
  headingTitle.textContent = title ?? panel.label ?? "Input";
  const fileLabel = document.createElement("label");
  fileLabel.className = "file-button";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = accept ?? panel.accept ?? ".txt,.fa,.fasta,.fna,.fastq,.fq,.gz";
  const fileText = document.createElement("span");
  fileText.textContent = fileButtonText;
  fileLabel.append(fileInput, fileText);
  heading.append(headingTitle, fileLabel);

  const description = document.createElement("p");
  description.className = "split-input-description";
  description.textContent = panel.description ?? "";
  description.hidden = !panel.description;
  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone split-drop-zone";
  dropZone.textContent = dropLabel ?? panel.dropLabel ?? `Drop ${headingTitle.textContent} here`;
  const fileStatus = document.createElement("p");
  fileStatus.className = "file-option-status";
  fileStatus.textContent = "No file selected";
  fileStatus.hidden = !showFileStatus;
  const textarea = document.createElement("textarea");
  textarea.className = textareaClassName;
  textarea.dataset.readMappingInput = inputKey;
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.value = formatExampleInputForDisplay(value ?? "");
  textarea.placeholder = pastePlaceholder ?? panel.placeholder ?? "";

  const loadFile = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
      return;
    }
    textarea.value = await readToolInputFileText(file, { onMessage: addMessage });
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions();
    if (showFileStatus) {
      fileStatus.textContent = file.name;
    }
    addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
  };
  fileInput.addEventListener("change", async () => {
    await loadFile(fileInput.files?.[0]);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    await loadFile(event.dataTransfer.files?.[0]);
  });
  textarea.addEventListener("input", () => {
    updateInputActionButtons();
    updateToolOptionSuggestions();
  });

  section.append(heading, description, dropZone, fileStatus, textarea);
  return section;
}

function setReadMappingCoverageReadLayout(mode, { clearOutput = true } = {}) {
  const section = elements.splitInputPanel.querySelector("[data-read-mapping-reads-section]");
  if (!section) return;
  const readLayout = READ_MAPPING_READ_LAYOUT_MODES[mode] ? mode : "single";
  section.dataset.readLayout = readLayout;
  updateTabbedInputWorkflowTabs(section, readLayout, {
    datasetKey: "readLayout",
    tabSelector: ".file-source-tab"
  });
  section.querySelectorAll("input[name='readLayout']").forEach((input) => {
    input.checked = input.value === readLayout;
  });
  section.querySelectorAll("[data-read-mapping-layout-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.readMappingLayoutPanel !== readLayout;
  });
  if (clearOutput) {
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions();
  }
}

function setReadMappingCoverageReferenceMode(mode, { clearOutput = true } = {}) {
  const section = elements.splitInputPanel.querySelector("[data-read-mapping-reference-section]");
  if (!section) return;
  const referenceMode = READ_MAPPING_REFERENCE_MODES[mode] ? mode : "sequence";
  section.dataset.referenceSource = referenceMode;
  updateTabbedInputWorkflowTabs(section, referenceMode, {
    datasetKey: "referenceSource",
    tabSelector: ".file-source-tab"
  });
  section.querySelectorAll("input[name='readMappingReferenceSource']").forEach((input) => {
    input.checked = input.value === referenceMode;
  });
  section.querySelectorAll("[data-read-mapping-reference-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.readMappingReferencePanel !== referenceMode;
  });
  if (clearOutput) {
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions();
  }
}

function splitInputExampleParts(tool) {
  const splitInput = tool?.metadata?.splitInput;
  if (!splitInput) {
    return [];
  }
  const separator = splitInput.separator ?? "---";
  const pattern = new RegExp(`\\n${separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`);
  return String(tool.example ?? "").split(pattern);
}

const BIOLOGICAL_RECORD_SOURCE_MODES = {
  flatfile: {
    inputFormat: "auto",
    tabText: "Single annotated record",
    annotationLabel: "Annotated flatfile record",
    annotationDropLabel: "Drop GenBank, DDBJ, EMBL, GenPept, or UniProt record here",
    annotationPlaceholder:
      "Paste a GenBank, DDBJ, EMBL, GenPept, or UniProt record here. These flatfile formats carry the sequence and annotation together.",
    showFasta: false
  },
  gff3Fasta: {
    inputFormat: "gff3-fasta",
    tabText: "GFF3 + FASTA",
    annotationLabel: "GFF3 annotation rows",
    annotationDropLabel: "Drop GFF3 annotation rows here",
    annotationPlaceholder: "Paste GFF3 annotation rows here. Put the matching reference sequence in the FASTA pane below.",
    showFasta: true
  },
  gtfFasta: {
    inputFormat: "gtf-fasta",
    tabText: "GTF + FASTA",
    annotationLabel: "GTF annotation rows",
    annotationDropLabel: "Drop GTF annotation rows here",
    annotationPlaceholder: "Paste GTF annotation rows here. Put the matching reference sequence in the FASTA pane below.",
    showFasta: true
  },
  bedFasta: {
    inputFormat: "bed-fasta",
    tabText: "BED + FASTA",
    annotationLabel: "BED interval rows",
    annotationDropLabel: "Drop BED interval rows here",
    annotationPlaceholder:
      "Paste BED interval rows here. BED coordinates are interpreted as 0-based half-open; put the matching reference sequence in the FASTA pane below.",
    showFasta: true
  }
};

const ANNOTATED_DNA_RECORD_SOURCE_MODES = {
  flatfile: {
    ...BIOLOGICAL_RECORD_SOURCE_MODES.flatfile,
    annotationDropLabel: "Drop GenBank, DDBJ, or EMBL nucleotide record here",
    annotationPlaceholder:
      "Paste a GenBank, DDBJ, or EMBL nucleotide record here. These flatfile formats carry the sequence and annotation together."
  },
  gff3Fasta: BIOLOGICAL_RECORD_SOURCE_MODES.gff3Fasta,
  gtfFasta: BIOLOGICAL_RECORD_SOURCE_MODES.gtfFasta,
  bedFasta: BIOLOGICAL_RECORD_SOURCE_MODES.bedFasta
};

const DNA_SEQUENCE_VIEWER_SOURCE_MODES = {
  sequence: {
    inputFormat: "sequence",
    tabText: "Plain sequence or FASTA",
    annotationLabel: "DNA/RNA sequence",
    annotationDropLabel: "Drop one plain-text DNA/RNA sequence or FASTA records here",
    annotationPlaceholder: "Paste one plain-text DNA/RNA sequence or FASTA records here.",
    showFasta: false
  },
  flatfile: ANNOTATED_DNA_RECORD_SOURCE_MODES.flatfile,
  gff3Fasta: BIOLOGICAL_RECORD_SOURCE_MODES.gff3Fasta,
  gtfFasta: BIOLOGICAL_RECORD_SOURCE_MODES.gtfFasta,
  bedFasta: BIOLOGICAL_RECORD_SOURCE_MODES.bedFasta
};

const IN_SILICO_PCR_TEMPLATE_SOURCE_MODES = {
  sequence: {
    tabText: "Plain sequence or FASTA",
    annotationLabel: "Template sequence",
    annotationDropLabel: "Drop one plain-text template DNA sequence or FASTA records here",
    annotationPlaceholder: "Paste one plain-text template DNA sequence or FASTA records here.",
    annotationAccept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq",
    showFasta: false
  },
  flatfile: {
    tabText: "Single annotated record",
    annotationLabel: "Annotated flatfile record",
    annotationDropLabel: "Drop GenBank, DDBJ, or EMBL nucleotide record here",
    annotationPlaceholder:
      "Paste a GenBank, DDBJ, or EMBL nucleotide record here. The sequence in the flatfile is used as the PCR template.",
    annotationAccept: ".gb,.gbk,.genbank,.embl,.ddbj,.gz,.txt,.seq",
    showFasta: false
  },
  gff3Fasta: {
    tabText: "GFF3 + FASTA",
    annotationLabel: "GFF3 annotation rows",
    annotationDropLabel: "Drop GFF3 annotation rows here",
    annotationPlaceholder: "Paste GFF3 annotation rows here.",
    annotationAccept: ".gff,.gff3,.txt",
    fastaLabel: "Template FASTA sequence",
    fastaDropLabel: "Drop matching template FASTA records here",
    fastaPlaceholder: "Paste the matching template FASTA sequence here.",
    showFasta: true
  },
  gtfFasta: {
    tabText: "GTF + FASTA",
    annotationLabel: "GTF annotation rows",
    annotationDropLabel: "Drop GTF annotation rows here",
    annotationPlaceholder: "Paste GTF annotation rows here.",
    annotationAccept: ".gtf,.txt",
    fastaLabel: "Template FASTA sequence",
    fastaDropLabel: "Drop matching template FASTA records here",
    fastaPlaceholder: "Paste the matching template FASTA sequence here.",
    showFasta: true
  },
  bedFasta: {
    tabText: "BED + FASTA",
    annotationLabel: "BED interval rows",
    annotationDropLabel: "Drop BED interval rows here",
    annotationPlaceholder: "Paste BED interval rows here.",
    annotationAccept: ".bed,.txt",
    fastaLabel: "Template FASTA sequence",
    fastaDropLabel: "Drop matching template FASTA records here",
    fastaPlaceholder: "Paste the matching template FASTA sequence here.",
    showFasta: true
  }
};

const BIOLOGICAL_RECORD_MODE_EXAMPLES = {
  sequence: {
    annotation: `>plain_viewer_sequence
ACGTACGTACGTACGTACGTACGTACGTACGT`,
    fasta: ""
  },
  gff3Fasta: {
    annotation: `##gff-version 3
plasmidA\tSMS3\tgene\t30\t8\t.\t+\t.\tID=gene1;Name=wrapGene
plasmidA\tSMS3\tCDS\t5\t18\t.\t-\t.\tID=cds1;Name=demoCds;product=demo protein`,
    fasta: `>plasmidA circular plasmid
ATGAAACCCGGGTTTAAACCCGGGTTTAAACCCGGGTTT`
  },
  gtfFasta: {
    annotation: `chrDemo\tSMS3\tgene\t1\t30\t.\t+\t.\tgene_id "gene1"; gene_name "demo_gene";
chrDemo\tSMS3\ttranscript\t1\t30\t.\t+\t.\tgene_id "gene1"; transcript_id "tx1"; gene_name "demo_gene";
chrDemo\tSMS3\texon\t1\t9\t.\t+\t.\tgene_id "gene1"; transcript_id "tx1";
chrDemo\tSMS3\texon\t19\t30\t.\t+\t.\tgene_id "gene1"; transcript_id "tx1";
chrDemo\tSMS3\tCDS\t4\t9\t.\t+\t0\tgene_id "gene1"; transcript_id "tx1"; product "demo peptide";
chrDemo\tSMS3\tCDS\t19\t27\t.\t+\t0\tgene_id "gene1"; transcript_id "tx1"; product "demo peptide";`,
    fasta: `>chrDemo demo contig
ATGAAACCCGGGTTTAAACCCGGGTTTAAA`
  },
  bedFasta: {
    annotation: `# simple BED intervals
chrDemo\t0\t9\tpromoter\t0\t+
chrDemo\t12\t24\trepeat_region\t0\t-`,
    fasta: `>chrDemo demo contig
ATGAAACCCGGGTTTAAACCCGGGTTT`
  }
};

function isBiologicalRecordFormatConverterTool(tool = state.selectedTool) {
  return tool?.metadata?.id === BIOLOGICAL_RECORD_FORMAT_CONVERTER_TOOL_ID;
}

function isAnnotatedDnaRecordExtractorTool(tool = state.selectedTool) {
  return tool?.metadata?.id === ANNOTATED_DNA_RECORD_EXTRACTOR_TOOL_ID;
}

function isStandaloneDnaSequenceViewerTool(tool = state.selectedTool) {
  return tool?.metadata?.id === LINEAR_DNA_SEQUENCE_VIEWER_TOOL_ID ||
    tool?.metadata?.id === CIRCULAR_DNA_SEQUENCE_VIEWER_TOOL_ID;
}

function isGenomeFigureTool(tool = state.selectedTool) {
  return tool?.metadata?.id === GENOME_FIGURE_TOOL_ID ||
    tool?.metadata?.id === CIRCULAR_GENOME_FIGURE_TOOL_ID ||
    tool?.metadata?.id === LINEAR_GENOME_FIGURE_TOOL_ID;
}

function isSequenceEditorTool(tool = state.selectedTool) {
  return tool?.metadata?.id === SEQUENCE_EDITOR_TOOL_ID;
}

function isBiologicalRecordTabbedInputTool(tool = state.selectedTool) {
  return isBiologicalRecordFormatConverterTool(tool) ||
    isAnnotatedDnaRecordExtractorTool(tool) ||
    isStandaloneDnaSequenceViewerTool(tool) ||
    isGenomeFigureTool(tool) ||
    isSequenceEditorTool(tool);
}

function getBiologicalRecordSourceModes(tool = state.selectedTool) {
  if (isStandaloneDnaSequenceViewerTool(tool) || isGenomeFigureTool(tool) || isSequenceEditorTool(tool)) {
    return DNA_SEQUENCE_VIEWER_SOURCE_MODES;
  }
  return isAnnotatedDnaRecordExtractorTool(tool) ||
    isGenomeFigureTool(tool)
    ? ANNOTATED_DNA_RECORD_SOURCE_MODES
    : BIOLOGICAL_RECORD_SOURCE_MODES;
}

function biologicalRecordSourceModeFromInputFormat(inputFormat) {
  if (inputFormat === "sequence") {
    return "sequence";
  }
  if (inputFormat === "gff3-fasta") {
    return "gff3Fasta";
  }
  if (inputFormat === "gtf-fasta") {
    return "gtfFasta";
  }
  if (inputFormat === "bed-fasta") {
    return "bedFasta";
  }
  return "flatfile";
}

function renderBiologicalRecordTabbedInput(tool) {
  const splitInput = tool.metadata.splitInput;
  const exampleParts = splitInputExampleParts(tool);
  const sourceModes = getBiologicalRecordSourceModes(tool);
  elements.splitInputPanel.hidden = false;
  elements.splitInputPanel.textContent = "";

  const wrapper = document.createElement("section");
  wrapper.className = "bio-record-input";
  wrapper.id = "biologicalRecordInputPanel";
  wrapper.dataset.flatfileExample = exampleParts[0] ?? "";

  const sourceCard = document.createElement("section");
  sourceCard.className = "bio-record-source-card";
  const tabs = createTabbedInputWorkflowTabs({
    document,
    modes: sourceModes,
    selectedMode: biologicalRecordSourceModeFromInputFormat(getToolOptionValue("inputFormat", "auto")),
    ariaLabel: "Biological record input type",
    className: "bio-record-source-tabs",
    tabClassName: "bio-record-source-tab",
    onSelect: (mode) => {
      setBiologicalRecordSourceMode(mode, { maybeLoadExample: true });
      clearToolOutput();
      updateToolOptionSuggestions();
    }
  });

  const pairedInputGrid = document.createElement("div");
  pairedInputGrid.className = "bio-record-paired-input-grid";
  pairedInputGrid.append(
    createBiologicalRecordInputSection({
      key: "annotation",
      panel: splitInput.panels?.[0],
      index: 0,
      value: exampleParts[0] ?? ""
    }),
    createBiologicalRecordInputSection({
      key: "fasta",
      panel: splitInput.panels?.[1],
      index: 1,
      value: exampleParts[1] ?? ""
    })
  );

  sourceCard.append(tabs, pairedInputGrid);
  wrapper.append(sourceCard);
  elements.splitInputPanel.append(wrapper);
  setBiologicalRecordSourceMode(biologicalRecordSourceModeFromInputFormat(getToolOptionValue("inputFormat", "auto")), {
    syncOption: false
  });
}

function createBiologicalRecordInputSection({ key, panel, index, value }) {
  const section = document.createElement("section");
  section.className = "split-input-section bio-record-input-section";
  section.dataset.bioRecordSection = key;
  const heading = document.createElement("div");
  heading.className = "split-input-heading";
  const title = document.createElement("h4");
  title.textContent = panel?.label ?? `Input ${index + 1}`;
  const fileLabel = document.createElement("label");
  fileLabel.className = "file-button";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = panel?.accept ?? ".txt";
  fileInput.setAttribute("aria-label", panel?.label ?? `Input ${index + 1}`);
  const fileText = document.createElement("span");
  fileText.textContent = "Choose file";
  fileLabel.append(fileInput, fileText);
  heading.append(title, fileLabel);

  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone split-drop-zone";
  dropZone.textContent = panel?.dropLabel ?? `Drop ${title.textContent} here`;
  const textarea = document.createElement("textarea");
  textarea.className = "split-input-textarea";
  textarea.dataset.splitInputIndex = String(index);
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.value = formatExampleInputForDisplay(value);
  textarea.placeholder = panel?.placeholder ?? "";

  const loadFile = async (file) => {
    if (!file) {
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
      return;
    }
    textarea.value = await readToolInputFileText(file, { onMessage: addMessage });
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions();
    addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
  };
  fileInput.addEventListener("change", async () => {
    await loadFile(fileInput.files?.[0]);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    await loadFile(event.dataTransfer.files?.[0]);
  });
  textarea.addEventListener("input", () => {
    updateInputActionButtons();
    updateToolOptionSuggestions();
  });
  section.append(heading, dropZone, textarea);
  return section;
}

function setBiologicalRecordSourceMode(mode, { syncOption = true, maybeLoadExample = false } = {}) {
  const panel = document.querySelector("#biologicalRecordInputPanel");
  if (!panel) {
    return;
  }
  const sourceModes = getBiologicalRecordSourceModes();
  const sourceMode = sourceModes[mode] ? mode : "flatfile";
  const config = sourceModes[sourceMode];
  panel.dataset.sourceMode = sourceMode;

  updateTabbedInputWorkflowTabs(panel, sourceMode, { tabSelector: ".bio-record-source-tab" });
  const annotationSection = panel.querySelector('[data-bio-record-section="annotation"]');
  const annotationTitle = annotationSection?.querySelector(".split-input-heading h4");
  const annotationInput = annotationSection?.querySelector(".split-input-textarea");
  const annotationDrop = annotationSection?.querySelector(".split-drop-zone");
  if (annotationTitle) {
    annotationTitle.textContent = config.annotationLabel;
  }
  if (annotationInput) {
    annotationInput.placeholder = config.annotationPlaceholder;
  }
  const annotationFileInput = annotationSection?.querySelector('input[type="file"]');
  if (annotationFileInput) {
    annotationFileInput.setAttribute("aria-label", config.annotationLabel);
  }
  if (annotationDrop) {
    annotationDrop.textContent = config.annotationDropLabel;
  }
  const fastaSection = panel.querySelector('[data-bio-record-section="fasta"]');
  if (fastaSection) {
    fastaSection.hidden = !config.showFasta;
  }
  if (maybeLoadExample) {
    loadBiologicalRecordModeExampleIfSafe(panel, sourceMode);
  }
  if (syncOption) {
    const currentInputFormat = getToolOptionValue("inputFormat", "auto");
    if (sourceMode === "flatfile") {
      if (
        currentInputFormat === "sequence" ||
        currentInputFormat === "gff3-fasta" ||
        currentInputFormat === "gtf-fasta" ||
        currentInputFormat === "bed-fasta"
      ) {
        setToolOptionValue("inputFormat", "auto");
      }
    } else {
      setToolOptionValue("inputFormat", config.inputFormat);
    }
  }
}

function applyWorkspaceSequenceToToolInput(tool, sequence, inputText) {
  if (!tool || !sequence || !isBiologicalRecordTabbedInputTool(tool)) {
    return false;
  }
  const panel = document.querySelector("#biologicalRecordInputPanel");
  const sourceModes = getBiologicalRecordSourceModes(tool);
  if (!panel || !sourceModes.sequence) {
    return false;
  }
  setBiologicalRecordSourceMode("sequence", { syncOption: true, maybeLoadExample: false });
  const annotationInput = panel.querySelector('[data-bio-record-section="annotation"] .split-input-textarea');
  const fastaInput = panel.querySelector('[data-bio-record-section="fasta"] .split-input-textarea');
  if (!annotationInput) {
    return false;
  }
  annotationInput.value = inputText;
  if (fastaInput) {
    fastaInput.value = "";
  }
  updateInputActionButtons();
  updateToolOptionSuggestions();
  return true;
}

function loadBiologicalRecordModeExampleIfSafe(panel, sourceMode) {
  const annotationInput = panel.querySelector('[data-bio-record-section="annotation"] .split-input-textarea');
  const fastaInput = panel.querySelector('[data-bio-record-section="fasta"] .split-input-textarea');
  if (!annotationInput || !fastaInput) {
    return;
  }
  const examples = {
    flatfile: {
      annotation: panel.dataset.flatfileExample ?? "",
      fasta: ""
    },
    ...BIOLOGICAL_RECORD_MODE_EXAMPLES
  };
  const nextExample = examples[sourceMode];
  if (!nextExample) {
    return;
  }
  const knownAnnotationExamples = Object.values(examples).map((item) => String(item.annotation ?? "").trim());
  const knownFastaExamples = Object.values(examples).map((item) => String(item.fasta ?? "").trim());
  const annotationValue = annotationInput.value.trim();
  const fastaValue = fastaInput.value.trim();
  const canReplaceAnnotation = !annotationValue || knownAnnotationExamples.includes(annotationValue);
  const canReplaceFasta = !fastaValue || knownFastaExamples.includes(fastaValue);
  if (!canReplaceAnnotation || !canReplaceFasta) {
    return;
  }
  annotationInput.value = nextExample.annotation;
  fastaInput.value = nextExample.fasta;
}

function createInSilicoPcrTextPane({
  key,
  label,
  accept = ".txt,.fa,.fasta,.fna,.ffn,.gb,.gbk,.genbank,.embl,.ddbj,.gz,.seq",
  dropLabel,
  placeholder = "",
  value = "",
  splitInputIndex = null,
  inputRole = ""
}) {
  const section = document.createElement("section");
  section.className = "split-input-section";
  section.dataset.pcrTemplatePane = key;
  const heading = document.createElement("div");
  heading.className = "split-input-heading";
  const title = document.createElement("h4");
  title.textContent = label;
  const fileLabel = document.createElement("label");
  fileLabel.className = "file-button";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = accept;
  fileInput.setAttribute("aria-label", label);
  const fileText = document.createElement("span");
  fileText.textContent = "Choose file";
  fileLabel.append(fileInput, fileText);
  heading.append(title, fileLabel);

  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone split-drop-zone";
  dropZone.textContent = dropLabel ?? `Drop ${label} here`;
  const textarea = document.createElement("textarea");
  textarea.className = "split-input-textarea";
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.value = formatExampleInputForDisplay(value);
  textarea.placeholder = placeholder;
  if (splitInputIndex !== null) {
    textarea.dataset.splitInputIndex = String(splitInputIndex);
  }
  if (inputRole) {
    textarea.dataset.pcrInput = inputRole;
  }

  const loadFile = async (file) => {
    if (!file) {
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
      return;
    }
    textarea.value = await readToolInputFileText(file, { onMessage: addMessage });
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions();
    addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
  };
  fileInput.addEventListener("change", async () => {
    await loadFile(fileInput.files?.[0]);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    await loadFile(event.dataTransfer.files?.[0]);
  });
  textarea.addEventListener("input", () => {
    updateInputActionButtons();
    updateToolOptionSuggestions();
  });

  section.append(heading, dropZone, textarea);
  return section;
}

function createInSilicoPcrPrimerSection(panel, index, value) {
  const section = createInSilicoPcrTextPane({
    key: "primers",
    label: panel?.label ?? "Primer sequences",
    accept: panel?.accept ?? ".fa,.fasta,.fa.gz,.fasta.gz,.gz,.txt,.seq",
    dropLabel: panel?.dropLabel ?? "Drop one primer sequence or FASTA records here",
    value,
    splitInputIndex: index,
    inputRole: "primers"
  });
  section.dataset.pcrInputSection = "primers";
  return section;
}

function renderInSilicoPcrInput(tool) {
  const splitInput = tool?.metadata?.splitInput;
  const panels = splitInput?.panels ?? [];
  const exampleParts = splitInputExampleParts(tool);
  const primerIndex = panels.findIndex((panel) => panel.id === "primers");
  const templateIndex = panels.findIndex((panel) => panel.id === "template");
  const resolvedPrimerIndex = primerIndex >= 0 ? primerIndex : 1;
  const resolvedTemplateIndex = templateIndex >= 0 ? templateIndex : 0;
  const primerPanel = panels[resolvedPrimerIndex] ?? { id: "primers", label: "Primer sequences" };
  const templatePanel = panels[resolvedTemplateIndex] ?? { id: "template", label: "Template sequence" };

  elements.splitInputPanel.hidden = false;
  elements.splitInputPanel.textContent = "";
  elements.splitInputPanel.append(
    createInSilicoPcrPrimerSection(primerPanel, resolvedPrimerIndex, exampleParts[resolvedPrimerIndex] ?? ""),
    createInSilicoPcrTemplateSection(templatePanel, resolvedTemplateIndex, exampleParts[resolvedTemplateIndex] ?? "")
  );
  setInSilicoPcrTemplateSourceMode("sequence", { clearOutput: false });
}

function createInSilicoPcrTemplateSection(panel, index, value) {
  const wrapper = document.createElement("section");
  wrapper.className = "bio-record-input pcr-template-input-section";
  wrapper.id = "inSilicoPcrTemplateInputPanel";
  wrapper.dataset.sourceMode = "sequence";
  wrapper.dataset.pcrInputSection = "template";

  const tabs = createTabbedInputWorkflowTabs({
    document,
    modes: IN_SILICO_PCR_TEMPLATE_SOURCE_MODES,
    selectedMode: "sequence",
    ariaLabel: "Template input type",
    className: "bio-record-source-tabs pcr-template-source-tabs",
    tabClassName: "bio-record-source-tab",
    onSelect: (mode) => setInSilicoPcrTemplateSourceMode(mode)
  });

  const sourceCard = document.createElement("section");
  sourceCard.className = "bio-record-source-card";
  const annotationPane = createInSilicoPcrTextPane({
    key: "annotation",
    label: IN_SILICO_PCR_TEMPLATE_SOURCE_MODES.sequence.annotationLabel,
    accept: panel?.accept ?? IN_SILICO_PCR_TEMPLATE_SOURCE_MODES.sequence.annotationAccept,
    dropLabel: panel?.dropLabel ?? IN_SILICO_PCR_TEMPLATE_SOURCE_MODES.sequence.annotationDropLabel,
    placeholder: IN_SILICO_PCR_TEMPLATE_SOURCE_MODES.sequence.annotationPlaceholder,
    value,
    splitInputIndex: index,
    inputRole: "template-primary"
  });
  const fastaPane = createInSilicoPcrTextPane({
    key: "fasta",
    label: "Template FASTA sequence",
    accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq",
    dropLabel: "Drop matching template FASTA records here",
    placeholder: "Paste the matching template FASTA sequence here.",
    value: "",
    splitInputIndex: index,
    inputRole: "template-fasta"
  });
  fastaPane.hidden = true;
  sourceCard.append(annotationPane, fastaPane);
  wrapper.append(tabs, sourceCard);
  return wrapper;
}

function setInSilicoPcrTemplateSourceMode(mode, { clearOutput = true } = {}) {
  const panel = document.querySelector("#inSilicoPcrTemplateInputPanel");
  if (!panel) {
    return;
  }
  const sourceMode = IN_SILICO_PCR_TEMPLATE_SOURCE_MODES[mode] ? mode : "sequence";
  const config = IN_SILICO_PCR_TEMPLATE_SOURCE_MODES[sourceMode];
  panel.dataset.sourceMode = sourceMode;
  updateTabbedInputWorkflowTabs(panel, sourceMode, { tabSelector: ".bio-record-source-tab" });

  const annotationPane = panel.querySelector('[data-pcr-template-pane="annotation"]');
  const annotationTitle = annotationPane?.querySelector(".split-input-heading h4");
  const annotationDrop = annotationPane?.querySelector(".split-drop-zone");
  const annotationInput = annotationPane?.querySelector(".split-input-textarea");
  const annotationFileInput = annotationPane?.querySelector('input[type="file"]');
  if (annotationTitle) {
    annotationTitle.textContent = config.annotationLabel;
  }
  if (annotationDrop) {
    annotationDrop.textContent = config.annotationDropLabel;
  }
  if (annotationInput) {
    annotationInput.placeholder = config.annotationPlaceholder;
  }
  if (annotationFileInput) {
    annotationFileInput.accept = config.annotationAccept ?? ".txt";
    annotationFileInput.setAttribute("aria-label", config.annotationLabel);
  }

  const fastaPane = panel.querySelector('[data-pcr-template-pane="fasta"]');
  const fastaTitle = fastaPane?.querySelector(".split-input-heading h4");
  const fastaDrop = fastaPane?.querySelector(".split-drop-zone");
  const fastaInput = fastaPane?.querySelector(".split-input-textarea");
  const fastaFileInput = fastaPane?.querySelector('input[type="file"]');
  if (fastaPane) {
    fastaPane.hidden = !config.showFasta;
  }
  if (fastaTitle) {
    fastaTitle.textContent = config.fastaLabel ?? "Template FASTA sequence";
  }
  if (fastaDrop) {
    fastaDrop.textContent = config.fastaDropLabel ?? "Drop matching template FASTA records here";
  }
  if (fastaInput) {
    fastaInput.placeholder = config.fastaPlaceholder ?? "";
  }
  if (fastaFileInput) {
    fastaFileInput.setAttribute("aria-label", config.fastaLabel ?? "Template FASTA sequence");
  }
  if (clearOutput) {
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions();
  }
}

function getInSilicoPcrInputText() {
  const separator = state.selectedTool?.metadata?.splitInput?.separator ?? "---";
  const panel = document.querySelector("#inSilicoPcrTemplateInputPanel");
  const mode = panel?.dataset.sourceMode ?? "sequence";
  const template = IN_SILICO_PCR_TEMPLATE_SOURCE_MODES[mode]?.showFasta
    ? (panel?.querySelector('[data-pcr-input="template-fasta"]')?.value ?? "")
    : (panel?.querySelector('[data-pcr-input="template-primary"]')?.value ?? "");
  const primers = elements.splitInputPanel.querySelector('[data-pcr-input="primers"]')?.value ?? "";
  return [template, primers].join(`\n${separator}\n`);
}

function updateBiologicalRecordFormatConverterInputUi() {
  if (!isBiologicalRecordTabbedInputTool()) {
    return;
  }
  setBiologicalRecordSourceMode(biologicalRecordSourceModeFromInputFormat(getToolOptionValue("inputFormat", "auto")), {
    syncOption: false,
    maybeLoadExample: true
  });
}

function getBiologicalRecordFormatConverterInputText() {
  const panel = document.querySelector("#biologicalRecordInputPanel");
  if (!panel) {
    return "";
  }
  const sourceMode = panel.dataset.sourceMode ?? "flatfile";
  const annotation = panel.querySelector('[data-bio-record-section="annotation"] .split-input-textarea')?.value ?? "";
  const sourceModes = getBiologicalRecordSourceModes();
  if (sourceMode === "flatfile" || sourceModes[sourceMode]?.showFasta === false) {
    return annotation;
  }
  const fasta = panel.querySelector('[data-bio-record-section="fasta"] .split-input-textarea')?.value ?? "";
  const separator = state.selectedTool?.metadata?.splitInput?.separator ?? "##FASTA";
  return [annotation, fasta].join(`\n${separator}\n`);
}

function isPcrPrimerDesignTool(tool = state.selectedTool) {
  return tool?.metadata?.id === PCR_PRIMER_DESIGN_TOOL_ID;
}

function isInSilicoPcrTool(tool = state.selectedTool) {
  return tool?.metadata?.id === IN_SILICO_PCR_TOOL_ID;
}

function isSamBamSummaryRegionViewerTool(tool = state.selectedTool) {
  return tool?.metadata?.id === SAM_BAM_SUMMARY_REGION_VIEWER_TOOL_ID;
}

function isVcfExtractorTool(tool = state.selectedTool) {
  return tool?.metadata?.id === VCF_EXTRACTOR_TOOL_ID;
}

function isVcfTabbedInputTool(tool = state.selectedTool) {
  return tool?.metadata?.id === VCF_EXTRACTOR_TOOL_ID
    || tool?.metadata?.id === VCF_FILTER_TOOL_ID;
}

function isAlignmentViewerTool(tool = state.selectedTool) {
  return tool?.metadata?.id === ALIGNMENT_VIEWER_TOOL_ID;
}

function isFastaRegionExtractorTool(tool = state.selectedTool) {
  return tool?.metadata?.id === FASTA_REGION_EXTRACTOR_TOOL_ID;
}

function isFastaSourceTabbedTool(tool = state.selectedTool) {
  if (!tool || isFastaRegionExtractorTool(tool)) {
    return false;
  }
  return flattenOptions(tool.metadata?.options ?? [])
    .some((option) => option.id === "sourceMode" && option.placement === "input");
}

function isReadMappingCoverageTool(tool = state.selectedTool) {
  return tool?.metadata?.id === READ_MAPPING_COVERAGE_TOOL_ID;
}

function isProteinStructureViewerTool(tool = state.selectedTool) {
  return tool?.metadata?.id === PROTEIN_STRUCTURE_VIEWER_TOOL_ID;
}

function isProteinConservationStructureViewerTool(tool = state.selectedTool) {
  return tool?.metadata?.id === PROTEIN_CONSERVATION_STRUCTURE_VIEWER_TOOL_ID;
}

function isSangerTraceViewerTool(tool = state.selectedTool) {
  return tool?.metadata?.splitInput?.customRenderer === "sanger-trace-workspace";
}

function isTabbedInputWorkflowTool(tool = state.selectedTool) {
  return [
    BIOLOGICAL_RECORD_FORMAT_CONVERTER_TOOL_ID,
    ANNOTATED_DNA_RECORD_EXTRACTOR_TOOL_ID,
    LINEAR_DNA_SEQUENCE_VIEWER_TOOL_ID,
    CIRCULAR_DNA_SEQUENCE_VIEWER_TOOL_ID,
    GENOME_FIGURE_TOOL_ID,
    CIRCULAR_GENOME_FIGURE_TOOL_ID,
    LINEAR_GENOME_FIGURE_TOOL_ID,
    SEQUENCE_EDITOR_TOOL_ID,
    SAM_BAM_SUMMARY_REGION_VIEWER_TOOL_ID,
    VCF_EXTRACTOR_TOOL_ID,
    VCF_FILTER_TOOL_ID,
    ALIGNMENT_VIEWER_TOOL_ID,
    ...(isFastaSourceTabbedTool(tool) ? [tool.metadata.id] : []),
    FASTA_REGION_EXTRACTOR_TOOL_ID
  ].includes(tool?.metadata?.id);
}

const indexedInputPanels = createIndexedInputPanelsController({
  elements,
  isSamBamSummaryRegionViewerTool,
  isVcfExtractorTool,
  isVcfTabbedInputTool,
  isFastaSourceTabbedTool,
  isFastaRegionExtractorTool,
  getSelectedTool: () => state.selectedTool,
  getToolOptionValue,
  setToolOptionValue,
  dispatchToolOptionChange,
  setFileOptionFiles,
  readToolInputFileText,
  loadInputFile,
  clearToolOutput,
  updateToolOptionSuggestions,
  flattenOptions,
  pluralize
});

function updateSamBamInputModeUi() {
  indexedInputPanels.updateSamBamInputModeUi();
}

function updateVcfInputModeUi() {
  indexedInputPanels.updateVcfInputModeUi();
}

function updateFastaSourceInputUi() {
  indexedInputPanels.updateFastaSourceInputUi();
}

function updateFastaRegionExtractorSourceUi() {
  indexedInputPanels.updateFastaRegionExtractorSourceUi();
}

function setFastaRegionSourceMode(mode) {
  indexedInputPanels.setFastaRegionSourceMode(mode);
}

function setToolOptionValue(optionId, value) {
  const root = elements.toolOptions;
  const select = root.querySelector(`select[name="${optionId}"]`);
  if (select) {
    select.value = String(value);
    return;
  }
  const checkedRadio = root.querySelector(`input[name="${optionId}"][value="${value}"]`);
  if (checkedRadio) {
    checkedRadio.checked = true;
    return;
  }
  const control = root.querySelector(`#${optionId}, [name="${optionId}"]`);
  if (!control) {
    return;
  }
  if (control.type === "checkbox") {
    control.checked = Boolean(value);
    return;
  }
  control.value = String(value ?? "");
}

function dispatchToolOptionChange(optionId) {
  const root = elements.toolOptions;
  const control = root.querySelector(`select[name="${optionId}"]`) ??
    root.querySelector(`input[name="${optionId}"]:checked`) ??
    root.querySelector(`#${optionId}, [name="${optionId}"]`);
  if (!control) {
    return false;
  }
  control.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function getToolOptionValue(optionId, fallback = "") {
  const root = elements.toolOptions;
  return root.querySelector(`select[name="${optionId}"]`)?.value ??
    root.querySelector(`input[name="${optionId}"]:checked`)?.value ??
    root.querySelector(`#${optionId}, [name="${optionId}"]`)?.value ??
    fallback;
}

function setPcrPrimerDesignConstraintDetailsOpen(open) {
  for (const id of PCR_PRIMER_CONSTRAINT_DETAIL_IDS) {
    const details = elements.toolOptions.querySelector(`details[data-option-id="${id}"]`);
    if (details) {
      details.open = open;
    }
  }
}

function openPcrPrimerDesignConstraintDetails() {
  setPcrPrimerDesignConstraintDetailsOpen(true);
}

function closePcrPrimerDesignConstraintDetails() {
  setPcrPrimerDesignConstraintDetailsOpen(false);
}

function applyPcrPrimerDesignPreset(presetId) {
  if (presetId === "custom") {
    openPcrPrimerDesignConstraintDetails();
    return;
  }
  const preset = PCR_PRIMER_DESIGN_PRESETS[presetId];
  if (!preset) {
    return;
  }
  for (const [optionId, value] of Object.entries(preset.values)) {
    setToolOptionValue(optionId, value);
  }
  closePcrPrimerDesignConstraintDetails();
}

function getPcrPrimerDesignSummaryValues() {
  return {
    designPreset: getToolOptionValue("designPreset", "custom"),
    minProductLength: getToolOptionValue("minProductLength", "200"),
    maxProductLength: getToolOptionValue("maxProductLength", "800"),
    primerMinLength: getToolOptionValue("primerMinLength", "18"),
    primerMaxLength: getToolOptionValue("primerMaxLength", "24"),
    primerOptTm: getToolOptionValue("primerOptTm", "60"),
    primerMinGc: getToolOptionValue("primerMinGc", "40"),
    primerMaxGc: getToolOptionValue("primerMaxGc", "60"),
    targetRegion: getToolOptionValue("targetRegion", ""),
    excludedRegions: getToolOptionValue("excludedRegions", "")
  };
}

function updatePcrPrimerDesignSummary() {
  const summary = elements.toolOptions.querySelector('[data-option-id="designSummary"] [data-summary-text]');
  if (summary) {
    summary.textContent = formatPcrPrimerDesignSummary(getPcrPrimerDesignSummaryValues());
  }
}

function updatePcrPrimerDesignUi({ applyPreset = false } = {}) {
  if (!isPcrPrimerDesignTool()) {
    return;
  }
  if (applyPreset) {
    applyPcrPrimerDesignPreset(getToolOptionValue("designPreset", "custom"));
  }
  updatePcrPrimerDesignSummary();
}

function getSelectedToolInputText() {
  const splitInput = state.selectedTool?.metadata?.splitInput;
  if (!toolRequiresInput(state.selectedTool)) {
    return "";
  }
  const workspaceInputText = workspaceInputSources.getToolInputText(state.selectedTool);
  if (workspaceInputText !== null) {
    return workspaceInputText;
  }
  if (!splitInput) {
    return elements.sequenceInput.value;
  }
  if (isBiologicalRecordTabbedInputTool()) {
    return getBiologicalRecordFormatConverterInputText();
  }
  if (isSangerTraceViewerTool()) {
    return sangerTraceWorkspace.getInputText();
  }
  if (isAlignmentViewerTool()) {
    return getAlignmentViewerInputText();
  }
  if (isReadMappingCoverageTool()) {
    return getReadMappingCoverageInputText();
  }
  if (isInSilicoPcrTool()) {
    return getInSilicoPcrInputText();
  }
  const separator = splitInput.separator ?? "---";
  return [...elements.splitInputPanel.querySelectorAll(".split-input-textarea")]
    .sort((left, right) => Number(left.dataset.splitInputIndex) - Number(right.dataset.splitInputIndex))
    .map((textarea) => textarea.value)
    .join(`\n${separator}\n`);
}

function getReadMappingCoverageInputText() {
  const separator = state.selectedTool?.metadata?.splitInput?.separator ?? "---";
  const referenceMode = elements.splitInputPanel
    .querySelector('input[name="readMappingReferenceSource"]:checked')?.value ?? "sequence";
  const reference = getReadMappingCoverageReferenceInputText(referenceMode);
  const readLayout = elements.splitInputPanel.querySelector('input[name="readLayout"]:checked')?.value === "paired"
    ? "paired"
    : "single";
  const reads = readLayout === "paired"
    ? [
        elements.splitInputPanel.querySelector('[data-read-mapping-input="reads-r1"]')?.value ?? "",
        elements.splitInputPanel.querySelector('[data-read-mapping-input="reads-r2"]')?.value ?? ""
      ].filter((value) => value.trim().length > 0).join("\n")
    : elements.splitInputPanel.querySelector('[data-read-mapping-input="reads-single"]')?.value ?? "";
  return [reference, reads].join(`\n${separator}\n`);
}

function getReadMappingCoverageReferenceInputText(referenceMode) {
  const valueFor = (key) => elements.splitInputPanel.querySelector(`[data-read-mapping-input="${key}"]`)?.value ?? "";
  if (referenceMode === "flatfile") {
    return valueFor("reference-flatfile");
  }
  if (referenceMode === "gff3-fasta") {
    return [valueFor("reference-gff3-annotation"), valueFor("reference-gff3-fasta")]
      .filter((value) => value.trim().length > 0)
      .join("\n##FASTA\n");
  }
  if (referenceMode === "gtf-fasta") {
    return [valueFor("reference-gtf-annotation"), valueFor("reference-gtf-fasta")]
      .filter((value) => value.trim().length > 0)
      .join("\n##FASTA\n");
  }
  if (referenceMode === "bed-fasta") {
    return [valueFor("reference-bed-annotation"), valueFor("reference-bed-fasta")]
      .filter((value) => value.trim().length > 0)
      .join("\n##FASTA\n");
  }
  return valueFor("reference");
}

function renderToolOptions(...args) {
  return toolOptionsUi.renderToolOptions(...args);
}

function shouldAppendGeneratedLimitDisclosure(...args) {
  return toolOptionsUi.shouldAppendGeneratedLimitDisclosure(...args);
}

function isTopLevelToolLimitGroup(...args) {
  return toolOptionsUi.isTopLevelToolLimitGroup(...args);
}

function optionTreeIncludesId(...args) {
  return toolOptionsUi.optionTreeIncludesId(...args);
}

function createGeneratedLimitDisclosure(...args) {
  return toolOptionsUi.createGeneratedLimitDisclosure(...args);
}

function getSuggestionSourcesForOptions(...args) {
  return toolOptionsUi.getSuggestionSourcesForOptions(...args);
}

function shouldRenderToolOption(...args) {
  return toolOptionsUi.shouldRenderToolOption(...args);
}

function getSuggestionListId(...args) {
  return toolOptionsUi.getSuggestionListId(...args);
}

function getSplitInputTextAt(index) {
  const splitTextareas = [...elements.splitInputPanel.querySelectorAll(".split-input-textarea")]
    .filter((textarea) => !textarea.closest("[hidden]"));
  return splitTextareas[index]?.value ?? "";
}

function getProteinStructureSuggestionInput() {
  return getSplitInputTextAt(0) || getSelectedToolInputText();
}

function getProteinStructureSuggestionSummary({ useSelectedModel = false } = {}) {
  const text = getProteinStructureSuggestionInput();
  if (!text.trim() || text.length > PROTEIN_STRUCTURE_SUGGESTION_CHAR_LIMIT) {
    return null;
  }
  const format = elements.toolOptions.querySelector("#format")?.value ?? "auto";
  const altLocationPolicy = elements.toolOptions.querySelector("#altLocationPolicy")?.value ?? "preferred";
  const requestedModel = useSelectedModel
    ? (elements.toolOptions.querySelector("#modelSelection")?.value.trim() || "all")
    : "all";
  try {
    return summarizeProteinStructure(text, {
      format,
      modelSelection: requestedModel,
      chainSelection: "all",
      altLocationPolicy
    });
  } catch {
    if (!useSelectedModel) {
      return null;
    }
    try {
      return summarizeProteinStructure(text, {
        format,
        modelSelection: "all",
        chainSelection: "all",
        altLocationPolicy
      });
    } catch {
      return null;
    }
  }
}

function getProteinStructureModelSuggestions() {
  const summary = getProteinStructureSuggestionSummary({ useSelectedModel: false });
  if (!summary) {
    return [];
  }
  const models = (summary.availableModels ?? []).map((model) => String(model));
  return [...new Set(["first", "all", ...models])];
}

function getProteinStructureChainSuggestions(source) {
  const summary = getProteinStructureSuggestionSummary({ useSelectedModel: true });
  if (!summary) {
    return [];
  }
  const first = source === "protein-structure-chains-auto" ? "auto" : "all";
  return [...new Set([first, ...(summary.availableChains ?? [])])];
}

function removeProteinStructureInputSummaryPanel() {
  document.querySelector("#proteinStructureInputSummary")?.remove();
  document.querySelector("#proteinStructureChainControl")?.remove();
  elements.toolOptions
    ?.querySelector('[data-option-id="chainSelection"]')
    ?.classList.remove("protein-structure-hidden-option");
}

function removeProteinStructureInputSummaryOnly() {
  document.querySelector("#proteinStructureInputSummary")?.remove();
}

function replaceProteinStructureSelectOptions(select, choices, preferredValue) {
  if (!select) {
    return "";
  }
  const previous = preferredValue ?? select.value;
  select.textContent = "";
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  const fallback = choices[0]?.value ?? "";
  select.value = choices.some((choice) => choice.value === previous) ? previous : fallback;
  return select.value;
}

function updateProteinStructureModelSelect(summary) {
  const select = elements.toolOptions.querySelector("#modelSelection");
  if (!select) {
    return;
  }
  const choices = [
    { value: "first", label: "First model" },
    { value: "all", label: "All models" },
    ...((summary?.availableModels ?? []).map((model) => ({
      value: String(model),
      label: `Model ${model}`
    })))
  ];
  replaceProteinStructureSelectOptions(select, choices, select.value || "first");
}

function updateProteinStructureAssemblySelect(summary) {
  const select = elements.toolOptions.querySelector("#biologicalAssembly");
  if (!select) {
    return;
  }
  const choices = [
    { value: "asymmetric", label: "Asymmetric unit" },
    ...((summary?.availableBiologicalAssemblies ?? []).map((assembly) => ({
      value: String(assembly),
      label: `Biological assembly ${assembly}`
    })))
  ];
  replaceProteinStructureSelectOptions(select, choices, select.value || "asymmetric");
}

function parseProteinStructureChainSelection(value) {
  const text = String(value ?? "all").trim();
  if (!text || /^all(?: chains)?$/i.test(text)) {
    return { all: true, selected: new Set() };
  }
  return {
    all: false,
    selected: new Set(text.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean))
  };
}

function syncProteinStructureChainInput(panel) {
  const hiddenInput = elements.toolOptions.querySelector("#chainSelection");
  if (!hiddenInput) {
    return;
  }
  const all = panel.querySelector("#proteinStructureChainAll");
  const chainInputs = [...panel.querySelectorAll(".protein-structure-chain-option input")];
  if (all?.checked || chainInputs.length === 0) {
    hiddenInput.value = "all";
    chainInputs.forEach((input) => {
      input.checked = true;
    });
    return;
  }
  const selected = chainInputs.filter((input) => input.checked).map((input) => input.value);
  if (selected.length === 0) {
    hiddenInput.value = "all";
    if (all) {
      all.checked = true;
    }
    chainInputs.forEach((input) => {
      input.checked = true;
    });
  } else if (selected.length === chainInputs.length) {
    hiddenInput.value = "all";
    if (all) {
      all.checked = true;
    }
  } else {
    hiddenInput.value = selected.join(",");
  }
}

function handleProteinStructureChainControlChange(target) {
  const panel = target?.closest?.("#proteinStructureChainControl");
  if (!panel) {
    return false;
  }
  const allInput = panel.querySelector("#proteinStructureChainAll");
  const chainInputs = [...panel.querySelectorAll(".protein-structure-chain-option input")];
  if (target === allInput && allInput.checked) {
    chainInputs.forEach((input) => {
      input.checked = true;
    });
  } else if (target?.matches?.(".protein-structure-chain-option input")) {
    if (allInput && !target.checked) {
      allInput.checked = false;
    }
    if (allInput && chainInputs.length > 0 && chainInputs.every((input) => input.checked)) {
      allInput.checked = true;
    }
  }
  syncProteinStructureChainInput(panel);
  clearToolOutput();
  return true;
}

function queueProteinStructureChainControlUpdate(target) {
  const panel = target?.closest?.("#proteinStructureChainControl");
  if (!panel) {
    return false;
  }
  handleProteinStructureChainControlChange(target);
  updateToolOptionSuggestions();
  updateProteinStructureViewerUi();
  return true;
}

function renderProteinStructureChainControl(summary) {
  const chainRow = elements.toolOptions.querySelector('[data-option-id="chainSelection"]');
  const hiddenInput = elements.toolOptions.querySelector("#chainSelection");
  if (!chainRow || !hiddenInput) {
    return;
  }
  chainRow.classList.add("protein-structure-hidden-option");
  let panel = document.querySelector("#proteinStructureChainControl");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "proteinStructureChainControl";
    panel.className = "protein-structure-chain-control";
    chainRow.after(panel);
  }
  panel.textContent = "";
  const header = document.createElement("div");
  header.className = "protein-structure-chain-heading";
  const title = document.createElement("strong");
  title.textContent = "Chains";
  const help = document.createElement("span");
  help.textContent = summary
    ? "Select all chains or choose individual chains from the selected model."
    : "Chain choices appear after SMS3 parses the structure.";
  header.append(title, help);
  panel.append(header);

  const chains = summary?.availableChains ?? [];
  const selection = parseProteinStructureChainSelection(hiddenInput.value);
  const allLabel = document.createElement("label");
  allLabel.className = "protein-structure-chain-all";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.id = "proteinStructureChainAll";
  allInput.checked = selection.all || chains.length === 0;
  allLabel.append(allInput, " All chains");
  panel.append(allLabel);

  const list = document.createElement("div");
  list.className = "protein-structure-chain-list";
  for (const chain of chains) {
    const label = document.createElement("label");
    label.className = "protein-structure-chain-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = chain;
    input.checked = selection.all || selection.selected.has(chain);
    label.append(input, ` Chain ${chain}`);
    input.addEventListener("change", () => {
      if (allInput.checked && !input.checked) {
        allInput.checked = false;
      }
      syncProteinStructureChainInput(panel);
      clearToolOutput();
    });
    list.append(label);
  }
  if (chains.length === 0) {
    const empty = document.createElement("p");
    empty.className = "protein-structure-chain-empty";
    empty.textContent = "No chains detected yet.";
    list.append(empty);
  }
  allInput.addEventListener("change", () => {
    if (allInput.checked) {
      list.querySelectorAll("input").forEach((input) => {
        input.checked = true;
      });
    }
    syncProteinStructureChainInput(panel);
    clearToolOutput();
  });
  panel.append(list);
  syncProteinStructureChainInput(panel);
}

function updateProteinStructureViewerUi() {
  const isStructureViewer = isProteinStructureViewerTool();
  const isConservationViewer = isProteinConservationStructureViewerTool();
  if (!isStructureViewer && !isConservationViewer) {
    removeProteinStructureInputSummaryPanel();
    return;
  }
  const text = getProteinStructureSuggestionInput();
  removeProteinStructureInputSummaryOnly();
  if (!text.trim()) {
    updateProteinStructureModelSelect(null);
    updateProteinStructureAssemblySelect(null);
    if (isStructureViewer) {
      renderProteinStructureChainControl(null);
    } else {
      document.querySelector("#proteinStructureChainControl")?.remove();
    }
    return;
  }
  if (text.length > PROTEIN_STRUCTURE_SUGGESTION_CHAR_LIMIT) {
    updateProteinStructureModelSelect(null);
    updateProteinStructureAssemblySelect(null);
    if (isStructureViewer) {
      renderProteinStructureChainControl(null);
    } else {
      document.querySelector("#proteinStructureChainControl")?.remove();
    }
    return;
  }
  let fullSummary = null;
  try {
    fullSummary = getProteinStructureSuggestionSummary({ useSelectedModel: false });
  } catch {
    fullSummary = null;
  }
  updateProteinStructureModelSelect(fullSummary);
  updateProteinStructureAssemblySelect(fullSummary);
  const chainSummary = getProteinStructureSuggestionSummary({ useSelectedModel: true }) ?? fullSummary;
  if (isStructureViewer) {
    renderProteinStructureChainControl(chainSummary);
  } else {
    document.querySelector("#proteinStructureChainControl")?.remove();
  }
}

function getProteinAlignmentRowSuggestions() {
  const alignmentText = getSplitInputTextAt(1);
  const text = alignmentText || getSelectedToolInputText().split(/\n---\n/).slice(1).join("\n---\n");
  const titles = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith(">")) {
      titles.push(line.slice(1).trim());
    }
  }
  return [...new Set(["auto", ...titles.filter(Boolean)])];
}

function getVcfChromosomeSuggestions() {
  if (isVcfTabbedInputTool()) {
    const customSuggestions = elements.inputPanel
      .querySelector("#vcfInputModePanel")
      ?.dataset.contigSuggestions;
    if (customSuggestions) {
      return customSuggestions.split("\n").filter(Boolean);
    }
  }
  return summarizeVcfFromText(getSelectedToolInputText())
    .contigs
    .map((contig) => contig.id);
}

function getVcfSampleSuggestions() {
  if (!isVcfTabbedInputTool()) {
    return [];
  }
  const customSuggestions = elements.inputPanel
    .querySelector("#vcfInputModePanel")
    ?.dataset.sampleSuggestions;
  if (customSuggestions) {
    return customSuggestions.split("\n").filter(Boolean);
  }
  return summarizeVcfFromText(getSelectedToolInputText()).samples;
}

function getVcfGeneSuggestions() {
  if (!isVcfTabbedInputTool()) {
    return [];
  }
  const customSuggestions = elements.inputPanel
    .querySelector("#vcfInputModePanel")
    ?.dataset.geneSuggestions;
  if (customSuggestions) {
    return customSuggestions.split("\n").filter(Boolean);
  }
  return summarizeVcfFromText(getSelectedToolInputText()).genes ?? [];
}

function getSamBamReferenceSuggestions() {
  if (!isSamBamSummaryRegionViewerTool() && !isAlignmentViewerTool()) {
    return [];
  }
  const customSuggestions = elements.inputPanel
    .querySelector("#samBamInputModePanel, #alignmentViewerInputPanel")
    ?.dataset.referenceSuggestions;
  if (customSuggestions) {
    return customSuggestions.split("\n").filter(Boolean);
  }
  return summarizeSamReferencesFromText(getSelectedToolInputText())
    .references
    .map((reference) => reference.name);
}

function getTableInputTextsForSuggestionSource(source) {
  const splitTextareas = [...elements.splitInputPanel.querySelectorAll(".split-input-textarea")]
    .filter((textarea) => !textarea.closest("[hidden]"));
  if (splitTextareas.length > 0) {
    if (source === "table-left-columns") {
      return [splitTextareas[0]?.value ?? ""];
    }
    if (source === "table-right-columns") {
      return [splitTextareas[1]?.value ?? ""];
    }
    return splitTextareas.map((textarea) => textarea.value);
  }
  return [getSelectedToolInputText()];
}

function getTableColumnSuggestions(source = "table-columns") {
  const inputTexts = getTableInputTextsForSuggestionSource(source);
  const delimiterChoice = elements.toolOptions.querySelector("#delimiter")?.value ?? "auto";
  const hasHeader = elements.toolOptions.querySelector("#hasHeader")?.checked !== false;
  return getTableColumnSuggestionsFromTexts(inputTexts, { source, delimiterChoice, hasHeader });
}

function autofillSuggestedOptionValues(suggestionsBySource, { force = false } = {}) {
  const options = flattenOptions(state.selectedTool?.metadata?.options ?? []);
  for (const option of options) {
    const source = option.suggestionsFrom;
    if (!source || !source.startsWith("table-")) {
      continue;
    }
    const suggestions = suggestionsBySource.get(source) ?? [];
    if (suggestions.length === 0 || option.type !== "text") {
      continue;
    }
    const input = elements.toolOptions.querySelector(`#${option.id}`);
    if (!input) {
      continue;
    }
    const current = String(input.value ?? "").trim();
    const defaultValue = String(option.defaultValue ?? "").trim();
    const canAutofill =
      force ||
      current === "" ||
      input.dataset.autofilledColumn === "true" ||
      (defaultValue !== "" && current === defaultValue && !optionCurrentValueMatchesSuggestion(current, suggestions));
    if (!canAutofill) {
      continue;
    }
    const suggested = chooseSuggestedColumnForOption(option, suggestions);
    if (suggested && current !== suggested) {
      input.value = suggested;
      input.dataset.autofilledColumn = "true";
    }
  }
}

function updateToolOptionSuggestions({ autofillColumns = false, forceAutofillColumns = false } = {}) {
  const suggestionsBySource = new Map();
  for (const source of ["table-columns", "table-numeric-columns", "table-left-columns", "table-right-columns"]) {
    const datalist = elements.toolOptions.querySelector(`#${getSuggestionListId(source)}`);
    const columns = getTableColumnSuggestions(source);
    suggestionsBySource.set(source, columns);
    if (datalist) {
      datalist.replaceChildren(...columns.map((column) => {
        const option = document.createElement("option");
        option.value = column;
        return option;
      }));
    }
  }
  if (autofillColumns) {
    autofillSuggestedOptionValues(suggestionsBySource, { force: forceAutofillColumns });
  }
  const chromosomeDatalist = elements.toolOptions.querySelector("#vcfChromosomeSuggestions");
  if (chromosomeDatalist) {
    const chromosomes = getVcfChromosomeSuggestions();
    chromosomeDatalist.replaceChildren(
      ...chromosomes.map((chromosome) => {
        const option = document.createElement("option");
        option.value = chromosome;
        return option;
      })
    );
  }
  const vcfSampleDatalist = elements.toolOptions.querySelector("#vcfSampleSuggestions");
  if (vcfSampleDatalist) {
    const samples = getVcfSampleSuggestions();
    vcfSampleDatalist.replaceChildren(
      ...samples.map((sample) => {
        const option = document.createElement("option");
        option.value = sample;
        return option;
      })
    );
  }
  const vcfGeneDatalist = elements.toolOptions.querySelector("#vcfGeneSuggestions");
  if (vcfGeneDatalist) {
    const genes = getVcfGeneSuggestions();
    vcfGeneDatalist.replaceChildren(
      ...genes.map((gene) => {
        const option = document.createElement("option");
        option.value = gene;
        return option;
      })
    );
  }
  const samBamReferenceDatalist = elements.toolOptions.querySelector("#samBamReferenceSuggestions");
  if (samBamReferenceDatalist) {
    const references = getSamBamReferenceSuggestions();
    samBamReferenceDatalist.replaceChildren(
      ...references.map((reference) => {
        const option = document.createElement("option");
        option.value = reference;
        return option;
      })
    );
  }
  for (const source of [
    "protein-structure-models",
    "protein-structure-chains",
    "protein-structure-chains-auto",
    "protein-alignment-rows"
  ]) {
    const datalist = elements.toolOptions.querySelector(`#${getSuggestionListId(source)}`);
    if (!datalist) {
      continue;
    }
    const values = source === "protein-structure-models"
      ? getProteinStructureModelSuggestions()
      : source === "protein-alignment-rows"
        ? getProteinAlignmentRowSuggestions()
        : getProteinStructureChainSuggestions(source);
    datalist.replaceChildren(
      ...values.map((value) => {
        const option = document.createElement("option");
        option.value = value;
        return option;
      })
    );
  }
}

function serializeRuleListControl(...args) {
  return toolOptionsUi.serializeRuleListControl(...args);
}

function serializeValueListControl(...args) {
  return toolOptionsUi.serializeValueListControl(...args);
}

function parseRuleListValue(...args) {
  return toolOptionsUi.parseRuleListValue(...args);
}

function parseValueListValue(...args) {
  return toolOptionsUi.parseValueListValue(...args);
}

function appendValueListRow(...args) {
  return toolOptionsUi.appendValueListRow(...args);
}

function appendValueListControl(...args) {
  return toolOptionsUi.appendValueListControl(...args);
}

function appendRuleListRow(...args) {
  return toolOptionsUi.appendRuleListRow(...args);
}

function appendRuleListControl(...args) {
  return toolOptionsUi.appendRuleListControl(...args);
}

function appendToolOptionControl(...args) {
  return toolOptionsUi.appendToolOptionControl(...args);
}

function appendOptionReferenceTable(...args) {
  return toolOptionsUi.appendOptionReferenceTable(...args);
}

function updateFileOptionStatus(...args) {
  return toolOptionsUi.updateFileOptionStatus(...args);
}

function setFileOptionFiles(...args) {
  return toolOptionsUi.setFileOptionFiles(...args);
}

function createOptionLabelContent(...args) {
  return toolOptionsUi.createOptionLabelContent(...args);
}

function positionOptionHelpPopover(...args) {
  return toolOptionsUi.positionOptionHelpPopover(...args);
}

function flattenOptions(...args) {
  return toolOptionsUi.flattenOptions(...args);
}

function flattenOptionNodes(...args) {
  return toolOptionsUi.flattenOptionNodes(...args);
}

function normalizeVisibleWhenConditions(...args) {
  return toolOptionsUi.normalizeVisibleWhenConditions(...args);
}

function visibleWhenMatches(...args) {
  return toolOptionsUi.visibleWhenMatches(...args);
}

function getVisibleWhenOptionIds(...args) {
  return toolOptionsUi.getVisibleWhenOptionIds(...args);
}

function getDefaultOptionValues(...args) {
  return toolOptionsUi.getDefaultOptionValues(...args);
}

function getOptionDefaultValue(...args) {
  return toolOptionsUi.getOptionDefaultValue(...args);
}

function getOptionControlValue(...args) {
  return toolOptionsUi.getOptionControlValue(...args);
}

function persistLimitOptionControlValue(...args) {
  return toolOptionsUi.persistLimitOptionControlValue(...args);
}

function getCurrentOptionValues(...args) {
  return toolOptionsUi.getCurrentOptionValues(...args);
}

function getFilteredChoices(...args) {
  return toolOptionsUi.getFilteredChoices(...args);
}

function populateDependentSelect(...args) {
  return toolOptionsUi.populateDependentSelect(...args);
}

function normalizeDependentOptionValues(...args) {
  return toolOptionsUi.normalizeDependentOptionValues(...args);
}

function wireDependentToolOptions(...args) {
  return toolOptionsUi.wireDependentToolOptions(...args);
}

function restoreCurrentToolDefaults() {
  renderToolOptions(state.selectedTool.metadata.options ?? []);
  renderInputPlacementOptions(state.selectedTool);
  wireDependentToolOptions(state.selectedTool.metadata.options ?? []);
  updateSamBamInputModeUi();
  updateVcfInputModeUi();
  updateAlignmentViewerInputUi();
  updateFastaSourceInputUi();
  updateFastaRegionExtractorSourceUi();
  updateProteinStructureViewerUi();
  sangerTraceWorkspace.update();
  if (isReadMappingCoverageTool()) {
    setReadMappingCoverageReadLayout("single");
  }
  updatePcrPrimerDesignUi();
  updateMarkdownInputUi();
  clearToolOutput();
}

function makeMailtoLink(template) {
  const body = `${template.body}

SMS3 version: ${elements.appVersion.textContent || "unknown"}
Current page: ${window.location.href}
Public site: ${siteConfig.publicUrl}
`;
  return `mailto:${siteConfig.feedbackEmail}?subject=${encodeURIComponent(template.subject)}&body=${encodeURIComponent(body)}`;
}

function makeToolFeedbackLink(metadata) {
  const subject = `SMS3 tool feedback: ${metadata.name}`;
  const body = `Tool: ${metadata.name}
Tool id: ${metadata.id}

What would you like to share?

Feedback, request, or issue:

Relevant options, steps, browser, or operating system:

For incorrect output or a bug, what did you expect?

Do not include private sequence, table, or output content unless you intentionally choose to add it.

SMS3 version: ${elements.appVersion.textContent || "unknown"}
Current page: ${window.location.href}
Public site: ${siteConfig.publicUrl}
`;
  return `mailto:${siteConfig.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function renderFeedbackTemplates() {
  elements.feedbackTemplates.textContent = "";
  const note = document.createElement("p");
  note.className = "summary feedback-config-note";
  note.textContent =
    `Feedback mail opens to ${siteConfig.feedbackEmail}. Planned public URL: ${siteConfig.publicUrl}. ` +
    `${siteConfig.analytics.provider} analytics is ${siteConfig.analytics.status}; ${siteConfig.analytics.note}`;
  elements.feedbackTemplates.append(note);

  for (const template of feedbackTemplates) {
    const link = document.createElement("a");
    link.className = "feedback-template";
    link.href = makeMailtoLink(template);

    const title = document.createElement("strong");
    title.textContent = template.title;

    const summary = document.createElement("span");
    summary.textContent = template.summary;

    link.append(title, summary);
    elements.feedbackTemplates.append(link);
  }
}

function loadAppVersion() {
  elements.appVersion.textContent = appVersion ? `v${appVersion}` : "";
}

function renderSelectedReference() {
  referencePage.renderSelectedReference();
}

function getOptions(...args) {
  const options = toolInputShell.getOptions(...args);
  return isAlignmentViewerTool() ? getAlignmentViewerOptions(options) : options;
}

const outputShell = createOutputShellController({
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
});

function renderMessages(result) {
  outputShell.renderMessages(result);
}

function appendWarningSummary(parent, warnings, formatter) {
  outputShell.appendWarningSummary(parent, warnings, formatter);
}

function appendOutputDetails(parent, detailsRows) {
  outputShell.appendOutputDetails(parent, detailsRows);
}

function appendWorkflowWorkspacePromotionActions(parent, result, workflowDefinition) {
  outputShell.appendWorkflowWorkspacePromotionActions(parent, result, workflowDefinition);
}

async function buildToolOutputDescription(result, inputText, options) {
  return outputShell.buildToolOutputDescription(result, inputText, options);
}

function getWorkflowOutputDetails(result, formatted) {
  return outputShell.getWorkflowOutputDetails(result, formatted);
}

function setOutputSearchRowVisible(scope, visible) {
  outputShell.setOutputSearchRowVisible(scope, visible);
}

function updateOutputActions(scope, options) {
  outputShell.updateOutputActions(scope, options);
}

function renderOutputSearch(scope) {
  outputShell.renderOutputSearch(scope);
}

function queueOutputSearch(scope) {
  outputShell.queueOutputSearch(scope);
}

function moveOutputSearch(scope, direction) {
  outputShell.moveOutputSearch(scope, direction);
}

function keepOutputSearchButtonFromScrollingPage(button) {
  outputShell.keepOutputSearchButtonFromScrollingPage(button);
}

function resetToolOutputViewer(message) {
  outputShell.resetToolOutputViewer(message);
}

function clearToolOutput() {
  outputShell.clearToolOutput();
}

function clearWorkflowTableOutput() {
  outputShell.clearWorkflowTableOutput();
}

function setOutputFormatLabel(scope, label) {
  outputShell.setOutputFormatLabel(scope, label);
}

function renderWorkflowTableOutput(tableStream, preferTable = false) {
  outputShell.renderWorkflowTableOutput(tableStream, preferTable);
}

function renderVisualOutput(scope, svg, options = {}) {
  return outputShell.renderVisualOutput(scope, svg, options);
}

function renderGeneratedToolOutputChoice(result) {
  outputShell.renderGeneratedToolOutputChoice(result);
}

function clearToolInputOutput(...args) {
  return toolInputShell.clearToolInputOutput(...args);
}

function formatExampleInputForDisplay(...args) {
  return toolInputShell.formatExampleInputForDisplay(...args);
}

function loadSelectedToolExample(...args) {
  return toolInputShell.loadSelectedToolExample(...args);
}

function updateInputActionButtons(...args) {
  return toolInputShell.updateInputActionButtons(...args);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function formatWorkflowValue(...args) {
  return workflowBuilder.formatWorkflowValue(...args);
}

function getSelectedWorkflowPreset(...args) {
  return workflowBuilder.getSelectedWorkflowPreset(...args);
}

function cloneWorkflow(...args) {
  return workflowBuilder.cloneWorkflow(...args);
}

function getActiveWorkflowDefinition(...args) {
  return workflowBuilder.getActiveWorkflowDefinition(...args);
}

function setWorkflowDefinition(...args) {
  return workflowBuilder.setWorkflowDefinition(...args);
}

function getDefaultWorkflowSaveName(...args) {
  return workflowBuilder.getDefaultWorkflowSaveName(...args);
}

function setWorkflowSavedStatus(...args) {
  return workflowBuilder.setWorkflowSavedStatus(...args);
}

function setWorkflowSourceMode(...args) {
  return workflowBuilder.setWorkflowSourceMode(...args);
}

function renderSavedWorkflowControls(...args) {
  return workflowBuilder.renderSavedWorkflowControls(...args);
}

function updateSavedWorkflowActionButtons(...args) {
  return workflowBuilder.updateSavedWorkflowActionButtons(...args);
}

function updateWorkflowRecipeActionButton(...args) {
  return workflowBuilder.updateWorkflowRecipeActionButton(...args);
}

function getWorkflowDefinitionForStorage(...args) {
  return workflowBuilder.getWorkflowDefinitionForStorage(...args);
}

function workflowUsesInput(...args) {
  return workflowBuilder.workflowUsesInput(...args);
}

function makeRunnableWorkflow(...args) {
  return workflowBuilder.makeRunnableWorkflow(...args);
}

function getToolById(...args) {
  return workflowBuilder.getToolById(...args);
}

function getWorkflowStepDisplayName(...args) {
  return workflowBuilder.getWorkflowStepDisplayName(...args);
}

function getWorkflowStepKindLabel(...args) {
  return workflowBuilder.getWorkflowStepKindLabel(...args);
}

function describeWorkflowStep(...args) {
  return workflowBuilder.describeWorkflowStep(...args);
}

function renderWorkflowView(...args) {
  return workflowBuilder.renderWorkflowView(...args);
}

function renderWorkflowBuilderControls(...args) {
  return workflowBuilder.renderWorkflowBuilderControls(...args);
}

async function refreshSavedWorkflowList(...args) {
  return workflowBuilder.refreshSavedWorkflowList(...args);
}

async function saveCurrentWorkflowToLibrary(...args) {
  return workflowBuilder.saveCurrentWorkflowToLibrary(...args);
}

async function loadSavedWorkflowFromLibrary(...args) {
  return workflowBuilder.loadSavedWorkflowFromLibrary(...args);
}

async function deleteSavedWorkflowFromLibrary(...args) {
  return workflowBuilder.deleteSavedWorkflowFromLibrary(...args);
}

function clearWorkflowOutput() {
  state.workflowRunSummary = null;
  elements.workflowOutput.value = "";
  elements.workflowOutput.dataset.rawOutput = "";
  elements.workflowOutput.dataset.tableTsv = "";
  elements.workflowOutput.dataset.visualOutput = "false";
  elements.workflowOutputHighlight.hidden = true;
  elements.workflowOutputHighlight.textContent = "";
  elements.workflowOutput.hidden = false;
  clearWorkflowTableOutput();
  renderVisualOutput("workflow", null);
  elements.workflowOutput.dataset.filename = "sms3-workflow-output.txt";
  elements.workflowOutput.dataset.mimeType = "text/plain";
  elements.workflowOutputSummary.textContent = "";
  elements.workflowMessages.textContent = "";
  elements.workflowStepInspector.textContent = "";
  setOutputFormatLabel("workflow", null);
  setOutputSearchRowVisible("workflow", false);
  elements.workflowOutputActions.hidden = true;
  renderOutputSearch("workflow");
  renderWorkflowView();
}

function clearWorkflowJson() {
  elements.workflowJson.value = "";
  state.importedWorkflow = null;
  state.activeSavedWorkflowId = "";
  state.pendingWorkflowRecipe = "";
  state.selectedWorkflowStepId = null;
  state.expandedWorkflowStepIds = new Set();
  workspaceInputSources.setWorkflowInputSourceMode("paste");
  elements.workflowSaveName.value = "";
  setWorkflowSavedStatus("");
}

function focusWorkflowRecipePicker() {
  elements.workflowRecipePanel?.scrollIntoView({ block: "nearest" });
  if (elements.workflowRecipePanel && "open" in elements.workflowRecipePanel) {
    elements.workflowRecipePanel.open = true;
  }
  elements.workflowPreset?.focus({ preventScroll: true });
}

function focusWorkflowRecipeTrigger() {
  if (elements.workflowRecipePanel && "open" in elements.workflowRecipePanel) {
    elements.workflowRecipePanel.open = false;
  }
  elements.workflowRecipePanel?.querySelector("summary")?.focus({ preventScroll: true });
}

function loadSelectedWorkflowRecipe({ focusPicker = false } = {}) {
  state.selectedWorkflow = state.pendingWorkflowRecipe || elements.workflowPreset.value || state.selectedWorkflow;
  state.pendingWorkflowRecipe = "";
  setWorkflowSourceMode("recipe");
  clearWorkflowJson();
  renderWorkflowView();
  loadWorkflowExample();
  clearWorkflowOutput();
  elements.workflowMessages.textContent = "";
  addWorkflowMessage(`Loaded recipe "${getSelectedWorkflowPreset().name}".`);
  setRouteHash("workflow", state.selectedWorkflow);
  if (focusPicker) {
    requestAnimationFrame(focusWorkflowRecipeTrigger);
  }
}

function addMessage(text, className = "info") {
  const message = document.createElement("div");
  message.className = `message ${className}`;
  message.textContent = text;
  elements.messages.append(message);
}

function addWorkflowMessage(text, className = "info") {
  const message = document.createElement("div");
  message.className = `message ${className}`;
  message.textContent = text;
  elements.workflowMessages.append(message);
}

function setWorkflowRunning(isRunning) {
  elements.runWorkflow.disabled = isRunning;
  elements.runWorkflow.setAttribute("aria-hidden", String(isRunning));
  elements.cancelWorkflow.disabled = !isRunning;
  elements.cancelWorkflow.setAttribute("aria-hidden", String(!isRunning));
}

function setToolRunning(isRunning) {
  elements.runTool.disabled = isRunning;
  elements.cancelTool.hidden = !isRunning;
  elements.cancelTool.disabled = !isRunning;
}

function cancelSelectedWorkflowRun() {
  if (!state.workflowRun) {
    return;
  }
  state.workflowRun.abortController.abort();
  state.workflowRun.cancelActiveTool?.();
  elements.cancelWorkflow.disabled = true;
  elements.workflowMessages.textContent = "";
  addWorkflowMessage("Cancelling workflow run...");
}

function cancelSelectedToolRun() {
  if (!state.toolRun) {
    return;
  }
  state.toolRun.abortController.abort();
  state.toolRun.cancelActiveTool?.();
  elements.cancelTool.disabled = true;
  elements.messages.textContent = "";
  addMessage(`Cancelling ${state.selectedTool.metadata.name}...`);
}

function getToolRunStatus(tool) {
  return `Running ${tool?.metadata.name ?? "tool"}...`;
}

function getWorkflowStepRunStatus(step, index, total) {
  return `Running step ${index + 1} of ${total}: ${getWorkflowStepDisplayName(step)}.`;
}

function describeWorkerProgress(tool, message = {}) {
  if (message.phase === "parsing-input") {
    return `Parsing input for ${tool.metadata.name}...`;
  }
  if (message.phase === "loading-reference-data") {
    return `Loading reference data for ${tool.metadata.name}...`;
  }
  if (message.phase === "scanning" && message.totalRecords) {
    return `Scanning ${message.recordsProcessed.toLocaleString()} of ${message.totalRecords.toLocaleString()} records with ${tool.metadata.name}...`;
  }
  if (message.phase === "scanning-frames" && message.totalFrames) {
    return `Scanning ${message.framesProcessed.toLocaleString()} of ${message.totalFrames.toLocaleString()} frames with ${tool.metadata.name}...`;
  }
  if (message.phase === "scanning-records" && message.totalRecords) {
    return `Scanning ${message.recordsProcessed.toLocaleString()} of ${message.totalRecords.toLocaleString()} records with ${tool.metadata.name}...`;
  }
  if (message.phase === "building-windows" && message.totalRecords) {
    return `Building windows for ${message.recordsProcessed.toLocaleString()} of ${message.totalRecords.toLocaleString()} records with ${tool.metadata.name}...`;
  }
  if (message.phase === "building-output") {
    return `Building output for ${tool.metadata.name}...`;
  }
  if (message.phase === "started") {
    return getToolRunStatus(tool);
  }
  return "";
}

function showWorkflowWorkerProgress(tool, context, message) {
  const detail = describeWorkerProgress(tool, message);
  if (!detail) {
    return;
  }
  elements.workflowMessages.textContent = "";
  addWorkflowMessage(
    `Step ${context.stepIndex + 1} of ${context.totalSteps}: ${detail}`
  );
}

function makeRunAbortError(message = "Tool run was cancelled.") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

async function loadWorkflowExample() {
  const requestId = workflowExampleLoadRequest + 1;
  workflowExampleLoadRequest = requestId;
  const preset = getSelectedWorkflowPreset();
  const importedWorkflow = state.importedWorkflow;
  workspaceInputSources.setWorkflowInputSourceMode("paste");
  elements.workflowInput.value = "";
  clearWorkflowOutput();
  updateInputActionButtons();
  const example = await loadWorkflowPresetExample(preset);
  if (
    requestId !== workflowExampleLoadRequest ||
    getSelectedWorkflowPreset().id !== preset.id ||
    state.importedWorkflow !== importedWorkflow
  ) {
    return;
  }
  elements.workflowInput.value = example;
  updateInputActionButtons();
  const activeWorkflow = getActiveWorkflowDefinition();
  workspaceInputSources.renderWorkflowSource(activeWorkflow, workflowUsesInput(activeWorkflow));
}

function clearWorkflowInput() {
  workflowExampleLoadRequest += 1;
  workspaceInputSources.setWorkflowInputSourceMode("paste");
  elements.workflowInput.value = "";
  clearWorkflowOutput();
  updateInputActionButtons();
  const activeWorkflow = getActiveWorkflowDefinition();
  workspaceInputSources.renderWorkflowSource(activeWorkflow, workflowUsesInput(activeWorkflow));
}

function copyWorkflowDefinitionToEditor() {
  const workflow = cloneWorkflow(getActiveWorkflowDefinition());
  const inputStep = workflow.steps.find((step) => step.type === "input");
  if (inputStep) {
    inputStep.text = "";
    delete inputStep.workspaceSource;
  }
  elements.workflowJson.value = JSON.stringify(workflow, null, 2);
  elements.workflowJsonPanel.open = true;
  elements.workflowMessages.textContent = "";
  addWorkflowMessage("Copied the current workflow recipe into the import/export editor.");
}

function parseWorkflowJson() {
  try {
    return { workflow: JSON.parse(elements.workflowJson.value), errors: [] };
  } catch (error) {
    return { workflow: null, errors: [`Workflow JSON could not be parsed: ${error.message}`] };
  }
}

function importWorkflowJson() {
  const parsed = parseWorkflowJson();
  const errors = parsed.errors.length > 0 ? parsed.errors : validateWorkflowDefinition(parsed.workflow, { tools });
  elements.workflowMessages.textContent = "";

  if (errors.length > 0) {
    state.importedWorkflow = null;
    renderWorkflowView();
    clearWorkflowOutput();
    errors.forEach((error) => addWorkflowMessage(error, "warning"));
    return false;
  }

  state.importedWorkflow = parsed.workflow;
  state.activeSavedWorkflowId = "";
  state.selectedWorkflowStepId = null;
  state.expandedWorkflowStepIds = new Set();
  workspaceInputSources.setWorkflowInputSourceMode("paste");
  elements.workflowSaveName.value = parsed.workflow?.name ?? "";
  setWorkflowSavedStatus("");
  renderWorkflowView();
  clearWorkflowOutput();
  addWorkflowMessage("Using the edited workflow.");
  return true;
}

function validateWorkflowJsonFromEditor() {
  const parsed = parseWorkflowJson();
  const errors = parsed.errors.length > 0 ? parsed.errors : validateWorkflowDefinition(parsed.workflow, { tools });
  elements.workflowMessages.textContent = "";

  if (errors.length > 0) {
    errors.forEach((error) => addWorkflowMessage(error, "warning"));
    return false;
  }

  addWorkflowMessage("Workflow definition is valid.");
  return true;
}

function summarizeWorkflowStepValue(value) {
  if (!value) {
    return "no output";
  }
  if (value.kind === "text") {
    return describeStream(value);
  }
  if (value.kind === "table") {
    return `table rows (${pluralize(value.rows?.length ?? 0, "row")})`;
  }
  if (value.kind === "sequence-records") {
    return `${value.alphabet === "protein" ? "protein" : "DNA/RNA"} sequences (${pluralize(value.records?.length ?? 0, "record")})`;
  }
  if (value.kind === "orf-records") {
    return `ORFs (${pluralize(value.records?.length ?? 0, "record")})`;
  }
  if (value.kind === "collection") {
    return `set (${pluralize(value.items?.length ?? 0, "item")})`;
  }
  return value.kind ?? "unknown output";
}

function makeWorkflowStepOutputFilename(index, formatted) {
  const filename = formatted.filename || "sms3-workflow-step-output.txt";
  return filename.replace(/^sms3-workflow-output/, `sms3-workflow-step-${index + 1}`);
}

function renderWorkflowStepInspector(result, workflowDefinition = getActiveWorkflowDefinition()) {
  elements.workflowStepInspector.textContent = "";

  if (!result?.steps?.length) {
    return;
  }

  const details = document.createElement("details");
  details.className = "workflow-run-details";
  const summary = document.createElement("summary");
  summary.textContent = "Step outputs";
  details.append(summary);

  for (const [index, stepResult] of result.steps.entries()) {
    const item = document.createElement("div");
    item.className = "workflow-step-result";
    const stepLabel = document.createElement("span");
    stepLabel.className = "workflow-step-result-title";
    stepLabel.textContent = `Step ${index + 1}: ${describeWorkflowStep(stepResult.step, workflowDefinition)}`;
    const stepOutput = document.createElement("span");
    stepOutput.className = "workflow-step-result-value";
    stepOutput.textContent = `Produced: ${summarizeWorkflowStepValue(stepResult.value)}`;
    item.append(stepLabel, stepOutput);

    const formatted = formatWorkflowValue(stepResult.value);
    const stepRawOutput = formatted.rawText || formatted.text || "";
    if (stepRawOutput) {
      const actions = document.createElement("div");
      actions.className = "workflow-step-result-actions output-action-row";
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.textContent = "Copy output";
      copyButton.addEventListener("click", async () => {
        await navigator.clipboard.writeText(stepRawOutput);
        addWorkflowMessage(`Copied output from step ${index + 1}.`);
      });
      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.textContent = "Download";
      downloadButton.addEventListener("click", () => {
        downloadText(
          stepRawOutput,
          makeWorkflowStepOutputFilename(index, formatted),
          formatted.mimeType || "text/plain;charset=utf-8"
        );
      });
      actions.append(copyButton, downloadButton);
      item.append(actions);
    }

    if (stepResult.warnings.length > 0) {
      const warnings = document.createElement("ul");
      warnings.className = "reference-notes";
      for (const warning of stepResult.warnings) {
        const warningItem = document.createElement("li");
        warningItem.textContent = warning.message;
        warnings.append(warningItem);
      }
      item.append(warnings);
    }

    details.append(item);
  }

  elements.workflowStepInspector.append(details);
}

function appendWorkflowStep(...args) {
  return workflowBuilder.appendWorkflowStep(...args);
}

function openWorkflowAddStepDraft(...args) {
  return workflowBuilder.openWorkflowAddStepDraft(...args);
}

function cancelWorkflowAddStepDraft(...args) {
  return workflowBuilder.cancelWorkflowAddStepDraft(...args);
}

function removeWorkflowStep(...args) {
  return workflowBuilder.removeWorkflowStep(...args);
}

async function runAppTool(tool, input, options = {}, context = {}) {
  const { onProgress, signal } = context;
  if (signal?.aborted) {
    throw makeRunAbortError();
  }
  const run = toolWorkerClient.runTool({
    toolId: tool.metadata.id,
    input,
    options,
    onProgress: (message) => {
      onProgress?.(message);
      if (state.workflowRun && context.step) {
        showWorkflowWorkerProgress(tool, context, message);
      }
    }
  });
  const abortActiveRun = () => run.cancel();
  signal?.addEventListener("abort", abortActiveRun, { once: true });
  if (state.workflowRun && signal === state.workflowRun.abortController.signal) {
    state.workflowRun.cancelActiveTool = run.cancel;
  }
  if (state.toolRun && signal === state.toolRun.abortController.signal) {
    state.toolRun.cancelActiveTool = run.cancel;
  }
  try {
    return await run.promise;
  } finally {
    signal?.removeEventListener("abort", abortActiveRun);
    if (state.workflowRun?.cancelActiveTool === run.cancel) {
      state.workflowRun.cancelActiveTool = null;
    }
    if (state.toolRun?.cancelActiveTool === run.cancel) {
      state.toolRun.cancelActiveTool = null;
    }
  }
}

async function runSelectedWorkflow() {
  if (state.workflowRun) {
    return;
  }
  const abortController = new AbortController();
  state.workflowRun = {
    abortController,
    cancelActiveTool: null
  };
  state.workflowRunSummary = {
    status: "Running",
    output: "",
    stepCount: 0
  };
  renderWorkflowView();
  setWorkflowRunning(true);
  try {
    const workflow = makeRunnableWorkflow();
    clearWorkflowOutput();
    state.workflowRunSummary = {
      status: "Running",
      output: "",
      stepCount: 0
    };
    renderWorkflowView();
    addWorkflowMessage("Running workflow...");
    const result = await runWorkflow(workflow, {
      tools,
      runTool: runAppTool,
      signal: abortController.signal,
      onStepStart: (step, index, total) => {
        elements.workflowMessages.textContent = "";
        addWorkflowMessage(getWorkflowStepRunStatus(step, index, total));
      }
    });
    const formatted = formatWorkflowValue(result.value);
    state.workflowRunSummary = {
      status: "Completed",
      output: formatted.summary?.replace(/^Workflow output:\s*/i, "") || formatted.outputLabel || "",
      stepCount: result.steps.length
    };
    renderWorkflowView();
    const hasWorkflowVisual = Boolean(formatted.svg || formatted.viewer || formatted.figure);
    elements.workflowOutput.value = formatted.text;
    elements.workflowOutput.dataset.rawOutput = formatted.rawText;
    elements.workflowOutput.dataset.filename = formatted.filename ?? "sms3-workflow-output.txt";
    elements.workflowOutput.dataset.mimeType = formatted.mimeType ?? "text/plain";
    elements.workflowOutput.dataset.visualOutput = hasWorkflowVisual ? "true" : "false";
    elements.workflowOutputSummary.textContent = formatted.summary;
    setOutputFormatLabel("workflow", formatted.outputLabel);
    renderWorkflowTableOutput(formatted.tableStream, Boolean(formatted.tableStream));
    renderVisualOutput("workflow", formatted.svg, {
      viewer: formatted.viewer,
      figure: formatted.figure
    });
    elements.workflowOutput.hidden = Boolean(formatted.tableStream || hasWorkflowVisual);
    setOutputSearchRowVisible("workflow", Boolean(formatted.tableStream || (!hasWorkflowVisual && formatted.text)));
    updateOutputActions("workflow", {
      hidden: Boolean(formatted.tableStream),
      mimeType: formatted.mimeType,
      label: formatted.outputLabel
    });
    elements.workflowMessages.textContent = "";
    renderWorkflowStepInspector(result, workflow);
    addWorkflowMessage(`Ran ${pluralize(result.steps.length, "step")}.`);
    appendOutputDetails(elements.workflowMessages, getWorkflowOutputDetails(result, formatted));
    appendWorkflowWorkspacePromotionActions(elements.workflowMessages, result, workflow);
    appendWarningSummary(
      elements.workflowMessages,
      result.warnings,
      (warning) => `${warning.stepId}: ${warning.message}`
    );
    renderOutputSearch("workflow");
  } catch (error) {
    clearWorkflowOutput();
    if (error.name === "AbortError" || abortController.signal.aborted) {
      state.workflowRunSummary = {
        status: "Cancelled",
        output: "",
        stepCount: 0
      };
      renderWorkflowView();
      addWorkflowMessage("Workflow run cancelled.");
    } else {
      state.workflowRunSummary = {
        status: "Error",
        output: "",
        stepCount: 0
      };
      renderWorkflowView();
      addWorkflowMessage(`Could not run workflow: ${error.message}`, "warning");
    }
  } finally {
    state.workflowRun = null;
    setWorkflowRunning(false);
  }
}

async function displayToolResult(result, inputText, options) {
  state.currentToolDescription = await buildToolOutputDescription(result, inputText, options);
  renderGeneratedToolOutputChoice(result);
  renderMessages(result);
}

async function runSelectedTool() {
  if (state.toolRun) {
    return;
  }
  const abortController = new AbortController();
  state.toolRun = {
    abortController,
    cancelActiveTool: null
  };
  setToolRunning(true);
  resetToolOutputViewer("Run is in progress...");
  try {
    elements.messages.textContent = "";
    addMessage(getToolRunStatus(state.selectedTool));
    const inputText = getSelectedToolInputText();
    const options = getOptions();
    await displayToolResult(
      await runAppTool(state.selectedTool, inputText, options, {
        signal: abortController.signal,
        onProgress: (message) => {
          const detail = describeWorkerProgress(state.selectedTool, message);
          if (!detail) {
            return;
          }
          elements.messages.textContent = "";
          addMessage(detail);
        }
      }),
      inputText,
      options
    );
  } catch (error) {
    resetToolOutputViewer("Run did not produce output.");
    if (error.name === "AbortError" || abortController.signal.aborted) {
      addMessage(`${state.selectedTool.metadata.name} run cancelled.`);
    } else {
      addMessage(`Could not run ${state.selectedTool.metadata.name}: ${error.message}`, "warning");
    }
  } finally {
    state.toolRun = null;
    setToolRunning(false);
  }
}

async function loadInputFile(file) {
  if (!file) {
    return;
  }

  if (getDirectInputFileOptionId(state.selectedTool)) {
    workspaceInputSources.setToolSourceMode(state.selectedTool?.metadata?.id, "paste");
    setDirectInputFile(file, state.selectedTool);
    workspaceInputSources.renderToolSource();
    addMessage(`Selected ${file.name || "local file"} (${Number(file.size ?? 0).toLocaleString()} bytes).`);
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
    return;
  }

  try {
    workspaceInputSources.setToolSourceMode(state.selectedTool?.metadata?.id, "paste");
    elements.sequenceInput.value = await readToolInputFileText(file, { onMessage: addMessage });
    if (isMarkdownNotebookSelected()) {
      elements.markdownInputFileName.value = markdownFilenameFromLoadedFile(file.name);
      setMarkdownInputStatus(`Loaded ${file.name}. Click Run to start editing.`);
      const workspaceFilename = getMarkdownWorkspaceControl("fileName");
      if (workspaceFilename) {
        workspaceFilename.value = markdownFilenameFromLoadedFile(file.name);
      }
      syncMarkdownWorkspaceFromSource(`Opened ${file.name}`);
    }
    if (isSamBamSummaryRegionViewerTool()) {
      updateSamBamInputModeUi();
    }
    if (isVcfTabbedInputTool()) {
      updateVcfInputModeUi();
    }
    if (isAlignmentViewerTool()) {
      updateAlignmentViewerInputUi();
    }
    if (isFastaSourceTabbedTool()) {
      updateFastaSourceInputUi();
    }
    if (isFastaRegionExtractorTool()) {
      updateFastaRegionExtractorSourceUi();
    }
    if (isProteinStructureViewerTool()) {
      updateProteinStructureViewerUi();
    }
    clearToolOutput();
    updateInputActionButtons();
    workspaceInputSources.renderToolSource();
    addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
  } catch (error) {
    const detail = error?.message ? ` ${error.message}` : "";
    addMessage(`${file.name}: could not read this file as text.${detail}`, "warning");
  }
}

function wirePageHelpPopovers() {
  document.querySelectorAll(".page-help").forEach((help) => {
    const popover = help.nextElementSibling;
    if (!popover?.classList?.contains("option-help-popover")) {
      return;
    }
    const positionPopover = () => positionPageHelpPopover(help, popover);
    help.addEventListener("mouseenter", positionPopover);
    help.addEventListener("focus", positionPopover);
    help.addEventListener("click", positionPopover);
  });
}

function positionPageHelpPopover(help, popover) {
  popover.style.setProperty("--option-help-left", "0px");
  popover.style.setProperty("--option-help-top", "0px");
  const helpRect = help.getBoundingClientRect();
  const width = popover.offsetWidth || 320;
  const height = popover.offsetHeight || 64;
  const margin = 12;
  const preferredLeft = helpRect.left;
  const preferredTop = helpRect.bottom + 8;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const left = Math.min(Math.max(margin, preferredLeft), maxLeft);
  let top = preferredTop;
  if (top + height + margin > window.innerHeight) {
    top = helpRect.top - height - 8;
  }
  top = Math.max(margin, top);
  popover.style.setProperty("--option-help-left", `${left}px`);
  popover.style.setProperty("--option-help-top", `${top}px`);
}

elements.toolSearch.addEventListener("input", renderToolList);
wirePageHelpPopovers();
elements.homeLink.addEventListener("click", () => {
  selectHome();
});
elements.workflowLink.addEventListener("click", () => {
  selectWorkflow();
});
elements.workspaceLink.addEventListener("click", () => {
  selectWorkspace();
});
elements.feedbackLink.addEventListener("click", () => {
  selectFeedback();
});
elements.workflowRecipeTab.addEventListener("click", () => {
  setWorkflowSourceMode("recipe");
  requestAnimationFrame(focusWorkflowRecipePicker);
});
elements.workflowSavedTab.addEventListener("click", () => {
  setWorkflowSourceMode("saved");
});
elements.workflowPreset.addEventListener("change", () => {
  const selectedRecipeId = elements.workflowPreset.value;
  elements.workflowMessages.textContent = "";
  const canResetActiveWorkflow = Boolean(state.importedWorkflow || state.activeSavedWorkflowId);
  state.pendingWorkflowRecipe = selectedRecipeId === state.selectedWorkflow && !canResetActiveWorkflow
    ? ""
    : selectedRecipeId;
  updateWorkflowRecipeActionButton();
  const pendingRecipe = workflowPresets.find((item) => item.id === selectedRecipeId);
  if (state.pendingWorkflowRecipe) {
    addWorkflowMessage(`Selected recipe "${pendingRecipe?.name ?? "recipe"}". Click Load recipe to replace the current workflow.`);
  }
});
elements.workflowLoadRecipe.addEventListener("click", () => loadSelectedWorkflowRecipe({ focusPicker: true }));
elements.workflowLoadExample.addEventListener("click", loadWorkflowExample);
elements.workflowClearInput.addEventListener("click", clearWorkflowInput);
elements.workflowInput.addEventListener("input", updateInputActionButtons);
elements.workflowSavedSelect.addEventListener("change", updateSavedWorkflowActionButtons);
elements.workflowSaveCurrent.addEventListener("click", saveCurrentWorkflowToLibrary);
elements.workflowLoadSaved.addEventListener("click", loadSavedWorkflowFromLibrary);
elements.workflowDeleteSaved.addEventListener("click", deleteSavedWorkflowFromLibrary);
elements.workflowExportJson.addEventListener("click", copyWorkflowDefinitionToEditor);
elements.workflowImportJson.addEventListener("click", importWorkflowJson);
elements.workflowValidateJson.addEventListener("click", validateWorkflowJsonFromEditor);
elements.workflowAddStepType.addEventListener("change", renderWorkflowBuilderControls);
elements.workflowAddTool.addEventListener("change", renderWorkflowBuilderControls);
elements.workflowOpenAddStep.addEventListener("click", openWorkflowAddStepDraft);
elements.workflowCancelAddStep.addEventListener("click", cancelWorkflowAddStepDraft);
elements.workflowAppendStep.addEventListener("click", appendWorkflowStep);
elements.runWorkflow.addEventListener("click", runSelectedWorkflow);
elements.cancelWorkflow.addEventListener("click", cancelSelectedWorkflowRun);
elements.workflowCopyOutput.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.workflowOutput.dataset.rawOutput || elements.workflowOutput.value);
});

elements.workflowDownloadOutput.addEventListener("click", () => {
  downloadText(
    elements.workflowOutput.dataset.rawOutput || elements.workflowOutput.value,
    elements.workflowOutput.dataset.filename || "sms3-workflow-output.txt",
    elements.workflowOutput.dataset.mimeType || "text/plain"
  );
});
elements.workflowOutputSearch.addEventListener("input", () => queueOutputSearch("workflow"));
elements.workflowOutputSearchPrevious.addEventListener("click", () => moveOutputSearch("workflow", -1));
elements.workflowOutputSearchNext.addEventListener("click", () => moveOutputSearch("workflow", 1));
keepOutputSearchButtonFromScrollingPage(elements.workflowOutputSearchPrevious);
keepOutputSearchButtonFromScrollingPage(elements.workflowOutputSearchNext);
elements.loadExample.addEventListener("click", loadSelectedToolExample);
elements.clearInput.addEventListener("click", clearToolInputOutput);
elements.sequenceInput.addEventListener("input", () => {
  if (getCurrentDirectInputFile(state.selectedTool)) {
    clearDirectInputFile();
  }
  updateInputActionButtons();
  updateToolOptionSuggestions({ autofillColumns: true });
  updateSamBamInputModeUi();
  updateVcfInputModeUi();
  updateAlignmentViewerInputUi();
  updateFastaSourceInputUi();
  updateFastaRegionExtractorSourceUi();
  updateBiologicalRecordFormatConverterInputUi();
  updateProteinStructureViewerUi();
  if (isMarkdownNotebookSelected()) {
    setMarkdownInputStatus("Unsaved changes");
  }
});
elements.toolOptions.addEventListener("input", (event) => {
  if (event.target?.dataset?.autofilledColumn === "true") {
    event.target.dataset.autofilledColumn = "false";
  }
  persistLimitOptionControlValue(event.target);
  updateToolOptionSuggestions();
  updateSamBamInputModeUi();
  updateVcfInputModeUi();
  updateAlignmentViewerInputUi();
  updateFastaSourceInputUi();
  updateFastaRegionExtractorSourceUi();
  updateBiologicalRecordFormatConverterInputUi();
  updateProteinStructureViewerUi();
  sangerTraceWorkspace.update();
  updatePcrPrimerDesignUi();
});
elements.toolOptions.addEventListener("change", (event) => {
  handleProteinStructureChainControlChange(event.target);
  persistLimitOptionControlValue(event.target);
  updateToolOptionSuggestions();
  updateSamBamInputModeUi();
  updateVcfInputModeUi();
  updateAlignmentViewerInputUi();
  updateFastaSourceInputUi();
  updateFastaRegionExtractorSourceUi();
  updateBiologicalRecordFormatConverterInputUi();
  updateProteinStructureViewerUi();
  sangerTraceWorkspace.update();
  updatePcrPrimerDesignUi({
    applyPreset: event.target?.name === "designPreset" || event.target?.id === "designPreset"
  });
  updateMarkdownInputUi();
});
elements.toolOptions.addEventListener("click", (event) => {
  if (queueProteinStructureChainControlUpdate(event.target)) {
    return;
  }
});
elements.markdownSaveDraft.addEventListener("click", async () => {
  try {
    await saveMarkdownNotebookDraft({
      markdown: elements.sequenceInput.value,
      filename: getMarkdownInputFilename()
    });
    setMarkdownInputStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  } catch (error) {
    setMarkdownInputStatus(error.message || "Draft save failed");
  }
});
elements.markdownLoadDraft.addEventListener("click", async () => {
  try {
    const draft = await loadMarkdownNotebookDraft();
    if (!draft) {
      setMarkdownInputStatus("No saved draft found");
      return;
    }
    elements.sequenceInput.value = draft.markdown ?? "";
    elements.markdownInputFileName.value = normalizeMarkdownFilename(draft.filename);
    elements.sequenceInput.dispatchEvent(new Event("input", { bubbles: true }));
    setMarkdownInputStatus(`Loaded draft from ${new Date(draft.updatedAt).toLocaleString()}`);
  } catch (error) {
    setMarkdownInputStatus(error.message || "Draft load failed");
  }
});
elements.markdownCopyInput.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.sequenceInput.value);
  setMarkdownInputStatus("Copied Markdown");
});
elements.markdownDownloadInput.addEventListener("click", () => {
  downloadText(elements.sequenceInput.value, getMarkdownInputFilename(), "text/markdown;charset=utf-8");
  setMarkdownInputStatus("Downloaded Markdown");
});
elements.cancelTool.addEventListener("click", cancelSelectedToolRun);
elements.restoreDefaults.addEventListener("click", restoreCurrentToolDefaults);
elements.fileInput.addEventListener("change", async () => {
  await loadInputFile(elements.fileInput.files?.[0]);
  elements.fileInput.value = "";
});
elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("drag-over");
});
elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("drag-over");
});
elements.dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("drag-over");
  await loadInputFile(event.dataTransfer.files?.[0]);
});
elements.runTool.addEventListener("click", runSelectedTool);
elements.copyOutput.addEventListener("click", async () => {
  await navigator.clipboard.writeText(elements.toolOutput.dataset.rawOutput || elements.toolOutput.value);
});
elements.outputSearch.addEventListener("input", () => queueOutputSearch("tool"));
elements.outputSearchPrevious.addEventListener("click", () => moveOutputSearch("tool", -1));
elements.outputSearchNext.addEventListener("click", () => moveOutputSearch("tool", 1));
keepOutputSearchButtonFromScrollingPage(elements.outputSearchPrevious);
keepOutputSearchButtonFromScrollingPage(elements.outputSearchNext);
elements.downloadOutput.addEventListener("click", () => {
  downloadText(
    elements.toolOutput.dataset.rawOutput || elements.toolOutput.value,
    elements.toolOutput.dataset.filename || "sms3-output.txt",
    elements.toolOutput.dataset.mimeType || "text/plain"
  );
});
elements.downloadPngOutput.addEventListener("click", async () => {
  const svg = elements.toolOutput.dataset.pngOutput || elements.toolOutput.dataset.rawOutput || elements.toolOutput.value;
  if (!svg) {
    return;
  }
  elements.downloadPngOutput.disabled = true;
  try {
    await downloadSvgAsPng(svg, getPngFilename(elements.toolOutput.dataset.filename || "sms3-output.svg"));
  } finally {
    elements.downloadPngOutput.disabled = false;
  }
});
appLayout.mount();
window.addEventListener("popstate", applyRouteFromHash);
window.addEventListener("hashchange", applyRouteFromHash);

appLayout.applyStoredTheme();
appLayout.applyStoredSidebarState();
loadAppVersion();
if (!applyRouteFromHash()) {
  renderActiveView();
  renderSelectedTool();
  renderToolList();
  renderReferenceList();
  renderSelectedReference();
  renderFeedbackTemplates();
  renderWorkflowView();
  renderWorkspaceView();
  loadSelectedToolExample();
}
refreshSavedWorkflowList();
refreshWorkspaceSequences();
