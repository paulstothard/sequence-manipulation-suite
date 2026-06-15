import { wrapFastaText } from "../core/fasta.js";

export function createToolInputShellController({
  elements,
  state,
  workspaceInputSources,
  sangerTraceWorkspace,
  helpers,
  callbacks
}) {
  const {
    appendToolOptionControl,
    flattenOptions,
    getDefaultOptionValues,
    serializeRuleListControl,
    serializeValueListControl
  } = helpers;
  const {
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
  } = callbacks;

  function getRunButtonLabel(tool = state.selectedTool) {
    return "Run";
  }

  function toolRequiresInput(tool) {
    return tool?.metadata?.inputRequired !== false;
  }

  function getInputReadLayoutOption(tool = state.selectedTool) {
    return flattenOptions(tool?.metadata?.options ?? [])
      .find((option) => option.id === "readLayout" && option.placement === "input");
  }

  function getActiveInputReadLayout(tool = state.selectedTool) {
    const readLayoutOption = getInputReadLayoutOption(tool);
    if (!readLayoutOption) {
      return "";
    }
    return elements.inputPanel.querySelector("input[name='readLayout']:checked")?.value ??
      readLayoutOption.defaultValue ??
      "single";
  }

  function hasLoadableExampleForActiveInputMode(tool = state.selectedTool) {
    const activeFileOptionExamples = getActiveInputFileOptionExamples(tool);
    if (activeFileOptionExamples.length > 0) {
      return true;
    }
    if (!String(tool?.example ?? "").trim()) {
      return false;
    }
    const readLayoutOption = getInputReadLayoutOption(tool);
    if (
      !tool?.metadata?.splitInput &&
      readLayoutOption &&
      getActiveInputReadLayout(tool) === "paired" &&
      elements.sequenceInput.hidden
    ) {
      return false;
    }
    return true;
  }

  function optionIsVisibleForReadLayout(option, readLayout) {
    if (option.visibleWhen?.option !== "readLayout") {
      return true;
    }
    const visibleValues = Array.isArray(option.visibleWhen.value)
      ? option.visibleWhen.value
      : [option.visibleWhen.value];
    return visibleValues.includes(readLayout);
  }

  function getActiveInputFileOptionExamples(tool = state.selectedTool) {
    const readLayout = getActiveInputReadLayout(tool);
    return flattenOptions(tool?.metadata?.options ?? [])
      .filter((option) =>
        option.type === "file" &&
        option.placement === "input" &&
        option.pasteArea === true &&
        optionIsVisibleForReadLayout(option, readLayout) &&
        String(option.example ?? "").trim()
      );
  }

  function getToolInputFileUi(tool) {
    const metadata = tool?.metadata ?? {};
    if (metadata.inputRequired === false) {
      return {
        dropLabel: "No input file needed",
        accept: ""
      };
    }
    if (metadata.fileInput) {
      return {
        dropLabel: metadata.fileInput.dropLabel ?? "Drop supported input here",
        accept: metadata.fileInput.accept ?? ".txt"
      };
    }
    const workflowInputs = metadata.workflow?.inputs ?? [];
    const inputTypeLabel = String(metadata.inputType ?? "").trim();
    const inputType = inputTypeLabel.toLowerCase();
    const category = (metadata.category ?? "").toLowerCase();
    const tags = (metadata.tags ?? []).map((tag) => String(tag).toLowerCase());
    const sequenceInput = workflowInputs.find((input) => input.kind === "sequence-records");
    const hasSequenceInput = Boolean(sequenceInput) || inputType.includes("sequence");
    const hasTableInput =
      workflowInputs.some((input) => input.kind === "table") ||
      category.includes("table") ||
      tags.some((tag) => ["table", "csv", "tsv"].includes(tag));
    const hasDnaRnaFlatfileInput =
      inputType.includes("flatfile") ||
      inputType.includes("genbank") ||
      inputType.includes("embl") ||
      inputType.includes("ddbj") ||
      inputType.includes("annotated dna record");

    if (inputType.includes("markdown")) {
      return {
        dropLabel: "Drop Markdown or plain-text notes here",
        accept: ".md,.markdown,.txt"
      };
    }

    if (inputType.includes("vcf")) {
      return {
        dropLabel: "Drop VCF or VCF.GZ here",
        accept: ".vcf,.vcf.gz,.gz,.txt"
      };
    }

    if (inputType.includes("sam")) {
      return {
        dropLabel: "Drop SAM or compressed SAM here",
        accept: ".sam,.sam.gz,.gz,.txt"
      };
    }

    if (inputType.includes("fastq")) {
      return {
        dropLabel: "Drop FASTQ or compressed FASTQ here",
        accept: ".fastq,.fq,.fastq.gz,.fq.gz,.gz,.txt"
      };
    }

    if (inputType.includes("sanger") || inputType.includes("chromatogram")) {
      return {
        dropLabel: "Drop AB1, SCF, one base-call sequence, or FASTA record here",
        accept: ".ab1,.abi,.scf,.json,.txt,.fa,.fasta,.seq"
      };
    }

    if (hasTableInput && inputType.includes("fasta")) {
      return {
        dropLabel: "Drop FASTA, compressed FASTA, CSV, TSV, Excel workbook, or plain-text table here",
        accept: ".fa,.fasta,.fna,.faa,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.csv,.tsv,.tab,.xlsx,.txt"
      };
    }

    if (hasTableInput && !hasSequenceInput) {
      return {
        dropLabel: "Drop CSV, TSV, Excel workbook, or plain-text table here",
        accept: ".csv,.tsv,.tab,.xlsx,.txt"
      };
    }

    if (inputType.includes("pdb") || inputType.includes("mmcif")) {
      return {
        dropLabel: "Drop PDB or mmCIF structure here",
        accept: ".pdb,.cif,.mmcif,.txt"
      };
    }

    if (inputType.includes("uniprot") || inputType.includes("genpept")) {
      return {
        dropLabel: "Drop UniProt or GenPept flatfile record here",
        accept: ".gp,.gpep,.uniprot,.txt"
      };
    }

    if (inputType.includes("genbank") || inputType.includes("embl") || inputType.includes("ddbj")) {
      return {
        dropLabel: "Drop GenBank, DDBJ, or EMBL flatfile record here",
        accept: ".gb,.gbk,.genbank,.embl,.ddbj,.txt"
      };
    }

    if (inputType.includes("protein sequence")) {
      return {
        dropLabel: "Drop one plain-text protein sequence or FASTA records here",
        accept: ".fa,.fasta,.faa,.fa.gz,.fasta.gz,.faa.gz,.gz,.txt,.seq"
      };
    }

    if (inputType.includes("dna") || inputType.includes("rna")) {
      if (hasDnaRnaFlatfileInput) {
        return {
          dropLabel: "Drop one plain-text DNA/RNA sequence, FASTA records, or GenBank/DDBJ/EMBL flatfile here",
          accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.gb,.gbk,.genbank,.embl,.ddbj,.seq"
        };
      }
      return {
        dropLabel: "Drop one plain-text DNA/RNA sequence or FASTA records here",
        accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
      };
    }

    const alphabet = sequenceInput?.alphabet ?? inputType;
    if (hasSequenceInput && String(alphabet).includes("protein")) {
      return {
        dropLabel: "Drop one plain-text protein sequence or FASTA records here",
        accept: ".fa,.fasta,.faa,.fa.gz,.fasta.gz,.faa.gz,.gz,.txt,.seq"
      };
    }

    if (
      hasSequenceInput &&
      (String(alphabet).includes("dna") ||
        String(alphabet).includes("rna") ||
        inputType.includes("dna") ||
        inputType.includes("rna"))
    ) {
      if (hasDnaRnaFlatfileInput) {
        return {
          dropLabel: "Drop one plain-text DNA/RNA sequence, FASTA records, or GenBank/DDBJ/EMBL flatfile here",
          accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.gb,.gbk,.genbank,.embl,.ddbj,.seq"
        };
      }
      return {
        dropLabel: "Drop one plain-text DNA/RNA sequence or FASTA records here",
        accept: ".fa,.fasta,.fna,.ffn,.fa.gz,.fasta.gz,.fna.gz,.ffn.gz,.gz,.txt,.seq"
      };
    }

    if (hasSequenceInput) {
      return {
        dropLabel: "Drop one plain-text sequence or FASTA records here",
        accept: ".fa,.fasta,.fa.gz,.fasta.gz,.gz,.txt,.seq"
      };
    }

    return {
      dropLabel: "Drop plain-text input here",
      accept: ".txt,.txt.gz,.csv,.tsv,.tab,.fa,.fasta,.fa.gz,.fasta.gz,.gz,.seq"
    };
  }

  function getDirectInputFileOptionId(tool = state.selectedTool) {
    return String(tool?.metadata?.fileInput?.directFileOption ?? "").trim();
  }

  function getCurrentDirectInputFile(tool = state.selectedTool) {
    const optionId = getDirectInputFileOptionId(tool);
    if (
      !optionId ||
      state.directInputFile?.toolId !== tool?.metadata?.id ||
      state.directInputFile?.optionId !== optionId
    ) {
      return null;
    }
    return state.directInputFile.file ?? null;
  }

  function clearDirectInputFile({ updateStatus = true } = {}) {
    state.directInputFile = null;
    if (updateStatus) {
      updateDirectInputFileStatus();
    }
  }

  function setDirectInputFile(file, tool = state.selectedTool) {
    const optionId = getDirectInputFileOptionId(tool);
    if (!file || !optionId) {
      clearDirectInputFile();
      return;
    }
    state.directInputFile = {
      toolId: tool.metadata.id,
      optionId,
      file
    };
    elements.sequenceInput.value = "";
    updateDirectInputFileStatus();
    clearToolOutput();
    updateInputActionButtons();
  }

  function updateDirectInputFileStatus(tool = state.selectedTool) {
    const optionId = getDirectInputFileOptionId(tool);
    const file = getCurrentDirectInputFile(tool);
    if (!optionId || !file || elements.dropZone.hidden) {
      elements.inputFileStatus.hidden = true;
      elements.inputFileStatus.textContent = "";
      elements.sequenceInput.placeholder = "";
      return;
    }
    const fileName = file.name || "selected file";
    const size = Number(file.size ?? 0);
    const sizeLabel = size > 0 ? ` (${size.toLocaleString()} bytes)` : "";
    elements.inputFileStatus.hidden = false;
    elements.inputFileStatus.textContent = `Selected local file: ${fileName}${sizeLabel}. Click Run to process this file.`;
    elements.sequenceInput.placeholder = `Using local file: ${fileName}`;
  }

  function updateInputFileUi(tool) {
    const isSplitInput = Boolean(tool?.metadata?.splitInput);
    const isMarkdownNotebook = tool?.metadata?.id === "markdown-notebook";
    const isTabbedInputWorkflow = isTabbedInputWorkflowTool(tool);
    elements.inputPanel.classList.toggle("tabbed-input-workflow", isTabbedInputWorkflow);
    elements.dropZone.hidden = isSplitInput || isTabbedInputWorkflow;
    elements.fileInput.closest(".file-button").hidden = isSplitInput || isTabbedInputWorkflow;
    elements.sequenceInput.hidden = isSplitInput || isMarkdownNotebook;
    elements.markdownInputTools.hidden = true;
    elements.sequenceInput.classList.remove("markdown-input-editor");
    elements.sequenceInput.spellcheck = false;
    if (isSplitInput || isTabbedInputWorkflow) {
      updateDirectInputFileStatus(tool);
      return;
    }
    const inputUi = getToolInputFileUi(tool);
    elements.dropZoneLabel.textContent = inputUi.dropLabel;
    elements.fileInput.setAttribute("accept", inputUi.accept);
    updateDirectInputFileStatus(tool);
    updateReadLayoutMainInputVisibility(tool);
  }

  function collectInputPlacementOptions(options = []) {
    return options.flatMap((option) => {
      if (option.type !== "group") {
        return option.placement === "input" ? [option] : [];
      }
      const children = collectInputPlacementOptions(option.options ?? []);
      return children.length > 0
        ? [{ ...option, options: children }]
        : [];
    });
  }

  function renderInputPlacementOptions(tool = state.selectedTool) {
    elements.inputPanel.querySelector(".input-placement-options")?.remove();
    if (
      isSamBamSummaryRegionViewerTool() ||
      isVcfTabbedInputTool() ||
      isAlignmentViewerTool() ||
      isFastaSourceTabbedTool(tool) ||
      isFastaRegionExtractorTool() ||
      tool?.metadata?.id === "read-mapping-coverage"
    ) {
      return;
    }
    const placementOptions = collectInputPlacementOptions(tool?.metadata?.options ?? []);
    if (placementOptions.length === 0 || !appendToolOptionControl) {
      return;
    }
    const fragment = document.createDocumentFragment();
    const defaultValues = getDefaultOptionValues
      ? getDefaultOptionValues(tool?.metadata?.options ?? [])
      : Object.fromEntries(flattenOptions(tool?.metadata?.options ?? [])
        .filter((option) => option.id)
        .map((option) => [option.id, option.defaultValue]));
    for (const option of placementOptions) {
      if (option.type === "group") {
        for (const child of option.options ?? []) {
          appendToolOptionControl(fragment, child, defaultValues);
        }
      } else {
        appendToolOptionControl(fragment, option, defaultValues);
      }
    }
    const container = document.createElement("div");
    container.className = "input-placement-options";
    container.append(fragment);
    groupRelatedInputFileOptions(container);
    elements.dropZone.before(container);
    container
      .querySelectorAll("input[name='readLayout']")
      .forEach((input) => input.addEventListener("change", () => {
        updateReadLayoutMainInputVisibility(tool);
        setTimeout(() => updateReadLayoutMainInputVisibility(tool), 0);
      }));
    updateReadLayoutMainInputVisibility(tool);
    setTimeout(() => updateReadLayoutMainInputVisibility(tool), 0);
  }

  function updateReadLayoutMainInputVisibility(tool = state.selectedTool) {
    const readLayoutOption = getInputReadLayoutOption(tool);
    if (!readLayoutOption) {
      return;
    }
    const readLayout = getActiveInputReadLayout(tool);
    const pairedMode = readLayout === "paired";
    const hideMainInput = pairedMode;
    elements.dropZone.hidden = hideMainInput;
    elements.fileInput.closest(".file-button").hidden = hideMainInput;
    elements.sequenceInput.hidden = hideMainInput;
    if (hideMainInput) {
      elements.inputFileStatus.hidden = true;
      elements.inputFileStatus.textContent = "";
      elements.sequenceInput.placeholder = "";
    } else {
      updateDirectInputFileStatus(tool);
    }

    for (const option of flattenOptions(tool?.metadata?.options ?? [])) {
      if (option.visibleWhen?.option === "readLayout") {
        const visibleValues = Array.isArray(option.visibleWhen.value)
          ? option.visibleWhen.value
          : [option.visibleWhen.value];
        const visible = visibleValues.includes(readLayout);
        for (const root of [elements.inputPanel, elements.toolOptions]) {
          root
            ?.querySelectorAll(`[data-option-id="${option.id}"]`)
            .forEach((row) => {
              row.hidden = !visible;
            });
        }
        updateRelatedInputFileGroupVisibility();
      }
      if (option.dependsOn === "readLayout") {
        const select = elements.toolOptions.querySelector(`select[name="${option.id}"]`);
        if (!select) {
          continue;
        }
        const current = select.value;
        const choices = (option.choices ?? []).filter((choice) =>
          choice.always ||
          (choice.value === option.defaultValue && !choice.dependsOnValue) ||
          (Array.isArray(choice.dependsOnValue)
            ? choice.dependsOnValue.includes(readLayout)
            : choice.dependsOnValue === readLayout)
        );
        select.textContent = "";
        for (const choice of choices) {
          const optionElement = document.createElement("option");
          optionElement.value = choice.value;
          optionElement.textContent = choice.label;
          select.append(optionElement);
        }
        select.value = choices.some((choice) => choice.value === current)
          ? current
          : choices.some((choice) => choice.value === option.defaultValue)
            ? option.defaultValue
            : choices[0]?.value ?? "";
      }
    }
    updateInputActionButtons();
  }

  function groupRelatedInputFileOptions(container) {
    const read1 = container.querySelector('[data-option-id="read1FastqFile"].file-option-row');
    const read2 = container.querySelector('[data-option-id="read2FastqFile"].file-option-row');
    if (!read1 || !read2 || read1.parentElement !== container || read2.parentElement !== container) {
      return;
    }

    const group = document.createElement("div");
    group.className = "paired-input-file-grid";
    group.dataset.relatedInputFileGroup = "fastq-pair";
    read1.before(group);
    group.append(read1, read2);
    updateRelatedInputFileGroupVisibility(container);
  }

  function updateRelatedInputFileGroupVisibility(root = elements.inputPanel) {
    root
      ?.querySelectorAll("[data-related-input-file-group]")
      .forEach((group) => {
        group.hidden = Array.from(group.children).every((child) => child.hidden);
      });
  }

  function getOptions() {
    const values = {};
    const getOptionRoot = (option) => option.placement === "input" ? elements.inputPanel : elements.toolOptions;

    for (const option of flattenOptions(state.selectedTool.metadata.options ?? [])) {
      const optionRoot = getOptionRoot(option);
      if (option.type === "radio" || option.type === "select") {
        values[option.id] =
          optionRoot.querySelector(`select[name="${option.id}"]`)?.value ??
          optionRoot.querySelector(`input[name="${option.id}"]:checked`)?.value ??
          option.defaultValue;
      } else if (option.type === "checkbox") {
        values[option.id] = optionRoot.querySelector(`#${option.id}`)?.checked ?? option.defaultValue;
      } else if (option.type === "number") {
        values[option.id] =
          Number.parseInt(optionRoot.querySelector(`#${option.id}`)?.value, 10) ||
          option.defaultValue;
      } else if (option.type === "text" || option.type === "textarea") {
        values[option.id] = optionRoot.querySelector(`#${option.id}`)?.value ?? option.defaultValue ?? "";
      } else if (option.type === "file") {
        const input = optionRoot.querySelector(`#${option.id}`);
        const pasteArea = option.pasteArea === true
          ? optionRoot.querySelector(`#${option.id}Text`)
          : null;
        const pastedText = pasteArea && !pasteArea.closest("[hidden]")
          ? pasteArea.value ?? ""
          : "";
        values[option.id] = String(pastedText).trim()
          ? {
            text: pastedText,
            name: option.pasteName ?? `${option.id}.txt`,
            size: new Blob([pastedText]).size
          }
          : option.multiple === true
            ? Array.from(input?.files ?? [])
            : input?.files?.[0] ?? null;
      } else if (option.type === "rule-list") {
        const control = optionRoot.querySelector(`#${option.id}`);
        values[option.id] = control
          ? (serializeRuleListControl(control) || (option.defaultValue ?? ""))
          : (option.defaultValue ?? "");
      } else if (option.type === "value-list") {
        const control = optionRoot.querySelector(`#${option.id}`);
        values[option.id] = control
          ? (serializeValueListControl(control) || (option.defaultValue ?? ""))
          : (option.defaultValue ?? "");
      }
    }

    const directFileOptionId = getDirectInputFileOptionId(state.selectedTool);
    if (directFileOptionId) {
      values[directFileOptionId] = getCurrentDirectInputFile(state.selectedTool);
    }

    if (isSangerTraceViewerTool()) {
      return {
        ...values,
        traceSettings: sangerTraceWorkspace.getSettings(values.traceSettings)
      };
    }

    return values;
  }

  function clearToolInputOutput() {
    workspaceInputSources.setToolSourceMode(state.selectedTool?.metadata?.id, "paste");
    clearDirectInputFile({ updateStatus: false });
    updateInputFileUi(state.selectedTool);
    elements.sequenceInput.value = "";
    elements.splitInputPanel.querySelectorAll(".split-input-textarea").forEach((textarea) => {
      textarea.value = "";
    });
    if (isSangerTraceViewerTool()) {
      sangerTraceWorkspace.clearInputs();
    }
    elements.inputPanel.querySelectorAll(".input-placement-options input[type='file']").forEach((input) => {
      input.value = "";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    elements.inputPanel.querySelectorAll(".input-placement-options textarea").forEach((textarea) => {
      textarea.value = "";
    });
    if (isSamBamSummaryRegionViewerTool()) {
      elements.inputPanel
        .querySelectorAll("#samInputFile, #indexedBamFile, #bamIndexFile")
        .forEach((input) => {
          input.value = "";
        });
      updateSamBamInputModeUi();
    }
    if (isVcfTabbedInputTool()) {
      elements.inputPanel
        .querySelectorAll("#vcfInputFile, #indexedVcfFile, #indexFile")
        .forEach((input) => {
          input.value = "";
        });
      updateVcfInputModeUi();
    }
    if (isAlignmentViewerTool()) {
      elements.inputPanel
        .querySelectorAll("#samInputFile, #indexedBamFile, #bamIndexFile, #vcfInputFile, #indexedVcfFile, #indexFile, #referenceGenomeFastaFile, #referenceGenomeFaiFile, #referenceGenomeGziFile")
        .forEach((input) => {
          input.value = "";
        });
      updateAlignmentViewerInputUi();
    }
    if (isFastaSourceTabbedTool()) {
      elements.inputPanel
        .querySelectorAll("#loadedFastaSourceFile, #fastaFile, #faiFile, #gziFile")
        .forEach((input) => {
          input.value = "";
        });
      updateFastaSourceInputUi();
    }
    if (isFastaRegionExtractorTool()) {
      elements.inputPanel
        .querySelectorAll("#loadedFastaSourceFile, #fastaFile, #faiFile, #gziFile")
        .forEach((input) => {
          input.value = "";
        });
      setFastaRegionSourceMode("loaded");
      updateFastaRegionExtractorSourceUi();
    }
    if (isProteinStructureViewerTool() || isProteinConservationStructureViewerTool()) {
      updateProteinStructureViewerUi();
    }
    sangerTraceWorkspace.update();
    if (isMarkdownNotebookSelected()) {
      syncMarkdownWorkspaceFromSource("Editor cleared.");
    }
    resetToolOutputViewer();
    updateInputActionButtons();
    updateMarkdownInputUi();
    workspaceInputSources.renderToolSource();
  }

  function formatExampleInputForDisplay(exampleText) {
    return wrapFastaText(exampleText ?? "", 60);
  }

  function loadSelectedToolExample() {
    if (!hasLoadableExampleForActiveInputMode(state.selectedTool)) {
      updateInputActionButtons();
      return;
    }
    workspaceInputSources.setToolSourceMode(state.selectedTool?.metadata?.id, "paste");
    clearDirectInputFile({ updateStatus: false });
    updateInputFileUi(state.selectedTool);
    const activeFileOptionExamples = getActiveInputFileOptionExamples(state.selectedTool);
    if (state.selectedTool.metadata.splitInput) {
      renderSplitInputPanel(state.selectedTool);
    } else if (activeFileOptionExamples.length > 0) {
      elements.sequenceInput.value = "";
      elements.inputPanel.querySelectorAll(".input-placement-options input[type='file']").forEach((input) => {
        input.value = "";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      for (const option of activeFileOptionExamples) {
        const textarea = elements.inputPanel.querySelector(`#${option.id}Text`);
        if (textarea) {
          textarea.value = formatExampleInputForDisplay(option.example);
        }
      }
    } else {
      elements.sequenceInput.value = toolRequiresInput(state.selectedTool)
        ? formatExampleInputForDisplay(state.selectedTool.example ?? "")
        : "";
    }
    if (isMarkdownNotebookSelected()) {
      syncMarkdownWorkspaceFromSource("Loaded the bundled notebook example.");
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
      elements.inputPanel
        .querySelectorAll("#loadedFastaSourceFile, #fastaFile, #faiFile, #gziFile")
        .forEach((input) => {
          input.value = "";
        });
      updateFastaRegionExtractorSourceUi();
      setFastaRegionSourceMode("loaded");
    }
    if (isProteinStructureViewerTool() || isProteinConservationStructureViewerTool()) {
      updateProteinStructureViewerUi();
    }
    sangerTraceWorkspace.update();
    clearToolOutput();
    updateInputActionButtons();
    updateToolOptionSuggestions({ autofillColumns: true, forceAutofillColumns: true });
    updateMarkdownInputUi();
    workspaceInputSources.renderToolSource();
  }

  function updateInputActionButtons() {
    elements.clearInput.hidden = false;
    elements.workflowClearInput.hidden = false;
    const canLoadExample = hasLoadableExampleForActiveInputMode(state.selectedTool);
    elements.loadExample.hidden = false;
    elements.loadExample.disabled = !canLoadExample;
    elements.loadExample.title = canLoadExample
      ? ""
      : "No example is available for the active input mode.";
    elements.loadExample.setAttribute("aria-disabled", String(!canLoadExample));
  }

  return {
    getRunButtonLabel,
    toolRequiresInput,
    getToolInputFileUi,
    getDirectInputFileOptionId,
    getCurrentDirectInputFile,
    clearDirectInputFile,
    setDirectInputFile,
    updateDirectInputFileStatus,
    updateInputFileUi,
    renderInputPlacementOptions,
    getOptions,
    clearToolInputOutput,
    formatExampleInputForDisplay,
    loadSelectedToolExample,
    updateInputActionButtons
  };
}
