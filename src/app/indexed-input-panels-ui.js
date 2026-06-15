import {
  createTabbedInputWorkflowTabs,
  updateTabbedInputWorkflowTabs
} from "./tabbed-input-workflow.js";
import {
  bamIndexLooksMatched,
  indexedGenomeFaiLooksMatched,
  indexedGenomeFastaLooksCompressed,
  indexedGenomeGziLooksMatched,
  looksLikeCompressedVcfForIndexing,
  summarizeSamReferencesFromText,
  summarizeVcfFromText,
  vcfIndexLooksMatched
} from "./indexed-input-summaries.js";

export function createIndexedInputPanelsController({
  elements,
  isSamBamSummaryRegionViewerTool,
  isVcfExtractorTool,
  isVcfTabbedInputTool,
  isFastaSourceTabbedTool,
  isFastaRegionExtractorTool,
  isIndexedGenomeRegionViewerTool,
  getSelectedTool,
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
}) {
let samBamHeaderPreviewToken = 0;
let vcfHeaderPreviewToken = 0;
const samBamOutputFormatByMode = new Map();
const vcfDataTypeByMode = new Map();
const vcfOutputFormatByMode = new Map();

const SAM_BAM_SOURCE_MODES = {
  "sam-text": {
    tabText: "SAM / SAM.GZ",
    description: "Paste SAM text, upload SAM/SAM.GZ, or choose a local SAM/SAM.GZ file for whole-file scanning."
  },
  "indexed-bam": {
    tabText: "Indexed BAM + BAI/CSI",
    description: "Choose a BAM file with its matching BAI or CSI index for bounded region queries."
  }
};

const VCF_SOURCE_MODES = {
  "paste-upload": {
    tabText: "Paste/upload VCF",
    description: "Paste VCF text or upload VCF/VCF.GZ for browser-local whole-file scanning."
  },
  "indexed-vcf": {
    tabText: "Indexed VCF + TBI/CSI",
    description: "Choose a bgzip-compressed VCF.GZ file with a matching TBI or CSI index for bounded region queries."
  }
};

const FASTA_REGION_SOURCE_MODES = {
  loaded: {
    tabText: "Paste/upload FASTA",
    description: "Paste FASTA records below or use a FASTA/FASTA.GZ file for local scans.",
    optionValue: "loaded"
  },
  fasta: {
    tabText: "Indexed FASTA + FAI",
    description: "Choose an uncompressed FASTA file and matching .fai index.",
    optionValue: "indexed",
    fastaLabel: "Uncompressed FASTA",
    fastaAccept: ".fa,.fasta,.fna,.faa,.txt",
    fastaDropLabel: "Drop uncompressed FASTA here"
  },
  bgzf: {
    tabText: "BGZF FASTA + FAI + GZI",
    description: "Choose a BGZF-compressed FASTA file with matching .fai and .gzi indexes.",
    optionValue: "bgzf",
    fastaLabel: "BGZF-compressed FASTA",
    fastaAccept: ".fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.bgz",
    fastaDropLabel: "Drop BGZF-compressed FASTA here"
  }
};

const FASTA_SOURCE_TAB_MODES = {
  loaded: {
    tabText: "Paste/upload FASTA",
    description: "Paste FASTA records below or use a FASTA/FASTA.GZ file for local scans.",
    fastaLabel: "FASTA/FASTA.GZ file",
    fastaAccept: ".fa,.fasta,.fna,.faa,.txt,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz",
    fastaDropLabel: "Drop FASTA or FASTA.GZ here"
  },
  indexed: {
    tabText: "Indexed FASTA + FAI",
    description: "Choose an uncompressed FASTA file and matching .fai index.",
    fastaLabel: "Uncompressed FASTA",
    fastaAccept: ".fa,.fasta,.fna,.faa,.txt",
    fastaDropLabel: "Drop uncompressed FASTA here"
  },
  bgzf: {
    tabText: "BGZF FASTA + FAI + GZI",
    description: "Choose a BGZF-compressed FASTA file with matching .fai and .gzi indexes.",
    fastaLabel: "BGZF-compressed FASTA",
    fastaAccept: ".fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.bgz",
    fastaDropLabel: "Drop BGZF-compressed FASTA here"
  }
};

function createSourceModeTabs({ modes, selectedMode, ariaLabel, onSelect }) {
  return createTabbedInputWorkflowTabs({
    document,
    modes,
    selectedMode,
    ariaLabel,
    onSelect
  });
}

function ensureSourceModeRadios(panel, name, modes, selectedMode) {
  let holder = panel.querySelector(`[data-source-mode-radios="${name}"]`);
  if (!holder) {
    holder = document.createElement("span");
    holder.dataset.sourceModeRadios = name;
    holder.hidden = true;
    for (const mode of Object.keys(modes)) {
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = name;
      radio.value = mode;
      holder.append(radio);
    }
    panel.append(holder);
  }
  holder.querySelectorAll(`input[name="${name}"]`).forEach((radio) => {
    radio.checked = radio.value === selectedMode;
  });
}

function getSelectedSamBamSourceMode() {
  if (!isSamBamSummaryRegionViewerTool()) {
    return "";
  }
  return elements.toolOptions.querySelector('input[name="dataSourceMode"]:checked')?.value
    ?? elements.toolOptions.querySelector('select[name="dataSourceMode"]')?.value
    ?? "sam-text";
}

function getSelectedSamBamOutputFormat() {
  if (!isSamBamSummaryRegionViewerTool()) {
    return "";
  }
  return elements.toolOptions.querySelector('select[name="outputFormat"]')?.value
    ?? elements.toolOptions.querySelector('input[name="outputFormat"]:checked')?.value
    ?? "report";
}

function isSamBamRegionOutput(outputFormat = getSelectedSamBamOutputFormat()) {
  return ["alignment-tsv", "region-svg", "interactive-viewer"].includes(outputFormat);
}

function setSamBamSourceMode(mode) {
  if (!SAM_BAM_SOURCE_MODES[mode]) {
    return;
  }
  const currentMode = getSelectedSamBamSourceMode();
  if (SAM_BAM_SOURCE_MODES[currentMode]) {
    samBamOutputFormatByMode.set(currentMode, getSelectedSamBamOutputFormat());
  }
  setToolOptionValue("dataSourceMode", mode);
  setToolOptionValue(
    "outputFormat",
    samBamOutputFormatByMode.get(mode) ?? (mode === "indexed-bam" ? "alignment-tsv" : "report")
  );
  if (!dispatchToolOptionChange("dataSourceMode")) {
    updateSamBamInputModeUi();
  }
  clearToolOutput();
}

function getSelectedVcfSourceMode() {
  if (!isVcfTabbedInputTool()) {
    return "";
  }
  return elements.toolOptions.querySelector('input[name="vcfSourceMode"]:checked')?.value
    ?? elements.toolOptions.querySelector('select[name="vcfSourceMode"]')?.value
    ?? "paste-upload";
}

function getSelectedVcfDataType() {
  if (!isVcfExtractorTool()) {
    return "";
  }
  return elements.toolOptions.querySelector('select[name="dataType"]')?.value
    ?? elements.toolOptions.querySelector('input[name="dataType"]:checked')?.value
    ?? "info-tags";
}

function isVcfRegionTask(dataType = getSelectedVcfDataType()) {
  return ["genotypes", "region-variants"].includes(dataType);
}

function setVcfSourceMode(mode) {
  if (!VCF_SOURCE_MODES[mode]) {
    return;
  }
  const isExtractor = isVcfExtractorTool();
  if (isExtractor) {
    const currentMode = getSelectedVcfSourceMode();
    if (VCF_SOURCE_MODES[currentMode]) {
      vcfDataTypeByMode.set(currentMode, getSelectedVcfDataType());
      vcfOutputFormatByMode.set(currentMode, getToolOptionValue("outputFormat", "tsv"));
    }
  }
  setToolOptionValue("vcfSourceMode", mode);
  if (isExtractor) {
    setToolOptionValue(
      "dataType",
      vcfDataTypeByMode.get(mode) ?? (mode === "indexed-vcf" ? "region-variants" : "info-tags")
    );
    setToolOptionValue("outputFormat", vcfOutputFormatByMode.get(mode) ?? "tsv");
  }
  const changedSourceMode = dispatchToolOptionChange("vcfSourceMode");
  if (isExtractor) {
    dispatchToolOptionChange("dataType");
  }
  if (!changedSourceMode) {
    updateVcfInputModeUi();
  }
  updateVcfInputModeUi();
  clearToolOutput();
}

function getSamBamInputModePanel() {
  let panel = document.querySelector("#samBamInputModePanel");
  if (panel) {
    return panel;
  }
  panel = document.createElement("section");
  panel.id = "samBamInputModePanel";
  panel.className = "sam-bam-input-mode-panel";
  elements.sequenceInput.before(panel);
  return panel;
}

function removeSamBamInputModePanel() {
  document.querySelector("#samBamInputModePanel")?.remove();
}

function makeSamBamInputFeedback(summary) {
  if (!elements.sequenceInput.value.trim()) {
    return "Paste SAM text below or use a SAM/SAM.GZ file.";
  }
  const names = summary.references.map((reference) => reference.name).filter(Boolean);
  const parts = [];
  if (names.length > 0) {
    parts.push(`Detected ${pluralize(names.length, "reference")}: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", ..." : ""}.`);
  } else {
    parts.push(summary.hasSamHeader ? "No @SQ reference records were detected in the SAM header." : "No SAM header was detected.");
  }
  if (summary.sortOrder) {
    parts.push(`Sort order: ${summary.sortOrder}.`);
  }
  if (summary.alignmentLines > 0) {
    parts.push(`Preview scanned ${pluralize(summary.alignmentLines, "alignment line")}.`);
  }
  if (summary.truncated) {
    parts.push("Preview is limited; Run scans the selected input.");
  }
  return parts.join(" ");
}

function makeSamBamStatusBadge(text, tone = "neutral") {
  const badge = document.createElement("span");
  badge.className = `sam-bam-status-badge ${tone}`;
  badge.textContent = text;
  return badge;
}

function getSamBamBundleFiles() {
  return {
    bamFile: elements.inputPanel.querySelector("#indexedBamFile")?.files?.[0] ?? null,
    indexFile: elements.inputPanel.querySelector("#bamIndexFile")?.files?.[0] ?? null,
    samFile: elements.inputPanel.querySelector("#samInputFile")?.files?.[0] ?? null
  };
}

async function updateSamBamBamHeaderPreview(bamFile, indexFile, key) {
  const panel = document.querySelector("#samBamInputModePanel");
  const feedback = panel?.querySelector("#samBamHeaderFeedback");
  if (!panel || !feedback) {
    return;
  }
  const token = ++samBamHeaderPreviewToken;
  feedback.textContent = "Reading BAM header locally...";
  try {
    const { BamFile, BlobFile } = await import("../vendor/indexed-genomics/indexed-vcf-runtime.bundle.js");
    const indexName = String(indexFile.name ?? "").toLowerCase();
    const fileArgs = {
      bamFilehandle: new BlobFile(bamFile)
    };
    if (indexName.endsWith(".csi")) {
      fileArgs.csiFilehandle = new BlobFile(indexFile);
    } else {
      fileArgs.baiFilehandle = new BlobFile(indexFile);
    }
    const bam = new BamFile(fileArgs);
    await bam.getHeader();
    const headerText = typeof bam.getHeaderText === "function"
      ? await bam.getHeaderText()
      : String(bam.header ?? "");
    if (token !== samBamHeaderPreviewToken || panel.dataset.headerPreviewKey !== key) {
      return;
    }
    const summary = summarizeSamReferencesFromText(headerText);
    const names = summary.references.map((reference) => reference.name).filter(Boolean);
    panel.dataset.referenceSuggestions = names.join("\n");
    feedback.textContent = names.length > 0
      ? `BAM header references: ${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""}.`
      : "BAM header was read, but no @SQ references were detected.";
    updateToolOptionSuggestions();
  } catch (error) {
    if (token !== samBamHeaderPreviewToken || panel.dataset.headerPreviewKey !== key) {
      return;
    }
    panel.dataset.referenceSuggestions = "";
    feedback.textContent = `Could not preview the BAM header: ${error.message}`;
    updateToolOptionSuggestions();
  }
}

function updateSamBamFileBundleStatus() {
  if (!isSamBamSummaryRegionViewerTool()) {
    return;
  }
  const panel = document.querySelector("#samBamInputModePanel");
  if (!panel) {
    return;
  }
  const { bamFile, indexFile, samFile } = getSamBamBundleFiles();
  const samStatus = panel.querySelector("#samInputFileStatus");
  if (samStatus) {
    samStatus.hidden = !samFile;
    samStatus.replaceChildren(
      ...(samFile ? [makeSamBamStatusBadge(`SAM file loaded: ${samFile.name}`, "ok")] : [])
    );
  }
  const bundleStatus = panel.querySelector("#samBamBundleStatus");
  if (!bundleStatus) {
    return;
  }
  const badges = [];
  if (bamFile) {
    badges.push(makeSamBamStatusBadge(`BAM loaded: ${bamFile.name}`, "ok"));
  }
  if (/\.csi$/i.test(indexFile?.name ?? "")) {
    badges.push(makeSamBamStatusBadge("CSI index detected", "ok"));
  } else if (indexFile) {
    badges.push(makeSamBamStatusBadge("BAI index detected", "ok"));
  }
  if (bamFile && indexFile) {
    badges.push(bamIndexLooksMatched(bamFile, indexFile)
      ? makeSamBamStatusBadge("Index name matches BAM", "ok")
      : makeSamBamStatusBadge("Check that the index matches this BAM", "warning"));
  }
  bundleStatus.replaceChildren(...badges);
  const headerFeedback = panel.querySelector("#samBamHeaderFeedback");
  if (!headerFeedback) {
    return;
  }
  if (!bamFile || !indexFile) {
    panel.dataset.headerPreviewKey = "";
    panel.dataset.referenceSuggestions = "";
    headerFeedback.textContent = "References from the BAM header will appear after both files are selected.";
    return;
  }
  const key = `${bamFile.name}:${bamFile.size}:${indexFile.name}:${indexFile.size}`;
  if (panel.dataset.headerPreviewKey !== key) {
    panel.dataset.headerPreviewKey = key;
    updateSamBamBamHeaderPreview(bamFile, indexFile, key);
  }
}

function assignSamBamBundleFiles(files) {
  const list = Array.from(files ?? []);
  if (list.length === 0) {
    return;
  }
  const bamFile = list.find((file) => /\.bam$/i.test(file.name ?? ""));
  const indexFile = list.find((file) => /\.(bai|csi)$/i.test(file.name ?? ""));
  const samFile = list.find((file) => /\.(sam|sam\.gz|gz)$/i.test(file.name ?? ""));
  if (bamFile) {
    const input = elements.inputPanel.querySelector("#indexedBamFile");
    if (input) {
      setFileOptionFiles(input, [bamFile], false);
    }
  }
  if (indexFile) {
    const input = elements.inputPanel.querySelector("#bamIndexFile");
    if (input) {
      setFileOptionFiles(input, [indexFile], false);
    }
  }
  if (samFile) {
    const input = elements.inputPanel.querySelector("#samInputFile");
    if (input) {
      setFileOptionFiles(input, [samFile], false);
    }
  }
  updateSamBamFileBundleStatus();
  clearToolOutput();
}

function appendSamBamFileSlot(parent, { id, label, accept, dropLabel }) {
  const slot = document.createElement("div");
  slot.className = "sam-bam-file-slot";
  const heading = document.createElement("div");
  heading.className = "sam-bam-file-slot-heading";
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
  browseText.textContent = "Browse file";
  browse.append(input, browseText);
  heading.append(title, browse);
  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone sam-bam-file-drop-zone";
  dropZone.tabIndex = 0;
  dropZone.textContent = dropLabel;
  input.addEventListener("change", () => {
    updateSamBamFileBundleStatus();
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
    updateSamBamFileBundleStatus();
    clearToolOutput();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    input.click();
  });
  slot.append(heading, dropZone);
  parent.append(slot);
}

function renderSamBamSamInputPanel(panel) {
  panel.textContent = "";
  panel.dataset.mode = "sam-text";
  panel.className = "sam-bam-input-mode-panel sam-mode";
  const summary = summarizeSamReferencesFromText(elements.sequenceInput.value);
  panel.dataset.referenceSuggestions = summary.references.map((reference) => reference.name).join("\n");
  const sourceTabs = createSourceModeTabs({
    modes: SAM_BAM_SOURCE_MODES,
    selectedMode: "sam-text",
    ariaLabel: "SAM/BAM source type",
    onSelect: setSamBamSourceMode
  });
  const title = document.createElement("strong");
  title.textContent = "SAM input";
  const text = document.createElement("p");
  text.textContent = "Paste SAM text below or use a SAM/SAM.GZ file for larger local scans.";
  const direct = document.createElement("div");
  direct.className = "sam-bam-direct-file";
  appendSamBamFileSlot(direct, {
    id: "samInputFile",
    label: "SAM/SAM.GZ file",
    accept: ".sam,.sam.gz,.gz",
    dropLabel: "Drop SAM or SAM.GZ here"
  });
  const status = document.createElement("div");
  status.id = "samInputFileStatus";
  status.className = "sam-bam-status-row";
  const feedback = document.createElement("p");
  feedback.className = "sam-bam-input-feedback";
  feedback.textContent = makeSamBamInputFeedback(summary);
  panel.append(sourceTabs, title, text, direct, status, feedback);
  updateSamBamFileBundleStatus();
}

function renderSamBamIndexedBamPanel(panel) {
  panel.textContent = "";
  panel.dataset.mode = "indexed-bam";
  panel.dataset.referenceSuggestions = "";
  panel.className = "sam-bam-input-mode-panel bam-mode";
  const sourceTabs = createSourceModeTabs({
    modes: SAM_BAM_SOURCE_MODES,
    selectedMode: "indexed-bam",
    ariaLabel: "SAM/BAM source type",
    onSelect: setSamBamSourceMode
  });
  const title = document.createElement("strong");
  title.textContent = "Indexed BAM files";
  const text = document.createElement("p");
  text.textContent = "Choose a BAM file and matching BAI/CSI index. The region controls choose what to inspect.";
  const bundle = document.createElement("div");
  bundle.className = "sam-bam-file-bundle";
  bundle.tabIndex = 0;
  bundle.addEventListener("dragover", (event) => {
    event.preventDefault();
    bundle.classList.add("drag-over");
  });
  bundle.addEventListener("dragleave", () => bundle.classList.remove("drag-over"));
  bundle.addEventListener("drop", (event) => {
    event.preventDefault();
    bundle.classList.remove("drag-over");
    assignSamBamBundleFiles(event.dataTransfer?.files);
  });
  appendSamBamFileSlot(bundle, {
    id: "indexedBamFile",
    label: "BAM file",
    accept: ".bam",
    dropLabel: "Drop BAM file here"
  });
  appendSamBamFileSlot(bundle, {
    id: "bamIndexFile",
    label: "BAI or CSI index",
    accept: ".bai,.csi",
    dropLabel: "Drop matching BAI or CSI index here"
  });
  const status = document.createElement("div");
  status.id = "samBamBundleStatus";
  status.className = "sam-bam-status-row";
  const headerFeedback = document.createElement("p");
  headerFeedback.id = "samBamHeaderFeedback";
  headerFeedback.className = "sam-bam-input-feedback";
  headerFeedback.textContent = "References from the BAM header will appear after both files are selected.";
  panel.append(sourceTabs, title, text, bundle, status, headerFeedback);
  updateSamBamFileBundleStatus();
}

function updateSamBamInputModeUi() {
  if (!isSamBamSummaryRegionViewerTool()) {
    removeSamBamInputModePanel();
    return;
  }
  const mode = getSelectedSamBamSourceMode();
  const outputSelect = elements.toolOptions.querySelector('select[name="outputFormat"]');
  if (mode === "indexed-bam" && outputSelect?.value === "report") {
    outputSelect.value = "alignment-tsv";
  }
  const outputFormat = getSelectedSamBamOutputFormat();
  const showRegion = mode === "indexed-bam" || isSamBamRegionOutput(outputFormat);
  const regionGroup = elements.toolOptions.querySelector('[data-option-id="regionToInspect"]');
  if (regionGroup) {
    regionGroup.hidden = !showRegion;
  }
  const sourceGroup = elements.toolOptions.querySelector('[data-option-id="dataSource"]');
  if (sourceGroup) {
    sourceGroup.hidden = true;
  }
  const useSamTextInput = mode !== "indexed-bam";
  elements.dropZone.hidden = true;
  elements.fileInput.closest(".file-button").hidden = true;
  elements.sequenceInput.hidden = !useSamTextInput;
  elements.inputPanel.dataset.samBamMode = mode;
  const panel = getSamBamInputModePanel();
  const hasExpectedPanel = mode === "indexed-bam"
    ? Boolean(panel.querySelector("#indexedBamFile") && panel.querySelector("#bamIndexFile"))
    : Boolean(panel.querySelector("#samInputFile"));
  if (panel.dataset.mode !== mode || !panel.querySelector(".file-source-tabs") || !hasExpectedPanel) {
    if (mode === "indexed-bam") {
      renderSamBamIndexedBamPanel(panel);
    } else {
      renderSamBamSamInputPanel(panel);
    }
  } else if (mode === "sam-text") {
    const summary = summarizeSamReferencesFromText(elements.sequenceInput.value);
    panel.dataset.referenceSuggestions = summary.references.map((reference) => reference.name).join("\n");
    const feedback = panel.querySelector(".sam-bam-input-feedback");
    if (feedback) {
      feedback.textContent = makeSamBamInputFeedback(summary);
    }
    updateSamBamFileBundleStatus();
  } else {
    updateSamBamFileBundleStatus();
  }
  updateToolOptionSuggestions();
}

function getVcfInputModePanel() {
  let panel = document.querySelector("#vcfInputModePanel");
  if (panel) {
    return panel;
  }
  panel = document.createElement("section");
  panel.id = "vcfInputModePanel";
  panel.className = "vcf-input-mode-panel";
  elements.sequenceInput.before(panel);
  return panel;
}

function removeVcfInputModePanel() {
  document.querySelector("#vcfInputModePanel")?.remove();
}

function makeVcfInputFeedback(summary) {
  if (!elements.sequenceInput.value.trim()) {
    return "Paste VCF text below or use a VCF/VCF.GZ file.";
  }
  const parts = [];
  parts.push(summary.version ? `Detected ${summary.version}.` : "VCF version was not detected.");
  if (summary.contigs.length > 0) {
    const names = summary.contigs.map((contig) => contig.id).filter(Boolean);
    parts.push(`Contigs: ${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""}.`);
  } else {
    parts.push("No ##contig lines were detected.");
  }
  parts.push(`${pluralize(summary.samples.length, "sample")} detected.`);
  if (summary.samples.length > 0) {
    parts.push(`Examples: ${summary.samples.slice(0, 4).join(", ")}${summary.samples.length > 4 ? ", ..." : ""}.`);
  }
  parts.push(`${pluralize(summary.definitionCount, "header definition")} and ${pluralize(summary.variantLines, "variant line")} in the preview.`);
  if (summary.truncated) {
    parts.push("Preview is limited; Run scans the selected input.");
  }
  return parts.join(" ");
}

function makeVcfStatusBadge(text, tone = "neutral") {
  const badge = document.createElement("span");
  badge.className = `vcf-status-badge ${tone}`;
  badge.textContent = text;
  return badge;
}

function getVcfBundleFiles() {
  return {
    vcfFile: elements.inputPanel.querySelector("#vcfInputFile")?.files?.[0] ?? null,
    indexedVcfFile: elements.inputPanel.querySelector("#indexedVcfFile")?.files?.[0] ?? null,
    indexFile: elements.inputPanel.querySelector("#indexFile")?.files?.[0] ?? null
  };
}

async function updateVcfIndexedHeaderPreview(vcfFile, indexFile, key) {
  const panel = document.querySelector("#vcfInputModePanel");
  const feedback = panel?.querySelector("#vcfHeaderFeedback");
  if (!panel || !feedback) {
    return;
  }
  const token = ++vcfHeaderPreviewToken;
  feedback.textContent = "Reading VCF header locally...";
  try {
    const { runBcftoolsViewHeader } = await import("../core/indexed-genomics/biowasm-hts.js");
    const headerText = await runBcftoolsViewHeader({ vcfFile, indexFile });
    if (token !== vcfHeaderPreviewToken || panel.dataset.headerPreviewKey !== key) {
      return;
    }
    const summary = summarizeVcfFromText(headerText);
    panel.dataset.contigSuggestions = summary.contigs.map((contig) => contig.id).join("\n");
    panel.dataset.sampleSuggestions = summary.samples.join("\n");
    const contigNames = summary.contigs.map((contig) => contig.id).filter(Boolean);
    const fragments = [];
    fragments.push(summary.version ? `Detected ${summary.version}.` : "VCF version was not detected.");
    fragments.push(contigNames.length > 0
      ? `Header contigs: ${contigNames.slice(0, 6).join(", ")}${contigNames.length > 6 ? ", ..." : ""}.`
      : "No ##contig lines were detected.");
    fragments.push(`${pluralize(summary.samples.length, "sample")} detected.`);
    feedback.textContent = fragments.join(" ");
    updateToolOptionSuggestions();
  } catch (error) {
    if (token !== vcfHeaderPreviewToken || panel.dataset.headerPreviewKey !== key) {
      return;
    }
    panel.dataset.contigSuggestions = "";
    panel.dataset.sampleSuggestions = "";
    feedback.textContent = `Could not preview the indexed VCF header: ${error.message}`;
    updateToolOptionSuggestions();
  }
}

function updateVcfFileBundleStatus() {
  if (!isVcfTabbedInputTool()) {
    return;
  }
  const panel = document.querySelector("#vcfInputModePanel");
  if (!panel) {
    return;
  }
  const { vcfFile, indexedVcfFile, indexFile } = getVcfBundleFiles();
  const directStatus = panel.querySelector("#vcfInputFileStatus");
  if (directStatus) {
    directStatus.hidden = !vcfFile;
    directStatus.replaceChildren(
      ...(vcfFile ? [makeVcfStatusBadge(`VCF file loaded: ${vcfFile.name}`, "ok")] : [])
    );
  }
  const bundleStatus = panel.querySelector("#vcfBundleStatus");
  if (!bundleStatus) {
    return;
  }
  const badges = [];
  if (indexedVcfFile) {
    badges.push(makeVcfStatusBadge(`VCF loaded: ${indexedVcfFile.name}`, "ok"));
    if (!looksLikeCompressedVcfForIndexing(indexedVcfFile)) {
      badges.push(makeVcfStatusBadge("Region queries require bgzip-compressed indexed VCF", "warning"));
    }
  }
  if (/\.csi$/i.test(indexFile?.name ?? "")) {
    badges.push(makeVcfStatusBadge("CSI index detected", "ok"));
  } else if (indexFile) {
    badges.push(makeVcfStatusBadge("TBI index detected", "ok"));
  }
  if (indexedVcfFile && indexFile) {
    badges.push(vcfIndexLooksMatched(indexedVcfFile, indexFile)
      ? makeVcfStatusBadge("Index appears to match", "ok")
      : makeVcfStatusBadge("Check that the index matches this VCF", "warning"));
  }
  bundleStatus.replaceChildren(...badges);
  const headerFeedback = panel.querySelector("#vcfHeaderFeedback");
  if (!headerFeedback) {
    return;
  }
  if (!indexedVcfFile || !indexFile) {
    panel.dataset.headerPreviewKey = "";
    panel.dataset.contigSuggestions = "";
    panel.dataset.sampleSuggestions = "";
    headerFeedback.textContent = "Header details will appear after both files are selected.";
    return;
  }
  const key = `${indexedVcfFile.name}:${indexedVcfFile.size}:${indexFile.name}:${indexFile.size}`;
  if (panel.dataset.headerPreviewKey !== key) {
    panel.dataset.headerPreviewKey = key;
    updateVcfIndexedHeaderPreview(indexedVcfFile, indexFile, key);
  }
}

function assignVcfBundleFiles(files) {
  const list = Array.from(files ?? []);
  if (list.length === 0) {
    return;
  }
  const indexedVcfFile = list.find((file) => /\.(vcf\.gz|bgz|gz)$/i.test(file.name ?? ""));
  const indexFile = list.find((file) => /\.(tbi|csi)$/i.test(file.name ?? ""));
  if (indexedVcfFile) {
    const input = elements.inputPanel.querySelector("#indexedVcfFile");
    if (input) {
      setFileOptionFiles(input, [indexedVcfFile], false);
    }
  }
  if (indexFile) {
    const input = elements.inputPanel.querySelector("#indexFile");
    if (input) {
      setFileOptionFiles(input, [indexFile], false);
    }
  }
  updateVcfFileBundleStatus();
  clearToolOutput();
}

function appendVcfFileSlot(parent, { id, label, accept, dropLabel }) {
  const slot = document.createElement("div");
  slot.className = "vcf-file-slot";
  const heading = document.createElement("div");
  heading.className = "vcf-file-slot-heading";
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
  browseText.textContent = "Browse file";
  browse.append(input, browseText);
  heading.append(title, browse);
  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone vcf-file-drop-zone";
  dropZone.tabIndex = 0;
  dropZone.textContent = dropLabel;
  input.addEventListener("change", () => {
    updateVcfFileBundleStatus();
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
    updateVcfFileBundleStatus();
    clearToolOutput();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    input.click();
  });
  slot.append(heading, dropZone);
  parent.append(slot);
}

function renderVcfPasteUploadPanel(panel) {
  panel.textContent = "";
  panel.dataset.mode = "paste-upload";
  panel.className = "vcf-input-mode-panel paste-mode";
  const summary = summarizeVcfFromText(elements.sequenceInput.value);
  panel.dataset.contigSuggestions = summary.contigs.map((contig) => contig.id).join("\n");
  panel.dataset.sampleSuggestions = summary.samples.join("\n");
  panel.dataset.geneSuggestions = (summary.genes ?? []).join("\n");
  const sourceTabs = createSourceModeTabs({
    modes: VCF_SOURCE_MODES,
    selectedMode: "paste-upload",
    ariaLabel: "VCF source type",
    onSelect: setVcfSourceMode
  });
  const title = document.createElement("strong");
  title.textContent = "VCF input";
  const text = document.createElement("p");
  text.textContent = "Paste VCF text below or use a VCF/VCF.GZ file for larger local scans.";
  const direct = document.createElement("div");
  direct.className = "vcf-direct-file";
  appendVcfFileSlot(direct, {
    id: "vcfInputFile",
    label: "VCF/VCF.GZ file",
    accept: ".vcf,.vcf.gz,.gz",
    dropLabel: "Drop VCF or VCF.GZ here"
  });
  const status = document.createElement("div");
  status.id = "vcfInputFileStatus";
  status.className = "vcf-status-row";
  const feedback = document.createElement("p");
  feedback.className = "vcf-input-feedback";
  feedback.textContent = makeVcfInputFeedback(summary);
  panel.append(sourceTabs, title, text, direct, status, feedback);
  updateVcfFileBundleStatus();
}

function renderVcfIndexedPanel(panel) {
  panel.textContent = "";
  panel.dataset.mode = "indexed-vcf";
  panel.dataset.contigSuggestions = "";
  panel.dataset.sampleSuggestions = "";
  panel.className = "vcf-input-mode-panel indexed-mode";
  const sourceTabs = createSourceModeTabs({
    modes: VCF_SOURCE_MODES,
    selectedMode: "indexed-vcf",
    ariaLabel: "VCF source type",
    onSelect: setVcfSourceMode
  });
  const title = document.createElement("strong");
  title.textContent = "Indexed VCF files";
  const text = document.createElement("p");
  text.textContent = "Choose a bgzip-compressed VCF.GZ file and matching TBI/CSI index. The region controls choose what to inspect.";
  const bundle = document.createElement("div");
  bundle.className = "vcf-file-bundle";
  bundle.tabIndex = 0;
  bundle.addEventListener("dragover", (event) => {
    event.preventDefault();
    bundle.classList.add("drag-over");
  });
  bundle.addEventListener("dragleave", () => bundle.classList.remove("drag-over"));
  bundle.addEventListener("drop", (event) => {
    event.preventDefault();
    bundle.classList.remove("drag-over");
    assignVcfBundleFiles(event.dataTransfer?.files);
  });
  appendVcfFileSlot(bundle, {
    id: "indexedVcfFile",
    label: "Indexed VCF.GZ file",
    accept: ".vcf.gz,.bgz,.gz",
    dropLabel: "Drop bgzip VCF.GZ here"
  });
  appendVcfFileSlot(bundle, {
    id: "indexFile",
    label: "TBI or CSI index",
    accept: ".tbi,.csi",
    dropLabel: "Drop matching TBI or CSI index here"
  });
  const status = document.createElement("div");
  status.id = "vcfBundleStatus";
  status.className = "vcf-status-row";
  const headerFeedback = document.createElement("p");
  headerFeedback.id = "vcfHeaderFeedback";
  headerFeedback.className = "vcf-input-feedback";
  headerFeedback.textContent = "Header details will appear after both files are selected.";
  panel.append(sourceTabs, title, text, bundle, status, headerFeedback);
  updateVcfFileBundleStatus();
}

function updateVcfInputModeUi() {
  if (!isVcfTabbedInputTool()) {
    removeVcfInputModePanel();
    return;
  }
  const mode = getSelectedVcfSourceMode();
  const isExtractor = isVcfExtractorTool();
  const dataTypeSelect = elements.toolOptions.querySelector('select[name="dataType"]');
  if (isExtractor && mode === "indexed-vcf" && dataTypeSelect && !isVcfRegionTask(dataTypeSelect.value)) {
    dataTypeSelect.value = "region-variants";
  }
  const dataType = isExtractor ? getSelectedVcfDataType() : "";
  const outputSelect = elements.toolOptions.querySelector('select[name="outputFormat"]');
  if (isExtractor && !isVcfRegionTask(dataType) && outputSelect?.value === "interactive-viewer") {
    outputSelect.value = "tsv";
  }
  const showRegion = mode === "indexed-vcf" || (isExtractor && isVcfRegionTask(dataType));
  const regionGroup = elements.toolOptions.querySelector('[data-option-id="vcfRegionToInspect"]');
  if (regionGroup) {
    regionGroup.hidden = !showRegion;
  }
  const sourceGroup = elements.toolOptions.querySelector('[data-option-id="vcfSource"]');
  if (sourceGroup) {
    sourceGroup.hidden = true;
  }
  const useTextInput = mode !== "indexed-vcf";
  elements.dropZone.hidden = true;
  elements.fileInput.closest(".file-button").hidden = true;
  elements.sequenceInput.hidden = !useTextInput;
  elements.inputPanel.dataset.vcfMode = mode;
  const panel = getVcfInputModePanel();
  const hasExpectedPanel = mode === "indexed-vcf"
    ? Boolean(panel.querySelector("#indexedVcfFile") && panel.querySelector("#indexFile"))
    : Boolean(panel.querySelector("#vcfInputFile"));
  if (panel.dataset.mode !== mode || !panel.querySelector(".file-source-tabs") || !hasExpectedPanel) {
    if (mode === "indexed-vcf") {
      renderVcfIndexedPanel(panel);
    } else {
      renderVcfPasteUploadPanel(panel);
    }
  } else if (mode === "paste-upload") {
    const summary = summarizeVcfFromText(elements.sequenceInput.value);
    panel.dataset.contigSuggestions = summary.contigs.map((contig) => contig.id).join("\n");
    panel.dataset.sampleSuggestions = summary.samples.join("\n");
    panel.dataset.geneSuggestions = (summary.genes ?? []).join("\n");
    const feedback = panel.querySelector(".vcf-input-feedback");
    if (feedback) {
      feedback.textContent = makeVcfInputFeedback(summary);
    }
    updateVcfFileBundleStatus();
  } else {
    updateVcfFileBundleStatus();
  }
  updateToolOptionSuggestions();
}

function getGenericFastaSourcePanel() {
  let panel = document.querySelector("#fastaSourceInputPanel");
  const usesSplitInput = selectedToolUsesSplitFastaSource();
  if (panel) {
    const isInSplitPanel = panel.parentElement === elements.splitInputPanel;
    if (usesSplitInput !== isInSplitPanel) {
      panel.remove();
      panel = null;
    }
  }
  if (panel) {
    if (usesSplitInput && elements.splitInputPanel.firstElementChild !== panel) {
      elements.splitInputPanel.prepend(panel);
    }
    return panel;
  }
  panel = document.createElement("section");
  panel.id = "fastaSourceInputPanel";
  panel.className = usesSplitInput
    ? "indexed-fasta-card fasta-source-input-panel fasta-source-split-input-panel"
    : "indexed-fasta-card fasta-source-input-panel";
  if (usesSplitInput) {
    elements.splitInputPanel.prepend(panel);
  } else {
    elements.sequenceInput.before(panel);
  }
  return panel;
}

function removeGenericFastaSourcePanel() {
  document.querySelector("#fastaSourceInputPanel")?.remove();
}

function getGenericFastaSourceMode(panel = document.querySelector("#fastaSourceInputPanel")) {
  return FASTA_SOURCE_TAB_MODES[panel?.dataset.sourceMode] ? panel.dataset.sourceMode : "loaded";
}

function getGenericFastaBundleFiles() {
  return {
    fastaFile: elements.inputPanel.querySelector("#fastaFile")?.files?.[0] ?? null,
    faiFile: elements.inputPanel.querySelector("#faiFile")?.files?.[0] ?? null,
    gziFile: elements.inputPanel.querySelector("#gziFile")?.files?.[0] ?? null
  };
}

function getPrimarySplitInputSection() {
  return elements.splitInputPanel.querySelector(".split-input-section");
}

function selectedToolUsesSplitFastaSource() {
  return Boolean(getSelectedTool()?.metadata?.splitInput);
}

function setPrimaryFastaEditorVisible(visible) {
  if (selectedToolUsesSplitFastaSource()) {
    const section = getPrimarySplitInputSection();
    if (section) {
      section.hidden = !visible;
      section.classList.toggle("split-input-source-body-only", visible);
    }
    return;
  }
  elements.sequenceInput.hidden = !visible;
}

function updateGenericFastaBundleStatus(panel = document.querySelector("#fastaSourceInputPanel")) {
  const status = panel?.querySelector("#fastaSourceBundleStatus");
  if (!panel || !status) {
    return;
  }
  const sourceMode = getGenericFastaSourceMode(panel);
  if (sourceMode === "loaded") {
    status.hidden = true;
    status.replaceChildren();
    return;
  }
  const { fastaFile, faiFile, gziFile } = getGenericFastaBundleFiles();
  const badges = [];
  if (fastaFile) {
    badges.push(makeIndexedGenomeStatusBadge(`${sourceMode === "bgzf" ? "BGZF FASTA" : "FASTA"} loaded: ${fastaFile.name}`, "ok"));
  }
  if (faiFile) {
    badges.push(makeIndexedGenomeStatusBadge(`FAI (.fai) loaded: ${faiFile.name}`, "ok"));
  }
  if (sourceMode === "bgzf" && gziFile) {
    badges.push(makeIndexedGenomeStatusBadge(`GZI (.gzi) loaded: ${gziFile.name}`, "ok"));
  }
  if (fastaFile && faiFile) {
    badges.push(indexedGenomeFaiLooksMatched(fastaFile, faiFile)
      ? makeIndexedGenomeStatusBadge("Index appears to match", "ok")
      : makeIndexedGenomeStatusBadge("Check that the FAI matches this FASTA", "warning"));
  }
  if (sourceMode === "bgzf" && fastaFile && gziFile) {
    badges.push(indexedGenomeGziLooksMatched(fastaFile, gziFile)
      ? makeIndexedGenomeStatusBadge("GZI name matches FASTA", "ok")
      : makeIndexedGenomeStatusBadge("Check that the GZI matches this FASTA", "warning"));
  }
  status.hidden = badges.length === 0;
  status.replaceChildren(...badges);
}

function setGenericFastaSourceMode(mode, panel = document.querySelector("#fastaSourceInputPanel")) {
  if (!FASTA_SOURCE_TAB_MODES[mode]) {
    return;
  }
  const sourcePanel = panel ?? getGenericFastaSourcePanel();
  const config = FASTA_SOURCE_TAB_MODES[mode];
  const usesSplitInput = selectedToolUsesSplitFastaSource();
  sourcePanel.dataset.sourceMode = mode;
  sourcePanel.classList.toggle("fasta-source-split-input-panel", usesSplitInput);
  sourcePanel.classList.add("indexed-fasta-card");
  ensureSourceModeRadios(sourcePanel, "sourceMode", FASTA_SOURCE_TAB_MODES, mode);
  updateTabbedInputWorkflowTabs(sourcePanel, mode, { tabSelector: ".file-source-tab" });
  const title = sourcePanel.querySelector("#fastaSourceTitle");
  if (title) {
    title.hidden = false;
  }
  const description = sourcePanel.querySelector("#fastaSourceDescription");
  if (description) {
    description.textContent = config.description;
    description.hidden = false;
  }
  const loadedSlot = sourcePanel.querySelector("#fastaSourceLoadedFiles");
  if (loadedSlot) {
    loadedSlot.hidden = mode !== "loaded" || loadedSlot.childElementCount === 0;
  }
  const indexedBundle = sourcePanel.querySelector("#fastaSourceIndexedFiles");
  if (indexedBundle) {
    indexedBundle.hidden = mode === "loaded";
  }
  setPrimaryFastaEditorVisible(mode === "loaded");
  const fastaTitle = sourcePanel.querySelector('[data-file-slot="fastaFile"] .indexed-fasta-file-slot-heading strong');
  if (fastaTitle) {
    fastaTitle.textContent = config.fastaLabel;
  }
  const fastaInput = sourcePanel.querySelector('[data-file-slot="fastaFile"] input[type="file"]');
  if (fastaInput) {
    fastaInput.accept = config.fastaAccept;
    fastaInput.setAttribute("aria-label", config.fastaLabel);
  }
  const fastaDropZone = sourcePanel.querySelector('[data-file-slot="fastaFile"] .indexed-fasta-file-drop-zone');
  if (fastaDropZone) {
    fastaDropZone.textContent = config.fastaDropLabel;
  }
  const gziSlot = sourcePanel.querySelector('[data-file-slot="gziFile"]');
  if (gziSlot) {
    gziSlot.hidden = mode !== "bgzf";
  }
  updateGenericFastaBundleStatus(sourcePanel);
}

function assignGenericFastaBundleFiles(files) {
  const list = Array.from(files ?? []);
  const fastaFile = list.find((file) =>
    !/(\.fai|\.gzi)$/i.test(file.name ?? "") &&
    /\.(fa|fasta|fna|faa|txt|gz|bgz)$/i.test(file.name ?? "")
  );
  const faiFile = list.find((file) => /\.fai$/i.test(file.name ?? ""));
  const gziFile = list.find((file) => /\.gzi$/i.test(file.name ?? ""));
  if (fastaFile) {
    const input = elements.inputPanel.querySelector("#fastaFile");
    if (input) {
      setFileOptionFiles(input, [fastaFile], false);
    }
  }
  if (faiFile) {
    const input = elements.inputPanel.querySelector("#faiFile");
    if (input) {
      setFileOptionFiles(input, [faiFile], false);
    }
  }
  if (gziFile) {
    const input = elements.inputPanel.querySelector("#gziFile");
    if (input) {
      setFileOptionFiles(input, [gziFile], false);
    }
  }
  if (gziFile || indexedGenomeFastaLooksCompressed(fastaFile)) {
    setGenericFastaSourceMode("bgzf");
  } else if (fastaFile || faiFile) {
    setGenericFastaSourceMode("indexed");
  }
  updateGenericFastaBundleStatus();
  clearToolOutput();
}

function appendGenericFastaFileSlot(parent, { id, label, accept, dropLabel }) {
  const slot = document.createElement("div");
  slot.className = "indexed-fasta-file-slot";
  slot.dataset.fileSlot = id;
  const heading = document.createElement("div");
  heading.className = "indexed-fasta-file-slot-heading";
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
  browseText.textContent = "Browse file";
  browse.append(input, browseText);
  heading.append(title, browse);
  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone indexed-fasta-file-drop-zone";
  dropZone.tabIndex = 0;
  dropZone.textContent = dropLabel;
  input.addEventListener("change", () => {
    if (id === "fastaFile" && input.files?.[0] && indexedGenomeFastaLooksCompressed(input.files[0])) {
      setGenericFastaSourceMode("bgzf");
    }
    updateGenericFastaBundleStatus();
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
    if (id === "fastaFile" && input.files?.[0] && indexedGenomeFastaLooksCompressed(input.files[0])) {
      setGenericFastaSourceMode("bgzf");
    }
    updateGenericFastaBundleStatus();
    clearToolOutput();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    input.click();
  });
  slot.append(heading, dropZone);
  parent.append(slot);
}

function appendGenericLoadedFastaSlot(parent) {
  if (selectedToolUsesSplitFastaSource()) {
    appendFastaRegionLoadedFileSlot(parent, {
      loadFile: async (file) => {
        const textarea = getPrimarySplitInputSection()?.querySelector(".split-input-textarea");
        if (!textarea) {
          return;
        }
        textarea.value = await readToolInputFileText(file);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        clearToolOutput();
        updateToolOptionSuggestions();
      },
      statusText: (file) => `Loaded ${file.name} into the FASTA source editor`
    });
    return;
  }
  appendFastaRegionLoadedFileSlot(parent);
}

function renderGenericFastaSourcePanel(panel) {
  panel.textContent = "";
  panel.dataset.rendered = "true";
  const sourceTabs = createSourceModeTabs({
    modes: FASTA_SOURCE_TAB_MODES,
    selectedMode: "loaded",
    ariaLabel: "FASTA source type",
    onSelect: (mode) => {
      setGenericFastaSourceMode(mode);
      dispatchToolOptionChange("sourceMode");
      clearToolOutput();
    }
  });
  const title = document.createElement("strong");
  title.id = "fastaSourceTitle";
  title.textContent = "FASTA source";
  const description = document.createElement("p");
  description.id = "fastaSourceDescription";
  description.className = "file-source-description";
  const loadedFiles = document.createElement("div");
  loadedFiles.id = "fastaSourceLoadedFiles";
  loadedFiles.className = "indexed-fasta-file-bundle";
  appendGenericLoadedFastaSlot(loadedFiles);

  const indexedFiles = document.createElement("div");
  indexedFiles.id = "fastaSourceIndexedFiles";
  indexedFiles.className = "indexed-fasta-file-bundle";
  indexedFiles.tabIndex = 0;
  indexedFiles.addEventListener("dragover", (event) => {
    event.preventDefault();
    indexedFiles.classList.add("drag-over");
  });
  indexedFiles.addEventListener("dragleave", () => indexedFiles.classList.remove("drag-over"));
  indexedFiles.addEventListener("drop", (event) => {
    event.preventDefault();
    indexedFiles.classList.remove("drag-over");
    assignGenericFastaBundleFiles(event.dataTransfer?.files);
  });
  appendGenericFastaFileSlot(indexedFiles, {
    id: "fastaFile",
    label: "Uncompressed FASTA",
    accept: ".fa,.fasta,.fna,.faa,.txt",
    dropLabel: "Drop uncompressed FASTA here"
  });
  appendGenericFastaFileSlot(indexedFiles, {
    id: "faiFile",
    label: "Matching .fai",
    accept: ".fai",
    dropLabel: "Drop matching .fai here"
  });
  appendGenericFastaFileSlot(indexedFiles, {
    id: "gziFile",
    label: "Matching .gzi",
    accept: ".gzi",
    dropLabel: "Drop matching .gzi here"
  });
  const status = document.createElement("div");
  status.id = "fastaSourceBundleStatus";
  status.className = "indexed-fasta-status-row";
  panel.append(sourceTabs, title, description, loadedFiles, indexedFiles, status);
  setGenericFastaSourceMode("loaded", panel);
}

function updateFastaSourceInputUi() {
  if (!isFastaSourceTabbedTool?.()) {
    removeGenericFastaSourcePanel();
    return;
  }
  const panel = getGenericFastaSourcePanel();
  const needsRender =
    panel.dataset.rendered !== "true" ||
    !panel.querySelector(".file-source-tabs") ||
    !panel.querySelector("#fastaSourceIndexedFiles") ||
    !panel.querySelector("#fastaFile") ||
    !panel.querySelector("#faiFile") ||
    !panel.querySelector("#gziFile");
  if (needsRender) {
    renderGenericFastaSourcePanel(panel);
  } else {
    setGenericFastaSourceMode(getGenericFastaSourceMode(panel), panel);
  }
}

function getFastaRegionSourcePanel() {
  let panel = document.querySelector("#fastaRegionSourcePanel");
  if (panel) {
    return panel;
  }
  panel = document.createElement("section");
  panel.id = "fastaRegionSourcePanel";
  panel.className = "indexed-fasta-card fasta-region-source-panel";
  elements.sequenceInput.before(panel);
  return panel;
}

function removeFastaRegionSourcePanel() {
  document.querySelector("#fastaRegionSourcePanel")?.remove();
}

function getFastaRegionSourceMode(panel = document.querySelector("#fastaRegionSourcePanel")) {
  if (panel?.dataset.sourceMode && FASTA_REGION_SOURCE_MODES[panel.dataset.sourceMode]) {
    return panel.dataset.sourceMode;
  }
  const optionValue = getToolOptionValue("sourceMode", "loaded");
  if (optionValue !== "indexed") {
    return "loaded";
  }
  return "fasta";
}

function getFastaRegionBundleFiles() {
  return {
    fastaFile: elements.inputPanel.querySelector("#fastaFile")?.files?.[0] ?? null,
    faiFile: elements.inputPanel.querySelector("#faiFile")?.files?.[0] ?? null,
    gziFile: elements.inputPanel.querySelector("#gziFile")?.files?.[0] ?? null
  };
}

function updateFastaRegionBundleStatus(panel = document.querySelector("#fastaRegionSourcePanel")) {
  const status = panel?.querySelector("#fastaRegionBundleStatus");
  if (!panel || !status) {
    return;
  }
  const sourceMode = getFastaRegionSourceMode(panel);
  const { fastaFile, faiFile, gziFile } = getFastaRegionBundleFiles();
  const badges = [];
  if (sourceMode === "loaded") {
    status.hidden = true;
    status.replaceChildren();
    return;
  }
  if (fastaFile) {
    badges.push(makeIndexedGenomeStatusBadge(`${sourceMode === "bgzf" ? "BGZF FASTA" : "FASTA"} loaded: ${fastaFile.name}`, "ok"));
  }
  if (faiFile) {
    badges.push(makeIndexedGenomeStatusBadge(`FAI (.fai) loaded: ${faiFile.name}`, "ok"));
  }
  if (sourceMode === "bgzf") {
    if (gziFile) {
      badges.push(makeIndexedGenomeStatusBadge(`GZI (.gzi) loaded: ${gziFile.name}`, "ok"));
    }
    if (fastaFile && gziFile) {
      badges.push(indexedGenomeGziLooksMatched(fastaFile, gziFile)
        ? makeIndexedGenomeStatusBadge("GZI name matches FASTA", "ok")
        : makeIndexedGenomeStatusBadge("Check that the GZI matches this FASTA", "warning"));
    }
  }
  if (fastaFile && faiFile) {
    badges.push(indexedGenomeFaiLooksMatched(fastaFile, faiFile)
      ? makeIndexedGenomeStatusBadge("Index appears to match", "ok")
      : makeIndexedGenomeStatusBadge("Check that the FAI matches this FASTA", "warning"));
  }
  status.hidden = badges.length === 0;
  status.replaceChildren(...badges);
}

function setFastaRegionSourceMode(mode, panel = document.querySelector("#fastaRegionSourcePanel")) {
  if (!FASTA_REGION_SOURCE_MODES[mode]) {
    return;
  }
  const sourcePanel = panel ?? getFastaRegionSourcePanel();
  sourcePanel.dataset.sourceMode = mode;
  const config = FASTA_REGION_SOURCE_MODES[mode];
  setToolOptionValue("sourceMode", config.optionValue);
  ensureSourceModeRadios(sourcePanel, "sourceMode", { loaded: {}, indexed: {}, bgzf: {} }, config.optionValue);
  updateTabbedInputWorkflowTabs(sourcePanel, mode, { tabSelector: ".file-source-tab" });
  const description = sourcePanel.querySelector("#fastaRegionSourceDescription");
  if (description) {
    description.textContent = config.description;
  }
  const indexedOnly = mode !== "loaded";
  const loadedCard = sourcePanel.querySelector("#fastaRegionLoadedFiles");
  if (loadedCard) {
    loadedCard.hidden = indexedOnly;
  }
  const fileCard = sourcePanel.querySelector("#fastaRegionIndexedFiles");
  if (fileCard) {
    fileCard.hidden = !indexedOnly;
  }
  elements.dropZone.hidden = true;
  elements.fileInput.closest(".file-button").hidden = true;
  elements.sequenceInput.hidden = indexedOnly;
  const loadedStatus = sourcePanel.querySelector("#loadedFastaSourceFileStatus");
  if (loadedStatus) {
    loadedStatus.hidden = true;
  }
  const fastaTitle = sourcePanel.querySelector('[data-file-slot="fastaFile"] .indexed-fasta-file-slot-heading strong');
  if (fastaTitle && config.fastaLabel) {
    fastaTitle.textContent = config.fastaLabel;
  }
  const fastaInput = sourcePanel.querySelector('[data-file-slot="fastaFile"] input[type="file"]');
  if (fastaInput && config.fastaLabel) {
    fastaInput.setAttribute("aria-label", config.fastaLabel);
  }
  if (fastaInput && config.fastaAccept) {
    fastaInput.setAttribute("accept", config.fastaAccept);
  }
  const fastaDropZone = sourcePanel.querySelector('[data-file-slot="fastaFile"] .indexed-fasta-file-drop-zone');
  if (fastaDropZone && config.fastaDropLabel) {
    fastaDropZone.textContent = config.fastaDropLabel;
  }
  const gziSlot = sourcePanel.querySelector('[data-file-slot="gziFile"]');
  if (gziSlot) {
    gziSlot.hidden = mode !== "bgzf";
  }
  updateFastaRegionBundleStatus(sourcePanel);
}

function assignFastaRegionBundleFiles(files) {
  const list = Array.from(files ?? []);
  if (list.length === 0) {
    return;
  }
  const fastaFile = list.find((file) =>
    !/(\.fai|\.gzi)$/i.test(file.name ?? "") &&
    /\.(fa|fasta|fna|faa|txt|gz|bgz)$/i.test(file.name ?? "")
  );
  const faiFile = list.find((file) => /\.fai$/i.test(file.name ?? ""));
  const gziFile = list.find((file) => /\.gzi$/i.test(file.name ?? ""));
  if (fastaFile) {
    const input = elements.inputPanel.querySelector("#fastaFile");
    if (input) {
      setFileOptionFiles(input, [fastaFile], false);
    }
  }
  if (faiFile) {
    const input = elements.inputPanel.querySelector("#faiFile");
    if (input) {
      setFileOptionFiles(input, [faiFile], false);
    }
  }
  if (gziFile) {
    const input = elements.inputPanel.querySelector("#gziFile");
    if (input) {
      setFileOptionFiles(input, [gziFile], false);
    }
  }
  if (gziFile || indexedGenomeFastaLooksCompressed(fastaFile)) {
    setFastaRegionSourceMode("bgzf");
  } else if (fastaFile || faiFile) {
    setFastaRegionSourceMode("fasta");
  }
  updateFastaRegionBundleStatus();
  clearToolOutput();
}

function appendFastaRegionFileSlot(parent, { id, label, accept, dropLabel }) {
  const slot = document.createElement("div");
  slot.className = "indexed-fasta-file-slot";
  slot.dataset.fileSlot = id;
  const heading = document.createElement("div");
  heading.className = "indexed-fasta-file-slot-heading";
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
  browseText.textContent = "Browse file";
  browse.append(input, browseText);
  heading.append(title, browse);
  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone indexed-fasta-file-drop-zone";
  dropZone.tabIndex = 0;
  dropZone.textContent = dropLabel;
  input.addEventListener("change", () => {
    if (id === "fastaFile" && input.files?.[0] && indexedGenomeFastaLooksCompressed(input.files[0])) {
      setFastaRegionSourceMode("bgzf");
    }
    updateFastaRegionBundleStatus();
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
    if (id === "fastaFile" && input.files?.[0] && indexedGenomeFastaLooksCompressed(input.files[0])) {
      setFastaRegionSourceMode("bgzf");
    }
    updateFastaRegionBundleStatus();
    clearToolOutput();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    input.click();
  });
  slot.append(heading, dropZone);
  parent.append(slot);
}

function appendFastaRegionLoadedFileSlot(parent, { loadFile: customLoadFile, statusText } = {}) {
  const slot = document.createElement("div");
  slot.id = "fastaRegionLoadedFileSlot";
  slot.className = "indexed-fasta-file-slot";
  const heading = document.createElement("div");
  heading.className = "indexed-fasta-file-slot-heading";
  const title = document.createElement("strong");
  title.textContent = "Paste/upload FASTA file";
  const browse = document.createElement("label");
  browse.className = "file-button file-option-browse";
  const input = document.createElement("input");
  input.id = "loadedFastaSourceFile";
  input.type = "file";
  input.accept = ".fa,.fasta,.fna,.faa,.txt,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz";
  input.setAttribute("aria-label", "Paste/upload FASTA source file");
  const browseText = document.createElement("span");
  browseText.textContent = "Browse file";
  browse.append(input, browseText);
  heading.append(title, browse);
  const dropZone = document.createElement("div");
  dropZone.className = "drop-zone indexed-fasta-file-drop-zone";
  dropZone.tabIndex = 0;
  dropZone.textContent = "Drop FASTA or FASTA.GZ here";
  const status = document.createElement("div");
  status.id = "loadedFastaSourceFileStatus";
  status.className = "indexed-fasta-status-row";
  status.hidden = true;
  const loadFile = async (file) => {
    if (!file) {
      return;
    }
    if (customLoadFile) {
      await customLoadFile(file);
    } else {
      await loadInputFile(file);
    }
    status.hidden = false;
    status.textContent = typeof statusText === "function"
      ? statusText(file)
      : `Loaded ${file.name} into the FASTA text editor`;
  };
  input.addEventListener("change", async () => {
    await loadFile(input.files?.[0]);
    input.value = "";
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", async (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    await loadFile(event.dataTransfer?.files?.[0]);
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    input.click();
  });
  slot.append(heading, dropZone, status);
  parent.append(slot);
}

function renderFastaRegionSourcePanel(panel) {
  panel.textContent = "";
  panel.dataset.rendered = "true";
  const sourceTabs = createSourceModeTabs({
    modes: FASTA_REGION_SOURCE_MODES,
    selectedMode: "loaded",
    ariaLabel: "FASTA region source type",
    onSelect: (mode) => {
      setFastaRegionSourceMode(mode);
      dispatchToolOptionChange("sourceMode");
      clearToolOutput();
    }
  });
  const title = document.createElement("strong");
  title.textContent = "FASTA source";
  const sourceDescription = document.createElement("p");
  sourceDescription.id = "fastaRegionSourceDescription";
  sourceDescription.className = "file-source-description";
  const loadedFileSlot = document.createElement("div");
  loadedFileSlot.id = "fastaRegionLoadedFiles";
  loadedFileSlot.className = "indexed-fasta-file-bundle";
  appendFastaRegionLoadedFileSlot(loadedFileSlot);

  const bundle = document.createElement("div");
  bundle.id = "fastaRegionIndexedFiles";
  bundle.className = "indexed-fasta-file-bundle";
  bundle.tabIndex = 0;
  bundle.addEventListener("dragover", (event) => {
    event.preventDefault();
    bundle.classList.add("drag-over");
  });
  bundle.addEventListener("dragleave", () => bundle.classList.remove("drag-over"));
  bundle.addEventListener("drop", (event) => {
    event.preventDefault();
    bundle.classList.remove("drag-over");
    assignFastaRegionBundleFiles(event.dataTransfer?.files);
  });
  appendFastaRegionFileSlot(bundle, {
    id: "fastaFile",
    label: "Uncompressed FASTA",
    accept: ".fa,.fasta,.fna,.faa,.txt,.fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.bgz",
    dropLabel: "Drop uncompressed FASTA here"
  });
  appendFastaRegionFileSlot(bundle, {
    id: "faiFile",
    label: "Matching .fai",
    accept: ".fai",
    dropLabel: "Drop matching .fai here"
  });
  appendFastaRegionFileSlot(bundle, {
    id: "gziFile",
    label: "Matching .gzi",
    accept: ".gzi",
    dropLabel: "Drop matching .gzi here"
  });
  const status = document.createElement("div");
  status.id = "fastaRegionBundleStatus";
  status.className = "indexed-fasta-status-row";
  panel.append(sourceTabs, title, sourceDescription, loadedFileSlot, bundle, status);
  setFastaRegionSourceMode("loaded", panel);
}

function updateFastaRegionExtractorSourceUi() {
  if (!isFastaRegionExtractorTool()) {
    removeFastaRegionSourcePanel();
    return;
  }
  const sourceOption = elements.toolOptions.querySelector('[data-option-id="sourceMode"]');
  if (sourceOption) {
    sourceOption.hidden = true;
  }
  const panel = getFastaRegionSourcePanel();
  const needsRender =
    panel.dataset.rendered !== "true" ||
    !panel.querySelector(".file-source-tabs") ||
    !panel.querySelector("#fastaRegionLoadedFiles") ||
    !panel.querySelector("#loadedFastaSourceFile") ||
    !panel.querySelector("#fastaRegionIndexedFiles");
  if (needsRender) {
    renderFastaRegionSourcePanel(panel);
  } else {
    setFastaRegionSourceMode(getFastaRegionSourceMode(panel), panel);
  }
}

function getIndexedGenomeRegionViewerPanel() {
  let panel = document.querySelector("#indexedGenomeRegionViewerPanel");
  if (panel) {
    return panel;
  }
  panel = document.createElement("section");
  panel.id = "indexedGenomeRegionViewerPanel";
  panel.className = "indexed-fasta-viewer-panel";
  elements.sequenceInput.before(panel);
  return panel;
}

function removeIndexedGenomeRegionViewerPanel() {
  document.querySelector("#indexedGenomeRegionViewerPanel")?.remove();
}

function parseIndexedGenomeExampleSections(text) {
  const value = String(text ?? "");
  const fastaMatch = value.match(/^##FASTA\s*$/m);
  const faiMatch = value.match(/^##FAI\s*$/m);
  const regionMatch = value.match(/^##REGIONS\s*$/m);
  if (!fastaMatch || !faiMatch || !regionMatch || !(fastaMatch.index < faiMatch.index && faiMatch.index < regionMatch.index)) {
    return { hasBundle: false, fastaText: "", faiText: "", rangesText: "" };
  }
  return {
    hasBundle: true,
    fastaText: value.slice(fastaMatch.index + fastaMatch[0].length, faiMatch.index).trim(),
    faiText: `${value.slice(faiMatch.index + faiMatch[0].length, regionMatch.index).trim()}\n`,
    rangesText: value.slice(regionMatch.index + regionMatch[0].length).trim()
  };
}

function parseFaiPreview(text) {
  const records = [];
  const warnings = [];
  for (const [lineIndex, line] of String(text ?? "").replace(/\r\n?/g, "\n").split("\n").entries()) {
    if (!line.trim()) {
      continue;
    }
    const fields = line.split("\t");
    const length = Number.parseInt(fields[1], 10);
    if (fields.length < 5 || !fields[0] || !Number.isInteger(length)) {
      warnings.push(`FAI line ${lineIndex + 1} could not be previewed.`);
      continue;
    }
    records.push({ name: fields[0], length });
  }
  return { records, warnings };
}

function parseRegionRowsForUi(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^([^:\s]+):(\d+)-(\d+)(?:\s+(.+))?$/);
      if (match) {
        return {
          reference: match[1],
          start: match[2],
          end: match[3],
          label: match[4] ?? ""
        };
      }
      const fields = line.includes("\t") ? line.split("\t").map((field) => field.trim()) : line.split(/\s+/);
      return {
        reference: fields[0] ?? "",
        start: fields[1] ?? "",
        end: fields[2] ?? "",
        label: fields.slice(3).filter(Boolean).join(" ")
      };
    });
}

function serializeIndexedGenomeRegionRows(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel) {
    return "";
  }
  return [...panel.querySelectorAll(".indexed-fasta-region-row")]
    .map((row) => {
      const reference = row.querySelector('[data-region-field="reference"]')?.value.trim() ?? "";
      const start = row.querySelector('[data-region-field="start"]')?.value.trim() ?? "";
      const end = row.querySelector('[data-region-field="end"]')?.value.trim() ?? "";
      const label = row.querySelector('[data-region-field="label"]')?.value.trim() ?? "";
      if (!reference && !start && !end && !label) {
        return "";
      }
      if (!reference || !start || !end) {
        return "";
      }
      const coordinates = reference && start && end ? `${reference}:${start}-${end}` : [reference, start, end].filter(Boolean).join("\t");
      return label ? `${coordinates}\t${label}` : coordinates;
    })
    .filter(Boolean)
    .join("\n");
}

