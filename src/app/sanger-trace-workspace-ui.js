import {
  makeSangerTraceSettingsText,
  sangerTaskSummaries,
  serializeSangerTraceWorkspaceInput
} from "./sanger-trace-workspace-model.js";

const SANGER_TRACE_TASKS = [
  { value: "review", label: "Review one trace" },
  { value: "edit", label: "Edit base calls" },
  { value: "assemble", label: "Assemble traces" },
  { value: "compare", label: "Compare to reference" }
];

const MAX_SANGER_TRACE_FILE_BYTES = 25 * 1024 * 1024;
const MAX_VISIBLE_TRACE_SETTING_CONTROLS = 6;

function noop() {}

export function createSangerTraceWorkspaceController({
  panel,
  toolOptions,
  getSelectedTool,
  splitInputExampleParts,
  formatExampleInputForDisplay,
  readToolInputFileText,
  addMessage = noop,
  updateInputActionButtons = noop,
  clearToolOutput = noop
}) {
  function getFixedTaskValue() {
    const task = getSelectedTool()?.metadata?.sangerTraceTask;
    return ["review", "edit", "assemble", "compare"].includes(task) ? task : "";
  }

  function getTaskValue() {
    const fixedTask = getFixedTaskValue();
    if (fixedTask) {
      return fixedTask;
    }
    return toolOptions.querySelector('select[name="task"]')?.value
      ?? toolOptions.querySelector('input[name="task"]:checked')?.value
      ?? "review";
  }

  function setTaskValue(task) {
    if (getFixedTaskValue()) {
      return;
    }
    const select = toolOptions.querySelector('select[name="task"]');
    if (select) {
      select.value = task;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const radio = toolOptions.querySelector(`input[name="task"][value="${task}"]`);
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    update();
    clearToolOutput();
  }

  function renumberTraceCards() {
    panel.querySelectorAll("[data-sanger-trace-card]").forEach((card, index) => {
      card.dataset.traceIndex = String(index + 1);
      const title = card.querySelector("[data-sanger-trace-title]");
      if (title) {
        title.textContent = `Trace ${index + 1}`;
      }
      const textarea = card.querySelector(".sanger-raw-textarea");
      if (textarea) {
        textarea.dataset.splitInputIndex = String(index);
      }
    });
    updateTraceSettingOptionVisibility();
  }

  function updateTraceSettingOptionVisibility() {
    const traceCount = panel.querySelectorAll("[data-sanger-trace-card]").length;
    for (let traceIndex = 1; traceIndex <= MAX_VISIBLE_TRACE_SETTING_CONTROLS; traceIndex += 1) {
      const hidden = traceIndex > traceCount;
      for (const field of ["Included", "Orientation", "ClipStart", "ClipEnd"]) {
        const root = toolOptions.querySelector(`[data-option-id="trace${traceIndex}${field}"]`);
        if (root) {
          root.hidden = hidden;
        }
      }
    }
  }

  function makeTraceCard({ value = "" } = {}) {
    const card = document.createElement("article");
    card.className = "sanger-trace-card";
    card.dataset.sangerTraceCard = "";

    const header = document.createElement("div");
    header.className = "sanger-trace-card-header";
    const title = document.createElement("h5");
    title.dataset.sangerTraceTitle = "";
    title.textContent = "Trace";
    const cardActions = document.createElement("div");
    cardActions.className = "sanger-trace-actions";
    const fileLabel = document.createElement("label");
    fileLabel.className = "file-button";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = getSelectedTool()?.metadata?.splitInput?.panels?.[0]?.accept ?? ".ab1,.abi,.abif,.scf,.json,.txt,.fa,.fasta";
    fileInput.className = "sanger-trace-file-input";
    const fileText = document.createElement("span");
    fileText.textContent = "Choose file";
    fileLabel.append(fileInput, fileText);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button sanger-trace-remove";
    remove.textContent = "Remove";
    cardActions.append(fileLabel, remove);
    header.append(title, cardActions);

    const dropZone = document.createElement("div");
    dropZone.className = "drop-zone sanger-trace-drop-zone";
    dropZone.tabIndex = 0;
    dropZone.textContent = getSelectedTool()?.metadata?.splitInput?.panels?.[0]?.dropLabel ?? "Drop Sanger trace file here";

    const textarea = document.createElement("textarea");
    textarea.className = "split-input-textarea sanger-raw-textarea";
    textarea.dataset.sangerTraceText = "";
    textarea.spellcheck = false;
    textarea.wrap = "off";
    textarea.value = formatExampleInputForDisplay(value);

    const onChange = () => {
      update();
      updateInputActionButtons();
      clearToolOutput();
    };
    textarea.addEventListener("input", onChange);
    remove.addEventListener("click", () => {
      card.remove();
      if (panel.querySelectorAll("[data-sanger-trace-card]").length === 0) {
        appendTraceCard("");
      }
      renumberTraceCards();
      update();
      clearToolOutput();
    });
    fileInput.addEventListener("change", async () => {
      await addTraceFiles(fileInput.files, { targetCard: card });
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
      await addTraceFiles(event.dataTransfer?.files, { targetCard: card });
    });
    dropZone.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      fileInput.click();
    });

    card.append(header, dropZone, textarea);
    return card;
  }

  function appendTraceCard(value = "") {
    const list = panel.querySelector("[data-sanger-trace-list]");
    if (!list) {
      return null;
    }
    const card = makeTraceCard({ value });
    list.append(card);
    renumberTraceCards();
    update();
    return card;
  }

  function firstEmptyTraceCard() {
    const cards = [...panel.querySelectorAll("[data-sanger-trace-card]")];
    const exampleText = String(getSelectedTool()?.example ?? "").trim();
    const exampleCard = cards.length === 1 && exampleText
      ? cards.find((card) => card.querySelector(".sanger-raw-textarea")?.value.trim() === exampleText)
      : null;
    if (exampleCard) {
      return exampleCard;
    }
    return cards.find((card) => !card.querySelector(".sanger-raw-textarea")?.value.trim());
  }

  async function addTraceFiles(files, { targetCard = null } = {}) {
    const selectedFiles = Array.from(files ?? []);
    for (const [index, file] of selectedFiles.entries()) {
      if (file.size > MAX_SANGER_TRACE_FILE_BYTES) {
        addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
        continue;
      }
      try {
        const text = await readToolInputFileText(file, { onMessage: addMessage });
        const card = index === 0 && targetCard
          ? targetCard
          : (firstEmptyTraceCard() ?? appendTraceCard(""));
        const textarea = card?.querySelector(".sanger-raw-textarea");
        if (textarea) {
          textarea.value = text;
        }
        addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
      } catch (error) {
        const detail = error?.message ? ` ${error.message}` : "";
        addMessage(`${file.name}: could not load this trace.${detail}`, "warning");
      }
    }
    renumberTraceCards();
    update();
    updateInputActionButtons();
    clearToolOutput();
  }

  function render(tool) {
    panel.classList.add("sanger-trace-workspace");
    const splitInput = tool.metadata.splitInput ?? {};
    const fixedTask = getFixedTaskValue();
    const hasReferencePanel = (splitInput.panels ?? []).some((item) => item.id === "reference");
    const parts = splitInputExampleParts(tool).filter((part, index, values) => (
      index < values.length - 1 || part.trim()
    ));
    const traceParts = hasReferencePanel && parts.length > 1
      ? parts.slice(0, -1).filter((part) => part.trim())
      : [parts[0] ?? ""].filter((part) => part.trim());
    const allTraceParts = hasReferencePanel ? traceParts : parts.filter((part) => part.trim());
    const referencePart = hasReferencePanel && parts.length > 1 ? parts.at(-1) ?? "" : "";

    const workflow = document.createElement("section");
    workflow.className = "sanger-workflow-card";
    workflow.hidden = Boolean(fixedTask);
    const taskHeading = document.createElement("div");
    taskHeading.className = "sanger-task-heading";
    const title = document.createElement("h4");
    title.textContent = "Task";
    const tasks = document.createElement("div");
    tasks.className = "sanger-task-tabs";
    for (const task of SANGER_TRACE_TASKS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.sangerTask = task.value;
      button.textContent = task.label;
      button.addEventListener("click", () => setTaskValue(task.value));
      tasks.append(button);
    }
    taskHeading.append(title, tasks);
    const taskSummary = document.createElement("p");
    taskSummary.className = "split-input-description";
    taskSummary.dataset.sangerTaskSummary = "";
    workflow.append(taskHeading, taskSummary);

    const traceCard = document.createElement("section");
    traceCard.className = "sanger-trace-input-card";
    const traceHeader = document.createElement("div");
    traceHeader.className = "sanger-trace-input-heading";
    const traceTitle = document.createElement("div");
    const traceHeading = document.createElement("h4");
    traceHeading.textContent = "Trace inputs";
    traceTitle.append(traceHeading);
    traceHeader.append(traceTitle);
    const traceList = document.createElement("div");
    traceList.className = "sanger-trace-list";
    traceList.dataset.sangerTraceList = "";
    const traceActions = document.createElement("div");
    traceActions.className = "split-input-actions sanger-trace-add-actions";
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "secondary-button";
    addButton.textContent = "Add trace";
    traceActions.append(addButton);
    traceCard.append(traceHeader, traceList, traceActions);

    const referenceCard = document.createElement("section");
    referenceCard.className = "sanger-reference-card";
    referenceCard.dataset.sangerReferenceCard = "";
    const referenceHeader = document.createElement("div");
    referenceHeader.className = "sanger-trace-input-heading";
    const referenceTitle = document.createElement("div");
    const referenceHeading = document.createElement("h4");
    referenceHeading.textContent = "Reference DNA";
    referenceTitle.append(referenceHeading);
    const referenceFileLabel = document.createElement("label");
    referenceFileLabel.className = "file-button";
    const referenceFileInput = document.createElement("input");
    referenceFileInput.type = "file";
    referenceFileInput.accept = splitInput.panels?.[1]?.accept ?? ".fa,.fasta,.fna,.txt";
    referenceFileInput.className = "sanger-reference-file-input";
    const referenceFileText = document.createElement("span");
    referenceFileText.textContent = "Choose file";
    referenceFileLabel.append(referenceFileInput, referenceFileText);
    referenceHeader.append(referenceTitle, referenceFileLabel);
    const referenceDrop = document.createElement("div");
    referenceDrop.className = "drop-zone sanger-reference-drop-zone";
    referenceDrop.tabIndex = 0;
    referenceDrop.textContent = splitInput.panels?.[1]?.dropLabel ?? "Drop one reference DNA sequence or FASTA record here";
    const referenceTextarea = document.createElement("textarea");
    referenceTextarea.className = "split-input-textarea sanger-raw-textarea";
    referenceTextarea.dataset.sangerReferenceText = "";
    referenceTextarea.dataset.splitInputIndex = "999";
    referenceTextarea.spellcheck = false;
    referenceTextarea.wrap = "off";
    referenceTextarea.value = referencePart;
    referenceCard.append(referenceHeader, referenceDrop, referenceTextarea);

    panel.append(workflow, traceCard);
    if (hasReferencePanel) {
      panel.append(referenceCard);
    }
    for (const part of allTraceParts.length > 0 ? allTraceParts : [""]) {
      appendTraceCard(part);
    }

    addButton.addEventListener("click", () => {
      const card = appendTraceCard("");
      card?.querySelector("textarea")?.focus();
      clearToolOutput();
    });

    const loadReferenceFile = async (file) => {
      if (!file) {
        return;
      }
      if (file.size > MAX_SANGER_TRACE_FILE_BYTES) {
        addMessage(`${file.name}: file is larger than 25 MB.`, "warning");
        return;
      }
      referenceTextarea.value = await readToolInputFileText(file, { onMessage: addMessage });
      update();
      updateInputActionButtons();
      clearToolOutput();
      addMessage(`Loaded ${file.name} (${file.size.toLocaleString()} bytes).`);
    };
    referenceFileInput.addEventListener("change", async () => {
      await loadReferenceFile(referenceFileInput.files?.[0]);
      referenceFileInput.value = "";
    });
    referenceDrop.addEventListener("dragover", (event) => {
      event.preventDefault();
      referenceDrop.classList.add("drag-over");
    });
    referenceDrop.addEventListener("dragleave", () => referenceDrop.classList.remove("drag-over"));
    referenceDrop.addEventListener("drop", async (event) => {
      event.preventDefault();
      referenceDrop.classList.remove("drag-over");
      await loadReferenceFile(event.dataTransfer?.files?.[0]);
    });
    referenceTextarea.addEventListener("input", () => {
      update();
      updateInputActionButtons();
      clearToolOutput();
    });

    renumberTraceCards();
    update();
  }

  function getIncludedTraceCards() {
    return [...panel.querySelectorAll("[data-sanger-trace-card]")]
      .filter((card, index) => getTraceIncluded(index + 1))
      .filter((card) => card.querySelector(".sanger-raw-textarea")?.value.trim());
  }

  function getTraceOptionControl(traceIndex, field) {
    return toolOptions.querySelector(`#trace${traceIndex}${field}`);
  }

  function getTraceIncluded(traceIndex) {
    return getTraceOptionControl(traceIndex, "Included")?.checked !== false;
  }

  function getTraceOptionValue(traceIndex, field, fallback = "") {
    const control = getTraceOptionControl(traceIndex, field);
    if (!control) {
      return fallback;
    }
    return control.type === "checkbox" ? control.checked : control.value;
  }

  function normalizeTraceClipValue(value) {
    const text = String(value ?? "").trim();
    return text === "0" ? "" : text;
  }

  function getInputText() {
    const separator = getSelectedTool()?.metadata?.splitInput?.separator ?? "---";
    const traceTexts = getIncludedTraceCards()
      .map((card) => card.querySelector(".sanger-raw-textarea")?.value ?? "")
      .filter((text) => text.trim());
    const hasReferencePanel = (getSelectedTool()?.metadata?.splitInput?.panels ?? []).some((item) => item.id === "reference");
    const reference = hasReferencePanel
      ? panel.querySelector("[data-sanger-reference-text]")?.value ?? ""
      : "";
    const task = getTaskValue();
    return serializeSangerTraceWorkspaceInput({ traceTexts, reference, task, separator });
  }

  function getSettings(existingText = "") {
    if (!["assemble", "compare"].includes(getTaskValue())) {
      return String(existingText ?? "");
    }
    const traceRows = [...panel.querySelectorAll("[data-sanger-trace-card]")].map((card, index) => ({
      included: getTraceIncluded(index + 1),
      orientation: getTraceOptionValue(index + 1, "Orientation", "auto"),
      clipStart: normalizeTraceClipValue(getTraceOptionValue(index + 1, "ClipStart", "")),
      clipEnd: normalizeTraceClipValue(getTraceOptionValue(index + 1, "ClipEnd", "")),
      text: card.querySelector(".sanger-raw-textarea")?.value ?? ""
    }));
    return makeSangerTraceSettingsText(traceRows, existingText);
  }

  function clearInputs() {
    const list = panel.querySelector("[data-sanger-trace-list]");
    if (list) {
      list.textContent = "";
      appendTraceCard("");
    }
    const reference = panel.querySelector("[data-sanger-reference-text]");
    if (reference) {
      reference.value = "";
    }
    renumberTraceCards();
    update();
  }

  function update() {
    if (!panel.querySelector(".sanger-workflow-card")) {
      return;
    }
    const task = getTaskValue();
    panel.querySelectorAll("[data-sanger-task]").forEach((button) => {
      const active = button.dataset.sangerTask === task;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const taskSummary = panel.querySelector("[data-sanger-task-summary]");
    if (taskSummary) {
      taskSummary.textContent = sangerTaskSummaries[task] ?? "";
    }
    const referenceCard = panel.querySelector("[data-sanger-reference-card]");
    if (referenceCard) {
      const hasReference = Boolean(referenceCard.querySelector("[data-sanger-reference-text]")?.value.trim());
      referenceCard.hidden = task !== "compare" && !hasReference;
    }
    updateTraceSettingOptionVisibility();
  }

  return {
    render,
    update,
    getInputText,
    getSettings,
    clearInputs
  };
}