function syncIndexedGenomeRegionTextFromRows(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  const textarea = panel?.querySelector("#rangeText");
  if (!textarea) {
    return;
  }
  textarea.value = serializeIndexedGenomeRegionRows(panel);
}

function getIndexedGenomeDefaultRangeText() {
  const bundled = parseIndexedGenomeExampleSections(elements.sequenceInput.value);
  if (bundled.rangesText) {
    return bundled.rangesText;
  }
  const rangeOption = flattenOptions(getSelectedTool()?.metadata?.options ?? []).find((option) => option.id === "rangeText");
  return String(rangeOption?.defaultValue ?? "");
}

function getIndexedGenomeBundleFiles() {
  return {
    fastaFile: elements.inputPanel.querySelector("#fastaFile")?.files?.[0] ?? null,
    faiFile: elements.inputPanel.querySelector("#faiFile")?.files?.[0] ?? null,
    gziFile: elements.inputPanel.querySelector("#gziFile")?.files?.[0] ?? null
  };
}

const INDEXED_GENOME_SOURCE_MODES = {
  fasta: {
    label: "Uncompressed FASTA",
    description: "Use one uncompressed FASTA file with one matching .fai index. Open BGZF options only for compressed indexed FASTA.",
    fastaLabel: "Reference FASTA",
    fastaAccept: ".fa,.fasta,.fna,.faa,.txt",
    fastaDropLabel: "Drop reference FASTA here"
  },
  bgzf: {
    label: "BGZF FASTA",
    description: "Use one BGZF-compressed FASTA file with matching .fai and .gzi sidecar files. Ordinary gzip FASTA is not random-access indexed FASTA.",
    fastaLabel: "BGZF-compressed FASTA",
    fastaAccept: ".fa.gz,.fasta.gz,.fna.gz,.faa.gz,.gz,.bgz",
    fastaDropLabel: "Drop BGZF-compressed FASTA here"
  }
};

const INDEXED_GENOME_WORKFLOW_TABS = [
  { id: "files", label: "Files" },
  { id: "regions", label: "Regions" },
  { id: "advanced", label: "Advanced" }
];

function getIndexedGenomeSourceMode(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  return panel?.dataset.sourceMode === "bgzf" ? "bgzf" : "fasta";
}

function setIndexedGenomeSourceMode(mode, panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel) {
    return;
  }
  const sourceMode = mode === "bgzf" ? "bgzf" : "fasta";
  panel.dataset.sourceMode = sourceMode;
  const config = INDEXED_GENOME_SOURCE_MODES[sourceMode];
  const bgzfOptions = panel.querySelector("#indexedGenomeBgzfOptions");
  if (bgzfOptions && sourceMode === "bgzf") {
    bgzfOptions.open = true;
  }
  const bgzfSummary = panel.querySelector("#indexedGenomeBgzfSummary");
  if (bgzfSummary) {
    bgzfSummary.textContent = sourceMode === "bgzf" ? "BGZF options enabled" : "BGZF options";
  }
  const bgzfDescription = panel.querySelector("#indexedGenomeBgzfDescription");
  if (bgzfDescription) {
    bgzfDescription.textContent = config.description;
  }
  const fastaTitle = panel.querySelector('[data-file-slot="fastaFile"] .indexed-fasta-file-slot-heading strong');
  if (fastaTitle) {
    fastaTitle.textContent = config.fastaLabel;
  }
  const fastaInput = panel.querySelector('[data-file-slot="fastaFile"] input[type="file"]');
  if (fastaInput) {
    fastaInput.setAttribute("aria-label", config.fastaLabel);
    fastaInput.setAttribute("accept", config.fastaAccept);
  }
  const fastaDropZone = panel.querySelector('[data-file-slot="fastaFile"] .indexed-fasta-file-drop-zone');
  if (fastaDropZone) {
    fastaDropZone.textContent = config.fastaDropLabel;
  }
  const gziSlot = panel.querySelector('[data-file-slot="gziFile"]');
  if (gziSlot) {
    gziSlot.hidden = false;
  }
  renderIndexedGenomeBundleStatus(panel);
  updateIndexedGenomeWorkflowTabLabels(panel);
}

function getIndexedGenomeRegionCount(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel) {
    return 0;
  }
  return [...panel.querySelectorAll(".indexed-fasta-region-row")]
    .filter((row) => {
      const reference = row.querySelector('[data-region-field="reference"]')?.value.trim() ?? "";
      const start = row.querySelector('[data-region-field="start"]')?.value.trim() ?? "";
      const end = row.querySelector('[data-region-field="end"]')?.value.trim() ?? "";
      return Boolean(reference && start && end);
    })
    .length;
}

function getIndexedGenomeIncompleteRegionCount(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel) {
    return 0;
  }
  return [...panel.querySelectorAll(".indexed-fasta-region-row")]
    .filter((row) => {
      const reference = row.querySelector('[data-region-field="reference"]')?.value.trim() ?? "";
      const start = row.querySelector('[data-region-field="start"]')?.value.trim() ?? "";
      const end = row.querySelector('[data-region-field="end"]')?.value.trim() ?? "";
      const hasAny = Boolean(reference || start || end);
      const complete = Boolean(reference && start && end);
      return hasAny && !complete;
    })
    .length;
}

function indexedGenomeFilesComplete(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel) {
    return false;
  }
  const { fastaFile, faiFile, gziFile } = getIndexedGenomeBundleFiles();
  const example = parseIndexedGenomeExampleSections(elements.sequenceInput.value);
  const hasFasta = Boolean(fastaFile || example.hasBundle);
  const hasFai = Boolean(faiFile || example.faiText);
  const needsGzi = getIndexedGenomeSourceMode(panel) === "bgzf" || indexedGenomeFastaLooksCompressed(fastaFile);
  return hasFasta && hasFai && (!needsGzi || Boolean(gziFile));
}

function updateIndexedGenomeWorkflowTabLabels(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel) {
    return;
  }
  const regionCount = getIndexedGenomeRegionCount(panel);
  const incompleteCount = getIndexedGenomeIncompleteRegionCount(panel);
  const filesComplete = indexedGenomeFilesComplete(panel);
  const labels = {
    files: `Files${filesComplete ? " ✓" : ""}`,
    regions: regionCount > 0 ? `Regions ${regionCount}` : "Regions",
    advanced: "Advanced"
  };
  for (const tab of panel.querySelectorAll(".indexed-fasta-workflow-tab")) {
    tab.textContent = labels[tab.dataset.workflowTab] ?? tab.dataset.workflowTab ?? "";
  }
  const count = panel.querySelector("#indexedGenomeRegionCount");
  if (count) {
    const ready = regionCount > 0 ? pluralize(regionCount, "ready region") : "No ready regions";
    const incomplete = incompleteCount > 0 ? ` • ${pluralize(incompleteCount, "incomplete row")}` : "";
    count.textContent = `${ready}${incomplete}`;
    count.classList.toggle("warning", incompleteCount > 0 || regionCount === 0);
  }
}

function updateIndexedGenomeExampleSource(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  const textarea = panel?.querySelector(".indexed-fasta-example-source textarea");
  if (textarea) {
    textarea.value = elements.sequenceInput.value;
  }
}

function setIndexedGenomeWorkflowTab(tabId, panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel || !INDEXED_GENOME_WORKFLOW_TABS.some((tab) => tab.id === tabId)) {
    return;
  }
  panel.dataset.activeWorkflowTab = tabId;
  updateTabbedInputWorkflowTabs(panel, tabId, {
    datasetKey: "workflowTab",
    tabSelector: ".indexed-fasta-workflow-tab"
  });
  for (const pane of panel.querySelectorAll(".indexed-fasta-workflow-pane")) {
    pane.hidden = pane.dataset.workflowPane !== tabId;
  }
  updateIndexedGenomeWorkflowTabLabels(panel);
}

function makeIndexedGenomeStatusBadge(text, tone = "neutral") {
  const badge = document.createElement("span");
  badge.className = `indexed-fasta-status-badge ${tone}`;
  badge.textContent = text;
  return badge;
}

function getIndexedGenomeReferenceSuggestions() {
  return document.querySelector("#indexedGenomeRegionViewerPanel")
    ?.dataset.referenceSuggestions
    ?.split("\n")
    .filter(Boolean) ?? [];
}

function updateIndexedGenomeReferenceSuggestions() {
  const panel = document.querySelector("#indexedGenomeRegionViewerPanel");
  const datalist = panel?.querySelector("#indexedGenomeReferenceSuggestions");
  if (!panel || !datalist) {
    return;
  }
  const references = getIndexedGenomeReferenceSuggestions();
  datalist.replaceChildren(...references.map((reference) => {
    const option = document.createElement("option");
    option.value = reference;
    return option;
  }));
}

function renderIndexedGenomeBundleStatus(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  if (!panel) {
    return;
  }
  const { fastaFile, faiFile, gziFile } = getIndexedGenomeBundleFiles();
  const sourceMode = getIndexedGenomeSourceMode(panel);
  const example = parseIndexedGenomeExampleSections(elements.sequenceInput.value);
  const records = panel.dataset.referenceSuggestions
    ? panel.dataset.referenceSuggestions.split("\n").filter(Boolean)
    : [];
  const status = panel.querySelector("#indexedGenomeBundleStatus");
  const feedback = panel.querySelector("#indexedGenomeReferenceFeedback");
  const statusParts = [];
  let hasWarning = false;

  if (fastaFile) {
    const label = sourceMode === "bgzf" ? "BGZF FASTA" : "FASTA";
    statusParts.push(`${label} loaded`);
  } else if (example.hasBundle) {
    statusParts.push("Example FASTA loaded");
  } else {
    statusParts.push(`${sourceMode === "bgzf" ? "BGZF FASTA" : "FASTA"} missing`);
    hasWarning = true;
  }

  if (faiFile) {
    statusParts.push("FAI (.fai) loaded");
  } else if (example.faiText) {
    statusParts.push("Example FAI loaded");
  } else {
    statusParts.push("FAI missing");
    hasWarning = true;
  }

  const compressed = sourceMode === "bgzf" || indexedGenomeFastaLooksCompressed(fastaFile);
  if (gziFile) {
    statusParts.push("GZI (.gzi) loaded");
    if (fastaFile) {
      const matched = indexedGenomeGziLooksMatched(fastaFile, gziFile);
      statusParts.push(matched ? "GZI name matches FASTA" : "Check that the GZI matches this FASTA");
      hasWarning ||= !matched;
    }
  } else if (compressed) {
    statusParts.push("GZI (.gzi) required for BGZF");
    hasWarning = true;
  } else {
    statusParts.push("GZI not used for uncompressed FASTA");
  }

  if (fastaFile && faiFile) {
    const matched = indexedGenomeFaiLooksMatched(fastaFile, faiFile);
    statusParts.push(matched ? "Index appears to match" : "Check that the FAI matches this FASTA");
    hasWarning ||= !matched;
  }
  if (panel.dataset.faiPreviewStatus === "reading") {
    statusParts.push("Reading FAI locally");
  } else if (records.length > 0) {
    statusParts.push(`${pluralize(records.length, "reference sequence")} detected`);
  }

  if (status) {
    status.classList.toggle("warning", hasWarning);
    status.textContent = statusParts.join(" • ");
  }
  if (feedback) {
    if (panel.dataset.faiPreviewError) {
      feedback.textContent = panel.dataset.faiPreviewError;
      feedback.closest("details")?.removeAttribute("hidden");
    } else if (records.length > 0) {
      feedback.textContent = `Reference names: ${records.slice(0, 8).join(", ")}${records.length > 8 ? ", ..." : ""}.`;
      feedback.closest("details")?.removeAttribute("hidden");
    } else if (example.hasBundle) {
      feedback.textContent = "The bundled example is ready to run.";
      feedback.closest("details")?.removeAttribute("hidden");
    } else {
      feedback.textContent = "Reference names will appear after an FAI index is loaded.";
      feedback.closest("details")?.setAttribute("hidden", "");
    }
  }
  updateIndexedGenomeReferenceSuggestions();
  updateIndexedGenomeWorkflowTabLabels(panel);
}

async function readIndexedGenomeFaiPreview(panel, file, key) {
  panel.dataset.faiPreviewStatus = "reading";
  panel.dataset.faiPreviewError = "";
  panel.dataset.referenceSuggestions = "";
  renderIndexedGenomeBundleStatus(panel);
  try {
    const text = await file.text();
    if (panel.dataset.faiPreviewKey !== key) {
      return;
    }
    const summary = parseFaiPreview(text);
    panel.dataset.faiText = text;
    panel.dataset.referenceSuggestions = summary.records.map((record) => record.name).join("\n");
    panel.dataset.faiPreviewStatus = "ready";
    panel.dataset.faiPreviewError = summary.warnings.length > 0
      ? `FAI preview warning: ${summary.warnings[0]}`
      : "";
  } catch (error) {
    if (panel.dataset.faiPreviewKey !== key) {
      return;
    }
    panel.dataset.faiText = "";
    panel.dataset.referenceSuggestions = "";
    panel.dataset.faiPreviewStatus = "error";
    panel.dataset.faiPreviewError = `Could not preview the FAI index: ${error.message}`;
  }
  renderIndexedGenomeBundleStatus(panel);
}

function updateIndexedGenomeFileBundleStatus() {
  if (!isIndexedGenomeRegionViewerTool()) {
    return;
  }
  const panel = document.querySelector("#indexedGenomeRegionViewerPanel");
  if (!panel) {
    return;
  }
  const { faiFile } = getIndexedGenomeBundleFiles();
  if (faiFile) {
    const key = `${faiFile.name}:${faiFile.size}:${faiFile.lastModified}`;
    if (panel.dataset.faiPreviewKey !== key) {
      panel.dataset.faiPreviewKey = key;
      readIndexedGenomeFaiPreview(panel, faiFile, key);
    } else {
      renderIndexedGenomeBundleStatus(panel);
    }
    return;
  }
  const example = parseIndexedGenomeExampleSections(elements.sequenceInput.value);
  panel.dataset.faiPreviewKey = example.faiText ? "example" : "";
  panel.dataset.faiText = example.faiText;
  panel.dataset.faiPreviewStatus = example.faiText ? "ready" : "";
  panel.dataset.faiPreviewError = "";
  panel.dataset.referenceSuggestions = parseFaiPreview(example.faiText)
    .records
    .map((record) => record.name)
    .join("\n");
  renderIndexedGenomeBundleStatus(panel);
}

function assignIndexedGenomeBundleFiles(files) {
  const list = Array.from(files ?? []);
  if (list.length === 0) {
    return;
  }
  const faiFile = list.find((file) => /\.fai$/i.test(file.name ?? ""));
  const gziFile = list.find((file) => /\.gzi$/i.test(file.name ?? ""));
  const fastaFile = list.find((file) =>
    !/(\.fai|\.gzi)$/i.test(file.name ?? "") &&
    /\.(fa|fasta|fna|faa|txt|fa\.gz|fasta\.gz|fna\.gz|faa\.gz|gz|bgz)$/i.test(file.name ?? "")
  );
  if (fastaFile) {
    const input = elements.inputPanel.querySelector("#fastaFile");
    if (input) {
      setFileOptionFiles(input, [fastaFile], false);
    }
  }
  if (faiFile) {
    const input = elements.inputPanel.querySelector("#faiFile");
    if (input) {
      setFileOptionFiles(input, [faiFile], false);
    }
  }
  if (gziFile) {
    const input = elements.inputPanel.querySelector("#gziFile");
    if (input) {
      setFileOptionFiles(input, [gziFile], false);
    }
  }
  const panel = document.querySelector("#indexedGenomeRegionViewerPanel");
  if (panel) {
    setIndexedGenomeSourceMode(gziFile || indexedGenomeFastaLooksCompressed(fastaFile) ? "bgzf" : "fasta", panel);
  }
  updateIndexedGenomeFileBundleStatus();
  clearToolOutput();
}

function appendIndexedGenomeFileSlot(parent, { id, label, accept, dropLabel }) {
  const slot = document.createElement("div");
  slot.className = "indexed-fasta-file-slot";
  slot.dataset.fileSlot = id;
  const heading = document.createElement("div");
  heading.className = "indexed-fasta-file-slot-heading";
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
  dropZone.className = "drop-zone indexed-fasta-file-drop-zone";
  dropZone.tabIndex = 0;
  dropZone.textContent = dropLabel;
  input.addEventListener("change", () => {
    const panel = document.querySelector("#indexedGenomeRegionViewerPanel");
    if (id === "fastaFile" && input.files?.[0]) {
      setIndexedGenomeSourceMode(indexedGenomeFastaLooksCompressed(input.files[0]) ? "bgzf" : "fasta", panel);
    } else if (id === "gziFile" && input.files?.[0]) {
      setIndexedGenomeSourceMode("bgzf", panel);
    }
    updateIndexedGenomeFileBundleStatus();
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
    const panel = document.querySelector("#indexedGenomeRegionViewerPanel");
    if (id === "fastaFile" && input.files?.[0]) {
      setIndexedGenomeSourceMode(indexedGenomeFastaLooksCompressed(input.files[0]) ? "bgzf" : "fasta", panel);
    } else if (id === "gziFile" && input.files?.[0]) {
      setIndexedGenomeSourceMode("bgzf", panel);
    }
    updateIndexedGenomeFileBundleStatus();
    clearToolOutput();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    input.click();
  });
  slot.append(heading, dropZone);
  parent.append(slot);
}

function appendIndexedGenomeRegionRow(panel, region = {}) {
  const rows = panel.querySelector("#indexedGenomeRegionRows");
  if (!rows) {
    return;
  }
  panel.querySelector("#indexedGenomeRegionEmpty")?.setAttribute("hidden", "");
  const row = document.createElement("div");
  row.className = "indexed-fasta-region-row";

  const makeField = (labelText, field, input) => {
    const label = document.createElement("label");
    label.className = `indexed-fasta-region-field indexed-fasta-region-${field}`;
    const labelSpan = document.createElement("span");
    labelSpan.className = "visually-hidden";
    labelSpan.textContent = labelText;
    input.dataset.regionField = field;
    input.setAttribute("aria-label", labelText);
    label.append(labelSpan, input);
    return label;
  };

  const reference = document.createElement("input");
  reference.type = "text";
  reference.value = region.reference ?? "";
  reference.placeholder = "chr1";
  reference.setAttribute("list", "indexedGenomeReferenceSuggestions");

  const start = document.createElement("input");
  start.type = "number";
  start.min = "1";
  start.step = "1";
  start.value = region.start ?? "";
  start.placeholder = "1";

  const end = document.createElement("input");
  end.type = "number";
  end.min = "1";
  end.step = "1";
  end.value = region.end ?? "";
  end.placeholder = "1000";

  const label = document.createElement("input");
  label.type = "text";
  label.value = region.label ?? "";
  label.placeholder = "optional region name";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "indexed-fasta-region-remove";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", "Remove region");

  const sync = () => {
    updateIndexedGenomeRegionRowState(row);
    syncIndexedGenomeRegionTextFromRows(panel);
    updateIndexedGenomeWorkflowTabLabels(panel);
    clearToolOutput();
  };
  for (const input of [reference, start, end, label]) {
    input.addEventListener("input", sync);
  }
  remove.addEventListener("click", () => {
    row.remove();
    updateIndexedGenomeRegionEmptyState(panel);
    sync();
  });

  row.append(
    makeField("Reference", "reference", reference),
    makeField("Start", "start", start),
    makeField("End", "end", end),
    makeField("Name", "label", label),
    remove
  );
  rows.append(row);
  updateIndexedGenomeRegionRowState(row);
  updateIndexedGenomeRegionEmptyState(panel);
  syncIndexedGenomeRegionTextFromRows(panel);
  updateIndexedGenomeWorkflowTabLabels(panel);
  return row;
}

function updateIndexedGenomeRegionRowState(row) {
  const reference = row.querySelector('[data-region-field="reference"]')?.value.trim() ?? "";
  const start = row.querySelector('[data-region-field="start"]')?.value.trim() ?? "";
  const end = row.querySelector('[data-region-field="end"]')?.value.trim() ?? "";
  const hasAny = Boolean(reference || start || end);
  const complete = Boolean(reference && start && end);
  row.dataset.regionState = complete ? "complete" : hasAny ? "incomplete" : "empty";
}

function updateIndexedGenomeRegionEmptyState(panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  const empty = panel?.querySelector("#indexedGenomeRegionEmpty");
  const rows = panel?.querySelectorAll(".indexed-fasta-region-row") ?? [];
  if (empty) {
    empty.hidden = rows.length > 0;
  }
}

function setIndexedGenomeRegionRowsFromText(text, panel = document.querySelector("#indexedGenomeRegionViewerPanel")) {
  const rows = panel?.querySelector("#indexedGenomeRegionRows");
  const textarea = panel?.querySelector("#rangeText");
  if (!panel || !rows || !textarea) {
    return;
  }
  rows.textContent = "";
  const parsedRows = parseRegionRowsForUi(text);
  for (const region of parsedRows) {
    appendIndexedGenomeRegionRow(panel, region);
  }
  updateIndexedGenomeRegionEmptyState(panel);
  textarea.value = serializeIndexedGenomeRegionRows(panel);
  updateIndexedGenomeWorkflowTabLabels(panel);
}

function resetIndexedGenomeRegionRowsFromCurrentInput() {
  setIndexedGenomeRegionRowsFromText(getIndexedGenomeDefaultRangeText());
}

function renderIndexedGenomeRegionViewerPanel(panel) {
  panel.textContent = "";
  panel.dataset.rendered = "true";
  panel.dataset.referenceSuggestions = "";
  panel.dataset.faiPreviewKey = "";
  panel.dataset.faiPreviewError = "";
  panel.dataset.faiPreviewStatus = "";

  const workflowCard = document.createElement("section");
  workflowCard.className = "indexed-fasta-card indexed-fasta-workflow-card";
  const workflowHeading = document.createElement("div");
  workflowHeading.className = "indexed-fasta-card-heading";
  const workflowTitleBlock = document.createElement("div");
  const workflowTitle = document.createElement("h4");
  workflowTitle.textContent = "Indexed FASTA region workflow";
  const workflowText = document.createElement("p");
  workflowText.textContent = "Choose indexed FASTA files, define regions, then open the viewer.";
  workflowTitleBlock.append(workflowTitle, workflowText);
  workflowHeading.append(workflowTitleBlock);

  const workflowTabs = createTabbedInputWorkflowTabs({
    document,
    modes: INDEXED_GENOME_WORKFLOW_TABS.map((tabInfo) => ({
      id: tabInfo.id,
      tabText: tabInfo.label,
      ariaControls: `indexedGenome${tabInfo.id}Pane`
    })),
    selectedMode: "files",
    ariaLabel: "Indexed FASTA region workflow",
    className: "indexed-fasta-workflow-tabs",
    tabClassName: "indexed-fasta-workflow-tab",
    datasetKey: "workflowTab",
    onSelect: (tabId) => setIndexedGenomeWorkflowTab(tabId, panel)
  });

  const makePane = (id) => {
    const pane = document.createElement("section");
    pane.id = `indexedGenome${id}Pane`;
    pane.className = "indexed-fasta-workflow-pane";
    pane.dataset.workflowPane = id;
    pane.setAttribute("role", "tabpanel");
    return pane;
  };

  const filesPane = makePane("files");
  const filesHeading = document.createElement("div");
  filesHeading.className = "indexed-fasta-tab-heading";
  const filesTitle = document.createElement("h4");
  filesTitle.textContent = "Indexed FASTA files";
  const fileHelp = document.createElement("details");
  fileHelp.className = "indexed-fasta-help";
  const fileHelpSummary = document.createElement("summary");
  fileHelpSummary.textContent = "File requirements";
  const fileHelpText = document.createElement("p");
  fileHelpText.textContent = "Uncompressed indexed FASTA uses one FASTA file plus one matching .fai. BGZF-compressed indexed FASTA uses one BGZF FASTA plus matching .fai and .gzi files. Ordinary .fa.gz is not enough for indexed random access.";
  fileHelp.append(fileHelpSummary, fileHelpText);
  filesHeading.append(filesTitle, fileHelp);

  const bundle = document.createElement("div");
  bundle.className = "indexed-fasta-file-bundle";
  bundle.tabIndex = 0;
  bundle.addEventListener("dragover", (event) => {
    event.preventDefault();
    bundle.classList.add("drag-over");
  });
  bundle.addEventListener("dragleave", () => bundle.classList.remove("drag-over"));
  bundle.addEventListener("drop", (event) => {
    event.preventDefault();
    bundle.classList.remove("drag-over");
    assignIndexedGenomeBundleFiles(event.dataTransfer?.files);
  });
  appendIndexedGenomeFileSlot(bundle, {
    id: "fastaFile",
    label: "Reference FASTA",
    accept: ".fa,.fasta,.fna,.faa,.txt",
    dropLabel: "Drop reference FASTA here"
  });
  appendIndexedGenomeFileSlot(bundle, {
    id: "faiFile",
    label: "Matching .fai",
    accept: ".fai",
    dropLabel: "Drop matching .fai here"
  });

  const bgzfOptions = document.createElement("details");
  bgzfOptions.id = "indexedGenomeBgzfOptions";
  bgzfOptions.className = "indexed-fasta-bgzf-options";
  const bgzfSummary = document.createElement("summary");
  bgzfSummary.id = "indexedGenomeBgzfSummary";
  bgzfSummary.textContent = "BGZF options";
  const bgzfDescription = document.createElement("p");
  bgzfDescription.id = "indexedGenomeBgzfDescription";
  bgzfDescription.className = "indexed-fasta-feedback";
  bgzfDescription.textContent = INDEXED_GENOME_SOURCE_MODES.fasta.description;
  const bgzfSlotWrap = document.createElement("div");
  bgzfSlotWrap.className = "indexed-fasta-bgzf-slot";
  appendIndexedGenomeFileSlot(bgzfSlotWrap, {
    id: "gziFile",
    label: "Matching .gzi",
    accept: ".gzi",
    dropLabel: "Drop matching .gzi here"
  });
  bgzfOptions.append(bgzfSummary, bgzfDescription, bgzfSlotWrap);
  bgzfOptions.addEventListener("toggle", () => {
    const { fastaFile, gziFile } = getIndexedGenomeBundleFiles();
    if (bgzfOptions.open) {
      setIndexedGenomeSourceMode("bgzf", panel);
      clearToolOutput();
    } else if (gziFile || indexedGenomeFastaLooksCompressed(fastaFile)) {
      bgzfOptions.open = true;
    } else {
      setIndexedGenomeSourceMode("fasta", panel);
      clearToolOutput();
    }
  });

  const status = document.createElement("div");
  status.id = "indexedGenomeBundleStatus";
  status.className = "indexed-fasta-status-line";
  const referenceDetails = document.createElement("details");
  referenceDetails.className = "indexed-fasta-help indexed-fasta-reference-details";
  referenceDetails.hidden = true;
  const referenceSummary = document.createElement("summary");
  referenceSummary.textContent = "Reference names";
  const feedback = document.createElement("p");
  feedback.id = "indexedGenomeReferenceFeedback";
  feedback.className = "indexed-fasta-feedback";
  feedback.textContent = "Reference names will appear after an FAI index is loaded.";
  referenceDetails.append(referenceSummary, feedback);
  filesPane.append(filesHeading, bundle, bgzfOptions, status, referenceDetails);

  const regionsPane = makePane("regions");
  const regionHeading = document.createElement("div");
  regionHeading.className = "indexed-fasta-region-heading";
  const regionTitleBlock = document.createElement("div");
  const regionTitle = document.createElement("h4");
  regionTitle.textContent = "Regions to view";
  regionTitleBlock.append(regionTitle);
  const addRegion = document.createElement("button");
  addRegion.type = "button";
  addRegion.className = "option-rule-add indexed-fasta-add-region";
  addRegion.textContent = "Add region";
  addRegion.addEventListener("click", () => {
    const row = appendIndexedGenomeRegionRow(panel, {});
    row?.querySelector('[data-region-field="reference"]')?.focus();
    clearToolOutput();
  });
  const regionCount = document.createElement("div");
  regionCount.id = "indexedGenomeRegionCount";
  regionCount.className = "indexed-fasta-region-count";
  regionCount.textContent = "Complete rows are used when you run the tool.";
  regionHeading.append(regionTitleBlock, regionCount, addRegion);
  const regionNote = document.createElement("p");
  regionNote.className = "indexed-fasta-region-note";
  regionNote.textContent = "Use 1-based inclusive coordinates. After the FAI is loaded, the Reference field suggests available sequence names.";
  const regionTableHeader = document.createElement("div");
  regionTableHeader.className = "indexed-fasta-region-grid-header";
  for (const label of ["Reference", "Start", "End", "Name", ""]) {
    const span = document.createElement("span");
    span.textContent = label;
    regionTableHeader.append(span);
  }
  const rows = document.createElement("div");
  rows.id = "indexedGenomeRegionRows";
  rows.className = "indexed-fasta-region-rows";
  const emptyRegionMessage = document.createElement("p");
  emptyRegionMessage.id = "indexedGenomeRegionEmpty";
  emptyRegionMessage.className = "indexed-fasta-region-empty";
  emptyRegionMessage.textContent = "No regions yet. Add a row or paste regions in Advanced.";
  const datalist = document.createElement("datalist");
  datalist.id = "indexedGenomeReferenceSuggestions";
  regionsPane.append(regionHeading, regionNote, regionTableHeader, rows, emptyRegionMessage, datalist);

  const advancedPane = makePane("advanced");
  const advancedHeading = document.createElement("div");
  advancedHeading.className = "indexed-fasta-tab-heading";
  const advancedTitle = document.createElement("h4");
  advancedTitle.textContent = "Advanced / bulk paste";
  const advancedHelp = document.createElement("details");
  advancedHelp.className = "indexed-fasta-help";
  const advancedHelpSummary = document.createElement("summary");
  advancedHelpSummary.textContent = "Bulk entry";
  const advancedHelpText = document.createElement("p");
  advancedHelpText.textContent = "Paste one region per line as seqid:start-end name, or tab-separated seqid, start, end, optional name.";
  advancedHelp.append(advancedHelpSummary, advancedHelpText);
  advancedHeading.append(advancedTitle, advancedHelp);
  const bulkLabel = document.createElement("label");
  bulkLabel.className = "text-row";
  const bulkLabelText = document.createElement("span");
  bulkLabelText.className = "option-label";
  bulkLabelText.textContent = "Regions to view";
  const textarea = document.createElement("textarea");
  textarea.id = "rangeText";
  textarea.name = "rangeText";
  textarea.rows = 5;
  textarea.spellcheck = false;
  textarea.wrap = "off";
  textarea.setAttribute("aria-label", "Regions to view");
  textarea.addEventListener("input", () => {
    setIndexedGenomeRegionRowsFromText(textarea.value, panel);
    clearToolOutput();
  });
  bulkLabel.append(bulkLabelText, textarea);
  const exampleSource = document.createElement("details");
  exampleSource.className = "indexed-fasta-help indexed-fasta-example-source";
  const exampleSourceSummary = document.createElement("summary");
  exampleSourceSummary.textContent = "Bundled example source";
  const exampleSourceText = document.createElement("textarea");
  exampleSourceText.readOnly = true;
  exampleSourceText.rows = 7;
  exampleSourceText.spellcheck = false;
  exampleSourceText.wrap = "off";
  exampleSourceText.value = elements.sequenceInput.value;
  exampleSource.append(exampleSourceSummary, exampleSourceText);
  advancedPane.append(advancedHeading, bulkLabel, exampleSource);

  workflowCard.append(workflowHeading, workflowTabs, filesPane, regionsPane, advancedPane);
  panel.append(workflowCard);
  setIndexedGenomeSourceMode("fasta", panel);
  resetIndexedGenomeRegionRowsFromCurrentInput();
  setIndexedGenomeWorkflowTab("files", panel);
}

function updateIndexedGenomeRegionViewerUi() {
  if (!isIndexedGenomeRegionViewerTool()) {
    removeIndexedGenomeRegionViewerPanel();
    delete elements.inputPanel.dataset.indexedGenomeRegionViewer;
    return;
  }
  elements.dropZone.hidden = true;
  elements.fileInput.closest(".file-button").hidden = true;
  elements.sequenceInput.hidden = true;
  elements.inputPanel.dataset.indexedGenomeRegionViewer = "true";
  const panel = getIndexedGenomeRegionViewerPanel();
  const needsRender =
    panel.dataset.rendered !== "true" ||
    !panel.querySelector(".indexed-fasta-workflow-tabs") ||
    !panel.querySelector("#indexedGenomefilesPane") ||
    !panel.querySelector("#indexedGenomeRegionRows");
  if (needsRender) {
    renderIndexedGenomeRegionViewerPanel(panel);
  }
  updateIndexedGenomeExampleSource(panel);
  updateIndexedGenomeFileBundleStatus();
}

  return {
    updateSamBamInputModeUi,
    updateVcfInputModeUi,
    updateFastaSourceInputUi,
    updateFastaRegionExtractorSourceUi,
    updateIndexedGenomeRegionViewerUi,
    setFastaRegionSourceMode,
    setIndexedGenomeRegionRowsFromText,
    resetIndexedGenomeRegionRowsFromCurrentInput
  };
}
